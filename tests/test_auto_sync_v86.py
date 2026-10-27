"""v86: scheduled sync follows the intervals configured in the UI (App_Settings)."""
import asyncio, os, unittest
from datetime import datetime, timezone, timedelta
from unittest import mock

os.environ.setdefault('CRON_SYNC_SECRET', 'test-secret')
from fastapi.testclient import TestClient
from backend import main

UTC = timezone.utc
def ago(minutes): return (datetime.now(UTC) - timedelta(minutes=minutes)).isoformat()

class IntervalTests(unittest.TestCase):
    def test_ui_settings_override_defaults(self):
        got = main.job_intervals({'auto_calls_minutes': 7, 'auto_inventory_minutes': 10, 'auto_employee_minutes': 1440})
        self.assertEqual(got, {'calls': 7, 'inventory': 10, 'employees': 1440, 'recovery': 15})

    def test_missing_or_bad_values_fall_back(self):
        got = main.job_intervals({'auto_calls_minutes': 'x', 'auto_inventory_minutes': None})
        self.assertEqual(got, main.SYNC_INTERVALS)

    def test_floors_protect_quotas(self):
        got = main.job_intervals({'auto_calls_minutes': 1, 'auto_inventory_minutes': 1, 'auto_employee_minutes': 1})
        self.assertEqual((got['calls'], got['inventory'], got['employees']), (2, 5, 30))

    def test_pick_most_overdue(self):
        rows = [{'job': 'calls', 'last_success_utc': ago(3)}, {'job': 'inventory', 'last_success_utc': ago(30)},
                {'job': 'employees', 'last_success_utc': ago(10)}, {'job': 'recovery', 'last_success_utc': ago(1)}]
        iv = {'calls': 5, 'inventory': 5, 'employees': 1440, 'recovery': 15}
        self.assertEqual(main.pick_due_job(rows, iv), 'inventory')
        self.assertIsNone(main.pick_due_job(rows, {**iv, 'inventory': 60}))

    def test_never_run_job_goes_first(self):
        rows = [{'job': 'inventory', 'last_success_utc': ago(500)}]
        self.assertEqual(main.pick_due_job(rows, {'inventory': 5, 'history': 60}), 'history')

    def test_latest_row_wins(self):
        # Sync_Jobs is append-only; a later 'running' row still carries the previous success
        rows = [{'job': 'inventory', 'last_success_utc': ago(90)}, {'job': 'inventory', 'last_success_utc': ago(2), 'status': 'running'}]
        self.assertIsNone(main.pick_due_job(rows, {'inventory': 5}))

class AutoEndpointTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.ist_noon = datetime(2026, 10, 26, 12, 0, tzinfo=main.IST)

    def test_requires_cron_secret(self):
        self.assertEqual(self.client.post('/api/jobs/sync/auto').status_code, 401)
        self.assertEqual(self.client.post('/api/jobs/sync/auto', headers={'X-Cron-Secret': 'wrong'}).status_code, 401)

    def test_auto_is_not_treated_as_a_job_name(self):
        started = []
        with mock.patch.object(main, 'datetime', wraps=datetime) as dt, \
             mock.patch.object(main.work, 'settings', return_value={'auto_calls_minutes': 5, 'auto_inventory_minutes': 5, 'auto_employee_minutes': 1440}), \
             mock.patch.object(main.work, 'read', return_value=[{'job': j, 'last_success_utc': (self.ist_noon - timedelta(minutes=1)).isoformat()} for j in ('calls', 'employees', 'recovery', 'history')] + [{'job': 'inventory', 'last_success_utc': (self.ist_noon - timedelta(minutes=20)).isoformat()}]), \
             mock.patch.object(main, '_start_split', side_effect=lambda job: started.append(job) or {'status': 'accepted', 'job': job}):
            dt.now.side_effect = lambda tz=None: self.ist_noon.astimezone(tz) if tz else self.ist_noon
            r = self.client.post('/api/jobs/sync/auto', headers={'X-Cron-Secret': 'test-secret'})
        self.assertEqual(r.status_code, 200, r.text)
        self.assertEqual(started, ['inventory'])

    def test_idle_when_nothing_due(self):
        with mock.patch.object(main, 'datetime', wraps=datetime) as dt, \
             mock.patch.object(main.work, 'settings', return_value={}), \
             mock.patch.object(main.work, 'read', return_value=[{'job': j, 'last_success_utc': self.ist_noon.isoformat()} for j in ('calls', 'inventory', 'employees', 'recovery', 'history')]):
            dt.now.side_effect = lambda tz=None: self.ist_noon.astimezone(tz) if tz else self.ist_noon
            r = self.client.post('/api/jobs/sync/auto', headers={'X-Cron-Secret': 'test-secret'})
        self.assertEqual(r.json()['status'], 'idle')

    def test_outside_business_hours(self):
        late = datetime(2026, 10, 26, 23, 45, tzinfo=main.IST)
        with mock.patch.object(main, 'datetime', wraps=datetime) as dt:
            dt.now.side_effect = lambda tz=None: late.astimezone(tz) if tz else late
            r = self.client.post('/api/jobs/sync/auto', headers={'X-Cron-Secret': 'test-secret'})
        self.assertEqual(r.json()['status'], 'outside_business_hours')

if __name__ == '__main__': unittest.main()
