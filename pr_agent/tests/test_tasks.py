import tempfile
import os
from tasks import run_validator_on_path


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
