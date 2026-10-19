"""MCube DID replacement: sequential, fail-closed, Sheets-journaled operations."""
import asyncio, json, logging, os, uuid, time, hmac, hashlib, secrets, base64, threading, random
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal
import httpx
from fastapi import FastAPI, Depends, Header, HTTPException
from .workflows import Workflows, SettingsUpdate, QueueBatch, Review
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

log = logging.getLogger('mcube')
app = FastAPI(title='MCube DID Manager', docs_url=None if os.getenv('APP_ENV') == 'production' else '/docs')
BASE = Path(__file__).resolve().parent.parent / 'frontend' / 'dist'
MCUBE = os.getenv('MCUBE_BASE_URL', 'https://api.mcube.com/Restmcube-api').rstrip('/')
from .operation_lock import OperationLock
lock = OperationLock()
state = {'running': False, 'batch_id': None, 'done': 0, 'total': 0, 'results': [], 'error': None}

class BatchRequest(BaseModel):
    dids: list[str] = Field(min_length=1, max_length=2000)

# Email OTP + PIN authentication. Secrets never sent to the browser.
# OTP challenges are intentionally memory-only; restarting the service invalidates them.
OTP_CHALLENGES = {}
OTP_RATE = {}

def _sign(payload: dict) -> str:
    raw=base64.urlsafe_b64encode(json.dumps(payload,separators=(',',':')).encode()).decode().rstrip('=')
    mac=hmac.new(os.environ['SESSION_SECRET'].encode(),raw.encode(),hashlib.sha256).hexdigest()
    return raw+'.'+mac

def _verify(token: str) -> dict:
    try:
        raw,mac=token.rsplit('.',1)
        correct=hmac.new(os.environ['SESSION_SECRET'].encode(),raw.encode(),hashlib.sha256).hexdigest()
        if not hmac.compare_digest(correct,mac):raise ValueError()
        obj=json.loads(base64.urlsafe_b64decode(raw+'='*(-len(raw)%4)))
        if int(obj['exp']) < time.time() or obj.get('kind')!='session':raise ValueError()
        return obj
    except (ValueError,KeyError,TypeError):raise HTTPException(401,'Session expired or invalid')

def _pin_ok(pin: str, role: str, pin_hash: str | None = None) -> bool:
    # Hash format: pbkdf2_sha256$iterations$salt_hex$digest_hex
    record=pin_hash if pin_hash is not None else os.getenv('ADMIN_PIN_HASH' if role=='admin' else 'OPERATOR_PIN_HASH','')
    try:
        algorithm,iterations,salt,digest=record.split('$')
        if algorithm!='pbkdf2_sha256' or int(iterations)<200000:return False
        result=hashlib.pbkdf2_hmac('sha256',pin.encode(),bytes.fromhex(salt),int(iterations))
        return hmac.compare_digest(result,bytes.fromhex(digest))
    except (ValueError,TypeError):return False

class LoginStart(BaseModel):
    email: str
    pin: str

class LoginVerify(BaseModel):
    challenge_id: str
    otp: str

@app.post('/api/auth/start')
async def login_start(payload: LoginStart):
    email=payload.email.strip().lower()
    roles={os.getenv('ADMIN_EMAIL','').strip().lower():'admin',os.getenv('OPERATOR_EMAIL','').strip().lower():'operator'}
    roles.pop('',None)
    role=roles.get(email)
    user_hash=None
    # Additional operators have distinct identities and PINs. Never share operator credentials.
    if not role:
        try:
            operator_users=json.loads(os.getenv('OPERATOR_USERS_JSON','[]'))
            if not isinstance(operator_users,list): raise ValueError()
            for entry in operator_users:
                if str(entry.get('email','')).strip().lower()==email:
                    role='operator';user_hash=str(entry.get('pin_hash',''));break
        except (ValueError,TypeError,AttributeError):
            raise HTTPException(503,'Invalid OPERATOR_USERS_JSON configuration')
    # Throttle attempts before validating the PIN to limit guessing.
    now=time.time(); recent=[t for t in OTP_RATE.get(email,[]) if now-t<900]
    if len(recent)>=5:raise HTTPException(429,'Too many attempts; try later')
    recent.append(now);OTP_RATE[email]=recent
    if not role or not _pin_ok(payload.pin,role,user_hash):raise HTTPException(401,'Invalid login details')
    if not os.getenv('SESSION_SECRET') or len(os.environ['SESSION_SECRET'])<32:
        raise HTTPException(503,'SESSION_SECRET must be configured')
    challenge=secrets.token_urlsafe(24);otp=f'{secrets.randbelow(1000000):06d}'
    OTP_CHALLENGES[challenge]={'email':email,'role':role,'digest':hashlib.sha256((challenge+otp).encode()).hexdigest(),'expires':now+300,'attempts':0}
    try:
        from .brevo import send_brevo
        await send_brevo(email,'MCube DID Manager login code',f'Your one-time login code is {otp}. It expires in 5 minutes. Do not share this code.')
    except Exception:
        OTP_CHALLENGES.pop(challenge,None)
        raise HTTPException(503,'Unable to send OTP. Check Brevo configuration.')
    return {'challenge_id':challenge,'expires_in':300}

