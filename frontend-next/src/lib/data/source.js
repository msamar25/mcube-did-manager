// Data facade. Every screen reads through these functions.
//   LIVE    → the existing FastAPI endpoints (./live.js). Default for production builds.
//   PREVIEW → the labelled sample dataset (./preview.js + ./mock.js), loaded on demand. Default for `npm run dev`.
// Override with VITE_DATA_MODE=live|preview at build/dev time.
import * as L from './live.js';

export const LIVE = (import.meta.env.VITE_DATA_MODE || (import.meta.env.PROD ? 'live' : 'preview')) === 'live';
export const MODE = LIVE ? 'live' : 'design-preview';
const preview = () => import('./preview.js');
const P = (name) => (...args) => preview().then((m) => m[name](...args));
const pick = (live, prev) => (LIVE ? live : prev);

// Operator roll-ups now live in lib/calc.js (operators taken from the data, as in production).

// ---- public API ----
export const getInventory = pick(L.getInventory, P('P_getInventory'));
export const getRequests = pick(L.getRequests, P('P_getRequests'));
export const getRequestTimeline = pick(L.getRequestTimeline, P('P_getRequestTimeline'));
export const getLogs = pick(L.getLogs, P('P_getLogs'));
export const getSyncStatus = pick(L.getSyncStatus, () => P('P_getSyncStatus')().then((r) => ({ ...r, inventorySnapshot: r.jobs.find((j) => j.job === 'inventory')?.last_success_utc || '', initialized: true })));
export const getSettings = pick(L.getSettings, P('P_getSettings'));
export const getSettingsHistory = pick(L.getSettingsHistory, P('P_getSettingsHistory'));
export const getAccessLog = pick(() => Promise.resolve({ items: [], unavailable: true }), P('P_getAccessLog')); // no endpoint for User_Activity_Logs yet
export const getNotifications = pick(L.getNotifications, P('P_getNotifications'));
export const getInsights = pick(L.getInsights, P('P_getInsights'));
export const getAgentProfile = pick(L.getAgentProfile, P('P_getAgentProfile'));
export const getDidPassport = pick(L.getDidPassport, P('P_getDidPassport'));
// Employees and replacement history: live mode derives them from inventory + Change_Logs (see live.js)
export const getEmployees = P('P_getEmployees');
export const getHistory = P('P_getHistory');
export const employeesFrom = L.employeesFrom;
export const historyFrom = L.historyFrom;

// ---- actions ----
const sim = (result, ms = 600) => new Promise((r) => setTimeout(() => r({ preview: true, ...result }), ms));
export const saveSettings = pick(L.saveSettings, (settings) => sim({ ok: true, changed: Object.keys(settings).length, version: 'v-demo' }));
export const syncInventory = pick(L.syncInventory, () => sim({ ok: true, counts: {} }, 900));
export const syncCalls = pick(L.syncCalls, () => sim({ created: 0, repeated: 0, fetched: 0 }, 900));
export const syncEmployees = pick(L.syncEmployees, () => preview().then((m) => sim({ count: m.employeeCount() }, 900)));
export const runReminders = pick(L.runReminders, () => sim({ processed: 0 }));
export const reviewRequest = pick(L.reviewRequest, (id, approved) => sim({ request_id: id, status: approved ? 'approved' : 'rejected' }));
export const reassignRequests = pick(L.reassignRequests, () => sim({ queue_id: 'preview', accepted: true, status: 'pending' }));
export const reassignDids = pick(L.reassignDids, () => sim({ queue_id: 'preview', accepted: true, status: 'pending' }));
export const getQueue = pick(L.getQueue, () => sim({ items: [] }, 100));
export const getBatch = pick(L.getBatch, () => sim({ running: false, done: 0, total: 0, results: [] }, 100));
export const getRecovery = pick(L.getRecovery, () => sim({ unresolved: [] }, 100));
export const credentialStatus = pick(L.credentialStatus, () => sim({ configured: true }, 100));
export const saveCredentials = pick(L.saveCredentials, () => sim({ ok: true }));
export const testCredentials = pick(L.testCredentials, () => sim({ ok: true }));
export const clearInventory = pick(L.clearInventory, () => sim({ ok: true, message: 'Preview: nothing was cleared' }));
export const acknowledgeRecovery = pick(L.acknowledgeRecovery, () => sim({ ok: true }));
export const DEMO_NOTICE = LIVE ? '' : 'Design preview · sample data only';
