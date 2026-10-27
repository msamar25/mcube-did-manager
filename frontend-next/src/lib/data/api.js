// HTTP client for the existing FastAPI backend.
// Same-origin by default (the backend serves this app). window.UNEXT_API_BASE is honoured for a
// separately hosted frontend, exactly like the current production UI.
const TOKEN_KEY = 'did_token'; // same key as the current UI, so one sign-in works for both during the switch-over

export function getToken() { try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } }
export function setToken(t) { try { t ? sessionStorage.setItem(TOKEN_KEY, t) : sessionStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } }

let onUnauthorized = () => {};
export function onSessionExpired(fn) { onUnauthorized = fn; }

export class ApiError extends Error {
  constructor(status, message, detail) { super(message); this.status = status; this.detail = detail; }
}

// FastAPI errors: {detail: "text"} or {detail: {message, ...}} or validation [{msg}]
function messageOf(status, body) {
  const d = body?.detail;
  if (typeof d === 'string') return d;
  if (d && typeof d === 'object' && !Array.isArray(d) && d.message) return d.message;
  if (Array.isArray(d) && d[0]?.msg) return d.map((x) => x.msg).join('; ');
  if (status === 0) return 'Cannot reach the server. Check your connection.';
  if (status === 502 || status === 503) return 'The service is temporarily unavailable. Please try again shortly.';
  return `Request failed (HTTP ${status})`;
}

export async function api(path, { method = 'GET', body, timeout = 45000, auth = true } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = auth ? getToken() : '';
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(`${window.UNEXT_API_BASE || ''}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
  } catch (e) {
    throw new ApiError(0, e?.name === 'AbortError' ? 'The server took too long to respond. Please try again.' : messageOf(0));
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (res.status === 401 && auth && token) { setToken(''); onUnauthorized(messageOf(401, data)); }
  if (!res.ok) throw new ApiError(res.status, messageOf(res.status, data), data?.detail);
  return data;
}
