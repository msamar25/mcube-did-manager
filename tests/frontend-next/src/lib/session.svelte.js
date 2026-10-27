// Session.
//   LIVE: the existing email + PIN → emailed one-time code flow (/api/auth/start → /api/auth/verify),
//         signed token from the backend (length set in Global settings), identity + allowed apps from /api/me.
//   PREVIEW: a local demo session (no network).
import { LIVE } from './data/source.js';
import { api, getToken, setToken, onSessionExpired } from './data/api.js';
import { getMe, previewMe } from './data/platform.js';

const nameFrom = (email = '') => email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'User';
const demoRole = () => { try { return sessionStorage.getItem('next_demo_role'); } catch { return null; } };

// role = the user's role inside the DID Replacement app (pages check session.role === 'admin').
// apps = what the App Launcher shows (only apps this user may open), from /api/me.
const blank = { apps: [], canManage: false, superAdmin: false, orgName: 'UNext', notice: '', defaultApp: '', sessionHours: 8 };
function applyMe(me) {
  Object.assign(session, { role: me.role, email: me.email, name: me.name || nameFrom(me.email), apps: me.apps || [], canManage: !!me.can_manage_users, superAdmin: !!me.super_admin, orgName: me.org_name || 'UNext', notice: me.launcher_notice || '', defaultApp: me.default_app || '', sessionHours: me.session_hours || 8 });
}
export const session = $state(LIVE
  ? { signedIn: !!getToken(), checked: false, role: 'operator', name: '', email: '', expiredMessage: '', ...blank }
  : { signedIn: !!demoRole(), checked: true, role: demoRole() || 'admin', name: '', email: '', expiredMessage: '', ...blank });
if (!LIVE && demoRole()) applyMe(previewMe(demoRole()));
export const hasApp = (id) => session.apps.some((a) => a.id === id && a.status !== 'planned');
export const appOf = (id) => session.apps.find((a) => a.id === id);

onSessionExpired((msg) => { session.signedIn = false; session.checked = true; session.expiredMessage = msg || 'Your session has expired. Please sign in again.'; });

// Confirm a stored token is still valid and load the identity behind it.
export async function restore() {
  if (!LIVE) return;
  if (!getToken()) { session.signedIn = false; session.checked = true; return; }
  try {
    const me = await getMe();
    applyMe(me);
    Object.assign(session, { signedIn: true, checked: true });
  } catch (e) {
    // only a real 401 ends the session; a sleeping/unreachable server keeps it (data loading will retry)
    session.signedIn = e?.status !== 401 && !!getToken(); session.checked = true;
  }
}

// LIVE login, step 1: email + PIN. Returns { challenge_id, expires_in }.
export const startLogin = (email, pin) => api('/api/auth/start', { method: 'POST', body: { email: email.trim(), pin }, auth: false, timeout: 90000 });
// LIVE login, step 2: one-time code.
export async function verifyLogin(challenge_id, otp) {
  const r = await api('/api/auth/verify', { method: 'POST', body: { challenge_id, otp }, auth: false });
  setToken(r.token);
  session.expiredMessage = '';
  await restore();
  return r;
}

// PREVIEW login
export function signIn(role) {
  applyMe(previewMe(role)); session.signedIn = true;
  try { sessionStorage.setItem('next_demo_role', role); } catch {}
}
// re-read apps / roles after an administrator changes access
export async function reloadMe() { if (LIVE) { try { applyMe(await getMe()); } catch { /* keep current */ } } }

export async function signOut() {
  // sign out locally at once; tell the backend in the background (its audit log records the logout)
  if (LIVE) { const t = getToken(); setToken(''); if (t) api('/api/auth/logout', { method: 'POST', token: t, timeout: 15000 }).catch(() => {}); }
  session.signedIn = false; Object.assign(session, blank);
  try { sessionStorage.removeItem('next_demo_role'); } catch {}
}

// Permissions mirror the backend (it enforces them; the UI only hides what would be refused).
export const can = {
  settings: () => session.role === 'admin',
  reassign: () => true, // operators may run replacements (v50 permissions)
  credentials: () => session.role === 'admin',
  recovery: () => session.role === 'admin'
};
