"""DEV ONLY: run the real backend against fake Google Sheets + fake MCube.

    python tools/dev-harness/run_dev.py          # backend on :5301, fake MCube on :5302

* Never uses real credentials and never contacts Google, MCube or Brevo.
* All data below is synthetic (made-up numbers and names); operator names match production.
* Login: admin@dev.local / PIN 2468 and operator@dev.local / PIN 1357. The OTP is printed to the
  console and written to tools/dev-harness/.last_otp (instead of being emailed).
"""
import asyncio, hashlib, json, os, random, sys, threading
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path[:0] = [str(HERE), str(ROOT)]

import fake_gspread  # noqa: E402
BOOK = fake_gspread.install()

def pin_hash(pin, salt='00112233445566778899aabbccddeeff', it=200000):
    return f"pbkdf2_sha256${it}${salt}${hashlib.pbkdf2_hmac('sha256', pin.encode(), bytes.fromhex(salt), it).hex()}"

from cryptography.fernet import Fernet  # noqa: E402
MCUBE_PORT = int(os.getenv('DEV_MCUBE_PORT', '5302'))
os.environ.update({
    'APP_ENV': 'development', 'SESSION_SECRET': 'dev-session-secret-' + 'x' * 32,
    'ADMIN_EMAIL': 'admin@dev.local', 'ADMIN_PIN_HASH': pin_hash('2468'),
    'OPERATOR_EMAIL': 'operator@dev.local', 'OPERATOR_PIN_HASH': pin_hash('1357'),
    'GOOGLE_SERVICE_ACCOUNT_JSON': '{}', 'GOOGLE_SHEET_ID': 'dev-fake-sheet',
    'MCUBE_BEARER_TOKEN': 'dev-token', 'MCUBE_BASE_URL': f'http://127.0.0.1:{MCUBE_PORT}',
    'MCUBE_CONFIG_BASE_URL': f'http://127.0.0.1:{MCUBE_PORT}',
    'MCUBE_CREDENTIAL_ENCRYPTION_KEY': Fernet.generate_key().decode(),
    'CRON_SYNC_SECRET': 'dev-cron-secret', 'MAINTENANCE_TOKEN': 'dev-maintenance-token',
    'SHEETS_SNAPSHOT_TTL_SECONDS': '0',
    # lets a separately hosted build (like the Render Static Site) call this backend, e.g. `vite preview --port 5197`
    'STATIC_FRONTEND_ORIGINS': os.getenv('DEV_STATIC_ORIGINS', 'http://localhost:5197,http://127.0.0.1:5197'),
})

# ---- synthetic data -------------------------------------------------------------
rnd = random.Random(86)
OPS = [('Vodafone/Idea', 14), ('opensips-vodafone63', 12), ('opensips-sify2', 7), ('Tata-57', 4), ('opensips-jio5', 3), ('opensips-tata13', 2), ('Tata-59', 2)]
FIRST = ['Asha', 'Ravi', 'Meena', 'Kiran', 'Sunil', 'Divya', 'Farhan', 'Lakshmi', 'Nikhil', 'Pooja', 'Rahul', 'Sana', 'Tarun', 'Usha', 'Vikas', 'Zoya']
used = set()
def num(prefix):
    while True:
        n = prefix + ''.join(rnd.choice('0123456789') for _ in range(10 - len(prefix)))
        if n not in used: used.add(n); return n

