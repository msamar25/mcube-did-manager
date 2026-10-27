// All timestamps are shown in IST, matching the production app.
export function parseTs(v) {
  if (!v) return null;
  const raw = String(v).trim();
  const s = raw.includes('T') ? raw : raw.replace(' ', 'T');
  const d = new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(s) ? s : s + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}
export function ist(v, withTime = true) {
  const d = parseTs(v); if (!d) return '—';
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: true } : { year: 'numeric' }) }).format(d);
}
export function ago(v) {
  const d = parseTs(v); if (!d) return '—';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const dd = Math.round(h / 24); return `${dd} day${dd === 1 ? '' : 's'} ago`;
}
export function agoShort(v) {
  const d = parseTs(v); if (!d) return '—';
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
export const n = (v) => (v === null || v === undefined || Number.isNaN(Number(v)) ? '—' : Number(v).toLocaleString('en-IN'));
export const pct = (v, d = 1) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(d)}%`);
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
const AV = ['#f26b1d', '#2a6fdb', '#16a27a', '#8b5cf6', '#e5484d', '#0ea5e9', '#d97706', '#64748b'];
export const avatarColor = (s = '') => AV[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % AV.length];
export const maskDid = (d = '') => (d.length > 6 ? d.slice(0, 4) + '••' + d.slice(-4) : d);
export const statusLabel = (s = '') => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export function downloadCsv(rows, filename) {
  if (!rows?.length) return;
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = v === null || v === undefined ? '' : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"` : s; };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Notification_Logs rows → readable text. `details` may be plain text or JSON from MCube ({"callid","msg"}).
const KIND = { call_queued: 'Call to agent · request queued', call_reminder: 'Reminder call', review: 'Review decision', completed: 'Completion call', email: 'Email', call: 'Call' };
export function notifText(n = {}) {
  let detail = String(n.details ?? '');
  try { const j = JSON.parse(detail); if (j && typeof j === 'object') detail = j.msg || j.message || (j.callid ? `call ${j.callid}` : ''); } catch { /* plain text */ }
  const kind = KIND[n.kind] || statusLabel(String(n.kind || 'Notification'));
  return { title: detail ? `${kind}: ${detail}` : kind, sub: `${n.target || '—'} · ${statusLabel(String(n.result || ''))}` };
}
