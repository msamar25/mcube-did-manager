// Minimal hash router (no dependencies). Routes: #/section/page?query
export const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home', pages: [{ id: 'overview', label: 'Overview', icon: 'layout' }] },
  { id: 'requests', label: 'Support Requests', icon: 'ticket', pages: [
    { id: 'queue', label: 'All Requests', icon: 'inbox' },
    { id: 'public-form', label: 'Public Request Form', icon: 'form' },
    { id: 'notifications', label: 'Notifications', icon: 'bell' }
  ] },
  { id: 'command', label: 'DID Command Center', icon: 'radar', accent: true, pages: [
    { id: '3d', label: '3D Overview', icon: 'cube' },
    { id: 'inventory', label: 'DID Inventory', icon: 'list' },
    { id: 'operators', label: 'Operator Analytics', icon: 'operators' },
    { id: 'pool', label: 'Pool Intelligence', icon: 'pool' },
    { id: 'agent', label: 'Agent 360°', icon: 'agent' },
    { id: 'replacement', label: 'Replacement Queue', icon: 'swap' },
    { id: 'risk', label: 'Risk Radar', icon: 'shield' }
  ] },
  { id: 'analytics', label: 'Analytics', icon: 'chart', pages: [
    { id: 'insights', label: 'Request Insights', icon: 'chart' },
    { id: 'teams', label: 'Team Performance', icon: 'users' }
  ] },
  { id: 'reports', label: 'Reports', icon: 'file', pages: [
    { id: 'audit', label: 'Audit Log', icon: 'log' },
    { id: 'history', label: 'Replacement History', icon: 'history' },
    { id: 'exports', label: 'Custom Reports', icon: 'filedown' }
  ] },
  { id: 'settings', label: 'Settings', icon: 'settings', admin: true, pages: [
    { id: 'intake', label: 'Request Intake', icon: 'inbox' },
    { id: 'safety', label: 'Replacement Safety', icon: 'shield' },
    { id: 'notifications', label: 'Call Notifications', icon: 'phone' },
    { id: 'email', label: 'Email', icon: 'mail' },
    { id: 'employees', label: 'Employee Sync', icon: 'users' },
    { id: 'credentials', label: 'MCube Credentials', icon: 'key' },
    { id: 'advanced', label: 'Advanced & Access', icon: 'sliders' }
  ] }
];

// User Management app (platform administration)
export const ADMIN_NAV = [
  { id: 'admin', label: 'User Management', icon: 'users', pages: [
    { id: 'users', label: 'Users & Access', icon: 'users' },
    { id: 'apps', label: 'App Settings', icon: 'grid' },
    { id: 'global', label: 'Global Settings', icon: 'sliders' },
    { id: 'audit', label: 'Audit Log', icon: 'log' }
  ] }
];
// Which app a route belongs to: home = App Launcher, users = User Management, did = DID Replacement.
export const NAV_OF = { did: NAV, users: ADMIN_NAV };
export const hadHash = typeof location !== 'undefined' && location.hash.length > 2;

function parse() {
  const h = (location.hash || '#/home').slice(2);
  const [path, qs = ''] = h.split('?');
  const [section = 'home', page] = path.split('/');
  const params = Object.fromEntries(new URLSearchParams(qs));
  if (section === 'home') return { app: 'home', section: 'home', page: 'apps', params };
  const isAdmin = section === 'admin';
  const nav = isAdmin ? ADMIN_NAV : NAV;
  const sec = nav.find((s) => s.id === section) || nav[0];
  const pg = sec.pages.find((p) => p.id === page) || sec.pages[0];
  return { app: isAdmin ? 'users' : 'did', section: sec.id, page: pg.id, params };
}

export const route = $state(parse());
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => Object.assign(route, parse()));
}
export function go(section, page, params) {
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  location.hash = `#/${section}${page ? '/' + page : ''}${qs}`;
}
