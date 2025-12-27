from fastapi import FastAPI, Request, Header, HTTPException
import hmac
import hashlib
import os
import json
from tasks import process_pr

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

    event = request.headers.get('X-GitHub-Event')
    if event == 'pull_request':
        action = payload.get('action')
        pr = payload.get('pull_request') or {}
        if action in ('opened', 'synchronize', 'reopened') and pr:
            repo = payload['repository']['full_name']
            pr_number = pr['number']
            clone_url = pr.get('head', {}).get('repo', {}).get('clone_url') or payload['repository']['clone_url']
            branch = pr.get('head', {}).get('ref')

            process_pr.delay(repo, pr_number, clone_url, branch)
            return {"ok": True, "enqueued": True}

    return {"ok": True}
