Credential Manager
==================

Run locally for development:

```bash
python -m pip install -r requirements.txt
uvicorn app:app --reload --port 8000
```

Build Docker image:

```bash
docker build -t credential-manager:dev .
docker run -p 8000:8080 -e USE_SECRET_MANAGER=false credential-manager:dev
```

Notes:
- In production, set `USE_SECRET_MANAGER=true` and `GCP_PROJECT` env var so the app reads from Google Secret Manager.
Credential Manager
==================

Small FastAPI service to centralize credential access and impersonation for agents. It fetches service account keys from Secret Manager and can issue short-lived credentials or perform impersonation.
