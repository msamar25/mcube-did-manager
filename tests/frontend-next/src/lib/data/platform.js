// Platform data: launcher apps, users + app access, global / per-app settings, audit, saved reports.
// LIVE → /api/me and /api/platform/* (Google Sheets tabs Platform_*). PREVIEW → in-memory sample, nothing saved.
import { api } from './api.js';
import { LIVE } from './source.js';

// Where each app opens. A new app adds its entry here plus its screens.
export const APP_HOME = { did: '#/dashboard/overview', users: '#/admin/users', deb: '' };
export const ROLE_LABEL = { admin: 'Administrator', operator: 'Operator', member: 'Member' };

// ---------- preview sample (labelled, in memory) ----------
const CATALOG = [
  { id: 'did', name: 'DID Replacement', description: 'DID inventory, FIFO replacement, support requests', status: 'live', roles: ['admin', 'operator'], color: '#f26b1d', icon: 'swap' },
  { id: 'users', name: 'User Management', description: 'Users, app access, global and app settings', status: 'live', roles: ['admin'], color: '#2a6fdb', icon: 'users' },
  { id: 'deb', name: 'DEB Operations', description: 'In development', status: 'planned', roles: ['admin', 'member'], color: '#7a5af8', icon: 'layers' }
];
const now = () => new Date().toISOString();
const PV = {
  users: [
    { email: 'admin@example-unext.in', name: 'Prasad Shankarwar', status: 'active', super_admin: true, source: 'environment', apps: { did: 'admin', users: 'admin' }, has_pin: true },
    { email: 'operator1@example-unext.in', name: 'Operator One', status: 'active', super_admin: false, source: 'environment', apps: { did: 'operator' }, has_pin: true },
    { email: 'ops.lead@example-unext.in', name: 'Ops Lead', status: 'active', super_admin: false, source: 'user_management', apps: { did: 'admin', deb: 'admin' }, has_pin: true, updated_utc: now(), updated_by: 'admin@example-unext.in' },
    { email: 'former@example-unext.in', name: 'Former Staff', status: 'disabled', super_admin: false, source: 'user_management', apps: { did: 'operator' }, has_pin: true, updated_utc: now(), updated_by: 'admin@example-unext.in' }
  ],
  settings: { global: { org_name: 'UNext', session_hours: '8', allowed_email_domains: '', launcher_notice: '' }, apps: { did: { enabled: 'true', maintenance_message: '' }, users: { enabled: 'true', maintenance_message: '' }, deb: { enabled: 'true', maintenance_message: '' } } },
  audit: [{ time_ist: now(), actor: 'admin@example-unext.in', action: 'USER_CREATED', target: 'ops.lead@example-unext.in', details: 'status=active; apps=did:admin,deb:admin' }],
  reports: []
};
const wait = (v, ms = 250) => new Promise((r) => setTimeout(() => r(structuredClone(v)), ms));

export function previewMe(role) {
  const admin = role === 'admin';
  const apps = CATALOG.filter((a) => admin || a.id === 'did').map((a) => ({ ...a, role: a.status === 'planned' ? '' : a.id === 'did' ? (admin ? 'admin' : 'operator') : 'admin', enabled: PV.settings.apps[a.id]?.enabled !== 'false', maintenance_message: PV.settings.apps[a.id]?.maintenance_message || '' }));
  return { email: admin ? 'admin@example-unext.in' : 'operator1@example-unext.in', name: admin ? 'Prasad Shankarwar' : 'Operator One', super_admin: admin, can_manage_users: admin, default_app: '', apps, role: admin ? 'admin' : 'operator', org_name: PV.settings.global.org_name, launcher_notice: PV.settings.global.launcher_notice, session_hours: 8 };
}

// ---------- API ----------
export const getMe = () => api('/api/me', { timeout: 90000 });
export const listUsers = () => (LIVE ? api('/api/platform/users') : wait({ users: PV.users, apps: CATALOG }));
export function saveUser(body) {
  if (LIVE) return api('/api/platform/users', { method: 'POST', body });
  const email = body.email.trim().toLowerCase();
  const u = PV.users.find((x) => x.email === email);
  const apps = { ...(u?.apps || {}) };
  for (const [k, v] of Object.entries(body.apps || {})) { if (v) apps[k] = v; else delete apps[k]; }
  const row = { email, name: body.display_name || u?.name || '', status: body.status, super_admin: false, source: u?.source || 'user_management', apps, has_pin: !!(u?.has_pin || body.pin), updated_utc: now(), updated_by: 'preview' };
  if (u) Object.assign(u, row); else PV.users.push(row);
  PV.audit.unshift({ time_ist: now(), actor: 'preview', action: u ? 'USER_UPDATED' : 'USER_CREATED', target: email, details: 'preview only' });
  return wait({ ok: true, result: u ? 'updated' : 'created', preview: true });
}
export const getPlatformSettings = () => (LIVE ? api('/api/platform/settings') : wait({ ...PV.settings, catalog: CATALOG }));
export function savePlatformSettings(scope, values) {
  if (LIVE) return api('/api/platform/settings', { method: 'PUT', body: { scope, values } });
  if (scope === 'global') Object.assign(PV.settings.global, values); else Object.assign((PV.settings.apps[scope] ||= {}), Object.fromEntries(Object.entries(values).map(([k, v]) => [k, String(v)])));
  PV.audit.unshift({ time_ist: now(), actor: 'preview', action: 'SETTINGS_SAVED', target: scope, details: Object.entries(values).map(([k, v]) => `${k}=${v}`).join('; ') });
  return wait({ ...PV.settings, catalog: CATALOG });
}
export const getPlatformAudit = () => (LIVE ? api('/api/platform/audit') : wait({ items: PV.audit }));
export const getAccessLog = () => (LIVE ? api('/api/platform/access-log') : wait({ items: [{ time_ist: now(), email: 'admin@example-unext.in', role: 'admin', action: 'LOGIN_SUCCESS', endpoint: '/api/auth/verify', result: 'SUCCESS' }] }));
export const listReports = () => (LIVE ? api('/api/platform/reports') : wait({ items: PV.reports }));
export function saveReport(body) {
  if (LIVE) return api('/api/platform/reports', { method: 'POST', body });
  const id = body.id || Math.random().toString(16).slice(2, 14);
  const r = { ...body, id, owner: 'preview', mine: true, updated_utc: now() };
  const i = PV.reports.findIndex((x) => x.id === id); if (i >= 0) PV.reports[i] = r; else PV.reports.push(r);
  return wait({ ok: true, id });
}
export function deleteReport(id) {
  if (LIVE) return api(`/api/platform/reports/${encodeURIComponent(id)}`, { method: 'DELETE' });
  PV.reports = PV.reports.filter((x) => x.id !== id); return wait({ ok: true });
}
