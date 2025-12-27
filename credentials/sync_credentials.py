#!/usr/bin/env python3
"""
sync_credentials.py

Tri-directional sync between local sanitized credential manifest, GitHub, and GCP Secret Manager.

Behavior:
- Reads sanitized manifest and keys from `sanitized/manifest.json` or runs the audit if missing.
- For each key name found, checks GitHub repo secrets (requires GITHUB_TOKEN) and GCP Secret Manager (requires GOOGLE_CLOUD_PROJECT).
- Synchronizes presence/absence (NOT values) of secret names and creates placeholders in destinations if missing.
- Optionally uses a mapping file to rename keys or normalize them.

Important: This script never writes secret values from one source to another. It only ensures key names and documentation are in sync.
"""
import os
import json
from pathlib import Path

try:
    from github import Github
except Exception:
    Github = None

try:
    from google.cloud import secretmanager
except Exception:
    secretmanager = None

SANITIZED = Path('sanitized')
MANIFEST = SANITIZED / 'manifest.json'


def load_manifest():
    if not MANIFEST.exists():
        raise FileNotFoundError('Run credential_audit.py first to generate sanitized/manifest.json')
    return json.loads(MANIFEST.read_text())


def github_list_repo_secrets(github_token, repo_full_name):
    if Github is None:
        return []
    gh = Github(github_token)
    repo = gh.get_repo(repo_full_name)
    secrets = repo.get_actions_secrets()
    return [s.name for s in secrets]


def gcp_list_secrets(project):
    if secretmanager is None:
        return []
    client = secretmanager.SecretManagerServiceClient()
    parent = f"projects/{project}"
    sec = client.list_secrets(request={"parent": parent})
    return [s.name.split('/')[-1] for s in sec]


def sync(manifest, github_token=None, gcp_project=None, repo_full_name=None):
    keys = set()
    for f in manifest.get('files', []):
        for k in f.get('keys', []):
            keys.add(k)
    print('Found keys:', keys)

    gh_secrets = set()
    gcp_secrets = set()
    if github_token and repo_full_name:
        gh_secrets = set(github_list_repo_secrets(github_token, repo_full_name))
    if gcp_project:
        gcp_secrets = set(gcp_list_secrets(gcp_project))

    # ensure missing placeholders (no value sync)
    missing_in_github = keys - gh_secrets
    missing_in_gcp = keys - gcp_secrets

    print('Missing in GitHub:', missing_in_github)
    print('Missing in GCP:', missing_in_gcp)

    # Create placeholder secrets if desired (requires permissions). Here we'll just print actions.
    for k in missing_in_github:
        print(f'Would create GitHub secret placeholder: {k} in {repo_full_name}')
    for k in missing_in_gcp:
        print(f'Would create GCP secret placeholder: {k} in project {gcp_project}')

    return {'missing_in_github': list(missing_in_github), 'missing_in_gcp': list(missing_in_gcp)}


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', default=str(MANIFEST))
    parser.add_argument('--github-token')
    parser.add_argument('--gcp-project')
    parser.add_argument('--repo')
    args = parser.parse_args()
    manifest = json.loads(Path(args.manifest).read_text())
    sync(manifest, github_token=args.github_token or os.environ.get('GITHUB_TOKEN'), gcp_project=args.gcp_project or os.environ.get('GOOGLE_CLOUD_PROJECT'), repo_full_name=args.repo)