@app.post('/api/auth/verify')
async def login_verify(payload: LoginVerify):
    record=OTP_CHALLENGES.get(payload.challenge_id)
    if not record or time.time()>record['expires']:
        OTP_CHALLENGES.pop(payload.challenge_id,None)
        raise HTTPException(401,'OTP expired or invalid')
    record['attempts']+=1
    if record['attempts']>5:
        OTP_CHALLENGES.pop(payload.challenge_id,None)
        raise HTTPException(429,'Too many OTP attempts')
    actual=hashlib.sha256((payload.challenge_id+payload.otp).encode()).hexdigest()
    if not hmac.compare_digest(actual,record['digest']):raise HTTPException(401,'Invalid OTP')
    OTP_CHALLENGES.pop(payload.challenge_id,None)
    return {'token':_sign({'kind':'session','role':record['role'],'email':record['email'],'exp':int(time.time()+8*3600)}),'role':record['role'],'expires_in':28800}

async def auth(authorization: str | None = Header(None)):
    supplied=(authorization or '').removeprefix('Bearer ').strip()
    if not supplied:raise HTTPException(401,'Login required')
    return _verify(supplied)['role']

async def admin_only(role=Depends(auth)):
    if role!='admin':raise HTTPException(403,'Administrator permission required')
    return role

# Quota-aware Sheets access. Caches only non-authoritative inventory snapshots.
# NEVER cache Operation_Queue, Change_Logs, approvals or safety checks.
_sheet_local = threading.local()
_snapshot_cache = {}
_snapshot_cache_lock = threading.RLock()
SNAPSHOT_TTL = max(0, min(30, int(os.getenv('SHEETS_SNAPSHOT_TTL_SECONDS','10'))))
SNAPSHOT_TABS = {'Active_DIDs','Inactive_DIDs','DID_Pool_FIFO','Sync_Status'}

def _quota_call(fn):
    """Bounded retries for 429/5xx; never retry non-idempotent appends blindly."""
    for attempt in range(4):
        try: return fn()
        except Exception as exc:
            status=getattr(getattr(exc,'response',None),'status_code',None)
            if status not in (429,500,502,503,504) or attempt==3: raise
            time.sleep(min(8, (2**attempt)+random.uniform(0,.3)))

def sheet():
    """Reuse gspread client per thread to avoid repeated auth and spreadsheet metadata calls."""
    import gspread
    raw, key = os.getenv('GOOGLE_SERVICE_ACCOUNT_JSON'), os.getenv('GOOGLE_SHEET_ID')
    if not raw or not key:
        raise HTTPException(503,'Google Sheets logging is not configured; changes are disabled')
    cached=getattr(_sheet_local,'book',None)
    if cached is None:
        cached=_quota_call(lambda: gspread.service_account_from_dict(json.loads(raw)).open_by_key(key))
        _sheet_local.book=cached
        _sheet_local.worksheets={}
    return cached

def worksheet(book, title, headers):
    handles=getattr(_sheet_local,'worksheets',None)
    if handles is not None and title in handles:return handles[title]
    import gspread
    try: ws=_quota_call(lambda: book.worksheet(title))
    except gspread.WorksheetNotFound:
        # Initialization is only safe with a single process and one worker.
        ws=_quota_call(lambda: book.add_worksheet(title=title,rows=3000,cols=max(12,len(headers))))
        _quota_call(lambda: ws.update(range_name='A1',values=[headers],value_input_option='RAW'))
    if handles is not None:handles[title]=ws
    return ws

def invalidate_snapshots(*names):
    with _snapshot_cache_lock:
        for name in names:_snapshot_cache.pop(name,None)

LOG_HEADERS = ['time_utc','batch_id','event','old_did','new_did','agent_number','agent_name','result','details']
FIFO_HEADERS = ['fifo_position','did_no','operator','available','snapshot_utc']
DID_HEADERS = ['did_no','agent_name','agent_no','operator']

def append_event(batch, event, old='', new='', agent='', name='', result='', details=''):
    ws = worksheet(sheet(), 'Change_Logs', LOG_HEADERS)
    ws.append_row([datetime.now(timezone.utc).isoformat(),batch,event,old,new,agent,name,result,str(details)[:1000]], value_input_option='RAW')

def get_rows(name, headers):
    return _quota_call(lambda: worksheet(sheet(),name,headers).get_all_records())

# Durable fail-closed recovery gate. Google Sheets is a journal, NOT a lock.
# A crash between MCube calls leaves an unfinished batch, blocking new replacements.
def recovery_status():
    rows=get_rows('Change_Logs',LOG_HEADERS)
    batches={}
    for row in rows:
        bid=str(row.get('batch_id','')).strip()
        if not bid: continue
        event=str(row.get('event',''))
        if event=='BATCH_REQUESTED': batches[bid]={'batch_id':bid,'started':row.get('time_utc',''),'last_event':event,'closed':False}
        elif bid in batches:
            batches[bid]['last_event']=event
            if event in ('BATCH_COMPLETE','RECOVERY_ACKNOWLEDGED'):
                batches[bid]['closed']=True
    return [x for x in batches.values() if not x['closed']]

