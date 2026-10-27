// LIVE data: the existing FastAPI endpoints, adapted to the shapes the screens use.
// Read-only adapters only. Every business rule (FIFO, review, locks, verification) stays in the backend.
import { api } from './api.js';
import { isReplacement, parseTs } from '../calc.js';

// Sheets returns numeric-looking cells as numbers. 10-digit phone/DID numbers survive as integers;
// 20-digit call IDs stored as numbers have lost precision, so they are blanked rather than shown wrong.
export const idStr = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? (Number.isSafeInteger(v) ? String(v) : '') : String(v).trim());
const ID_FIELDS = ['agent_number', 'callto', 'current_did', 'replacement_new_did', 'callid', 'request_id', 'replacement_batch'];
// ticket_no uses the same formula as the backend (SH- + first 12 chars of request_id)
const normReq = (r) => { const o = { ...r }; for (const k of ID_FIELDS) if (k in o) o[k] = idStr(o[k]); if (!o.ticket_no && o.request_id) o.ticket_no = 'SH-' + o.request_id.replace(/-/g, '').slice(0, 12).toUpperCase(); o.call_count = Number(o.call_count || 0); o.reminder_count = Number(o.reminder_count || 0); return o; };
const normLog = (e) => ({ ...e, old_did: idStr(e.old_did), new_did: idStr(e.new_did), agent_number: idStr(e.agent_number), batch_id: idStr(e.batch_id), time_utc: String(e.time_utc ?? e.time_ist ?? '') });

let lastInventory = [];
const JOB_LABELS = { inventory: 'DID inventory', calls: 'Request calls', employees: 'Employee directory', recovery: 'Request recovery', history: 'Agent history' };

export async function getInventory() {
  const r = await api('/api/dids');
  lastInventory = (r.items || []).map((i) => ({ ...i, did: idStr(i.did), agent_number: idStr(i.agent_number), fifo: i.fifo === '' || i.fifo === undefined ? undefined : Number(i.fifo) }));
  return { items: lastInventory, running: !!r.running };
}
// newest first (the sheet stores them oldest first), like every screen expects
const newest = (a, b) => (parseTs(b.first_call_utc) || 0) - (parseTs(a.first_call_utc) || 0);
export async function getRequests() { const r = await api('/api/requests'); return { items: (r.items || []).map(normReq).sort(newest) }; }
export async function getLogs() { const r = await api('/api/logs'); return { items: (r.items || []).map(normLog).reverse() }; } // newest first, like the screens expect
// Every Change_Logs row of the last `days` days (for trends / reports over a chosen range).
export async function getLogsSince(days) { const r = await api(`/api/logs?days=${days}`, { timeout: 60000 }); return { items: (r.items || []).map(normLog).reverse(), full: !r.truncated }; }
export async function getEmployeeDirectory() { const r = await api('/api/employees'); return { items: (r.items || []).map((e) => ({ ...e, agent_number: idStr(e.agent_number) })) }; }
export async function getSyncStatus() {
  const [jobs, inv] = await Promise.all([api('/api/jobs/status'), api('/api/inventory/status').catch(() => null)]);
  const list = Object.entries(jobs.jobs || {}).map(([job, row]) => ({ job, label: JOB_LABELS[job] || job, ...row }));
  return { jobs: list, inventorySnapshot: inv?.last_sync_utc || '', initialized: inv?.initialized ?? true };
}
export async function getNotifications() { const r = await api('/api/notifications'); return { items: (r.items || []).map((n) => ({ ...n, request_id: idStr(n.request_id), target: idStr(n.target) })).reverse() }; }
export async function getInsights() {
  const r = await api('/api/insights', { timeout: 60000 });
  r.teams = (r.teams || []).map((t) => ({ ...t, agents: t.unique_employees ?? t.agents ?? 0, calls: (t.requests || 0) + (t.repeat_calls || 0) }));
  r.agents = (r.agents || []).map((a) => ({ ...a, agent_number: idStr(a.agent_number) }));
  return r;
}
// Agents = Employee_Directory (MCube employee sync) + anyone holding a DID today.
// status: 'active' (in the directory, MCube status active), 'deactivated' (MCube status not active),
//         'missing' (holds a DID or has history but is no longer in the MCube directory).
export const empStatus = (v) => { const s = String(v ?? '').trim().toLowerCase(); return ['0', 'inactive', 'deactivated', 'disabled', 'false', 'no', 'deleted'].includes(s) ? 'deactivated' : 'active'; };
export function employeesFrom(inventory, insights, directory = null) {
  const team = new Map((insights?.agents || []).map((a) => [a.agent_number, a]));
  const holds = new Set(inventory.filter((i) => i.status === 'active' && i.agent_number && String(i.agent || '').trim().toLowerCase() !== 'common pool').map((i) => i.agent_number));
  const out = new Map();
  for (const e of directory || []) {
    if (!e.agent_number || out.has(e.agent_number)) continue;
    out.set(e.agent_number, { agent_number: e.agent_number, agent_name: e.agent_name || '', email: e.email || '', role4: e.role4 || '', role5: e.role5 || '', role: e.role || '', status: empStatus(e.status), inDirectory: true, hasDid: holds.has(e.agent_number) });
  }
  for (const i of inventory) {
    if (!holds.has(i.agent_number) || out.has(i.agent_number)) continue;
    const t = team.get(i.agent_number) || {};
    out.set(i.agent_number, { agent_number: i.agent_number, agent_name: i.agent || t.agent_name || '', email: '', role4: t.team_lead || '', role5: t.manager || '', status: directory ? 'missing' : 'active', inDirectory: false, hasDid: true });
  }
  return [...out.values()];
}
// Replacement history straight from the authoritative Change_Logs journal.
export function historyFrom(logs, inventory) {
  const opOf = new Map(inventory.map((i) => [i.did, i.operator]));
  return logs.filter(isReplacement).map((e, k) => ({ event_id: `${e.batch_id}:${k}`, completed_at_ist: e.time_utc, batch_id: e.batch_id, agent_number: e.agent_number, agent_name: e.agent_name, old_did: e.old_did, new_did: e.new_did, result: 'SUCCESS', manager_at_sync: '', team_lead_at_sync: '', source: 'Change_Logs', operator: opOf.get(e.new_did) || opOf.get(e.old_did) || '' }));
}

