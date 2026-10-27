"""v88 platform layer: app access, user management, settings, saved reports.

Runs against the dev harness's in-memory gspread (no Google access)."""
import hashlib, os, sys, time, unittest
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'tools' / 'dev-harness'))
import fake_gspread  # noqa: E402
BOOK = fake_gspread.install()


def pin_hash(pin, salt='00112233445566778899aabbccddeeff', it=200000):
    return f"pbkdf2_sha256${it}${salt}${hashlib.pbkdf2_hmac('sha256', pin.encode(), bytes.fromhex(salt), it).hex()}"


os.environ.update({'SESSION_SECRET': 's' * 40, 'ADMIN_EMAIL': 'boss@x.test', 'ADMIN_PIN_HASH': pin_hash('2468'),
                   'OPERATOR_EMAIL': 'op@x.test', 'OPERATOR_PIN_HASH': pin_hash('1357'), 'OPERATOR_USERS_JSON': '[]',
                   'GOOGLE_SERVICE_ACCOUNT_JSON': '{}', 'GOOGLE_SHEET_ID': 'fake'})
from fastapi.testclient import TestClient  # noqa: E402
from backend import main  # noqa: E402


def token(email, role='operator'):
    return main._sign({'kind': 'session', 'role': role, 'email': email, 'exp': int(time.time() + 3600)})


def hdr(email, role='operator'):
    return {'Authorization': 'Bearer ' + token(email, role)}