async def require_reconciled():
    try: unresolved=await asyncio.to_thread(recovery_status)
    except Exception: raise HTTPException(503,'Cannot verify replacement journal; DID changes disabled')
    if unresolved:
        raise HTTPException(409,{'message':'Unresolved DID replacement; administrator must verify MCube and acknowledge recovery before continuing','batches':unresolved[-10:]})

class RecoveryAcknowledgement(BaseModel):
    batch_id: str
    confirmation: Literal['I_VERIFIED_MCUBE_AND_RESOLVED_THE_BATCH']
    note: str = Field(min_length=12,max_length=500)

@app.get('/api/recovery',dependencies=[Depends(auth)])
async def get_recovery():
    return {'unresolved':await asyncio.to_thread(recovery_status)}

@app.post('/api/recovery/acknowledge')
async def acknowledge_recovery(body:RecoveryAcknowledgement,role=Depends(admin_only)):
    async with lock:
        unresolved=await asyncio.to_thread(recovery_status)
        if body.batch_id not in {x['batch_id'] for x in unresolved}:
            raise HTTPException(404,'Unresolved batch not found')
        # Admin must independently verify DID state and correct request statuses.
        await asyncio.to_thread(append_event,body.batch_id,'RECOVERY_ACKNOWLEDGED',result='MANUAL_REVIEW',details=body.note)
        # Close only queue items tied to the reconciled batch, never retry them.
        for q in await asyncio.to_thread(queue_snapshot):
            if q['status']=='processing':
                await asyncio.to_thread(queue_append,q['queue_id'],'NEEDS_RECONCILIATION',details='Admin acknowledged batch '+body.batch_id)
        return {'ok':True,'batch_id':body.batch_id}

def replace_rows(name, headers, rows):
    ws = worksheet(sheet(), name, headers)
    # Clear stale rows before updating; do not retry either write blindly.
    ws.clear()
    ws.update(range_name='A1',values=[headers]+rows,value_input_option='RAW')
    invalidate_snapshots(name,'inventory')

def token_headers():
    token = os.getenv('MCUBE_BEARER_TOKEN','').removeprefix('Bearer ').strip()
    if not token: raise HTTPException(503, 'MCube token not configured')
    return {'Authorization':f'Bearer {token}','Content-Type':'application/json'}

async def mcube(client, endpoint, payload):
    try:
        r = await client.post(f'{MCUBE}/{endpoint}',json=payload,headers=token_headers())
        r.raise_for_status()
        data = r.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise RuntimeError(f'MCube request failed or response uncertain: {type(exc).__name__}') from exc
    if not isinstance(data, (dict,list)):
        raise RuntimeError('Invalid MCube response')
    return data

def records(data):
    """Strict DID response parsing. Never turn unknown payloads into an empty inventory."""
    if isinstance(data, list): return data
    if not isinstance(data, dict): raise RuntimeError('MCube listing returned an unsupported response')
    status=str(data.get('status','')).lower()
    if status in ('false','fail','failed','error','0'):
        raise RuntimeError('MCube rejected DID listing; verify bearer token and API permissions')
    for key in ('did_no','data','result','items','Resource','records','dids','did_list','didList','DIDList'):
        value=data.get(key)
        if isinstance(value,list):return value
        if isinstance(value,dict):
            for nested in ('data','items','records','did_no','dids','result'):
                if isinstance(value.get(nested),list):return value[nested]
    # Some MCube endpoints return a single DID object; do not accept unrelated objects.
    if any(k in data for k in ('did_no','did')) and not isinstance(data.get('did_no'),list):
        return [data]
    safe_keys=','.join(sorted(str(k) for k in data.keys())[:12])
    raise RuntimeError(f'MCube DID listing schema not recognized (response keys: {safe_keys}). Check Render logs; no changes were made.')

async def fetch_lists(client):
    result={}
    for category in ('active','inactive','pool'):
        try:
            raw=records(await mcube(client,'get-did-list',{'did':category}))
        except Exception as exc:
            raise RuntimeError(f'{category} DID listing failed: {exc}') from exc
        items=[]
        for x in raw:
            if isinstance(x,str): x={'did_no':x}
            if not isinstance(x,dict): continue
            did=str(x.get('did_no') or x.get('did') or '').strip()
            if not did: continue
            items.append({'did':did,'agent':str(x.get('agent_name') or x.get('Agent_Name') or ''),'agent_number':str(x.get('agent_no') or x.get('agent_number') or ''),'operator':str(x.get('operator') or ''),'status':category})
        # Inventory is observational: preserve every MCube row, including duplicates.
        # Never block a read-only sync for inconsistent MCube inventory.
        counts = {}
        for item in items:
            counts[item['did']] = counts.get(item['did'], 0) + 1
        duplicates = sum(n - 1 for n in counts.values() if n > 1)
        if duplicates:
            log.warning('MCube %s listing contains %d repeated DID rows (preserved)', category, duplicates)
        result[category] = items
    return result

