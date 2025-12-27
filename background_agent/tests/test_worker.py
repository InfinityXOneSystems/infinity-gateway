import threading
import time
from background_agent import worker_thread_fn, WORKER_STOP, WORKER_THREADS


def test_worker_loop_runs_for_short_time(monkeypatch):
    # monkeypatch fetch_next_task to return None then stop
    from background_agent import fetch_next_task, record_processed

    calls = {'count': 0}

    def fake_fetch():
        calls['count'] += 1
        if calls['count'] > 3:
            # after a few loops, signal stop
            WORKER_STOP.set()
        return None

    monkeypatch.setattr('background_agent.fetch_next_task', fake_fetch)
    # run worker for a short time
    t = threading.Thread(target=worker_thread_fn, args=(0,), daemon=True)
    t.start()
    t.join(timeout=5)
    assert calls['count'] >= 1
