"""Request queue, persistent settings, role access, and outbound call notifications.
All writes go through Sheets; intended for one Render worker, not a transactional multi-node database.
"""
import os, json, uuid, hmac, asyncio, logging
from datetime import datetime, timezone, timedelta
import httpx
from fastapi import HTTPException
from pydantic import BaseModel, Field

log=logging.getLogger('mcube.workflows')
DEFAULTS={
 'request_did':'8071845706', 'recent_replacement_days':3, 'sync_mode':'login',
 'call_page_size':30, 'employee_refresh_hours':24, 'request_sync_lookback_minutes':30,
 'reminder_enabled':False, 'reminder_first_minutes':0, 'reminder_interval_minutes':60,
 'reminder_escalation_minutes':120, 'reminder_max_attempts':3,
 'notify_on_queue':False, 'notify_on_completion':False,
 'first_contact_number':'', 'second_contact_number':'', 'outbound_caller_number':'',
 'email_on_queue':False, 'email_on_completion':False, 'require_recent_review':True,
 'admin_email':'', 'mail_from':'', 'mail_provider':'brevo'
}
SETTINGS_HEADERS=['key','value']
SETTING_LOG_HEADERS=['timestamp_utc','actor','key','old_value','new_value']
REQUEST_HEADERS=['request_id','callid','callto','agent_number','agent_name','agent_email','current_did','first_call_utc','last_call_utc','call_count','status','recent_warning','last_reminder_utc','reminder_count','replacement_batch','replacement_new_did','completed_utc']
# Legacy *_utc column names remain for existing Google Sheets compatibility; values are IST (+05:30).
CALL_HEADERS=['callid','request_id','callto','starttime','endtime','dialstatus','direction','ingested_utc']
NOTIFY_HEADERS=['timestamp_utc','request_id','kind','target','result','details']
EMP_HEADERS=['agent_number','agent_name','email','updated_utc']
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
 def call_time(value):
  from zoneinfo import ZoneInfo
  try:
   stamp=datetime.fromisoformat(str(value).strip().replace('Z','+00:00'))
   if stamp.tzinfo is None:stamp=stamp.replace(tzinfo=ZoneInfo('Asia/Kolkata'))
   return stamp.astimezone(timezone(timedelta(hours=5,minutes=30))).isoformat(timespec='seconds')
  except (ValueError,TypeError):return '' 
 def read(self,name,headers): return self.c.get_rows(name,headers)
 def append(self,name,headers,row): self.c.worksheet(self.c.sheet(),name,headers).append_row(row,value_input_option='RAW')
 def replace(self,name,headers,rows): self.c.replace_rows(name,headers,rows)
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
  for k in ['first_contact_number','second_contact_number','outbound_caller_number']:
   if str(new[k]) and (not str(new[k]).isdigit() or len(str(new[k]))!=10): raise HTTPException(422,f'{k} must be a 10-digit number')
  for k in ['call_page_size','recent_replacement_days','reminder_interval_minutes','reminder_escalation_minutes','reminder_max_attempts','employee_refresh_hours']:
   if not isinstance(new[k],int) or not 1<=new[k]<=10000: raise HTTPException(422,f'Invalid {k}')
  if new['reminder_enabled'] and not new['first_contact_number']: raise HTTPException(422,'First reminder contact is required')
  if new['reminder_enabled'] and not new['outbound_caller_number']: raise HTTPException(422,'Outbound caller number is required')
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
  from .mcube_config_auth import fresh_token
  url=os.getenv('MCUBE_CONFIG_BASE_URL','https://config.mcube.com/Restmcube-api').rstrip('/')+'/emp-filter'
  # Request all four employee roles; the former ['2'] filter omitted other accounts.
  payload={'search_val':['2','3','4','5'],'search_type':'Roles','searchFilter':'','daterange':None,'Authorization':''}
  async with httpx.AsyncClient(timeout=45) as client:
   payload['Authorization']=await fresh_token(self.c,client)
   r=await client.post(url,json=payload,headers={'Content-Type':'application/json'})
   r.raise_for_status();data=r.json()
  # MCube installations return different wrappers. Accept only arrays with employee fields.
  def find_arrays(node,depth=0):
   if depth>6:return None
   if isinstance(node,list):
    if node and all(isinstance(x,dict) for x in node) and any(any(k in x for k in ('emp_phone','agent_number','emp_mobile','emp_alternative_phone')) for x in node):return node
    for item in node:
     out=find_arrays(item,depth+1)
     if out is not None:return out
   if isinstance(node,dict):
    for key in ('employees','employee','agents','data','result','response','records','list'):
     if key in node:
      out=find_arrays(node[key],depth+1)
      if out is not None:return out
    for v in node.values():
     out=find_arrays(v,depth+1)
     if out is not None:return out
   return None
  agents=find_arrays(data)
  if agents is None:raise RuntimeError('Unrecognized MCube employee response; existing directory preserved')
  if not agents:raise RuntimeError('Empty MCube employee response; existing directory preserved')
  now=self.now();result=[];seen=set()
  for a in agents:
   number=self.phone(a.get('emp_phone') or a.get('agent_number') or a.get('emp_mobile') or a.get('emp_alternative_phone'))
   if not number or number in seen:continue
   seen.add(number)
   result.append([number,str(a.get('agent_name') or a.get('emp_name') or a.get('name') or ''),str(a.get('email') or a.get('emp_email') or ''),now])
  if not result:raise RuntimeError('Employee directory empty; preserving previous snapshot')
  self.replace('Employee_Directory',EMP_HEADERS,result)
  self.set_sync('employee_sync',now)
  return {'count':len(result),'last_sync':now}
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
    payload['Authorization']=await fresh_token(self.c,client)
    r=await client.post(url,json=payload,headers={'Content-Type':'application/json'})
    r.raise_for_status();data=r.json()
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
    if page is None:raise RuntimeError('Unrecognized inbound response schema; no requests written')
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
  previous={str(x['callid']) for x in self.read('Call_Request_Events',CALL_HEADERS)}
  pending={str(x['agent_number']):x for x in self.requests() if x.get('status') in ('pending','review_required','approved','processing')}
  recent=self.recent_agents(cfg['recent_replacement_days'])
  created=0;repeated=0;ignored=0
  for call in calls:
   if not isinstance(call,dict):continue
   if str(call.get('direction','')).strip().lower()!='inbound' or str(call.get('dialstatus','')).strip().lower()!='cancel':continue
   callid=str(call.get('callid','')).strip();phone=self.phone(call.get('callto'))
   if not callid or callid in previous or phone not in agents:continue
   # The clicktocalldid is already applied server-side; reject any mismatching field in a returned row.
   if self.phone(call.get('clicktocalldid'))!=self.phone(cfg['request_did']):continue
   agent=agents[phone];emp=employee_map[phone];first=self.call_time(call.get('starttime'));end=self.call_time(call.get('endtime'))
   if not first:continue
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
   self.append('Call_Request_Events',CALL_HEADERS,[callid,req['request_id'],phone,first,end,'cancel','inbound',self.now()]);previous.add(callid)
   if not req.get('replacement_batch') and int(req.get('call_count') or 0)==1 and str(req.get('callid'))==callid:
    if cfg['notify_on_queue']:
     await self.outbound_notification(req,'queued',cfg)
    if cfg['email_on_queue']:
     await self.send_email(req,'queued',cfg)
  self.set_sync('calls_sync',self.now())
  return {'created':created,'repeated':repeated,'ignored':ignored,'fetched':len(calls),'request_did':cfg['request_did']}
 def recent_agents(self,days):
  cutoff=datetime.now(timezone.utc)-timedelta(days=int(days));recent={}
  for row in self.read('Change_Logs',self.c.LOG_HEADERS):
   if row.get('event')!='REASSIGNMENT_COMPLETE':continue
   try: when=datetime.fromisoformat(str(row.get('time_utc','')).replace('Z','+00:00'))
   except Exception:continue
   if when>=cutoff:recent[self.phone(row.get('agent_number'))]=row
  return recent
 async def outbound_notification(self,req,kind,cfg=None,target=None):
  cfg=cfg or self.settings()
  exenumber=str(cfg.get('outbound_caller_number','')).strip()
  custnumber=str(target or cfg.get('first_contact_number','')).strip()
  if kind=='completed':custnumber=str(req.get('agent_number',''))
  if not exenumber or not custnumber:return {'status':'skipped','reason':'Calling numbers not configured'}
  token=os.getenv('MCUBE_BEARER_TOKEN','').removeprefix('Bearer ').strip()
  if not token:return {'status':'skipped','reason':'MCube token missing'}
  payload={'HTTP_AUTHORIZATION':token,'exenumber':exenumber,'custnumber':custnumber,'consent':'Yes'}
  try:
   async with httpx.AsyncClient(timeout=35) as client:
    r=await client.post(self.c.MCUBE+'/outbound-calls',json=payload,headers={'Content-Type':'application/json'})
    r.raise_for_status();response=r.json()
   status='submitted' if isinstance(response,dict) and str(response.get('status','')).lower()=='succ' and response.get('callid') else 'rejected'
   detail=json.dumps({'callid':str(response.get('callid','')),'msg':str(response.get('msg',''))[:120]}) if isinstance(response,dict) else 'Unexpected response'
  except Exception as exc:
   status='uncertain';detail=type(exc).__name__
  self.append('Notification_Logs',NOTIFY_HEADERS,[self.now(),req['request_id'],f'call_{kind}',custnumber,status,detail])
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
 async def due_reminders(self):
  cfg=await asyncio.to_thread(self.settings)
  if not cfg['reminder_enabled']:return {'processed':0,'disabled':True}
  now=datetime.now(timezone.utc);processed=0
  for req in await asyncio.to_thread(self.requests):
   if req.get('status') not in ('pending','review_required','approved'):continue
   try:created=datetime.fromisoformat(str(req['first_call_utc']).replace('Z','+00:00'))
   except Exception:continue
   elapsed=(now-created).total_seconds()/60
   count=int(req.get('reminder_count') or 0)
   if count>=cfg['reminder_max_attempts'] or elapsed<cfg['reminder_first_minutes']:continue
   last=req.get('last_reminder_utc','')
   if last:
    try:
     if (now-datetime.fromisoformat(str(last).replace('Z','+00:00'))).total_seconds()/60<cfg['reminder_interval_minutes']:continue
    except Exception:pass
   target=cfg['second_contact_number'] if elapsed>=cfg['reminder_escalation_minutes'] and cfg['second_contact_number'] else cfg['first_contact_number']
   # Journal intent first to avoid duplicate calls if process crashes mid-request.
   req['reminder_count']=count+1;req['last_reminder_utc']=self.now()
   await asyncio.to_thread(self.update_request,req)
   await self.outbound_notification(req,'reminder',cfg,target)
   processed+=1
  return {'processed':processed}
 def review(self,request_id,approved,reason,actor):
  req=next((r for r in self.requests() if str(r['request_id'])==request_id),None)
  if not req:raise HTTPException(404,'Request not found')
  if req['status'] not in ('review_required','pending','approved'):raise HTTPException(409,'Request cannot be reviewed in current state')
  req['status']='approved' if approved else 'rejected'
  self.update_request(req)
  self.append('Notification_Logs',NOTIFY_HEADERS,[self.now(),request_id,'review',actor,req['status'],reason])
  return req