async def snapshot(lists):
    """Commit inventory after all three fetches have succeeded; preserve FIFO unless membership changes."""
    old=get_rows('DID_Pool_FIFO',FIFO_HEADERS)
    old_order=[str(r['did_no']) for r in old if str(r.get('did_no','')).strip()]
    fresh=[r['did'] for r in lists['pool']]
    if set(old_order)==set(fresh) and len(old_order)==len(fresh):
        order=old_order
    else:
        order=fresh  # MCube's latest returned order becomes new FIFO when pool membership changes
    lookup={r['did']:r for r in lists['pool']}
    stamp=datetime.now(timezone.utc).isoformat()
    # Persist FIFO before the other display-only snapshots.
    replace_rows('DID_Pool_FIFO',FIFO_HEADERS,[[i+1,d,lookup[d]['operator'],'yes',stamp] for i,d in enumerate(order)])
    for cat,title in [('active','Active_DIDs'),('inactive','Inactive_DIDs')]:
        replace_rows(title,DID_HEADERS,[[r['did'],r['agent'],r['agent_number'],r['operator']] for r in lists[cat]])
    replace_rows('Sync_Status',['last_sync_utc','active','inactive','pool'],[[stamp,len(lists['active']),len(lists['inactive']),len(lists['pool'])]])
    return order

import sys
work=Workflows(sys.modules[__name__])

@app.get('/api/me',dependencies=[Depends(auth)])
async def me(role=Depends(auth)):return {'role':role}

@app.get('/api/settings',dependencies=[Depends(auth)])
async def get_settings(role=Depends(auth)):
    if role!='admin':raise HTTPException(403,'Administrator permission required')
    try:
        return {'settings':await asyncio.to_thread(work.settings),'version':await asyncio.to_thread(work.settings_version)}
    except HTTPException:
        raise
    except Exception as exc:
        log.exception('Settings read failed')
        raise HTTPException(503, 'Unable to read Google Sheets settings; inspect Render logs') from exc

@app.put('/api/settings')
async def save_settings(payload:SettingsUpdate,role=Depends(admin_only)):
    if lock.locked():raise HTTPException(409,'Batch or sync in progress')
    async with lock:
        try:
            return await asyncio.to_thread(work.save_settings,payload.settings,role,payload.version)
        except HTTPException:
            raise
        except Exception as exc:
            log.exception('Settings save failed')
            raise HTTPException(503, 'Unable to save and verify Google Sheets settings; inspect Render logs') from exc

@app.get('/api/settings/history')
async def settings_history(role=Depends(admin_only)):
    from .workflows import SETTING_LOG_HEADERS
    return {'items':(await asyncio.to_thread(work.read,'Settings_Audit_Log',SETTING_LOG_HEADERS))[-200:]}

@app.get('/api/requests',dependencies=[Depends(auth)])
async def get_requests():return {'items':await asyncio.to_thread(work.requests)}

@app.post('/api/requests/sync',dependencies=[Depends(auth)])
async def sync_requests():
    if lock.locked():raise HTTPException(409,'Another operation is in progress')
    async with lock:
        try:return await work.sync_calls()
        except HTTPException:raise
        except Exception as exc:
            log.exception('Call sync failed');raise HTTPException(502,f'Call sync failed: {type(exc).__name__}')

@app.post('/api/employees/sync')
async def sync_employees(role=Depends(admin_only)):
    if lock.locked():raise HTTPException(409,'Another operation is in progress')
    async with lock:
        try:return await work.fetch_employee_directory()
        except Exception as exc:
            log.exception('Employee sync failed');raise HTTPException(502,f'Employee sync failed: {type(exc).__name__}')

async def maintenance_auth(authorization: str | None = Header(None)):
    token=(authorization or '').removeprefix('Bearer ').strip()
    expected=os.getenv('MAINTENANCE_TOKEN','')
    if not expected or not hmac.compare_digest(token,expected):
        raise HTTPException(401,'Unauthorized maintenance request')
    return True

@app.post('/api/maintenance/tick')
async def maintenance_tick(authorized=Depends(maintenance_auth)):
    """Optional GitHub Actions hourly tick. Failures do not suppress other tasks."""
    if lock.locked():raise HTTPException(409,'Another operation is in progress')
    result={}
    async with lock:
        try:
            cfg=await asyncio.to_thread(work.settings)
            stamp=await asyncio.to_thread(work.get_sync,'employee_sync')
            from datetime import timedelta
            due=not stamp
            if stamp:
                try:due=datetime.now(timezone.utc)-datetime.fromisoformat(stamp.replace('Z','+00:00'))>=timedelta(hours=int(cfg['employee_refresh_hours']))
                except Exception:due=True
            if due:
                try:result['employees']=await work.fetch_employee_directory()
                except Exception as exc:result['employees_error']=type(exc).__name__
            try:result['calls']=await work.sync_calls()
            except Exception as exc:result['calls_error']=type(exc).__name__
            try:result['reminders']=await work.due_reminders()
            except Exception as exc:result['reminders_error']=type(exc).__name__
        except Exception as exc:
            log.exception('Maintenance failed');raise HTTPException(502,type(exc).__name__)
    return result

