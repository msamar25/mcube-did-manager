"""MCube DID replacement: sequential, fail-closed, Sheets-journaled operations."""
import asyncio, json, logging, os, uuid, time, hmac, hashlib, secrets, base64, threading, random
from datetime import datetime, timezone, timedelta
IST = timezone(timedelta(hours=5, minutes=30))
from pathlib import Path
from typing import Literal
import httpx
from fastapi import FastAPI, Depends, Header, HTTPException
from .workflows import Workflows, SettingsUpdate, QueueBatch, Review
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

log = logging.getLogger('mcube')
app = FastAPI(title='UNext SupportHub', docs_url=None if os.getenv('APP_ENV') == 'production' else '/docs')
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
        await send_brevo(email,'UNext SupportHub login code',f'Your one-time login code is {otp}. It expires in 5 minutes. Do not share this code.')
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
AGENT_HISTORY_HEADERS = ['event_id','completed_at_ist','batch_id','agent_number','agent_name','old_did','new_did','result','manager_at_sync','team_lead_at_sync','source']

def append_event(batch, event, old='', new='', agent='', name='', result='', details=''):
    ws = worksheet(sheet(), 'Change_Logs', LOG_HEADERS)
    ws.append_row([datetime.now(IST).isoformat(timespec="seconds"),batch,event,old,new,agent,name,result,str(details)[:1000]], value_input_option='RAW')

def get_rows(name, headers):
    import requests
    for attempt in range(3):
        try:
            return _quota_call(lambda: worksheet(sheet(),name,headers).get_all_records(numericise_ignore=['all'] if name=='Call_Request_Events' else []))
        except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
            if attempt == 2:
                log.warning('Google Sheets read %s failed after 3 attempts: %s', name, type(exc).__name__)
                raise
            time.sleep(min(4, 2 ** attempt))

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
    stamp=datetime.now(IST).isoformat(timespec="seconds")
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

class MCubeCredentialsInput(BaseModel):
    username: str = Field(min_length=1,max_length=256)
    password: str = Field(min_length=1,max_length=2048)

@app.get('/api/mcube-config/credentials/status')
async def mcube_credentials_status(role=Depends(admin_only)):
    from .mcube_config_auth import configured
    try:return {'configured':await asyncio.to_thread(configured,sys.modules[__name__])}
    except HTTPException:raise
    except Exception as exc:
        log.exception('MCube credential status unavailable')
        raise HTTPException(503,'Cannot read MCube credential status') from exc

@app.put('/api/mcube-config/credentials')
async def save_mcube_credentials(body:MCubeCredentialsInput,role=Depends(admin_only)):
    from .mcube_config_auth import save
    if lock.locked():raise HTTPException(409,'Another operation is running')
    async with lock:
        try:
            await asyncio.to_thread(save,sys.modules[__name__],body.username,body.password)
            return {'ok':True,'configured':True}
        except HTTPException:raise
        except Exception as exc:
            log.exception('MCube credential save failed')
            raise HTTPException(503,'MCube credentials could not be saved') from exc

@app.post('/api/mcube-config/credentials/test')
async def test_mcube_credentials(role=Depends(admin_only)):
    from .mcube_config_auth import fresh_token
    async with httpx.AsyncClient(timeout=30) as client:
        await fresh_token(sys.modules[__name__],client)
    return {'ok':True,'message':'MCube config login returned a recognized token'}

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
            log.exception('Call sync failed');raise HTTPException(502,f'Call sync failed: {str(exc) if isinstance(exc,RuntimeError) else type(exc).__name__}')

@app.post('/api/employees/sync')
async def sync_employees(role=Depends(admin_only)):
    if lock.locked():raise HTTPException(409,'Another operation is in progress')
    async with lock:
        try:return await work.fetch_employee_directory()
        except Exception as exc:
            log.exception('Employee sync failed');raise HTTPException(502,f'Employee sync failed: {str(exc)[:240]}')

async def maintenance_auth(authorization: str | None = Header(None)):
    token=(authorization or '').removeprefix('Bearer ').strip()
    expected=os.getenv('MAINTENANCE_TOKEN','')
    if not expected or not hmac.compare_digest(token,expected):
        raise HTTPException(401,'Unauthorized maintenance request')
    return True

