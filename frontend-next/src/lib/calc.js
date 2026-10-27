// Calculations over the real API shapes (/api/dids items, /api/logs Change_Logs rows).
// Pure functions: no Svelte, no fetch, so they can be unit-tested and reused when live.
//
// Definitions match the current production UI (frontend/src/App.svelte):
//   assigned    = active rows that belong to a real agent (not "Common Pool")
//   available   = rows in DID_Pool_FIFO
//   utilization = assigned / (assigned + available)
// Counts are of UNIQUE DID numbers, so a DID duplicated across two agents is counted once.

const IST_OFFSET_MIN = 330;
const DAY = 864e5, HOUR = 36e5;

// Change_Logs.time_utc is written by the backend in IST with an offset (e.g. 2026-10-26T14:05:11+05:30).
// Values without an offset are read as UTC, exactly like the production UI and lib/format.js,
// so charts and tables always agree.
export function parseTs(v) {
  if (!v) return NaN;
  const raw = String(v).trim(), s = raw.includes('T') ? raw : raw.replace(' ', 'T');
  return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : s + 'Z');
}

export const isCommonPool = (r) => r.status === 'active' && (!r.agent_number || String(r.agent || '').trim().toLowerCase() === 'common pool');
export const isAssigned = (r) => r.status === 'active' && !isCommonPool(r);
export const isReplacement = (e) => String(e.event || '').toUpperCase() === 'REASSIGNMENT_COMPLETE' && String(e.result || '').toUpperCase() === 'SUCCESS';

const uniq = (rows) => new Set(rows.map((r) => String(r.did))).size;
const pct = (a, b) => (a + b ? Math.round((a / (a + b)) * 1000) / 10 : null);

// Stable colours for the known MCube operator names; anything new gets a palette colour.
const KNOWN = {
  'opensips-vodafone63': '#e5484d', 'Vodafone/Idea': '#c93b40', 'opensips-sify2': '#16a27a', 'Tata-57': '#2a6fdb', 'Tata-59': '#3b7fe8',
  tata13: '#2361c2', tata4: '#4c8cf0', jio5: '#e0a100', Jio: '#c98f00'
};
const PALETTE = ['#8b5cf6', '#0ea5e9', '#f97316', '#14b8a6', '#ec4899', '#64748b', '#84cc16', '#a855f7'];
// Unknown names (e.g. opensips-jio5) get a shade of their family colour, so related trunks look related.
const FAMILY_SHADES = { 'Vodafone Idea': ['#e5484d', '#c93b40', '#f06a6e'], Tata: ['#2a6fdb', '#3b7fe8', '#2361c2', '#4c8cf0', '#1d4fa3'], Jio: ['#e0a100', '#c98f00', '#f2b632'], Sify: ['#16a27a', '#0f8a67'], Airtel: ['#d92d5b', '#b8264d'] };
export function opColor(name) {
  if (KNOWN[name]) return KNOWN[name];
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const shades = FAMILY_SHADES[opFamily(name)] || PALETTE;
  return shades[h % shades.length];
}
export function opFamily(name = '') {
  const k = String(name).toLowerCase();
  if (k.includes('vodafone') || k.includes('idea')) return 'Vodafone Idea';
  if (k.includes('tata')) return 'Tata';
  if (k.includes('sify')) return 'Sify';
  if (k.includes('jio')) return 'Jio';
  if (k.includes('airtel')) return 'Airtel';
  return 'Other';
}

export function totals(items = []) {
  const by = (f) => items.filter(f);
  const assigned = uniq(by(isAssigned)), common = uniq(by(isCommonPool));
  const pool = uniq(by((r) => r.status === 'pool')), inactive = uniq(by((r) => r.status === 'inactive'));
  return {
    active: assigned, assigned, common, pool, inactive,
    total: uniq(items), // every unique DID across active, inactive and pool
    duplicates: uniq(by((r) => r.duplicate)),
    utilization: pct(assigned, pool) ?? 0
  };
}

