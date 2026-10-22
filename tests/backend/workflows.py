"""Request queue, persistent settings, role access, and outbound call notifications.
All writes go through Sheets; intended for one Render worker, not a transactional multi-node database.
"""
import os, json, uuid, hmac, asyncio, logging
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

log=logging.getLogger('mcube.workflows')
DEFAULTS={
 'request_did':'8071439545', 'recent_replacement_days':3, 'sync_mode':'login',
 'call_page_size':30, 'employee_refresh_hours':24, 'request_sync_lookback_minutes':30,
 'auto_inventory_minutes':60, 'auto_calls_minutes':15, 'auto_employee_minutes':1440,
 'reminder_enabled':False, 'reminder_first_minutes':0, 'reminder_interval_minutes':60,
 'reminder_escalation_minutes':120, 'reminder_max_attempts':3,
 'notify_on_queue':False, 'notify_on_completion':False,
 'first_contact_number':'', 'second_contact_number':'', 'outbound_caller_number':'',
 'level1_exenumber':'', 'level1_custnumber':'', 'level2_exenumber':'', 'level2_custnumber':'',
 'agent_notification_custnumber':'', 'notify_level2_on_queue':False,
 'email_on_queue':False, 'email_on_completion':False, 'require_recent_review':True,
 'admin_email':'', 'mail_from':'', 'mail_provider':'brevo'
}
SETTINGS_HEADERS=['key','value']
SETTING_LOG_HEADERS=['timestamp_utc','actor','key','old_value','new_value']
REQUEST_HEADERS=['request_id','callid','callto','agent_number','agent_name','agent_email','current_did','first_call_utc','last_call_utc','call_count','status','recent_warning','last_reminder_utc','reminder_count','replacement_batch','replacement_new_did','completed_utc']
# Legacy *_utc column names remain for existing Google Sheets compatibility; values are IST (+05:30).
CALL_HEADERS=['callid','request_id','callto','starttime','endtime','dialstatus','direction','ingested_utc','current_did','request_did']
NOTIFY_HEADERS=['timestamp_utc','request_id','kind','target','result','details']
EMP_HEADERS=['agent_number','agent_name','email','updated_utc','agent_id','role','status','role3','role4','role5']
SYNC_HEADERS=['key','value']

class SettingsUpdate(BaseModel):
 settings:dict
 version:str|None=None

class QueueBatch(BaseModel):
 request_ids:list[str]=Field(min_length=1,max_length=2000)

class Review(BaseModel):
 approved:bool
 reason:str=Field(min_length=3,max_length=500)

class Login(BaseModel):
 token:str

