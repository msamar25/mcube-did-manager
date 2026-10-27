// PHASE 1 DESIGN DATA — representative sample only. Not operational data.
// Field names mirror the existing Google Sheets tabs / FastAPI responses
// (Active_DIDs, DID_Pool_FIFO, Pending_Requests, Change_Logs, Employee_Directory)
// so Phase 3 can replace this module with real API calls without UI rewrites.

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261023);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));

// Operator names exactly as they appear in the MCube `operator` field (confirmed by the UNext team).
// `family` is a display-only grouping derived from the name prefix; it is not stored anywhere.
// All counts below are DESIGN-PREVIEW SAMPLE VALUES, not live inventory.
export const OPERATORS = [
  { key: 'opensips-vodafone63', family: 'Vodafone Idea', color: '#e5484d', active: 300, pool: 55, inactive: 9 },
  { key: 'Vodafone/Idea', family: 'Vodafone Idea', color: '#c93b40', active: 240, pool: 45, inactive: 8 },
  { key: 'opensips-sify2', family: 'Sify', color: '#16a27a', active: 170, pool: 40, inactive: 6 },
  { key: 'Tata-57', family: 'Tata', color: '#2a6fdb', active: 210, pool: 40, inactive: 7 },
  { key: 'Tata-59', family: 'Tata', color: '#3b7fe8', active: 180, pool: 35, inactive: 7 },
  { key: 'tata13', family: 'Tata', color: '#2361c2', active: 140, pool: 30, inactive: 6 },
  { key: 'tata4', family: 'Tata', color: '#4c8cf0', active: 110, pool: 25, inactive: 5 },
  { key: 'jio5', family: 'Jio', color: '#e0a100', active: 170, pool: 45, inactive: 8 },
  { key: 'Jio', family: 'Jio', color: '#c98f00', active: 130, pool: 35, inactive: 8 }
].map((o) => ({ ...o, label: o.key }));
export const opColor = (name) => OPERATORS.find((o) => o.key === name)?.color || '#94a3b8';

const FIRST = ['Rohit', 'Sneha', 'Arjun', 'Kavya', 'Priya', 'Rahul', 'Ananya', 'Vikram', 'Neha', 'Aditya', 'Pooja', 'Karan', 'Divya', 'Siddharth', 'Meera', 'Nikhil', 'Isha', 'Varun', 'Shreya', 'Manish', 'Riya', 'Harsh', 'Tanvi', 'Aman', 'Nandini', 'Yash', 'Pallavi', 'Gaurav', 'Aishwarya', 'Kunal', 'Sana', 'Deepak', 'Lakshmi', 'Suresh', 'Fatima', 'Imran', 'Bhavna', 'Ritesh', 'Swati', 'Abhishek'];
const LAST = ['Kumar', 'Patel', 'Nair', 'S', 'Sharma', 'Reddy', 'Iyer', 'Singh', 'Gupta', 'Menon', 'Das', 'Joshi', 'Rao', 'Verma', 'Pillai', 'Shetty', 'Khan', 'Bose', 'Mehta', 'Kulkarni', 'Hegde', 'Chopra', 'Agarwal', 'Pandey'];
const MANAGERS = ['Prasad Shankarwar', 'Anita Desai', 'Ravi Menon', 'Farah Sheikh', 'Joseph Mathew', 'Lata Krishnan'];

const now = Date.now();
const H = 3600e3;
const iso = (t) => new Date(t).toISOString();
// Change_Logs rows are written by the backend in IST with an offset: 2026-10-26T14:05:11+05:30
const isoIST = (t) => new Date(t + 330 * 60e3).toISOString().slice(0, 19) + '+05:30';

// ---- team structure ----
export const TEAMS = MANAGERS.flatMap((m, mi) =>
  Array.from({ length: 4 }, (_, k) => ({ manager: m, team_lead: `${pick(FIRST)} ${pick(LAST)}`, id: `T${mi + 1}${k + 1}` }))
);