@app.post('/api/maintenance/tick')
async def maintenance_tick(authorized=Depends(maintenance_auth)):
    """External cron trigger; each task is gated by Google Sheets configuration."""
    from datetime import timedelta
    if lock.locked():raise HTTPException(409,'Another operation is in progress')
    result={}
    async with lock:
        cfg=await asyncio.to_thread(work.settings)
        async def due(key,minutes):
            stamp=await asyncio.to_thread(work.get_sync,key)
            if not stamp:return True
            try:return datetime.now(timezone.utc)-datetime.fromisoformat(stamp.replace('Z','+00:00'))>=timedelta(minutes=int(minutes))
            except Exception:return True
        if await due('employee_sync',cfg.get('auto_employee_minutes',1440)):
            try:result['employees']=await work.fetch_employee_directory()
            except Exception as exc:log.exception('Scheduled employee sync failed');result['employees_error']=type(exc).__name__
        if await due('calls_sync',cfg.get('auto_calls_minutes',15)):
            try:result['calls']=await work.sync_calls()
            except Exception as exc:log.exception('Scheduled calls sync failed');result['calls_error']=type(exc).__name__
        if await due('inventory_auto_sync',cfg.get('auto_inventory_minutes',60)):
            try:
                async with httpx.AsyncClient(timeout=35) as client:
                    lists=await fetch_lists(client)
                await snapshot(lists)
                await asyncio.to_thread(work.set_sync,'inventory_auto_sync',work.now())
                result['inventory']='updated'
            except Exception as exc:log.exception('Scheduled inventory sync failed');result['inventory_error']=type(exc).__name__
        if await due('agent_history_sync',60):
            try:
                result['agent_history']=await asyncio.to_thread(sync_agent_replacement_history)
                await asyncio.to_thread(work.set_sync,'agent_history_sync',work.now())
            except Exception as exc:
                log.exception('Scheduled agent history sync failed')
                result['agent_history_error']=type(exc).__name__
        try:result['reminders']=await work.due_reminders()
        except Exception as exc:log.exception('Scheduled reminders failed');result['reminders_error']=type(exc).__name__
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
        datetime.now(IST).isoformat(timespec="seconds"), qid, event, actor,
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

# Admin-only inventory reset. Immutable audit, requests, settings, employees and history are NEVER deleted.
class ResetInventory(BaseModel):
    confirmation: Literal['CLEAR_INVENTORY_SNAPSHOTS_ONLY']

@app.post('/api/admin/inventory/clear')
async def clear_inventory(body:ResetInventory,role=Depends(admin_only)):
    if lock.locked(): raise HTTPException(409,'Operation already running')
    async with lock:
        await require_reconciled()
        await asyncio.to_thread(append_event,'ADMIN','INVENTORY_RESET_REQUESTED',result='AUDIT',details='Snapshots only; replacement journal retained')
        for name,headers in [('Active_DIDs',DID_HEADERS),('Inactive_DIDs',DID_HEADERS),('DID_Pool_FIFO',FIFO_HEADERS),('Sync_Status',['last_sync_utc','active','inactive','pool'])]:
            await asyncio.to_thread(replace_rows,name,headers,[])
        await asyncio.to_thread(append_event,'ADMIN','INVENTORY_RESET_COMPLETE',result='SUCCESS',details='Ready for explicit provider re-sync')
        return {'ok':True,'message':'Inventory snapshots cleared. Audit and operational records preserved.'}

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

def sync_agent_replacement_history():
    """Idempotent reconciliation from the authoritative Change_Logs journal.
    Preserves historical rows and never treats last call time as replacement time.
    """
    logs=get_rows('Change_Logs',LOG_HEADERS)
    ws=worksheet(sheet(),'Agent_Replacement_History',AGENT_HISTORY_HEADERS)
    existing=_quota_call(lambda: ws.get_all_records(numericise_ignore=['all']))
    known={str(r.get('event_id','')) for r in existing}
    employees=get_rows('Employee_Directory',work.EMP_HEADERS)
    by_phone={work.phone(str(e.get('agent_number',''))):e for e in employees}
    pending=[]
    for index,event in enumerate(logs,2):
        if str(event.get('event','')).upper()!='REASSIGNMENT_COMPLETE' or str(event.get('result','')).upper()!='SUCCESS':continue
        # Index is stable for append-only Change_Logs; includes batch to guard collisions.
        eid=f"{event.get('batch_id','')}:{index}"
        if eid in known:continue
        phone=work.phone(str(event.get('agent_number','')))
        emp=by_phone.get(phone,{})
        pending.append([eid,str(event.get('time_utc','')),str(event.get('batch_id','')),phone,str(event.get('agent_name','')),str(event.get('old_did','')),str(event.get('new_did','')),'SUCCESS',str(emp.get('role5','')),str(emp.get('role4','')),'Change_Logs'])
        known.add(eid)
    if pending:
        _quota_call(lambda: ws.append_rows(pending,value_input_option='RAW'))
    return {'synced':len(pending),'total':len(known),'source':'Change_Logs'}

