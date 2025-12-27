import tempfile
import os
import sys
from importlib import import_module

# ensure repo path is in sys.path for test discovery
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
tasks = import_module('tasks')
run_validator_on_path = tasks.run_validator_on_path


def test_run_validator_on_empty_dir():
    d = tempfile.mkdtemp()
    try:
        out = run_validator_on_path(d)
        assert isinstance(out, str)
    finally:
        try:
            os.rmdir(d)
        except Exception:
            pass