// Operators come from the data itself (as in production), sorted by size.
export function operatorStats(items = []) {
  const groups = new Map();
  for (const r of items) { const k = r.operator || 'Unknown'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
  return [...groups.entries()].map(([key, rows]) => {
    const t = totals(rows);
    return { key, label: key, operator: key, family: opFamily(key), color: opColor(key), ...t, available: t.pool, utilization: t.utilization };
  }).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

// How much of a time window the loaded logs actually cover. /api/logs returns the last 500 rows only.
export function logCoverage(logs = [], since) {
  let oldest = Infinity;
  for (const e of logs) { const t = parseTs(e.time_utc); if (t < oldest) oldest = t; }
  const capped = logs.length >= 500;
  return { rows: logs.length, oldest: Number.isFinite(oldest) ? oldest : null, complete: !capped || oldest <= since };
}

// Pool activity for the last 24 hours, hourly.
//   assigned   EXACT: verified replacements (REASSIGNMENT_COMPLETE + SUCCESS) in that hour
//   poolLevel  ESTIMATE: today's pool count walked backwards through those replacements.
//              Pool top-ups from MCube syncs are not written to Change_Logs, so they are not included.
export function poolActivity24h(logs = [], items = [], now = Date.now()) {
  const end = Math.ceil(now / HOUR) * HOUR, start = end - 24 * HOUR;
  const buckets = Array.from({ length: 24 }, (_, i) => ({ t: start + i * HOUR, hour: new Date(start + i * HOUR).getHours(), assigned: 0, poolLevel: 0 }));
  for (const e of logs) {
    if (!isReplacement(e)) continue;
    const t = parseTs(e.time_utc); if (!(t >= start && t < end)) continue;
    buckets[Math.floor((t - start) / HOUR)].assigned++;
  }
  let level = totals(items).pool;
  for (let i = 23; i >= 0; i--) { buckets[i].poolLevel = level; level += buckets[i].assigned; }
  return { items: buckets, coverage: logCoverage(logs, start), assigned24: buckets.reduce((s, b) => s + b.assigned, 0) };
}

// Utilization per operator at the end of each of the last 7 days (IST days).
// Today's inventory is walked backwards through verified replacements:
//   a replacement moved new_did pool → assigned and old_did assigned → inactive,
//   so undoing it gives new_did's operator pool+1 / assigned−1 and old_did's operator assigned+1.
// ESTIMATE: MCube-sync pool top-ups and manual changes are not in Change_Logs.
export function utilizationTrend7d(logs = [], items = [], now = Date.now()) {
  const opOf = new Map(items.map((r) => [String(r.did), r.operator || 'Unknown']));
  const ops = operatorStats(items);
  const cur = new Map(ops.map((o) => [o.key, { a: o.assigned, p: o.pool }]));
  const ev = logs.filter(isReplacement).map((e) => ({ t: parseTs(e.time_utc), n: opOf.get(String(e.new_did)), o: opOf.get(String(e.old_did)) })).filter((e) => !Number.isNaN(e.t)).sort((a, b) => b.t - a.t);
  // IST day boundaries
  const istNow = now + IST_OFFSET_MIN * 60e3;
  const todayEndIst = Math.floor(istNow / DAY) * DAY + DAY;
  const days = [];
  let k = 0;
  for (let d = 0; d < 7; d++) {
    const dayEnd = todayEndIst - d * DAY - IST_OFFSET_MIN * 60e3; // back to real epoch ms
    for (; k < ev.length && ev[k].t >= dayEnd; k++) undo(ev[k]);
    const row = { date: new Date(dayEnd - DAY + IST_OFFSET_MIN * 60e3).toISOString().slice(0, 10), replacements: 0 };
    for (const [key, v] of cur) row[key] = pct(v.a, v.p);
    days.unshift(row);
  }
  function undo(e) {
    if (e.n && cur.has(e.n)) { const v = cur.get(e.n); v.a = Math.max(0, v.a - 1); v.p++; }
    if (e.o && cur.has(e.o)) cur.get(e.o).a++;
  }
  // exact replacement counts per day (for tooltips / notes)
  for (const e of ev) {
    const date = new Date(e.t + IST_OFFSET_MIN * 60e3).toISOString().slice(0, 10);
    const row = days.find((r) => r.date === date); if (row) row.replacements++;
  }
  return { items: days, coverage: logCoverage(logs, todayEndIst - 7 * DAY - IST_OFFSET_MIN * 60e3) };
}

// When each DID was last assigned by a verified replacement (DID → epoch ms).
// Only covers replacements inside the loaded logs; older assignments return undefined.
export function assignedSince(logs = []) {
  const m = new Map();
  for (const e of logs) {
    if (!isReplacement(e) || !e.new_did) continue;
    const t = parseTs(e.time_utc), k = String(e.new_did);
    if (!Number.isNaN(t) && !(m.get(k) >= t)) m.set(k, t);
  }
  return m;
}

// Pool runway: current pool ÷ average verified replacements per day over the trend window.
export function poolRunway(poolNow, trendRes) {
  const days = trendRes.items.length || 1;
  const perDay = trendRes.items.reduce((s, d) => s + (d.replacements || 0), 0) / days;
  return { perDay: Math.round(perDay * 10) / 10, days: perDay > 0 ? Math.floor(poolNow / perDay) : null };
}

// Request helpers shared by pages.
// Sheets stores flags as text ("yes"/"no"), so a plain truthiness check would treat "no" as true.
export const isYes = (v) => v === true || ['yes', 'true', '1', 'y'].includes(String(v ?? '').trim().toLowerCase());
export const OPEN_STATUSES = ['pending', 'approved', 'review_required', 'processing', 'needs_reconciliation'];
export const isOpen = (r) => OPEN_STATUSES.includes(r.status);
// Verified replacements within the last `hours`.
export function replacementsSince(logs = [], hours = 24, now = Date.now()) {
  return logs.filter((e) => isReplacement(e) && now - parseTs(e.time_utc) < hours * 36e5);
}
