#!/usr/bin/env python3
"""
sync_runner.py

Run the credential audit and tri-directional sync periodically.

This is a simple runner (not a production daemon). It will:
- Run `credential_audit.py` to refresh sanitized manifest
- Run `sync_credentials.py` to sync key names across GitHub and GCP
- Optionally push sanitized artifacts to the `credentials` repo

Use systemd / Task Scheduler / cron to run this script periodically in production.
"""
import subprocess
import time
import os
from pathlib import Path

ROOT = Path(__file__).parent
AUDIT = ROOT / 'credential_audit.py'
SYNC = ROOT / 'sync_credentials.py'

INTERVAL = int(os.environ.get('CREDENTIAL_SYNC_INTERVAL_SECONDS', '3600'))


def run_once(push=False, github=False, gcp=False):
    print('Running audit...')
    cmd = ['python', str(AUDIT), '--scan', 'c:/AI/repos', '--out', str(ROOT / 'sanitized')]
    if github:
        cmd.append('--github')
    if gcp:
        cmd.append('--gcp')
    if push:
        cmd.append('--push')
    subprocess.check_call(cmd)

    print('Running sync...')
    cmd = ['python', str(SYNC), '--manifest', str(ROOT / 'sanitized' / 'manifest.json')]
    if github:
        cmd += ['--github-token', os.environ.get('GITHUB_TOKEN', '')]
    if gcp:
        cmd += ['--gcp-project', os.environ.get('GOOGLE_CLOUD_PROJECT', '')]
    subprocess.check_call(cmd)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--interval', type=int, default=INTERVAL)
    parser.add_argument('--push', action='store_true')
    parser.add_argument('--github', action='store_true')
    parser.add_argument('--gcp', action='store_true')
    args = parser.parse_args()

    while True:
        try:
            run_once(push=args.push, github=args.github, gcp=args.gcp)
        except Exception as e:
            print('Error during run:', e)
        time.sleep(args.interval)
