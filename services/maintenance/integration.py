from fastapi import FastAPI
import requests
import os

app = FastAPI()

BG_HOST = os.environ.get('BACKGROUND_AGENT_HOST', 'http://localhost:8005')

@app.get('/maintenance/health')
def health():
    try:
        r = requests.get(f"{BG_HOST}/health", timeout=3)
        return { 'status': 'ok', 'bg': r.json() }
    except Exception as e:
        return { 'status': 'degraded', 'error': str(e) }
