// Shared app data, loaded once through the data facade.
import * as api from './data/source.js';
import * as calc from './calc.js';
import { TICKET_ZONES } from './support.js';

export const db = $state({
  loaded: false, loading: false, error: '',
  inventory: [], requests: [], logs: [], jobs: [], notifications: [], employees: [], insights: null, history: [], directory: null,
  lastSync: ''
});

// Core DID data is refreshed every cycle; heavier analytics (/api/insights reads ~6 tabs) only
// every SLOW_EVERY seconds, to stay well inside the Google Sheets read quota (~60 reads/min).
const SLOW_EVERY = 600;
let slowAt = 0;
async function fetchAll({ withSlow = false } = {}) {
  const [inv, req, logs, jobs, notes] = await Promise.all([api.getInventory(), api.getRequests(), api.getLogs(), api.getSyncStatus(), api.getNotifications().catch(() => ({ items: [] }))]);
  const out = { inventory: inv.items, logs: logs.items, jobs: jobs.jobs, notifications: notes.items, lastSync: jobs.inventorySnapshot || '' };
  // requests carry no operator: join it from the DID they currently hold
  const opOf = new Map(inv.items.map((i) => [String(i.did), i.operator]));
  out.requests = req.items.map((r) => (r.operator ? r : { ...r, operator: opOf.get(String(r.current_did)) || '' }));
  if (withSlow || !db.insights || Date.now() - slowAt > SLOW_EVERY * 1000) {
    const [ins, dir] = await Promise.allSettled([api.getInsights(), api.getEmployeeDirectory()]);
    if (ins.status === 'fulfilled') { out.insights = ins.value; slowAt = Date.now(); }
    if (dir.status === 'fulfilled') out.directory = dir.value.items;
  }
  const insights = out.insights || db.insights;
  if (api.LIVE) {
    out.employees = api.employeesFrom(out.inventory, insights, out.directory || db.directory);
    out.history = api.historyFrom(out.logs, out.inventory);
  } else if (!db.employees.length) {
    const [emp, hist] = await Promise.all([api.getEmployees(), api.getHistory()]);
    out.employees = emp.items.map((e) => ({ ...e, status: String(e.status).toLowerCase() === 'inactive' ? 'deactivated' : 'active', inDirectory: true })); out.history = hist.items;
  }
  return out;
}

export async function load() {
  if (db.loading) return;
  db.loading = true; db.error = '';
  try { Object.assign(db, await fetchAll({ withSlow: true }), { loaded: true }); live.last = Date.now(); }
  catch (e) { db.error = e?.message || 'Unable to load data'; }
  finally { db.loading = false; }
}

// Clear everything on sign-out so the next person never sees the previous session's data.
export function resetData() {
  Object.assign(db, { loaded: false, loading: false, error: '', inventory: [], requests: [], logs: [], jobs: [], notifications: [], employees: [], insights: null, history: [], directory: null, lastSync: '' });
  slowAt = 0;
  Object.assign(pulse, { at: 0, sig: '', events: [], batch: null, error: '' });
}

// ---- notifications: read state is per browser + user (the log itself is never changed) ----
const seenKey = () => {
  try { const b = (sessionStorage.getItem('did_token') || '').split('.')[0].replace(/-/g, '+').replace(/_/g, '/'); return 'next_notif_seen:' + (JSON.parse(atob(b + '='.repeat((4 - (b.length % 4)) % 4))).email || 'demo'); }
  catch { return 'next_notif_seen:demo'; }
};
export const notes = $state({ seen: 0 });
export function loadSeen() { try { notes.seen = Number(localStorage.getItem(seenKey()) || 0); } catch { notes.seen = 0; } }
export function markAllRead() { notes.seen = Date.now(); try { localStorage.setItem(seenKey(), String(notes.seen)); } catch { /* private mode */ } }
export function unreadCount() { return db.notifications.filter((n) => (calc.parseTs(n.timestamp_utc) || 0) > notes.seen).length; }

