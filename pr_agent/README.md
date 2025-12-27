# PR Agent

Run the webhook and worker locally for testing.

Start Redis (or set `CELERY_BROKER_URL` to your broker):

```
docker run -p 6379:6379 -d redis:7
```

Run the FastAPI webhook:

```
uvicorn webhook:app --reload --port 8000
```

Run the Celery worker:

```
celery -A celery_app.celery_app worker --loglevel=info
```

Set `GITHUB_TOKEN` env var to allow posting comments back to PRs.
