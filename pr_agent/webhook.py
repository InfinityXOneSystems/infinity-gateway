from fastapi import FastAPI, Request, Header, HTTPException
import hmac
import hashlib
import os
import json

app = FastAPI()

GITHUB_SECRET = os.getenv('GITHUB_WEBHOOK_SECRET', '')

def verify_signature(body: bytes, signature: str) -> bool:
    if not GITHUB_SECRET:
        return False
    mac = hmac.new(GITHUB_SECRET.encode(), msg=body, digestmod=hashlib.sha256)
    expected = 'sha256=' + mac.hexdigest()
    return hmac.compare_digest(expected, signature)

@app.post('/webhook')
async def webhook(request: Request, x_hub_signature_256: str = Header(None)):
    body = await request.body()
    if x_hub_signature_256 is None or not verify_signature(body, x_hub_signature_256):
        raise HTTPException(status_code=401, detail='Invalid signature')
    payload = await request.json()
    # Minimal handling: forward event to worker queue
    # TODO: enqueue to real task queue
    print('Received event:', payload.get('action'))
    return {"ok": True}
