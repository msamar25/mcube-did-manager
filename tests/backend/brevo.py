"""Minimal Brevo transactional email integration; never log credentials or message body."""
import os
import httpx

async def send_brevo(to: str, subject: str, body: str):
    key=os.getenv('BREVO_API_KEY','').strip()
    sender=os.getenv('BREVO_SENDER_EMAIL','').strip()
    if not key or not sender:raise RuntimeError('Brevo not configured')
    data={'sender':{'name':os.getenv('BREVO_SENDER_NAME','MCube DID Manager'),'email':sender},'to':[{'email':to}], 'subject':subject,'textContent':body}
    async with httpx.AsyncClient(timeout=20) as client:
        response=await client.post('https://api.brevo.com/v3/smtp/email',headers={'api-key':key,'accept':'application/json'},json=data)
        response.raise_for_status()
        result=response.json()
    if not result.get('messageId'):raise RuntimeError('Brevo did not confirm acceptance')
    return {'message_id':result['messageId']}
