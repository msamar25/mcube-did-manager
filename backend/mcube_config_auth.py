"""Encrypted MCube config credentials and fresh login per config API invocation.
Only ciphertext is persisted in Sheets; encryption key remains in Render env.
"""
import json, os, logging
from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
import httpx

log=logging.getLogger('mcube.config_auth')
HEADERS=['key','value']

def _cipher():
    key=os.getenv('MCUBE_CREDENTIAL_ENCRYPTION_KEY','').strip()
    if not key:
        raise HTTPException(503,'MCUBE_CREDENTIAL_ENCRYPTION_KEY is not configured in Render')
    try:return Fernet(key.encode())
    except (ValueError,TypeError) as exc:raise HTTPException(503,'Invalid MCube encryption key in Render') from exc

def _read(core):
    rows=core.get_rows('MCube_Config_Credentials',HEADERS)
    return next((str(r.get('value','')) for r in rows if r.get('key')=='credentials'), '')

def configured(core):
    return bool(_read(core))

def save(core,username,password):
    username=username.strip()
    if not username or not password or len(username)>256 or len(password)>2048:
        raise HTTPException(422,'Valid MCube username and password are required')
    ciphertext=_cipher().encrypt(json.dumps({'username':username,'password':password}).encode()).decode()
    ws=core.worksheet(core.sheet(),'MCube_Config_Credentials',HEADERS)
    ws.update(range_name='A1',values=[HEADERS,['credentials',ciphertext]],value_input_option='RAW')
    if _read(core)!=ciphertext:raise HTTPException(503,'Encrypted credential write could not be verified')

def _credentials(core):
    value=_read(core)
    if not value:raise HTTPException(503,'MCube config credentials not saved; configure them in Settings')
    try:
        result=json.loads(_cipher().decrypt(value.encode()))
        return result['username'],result['password']
    except (InvalidToken,ValueError,KeyError,TypeError) as exc:
        raise HTTPException(503,'Unable to decrypt MCube credentials; check encryption key') from exc

def _extract_token(data):
    # MCube response structure has not yet been confirmed. Never accept arbitrary values.
    if not isinstance(data,dict):raise HTTPException(502,'MCube login returned an unsupported response')
    if str(data.get('status','')).lower() in ('fail','failed','error','false','0'):
        raise HTTPException(502,'MCube rejected the username/password')
    def walk(obj,depth=0):
        if depth>3 or not isinstance(obj,dict):return None
        for key in ('token','access_token','auth_token','jwt','Authorization','authorization'):
            value=obj.get(key)
            if isinstance(value,str) and len(value.strip())>=12:return value.removeprefix('Bearer ').strip()
        for key in ('data','result','user','response'):
            found=walk(obj.get(key),depth+1)
            if found:return found
        return None
    token=walk(data)
    if not token:
        log.warning('MCube login response has no recognized token field; top-level keys: %s',sorted(data.keys())[:20])
        raise HTTPException(502,'MCube login succeeded but token field is unrecognized. Share redacted response field names to configure mapping.')
    return token

async def fresh_token(core,client):
    import asyncio
    username,password=await asyncio.to_thread(_credentials,core)
    url=os.getenv('MCUBE_CONFIG_BASE_URL','https://config.mcube.com/Restmcube-api').rstrip('/')+'/login'
    # User-supplied cURL declares form content-type but supplies JSON text.
    # Match the captured body format; don't include browser-only headers.
    try:
        response=await client.post(url,content=json.dumps({'username':username,'password':password}),headers={'Accept':'application/json','Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Origin':'https://unext-acquisition.mcube.com','Referer':'https://unext-acquisition.mcube.com/'})
        response.raise_for_status()
        data=response.json()
    except (httpx.HTTPError,ValueError) as exc:
        raise HTTPException(502,'MCube config login failed; check credentials and Render logs') from exc
    return _extract_token(data)
