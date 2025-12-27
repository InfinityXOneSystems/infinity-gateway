import time
from fastapi.testclient import TestClient
from background_agent import app


client = TestClient(app)


def test_health_endpoint():
    resp = client.get('/health')
    assert resp.status_code == 200
    data = resp.json()
    assert 'workers' in data
    assert 'db_ok' in data