employees, active, inactive, pool = [], [], [], []
for op, n in OPS:
    for _ in range(n):
        phone = num('9')
        name = f'BLR.{rnd.choice(FIRST)} {rnd.choice("ABCDEFGHKMNPRS")}'
        employees.append({'emp_phone': phone, 'emp_name': name, 'emp_email': name.split('.')[1].lower().replace(' ', '.') + '@example.test', 'role': rnd.choice([2, 3, 4]), 'status': 1, 'agent_id': len(employees) + 1})
        active.append({'did_no': num('80718'), 'agent_name': name, 'agent_no': phone, 'operator': op})
    for _ in range(max(1, n // 3)): active.append({'did_no': num('80718'), 'agent_name': 'common pool', 'agent_no': '', 'operator': op})
    for _ in range(max(2, n)): inactive.append({'did_no': num('80718'), 'agent_name': '', 'agent_no': '', 'operator': op})
for k in range(12): pool.append({'did_no': num('80714'), 'agent_name': '', 'agent_no': '', 'operator': 'Vodafone/Idea' if k < 9 else 'opensips-sify2'})
employees.append({'emp_phone': num('9'), 'emp_name': 'Dev Admin', 'emp_email': 'admin@dev.local', 'role': 1, 'status': 1, 'agent_id': 999})

import fake_mcube  # noqa: E402
fake_mcube.seed({'active': active, 'inactive': inactive, 'pool': pool, 'employees': employees, 'calls': []})

def ws(title, header, rows=()):
    sheet = BOOK.add_worksheet(title=title, cols=max(12, len(header)))
    sheet.update(range_name='A1', values=[header] + [list(map(str, r)) for r in rows])

IST = timezone(timedelta(hours=5, minutes=30))
def ist(dt): return dt.astimezone(IST).isoformat(timespec='seconds')
now = datetime.now(timezone.utc)

from backend import workflows as W  # noqa: E402  (real header definitions)
from backend import main as M  # noqa: E402

ws('Active_DIDs', M.DID_HEADERS, [[r['did_no'], r['agent_name'], r['agent_no'], r['operator']] for r in active])
ws('Inactive_DIDs', M.DID_HEADERS, [[r['did_no'], '', '', r['operator']] for r in inactive])
ws('DID_Pool_FIFO', M.FIFO_HEADERS, [[i + 1, r['did_no'], r['operator'], 'yes', ist(now - timedelta(hours=3))] for i, r in enumerate(pool)])
ws('Sync_Status', ['last_sync_utc', 'active', 'inactive', 'pool'], [[ist(now - timedelta(hours=3)), len(active), len(inactive), len(pool)]])
ws('Employee_Directory', W.EMP_HEADERS, [[e['emp_phone'], e['emp_name'], e['emp_email'], ist(now - timedelta(days=1)), e['agent_id'], e['role'], 1, '', 'TL ' + e['emp_name'][-1], 'Manager ' + str(e['role'])] for e in employees])
ws('App_Settings', W.SETTINGS_HEADERS, [[k, json.dumps(v)] for k, v in {**W.DEFAULTS, 'auto_inventory_minutes': 5, 'auto_calls_minutes': 5, 'recent_replacement_days': 1}.items()])

# history: a few verified replacements over the last week (old DID now inactive, new DID now active)
logs, reqs = [], []
agents = [r for r in active if r['agent_no']]
for k in range(6):
    a = agents[k]; old = inactive[k]['did_no']; t = now - timedelta(days=k, hours=2 + k)
    b = f'dev-batch-{k}'
    for i, (ev, res) in enumerate([('BATCH_REQUESTED', 'PENDING'), ('BATCH_VALIDATED', 'OK'), ('DEACTIVATION_STARTED', 'PENDING'), ('DEACTIVATED', 'SUCCESS'), ('ACTIVATION_STARTED', 'PENDING'), ('ACTIVATED', 'SUCCESS'), ('REASSIGNMENT_COMPLETE', 'SUCCESS'), ('BATCH_COMPLETE', 'SUCCESS')]):
        o, nw = ('', '') if ev.startswith('BATCH') else (old, a['did_no'])
        logs.append([ist(t + timedelta(seconds=i * 3)), b, ev, o, nw, '' if ev.startswith('BATCH') else a['agent_no'], '' if ev.startswith('BATCH') else a['agent_name'], res, ''])
    rid = f'0000000{k}-dev0-4000-8000-00000000000{k}'
    reqs.append({**dict.fromkeys(W.REQUEST_HEADERS, ''), 'request_id': rid, 'callto': a['agent_no'], 'agent_number': a['agent_no'], 'agent_name': a['agent_name'], 'current_did': old,
                 'first_call_utc': ist(t - timedelta(hours=1)), 'last_call_utc': ist(t - timedelta(hours=1)), 'call_count': 1, 'status': 'completed', 'recent_warning': 'no', 'reminder_count': 0,
                 'replacement_batch': b, 'replacement_new_did': a['did_no'], 'completed_utc': ist(t)})
# open requests in different states
for k, status in enumerate(['pending', 'pending', 'approved', 'review_required', 'rejected', 'pending']):
    a = agents[10 + k]
    rid = f'1000000{k}-dev0-4000-8000-00000000000{k}'
    reqs.append({**dict.fromkeys(W.REQUEST_HEADERS, ''), 'request_id': rid, 'callto': a['agent_no'], 'agent_number': a['agent_no'], 'agent_name': a['agent_name'], 'current_did': a['did_no'],
                 'first_call_utc': ist(now - timedelta(hours=2 + k * 3)), 'last_call_utc': ist(now - timedelta(hours=1 + k)), 'call_count': 1 + k % 3, 'status': status,
                 'recent_warning': 'yes' if status == 'review_required' else 'no', 'reminder_count': 0})
ws('Change_Logs', M.LOG_HEADERS, logs)
ws('Pending_Requests', W.REQUEST_HEADERS, [[r[h] for h in W.REQUEST_HEADERS] for r in reqs])
ws('Sync_Jobs', M.SYNC_JOB_HEADERS, [[j, ist(now - timedelta(hours=3)), ist(now - timedelta(hours=3)), 'success', 'ok'] for j in ('calls', 'inventory', 'employees', 'recovery')])
for title, header in [('Operation_Queue', M.QUEUE_HEADERS), ('Call_Request_Events', W.CALL_HEADERS), ('Ticket_Events', W.TICKET_EVENT_HEADERS), ('Notification_Logs', W.NOTIFY_HEADERS),
                      ('Workflow_Sync', W.SYNC_HEADERS), ('Settings_Audit_Log', W.SETTING_LOG_HEADERS), ('User_Activity_Logs', M.ACCESS_HEADERS), ('Agent_Replacement_History', M.AGENT_HISTORY_HEADERS),
                      ('Request_Mutations', W.REQUEST_MUTATION_HEADERS), ('Public_Request_Events', M.PUBLIC_REQUEST_EVENTS)]:
    ws(title, header)

from backend import mcube_config_auth  # noqa: E402
mcube_config_auth.save(M, 'dev-user', 'dev-password')

# OTP goes to the console / a local file instead of email
OTP_FILE = HERE / '.last_otp'
async def fake_send(to, subject, body):
    code = ''.join(ch for ch in body if ch.isdigit())[:6]
    OTP_FILE.write_text(json.dumps({'email': to, 'otp': code}))
    print(f'[dev] OTP for {to}: {code}', flush=True)
    return {'message_id': 'dev'}
from backend import brevo  # noqa: E402
brevo.send_brevo = fake_send

if __name__ == '__main__':
    import uvicorn
    port = int(os.getenv('DEV_BACKEND_PORT', '5301'))
    threading.Thread(target=lambda: uvicorn.run(fake_mcube.app, host='127.0.0.1', port=MCUBE_PORT, log_level='warning'), daemon=True).start()
    print(f'[dev] fake MCube on :{MCUBE_PORT}; backend on :{port}', flush=True)
    uvicorn.run(M.app, host='127.0.0.1', port=port, log_level='warning')