@app.post('/api/agent-history/sync',dependencies=[Depends(admin_only)])
async def sync_agent_history_endpoint():
    try:return await asyncio.to_thread(sync_agent_replacement_history)
    except Exception as exc:
        log.exception('Agent history synchronization failed')
        raise HTTPException(503,'Unable to synchronize agent replacement history') from exc

@app.get('/api/employees/lookup',dependencies=[Depends(auth)])
async def employee_email_lookup():
    """Live read of Employee_Directory, matching only canonical 10-digit agent mobiles.

    Never guess from names. Return diagnostics so an empty email column is actionable.
    """
    try:
        rows=await asyncio.to_thread(get_rows,'Employee_Directory',work.EMP_HEADERS)
        emails={};ambiguous=set();with_phone=0;with_email=0
        def pick(row,*keys):
            normalized={str(k).strip().lower().replace(' ','_'):v for k,v in row.items()}
            for key in keys:
                value=normalized.get(key)
                if value is not None and str(value).strip():return str(value).strip()
            return ''
        for row in rows:
            number=work.phone(pick(row,'agent_number','emp_phone','employee_phone','mobile','phone','agent_no','phone_number'))
            email=pick(row,'email','email_id','email_address','emp_email','official_email','work_email')
            if number:with_phone+=1
            if email and '@' in email:with_email+=1
            if not number or not email or '@' not in email:continue
            if number in emails and emails[number].casefold()!=email.casefold():ambiguous.add(number)
            else:emails[number]=email
        for number in ambiguous:emails.pop(number,None)
        return {'by_phone':emails,'matched':len(emails),'ambiguous':len(ambiguous),
                'directory_rows':len(rows),'rows_with_phone':with_phone,'rows_with_email':with_email}
    except Exception as exc:
        log.exception('Employee email lookup failed')
        raise HTTPException(503,'Unable to load employee email directory') from exc

@app.get('/api/agents/{agent_number}/profile',dependencies=[Depends(auth)])
async def agent_profile(agent_number:str):
    phone=work.phone(agent_number)
    if not phone or len(phone)<8:raise HTTPException(400,'Invalid agent number')
    try:
        employees,requests,logs,history=await asyncio.gather(
            asyncio.to_thread(get_rows,'Employee_Directory',work.EMP_HEADERS),
            asyncio.to_thread(work.requests),
            asyncio.to_thread(get_rows,'Change_Logs',LOG_HEADERS),
            asyncio.to_thread(get_rows,'Agent_Replacement_History',AGENT_HISTORY_HEADERS))
        employee=next((e for e in employees if work.phone(str(e.get('agent_number','')))==phone),{})
        related_requests=[r for r in requests if work.phone(str(r.get('agent_number','')))==phone]
        related_history=[r for r in history if work.phone(str(r.get('agent_number','')))==phone]
        # Include authoritative successful events even if the materialized history sheet has not synced yet.
        known={(str(r.get('batch_id','')),str(r.get('old_did','')),str(r.get('new_did',''))) for r in related_history}
        for e in logs:
            if str(e.get('event','')).upper()!='REASSIGNMENT_COMPLETE' or str(e.get('result','')).upper()!='SUCCESS' or work.phone(str(e.get('agent_number','')))!=phone:continue
            key=(str(e.get('batch_id','')),str(e.get('old_did','')),str(e.get('new_did','')))
            if key not in known:
                related_history.append({'completed_at_ist':e.get('time_utc',''),'batch_id':key[0],'old_did':key[1],'new_did':key[2],'agent_number':phone,'agent_name':e.get('agent_name',''),'result':'SUCCESS','source':'Change_Logs (not yet synced)'})
                known.add(key)
        related_history.sort(key=lambda r:str(r.get('completed_at_ist','')),reverse=True)
        related_requests.sort(key=lambda r:str(r.get('first_call_utc','')),reverse=True)
        return {'agent_number':phone,'employee':employee,'requests':related_requests,'replacements':related_history,'replacement_count':len(related_history),'request_count':len(related_requests)}
    except HTTPException:raise
    except Exception as exc:
        log.exception('Agent profile load failed')
        raise HTTPException(503,'Unable to read agent profile from Google Sheets') from exc

