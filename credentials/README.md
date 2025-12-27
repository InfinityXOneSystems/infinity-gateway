Credential Audit

This folder contains tools to scan your workspace for credential-like files, sanitize them
(remove secret values), and produce a manifest of key names and where they were found.

Usage:

1. Install deps:

   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt

2. Run the audit (example):

   python credential_audit.py --scan "c:/AI/repos" --out sanitized --github --gcp

3. Optionally push sanitized artifacts:

   python credential_audit.py --scan "c:/AI/repos" --out sanitized --push

Notes:
- The script intentionally does not export secret values. It replaces sensitive values with `<REDACTED>`.
- To query GitHub you must set `GITHUB_TOKEN` in your environment.
- To query GCP Secret Manager you must set `GOOGLE_CLOUD_PROJECT` and auth credentials.
