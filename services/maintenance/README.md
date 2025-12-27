Maintenance service runs the system operator background agent and exposes a simple health wrapper.

Run locally with docker-compose:

```powershell
docker-compose -f infinity-gateway/services/maintenance/docker-compose.yml up --build
```

Ensure `background_agent/.env.secret` contains credentials (API key, DB connection).

The wrapper endpoint `/maintenance/health` proxies the `background_agent` `/health`.
Background Agent (maintenance)

This folder contains the `background_agent` service used to perform system maintenance tasks: cleaning, code fixes, upgrades, and operator tasks.

The real implementation is located in the top-level `background_agent/` directory. This service folder provides a deployment wrapper and helper scripts to run it as part of the `infinity-gateway` system.
