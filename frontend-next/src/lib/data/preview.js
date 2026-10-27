// PREVIEW implementations over the labelled sample dataset. Loaded only when LIVE is false,
// so production bundles never generate or ship sample data.
import * as M from './mock.js';

const delay = (v, ms = 180) => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));

export const P_getInventory = () => delay({ items: M.inventory, running: false });           // GET /api/dids
export const P_getRequests = () => delay({ items: M.requests });                               // GET /api/requests
export const P_getRequestTimeline = (id) => delay({                                            // GET /api/requests/{id}/timeline
  request: M.requests.find((r) => r.request_id === id),
  events: M.ticketEvents.filter((e) => e.request_id === id)
});
export const P_getLogs = () => delay({ items: M.changeLogs.slice(0, 500) });                   // GET /api/logs (backend returns the latest 500 rows)
export const P_getSyncStatus = () => delay({ jobs: M.syncJobs });                              // GET /api/jobs/status + /api/inventory/status
export const P_getSettings = () => delay({ settings: M.settings, version: 'v-demo' });         // GET /api/settings (admin)
export const P_getSettingsHistory = () => delay({ items: M.settingsHistory });                 // GET /api/settings/history
export const P_getAccessLog = () => delay({ items: M.accessLog });
export const P_getNotifications = () => delay({ items: M.notifications });                     // GET /api/notifications
export const P_getEmployees = () => delay({ items: M.employees });
export const P_getHistory = () => delay({ items: M.agentHistory });                            // Agent_Replacement_History via /api/insights + /api/agents

export function P_getAgentProfile(agent_number) {                                              // GET /api/agents/{n}/profile
  const employee = M.employees.find((e) => e.agent_number === agent_number) || {};
  const reqs = M.requests.filter((r) => r.agent_number === agent_number);
  const replacements = M.agentHistory.filter((h) => h.agent_number === agent_number);
  const lifecycle = M.changeLogs.filter((l) => l.agent_number === agent_number);
  const current = M.inventory.filter((i) => i.agent_number === agent_number && i.status === 'active');
  return delay({ agent_number, employee, requests: reqs, replacements, replacement_count: replacements.length, request_count: reqs.length, lifecycle_events: lifecycle, current, history_scope: 'Only logged operations and recorded requests are available; missing historical periods are unknown.' });
}

export function P_getDidPassport(didNo) {                                                     // GET /api/dids/{did}/passport
  return delay({
    did: didNo,
    current: M.inventory.filter((i) => i.did === didNo),
    events: M.changeLogs.filter((l) => l.old_did === didNo || l.new_did === didNo)
  });
}

// Insights (GET /api/insights) — derived the same way the backend does.
export function P_getInsights() {
  const byAgent = new Map();
  for (const r of M.requests) {
    const a = byAgent.get(r.agent_number) || { agent_number: r.agent_number, agent_name: r.agent_name, requests: 0, calls: 0, completed: 0 };
    a.requests++; a.calls += Number(r.call_count || 0); if (r.status === 'completed') a.completed++;
    byAgent.set(r.agent_number, a);
  }
  const emp = new Map(M.employees.map((e) => [e.agent_number, e]));
  const agents = [...byAgent.values()].map((a) => ({ ...a, manager: emp.get(a.agent_number)?.role5 || '', team_lead: emp.get(a.agent_number)?.role4 || '', repeat_requests: Math.max(0, a.requests - 1) }));
  const teams = new Map();
  for (const a of agents) {
    const k = a.manager + '|' + a.team_lead;
    const t = teams.get(k) || { manager: a.manager, team_lead: a.team_lead, agents: 0, requests: 0, calls: 0, completed: 0 };
    t.agents++; t.requests += a.requests; t.calls += a.calls; t.completed += a.completed; teams.set(k, t);
  }
  const tat = M.requests.filter((r) => r.completed_utc).map((r) => (new Date(r.completed_utc) - new Date(r.first_call_utc)) / 3600e3).sort((a, b) => a - b);
  const byDay = new Map();
  for (const r of M.requests) { const d = r.first_call_utc.slice(0, 10); byDay.set(d, (byDay.get(d) || 0) + 1); }
  const statuses = {};
  for (const r of M.requests) statuses[r.status] = (statuses[r.status] || 0) + 1;
  return delay({
    summary: {
      employees: M.employees.length, requests: M.requests.length,
      call_events: M.requests.reduce((s, r) => s + Number(r.call_count || 0), 0),
      replacement_completions: M.changeLogs.filter((l) => l.event === 'REASSIGNMENT_COMPLETE').length,
      audit_events: M.changeLogs.length, repeat_requests: agents.filter((a) => a.requests > 1).length,
      average_turnaround_hours: tat.length ? Math.round((tat.reduce((s, v) => s + v, 0) / tat.length) * 10) / 10 : null,
      median_turnaround_hours: tat.length ? Math.round(tat[Math.floor(tat.length / 2)] * 10) / 10 : null,
      turnaround_sample_size: tat.length
    },
    statuses, agents: agents.sort((a, b) => b.requests - a.requests), teams: [...teams.values()].sort((a, b) => b.requests - a.requests),
    by_day: [...byDay.entries()].sort().map(([date, requests]) => ({ date, requests }))
  });
}


export const TEAMS = M.TEAMS;
export const DEMO_NOTICE = M.DEMO_NOTICE;
export const employeeCount = () => M.employees.length;