export async function getRequestTimeline(id) {
  const r = await api(`/api/requests/${encodeURIComponent(id)}/timeline`);
  const kind = (t) => (t === 'Call' ? 'call' : t === 'Form' ? 'form' : 'system');
  return { request: normReq(r.request || {}), ticket_no: r.ticket_no, source_counts: r.source_counts, events: (r.events || []).map((e) => ({ timestamp_ist: e.time, event: e.type === 'Call' ? 'CALL' : e.type === 'Form' ? 'FORM' : e.type, source: kind(e.type), actor: '', details: e.detail, event_id: e.event_id })) };
}
export async function getAgentProfile(n) {
  const r = await api(`/api/agents/${encodeURIComponent(n)}/profile`);
  const phone = idStr(r.agent_number);
  return { ...r, agent_number: phone, employee: { ...(r.employee || {}), agent_number: idStr(r.employee?.agent_number) },
    requests: (r.requests || []).map(normReq),
    replacements: (r.replacements || []).map((h) => ({ ...h, old_did: idStr(h.old_did), new_did: idStr(h.new_did), agent_number: idStr(h.agent_number) })),
    lifecycle_events: (r.lifecycle_events || []).map(normLog),
    current: lastInventory.filter((i) => i.agent_number === phone && i.status === 'active') };
}
export async function getDidPassport(did) {
  const r = await api(`/api/dids/${encodeURIComponent(did)}/passport`);
  return { ...r, current: lastInventory.filter((i) => i.did === String(did)), events: (r.events || []).map(normLog) };
}
export async function getSettings() { return api('/api/settings'); }
export async function getSettingsHistory() { const r = await api('/api/settings/history'); return { items: (r.items || []).reverse() }; }

// ---- actions (the backend enforces every safety rule; the UI only reports its answer) ----
export const saveSettings = (settings, version) => api('/api/settings', { method: 'PUT', body: { settings, version } });
export const syncInventory = () => api('/api/sync', { method: 'POST', timeout: 120000 });
export const syncCalls = () => api('/api/requests/sync', { method: 'POST', timeout: 120000 });
export const syncEmployees = () => api('/api/employees/sync', { method: 'POST', timeout: 120000 });
export const runReminders = () => api('/api/reminders/run', { method: 'POST', timeout: 120000 });
export const reviewRequest = (id, approved, reason) => api(`/api/requests/${encodeURIComponent(id)}/review`, { method: 'POST', body: { approved, reason } });
export const reassignRequests = (request_ids) => api('/api/requests/reassign', { method: 'POST', body: { request_ids } });
export const reassignDids = (dids) => api('/api/reassign', { method: 'POST', body: { dids } });
export const getQueue = () => api('/api/queue');
export const getBatch = () => api('/api/batch');
export const getRecovery = () => api('/api/recovery');
export const credentialStatus = () => api('/api/mcube-config/credentials/status');
export const saveCredentials = (username, password) => api('/api/mcube-config/credentials', { method: 'PUT', body: { username, password } });
export const testCredentials = () => api('/api/mcube-config/credentials/test', { method: 'POST', timeout: 60000 });
export const clearInventory = () => api('/api/admin/inventory/clear', { method: 'POST', body: { confirmation: 'CLEAR_INVENTORY_SNAPSHOTS_ONLY' } });
export const acknowledgeRecovery = (batch_id, note) => api('/api/recovery/acknowledge', { method: 'POST', body: { batch_id, confirmation: 'I_VERIFIED_MCUBE_AND_RESOLVED_THE_BATCH', note } });