@app.post('/api/reminders/run',dependencies=[Depends(auth)])
async def run_reminders():
    if lock.locked():raise HTTPException(409,'Another operation is in progress')
    async with lock:return await work.due_reminders()

@app.post('/api/requests/{request_id}/review')
async def review_request(request_id:str,body:Review,role=Depends(admin_only)):
    if lock.locked():raise HTTPException(409,'Another operation is in progress')
    async with lock:return await asyncio.to_thread(work.review,request_id,body.approved,body.reason,role)

@app.get('/api/notifications',dependencies=[Depends(auth)])
async def notifications():
    from .workflows import NOTIFY_HEADERS
    return {'items':(await asyncio.to_thread(work.read,'Notification_Logs',NOTIFY_HEADERS))[-300:]}

@app.post('/api/requests/reassign',dependencies=[Depends(auth)])
async def queue_reassign(body:QueueBatch, role=Depends(auth)):
    if len(set(body.request_ids))!=len(body.request_ids): raise HTTPException(422,'Duplicate requests')
    reqs=await asyncio.to_thread(work.requests)
    lookup={str(x['request_id']):x for x in reqs}
    selected=[]
    for rid in body.request_ids:
        req=lookup.get(rid)
        if not req: raise HTTPException(404,'Request not found')
        if req['status'] not in ('pending','approved'): raise HTTPException(409,'Request not eligible')
        if req['status']=='pending' and str(req.get('recent_warning','')).lower()=='yes':
            raise HTTPException(409,'Recent repeat requires administrator review')
        selected.append(req)
    if len({work.phone(r['agent_number']) for r in selected})!=len(selected):
        raise HTTPException(409,'Duplicate agent number')
    dids=[str(r['current_did']) for r in selected]
    return await queue_submit(dids,{str(r['current_did']):r['request_id'] for r in selected},role)

# A single-process, Sheets-journaled FIFO queue. This is NOT a distributed lock.
QUEUE_HEADERS = ['time_utc','queue_id','event','actor','dids_json','request_map_json','details']
queue_wakeup = asyncio.Event()
queue_submission_lock = asyncio.Lock()
queue_worker_task = None

def queue_events():
    return get_rows('Operation_Queue', QUEUE_HEADERS)

def queue_append(qid, event, actor='', dids=None, mapping=None, details=''):
    worksheet(sheet(), 'Operation_Queue', QUEUE_HEADERS).append_row([
        datetime.now(timezone.utc).isoformat(), qid, event, actor,
        json.dumps(dids or []), json.dumps(mapping or {}), str(details)[:500]
    ], value_input_option='RAW')
    invalidate_snapshots('queue_display')

def queue_snapshot():
    jobs = {}
    for row in queue_events():
        qid=str(row.get('queue_id',''))
        event=str(row.get('event',''))
        if event=='QUEUED' and qid not in jobs:
            try:
                jobs[qid]={'queue_id':qid,'time_utc':row['time_utc'],
                           'actor':row.get('actor',''), 'dids':json.loads(row['dids_json']),
                           'request_map':json.loads(row['request_map_json']), 'status':'pending'}
            except (ValueError, TypeError, KeyError):
                raise RuntimeError('Corrupt queue record; manual recovery required')
        elif qid in jobs and event in ('STARTED','COMPLETED','NEEDS_RECONCILIATION','CANCELLED'):
            jobs[qid]['status']={'STARTED':'processing','COMPLETED':'completed',
                                 'NEEDS_RECONCILIATION':'needs_reconciliation',
                                 'CANCELLED':'cancelled'}[event]
    return list(jobs.values())

async def queue_submit(dids, mapping, actor):
    if len(set(dids)) != len(dids):
        raise HTTPException(422,'Duplicate DID in request')
    if not dids or len(dids)>2000:
        raise HTTPException(422,'Invalid batch size')
    # Serialize queue submissions, independent of the MCube execution lock.
    async with queue_submission_lock:
        await require_reconciled()
        try:
            existing=await asyncio.to_thread(queue_snapshot)
            pending=[x for x in existing if x['status'] in ('pending','processing')]
            requested=set(dids)
            if any(requested.intersection(x['dids']) for x in pending):
                raise HTTPException(409,'One or more DIDs are already queued or processing')
            if any(set(mapping.values()).intersection(x['request_map'].values()) for x in pending):
                raise HTTPException(409,'One or more requests are already queued or processing')
            qid=str(uuid.uuid4())
            await asyncio.to_thread(queue_append,qid,'QUEUED',actor,dids,mapping)
        except HTTPException: raise
        except Exception as exc:
            log.exception('Queue persistence failed')
            raise HTTPException(503,'Queue unavailable; no operation accepted') from exc
    queue_wakeup.set()
    return {'queue_id':qid,'accepted':True,'status':'pending'}

