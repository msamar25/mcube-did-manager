// Custom report engine: datasets, fields, filters, grouping. Pure functions over loaded data.
import { parseTs, rangeBounds } from './calc.js';
import { ist } from './format.js';

const t = (key, label, extra = {}) => ({ key, label, type: 'text', ...extra });
const d = (key, label) => ({ key, label, type: 'date' });
const num = (key, label) => ({ key, label, type: 'number' });

// Each dataset: fields (in default order), default columns and its main date field.
export const DATASETS = {
  inventory: { label: 'DID inventory', date: '', fields: [t('did', 'DID'), t('status', 'Status'), t('agent', 'Agent'), t('agent_number', 'Agent number'), t('operator', 'Operator'), num('fifo', 'FIFO #'), t('duplicate', 'Duplicate')], cols: ['did', 'status', 'agent', 'agent_number', 'operator'] },
  requests: { label: 'Support requests', date: 'first_call_utc', fields: [t('ticket_no', 'Ticket'), t('agent_name', 'Agent'), t('agent_number', 'Agent number'), t('current_did', 'Current DID'), t('operator', 'Operator'), t('status', 'Status'), t('request_source', 'Source'), num('call_count', 'Calls'), num('reminder_count', 'Reminders'), t('recent_warning', 'Recent warning'), d('first_call_utc', 'First call'), d('last_call_utc', 'Last call'), d('completed_utc', 'Completed'), t('replacement_new_did', 'New DID'), t('agent_email', 'Email')], cols: ['ticket_no', 'agent_name', 'agent_number', 'current_did', 'status', 'first_call_utc'] },
  logs: { label: 'Change log (audit)', date: 'time_utc', fields: [d('time_utc', 'Time'), t('batch_id', 'Batch'), t('event', 'Event'), t('agent_name', 'Agent'), t('agent_number', 'Agent number'), t('old_did', 'Old DID'), t('new_did', 'New DID'), t('result', 'Result'), t('details', 'Details')], cols: ['time_utc', 'event', 'agent_name', 'old_did', 'new_did', 'result'] },
  history: { label: 'Replacement history', date: 'completed_at_ist', fields: [d('completed_at_ist', 'Completed'), t('agent_name', 'Agent'), t('agent_number', 'Agent number'), t('operator', 'Operator'), t('old_did', 'Old DID'), t('new_did', 'New DID'), t('batch_id', 'Batch')], cols: ['completed_at_ist', 'agent_name', 'operator', 'old_did', 'new_did'] },
  notifications: { label: 'Notifications', date: 'timestamp_utc', fields: [d('timestamp_utc', 'Time'), t('kind', 'Kind'), t('target', 'Target'), t('result', 'Result'), t('request_id', 'Request'), t('details', 'Details')], cols: ['timestamp_utc', 'kind', 'target', 'result'] },
  employees: { label: 'Agents', date: '', fields: [t('agent_name', 'Agent'), t('agent_number', 'Agent number'), t('email', 'Email'), t('role4', 'Team lead'), t('role5', 'Manager'), t('status', 'Status')], cols: ['agent_name', 'agent_number', 'role4', 'role5', 'status'] }
};

// Ready-made reports (start points; can be changed and saved).
export const TEMPLATES = [
  { name: 'Pool by operator', dataset: 'inventory', config: { cols: ['did', 'operator', 'fifo'], filters: [{ field: 'status', op: 'eq', value: 'pool' }], group: 'operator', sort: 'fifo', dir: 1 } },
  { name: 'Open requests', dataset: 'requests', config: { cols: ['ticket_no', 'agent_name', 'current_did', 'operator', 'status', 'first_call_utc'], filters: [{ field: 'status', op: 'in', value: 'pending,approved,review_required,processing,needs_reconciliation' }], sort: 'first_call_utc', dir: -1 } },
  { name: 'Replacements by operator', dataset: 'history', config: { cols: ['completed_at_ist', 'agent_name', 'operator', 'old_did', 'new_did'], range: { preset: '30d' }, group: 'operator', sort: 'completed_at_ist', dir: -1 } },
  { name: 'Failed steps', dataset: 'logs', config: { cols: ['time_utc', 'batch_id', 'event', 'agent_name', 'old_did', 'details'], filters: [{ field: 'result', op: 'eq', value: 'FAILED' }], range: { preset: '30d' }, sort: 'time_utc', dir: -1 } },
  { name: 'Requests per agent', dataset: 'requests', config: { cols: ['agent_name', 'agent_number', 'status'], range: { preset: '30d' }, group: 'agent_name' } }
];

export const OPS = { contains: 'contains', eq: 'is', ne: 'is not', in: 'is one of', empty: 'is empty', notempty: 'is not empty', gte: '≥', lte: '≤' };
const str = (v) => (v === null || v === undefined ? '' : String(v));

export function display(field, v) { return field?.type === 'date' ? (v ? ist(v) : '') : str(v); }

function match(row, f, field) {
  const v = row[f.field], s = str(v).toLowerCase(), want = str(f.value).toLowerCase().trim();
  switch (f.op) {
    case 'contains': return s.includes(want);
    case 'eq': return s === want;
    case 'ne': return s !== want;
    case 'in': return want.split(',').map((x) => x.trim()).filter(Boolean).includes(s);
    case 'empty': return !s;
    case 'notempty': return !!s;
    case 'gte': case 'lte': {
      const a = field?.type === 'date' ? parseTs(v) : Number(v), b = field?.type === 'date' ? parseTs(f.value) : Number(f.value);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      return f.op === 'gte' ? a >= b : a <= b;
    }
    default: return true;
  }
}

// Run a report: rows → filtered, ranged, sorted rows (+ grouped summary when group is set).
export function runReport(dataset, rows, cfg = {}) {
  const ds = DATASETS[dataset]; if (!ds) return { rows: [], groups: null };
  const fmap = new Map(ds.fields.map((f) => [f.key, f]));
  let out = rows;
  const r = cfg.range;
  if (ds.date && r && r.preset && r.preset !== 'all') {
    const b = rangeBounds(r);
    out = out.filter((x) => { const tt = parseTs(x[ds.date]); return tt >= b.start && tt < b.end; });
  }
  for (const f of cfg.filters || []) if (f.field && f.op) out = out.filter((x) => match(x, f, fmap.get(f.field)));
  if (cfg.sort && fmap.has(cfg.sort)) {
    const fld = fmap.get(cfg.sort), dir = cfg.dir || 1;
    const key = (x) => (fld.type === 'date' ? parseTs(x[cfg.sort]) || 0 : fld.type === 'number' ? Number(x[cfg.sort]) || 0 : str(x[cfg.sort]).toLowerCase());
    out = [...out].sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * dir);
  }
  let groups = null;
  if (cfg.group && fmap.has(cfg.group)) {
    const m = new Map();
    for (const x of out) { const k = str(x[cfg.group]) || '(blank)'; m.set(k, (m.get(k) || 0) + 1); }
    groups = [...m.entries()].map(([value, count]) => ({ value, count, share: out.length ? Math.round((count / out.length) * 1000) / 10 : 0 })).sort((a, b) => b.count - a.count);
  }
  return { rows: out, groups };
}
