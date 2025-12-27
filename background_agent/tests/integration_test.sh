#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

docker compose -f docker-compose.postgres.yml up -d --build
# wait for healthy
sleep 5

# register a fake agent
curl -X POST http://localhost:8005/agents/register -H "x-api-key: changeme" -d "name=test_agent" -d "endpoint=http://httpbin.org/status/200"
# enqueue
curl -X POST http://localhost:8005/enqueue -H "x-api-key: changeme" -H "Content-Type: application/json" -d '{"agent":"test_agent","command":"{}"}'

echo "Integration test completed. Check logs: docker compose -f docker-compose.postgres.yml logs -f background_agent"
