"""Platform layer: app launcher, per-user app access, global + per-app settings, saved reports.

Google Sheets tabs (created on first use):
  Platform_Users          one row per user added in User Management (PIN stored as a pbkdf2 hash)
  Platform_App_Access     which apps a user may open, and the role inside each app
  Platform_Settings       global settings (scope=global) and per-app settings (scope=<app id>)
  Platform_Audit          every change made in User Management
  Platform_Saved_Reports  custom report definitions (columns, filters), private or shared

Backward compatible: with empty tabs, access is exactly the previous environment-variable rules
(ADMIN_EMAIL = administrator, OPERATOR_EMAIL / OPERATOR_USERS_JSON = DID operators).
ADMIN_EMAIL is the super administrator: always active, always has every app, cannot be changed
from the sheet (prevents lock-out).
"""
import hashlib, json, logging, os, re, secrets, threading, time, uuid
from datetime import datetime
from fastapi import HTTPException

log = logging.getLogger('mcube.platform')

USER_HEADERS = ['email', 'display_name', 'status', 'pin_hash', 'default_app', 'created_utc', 'created_by', 'updated_utc', 'updated_by', 'notes']
ACCESS_HEADERS = ['email', 'app_id', 'app_role', 'status', 'updated_utc', 'updated_by']
SETTING_HEADERS = ['scope', 'key', 'value', 'updated_utc', 'updated_by']
AUDIT_HEADERS = ['time_ist', 'actor', 'action', 'target', 'details']
REPORT_HEADERS = ['report_id', 'owner', 'name', 'app_id', 'dataset', 'config_json', 'shared', 'updated_utc']

# App catalog. A new app is added here (plus its screens); access and settings then work automatically.
APPS = [
    {'id': 'did', 'name': 'DID Replacement', 'description': 'DID inventory, FIFO replacement, support requests', 'status': 'live',
     'roles': ['admin', 'operator'], 'color': '#f26b1d', 'icon': 'swap'},
    {'id': 'users', 'name': 'User Management', 'description': 'Users, app access, global and app settings', 'status': 'live',
     'roles': ['admin'], 'color': '#2a6fdb', 'icon': 'users'},
    {'id': 'deb', 'name': 'DEB Operations', 'description': 'In development', 'status': 'planned',
     'roles': ['admin', 'member'], 'color': '#7a5af8', 'icon': 'layers'},
]
APP_IDS = {a['id'] for a in APPS}
GLOBAL_DEFAULTS = {'org_name': 'UNext', 'session_hours': '8', 'allowed_email_domains': '', 'launcher_notice': ''}
APP_DEFAULTS = {'enabled': 'true', 'maintenance_message': ''}
GLOBAL_KEYS = set(GLOBAL_DEFAULTS)
APP_KEYS = set(APP_DEFAULTS)
EMAIL_RE = re.compile(r'^[^@\s]+@[^@\s]+\.[^@\s]+$')
CACHE_TTL = 30


def _norm(email):
    return str(email or '').strip().lower()


def hash_pin(pin):
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', pin.encode(), salt, 310000)
    return f'pbkdf2_sha256$310000${salt.hex()}${digest.hex()}'


