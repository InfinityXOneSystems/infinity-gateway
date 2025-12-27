from fastapi import FastAPI, HTTPException, Depends, Header, Response
from pydantic import BaseModel
import threading
import time
import random
from pathlib import Path
from typing import Optional, List
import requests
import os

BASE_DIR = Path(__file__).parent
AGENTS_FILE = BASE_DIR / "agents_map.json"

from . import secrets as _secrets

# Load secrets (local credential store -> GCP -> env)
_loaded = _secrets.load_secrets()
if _loaded:
    if _loaded.get('BACKGROUND_AGENT_API_KEY'):
        os.environ['BACKGROUND_AGENT_API_KEY'] = _loaded.get('BACKGROUND_AGENT_API_KEY')
    if _loaded.get('POSTGRES_PASSWORD'):
        os.environ['POSTGRES_PASSWORD'] = _loaded.get('POSTGRES_PASSWORD')

API_KEY = os.environ.get("BACKGROUND_AGENT_API_KEY", "changeme")

app = FastAPI(title="Global Background Agent Controller")

import logging
from pythonjsonlogger import jsonlogger
from prometheus_client import Counter, generate_latest, CONTENT_TYPE_LATEST

# structured logging
logger = logging.getLogger("background_agent")
logHandler = logging.StreamHandler()
formatter = jsonlogger.JsonFormatter('%(asctime)s %(levelname)s %(name)s %(message)s')
logHandler.setFormatter(formatter)
logger.addHandler(logHandler)
logger.setLevel(logging.INFO)

# Prometheus metrics
TASKS_ENQUEUED = Counter('bgagent_tasks_enqueued_total', 'Total tasks enqueued')
TASKS_PROCESSED = Counter('bgagent_tasks_processed_total', 'Total tasks processed')

from .db import SessionLocal, init_db, Task as TaskModel, Processed as ProcessedModel, Agent as AgentModel
from .db import engine as DB_ENGINE

# Wait for DB and init
for _ in range(10):
    try:
        init_db()
        break
    except Exception:
        time.sleep(1)

DB_SESSION = SessionLocal


class TaskItem(BaseModel):
    id: Optional[str]
    agent: str
    command: str
    meta: Optional[dict] = None