// ---- automatic refresh ----
// While the app is open and the tab is visible, data is re-read in the background every
// `live.every` seconds (the backend's scheduled jobs keep Google Sheets in step with MCube on the
// intervals set in Settings). A failed refresh keeps the last good data on screen.
export const live = $state({ every: api.LIVE ? 120 : 60, last: 0, busy: false, error: '' });
export async function refresh(withSlow = false) {
  if (live.busy || db.loading || !db.loaded) return;
  live.busy = true;
  try { Object.assign(db, await fetchAll({ withSlow })); live.last = Date.now(); pulse.at = Date.now(); live.error = ''; }
  catch (e) { live.error = e?.message || 'Refresh failed'; }
  finally { live.busy = false; }
}
// ---- live ticket feed (every 20 s) ----
// /api/live returns every request's status from one shared server read (cached 15 s). Changes since the
// previous check become live events (shown by the 3D views); a finished replacement triggers a full refresh.
export const pulse = $state({ at: 0, sig: '', busy: false, error: '', events: [], batch: null, every: 20 });
const STAGE = { pending: 'incoming', review_required: 'hub', approved: 'hub', processing: 'progress', needs_reconciliation: 'progress', completed: 'resolved', failed: 'failed', rejected: 'failed' };
export const stageOf = (status) => STAGE[status] || 'incoming';
export async function pulseOnce() {
  if (!api.LIVE || !db.loaded || pulse.busy || live.busy || db.loading) return;
  pulse.busy = true;
  try {
    const r = await api.getLive(); if (!r) return;
    pulse.at = Date.now(); pulse.error = ''; const wasRunning = pulse.batch?.running; pulse.batch = r.batch;
    if (r.sig === pulse.sig) { if (wasRunning && !r.batch?.running) refresh(true); return; }
    const first = !pulse.sig; pulse.sig = r.sig;
    const old = new Map(db.requests.map((x) => [x.request_id, x]));
    const opOf = new Map(db.inventory.map((i) => [String(i.did), i.operator]));
    const evs = [], seen = new Set();
    const merged = r.items.map(api.normReq).map((n) => {
      seen.add(n.request_id);
      const o = old.get(n.request_id);
      if (!first && (!o || o.status !== n.status)) evs.push({ ticket_no: n.ticket_no, agent_name: n.agent_name, agent_number: n.agent_number, status: n.status, from: o?.status || '', at: Date.now(), live: true });
      return { ...(o || {}), ...n, operator: o?.operator || opOf.get(String(n.current_did)) || '' };
    });
    if (evs.length) pulse.events = [...evs, ...pulse.events].slice(0, 20);
    // keep the newest-first order the screens expect
    db.requests = merged.sort((a, b) => (calc.parseTs(b.first_call_utc) || 0) - (calc.parseTs(a.first_call_utc) || 0));
    if (evs.some((e) => ['completed', 'failed', 'needs_reconciliation'].includes(e.status)) || (wasRunning && !r.batch?.running)) refresh(true);
  } catch (e) { pulse.error = e?.message || 'Live update failed'; }
  finally { pulse.busy = false; }
}
// What the 3D views play: live changes (last 15 min) first, then the most recently active real tickets.
export function storyQueue() {
  const recent = pulse.events.filter((e) => Date.now() - e.at < 15 * 60e3);
  const act = (r) => calc.parseTs(r.completed_utc || r.last_call_utc || r.first_call_utc) || 0;
  const rest = [...db.requests].sort((a, b) => act(b) - act(a)).slice(0, 8)
    .map((r) => ({ ticket_no: r.ticket_no, agent_name: r.agent_name, agent_number: r.agent_number, status: r.status, at: act(r), live: false }));
  const seen = new Set(recent.map((e) => e.ticket_no));
  return [...recent, ...rest.filter((x) => !seen.has(x.ticket_no))].slice(0, 10).map((x) => ({ ...x, stage: stageOf(x.status) }));
}

let timer = null;
export function startAutoRefresh() {
  if (timer || typeof document === 'undefined') return;
  const due = () => !document.hidden && Date.now() - live.last >= live.every * 1000;
  const pulseDue = () => !document.hidden && Date.now() - pulse.at >= pulse.every * 1000;
  timer = setInterval(() => { if (due()) refresh(); else if (pulseDue()) pulseOnce(); }, 5000);
  document.addEventListener('visibilitychange', () => { if (due()) refresh(); });
}
export function stopAutoRefresh() { clearInterval(timer); timer = null; }

// ---- derived helpers (pure functions over db, cached per data load) ----
// Each result is recomputed only when the underlying array is replaced (a new load / sync),
// so pages that call these on every render do not repeat the work.
const memo = new WeakMap();
function cached(src, key, fn) {
  let m = memo.get(src); if (!m) memo.set(src, (m = new Map()));
  if (!m.has(key)) m.set(key, fn());
  return m.get(key);
}
export function opStats() { return cached(db.inventory, 'ops', () => calc.operatorStats(db.inventory)); }
export function totals() { return cached(db.inventory, 'totals', () => ({ ...calc.totals(db.inventory), agents: db.employees.filter((e) => e.status === 'active').length })); }
// Pool Activity 24h and the 7-day utilization trend are calculated from Change_Logs (see lib/calc.js).
export function poolActivity() { return cached(db.logs, 'pool:' + db.inventory.length, () => calc.poolActivity24h(db.logs, db.inventory)); }
export function since() { return cached(db.logs, 'since', () => calc.assignedSince(db.logs)); }
export function trend() { return cached(db.logs, 'trend:' + db.inventory.length, () => calc.utilizationTrend7d(db.logs, db.inventory)); }
export function flowCounts() {
  const c = { pending: 0, processing: 0, completed: 0, failed: 0, review_required: 0, approved: 0, rejected: 0, needs_reconciliation: 0 };
  for (const r of db.requests) c[r.status] = (c[r.status] || 0) + 1;
  return c;
}
export function sceneData() {
  const t = totals();
  // ticket board columns, grouped exactly like the dashboard hub (lib/support.js)
  const tickets = {}, columns = {};
  for (const [k, z] of Object.entries(TICKET_ZONES)) { tickets[k] = db.requests.filter((r) => z.statuses.includes(r.status)); columns[k] = tickets[k].length; tickets[k] = tickets[k].slice(0, 5).map((r) => ({ ticket_no: r.ticket_no, agent_name: r.agent_name, agent_number: r.agent_number, first_call_utc: r.first_call_utc })); }
  return { operators: opStats(), total: t.total, pool: t.pool, agents: t.agents, flow: flowCounts(), tickets, columns };
}
