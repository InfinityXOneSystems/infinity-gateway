Background Agent


Quick start (recommended: Docker + Postgres)

1) Start Postgres + background agent:

```bash
cd background_agent
docker compose -f docker-compose.postgres.yml up -d --build
```

2) Set a secure API key (edit env `BACKGROUND_AGENT_API_KEY` in compose) and restart.

3) Endpoints (use header `x-api-key: <key>`):
- POST /enqueue {agent, command, meta?}
- GET /tasks
- GET /processed
- POST /stop
- POST /start
- GET /health

Notes:
- The Postgres-backed compose file is `docker-compose.postgres.yml`.
- If you only want a quick local dev run, you can still use the SQLite compose, but Postgres is recommended for production.

Secrets & production
- Use Docker secrets or your secret manager to set `BACKGROUND_AGENT_API_KEY`. Example: create `background_agent/.env.secret` from `.env.secret.example` and change `docker-compose` to use the file.

Database migrations
- Alembic scaffold is included in `alembic/`. To create and run migrations:
	- `pip install alembic`
	- edit `alembic.ini` or set `sqlalchemy.url`
	- `alembic revision -m "create tasks" --autogenerate`
	- `alembic upgrade head`

Monitoring
- Prometheus scrape config: `prometheus.bgagent.yml` (add to your Prometheus config).
- Grafana dashboard scaffold: `grafana_bgagent_dashboard.json`.

Integration test
- A basic integration test script lives at `tests/integration_test.sh` (requires Docker).

Agent helper library
- A small `agent_helper` Python client is included at `background_agent/agent_helper` for easy registration and enqueuing from agents.

CI/CD
- A GitHub Actions workflow scaffold `background_agent/.github/workflows/deploy_bgagent.yml` builds and pushes the image when files under `background_agent/` change. Set DockerHub secrets before enabling.

PowerShell integration test
- For Windows, a PowerShell wrapper is available: `background_agent/tests/integration_test.ps1`.

Cloud Run / Omni Gateway integration
- Set `OMNI_GATEWAY_URL` to your deployed Omni Gateway Cloud Run URL (e.g., https://omni-gateway-xxxx.a.run.app)
- Set `OMNI_GATEWAY_API_KEY` in your Cloud Run service's environment variables or Secret Manager
- Use `background_agent/mcp_client.py` to enqueue tasks that route through the Omni Gateway