def require_api_key(x_api_key: str = Header(...)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API Key")


def require_role(x_role: str = Header(None)):
    # simple RBAC: endpoints that change state require 'admin'
    if x_role is None or x_role.lower() != 'admin':
        raise HTTPException(status_code=403, detail="Insufficient role")


def load_agents():
    AGENTS = {}
    with DB_SESSION() as s:
        rows = s.query(AgentModel).all()
        for r in rows:
            AGENTS[r.name] = r.endpoint
    # fall back to file
    if not AGENTS and AGENTS_FILE.exists():
        import json
        AGENTS = json.loads(AGENTS_FILE.read_text())
    return AGENTS


AGENTS = load_agents()


def enqueue_task_db(item: TaskItem):
    from sqlalchemy import select
    tid = item.id or f"t-{int(time.time()*1000)}"
    now = time.time()
    with DB_SESSION() as s:
        obj = s.get(TaskModel, tid)
        if not obj:
            obj = TaskModel(id=tid, agent=item.agent, command=item.command, meta=str(item.meta or {}), status='queued', created_at=now, updated_at=now)
            s.add(obj)
        else:
            obj.agent = item.agent
            obj.command = item.command
            obj.meta = str(item.meta or {})
            obj.status = 'queued'
            obj.updated_at = now
        s.commit()
    return tid


def model_to_dict(obj):
    return {c.name: getattr(obj, c.name) for c in obj.__table__.columns}


def fetch_next_task():
    with DB_SESSION() as s:
        from sqlalchemy import select
        stmt = select(TaskModel).where(TaskModel.status == 'queued').order_by(TaskModel.created_at).limit(1)
        res = s.execute(stmt).scalars().first()
        return res


def mark_task_status(tid, status, attempts=0, last_error=None):
    now = time.time()
    with DB_SESSION() as s:
        obj = s.get(TaskModel, tid)
        if obj:
            obj.status = status
            obj.attempts = attempts
            obj.last_error = str(last_error) if last_error else None
            obj.updated_at = now
            s.commit()


def record_processed(entry):
    with DB_SESSION() as s:
        obj = s.get(ProcessedModel, entry.get('id'))
        if not obj:
            obj = ProcessedModel(id=entry.get('id'), agent=entry.get('agent'), command=entry.get('command'), status=entry.get('status'), details=str(entry.get('details', {})), ts=entry.get('ts'))
            s.add(obj)
        else:
            obj.status = entry.get('status')
            obj.details = str(entry.get('details', {}))
            obj.ts = entry.get('ts')
        s.commit()
    TASKS_PROCESSED.inc()
    logger.info("task_processed", extra={"task_id": entry.get('id'), "agent": entry.get('agent'), "status": entry.get('status')})


WORKER_STOP = threading.Event()


def worker_thread_fn(thread_idx: int):
    while not WORKER_STOP.is_set():
        row = fetch_next_task()
        if not row:
            time.sleep(0.5)
            continue
        tid = row["id"]
        agent = row["agent"]
        command = row["command"]
        meta = row["meta"]
        attempts = row["attempts"] or 0
        endpoint = AGENTS.get(agent)
        mark_task_status(tid, "running", attempts, None)
        entry = {"id": tid, "agent": agent, "command": command, "status": "failed", "ts": time.time(), "details": {}}
        if endpoint:
            payload = {"command": command, "meta": meta}
            success = False
            for a in range(attempts, attempts + 3):
                try:
                    r = requests.post(endpoint, json=payload, timeout=10)
                    entry["details"]["attempt"] = a + 1
                    entry["details"]["status_code"] = r.status_code
                    if r.ok:
                        success = True
                        entry["status"] = "done"
                        break
                    else:
                        entry["details"][f"error_{a}"] = r.text
                except Exception as e:
                    entry["details"][f"exception_{a}"] = str(e)
                time.sleep(0.5 * (2 ** a) + random.random()*0.1)
            if success:
                mark_task_status(tid, "done", attempts + 1, None)
            else:
                mark_task_status(tid, "queued", attempts + 1, str(entry["details"]))
        else:
            entry["details"]["error"] = "no endpoint configured"
            mark_task_status(tid, "failed", attempts + 1, entry["details"]["error"])
        record_processed(entry)


WORKER_THREADS: List[threading.Thread] = []


def start_workers(count: int = 4):
    if WORKER_THREADS:
        return
    for i in range(count):
        t = threading.Thread(target=worker_thread_fn, args=(i,), daemon=True)
        WORKER_THREADS.append(t)
        t.start()


def stop_workers():
    WORKER_STOP.set()
    for t in WORKER_THREADS:
        t.join(timeout=1)


start_workers(int(os.environ.get("BACKGROUND_AGENT_WORKERS", "4")))


@app.post("/enqueue", dependencies=[Depends(require_api_key)])
def enqueue(item: TaskItem):
    tid = enqueue_task_db(item)
    TASKS_ENQUEUED.inc()
    logger.info("task_enqueued", extra={"task_id": tid, "agent": item.agent})
    return {"status": "queued", "id": tid}


@app.get("/metrics")
def metrics():
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


@app.get("/tasks", dependencies=[Depends(require_api_key)])
def list_tasks(limit: int = 50):
    with DB_SESSION() as s:
        q = s.query(TaskModel).order_by(TaskModel.created_at.desc()).limit(limit).all()
        return [model_to_dict(x) for x in q]

@app.post("/agents/register", dependencies=[Depends(require_api_key), Depends(require_role)])
def register_agent(name: str, endpoint: str, meta: Optional[str] = None):
    from .db import Agent as AgentModel
    now = time.time()
    with DB_SESSION() as s:
        obj = s.get(AgentModel, name)
        if not obj:
            obj = AgentModel(name=name, endpoint=endpoint, meta=str(meta or {}), registered_at=now)
            s.add(obj)
        else:
            obj.endpoint = endpoint
            obj.meta = str(meta or {})
            obj.registered_at = now
        s.commit()
    return {"registered": name, "endpoint": endpoint}

@app.post("/agents/unregister", dependencies=[Depends(require_api_key), Depends(require_role)])
def unregister_agent(name: str):
    from .db import Agent as AgentModel
    with DB_SESSION() as s:
        obj = s.get(AgentModel, name)
        if obj:
            s.delete(obj)
            s.commit()
            return {"unregistered": name}
    return {"unregistered": None}


@app.get("/processed", dependencies=[Depends(require_api_key)])
def list_processed(limit: int = 50):
    with DB_SESSION() as s:
        q = s.query(ProcessedModel).order_by(ProcessedModel.ts.desc()).limit(limit).all()
        return [model_to_dict(x) for x in q]


@app.post("/stop", dependencies=[Depends(require_api_key), Depends(require_role)])
def stop_app():
    stop_workers()
    return {"stopping": True}


@app.post("/start", dependencies=[Depends(require_api_key), Depends(require_role)])
def start_app(workers: int = 4):
    start_workers(workers)
    return {"started": True, "workers": len(WORKER_THREADS)}


@app.get("/health")
def health():
    # Check DB connectivity
    db_ok = False
    try:
        with DB_ENGINE.connect() as conn:
            conn.execute("SELECT 1")
            db_ok = True
    except Exception:
        db_ok = False
    return {"workers": len(WORKER_THREADS), "db_ok": db_ok}
