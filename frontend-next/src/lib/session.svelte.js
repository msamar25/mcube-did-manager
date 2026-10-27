// Session.
//   LIVE: the existing email + PIN → emailed one-time code flow (/api/auth/start → /api/auth/verify),
//         8-hour signed token from the backend, role from /api/me. Roles: admin, operator.
//   PREVIEW: a local demo session (no network).
import { LIVE } from './data/source.js';
import { api, getToken, setToken, onSessionExpired } from './data/api.js';

const nameFrom = (email = '') => email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || 'User';
const demoRole = () => { try { return sessionStorage.getItem('next_demo_role'); } catch { return null; } };

export const session = $state(LIVE
  ? { signedIn: !!getToken(), checked: false, role: 'operator', name: '', email: '', expiredMessage: '' }
  : { signedIn: !!demoRole(), checked: true, role: demoRole() || 'admin', name: 'Prasad Shankarwar', email: 'admin@example-unext.in', expiredMessage: '' });

onSessionExpired((msg) => { session.signedIn = false; session.checked = true; session.expiredMessage = msg || 'Your session has expired. Please sign in again.'; });

// Confirm a stored token is still valid and load the identity behind it.
export async function restore() {
  if (!LIVE) return;
  if (!getToken()) { session.signedIn = false; session.checked = true; return; }
  try {
    const me = await api('/api/me', { timeout: 90000 });
    Object.assign(session, { signedIn: true, role: me.role, email: me.email, name: nameFrom(me.email), checked: true });
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
  session.role = role; session.signedIn = true;
  session.name = role === 'admin' ? 'Prasad Shankarwar' : 'Operator One';
  session.email = role === 'admin' ? 'admin@example-unext.in' : 'operator1@example-unext.in';
  try { sessionStorage.setItem('next_demo_role', role); } catch {}
}

export async function signOut() {
  if (LIVE) { try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* token may already be invalid */ } setToken(''); }
  session.signedIn = false;
  try { sessionStorage.removeItem('next_demo_role'); } catch {}
}

// Permissions mirror the backend (it enforces them; the UI only hides what would be refused).
export const can = {
  settings: () => session.role === 'admin',
  reassign: () => true, // operators may run replacements (v50 permissions)
  credentials: () => session.role === 'admin',
  recovery: () => session.role === 'admin'
};
