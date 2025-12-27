import os
import requests

OMNI_BASE = os.environ.get("OMNI_GATEWAY_URL", "http://localhost:8080")
API_KEY = os.environ.get("OMNI_GATEWAY_API_KEY", "")

def enqueue_agent_task(role: str, objective: str, context: dict = None):
    url = f"{OMNI_BASE}/api/agents/enqueue"
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["X-API-KEY"] = API_KEY
    payload = {"role": role, "objective": objective, "context": context or {}}
    r = requests.post(url, json=payload, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()

if __name__ == '__main__':
    print(enqueue_agent_task("visionary", "Analyze recent market signals", {"source":"background_agent"}))