class Platform:
    def __init__(self, m):
        self.m = m  # backend main module (sheet(), worksheet(), _quota_call, IST)
        self._lock = threading.RLock()
        self._write = threading.Lock()
        self._cache = None
        self._at = 0.0

    # ---------- storage ----------
    def _ws(self, title, headers):
        return self.m.worksheet(self.m.sheet(), title, headers)

    def _values(self, title, headers):
        values = self.m._quota_call(lambda: self._ws(title, headers).get_all_values())
        if not values:
            return []
        head = [str(h).strip() for h in values[0]]
        return [{h: (row[i] if i < len(row) else '') for i, h in enumerate(head) if h} for row in values[1:] if any(str(c).strip() for c in row)]

    def _now(self):
        return datetime.now(self.m.IST).isoformat(timespec='seconds')

    def _load(self, force=False):
        with self._lock:
            if not force and self._cache is not None and time.time() - self._at < CACHE_TTL:
                return self._cache
            try:
                data = {
                    'users': {_norm(r.get('email')): r for r in self._values('Platform_Users', USER_HEADERS) if _norm(r.get('email'))},
                    'access': [r for r in self._values('Platform_App_Access', ACCESS_HEADERS) if _norm(r.get('email'))],
                    'settings': self._values('Platform_Settings', SETTING_HEADERS),
                }
            except HTTPException:
                raise
            except Exception:
                if self._cache is not None:
                    log.exception('Platform tabs unreadable; using last known access')
                    return self._cache
                raise
            self._cache, self._at = data, time.time()
            return data

    def invalidate(self):
        with self._lock:
            self._at = 0.0

    def _upsert(self, title, headers, match, row):
        """Update the first row where match(record) is true, else append. Small tabs only."""
        ws = self._ws(title, headers)
        values = self.m._quota_call(lambda: ws.get_all_values())
        if not values:
            self.m._quota_call(lambda: ws.update(range_name='A1', values=[headers], value_input_option='RAW'))
            values = [headers]
        head = [str(h).strip() for h in values[0]]
        for idx, raw in enumerate(values[1:], start=2):
            rec = {h: (raw[i] if i < len(raw) else '') for i, h in enumerate(head)}
            if match(rec):
                merged = [row.get(h, rec.get(h, '')) for h in headers]
                self.m._quota_call(lambda: ws.update(range_name=f'A{idx}', values=[merged], value_input_option='RAW'))
                return 'updated'
        self.m._quota_call(lambda: ws.append_row([row.get(h, '') for h in headers], value_input_option='RAW'))
        return 'created'

    def audit(self, actor, action, target, details=''):
        try:
            self._ws('Platform_Audit', AUDIT_HEADERS).append_row([self._now(), actor, action, target, str(details)[:1000]], value_input_option='RAW')
        except Exception:
            log.exception('Platform audit write failed: %s %s', action, target)

    # ---------- identities ----------
    @staticmethod
    def super_admin_email():
        return _norm(os.getenv('ADMIN_EMAIL'))

    @staticmethod
    def env_users():
        out = {}
        admin, op = _norm(os.getenv('ADMIN_EMAIL')), _norm(os.getenv('OPERATOR_EMAIL'))
        if op:
            out[op] = {'role': 'operator', 'pin_hash': None}
        try:
            entries = json.loads(os.getenv('OPERATOR_USERS_JSON', '[]'))
            if not isinstance(entries, list):
                raise ValueError()
            for e in entries:
                em = _norm(e.get('email'))
                if em and em not in out:
                    out[em] = {'role': 'operator', 'pin_hash': str(e.get('pin_hash', ''))}
        except (ValueError, TypeError, AttributeError):
            raise HTTPException(503, 'Invalid OPERATOR_USERS_JSON configuration')
        if admin:
            out[admin] = {'role': 'admin', 'pin_hash': None}
        return out

    def settings(self, scope='global', data=None):
        data = data or self._load()
        base = dict(GLOBAL_DEFAULTS if scope == 'global' else APP_DEFAULTS)
        for r in data['settings']:
            if str(r.get('scope', '')).strip() == scope and str(r.get('key', '')).strip() in base:
                base[str(r['key']).strip()] = str(r.get('value', ''))
        return base

    def app_enabled(self, app_id, data=None):
        return str(self.settings(app_id, data).get('enabled', 'true')).strip().lower() not in ('false', '0', 'no', 'off')

    def resolve(self, email, data=None):
        """Effective identity: {'email','name','status','super_admin','source','apps':{app_id: role}} or None."""
        email = _norm(email)
        if not email:
            return None
        env = self.env_users()
        data = data or self._load()
        row = data['users'].get(email)
        sup = email == self.super_admin_email()
        if not sup and email not in env and not row:
            return None
        status = 'active' if sup else str((row or {}).get('status') or 'active').strip().lower()
        if sup:
            apps = {a['id']: a['roles'][0] for a in APPS if a['status'] == 'live'}
        else:
            apps = {'did': env[email]['role']} if email in env else {}
            for r in data['access']:
                if _norm(r.get('email')) != email:
                    continue
                app = str(r.get('app_id', '')).strip()
                role = str(r.get('app_role', '')).strip().lower()
                meta = next((a for a in APPS if a['id'] == app), None)
                if not meta:
                    continue
                if str(r.get('status', 'granted')).strip().lower() == 'revoked':
                    apps.pop(app, None)
                elif role in meta['roles']:
                    apps[app] = role
        return {'email': email, 'name': str((row or {}).get('display_name') or ''), 'status': status,
                'super_admin': sup, 'source': 'environment' if (sup or email in env) else 'user_management',
                'default_app': str((row or {}).get('default_app') or ''), 'apps': apps}

    def login_lookup(self, email):
        """(token_role, pin_hash, pin_role) for a user allowed to sign in, else None.
        pin_hash None means the environment hash for pin_role (ADMIN_PIN_HASH / OPERATOR_PIN_HASH)."""
        email = _norm(email)
        env = self.env_users()
        try:
            ident = self.resolve(email)
            row = self._load()['users'].get(email) or {}
        except Exception:
            # Sheets unreachable or not configured: environment users keep the previous behaviour.
            log.exception('Platform users unreadable during sign-in')
            e = env.get(email)
            return (e['role'], e['pin_hash'], e['role']) if e else None
        if not ident or ident['status'] != 'active':
            return None
        if ident['super_admin']:
            return ('admin', None, 'admin')
        pin_hash = str(row.get('pin_hash') or '') or (env.get(email, {}).get('pin_hash'))
        if email not in env and not pin_hash:
            return None
        return (ident['apps'].get('did', 'member'), pin_hash, env.get(email, {}).get('role', 'operator'))

    def session_hours(self):
        try:
            return max(1, min(12, int(float(self.settings('global').get('session_hours') or 8))))
        except Exception:
            return 8

    def did_role(self, email, token_role):
        """Role inside the DID app for an authenticated request; 403 when the user has no DID access."""
        try:
            data = self._load()
            ident = self.resolve(email, data)
        except Exception:
            log.exception('Platform access unreadable; using signed session role')
            if token_role in ('admin', 'operator'):
                return token_role
            raise HTTPException(503, 'Access settings unavailable; try again shortly')
        if not email:  # tokens issued before v88 always carried an email; keep them working
            return token_role
        if not ident or ident['status'] != 'active':
            raise HTTPException(401, 'Your account is disabled')
        role = ident['apps'].get('did')
        if not role:
            raise HTTPException(403, 'You do not have access to the DID Replacement app')
        if not ident['super_admin'] and not self.app_enabled('did', data):
            raise HTTPException(423, self.settings('did', data).get('maintenance_message') or 'DID Replacement is temporarily disabled')
        return role

    def can_manage(self, ident):
        return bool(ident and ident['status'] == 'active' and (ident['super_admin'] or ident['apps'].get('users') == 'admin'))

    def me(self, email, token_role):
        data = self._load()
        ident = self.resolve(email, data)
        if not ident:
            ident = {'email': email, 'name': '', 'status': 'active', 'super_admin': False, 'source': 'environment', 'default_app': '',
                     'apps': {'did': token_role} if token_role in ('admin', 'operator') else {}}
        g = self.settings('global', data)
        apps = []
        for a in APPS:
            role = ident['apps'].get(a['id'])
            if a['status'] == 'planned':
                if not (ident['super_admin'] or role):
                    continue
            elif not role:
                continue
            st = self.settings(a['id'], data)
            apps.append({**{k: a[k] for k in ('id', 'name', 'description', 'color', 'icon', 'status')}, 'role': role or '',
                         'enabled': self.app_enabled(a['id'], data), 'maintenance_message': st.get('maintenance_message', '')})
        return {'email': ident['email'], 'name': ident['name'], 'super_admin': ident['super_admin'], 'default_app': ident['default_app'],
                'can_manage_users': self.can_manage(ident), 'apps': apps,
                'org_name': g.get('org_name') or 'UNext', 'launcher_notice': g.get('launcher_notice', ''), 'session_hours': self.session_hours()}

    # ---------- user management ----------
    def list_users(self):
        data = self._load(force=True)
        env = self.env_users()
        emails = sorted(set(env) | set(data['users']) | {_norm(r.get('email')) for r in data['access']})
        out = []
        for em in emails:
            ident = self.resolve(em, data)
            if not ident:
                ident = {'email': em, 'name': '', 'status': 'no sign-in', 'super_admin': False, 'source': 'user_management', 'default_app': '', 'apps': {}}
            row = data['users'].get(em) or {}
            has_pin = bool(row.get('pin_hash')) or em in env
            out.append({**ident, 'has_pin': has_pin, 'notes': row.get('notes', ''), 'updated_utc': row.get('updated_utc', ''),
                        'updated_by': row.get('updated_by', ''), 'created_utc': row.get('created_utc', '')})
        return {'users': out, 'apps': APPS}

    def _check_domain(self, email):
        allowed = [d.strip().lower().lstrip('@') for d in self.settings('global').get('allowed_email_domains', '').split(',') if d.strip()]
        if allowed and email.split('@')[-1] not in allowed and email not in self.env_users():
            raise HTTPException(400, f'Email domain not allowed (allowed: {", ".join(allowed)})')

    def save_user(self, actor_ident, body):
        email = _norm(body.get('email'))
        if not EMAIL_RE.match(email):
            raise HTTPException(400, 'Enter a valid email address')
        if email == self.super_admin_email():
            raise HTTPException(400, 'The super administrator is managed in the server environment')
        apps = body.get('apps') or {}
        if not isinstance(apps, dict):
            raise HTTPException(400, 'Invalid app access')
        for app, role in apps.items():
            meta = next((a for a in APPS if a['id'] == app), None)
            if not meta:
                raise HTTPException(400, f'Unknown app {app}')
            if role and role not in meta['roles']:
                raise HTTPException(400, f'Invalid role {role} for {meta["name"]}')
            if app == 'users' and not actor_ident['super_admin']:
                raise HTTPException(403, 'Only the super administrator can grant User Management')
        status = str(body.get('status') or 'active').lower()
        if status not in ('active', 'disabled'):
            raise HTTPException(400, 'Status must be active or disabled')
        pin = str(body.get('pin') or '')
        if pin and not re.fullmatch(r'\d{4,8}', pin):
            raise HTTPException(400, 'PIN must be 4 to 8 digits')
        with self._write:
            data = self._load(force=True)
            existing = data['users'].get(email)
            if not existing:
                self._check_domain(email)
                if not pin and email not in self.env_users():
                    raise HTTPException(400, 'Set a PIN for the new user')
            now, actor = self._now(), actor_ident['email']
            row = {'email': email, 'display_name': str(body.get('display_name') or (existing or {}).get('display_name') or '')[:120],
                   'status': status, 'default_app': str(body.get('default_app') or '') if body.get('default_app') in APP_IDS else '',
                   'notes': str(body.get('notes') or (existing or {}).get('notes') or '')[:300], 'updated_utc': now, 'updated_by': actor}
            if pin:
                row['pin_hash'] = hash_pin(pin)
            if not existing:
                row.update(created_utc=now, created_by=actor)
            result = self._upsert('Platform_Users', USER_HEADERS, lambda r: _norm(r.get('email')) == email, row)
            current = (self.resolve(email, data) or {}).get('apps', {})
            changes = []
            for app in APP_IDS:
                if app not in apps:
                    continue
                want = apps.get(app) or ''
                if (current.get(app) or '') == want:
                    continue
                if app == 'users' and not actor_ident['super_admin']:
                    continue
                self._upsert('Platform_App_Access', ACCESS_HEADERS,
                             lambda r, a=app: _norm(r.get('email')) == email and str(r.get('app_id')).strip() == a,
                             {'email': email, 'app_id': app, 'app_role': want, 'status': 'granted' if want else 'revoked', 'updated_utc': now, 'updated_by': actor})
                changes.append(f'{app}:{want or "revoked"}')
            self.invalidate()
        self.audit(actor, 'USER_' + result.upper(), email, f'status={status}; apps={",".join(changes) or "unchanged"}' + ('; pin reset' if pin else ''))
        return {'ok': True, 'result': result}

    # ---------- settings ----------
    def get_all_settings(self):
        data = self._load(force=True)
        return {'global': self.settings('global', data), 'apps': {a['id']: self.settings(a['id'], data) for a in APPS}, 'catalog': APPS}

    def save_settings(self, actor, scope, values):
        if scope != 'global' and scope not in APP_IDS:
            raise HTTPException(400, 'Unknown settings scope')
        allowed = GLOBAL_KEYS if scope == 'global' else APP_KEYS
        if not isinstance(values, dict) or not values:
            raise HTTPException(400, 'No settings to save')
        clean = {}
        for k, v in values.items():
            if k not in allowed:
                raise HTTPException(400, f'Unknown setting {k}')
            v = str(v if v is not None else '').strip()[:500]
            if k == 'session_hours' and not re.fullmatch(r'\d{1,2}', v or '8'):
                raise HTTPException(400, 'Session length must be 1 to 12 hours')
            if k == 'session_hours' and not 1 <= int(v or 8) <= 12:
                raise HTTPException(400, 'Session length must be 1 to 12 hours')
            if k == 'enabled':
                v = 'true' if v.lower() in ('true', '1', 'yes', 'on') else 'false'
            clean[k] = v
        if scope == 'users' and clean.get('enabled') == 'false':
            raise HTTPException(400, 'User Management cannot be disabled')
        with self._write:
            now = self._now()
            for k, v in clean.items():
                self._upsert('Platform_Settings', SETTING_HEADERS,
                             lambda r, k=k: str(r.get('scope')).strip() == scope and str(r.get('key')).strip() == k,
                             {'scope': scope, 'key': k, 'value': v, 'updated_utc': now, 'updated_by': actor})
            self.invalidate()
        self.audit(actor, 'SETTINGS_SAVED', scope, '; '.join(f'{k}={v}' for k, v in clean.items()))
        return self.get_all_settings()

    def audit_rows(self, limit=400):
        rows = self._values('Platform_Audit', AUDIT_HEADERS)
        return list(reversed(rows[-limit:]))

    # ---------- saved reports ----------
    def list_reports(self, email):
        email = _norm(email)
        rows = self._values('Platform_Saved_Reports', REPORT_HEADERS)
        out = []
        for r in rows:
            if str(r.get('dataset', '')).strip() == '__deleted__':
                continue
            if _norm(r.get('owner')) == email or str(r.get('shared', '')).lower() == 'yes':
                try:
                    cfg = json.loads(r.get('config_json') or '{}')
                except ValueError:
                    cfg = {}
                out.append({'id': r.get('report_id'), 'name': r.get('name'), 'owner': r.get('owner'), 'app_id': r.get('app_id'),
                            'dataset': r.get('dataset'), 'config': cfg, 'shared': str(r.get('shared', '')).lower() == 'yes',
                            'mine': _norm(r.get('owner')) == email, 'updated_utc': r.get('updated_utc')})
        return out

    def save_report(self, email, body):
        email = _norm(email)
        name = str(body.get('name') or '').strip()[:80]
        dataset = str(body.get('dataset') or '').strip()[:40]
        if not name or not dataset or not re.fullmatch(r'[a-z_]+', dataset):
            raise HTTPException(400, 'Name and dataset are required')
        cfg = json.dumps(body.get('config') or {}, separators=(',', ':'))
        if len(cfg) > 4000:
            raise HTTPException(400, 'Report definition is too large')
        rid = str(body.get('id') or '') or uuid.uuid4().hex[:12]
        with self._write:
            rows = self._values('Platform_Saved_Reports', REPORT_HEADERS)
            hit = next((r for r in rows if r.get('report_id') == rid), None)
            if hit and _norm(hit.get('owner')) != email:
                raise HTTPException(403, 'Only the owner can change this report')
            self._upsert('Platform_Saved_Reports', REPORT_HEADERS, lambda r: r.get('report_id') == rid,
                         {'report_id': rid, 'owner': email, 'name': name, 'app_id': str(body.get('app_id') or 'did')[:20], 'dataset': dataset,
                          'config_json': cfg, 'shared': 'yes' if body.get('shared') else 'no', 'updated_utc': self._now()})
        return {'ok': True, 'id': rid}

    def delete_report(self, email, rid):
        email = _norm(email)
        with self._write:
            rows = self._values('Platform_Saved_Reports', REPORT_HEADERS)
            hit = next((r for r in rows if r.get('report_id') == rid), None)
            if not hit:
                raise HTTPException(404, 'Report not found')
            if _norm(hit.get('owner')) != email:
                raise HTTPException(403, 'Only the owner can delete this report')
            # soft delete keeps the row history in the sheet
            self._upsert('Platform_Saved_Reports', REPORT_HEADERS, lambda r: r.get('report_id') == rid,
                         {'dataset': '__deleted__', 'updated_utc': self._now()})
        return {'ok': True}