@app.get('/api/queue', dependencies=[Depends(auth)])
async def get_queue():
    try:
        with _snapshot_cache_lock:
            entry=_snapshot_cache.get('queue_display')
            jobs=entry[1] if entry and time.monotonic()-entry[0]<3 else None
        if jobs is None:
            jobs=await asyncio.to_thread(queue_snapshot)
            with _snapshot_cache_lock:_snapshot_cache['queue_display']=(time.monotonic(),jobs)
        return {'items':[{k:v for k,v in j.items() if k!='request_map'} for j in jobs[-100:]]}
    except Exception: raise HTTPException(503,'Queue unavailable')

async def queue_worker():
    # At most one queue worker per process. No automatic retry of interrupted MCube changes.
    while True:
        try:
            jobs=await asyncio.to_thread(queue_snapshot)
            if any(j['status']=='processing' for j in jobs):
                log.error('Interrupted queue operation; administrator reconciliation required')
                await asyncio.sleep(15)
                continue
            pending=next((j for j in jobs if j['status']=='pending'),None)
            if pending is None:
                queue_wakeup.clear()
                try: await asyncio.wait_for(queue_wakeup.wait(),timeout=30)
                except asyncio.TimeoutError: pass
                continue
            lease=await lock.acquire()
            handed_off=False
            try:
                await require_reconciled()
                # STARTED is persisted before any MCube API is called.
                await asyncio.to_thread(queue_append,pending['queue_id'],'STARTED')
                await start_reassignment(pending['dids'],pending['request_map'],lease)
                handed_off=True
                while state['running']:
                    await asyncio.sleep(.5)
                event='NEEDS_RECONCILIATION' if state['error'] else 'COMPLETED'
                await asyncio.to_thread(queue_append,pending['queue_id'],event,details=state['error'] or '')
                if state['error']:
                    await asyncio.sleep(15)
            finally:
                if not handed_off: await lock.release(lease)
        except asyncio.CancelledError: raise
        except Exception:
            log.exception('Queue worker halted on unsafe or unavailable state')
            await asyncio.sleep(15)

@app.on_event('startup')
async def start_queue_worker():
    global queue_worker_task
    queue_worker_task=asyncio.create_task(queue_worker())

@app.on_event('shutdown')
async def stop_queue_worker():
    if queue_worker_task:
        queue_worker_task.cancel()
        try: await queue_worker_task
        except asyncio.CancelledError: pass

@app.get('/api/health')
async def health(): return {'status':'ok'}

def display_inventory():
    now=time.monotonic()
    with _snapshot_cache_lock:
        entry=_snapshot_cache.get('inventory')
        if entry and now-entry[0]<SNAPSHOT_TTL:return entry[1]
    active=get_rows('Active_DIDs',DID_HEADERS)
    inactive=get_rows('Inactive_DIDs',DID_HEADERS)
    pool=get_rows('DID_Pool_FIFO',FIFO_HEADERS)
    items=[{'did':str(r.get('did_no','')),'agent':r.get('agent_name',''),'agent_number':str(r.get('agent_no','')),'operator':r.get('operator',''),'status':cat} for cat,rows in [('active',active),('inactive',inactive)] for r in rows]
    items += [{'did':str(r['did_no']),'agent':'','agent_number':'','operator':r.get('operator',''),'status':'pool','fifo':r.get('fifo_position')} for r in pool]
    from collections import Counter
    counts=Counter((item['status'], item['did']) for item in items)
    for item in items:
        item['duplicate']=counts[(item['status'], item['did'])]>1
    with _snapshot_cache_lock:_snapshot_cache['inventory']=(time.monotonic(),items)
    return items

@app.get('/api/dids', dependencies=[Depends(auth)])
async def dids():
    try:
        items=await asyncio.to_thread(display_inventory)
        return {'items':items,'configured':True,'running':state['running']}
    except HTTPException: raise
    except Exception as exc:
        log.exception('Snapshot read failed (Google Sheets inventory)')
        if isinstance(exc, NameError):
            raise HTTPException(503, 'Inventory backend configuration error; inspect Render traceback') from exc
        raise HTTPException(503,'Unable to read Google Sheets snapshot') from exc

@app.get('/api/inventory/status',dependencies=[Depends(auth)])
async def inventory_status():
    """Read-only first-run check. Empty snapshots are not interpreted as live zero DIDs."""
    try:
        rows=await asyncio.to_thread(get_rows,'Sync_Status',['last_sync_utc','active','inactive','pool'])
        latest=rows[-1] if rows else None
        return {'initialized':bool(latest and latest.get('last_sync_utc')),
                'last_sync_utc':str(latest.get('last_sync_utc','')) if latest else '',
                'counts':{k:int(latest.get(k,0) or 0) for k in ('active','inactive','pool')} if latest else None}
    except Exception as exc:
        log.exception('Inventory status check failed')
        raise HTTPException(503,'Unable to read Google Sheets initialization status') from exc