class PlatformTests(unittest.TestCase):
    def setUp(self):
        BOOK.sheets.clear()
        main._sheet_local.__dict__.clear()
        main.platform.invalidate()
        main.platform._cache = None
        main.OTP_RATE.clear()
        self.c = TestClient(main.app)

    def test_empty_tabs_keep_previous_rules(self):
        p = main.platform
        self.assertEqual(p.login_lookup('boss@x.test'), ('admin', None, 'admin'))
        self.assertEqual(p.login_lookup('op@x.test'), ('operator', None, 'operator'))
        self.assertIsNone(p.login_lookup('nobody@x.test'))
        self.assertEqual(p.did_role('op@x.test', 'operator'), 'operator')
        self.assertEqual(p.did_role('boss@x.test', 'admin'), 'admin')

    def test_me_lists_only_allowed_apps(self):
        r = self.c.get('/api/me', headers=hdr('op@x.test')).json()
        self.assertEqual([a['id'] for a in r['apps']], ['did'])
        self.assertEqual(r['role'], 'operator')
        self.assertFalse(r['can_manage_users'])
        r = self.c.get('/api/me', headers=hdr('boss@x.test', 'admin')).json()
        self.assertIn('users', [a['id'] for a in r['apps']])
        self.assertTrue(r['can_manage_users'])

    def test_operator_cannot_manage_users(self):
        self.assertEqual(self.c.get('/api/platform/users', headers=hdr('op@x.test')).status_code, 403)

    def test_create_user_with_pin_and_apps(self):
        h = hdr('boss@x.test', 'admin')
        r = self.c.post('/api/platform/users', headers=h, json={'email': 'New@X.test', 'display_name': 'New One', 'pin': '4321', 'apps': {'did': 'operator'}})
        self.assertEqual(r.status_code, 200, r.text)
        role, ph, pin_role = main.platform.login_lookup('new@x.test')
        self.assertEqual(role, 'operator')
        self.assertTrue(main._pin_ok('4321', pin_role, ph))
        self.assertFalse(main._pin_ok('1111', pin_role, ph))
        self.assertEqual(self.c.get('/api/settings', headers=hdr('new@x.test')).status_code, 403)  # operator, not admin
        users = self.c.get('/api/platform/users', headers=h).json()['users']
        self.assertIn('new@x.test', [u['email'] for u in users])
        audit = self.c.get('/api/platform/audit', headers=h).json()['items']
        self.assertEqual(audit[0]['action'], 'USER_CREATED')

    def test_new_user_needs_pin(self):
        r = self.c.post('/api/platform/users', headers=hdr('boss@x.test', 'admin'), json={'email': 'a@x.test', 'apps': {'did': 'operator'}})
        self.assertEqual(r.status_code, 400)

    def test_revoke_did_blocks_env_operator(self):
        h = hdr('boss@x.test', 'admin')
        r = self.c.post('/api/platform/users', headers=h, json={'email': 'op@x.test', 'apps': {'did': ''}})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(self.c.get('/api/dids', headers=hdr('op@x.test')).status_code, 403)
        me = self.c.get('/api/me', headers=hdr('op@x.test')).json()
        self.assertEqual(me['apps'], [])

    def test_disabled_user_cannot_sign_in_or_call(self):
        h = hdr('boss@x.test', 'admin')
        self.c.post('/api/platform/users', headers=h, json={'email': 'op@x.test', 'status': 'disabled', 'apps': {}})
        self.assertIsNone(main.platform.login_lookup('op@x.test'))
        self.assertEqual(self.c.get('/api/dids', headers=hdr('op@x.test')).status_code, 401)

    def test_super_admin_cannot_be_changed(self):
        r = self.c.post('/api/platform/users', headers=hdr('boss@x.test', 'admin'), json={'email': 'boss@x.test', 'status': 'disabled'})
        self.assertEqual(r.status_code, 400)

    def test_only_super_admin_grants_user_management(self):
        h = hdr('boss@x.test', 'admin')
        self.c.post('/api/platform/users', headers=h, json={'email': 'ua@x.test', 'pin': '5555', 'apps': {'users': 'admin'}})
        ua = hdr('ua@x.test', 'member')
        self.assertEqual(self.c.get('/api/platform/users', headers=ua).status_code, 200)
        r = self.c.post('/api/platform/users', headers=ua, json={'email': 'z@x.test', 'pin': '5555', 'apps': {'users': 'admin'}})
        self.assertEqual(r.status_code, 403)
        r = self.c.post('/api/platform/users', headers=ua, json={'email': 'z@x.test', 'pin': '5555', 'apps': {'did': 'admin'}})
        self.assertEqual(r.status_code, 200)

    def test_app_disable_and_session_hours(self):
        h = hdr('boss@x.test', 'admin')
        r = self.c.put('/api/platform/settings', headers=h, json={'scope': 'did', 'values': {'enabled': False, 'maintenance_message': 'Back at 6'}})
        self.assertEqual(r.status_code, 200, r.text)
        bad = self.c.get('/api/batch', headers=hdr('op@x.test'))
        self.assertEqual(bad.status_code, 423)
        self.assertIn('Back at 6', bad.text)
        self.assertEqual(self.c.get('/api/batch', headers=h).status_code, 200)  # super admin keeps access
        self.assertEqual(self.c.put('/api/platform/settings', headers=h, json={'scope': 'global', 'values': {'session_hours': 30}}).status_code, 400)
        self.c.put('/api/platform/settings', headers=h, json={'scope': 'global', 'values': {'session_hours': 4}})
        self.assertEqual(main.platform.session_hours(), 4)
        self.assertEqual(self.c.put('/api/platform/settings', headers=h, json={'scope': 'users', 'values': {'enabled': False}}).status_code, 400)

    def test_domain_restriction(self):
        h = hdr('boss@x.test', 'admin')
        self.c.put('/api/platform/settings', headers=h, json={'scope': 'global', 'values': {'allowed_email_domains': 'unext.in'}})
        self.assertEqual(self.c.post('/api/platform/users', headers=h, json={'email': 'a@gmail.com', 'pin': '1234', 'apps': {'did': 'operator'}}).status_code, 400)
        self.assertEqual(self.c.post('/api/platform/users', headers=h, json={'email': 'a@unext.in', 'pin': '1234', 'apps': {'did': 'operator'}}).status_code, 200)

    def test_saved_reports_private_and_shared(self):
        a, b = hdr('op@x.test'), hdr('boss@x.test', 'admin')
        r = self.c.post('/api/platform/reports', headers=a, json={'name': 'Mine', 'dataset': 'inventory', 'config': {'cols': ['did']}})
        rid = r.json()['id']
        self.c.post('/api/platform/reports', headers=a, json={'name': 'Team', 'dataset': 'requests', 'shared': True})
        self.assertEqual(len(self.c.get('/api/platform/reports', headers=a).json()['items']), 2)
        self.assertEqual([x['name'] for x in self.c.get('/api/platform/reports', headers=b).json()['items']], ['Team'])
        self.assertEqual(self.c.delete(f'/api/platform/reports/{rid}', headers=b).status_code, 403)
        self.assertEqual(self.c.delete(f'/api/platform/reports/{rid}', headers=a).status_code, 200)
        self.assertEqual(len(self.c.get('/api/platform/reports', headers=a).json()['items']), 1)

    def test_login_start_uses_sheet_pin(self):
        h = hdr('boss@x.test', 'admin')
        self.c.post('/api/platform/users', headers=h, json={'email': 'sheet@x.test', 'pin': '8642', 'apps': {'did': 'operator'}})
        with mock.patch('backend.brevo.send_brevo', new=mock.AsyncMock()):
            self.assertEqual(self.c.post('/api/auth/start', json={'email': 'sheet@x.test', 'pin': '0000'}).status_code, 401)
            self.assertEqual(self.c.post('/api/auth/start', json={'email': 'sheet@x.test', 'pin': '8642'}).status_code, 200)
            self.assertEqual(self.c.post('/api/auth/start', json={'email': 'op@x.test', 'pin': '1357'}).status_code, 200)


if __name__ == '__main__':
    unittest.main()
