from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import google.auth
import os
try:
    from google.cloud import secretmanager_v1
except Exception:
    secretmanager_v1 = None

try:
    from google.cloud import iam_credentials
except Exception:
    iam_credentials = None
from datetime import datetime

app = FastAPI()
sm_client = secretmanager_v1.SecretManagerServiceClient() if secretmanager_v1 else None
iam_client = iam_credentials.IAMCredentialsClient() if iam_credentials else None


class ImpersonateReq(BaseModel):
    target_service_account: str  # email e.g. sheets-agent@project.iam.gserviceaccount.com
    scopes: list[str]
    lifetime_seconds: int = 3600


@app.get('/health')
def health():
    return {'status': 'ok'}


@app.post('/impersonate')
def impersonate(req: ImpersonateReq):
    # Build resource name for IAM Credentials API
    sa_email = req.target_service_account
    if '@' not in sa_email:
        raise HTTPException(status_code=400, detail='target_service_account must be a service account email')

    name = f"projects/-/serviceAccounts/{sa_email}"
    try:
        lifetime = f"{int(req.lifetime_seconds)}s"
        if not iam_client:
            raise HTTPException(status_code=500, detail='google-cloud-iam-credentials not installed in environment')
        response = iam_client.generate_access_token(
            request={
                'name': name,
                'delegates': [],
                'scope': req.scopes,
                'lifetime': lifetime,
            }
        )

        # response has access_token and expire_time
        expires_at = response.expire_time.isoformat()
        return {
            'access_token': response.access_token,
            'expire_time': expires_at,
            'scopes': req.scopes,
            'service_account': sa_email,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get('/secret/{name}')
def get_secret(name: str):
    # If USE_SECRET_MANAGER env var is set to truthy, fetch from GCP Secret Manager
    use_sm = os.environ.get('USE_SECRET_MANAGER', '').lower() in ('1', 'true', 'yes')
    if use_sm:
        project = os.environ.get('GCP_PROJECT')
        if not project:
            raise HTTPException(status_code=500, detail='GCP_PROJECT not set')
        if not sm_client:
            raise HTTPException(status_code=500, detail='google-cloud-secret-manager not installed in environment')
        secret_name = f"projects/{project}/secrets/{name}/versions/latest"
        try:
            resp = sm_client.access_secret_version(request={'name': secret_name})
            payload = resp.payload.data.decode('utf-8')
            return {'secret': payload}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # Fallback: read from local central folder (legacy behavior)
    central = os.environ.get('CENTRAL_CREDENTIALS_PATH', r"C:\Users\JARVIS\AppData\Local\InfinityXOne\CredentialManager")
    candidate = os.path.join(central, name)
    if os.path.exists(candidate):
        try:
            with open(candidate, 'r', encoding='utf-8') as f:
                data = f.read()
            return {'secret': data}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    # last-ditch: try reading from .credentials/google/name under repo root
    repo_creds = os.path.join(os.getcwd(), '.credentials', 'google', name)
    if os.path.exists(repo_creds):
        try:
            with open(repo_creds, 'r', encoding='utf-8') as f:
                data = f.read()
            return {'secret': data}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    raise HTTPException(status_code=404, detail='secret not found')