@app.post('/api/sync',dependencies=[Depends(auth)])
async def sync():
    if lock.locked(): raise HTTPException(409,'A reassignment or sync is in progress')
    async with lock:
        try:
            async with httpx.AsyncClient(timeout=35) as client: lists=await fetch_lists(client)
            order=await asyncio.to_thread(snapshot_sync,lists)
            return {'ok':True,'counts':{k:len(v) for k,v in lists.items()},'pool_order':order}
        except Exception as exc:
            log.exception('MCube inventory sync failed')
            raise HTTPException(502,'Inventory synchronization failed; inspect Render logs') from exc

def snapshot_sync(lists):
    # Snapshot is synchronous because gspread is a synchronous client.
    import asyncio as aio
    return aio.run(snapshot(lists))

@app.get('/api/batch',dependencies=[Depends(auth)])
async def batch_status(): return dict(state)

@app.get('/api/logs',dependencies=[Depends(auth)])
async def logs():
    try: return {'items':(await asyncio.to_thread(get_rows,'Change_Logs',LOG_HEADERS))[-500:]}
    except Exception: raise HTTPException(503,'Cannot read audit log')

@app.post('/api/reassign',dependencies=[Depends(auth)])
async def reassign(request:BatchRequest,role=Depends(auth)):
    recent=await asyncio.to_thread(work.recent_agents,(await asyncio.to_thread(work.settings))['recent_replacement_days'])
    live=await asyncio.to_thread(get_rows,'Active_DIDs',DID_HEADERS)
    by_did={str(r.get('did_no')):r for r in live}
    if any(work.phone(by_did.get(d,{}).get('agent_no')) in recent for d in request.dids):
        raise HTTPException(409,'Recent replacement: use Request queue and administrator review')
    return await queue_submit(request.dids,{},role)

async def start_reassignment(dids,request_map,lease):
    # Caller already owns the distributed lock. Transfer it to background task
    # without an unlock/relock gap that could admit another operator.
    if len(set(dids))!=len(dids):raise HTTPException(422,'Duplicate selected DIDs')
    if state['running']:raise HTTPException(409,'Batch already running')
    await require_reconciled()
    batch=str(uuid.uuid4())
    try:
        await asyncio.to_thread(append_event,batch,'BATCH_REQUESTED',result='PENDING',details=json.dumps({'dids':dids,'requests':request_map}))
        for req in await asyncio.to_thread(work.requests):
            if req['request_id'] in request_map.values():
                req['status']='processing';req['replacement_batch']=batch
                await asyncio.to_thread(work.update_request,req)
    except Exception:raise HTTPException(503,'Cannot persist request; no MCube changes made')
    state.update(running=True,batch_id=batch,done=0,total=len(dids),results=[],error=None)
    asyncio.create_task(run_batch(batch,dids,request_map,lease))
    return {'batch_id':batch,'accepted':True}

