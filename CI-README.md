CI for Infinity-Gateway
======================

This document explains how to run the CI steps locally and which secrets are expected by the GitHub Actions workflow.

Run tests locally
-----------------

1. Create a Python 3.11 virtual environment:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r background_agent/requirements.txt
pytest -q background_agent/tests
```

Docker build (optional)
-----------------------

Build the Docker image locally (the workflow has push disabled by default):

```powershell
docker build -t infinity-gateway:ci .
```

Secrets used by workflow
------------------------

- `REGISTRY`: Docker registry to tag images when enabling push (e.g., ghcr.io/yourorg)

Notes
-----

- The test step is tolerant in CI (`|| true`) to avoid failing if integration tests cannot run in ephemeral runners. Local runs should run without `|| true` to surface issues.
