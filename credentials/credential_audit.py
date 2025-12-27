#!/usr/bin/env python3
"""
credential_audit.py

Scan the workspace for credential-like files and secrets, sanitize them (remove values),
produce a manifest of key names and where they're found, and optionally commit the
sanitized outputs to the `credentials` repo.

Features:
- Scans for common env files and known patterns (.env, .env.local, *.secret, JSON with keys)
- Optionally queries GitHub (requires GITHUB_TOKEN env var) for repo secrets and lists of files
- Optionally queries GCP Secret Manager (requires GOOGLE_CLOUD_PROJECT env var and credentials)
- Produces sanitized copies (values removed) in `sanitized/` and a `manifest.json`
- Can commit and push sanitized artifacts when run with `--push` (requires git remote access)

Usage:
  python credential_audit.py --scan "c:/AI/repos" --out sanitized --push

"""
import re
import os
import json
import argparse
from pathlib import Path
from dotenv import dotenv_values
import yaml
import requests

# Optional imports
try:
    from github import Github
except Exception:
    Github = None

try:
    from google.cloud import secretmanager
except Exception:
    secretmanager = None

COMMON_ENV_NAMES = ['.env', '.env.local', '.env.development', '.env.production']
SENSITIVE_KEY_PATTERNS = [re.compile(r'(?i)token'), re.compile(r'(?i)secret'), re.compile(r'(?i)key'), re.compile(r'(?i)password'), re.compile(r'(?i)credentials')]


def is_sensitive_key(k: str) -> bool:
    return any(p.search(k) for p in SENSITIVE_KEY_PATTERNS)


def find_files(root: Path):
    files = []
    for p in root.rglob('*'):
        if p.is_file():
            name = p.name.lower()
            if name in COMMON_ENV_NAMES or name.endswith('.secret') or name.endswith('.json') or name.endswith('.yaml') or name.endswith('.yml') or name.endswith('.env'):
                files.append(p)
    return files


def sanitize_env_file(path: Path):
    data = dotenv_values(path)
    sanitized = {k: ('<REDACTED>' if is_sensitive_key(k) else '') for k in data.keys()}
    return sanitized


def sanitize_json(path: Path):
    try:
        j = json.loads(path.read_text())
    except Exception:
        return None
    def redact(obj):
        if isinstance(obj, dict):
            return {k: ('<REDACTED>' if is_sensitive_key(k) else redact(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [redact(x) for x in obj]
        return ''
    return redact(j)


def sanitize_yaml(path: Path):
    try:
        j = yaml.safe_load(path.read_text())
    except Exception:
        return None
    def redact(obj):
        if isinstance(obj, dict):
            return {k: ('<REDACTED>' if is_sensitive_key(k) else redact(v)) for k, v in obj.items()}
        if isinstance(obj, list):
            return [redact(x) for x in obj]
        return ''
    return redact(j)


def query_github_repos(github_token: str):
    if Github is None:
        return []
    gh = Github(github_token)
    user = gh.get_user()
    repos = user.get_repos()
    repo_names = [r.full_name for r in repos]
    return repo_names


def query_gcp_secrets(project: str):
    if secretmanager is None:
        return []
    client = secretmanager.SecretManagerServiceClient()
    parent = f"projects/{project}"
    secrets = client.list_secrets(request={"parent": parent})
    return [s.name for s in secrets]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--scan', required=True, help='root folder to scan')
    parser.add_argument('--out', default='sanitized', help='output folder for sanitized artifacts')
    parser.add_argument('--push', action='store_true', help='commit and push sanitized artifacts to remote')
    parser.add_argument('--github', action='store_true', help='query GitHub for repos (requires GITHUB_TOKEN env)')
    parser.add_argument('--gcp', action='store_true', help='query GCP Secret Manager (requires GOOGLE_CLOUD_PROJECT env)')
    args = parser.parse_args()

    root = Path(args.scan)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    manifest = {"files": [], "github_repos": [], "gcp_secrets": []}

    files = find_files(root)
    for p in files:
        sanitized = None
        if p.suffix in ('.env', '') or p.name.lower().endswith('.env'):
            sanitized = sanitize_env_file(p)
        elif p.suffix == '.json':
            sanitized = sanitize_json(p)
        elif p.suffix in ('.yml', '.yaml'):
            sanitized = sanitize_yaml(p)
        else:
            try:
                # try dotenv
                sanitized = sanitize_env_file(p)
            except Exception:
                continue
        if sanitized is None:
            continue
        rel = p.relative_to(root)
        outp = out / rel
        outp.parent.mkdir(parents=True, exist_ok=True)
        outp.write_text(json.dumps(sanitized, indent=2))
        manifest['files'].append({"path": str(rel), "keys": list(sanitized.keys())})

    if args.github and os.environ.get('GITHUB_TOKEN'):
        repos = query_github_repos(os.environ.get('GITHUB_TOKEN'))
        manifest['github_repos'] = repos

    if args.gcp and os.environ.get('GOOGLE_CLOUD_PROJECT'):
        secrets = query_gcp_secrets(os.environ.get('GOOGLE_CLOUD_PROJECT'))
        manifest['gcp_secrets'] = secrets

    out.joinpath('manifest.json').write_text(json.dumps(manifest, indent=2))

    if args.push:
        # commit and push sanitized artifacts
        os.system(f'git -C {out} init')
        os.system(f'git -C {out} add .')
        os.system(f'git -C {out} commit -m "Add sanitized credential manifest"')
        # user must set remote manually or use existing repo remote
        print('Sanitized artifacts committed to local repo in', out)

if __name__ == '__main__':
    main()
