"""DEV ONLY: fake MCube API with in-memory DIDs, employees and inbound calls.

Endpoints mirror what backend/main.py and backend/workflows.py call:
  POST /get-did-list      {"did": "active"|"inactive"|"pool"}
  POST /get-onetoone-did  {"agent_number", "did_no", "status": "deactivate"|"activate"}
  POST /outbound-calls    notification calls
  POST /login, /emp-filter, /filter-inbound   (MCube config API)
  POST /_control          test hooks: {'fail': 'activate'|'deactivate'} rejects the next call,
                          {'fail': 'deactivate-error'} returns HTTP 500 (uncertain outcome); {'call': {...}} adds a call
"""
import json, time
from datetime import datetime, timezone
from fastapi import FastAPI, Request

app = FastAPI()
STATE = {'active': [], 'inactive': [], 'pool': [], 'employees': [], 'calls': [], 'fail': set(), 'log': []}


def seed(state):
    STATE.update({k: v for k, v in state.items()})
    STATE['fail'] = set()
    STATE['log'] = []


async def body(req: Request):
    raw = await req.body()
    try: return json.loads(raw or b'{}')
    except ValueError: return {}


@app.post('/get-did-list')
async def did_list(req: Request):
    b = await body(req)
    cat = str(b.get('did', ''))
    if cat not in ('active', 'inactive', 'pool'): return {'status': False, 'msg': 'Invalid category'}
    return {'status': True, 'data': [dict(r) for r in STATE[cat]]}


@app.post('/get-onetoone-did')
async def one_to_one(req: Request):
    b = await body(req)
    did, agent, op = str(b.get('did_no')), str(b.get('agent_number')), b.get('status')
    STATE['log'].append({'t': time.time(), 'did': did, 'agent': agent, 'op': op})
    if op in STATE['fail']:
        STATE['fail'].discard(op)
        return {'status': False, 'msg': f'Simulated MCube {op} rejection'}
    if f'{op}-error' in STATE['fail']:
        STATE['fail'].discard(f'{op}-error')
        from fastapi.responses import JSONResponse
        return JSONResponse(status_code=500, content={'error': 'simulated MCube outage'})
    if op == 'deactivate':
        row = next((r for r in STATE['active'] if r['did_no'] == did and r['agent_no'] == agent), None)
        if not row: return {'status': False, 'msg': 'DID not mapped to this agent'}
        STATE['active'].remove(row)
        STATE['inactive'].append({'did_no': did, 'agent_name': '', 'agent_no': '', 'operator': row['operator']})
        return {'status': True, 'msg': 'DID disabled successfully'}
    if op == 'activate':
        row = next((r for r in STATE['pool'] if r['did_no'] == did), None)
        if not row: return {'status': False, 'msg': 'DID not available'}
        emp = next((e for e in STATE['employees'] if e['emp_phone'] == agent), {})
        STATE['pool'].remove(row)
        STATE['active'].append({'did_no': did, 'agent_name': emp.get('emp_name', ''), 'agent_no': agent, 'operator': row['operator']})
        return {'status': True, 'msg': 'DID mapped with the agent'}
    return {'status': False, 'msg': 'Unknown status'}


@app.post('/outbound-calls')
async def outbound(req: Request):
    return {'status': 'succ', 'callid': f'OUT{int(time.time())}'}


@app.post('/login')
async def login(req: Request):
    return {'status': 'success', 'data': {'token': 'dev-config-token-0123456789'}}


@app.post('/emp-filter')
async def emp_filter(req: Request):
    b = await body(req)
    role = str((b.get('search_val') or [''])[0])
    return {'employees': [e for e in STATE['employees'] if str(e.get('role')) == role]}


@app.post('/filter-inbound')
async def filter_inbound(req: Request):
    b = await body(req)
    off, lim = int(b.get('offset', 0)), int(b.get('limit', 30))
    return {'status': 'success', 'clicktocall': STATE['calls'][off:off + lim]}


@app.post('/_control')
async def control(req: Request):
    b = await body(req)
    if b.get('fail'): STATE['fail'].add(b['fail'])
    if b.get('call'):
        now = datetime.now(timezone.utc).isoformat(timespec='seconds')
        c = {'callid': str(b['call'].get('callid') or int(time.time() * 1000)), 'callto': b['call']['callto'], 'dialstatus': 'cancel',
             'direction': 'inbound', 'starttime': now, 'endtime': now, 'clicktocalldid': b['call'].get('did', '8071439545')}
        STATE['calls'].insert(0, c)
    return {'ok': True, 'fail': sorted(STATE['fail']), 'calls': len(STATE['calls']), 'log': STATE['log'][-10:]}