// ---- employees (Employee_Directory) ----
const usedPhones = new Set();
function phone() {
  let p;
  do { p = `${pick(['9', '8', '7', '6'])}${String(int(0, 999999999)).padStart(9, '0')}`; } while (usedPhones.has(p));
  usedPhones.add(p); return p;
}
export const employees = Array.from({ length: 2000 }, (_, i) => {
  const f = pick(FIRST), l = pick(LAST), team = TEAMS[i % TEAMS.length];
  const name = i < 4 ? ['Rohit Kumar', 'Sneha Patel', 'Arjun Nair', 'Kavya S'][i] : `${f} ${l}`;
  return {
    agent_number: phone(), agent_name: name,
    email: `${name.toLowerCase().replace(/[^a-z]+/g, '.')}${i}@example-unext.in`,
    agent_id: `AG${String(10001 + i)}`, role: 'Agent', status: rnd() < 0.97 ? 'Active' : 'Inactive',
    role3: 'Counsellor', role4: team.team_lead, role5: team.manager,
    updated_utc: iso(now - int(2, 30) * H)
  };
});
const empByPhone = new Map(employees.map((e) => [e.agent_number, e]));

// ---- DID inventory (Active_DIDs / Inactive_DIDs / DID_Pool_FIFO) ----
const usedDids = new Set();
function did() {
  let d;
  do { d = `80718${String(int(0, 99999)).padStart(5, '0')}`; } while (usedDids.has(d));
  usedDids.add(d); return d;
}
export const inventory = [];
let empIdx = 0, fifo = 1;
for (const op of OPERATORS) {
  for (let i = 0; i < op.active; i++) {
    const e = employees[empIdx++];
    inventory.push({ did: did(), agent: e.agent_name, agent_number: e.agent_number, operator: op.key, status: 'active' });
  }
  for (let i = 0; i < op.inactive; i++) inventory.push({ did: did(), agent: '', agent_number: '', operator: op.key, status: 'inactive' });
}
// FIFO pool is interleaved in MCube response order
const poolRows = OPERATORS.flatMap((op) => Array.from({ length: op.pool }, () => ({ op: op.key, r: rnd() }))).sort((a, b) => a.r - b.r);
for (const p of poolRows) inventory.push({ did: did(), agent: '', agent_number: '', operator: p.op, status: 'pool', fifo: fifo++ });
// a few "Common Pool" lines: active in MCube but not on a real agent (excluded from utilization)
for (let k = 0; k < 6; k++) inventory.push({ did: did(), agent: 'Common Pool', agent_number: '', operator: OPERATORS[k % OPERATORS.length].key, status: 'active' });
// 4 duplicate-assignment alerts (same DID on two agents in the active snapshot)
for (let k = 0; k < 4; k++) {
  const src = inventory[int(0, 1500)];
  const e = employees[1650 + k];
  inventory.push({ ...src, agent: e.agent_name, agent_number: e.agent_number });
}
{
  const counts = new Map();
  for (const it of inventory) counts.set(it.status + it.did, (counts.get(it.status + it.did) || 0) + 1);
  for (const it of inventory) it.duplicate = counts.get(it.status + it.did) > 1;
}

