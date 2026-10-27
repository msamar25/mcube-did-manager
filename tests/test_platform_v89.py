"""v89: permissions (role defaults + per-user overrides), one session per user, data setup, live feed."""
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


def hdr(email, role='operator', sid=None):
    p = {'kind': 'session', 'role': role, 'email': email, 'exp': int(time.time() + 3600)}
    if sid: p['sid'] = sid
    return {'Authorization': 'Bearer ' + main._sign(p)}


class V89Tests(unittest.TestCase):
    def setUp(self):
        BOOK.sheets.clear()
        main._sheet_local.__dict__.clear()
        main.platform._cache = None
        main.platform._sids.clear()
        main._LIVE_CACHE['data'] = None
        main.OTP_RATE.clear()
        self.c = TestClient(main.app)
        self.admin = hdr('boss@x.test', 'admin')

    def login(self, email, pin):
        with mock.patch('backend.brevo.send_brevo', new=mock.AsyncMock()) as send:
            r = self.c.post('/api/auth/start', json={'email': email, 'pin': pin}); self.assertEqual(r.status_code, 200, r.text)
            otp = send.call_args.args[2].split('code is ')[1][:6]
        r = self.c.post('/api/auth/verify', json={'challenge_id': r.json()['challenge_id'], 'otp': otp}); self.assertEqual(r.status_code, 200, r.text)
        return {'Authorization': 'Bearer ' + r.json()['token']}

    def test_operator_defaults_unchanged(self):
        op = hdr('op@x.test')
        self.assertEqual(self.c.get('/api/settings', headers=op).status_code, 403)
        self.assertEqual(self.c.get('/api/mcube-config/credentials/status', headers=op).status_code, 403)
        me = self.c.get('/api/me', headers=op).json()
        self.assertEqual(sorted(me['apps'][0]['permissions']), ['replace', 'reports'])
        me = self.c.get('/api/me', headers=self.admin).json()
        self.assertIn('audit', next(a for a in me['apps'] if a['id'] == 'did')['permissions'])

    def test_user_override_grants_settings(self):
        r = self.c.post('/api/platform/users', headers=self.admin, json={'email': 'op@x.test', 'apps': {'did': 'operator'}, 'perms': {'did': {'settings': 'allow', 'replace': 'deny'}}})
        self.assertEqual(r.status_code, 200, r.text)
        op = hdr('op@x.test')
        self.assertNotEqual(self.c.get('/api/settings', headers=op).status_code, 403)
        self.assertEqual(self.c.post('/api/reassign', headers=op, json={'dids': ['1']}).status_code, 403)
        # back to role default
        self.c.post('/api/platform/users', headers=self.admin, json={'email': 'op@x.test', 'apps': {'did': 'operator'}, 'perms': {'did': {'settings': '', 'replace': ''}}})
        self.assertEqual(self.c.get('/api/settings', headers=op).status_code, 403)

    def test_role_default_editable_per_app(self):
        r = self.c.put('/api/platform/settings', headers=self.admin, json={'scope': 'did', 'values': {'perm:audit': 'admin,operator'}})
        self.assertEqual(r.status_code, 200, r.text)
        me = self.c.get('/api/me', headers=hdr('op@x.test')).json()
        self.assertIn('audit', me['apps'][0]['permissions'])
        self.assertEqual(self.c.put('/api/platform/settings', headers=self.admin, json={'scope': 'did', 'values': {'perm:audit': 'admin,boss'}}).status_code, 400)

    def test_second_sign_in_ends_first_session(self):
        a = self.login('op@x.test', '1357')
        self.assertEqual(self.c.get('/api/me', headers=a).status_code, 200)
        b = self.login('op@x.test', '1357')
        self.assertEqual(self.c.get('/api/me', headers=b).status_code, 200)
        r = self.c.get('/api/me', headers=a)
        self.assertEqual(r.status_code, 401)
        self.assertIn('another device', r.json()['detail'])
        # new process (cache gone) still knows the current session from the sheet
        main.platform._sids.clear(); main.platform._cache = None
        self.assertEqual(self.c.get('/api/me', headers=a).status_code, 401)
        self.assertEqual(self.c.get('/api/me', headers=b).status_code, 200)
        # sign out ends it
        self.c.post('/api/auth/logout', headers=b)
        self.assertEqual(self.c.get('/api/me', headers=b).status_code, 401)

    def test_single_session_can_be_turned_off(self):
        self.c.put('/api/platform/settings', headers=self.admin, json={'scope': 'global', 'values': {'single_session': False}})
        a = self.login('op@x.test', '1357'); self.login('op@x.test', '1357')
        self.assertEqual(self.c.get('/api/me', headers=a).status_code, 200)

    def test_data_clear_backs_up_then_clears(self):
        book = main.sheet()
        ws = main.worksheet(book, 'Notification_Logs', main.NOTIFY_HEADERS)
        ws.append_row(['t', 'r1', 'call_queued', '9', 'submitted', 'x'])
        st = self.c.get('/api/admin/data/status', headers=self.admin).json()
        self.assertEqual(next(g for g in st['groups'] if g['group'] == 'notifications')['rows'], 1)
        self.assertEqual(self.c.post('/api/admin/data/clear', headers=self.admin, json={'groups': ['notifications'], 'confirmation': 'nope'}).status_code, 400)
        self.assertEqual(self.c.post('/api/admin/data/clear', headers=hdr('op@x.test'), json={'groups': ['notifications'], 'confirmation': 'CLEAR_SELECTED_DATA'}).status_code, 403)
        r = self.c.post('/api/admin/data/clear', headers=self.admin, json={'groups': ['notifications'], 'confirmation': 'CLEAR_SELECTED_DATA'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(r.json()['cleared'][0]['cleared'], 1)
        self.assertEqual(len(ws.get_all_values()), 1)  # header kept
        backups = [t for t in BOOK.sheets if t.startswith('Backup Notification_Logs')]
        self.assertEqual(len(backups), 1)
        self.assertEqual(BOOK.sheets[backups[0]].get_all_values()[1][1], 'r1')
        self.assertTrue(any(r['event'] == 'DATA_CLEARED' for r in main.get_rows('Change_Logs', main.LOG_HEADERS)))

    def test_live_feed_cached(self):
        ws = main.worksheet(main.sheet(), 'Pending_Requests', main.REQUEST_HEADERS)
        ws.append_row(['req-1', '', '', '9000000001', 'Asha', '', '8000000001', '2026-10-27T10:00:00+05:30', '', '1', 'pending'])
        a = self.c.get('/api/live', headers=hdr('op@x.test')).json()
        self.assertEqual(a['items'][0]['status'], 'pending')
        ws.update(range_name='K2', values=[['completed']])
        b = self.c.get('/api/live', headers=hdr('op@x.test')).json()
        self.assertEqual(a['sig'], b['sig'])  # within 15 s: cached
        main._LIVE_CACHE['at'] = 0
        c = self.c.get('/api/live', headers=hdr('op@x.test')).json()
        self.assertEqual(c['items'][0]['status'], 'completed'); self.assertNotEqual(a['sig'], c['sig'])

    def test_import_requests_validates_against_directory(self):
        book = main.sheet()
        emp = main.worksheet(book, 'Employee_Directory', main.EMP_HEADERS)
        emp.update(range_name='A1', values=[main.EMP_HEADERS,
            ['9000000001', 'Asha K', 'asha@u-next.com', '', '1', '2', '1', '', 'TL', 'M'],
            ['9000000002', 'Ravi P', 'ravi@u-next.com', '', '2', '2', '0', '', 'TL', 'M'],
            ['9000000003', 'Nodid X', 'nodid@u-next.com', '', '3', '2', '1', '', 'TL', 'M']])
        act = main.worksheet(book, 'Active_DIDs', main.DID_HEADERS)
        act.update(range_name='A1', values=[main.DID_HEADERS, ['8000000001', 'Asha K', '9000000001', 'Tata-57'], ['8000000002', 'Ravi P', '9000000002', 'Tata-57']])
        op = hdr('op@x.test')
        self.assertEqual(self.c.post('/api/requests/import', headers=op, json={'entries': ['9000000001'], 'comment': 'short'}).status_code, 422)
        r = self.c.post('/api/requests/import', headers=op, json={'entries': ['ASHA@u-next.com', '9000000002', '9000000003', '9111111111', 'nobody@u-next.com', '12345', 'asha@u-next.com'],
                                                                   'comment': 'Raised by TL Meena on WhatsApp, DID not working'})
        self.assertEqual(r.status_code, 200, r.text)
        out = r.json()
        self.assertEqual([c['agent_number'] for c in out['created']], ['9000000001'])
        reasons = {f['entry']: f['reason'] for f in out['failed']}
        self.assertIn('deactivated', reasons['9000000002'])
        self.assertIn('no active DID', reasons['9000000003'])
        self.assertIn('not found', reasons['9111111111'])
        self.assertIn('Email not found', reasons['nobody@u-next.com'])
        self.assertIn('valid 10-digit', reasons['12345'])
        self.assertIn('twice', reasons['asha@u-next.com'])
        # importing again: already open
        r2 = self.c.post('/api/requests/import', headers=op, json={'entries': ['9000000001'], 'comment': 'Second attempt by the same TL'}).json()
        self.assertIn('Already has an open request', r2['failed'][0]['reason'])
        reqs = self.c.get('/api/requests', headers=op).json()['items']
        self.assertEqual(reqs[0]['request_source'], 'import')
        tl = self.c.get(f"/api/requests/{reqs[0]['request_id']}/timeline", headers=op).json()
        self.assertTrue(any('WhatsApp' in str(e.get('detail')) for e in tl['events']))


if __name__ == '__main__':
    unittest.main()