# Dependency injection avoids circular import with main.py
class Workflows:
 def __init__(self, core): self.c=core
 def now(self): return datetime.now(timezone(timedelta(hours=5,minutes=30))).isoformat(timespec='seconds')
 @staticmethod
 def phone(value):
  digits=''.join(c for c in str(value or '') if c.isdigit())
  if len(digits)==10:return digits
  if len(digits)==12 and digits.startswith('91'):return digits[2:]
  if len(digits)==13 and digits.startswith('091'):return digits[3:]
  return ''
 @staticmethod
 def canonical_callid(value):
  """Only exact digit strings are acceptable for deduplication.

  Never round floats or scientific notation: original digits are unrecoverable.
  """
  if isinstance(value,bool) or value is None:return ''
  if isinstance(value,int):return str(value) if value>=0 and len(str(value))<=15 else ''
  if not isinstance(value,str):return ''
  v=value.strip().lstrip("'")
  return v if v.isascii() and v.isdecimal() else ''
 @staticmethod
 def call_time(value):
  from zoneinfo import ZoneInfo
  try:
   stamp=datetime.fromisoformat(str(value).strip().replace('Z','+00:00'))
   if stamp.tzinfo is None:stamp=stamp.replace(tzinfo=ZoneInfo('Asia/Kolkata'))
   return stamp.astimezone(timezone(timedelta(hours=5,minutes=30))).isoformat(timespec='seconds')
  except (ValueError,TypeError):return '' 
 @contextmanager
 def stage(self, label):
  try:
   yield
  except HTTPException:
   raise
  except Exception as exc:
   log.exception('Request sync stage failed: %s',label)
   # Never include URLs, request payloads, credentials, or exception messages in HTTP responses.
   raise RuntimeError(f'{label}: {type(exc).__name__}') from exc
 def read(self,name,headers):
  with self.stage('Google Sheets read '+name):
   return self.c.get_rows(name,headers)
 def append(self,name,headers,row):
  with self.stage('Google Sheets append '+name):
   ws=self.c.worksheet(self.c.sheet(),name,headers)
   if name=='Call_Request_Events':
    self.ensure_call_event_schema(ws)
    row=[str(row[0]),*row[1:]]
   ws.append_row(row,value_input_option='RAW')
 def ensure_call_event_schema(self,ws):
  """Append new columns without shifting or rewriting historical event data.

  Force callid column to TEXT before inserting 20+ digit identifiers.
  This cannot restore identifiers previously rounded by Google Sheets.
  """
  actual=[str(v).strip() for v in ws.row_values(1)]
  if not actual:
   ws.update(range_name='A1',values=[CALL_HEADERS],value_input_option='RAW')
   actual=list(CALL_HEADERS)
  if actual[:8]!=CALL_HEADERS[:8]:
   raise RuntimeError('Call_Request_Events header mismatch; manual review required before writing')
  if len(actual)>len(CALL_HEADERS) or actual[8:]!=CALL_HEADERS[8:len(actual)]:
   raise RuntimeError('Unexpected Call_Request_Events columns; manual review required before writing')
  if len(actual)<len(CALL_HEADERS):
   if ws.col_count<len(CALL_HEADERS):ws.add_cols(len(CALL_HEADERS)-ws.col_count)
   start=len(actual)+1
   from gspread.utils import rowcol_to_a1
   ws.update(range_name=f'{rowcol_to_a1(1,start)}:{rowcol_to_a1(1,len(CALL_HEADERS))}',values=[CALL_HEADERS[len(actual):]],value_input_option='RAW')
  ws.spreadsheet.batch_update({'requests':[{'repeatCell':{
   'range':{'sheetId':ws.id,'startColumnIndex':0,'endColumnIndex':1},
   'cell':{'userEnteredFormat':{'numberFormat':{'type':'TEXT'}}},
   'fields':'userEnteredFormat.numberFormat'}}]})

 def replace(self,name,headers,rows):
  with self.stage('Google Sheets update '+name):
   self.c.replace_rows(name,headers,rows)
 def settings(self):
  raw=self.read('App_Settings',SETTINGS_HEADERS)
  cfg=dict(DEFAULTS)
  for r in raw:
   k=str(r.get('key','')); v=str(r.get('value',''))
   if k not in cfg: continue
   try: cfg[k]=json.loads(v)
   except Exception: cfg[k]=v
  return cfg
 def settings_version(self):
  import hashlib
  return hashlib.sha256(json.dumps(self.settings(),sort_keys=True).encode()).hexdigest()[:20]
 def save_settings(self,values,actor,version):
  old=self.settings()
  if version is not None and version!=self.settings_version(): raise HTTPException(409,'Settings changed elsewhere; reload before saving')
  invalid=set(values)-set(DEFAULTS)
  if invalid: raise HTTPException(422,f'Unknown settings: {sorted(invalid)}')
  new={**old,**values}
  if not str(new['request_did']).isdigit() or len(str(new['request_did']))!=10: raise HTTPException(422,'Request DID must contain 10 digits')
  for k in ['first_contact_number','second_contact_number','outbound_caller_number','level1_exenumber','level1_custnumber','level2_exenumber','level2_custnumber','agent_notification_custnumber']:
   if str(new[k]) and (not str(new[k]).isdigit() or len(str(new[k]))!=10): raise HTTPException(422,f'{k} must be a 10-digit number')
  for k in ['call_page_size','recent_replacement_days','reminder_interval_minutes','reminder_escalation_minutes','reminder_max_attempts','employee_refresh_hours','request_sync_lookback_minutes','auto_inventory_minutes','auto_calls_minutes','auto_employee_minutes']:
   if not isinstance(new[k],int) or not 1<=new[k]<=10000: raise HTTPException(422,f'Invalid {k}')
  if new['reminder_enabled'] and not (new['level1_custnumber'] or new['first_contact_number']): raise HTTPException(422,'Level 1 recipient is required')
  if new['reminder_enabled'] and not (new['level1_exenumber'] or new['outbound_caller_number']): raise HTTPException(422,'Level 1 exenumber is required')
  changes=[(k,old[k],new[k]) for k in old if old[k]!=new[k]]
  if not changes:return {'ok':True,'version':self.settings_version(),'changed':0}
  self.replace('App_Settings',SETTINGS_HEADERS,[[k,json.dumps(v)] for k,v in new.items()])
  if self.settings()!=new: raise HTTPException(503,'Settings write verification failed')
  for k,a,b in changes: self.append('Settings_Audit_Log',SETTING_LOG_HEADERS,[self.now(),actor,k,json.dumps(a),json.dumps(b)])
  return {'ok':True,'version':self.settings_version(),'changed':len(changes)}
 def update_request(self,req):
  rows=self.read('Pending_Requests',REQUEST_HEADERS)
  updated=False
  for i,row in enumerate(rows):
   if str(row['request_id'])==str(req['request_id']): rows[i]=req;updated=True;break
  if not updated:rows.append(req)
  self.replace('Pending_Requests',REQUEST_HEADERS,[[r.get(h,'') for h in REQUEST_HEADERS] for r in rows])
 def requests(self): return self.read('Pending_Requests',REQUEST_HEADERS)
 def employees(self): return self.read('Employee_Directory',EMP_HEADERS)
 def find_employee(self,number):
  for x in self.employees():
   if self.phone(x.get('agent_number'))==self.phone(number):return x
  return {}
 async def fetch_employee_directory(self):
  """Fetch each role independently; never replace the directory on partial failure."""
  from .mcube_config_auth import fresh_token
  url=os.getenv('MCUBE_CONFIG_BASE_URL','https://config.mcube.com/Restmcube-api').rstrip('/')+'/emp-filter'
  headers={'Accept':'application/json, text/plain, */*','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Origin':'https://unext-acquisition.mcube.com','Referer':'https://unext-acquisition.mcube.com/'}
  # Include administrators (role 1) and every configured MCube role.
  # Expand MCUBE_EMPLOYEE_ROLES if MCube introduces additional role IDs.
  roles=tuple(dict.fromkeys(x.strip() for x in os.getenv('MCUBE_EMPLOYEE_ROLES','1,2,3,4,5').split(',') if x.strip()))
  role_counts={}; agents=[]
  async with httpx.AsyncClient(timeout=45) as client:
   for role in roles:
    payload={'search_val':[role],'search_type':'Roles','daterange':None,'Authorization':await fresh_token(self.c,client)}
    try:
     r=await client.post(url,content=json.dumps(payload,separators=(',',':')),headers=headers)
     r.raise_for_status()
     data=r.json()
    except (httpx.RequestError,httpx.HTTPStatusError,ValueError) as exc:
     raise RuntimeError(f'MCube employee role {role} fetch failed: {type(exc).__name__}; directory unchanged') from exc
    # The verified MCube response uses a top-level employees array.
    if not isinstance(data,dict) or not isinstance(data.get('employees'),list):
     raise RuntimeError(f'MCube employee role {role} response missing employees list; directory unchanged')
    items=data['employees']
    if any(not isinstance(item,dict) for item in items):
     raise RuntimeError(f'MCube employee role {role} has invalid employee records; directory unchanged')
    role_counts[role]=len(items)
    agents.extend(items)
  if not agents:
   raise RuntimeError('MCube returned no employees for any role; existing directory preserved')
  now=self.now();result=[];seen=set();skipped=0;conflicts=0
  for a in agents:
   number=self.phone(a.get('emp_phone') or a.get('agent_number') or a.get('emp_mobile') or a.get('emp_alternative_phone'))
   if not number:
    skipped+=1;continue
   if number in seen:
    conflicts+=1;continue
   seen.add(number)
   result.append([number,str(a.get('agent_name') or a.get('emp_name') or a.get('name') or ''),str(a.get('email') or a.get('emp_email') or ''),now,
                  str(a.get('agent_id') or ''),str(a.get('role') or ''),str(a.get('status') or ''),
                  str(a.get('role3') or ''),str(a.get('role4') or ''),str(a.get('role5') or '')])
  if not result:raise RuntimeError('No valid employee mobile numbers; directory unchanged')
  # Compare against the existing directory before changing it. Do not discard
  # additional roles or silently claim that unchanged records were missing.
  before=self.employees()
  before_by_phone={self.phone(x.get('agent_number')):x for x in before if self.phone(x.get('agent_number'))}
  after_by_phone={row[0]:row for row in result}
  added=sum(p not in before_by_phone for p in after_by_phone)
  removed=sum(p not in after_by_phone for p in before_by_phone)
  changed=sum(p in before_by_phone and
              (str(before_by_phone[p].get('agent_name',''))!=row[1] or
               str(before_by_phone[p].get('email',''))!=row[2] or
               any(str(before_by_phone[p].get(field,''))!=row[idx] for idx,field in enumerate(EMP_HEADERS[4:],4)))
              for p,row in after_by_phone.items())
  # Refresh only if membership or actual details differ; timestamp alone
  # should not force rewriting the entire sheet on every scheduled run.
  if added or removed or changed or len(before)!=len(result):
   self.replace('Employee_Directory',EMP_HEADERS,result)
   verified=self.employees()
   verified_phones={self.phone(x.get('agent_number')) for x in verified if self.phone(x.get('agent_number'))}
   if verified_phones!=set(after_by_phone) or len(verified)!=len(result):
    raise RuntimeError('Employee directory verification failed after write')
   updated=True
  else:
   updated=False
  self.set_sync('employee_sync',now)
  return {'count':len(result),'fetched':len(agents),'skipped_missing_phone':skipped,
          'duplicate_phone':conflicts,'role_counts':role_counts,'last_sync':now,
          'previous_count':len(before),'added':added,'removed':removed,
          'details_changed':changed,'sheet_updated':updated}
 def get_sync(self,key):
  for x in self.read('Workflow_Sync',SYNC_HEADERS):
   if x.get('key')==key:return str(x.get('value',''))
  return ''
 def set_sync(self,key,value):
  rows=self.read('Workflow_Sync',SYNC_HEADERS)
  rows=[r for r in rows if r.get('key')!=key]+[{'key':key,'value':str(value)}]
  self.replace('Workflow_Sync',SYNC_HEADERS,[[r['key'],r['value']] for r in rows])
 async def fetch_calls(self):
  cfg=await asyncio.to_thread(self.settings)
  from .mcube_config_auth import fresh_token
  url=os.getenv('MCUBE_CONFIG_BASE_URL','https://config.mcube.com/Restmcube-api').rstrip('/')+'/filter-inbound'
  limit=int(cfg['call_page_size']); collected=[]; offset=0; max_pages=100
  async with httpx.AsyncClient(timeout=45) as client:
   for _ in range(max_pages):
    payload={'arr':{'clicktocalldid':str(cfg['request_did']),'duration_type':'total_duration'},'type':'today','filters':None,'tabtype':'','filter':'','month':'','offset':offset,'limit':limit,'Authorization':''}
    try:
     payload['Authorization']=await fresh_token(self.c,client)
    except HTTPException: raise
    except Exception as exc:
     log.exception('MCube config login connection failed')
     raise RuntimeError(f'MCube login connection: {type(exc).__name__}') from exc
    try:
     r=await client.post(url,content=json.dumps(payload,separators=(',',':')),headers={'Accept':'application/json, text/plain, */*','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Origin':'https://unext-acquisition.mcube.com','Referer':'https://unext-acquisition.mcube.com/'})
    except httpx.RequestError as exc:
     log.exception('MCube inbound request network failure')
     raise RuntimeError(f'MCube inbound API connection: {type(exc).__name__}') from exc
    try:
     r.raise_for_status();data=r.json()
    except (httpx.HTTPStatusError,ValueError) as exc:
     log.exception('MCube inbound API response failed (HTTP %s)',r.status_code)
     raise RuntimeError(f'MCube inbound API response: HTTP {r.status_code}') from exc
    def find_calls(node,depth=0):
     if depth>5:return None
     if isinstance(node,list):
      if not node:return []
      if isinstance(node[0],dict) and any(k in node[0] for k in ('callid','callto','dialstatus')):return node
      for x in node:
       found=find_calls(x,depth+1)
       if found is not None:return found
     if isinstance(node,dict):
      for x in node.values():
       found=find_calls(x,depth+1)
       if found is not None:return found
     return None
    page=data.get('clicktocall') if isinstance(data,dict) else None
    if not isinstance(page,list):raise RuntimeError('Unrecognized inbound response schema; expected clicktocall list; no requests written')
    if any(not isinstance(item,dict) for item in page):raise RuntimeError('Invalid MCube call row; no requests written')
    collected.extend(page)
    if len(page)<limit:break
    offset+=limit
   else:raise RuntimeError('Inbound page safety limit reached; review pagination')
  return cfg,collected
 async def sync_calls(self):
  cfg,calls=await self.fetch_calls()
  active=self.read('Active_DIDs',self.c.DID_HEADERS)
  employees=self.employees()
  # Employees are the authoritative eligibility list for matching inbound callto.
  # A DID assignment is additionally required to make a request actionable.
  employee_map={};duplicate_employees=set()
  for emp in employees:
   number=self.phone(emp.get('agent_number'))
   if not number:continue
   if number in employee_map:duplicate_employees.add(number)
   else:employee_map[number]=emp
  for number in duplicate_employees:employee_map.pop(number,None)
  agents={};ambiguous=set()
  for row in active:
   number=self.phone(row.get('agent_no') or row.get('agent_number'))
   if not number or number not in employee_map:continue
   if number in agents:ambiguous.add(number)
   else:agents[number]=row
  for number in ambiguous:agents.pop(number,None)
  previous={self.canonical_callid(x.get('callid')) for x in self.read('Call_Request_Events',CALL_HEADERS)}
  previous.discard('')
  pending={str(x['agent_number']):x for x in self.requests() if x.get('status') in ('pending','review_required','approved','processing')}
  recent=self.recent_agents(cfg['recent_replacement_days'])
  created=0;repeated=0;ignored=0
  skipped={'invalid_record':0,'not_inbound':0,'not_cancelled':0,'missing_or_seen_callid':0,'employee_not_found':0,'no_unique_active_did':0,'request_did_mismatch':0,'invalid_call_time':0}
  for call in calls:
   if not isinstance(call,dict):skipped['invalid_record']+=1;continue
   direction=str(call.get('direction','')).strip().lower()
   status=str(call.get('dialstatus','')).strip().lower()
   if direction != 'inbound':skipped['not_inbound']+=1;continue
   if status != 'cancel':skipped['not_cancelled']+=1;continue
   callid=self.canonical_callid(call.get('callid'));phone=self.phone(call.get('callto'))
   if not callid or callid in previous:skipped['missing_or_seen_callid']+=1;continue
   if phone not in employee_map:skipped['employee_not_found']+=1;continue
   if phone not in agents:skipped['no_unique_active_did']+=1;continue
   # The request DID is enforced by the server-side query. Some MCube rows omit this field;
   # reject explicit mismatches but accept absent fields.
   if call.get('clicktocalldid') and self.phone(call.get('clicktocalldid'))!=self.phone(cfg['request_did']):skipped['request_did_mismatch']+=1;continue
   agent=agents[phone];emp=employee_map[phone];first=self.call_time(call.get('starttime'));end=self.call_time(call.get('endtime'))
   if not first:skipped['invalid_call_time']+=1;continue
   req=pending.get(phone)
   if req:
    req['last_call_utc']=max((str(req.get('last_call_utc') or ''),first),key=lambda x: datetime.fromisoformat(x.replace('Z','+00:00')).timestamp() if x else 0);req['call_count']=int(req.get('call_count') or 0)+1
    self.update_request(req);repeated+=1
   else:
    reqid=str(uuid.uuid4())
    warning=phone in recent
    req=dict.fromkeys(REQUEST_HEADERS,'')
    req.update(request_id=reqid,callid=callid,callto=phone,agent_number=phone,agent_name=agent.get('agent_name','') or emp.get('agent_name',''),agent_email=emp.get('email',''),current_did=str(agent.get('did_no','')),first_call_utc=first,last_call_utc=first,call_count=1,status='review_required' if warning and cfg['require_recent_review'] else 'pending',recent_warning='yes' if warning else 'no',reminder_count=0)
    self.update_request(req);pending[phone]=req;created+=1
   self.append('Call_Request_Events',CALL_HEADERS,[callid,req['request_id'],phone,first,end,'cancel','inbound',self.now(),str(agent.get('did_no','')),str(cfg['request_did'])]);previous.add(callid)
   if not req.get('replacement_batch') and int(req.get('call_count') or 0)==1 and str(req.get('callid'))==callid:
    if cfg['notify_on_queue']:
     await self.outbound_notification(req,'queued',cfg)
     if cfg.get('notify_level2_on_queue'):
      await self.outbound_notification(req,'queued_level2',cfg)
    if cfg['email_on_queue']:
     await self.send_email(req,'queued',cfg)
  self.set_sync('calls_sync',self.now())
  return {'created':created,'repeated':repeated,'ignored':sum(skipped.values()),'fetched':len(calls),'request_did':cfg['request_did'],'skipped_reasons':skipped,'employee_count':len(employees),'active_did_count':len(active)}
 def recent_agents(self,days):
  cutoff=datetime.now(timezone.utc)-timedelta(days=int(days));recent={}
  for row in self.read('Change_Logs',self.c.LOG_HEADERS):
   if row.get('event')!='REASSIGNMENT_COMPLETE':continue
   try: when=datetime.fromisoformat(str(row.get('time_utc','')).replace('Z','+00:00'))
   except Exception:continue
   if when.tzinfo is None:when=when.replace(tzinfo=timezone.utc)
   if when>=cutoff:recent[self.phone(row.get('agent_number'))]=row
  return recent
 async def outbound_notification(self,req,kind,cfg=None,target=None):
  cfg=cfg or self.settings()
  # MCube bridges exenumber first, then dials custnumber. Keep agent's
  # verified MCube number as exenumber for agent notifications.
  level2 = kind in ('queued_level2', 'reminder_level2') or (kind == 'reminder' and bool(target) and target in (cfg.get('second_contact_number'),cfg.get('level2_custnumber')))
  if kind == 'completed':
   exenumber=self.phone(req.get('agent_number'))
   custnumber=self.phone(cfg.get('agent_notification_custnumber') or cfg.get('request_did'))
  elif level2:
   exenumber=self.phone(cfg.get('level2_exenumber') or cfg.get('outbound_caller_number'))
   custnumber=self.phone(cfg.get('level2_custnumber') or cfg.get('second_contact_number'))
  else:
   exenumber=self.phone(cfg.get('level1_exenumber') or cfg.get('outbound_caller_number'))
   custnumber=self.phone(cfg.get('level1_custnumber') or cfg.get('first_contact_number'))
  if not exenumber or not custnumber:
   return {'status':'skipped','reason':'Valid exenumber and custnumber required for '+kind}
  token=os.getenv('MCUBE_BEARER_TOKEN','').removeprefix('Bearer ').strip()
  if not token:return {'status':'skipped','reason':'MCube token missing'}
  payload={'HTTP_AUTHORIZATION':token,'exenumber':exenumber,'custnumber':custnumber,'consent':'Yes'}
  try:
   async with httpx.AsyncClient(timeout=35) as client:
    r=await client.post(self.c.MCUBE+'/outbound-calls',json=payload,headers={'Content-Type':'application/json'})
    r.raise_for_status();response=r.json()
   status='submitted' if isinstance(response,dict) and (str(response.get('status','')).lower() in ('succ','success','200','true') or response.get('callid')) else 'rejected'
   detail=json.dumps({'callid':str(response.get('callid','')),'msg':str(response.get('msg',''))[:120]}) if isinstance(response,dict) else 'Unexpected response'
  except Exception as exc:
   status='uncertain';detail=type(exc).__name__
  self.append('Notification_Logs',NOTIFY_HEADERS,[self.now(),req['request_id'],f'call_{kind}',custnumber,status,'exenumber='+exenumber+'; '+detail])
  return {'status':status,'detail':detail}
 async def send_email(self,req,kind,cfg=None):
  cfg=cfg or self.settings();to=str(req.get('agent_email','')).strip()
  if not to:return {'status':'skipped','reason':'No employee email'}
  if cfg.get('mail_provider') not in ('brevo','smtp'):
   return {'status':'skipped','reason':'Email provider disabled'}
  from .brevo import send_brevo
  subject='MCube DID replacement '+('completed' if kind=='completed' else 'request received')
  body=f"Hello {req.get('agent_name','Agent')},\n\nYour DID replacement {'is complete' if kind=='completed' else 'request has been queued'}.\nRequest ID: {req['request_id']}\nOld DID: {req.get('current_did','')}\n"+(f"New DID: {req.get('replacement_new_did','')}\n" if kind=='completed' else '')+'\nRegards,\nDID Management Team'
  try:
   result=await send_brevo(to,subject,body)
   status='accepted';details=result['message_id']
  except Exception as exc:
   status='failed';details=type(exc).__name__
  self.append('Notification_Logs',NOTIFY_HEADERS,[self.now(),req['request_id'],f'email_{kind}',to,status,details])
  return {'status':status}
 @staticmethod
 def reminder_timestamp(value):
  """Legacy naive Sheets timestamps were UTC; new values carry IST offset."""
  stamp=datetime.fromisoformat(str(value).strip().replace('Z','+00:00'))
  return stamp.replace(tzinfo=timezone.utc) if stamp.tzinfo is None else stamp.astimezone(timezone.utc)
 async def due_reminders(self):
  cfg=await asyncio.to_thread(self.settings)
  summary={'processed':0,'submitted':0,'rejected':0,'skipped':0,'uncertain':0,
           'eligible':0,'pending':0,'not_due':0,'max_attempts':0,'invalid_timestamp':0,
           'disabled':not bool(cfg['reminder_enabled']),'details':[]}
  if summary['disabled']:return summary
  now=datetime.now(timezone.utc)
  for req in await asyncio.to_thread(self.requests):
   if req.get('status') not in ('pending','review_required','approved'):continue
   summary['pending']+=1
   try:
    created=self.reminder_timestamp(req['first_call_utc'])
    elapsed=(now-created).total_seconds()/60
    count=int(req.get('reminder_count') or 0)
   except (ValueError,TypeError,OverflowError,KeyError):
    summary['invalid_timestamp']+=1;continue
   if count>=int(cfg['reminder_max_attempts']):summary['max_attempts']+=1;continue
   if elapsed<float(cfg['reminder_first_minutes']):summary['not_due']+=1;continue
   last=req.get('last_reminder_utc','')
   if last:
    try:
     if (now-self.reminder_timestamp(last)).total_seconds()/60<float(cfg['reminder_interval_minutes']):
      summary['not_due']+=1;continue
    except (ValueError,TypeError,OverflowError):
     # Avoid duplicate calls if the last attempt time cannot be verified.
     summary['invalid_timestamp']+=1;continue
   summary['eligible']+=1
   level2=elapsed>=float(cfg['reminder_escalation_minutes'])
   kind='reminder_level2' if level2 else 'reminder'
   # Persist attempt intent before calling MCube. Even an uncertain response
   # must not be retried automatically: MCube may have initiated the call.
   req['reminder_count']=count+1;req['last_reminder_utc']=self.now()
   await asyncio.to_thread(self.update_request,req)
   try: result=await self.outbound_notification(req,kind,cfg)
   except Exception as exc:
    log.exception('Reminder notification failed for request %s',req.get('request_id'))
    result={'status':'uncertain','detail':type(exc).__name__}
   status=str(result.get('status','uncertain'))
   if status not in ('submitted','rejected','skipped','uncertain'):status='uncertain'
   summary[status]+=1;summary['processed']+=1
   summary['details'].append({'request_id':req.get('request_id'), 'result':status,
                              'reason':str(result.get('reason') or result.get('detail') or '')[:160]})
  return summary
 def review(self,request_id,approved,reason,actor):
  req=next((r for r in self.requests() if str(r['request_id'])==request_id),None)
  if not req:raise HTTPException(404,'Request not found')
  if req['status'] not in ('review_required','pending','approved'):raise HTTPException(409,'Request cannot be reviewed in current state')
  req['status']='approved' if approved else 'rejected'
  self.update_request(req)
  self.append('Notification_Logs',NOTIFY_HEADERS,[self.now(),request_id,'review',actor,req['status'],reason])
  return req