// ---- requests (Pending_Requests) + ticket events ----
const STATUS_PLAN = [['pending', 28], ['processing', 5], ['needs_reconciliation', 1], ['completed', 121], ['failed', 3], ['review_required', 3], ['approved', 2], ['rejected', 4]];
export const requests = [];
export const ticketEvents = [];
export const changeLogs = [];
export const agentHistory = [];
const actives = inventory.filter((x) => x.status === 'active' && !x.duplicate);
let reqN = 0;
for (const [status, n] of STATUS_PLAN) {
  for (let i = 0; i < n; i++) {
    const a = reqN < 4 ? actives.find((x) => x.agent === ['Rohit Kumar', 'Sneha Patel', 'Arjun Nair', 'Kavya S'][reqN]) || pick(actives) : pick(actives);
    const open = !['completed', 'failed', 'rejected'].includes(status);
    const ageH = reqN < 4 ? [0.2, 0.47, 1, 2][reqN] : open ? rnd() * 52 : 2 + rnd() * 24 * 28;
    const first = now - ageH * H;
    const id = `${Math.floor(first / 1000).toString(16)}-${String(reqN).padStart(4, '0')}`;
    const source = pick(['call', 'call', 'form', 'both']);
    const calls = source === 'form' ? 0 : int(1, 4);
    const r = {
      request_id: id, ticket_no: 'SH-' + id.replace('-', '').slice(0, 12).toUpperCase(),
      callid: source === 'form' ? '' : `C${int(100000, 999999)}`, callto: '8071439545',
      agent_number: a.agent_number, agent_name: a.agent, agent_email: empByPhone.get(a.agent_number)?.email || '',
      current_did: a.did, operator: a.operator,
      first_call_utc: iso(first), last_call_utc: iso(first + rnd() * Math.min(ageH, 3) * H),
      call_count: calls, status, recent_warning: rnd() < 0.08 ? 'yes' : 'no', // Sheets stores yes/no
      reminder_count: open ? int(0, 2) : 0, replacement_batch: '', replacement_new_did: '', completed_utc: '',
      request_source: source, source_counts: { call: calls, form: source === 'call' ? 0 : int(1, 2) }
    };
    r.total_interactions = r.source_counts.call + r.source_counts.form;
    r.last_activity_utc = r.last_call_utc;
    requests.push(r);
    ticketEvents.push({ timestamp_ist: r.first_call_utc, request_id: id, ticket_no: r.ticket_no, event: source === 'form' ? 'PUBLIC_REQUEST_CREATED' : 'TICKET_CREATED', source, actor: source === 'form' ? 'public-form' : 'mcube-call-sync', details: 'Request received' });
    if (source === 'both') ticketEvents.push({ timestamp_ist: iso(first + 0.3 * H), request_id: id, ticket_no: r.ticket_no, event: 'FORM_ATTACHED', source: 'form', actor: 'public-form', details: 'Agent also submitted the support form' });

    if (status === 'completed' || status === 'failed' || status === 'processing' || status === 'needs_reconciliation') {
      const batch = `B${Math.floor(first / 1000).toString(36).toUpperCase()}`;
      const t0 = Math.min(now - 120000, first + (0.3 + rnd() * Math.max(0, Math.min(ageH - 0.4, 20))) * H);
      // completed: the agent moved from a now-inactive DID to the DID they hold today;
      // processing / failed: the agent still holds a.did and the next pool DID of that operator was selected
      const done = status === 'completed';
      const oldDid = done ? (pick(inventory.filter((x) => x.status === 'inactive' && x.operator === a.operator)) || a).did : a.did;
      const poolDid = done ? a.did : (inventory.find((x) => x.status === 'pool' && x.operator === a.operator) || { did: did() }).did;
      r.replacement_batch = batch;
      const steps = [['BATCH_REQUESTED', 'SUCCESS'], ['BATCH_VALIDATED', 'SUCCESS'], ['DEACTIVATION_STARTED', 'STARTED']];
      if (status === 'failed') steps.push(['DEACTIVATION_FAILED', 'FAILED'], ['BATCH_STOPPED', 'FAILED']);
      else if (status === 'needs_reconciliation') steps.push(['DEACTIVATED', 'SUCCESS'], ['ACTIVATION_STARTED', 'STARTED'], ['ACTIVATION_UNCERTAIN', 'UNCERTAIN']);
      else if (status === 'processing') steps.push(['DEACTIVATION_STARTED', 'SUCCESS'], ['ACTIVATION_STARTED', 'STARTED']);
      else steps.push(['ACTIVATION_STARTED', 'STARTED'], ['REASSIGNMENT_COMPLETE', 'SUCCESS'], ['BATCH_COMPLETE', 'SUCCESS']);
      steps.forEach(([event, result], k) => changeLogs.push({
        time_utc: isoIST(t0 + k * 7000), batch_id: batch, event, old_did: oldDid,
        new_did: event.startsWith('BATCH') ? '' : poolDid, agent_number: a.agent_number, agent_name: a.agent,
        result, details: result === 'FAILED' ? 'MCube deactivate returned non-success; batch stopped, no retry' : event === 'REASSIGNMENT_COMPLETE' ? 'Verified via fresh inventory' : ''
      }));
      if (done) {
        r.replacement_new_did = poolDid; r.completed_utc = iso(t0 + 40000);
        const e = empByPhone.get(a.agent_number);
        agentHistory.push({ event_id: `E${reqN}`, completed_at_ist: r.completed_utc, batch_id: batch, agent_number: a.agent_number, agent_name: a.agent, old_did: oldDid, new_did: poolDid, result: 'REASSIGNMENT_COMPLETE', manager_at_sync: e?.role5 || '', team_lead_at_sync: e?.role4 || '', source: 'Change_Logs', operator: a.operator });
        ticketEvents.push({ timestamp_ist: r.completed_utc, request_id: id, ticket_no: r.ticket_no, event: 'COMPLETED', source: 'system', actor: 'reassignment', details: `${oldDid} → ${poolDid}` });
      }
    }
    reqN++;
  }
}
requests.sort((a, b) => b.first_call_utc.localeCompare(a.first_call_utc));
changeLogs.sort((a, b) => b.time_utc.localeCompare(a.time_utc));
agentHistory.sort((a, b) => b.completed_at_ist.localeCompare(a.completed_at_ist));

