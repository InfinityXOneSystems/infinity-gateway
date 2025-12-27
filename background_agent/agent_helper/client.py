import requests
import os

API_URL = os.environ.get('BACKGROUND_AGENT_URL', 'http://localhost:8005')
API_KEY = os.environ.get('BACKGROUND_AGENT_API_KEY', 'changeme')

class AgentClient:
    def __init__(self, api_url=None, api_key=None):
        self.api_url = api_url or API_URL
        self.api_key = api_key or API_KEY
        self.headers = {'x-api-key': self.api_key}

    def register(self, name, endpoint, meta=None):
        resp = requests.post(f"{self.api_url}/agents/register", headers=self.headers, data={'name': name, 'endpoint': endpoint, 'meta': meta or {}})
        resp.raise_for_status()
        return resp.json()

    def unregister(self, name):
        resp = requests.post(f"{self.api_url}/agents/unregister", headers=self.headers, data={'name': name})
        resp.raise_for_status()
        return resp.json()

    def enqueue(self, agent, command, meta=None):
        payload = {'agent': agent, 'command': command, 'meta': meta or {}}
        resp = requests.post(f"{self.api_url}/enqueue", headers={**self.headers, 'Content-Type': 'application/json'}, json=payload)
        resp.raise_for_status()
        return resp.json()