@app.get('/api/insights',dependencies=[Depends(auth)])
async def insights():
    """Read-only QC metrics. Actual replacement time is completed_utc, never MCube lastcall."""
    from collections import Counter, defaultdict
    from datetime import datetime, timezone
    from statistics import median
    from .workflows import EMP_HEADERS, REQUEST_HEADERS, CALL_HEADERS

    def dt(value):
        try:
            raw=str(value or '').strip()
            if not raw or raw.startswith('0000-'): return None
            result=datetime.fromisoformat(raw.replace('Z','+00:00'))
            return result.replace(tzinfo=timezone.utc) if result.tzinfo is None else result
        except (ValueError,TypeError): return None

    def hours(start,end):
        a,b=dt(start),dt(end)
        return round((b-a).total_seconds()/3600,2) if a and b and b>=a else None

    def gather():
        employees=get_rows('Employee_Directory',EMP_HEADERS)
        requests=get_rows('Pending_Requests',REQUEST_HEADERS)
        logs=get_rows('Change_Logs',LOG_HEADERS)
        calls=get_rows('Call_Request_Events',CALL_HEADERS)
        lookup={str(e.get('agent_number','')).strip():e for e in employees}
        leaders=defaultdict(lambda:{'requests':0,'repeat_calls':0,'completed':0,'pending':0,'review_required':0,'employees':set(),'turnaround_hours':[],'repeat_employee_count':0})
        by_agent=defaultdict(lambda:{'requests':0,'calls':0,'completed':0,'turnaround_hours':[],'request_dates':[],'last_replacement_utc':None,'last_request_utc':None,'last_call_utc':None})
        statuses=Counter();by_day=Counter();monthly=defaultdict(lambda:{"requests":0,"calls":0,"completed":0,"rejected":0});turnarounds=[];now=datetime.now(timezone.utc)
        for r in requests:
            phone=str(r.get('agent_number') or r.get('callto') or '').strip()
            employee=lookup.get(phone,{})
            manager=str(employee.get('role5') or 'Unassigned').strip() or 'Unassigned'
            tl=str(employee.get('role4') or 'Unassigned').strip() or 'Unassigned'
            count=int(str(r.get('call_count') or '1')) if str(r.get('call_count') or '1').isdigit() else 1
            count=max(1,count)
            status=str(r.get('status') or 'unknown').strip().lower()
            statuses[status]+=1
            team=leaders[(manager,tl)]
            team['requests']+=1;team['repeat_calls']+=count-1
            team['completed']+=int(status=='completed')
            team['pending']+=int(status in ('pending','approved','processing'))
            team['review_required']+=int(status=='review_required')
            team['employees'].add(phone)
            agent=by_agent[phone]
            agent['requests']+=1;agent['calls']+=count;agent['completed']+=int(status=='completed')
            first=dt(r.get('first_call_utc'));last=dt(r.get('last_call_utc'))
            completed=dt(r.get('completed_utc')) if status=='completed' else None
            if first:
                agent['request_dates'].append(first)
                by_day[first.date().isoformat()]+=1
                month=first.strftime("%Y-%m")
                monthly[(month,phone)]["requests"]+=1
                monthly[(month,phone)]["calls"]+=count
                monthly[(month,phone)]["completed"]+=int(status=="completed")
                monthly[(month,phone)]["rejected"]+=int(status=="rejected")
                if not agent['last_request_utc'] or first>agent['last_request_utc']:agent['last_request_utc']=first
            if last and (not agent['last_call_utc'] or last>agent['last_call_utc']):agent['last_call_utc']=last
            if completed:
                if not agent['last_replacement_utc'] or completed>agent['last_replacement_utc']:agent['last_replacement_utc']=completed
                duration=hours(r.get('first_call_utc'),r.get('completed_utc'))
                if duration is not None:
                    agent['turnaround_hours'].append(duration);team['turnaround_hours'].append(duration);turnarounds.append(duration)
        teams=[]
        for (manager,tl),value in leaders.items():
            members=[a for phone,a in by_agent.items() if phone in value['employees']]
            teams.append({'manager':manager,'team_lead':tl,'requests':value['requests'],'repeat_calls':value['repeat_calls'],'completed':value['completed'],'pending':value['pending'],'review_required':value['review_required'],'unique_employees':len(value['employees']),'repeat_employee_count':sum(a['requests']>1 for a in members),'average_turnaround_hours':round(sum(value['turnaround_hours'])/len(value['turnaround_hours']),1) if value['turnaround_hours'] else None,'completion_rate_pct':round(100*value['completed']/value['requests'],1) if value['requests'] else 0,'requests_per_employee':round(value['requests']/len(value['employees']),2) if value['employees'] else 0})
        teams.sort(key=lambda x:(-x['requests'],x['manager'],x['team_lead']))
        agents=[]
        for phone,value in by_agent.items():
            dates=sorted(value['request_dates']);intervals=[round((b-a).total_seconds()/86400,1) for a,b in zip(dates,dates[1:]) if b>a]
            employee=lookup.get(phone,{})
            last_rep=value['last_replacement_utc'];last_req=value['last_request_utc'];last_call=value['last_call_utc']
            agents.append({'agent_number':phone,'agent_name':employee.get('agent_name',''),'team_lead':employee.get('role4',''),'manager':employee.get('role5',''),'requests':value['requests'],'calls':value['calls'],'completed':value['completed'],'repeat_requests':max(0,value['requests']-1),'median_days_between_requests':round(median(intervals),1) if intervals else None,'average_turnaround_hours':round(sum(value['turnaround_hours'])/len(value['turnaround_hours']),1) if value['turnaround_hours'] else None,'last_replacement_utc':last_rep.isoformat() if last_rep else None,'last_request_utc':last_req.isoformat() if last_req else None,'last_call_utc':last_call.isoformat() if last_call else None,'days_since_last_replacement':round((now-last_rep).total_seconds()/86400,1) if last_rep and now>=last_rep else None,'days_last_replacement_to_next_request':next((round((d-last_rep).total_seconds()/86400,1) for d in dates if last_rep and d>last_rep),None) if last_rep else None})
        agents.sort(key=lambda a:(-a['requests'],-a['calls']))
        return {'summary':{'employees':len(employees),'requests':len(requests),'call_events':len(calls),'replacement_completions':sum(str(x.get('event','')).upper()=='REASSIGNMENT_COMPLETE' for x in logs),'audit_events':len(logs),'repeat_requests':sum(a['requests']>1 for a in agents),'repeated_calls':sum(max(0,a['calls']-a['requests']) for a in agents),'average_turnaround_hours':round(sum(turnarounds)/len(turnarounds),1) if turnarounds else None,'median_turnaround_hours':round(median(turnarounds),1) if turnarounds else None,'turnaround_sample_size':len(turnarounds)},'statuses':dict(statuses),'by_day':[{'date':d,'requests':n} for d,n in sorted(by_day.items())],'teams':teams,'agents':agents,'monthly':[{'month':month,'agent_number':phone,'agent_name':lookup.get(phone,{}).get('agent_name',''),'manager':lookup.get(phone,{}).get('role5',''),'team_lead':lookup.get(phone,{}).get('role4',''),**metrics} for (month,phone),metrics in sorted(monthly.items(),reverse=True)],'recent_operations':list(reversed(logs[-100:])),'methodology':{'replacement_time':'Pending_Requests.completed_utc for completed requests; verified MCube change logs are counted separately','request_time':'Pending_Requests.first_call_utc','repeat_request':'More than one distinct request row for the same employee; repeated calls in a single request are counted separately','manager_team':'Current role5 / role4 from Employee_Directory, not historical hierarchy','last_call':'Pending_Requests.last_call_utc; not a replacement timestamp','turnaround':'First qualifying call to verified completion; excludes missing/invalid timestamps'}}
    try:return await asyncio.to_thread(gather)
    except Exception as exc:
        log.exception('Insights read failed');raise HTTPException(503,'Unable to read report data from Google Sheets') from exc