async def run_batch(batch,dids,request_map,lease):
    request_map=request_map or {}
    try:
        async with httpx.AsyncClient(timeout=35) as client:
            # Force a fresh MCube listing before planning, never trust Sheets snapshot.
            lists=await fetch_lists(client)
            active={x['did']:x for x in lists['active']}
            pool={x['did']:x for x in lists['pool']}
            saved=await asyncio.to_thread(get_rows,'DID_Pool_FIFO',FIFO_HEADERS)
            saved_order=[str(x['did_no']) for x in saved]
            current_order=[x['did'] for x in lists['pool']]
            order=saved_order if len(saved_order)==len(current_order) and set(saved_order)==set(current_order) else current_order
            if len(dids)>len(order): raise RuntimeError('Selected count exceeds current available pool')
            # Requests must still refer to exactly the same active agent and DID.
            if request_map:
                all_requests={str(r['request_id']):r for r in await asyncio.to_thread(work.requests)}
                for old,rid in request_map.items():
                    req=all_requests.get(rid)
                    if not req or req.get('status')!='processing' or old not in active or work.phone(active[old]['agent_number'])!=work.phone(req.get('agent_number')):
                        raise RuntimeError('Request/active agent mapping changed; batch stopped')
            if any(d not in active or not active[d]['agent_number'] for d in dids): raise RuntimeError('Some selected DIDs are no longer active or missing agent numbers')
            await asyncio.to_thread(append_event,batch,'BATCH_VALIDATED',result='OK',details=f'{len(dids)} assignments')
            # Strict sequential operations. No next agent until current verification completes.
            for old in dids:
                agent=active[old]['agent_number']; name=active[old]['agent']
                try:
                    # Re-fetch live inventory before every replacement. Respect pool changes.
                    live=await fetch_lists(client)
                    live_active={x['did']:x for x in live['active']}
                    live_pool={x['did'] for x in live['pool']}
                    if old not in live_active or work.phone(live_active[old]['agent_number'])!=work.phone(agent):
                        raise RuntimeError('Current assignment changed; no action taken')
                    eligible=[d for d in order if d in live_pool]
                    if not eligible: raise RuntimeError('No available FIFO DID; no action taken')
                    new=eligible[0]
                    await asyncio.to_thread(append_event,batch,'DEACTIVATION_STARTED',old,new,agent,name,'PENDING')
                    try: response=await mcube(client,'get-onetoone-did',{'agent_number':agent,'did_no':old,'status':'deactivate'})
                    except Exception as exc:
                        await asyncio.to_thread(append_event,batch,'DEACTIVATION_UNCERTAIN',old,new,agent,name,'RECONCILE',str(exc))
                        raise RuntimeError('Deactivation outcome uncertain; batch stopped for reconciliation')
                    if response.get('status') is not True:
                        await asyncio.to_thread(append_event,batch,'DEACTIVATION_FAILED',old,new,agent,name,'FAILED',response.get('msg','Rejected'))
                        state['results'].append({'old':old,'new':new,'status':'failed','reason':response.get('msg','Rejected')})
                        if old in request_map:
                            req=next((r for r in await asyncio.to_thread(work.requests) if r['request_id']==request_map[old]),None)
                            if req:
                                req['status']='pending'
                                await asyncio.to_thread(work.update_request,req)
                        state['done']+=1
                        continue
                    await asyncio.to_thread(append_event,batch,'DEACTIVATED',old,new,agent,name,'SUCCESS',response.get('msg',''))
                    await asyncio.to_thread(append_event,batch,'ACTIVATION_STARTED',old,new,agent,name,'PENDING')
                    try: response=await mcube(client,'get-onetoone-did',{'agent_number':agent,'did_no':new,'status':'activate'})
                    except Exception as exc:
                        await asyncio.to_thread(append_event,batch,'ACTIVATION_UNCERTAIN',old,new,agent,name,'RECONCILE',str(exc))
                        raise RuntimeError('Activation outcome uncertain; batch stopped for reconciliation')
                    if response.get('status') is not True:
                        await asyncio.to_thread(append_event,batch,'ACTIVATION_FAILED',old,new,agent,name,'PARTIAL_FAILURE',response.get('msg','Rejected'))
                        raise RuntimeError('Old DID deactivated but activation failed; batch stopped for recovery')
                    await asyncio.to_thread(append_event,batch,'ACTIVATED',old,new,agent,name,'SUCCESS',response.get('msg',''))
                    verified=await fetch_lists(client)
                    if not any(x['did']==new and work.phone(x['agent_number'])==work.phone(agent) for x in verified['active']):
                        await asyncio.to_thread(append_event,batch,'VERIFICATION_FAILED',old,new,agent,name,'RECONCILE','New DID not confirmed in active listing')
                        raise RuntimeError('MCube activation not verified; batch stopped')
                    await asyncio.to_thread(snapshot_sync,verified)
                    order=[d for d in order if d!=new]
                    await asyncio.to_thread(append_event,batch,'REASSIGNMENT_COMPLETE',old,new,agent,name,'SUCCESS')
                    if old in request_map:
                        req=next((r for r in await asyncio.to_thread(work.requests) if r['request_id']==request_map[old]),None)
                        if req:
                            req['status']='completed';req['replacement_new_did']=new;req['completed_utc']=work.now()
                            await asyncio.to_thread(work.update_request,req)
                            cfg=await asyncio.to_thread(work.settings)
                            if cfg['notify_on_completion']:await work.outbound_notification(req,'completed',cfg)
                            if cfg['email_on_completion']:await work.send_email(req,'completed',cfg)
                    state['results'].append({'old':old,'new':new,'status':'success'})
                    state['done']+=1
                except RuntimeError as exc:
                    state['results'].append({'old':old,'status':'stopped','reason':str(exc)})
                    raise
        await asyncio.to_thread(append_event,batch,'BATCH_COMPLETE',result='SUCCESS')
    except Exception as exc:
        state['error']=str(exc)
        for req in await asyncio.to_thread(work.requests):
            if req.get('replacement_batch')==batch and req.get('status')=='processing':
                req['status']='needs_reconciliation'
                try:await asyncio.to_thread(work.update_request,req)
                except Exception:log.exception('Unable to mark request for reconciliation')
        log.error('Batch %s stopped: %s',batch,type(exc).__name__)
        try: await asyncio.to_thread(append_event,batch,'BATCH_STOPPED',result='NEEDS_REVIEW',details=str(exc))
        except Exception: log.error('Failed to persist batch stop')
    finally:
        state['running']=False
        await lock.release(lease)

if BASE.exists():
    app.mount('/assets',StaticFiles(directory=BASE/'assets'),name='assets')
    @app.get('/{path:path}')
    async def spa(path:str): return FileResponse(BASE/'index.html')