// repeat-demand agents for Risk Radar / Agent 360: earlier completed requests for a few agents
const repeatBase = requests.filter((r) => r.status === 'completed').slice(0, 6);
repeatBase.forEach((base, k) => {
  for (let j = 0; j < 2 + (k % 3); j++) {
    const t = now - (40 + k * 60 + (j + 1) * 90) * H;
    const id = `${Math.floor(t / 1000).toString(16)}-R${k}${j}`;
    requests.push({ ...base, request_id: id, ticket_no: 'SH-' + id.replace('-', '').slice(0, 12).toUpperCase(), status: 'completed', first_call_utc: iso(t), last_call_utc: iso(t + H), last_activity_utc: iso(t + H), completed_utc: iso(t + 5 * H), replacement_new_did: did() });
  }
});
requests.sort((a, b) => b.first_call_utc.localeCompare(a.first_call_utc));

// Pool activity and utilization trend are no longer fabricated here: they are calculated
// from Change_Logs by lib/calc.js, exactly as they will be on live data.

// ---- sync jobs (Sync_Status) ----
export const syncJobs = [
  { job: 'inventory', label: 'DID inventory', last_attempt_utc: iso(now - 0.4 * H), last_success_utc: iso(now - 0.4 * H), status: 'SUCCESS', details: 'active, inactive, pool lists' },
  { job: 'calls', label: 'Request calls', last_attempt_utc: iso(now - 0.12 * H), last_success_utc: iso(now - 0.12 * H), status: 'SUCCESS', details: '30 calls page' },
  { job: 'employees', label: 'Employee directory', last_attempt_utc: iso(now - 9 * H), last_success_utc: iso(now - 9 * H), status: 'SUCCESS', details: 'all roles' },
  { job: 'reminders', label: 'Reminders', last_attempt_utc: iso(now - 0.9 * H), last_success_utc: iso(now - 0.9 * H), status: 'SUCCESS', details: '0 sent' }
];

// ---- settings (mirrors workflows.DEFAULTS) ----
export const settings = {
  request_did: '8071439545', recent_replacement_days: 3, sync_mode: 'login', call_page_size: 30,
  employee_refresh_hours: 24, request_sync_lookback_minutes: 30, auto_inventory_minutes: 60,
  auto_calls_minutes: 15, auto_employee_minutes: 1440, reminder_enabled: false, reminder_first_minutes: 0,
  reminder_interval_minutes: 60, reminder_escalation_minutes: 120, reminder_max_attempts: 3,
  notify_on_queue: false, notify_on_completion: false, first_contact_number: '', second_contact_number: '',
  outbound_caller_number: '', level1_exenumber: '', level1_custnumber: '', level2_exenumber: '', level2_custnumber: '',
  agent_notification_custnumber: '', notify_level2_on_queue: false, email_on_queue: false, email_on_completion: false,
  require_recent_review: true, admin_email: 'admin@example-unext.in', mail_from: 'noreply@example-unext.in', mail_provider: 'brevo'
};
export const settingsHistory = [
  { timestamp_utc: iso(now - 26 * H), actor: 'admin@example-unext.in', key: 'auto_calls_minutes', old_value: '30', new_value: '15' },
  { timestamp_utc: iso(now - 74 * H), actor: 'admin@example-unext.in', key: 'require_recent_review', old_value: 'false', new_value: 'true' },
  { timestamp_utc: iso(now - 190 * H), actor: 'admin@example-unext.in', key: 'reminder_max_attempts', old_value: '2', new_value: '3' }
];

export const accessLog = Array.from({ length: 40 }, (_, i) => ({
  time_ist: iso(now - i * 3.1 * H), email: i % 3 ? 'operator1@example-unext.in' : 'admin@example-unext.in',
  role: i % 3 ? 'operator' : 'admin', action: pick(['LOGIN_SUCCESS', 'VIEW', 'EXPORT', 'REASSIGN', 'SETTINGS_SAVE']),
  endpoint: pick(['/api/auth/verify', '/api/dids', '/api/requests/reassign', '/api/insights', '/api/settings']), result: rnd() < 0.95 ? 'SUCCESS' : 'DENIED'
}));

export const notifications = requests.filter((r) => r.status === 'pending').slice(0, 6).map((r, i) => ({
  timestamp_utc: r.first_call_utc, request_id: r.request_id, kind: i % 2 ? 'email' : 'call', target: i % 2 ? 'manager' : 'level1', result: 'SUCCESS', details: `New request ${r.ticket_no}`
}));

export const DEMO_NOTICE = 'Design preview · sample data only';