@app.post('/api/reassign',dependencies=[Depends(auth)])
async def reassign(request:BatchRequest,role=Depends(admin_only)):
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
            # Strict sequential operations. Quarantine any new DID involved in a partial failure.
            quarantined=set()
            for old in dids:
                agent=active[old]['agent_number']; name=active[old]['agent']
                try:
                    # Re-fetch live inventory before every replacement. Respect pool changes.
                    live=await fetch_lists(client)
                    live_active={x['did']:x for x in live['active']}
                    live_pool={x['did'] for x in live['pool']}
                    if old not in live_active or work.phone(live_active[old]['agent_number'])!=work.phone(agent):
                        raise RuntimeError('Current assignment changed; no action taken')
                    eligible=[d for d in order if d in live_pool and d not in quarantined]
                    if not eligible: raise RuntimeError('No available FIFO DID; no action taken')
                    new=eligible[0]
                    await asyncio.to_thread(append_event,batch,'DEACTIVATION_STARTED',old,new,agent,name,'PENDING')
                    try: response=await mcube(client,'get-onetoone-did',{'agent_number':agent,'did_no':old,'status':'deactivate'})
                    except Exception as exc:
                        await asyncio.to_thread(append_event,batch,'DEACTIVATION_UNCERTAIN',old,new,agent,name,'RECONCILE',str(exc))
                        raise RuntimeError('Deactivation outcome uncertain; batch stopped for reconciliation')
                    if response.get('status') is not True:
                        await asyncio.to_thread(append_event,batch,'DEACTIVATION_FAILED',old,new,agent,name,'FAILED',response.get('msg','Rejected'))
                        state['results'].append({'old':old,'new':new,'status':'failed','stage':'deactivation','reason':response.get('msg','Rejected')})
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
                        reason=response.get('msg','Activation rejected')
                        await asyncio.to_thread(append_event,batch,'ACTIVATION_FAILED',old,new,agent,name,'PARTIAL_FAILURE',reason)
                        # Do not reuse this candidate, even if MCube still reports it in pool.
                        quarantined.add(new)
                        # Verify the outcome before proceeding. Uncertain state must stop the batch.
                        verified=await fetch_lists(client)
                        still_active=any(x['did']==old and work.phone(x['agent_number'])==work.phone(agent) for x in verified['active'])
                        newly_active=any(x['did']==new for x in verified['active'])
                        if still_active or newly_active:
                            await asyncio.to_thread(append_event,batch,'PARTIAL_FAILURE_UNCERTAIN',old,new,agent,name,'RECONCILE','MCube state inconsistent with activation rejection')
                            raise RuntimeError('Activation failed and inventory is inconsistent; stop for reconciliation')
                        await asyncio.to_thread(snapshot_sync,verified)
                        state['results'].append({'old':old,'new':new,'status':'failed','stage':'activation','reason':str(reason)+'; old DID deactivated; agent requires manual recovery'})
                        if old in request_map:
                            req=next((r for r in await asyncio.to_thread(work.requests) if r['request_id']==request_map[old]),None)
                            if req:
                                req['status']='needs_reconciliation'
                                await asyncio.to_thread(work.update_request,req)
                        state['done']+=1
                        continue
                    await asyncio.to_thread(append_event,batch,'ACTIVATED',old,new,agent,name,'SUCCESS',response.get('msg',''))
                    verified=await fetch_lists(client)
                    if not any(x['did']==new and work.phone(x['agent_number'])==work.phone(agent) for x in verified['active']):
                        await asyncio.to_thread(append_event,batch,'VERIFICATION_FAILED',old,new,agent,name,'RECONCILE','New DID not confirmed in active listing')
                        raise RuntimeError('MCube activation not verified; batch stopped')
                    await asyncio.to_thread(snapshot_sync,verified)
                    order=[d for d in order if d!=new]
                    await asyncio.to_thread(append_event,batch,'REASSIGNMENT_COMPLETE',old,new,agent,name,'SUCCESS')
                    try: await asyncio.to_thread(sync_agent_replacement_history)
                    except Exception: log.exception('History sheet sync deferred; Change_Logs retains verified completion')
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
        await asyncio.to_thread(append_event,batch,'BATCH_COMPLETE',result='PARTIAL_FAILURE' if any(x.get('status')=='failed' for x in state['results']) else 'SUCCESS',details='Manual recovery required for any activation failure')
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
