#!/usr/bin/env python3
"""Maintenance Agent

Runs continuously and performs repo maintenance tasks:
- run tools/auto_fix_gitignore.ps1
- run tools/auto_archive_large_files.ps1
- run tools/fallback_archive_and_move_v2.ps1
- start/ensure CI monitor

Config via env vars:
- MAINT_INTERVAL_MIN (minutes, default 15)
- REPO_ROOT (default C:/AI/repos/infinity-xos)
- DRY_RUN (if '1' then don't modify files)
"""
import os
import time
import subprocess
import logging
from datetime import datetime

REPO_ROOT = os.environ.get('REPO_ROOT', r'C:\AI\repos\infinity-xos')
INTERVAL = int(os.environ.get('MAINT_INTERVAL_MIN', '15'))
DRY_RUN = os.environ.get('DRY_RUN', '') == '1'
LOGDIR = os.path.join(REPO_ROOT, 'tools', 'logs')
os.makedirs(LOGDIR, exist_ok=True)

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s', handlers=[
    logging.FileHandler(os.path.join(LOGDIR, 'maintenance_agent.log')),
    logging.StreamHandler()
])

PWSH = os.environ.get('POWERSHELL', 'pwsh')
GATEWAY_URL = os.environ.get('INFINITY_GATEWAY_URL', 'https://gateway-896380409704.us-east1.run.app')
GATEWAY_KEY = os.environ.get('INFINITY_GATEWAY_KEY', '')

import requests

def gateway_post(path, payload=None):
    url = GATEWAY_URL.rstrip('/') + path
    headers = {'Content-Type': 'application/json'}
    if GATEWAY_KEY:
        headers['x-api-key'] = GATEWAY_KEY
    try:
        r = requests.post(url, json=payload or {})
        r.raise_for_status()
        return r.json()
    except Exception as e:
        logging.warning('Gateway call failed %s %s', url, e)
        return None

def register_with_gateway():
    try:
        payload = {'name': 'maintenance-agent', 'meta': {'repo': REPO_ROOT}}
        candidates = ['/agents/register', '/api/agents/register', '/agents', '/api/agents']
        resp = None
        for p in candidates:
            logging.info('Trying gateway register %s', p)
            resp = gateway_post(p, payload)
            if resp is not None:
                logging.info('Registered with gateway via %s: %s', p, resp)
                break
        if resp is None:
            logging.warning('Gateway registration failed for all candidate paths')
    except Exception:
        logging.exception('Failed to register with gateway')

def unregister_gateway():
    try:
        payload = {'name': 'maintenance-agent'}
        gateway_post('/agents/unregister', payload)
    except Exception:
        logging.exception('Failed to unregister gateway')

def run_script(script_path, args=None):
    cmd = [PWSH, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script_path]
    if args:
        cmd += args
    if DRY_RUN:
        logging.info('DRY RUN: would run: %s', ' '.join(cmd))
        return 0, 'dry-run'
    try:
        logging.info('Running: %s', ' '.join(cmd))
        p = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO_ROOT, timeout=3600)
        logging.info('Exit %s', p.returncode)
        if p.stdout:
            logging.info('OUT: %s', p.stdout[:4000])
        if p.stderr:
            logging.warning('ERR: %s', p.stderr[:4000])
        return p.returncode, p.stdout + '\n' + p.stderr
    except subprocess.TimeoutExpired as e:
        logging.error('Timeout: %s', e)
        return -1, str(e)
    except Exception as e:
        logging.exception('Failed to run script')
        return -1, str(e)

def ensure_ci_monitor():
    monitor_script = os.path.join(REPO_ROOT, 'tools', 'monitor_ci.ps1')
    if os.path.exists(monitor_script):
        # start a background job via powershell so it continues
        cmd = [PWSH, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', "Start-Job -ScriptBlock { powershell -NoProfile -ExecutionPolicy Bypass -File '%s' }" % monitor_script]
        if DRY_RUN:
            logging.info('DRY RUN: would start CI monitor job')
            return
        try:
            subprocess.run(cmd, cwd=REPO_ROOT)
            logging.info('CI monitor start command issued')
        except Exception:
            logging.exception('Failed to start CI monitor')
    else:
        logging.warning('monitor_ci.ps1 not found')

def main_loop():
    logging.info('Maintenance agent started; repo=%s; interval=%smin; dry=%s', REPO_ROOT, INTERVAL, DRY_RUN)
    tools = [
        os.path.join(REPO_ROOT, 'tools', 'auto_fix_gitignore.ps1'),
        os.path.join(REPO_ROOT, 'tools', 'auto_archive_large_files.ps1'),
        os.path.join(REPO_ROOT, 'tools', 'fallback_archive_and_move_v2.ps1')
    ]
    # Warm start: ensure CI monitor running and register with Infinity-Gateway
    ensure_ci_monitor()
    register_with_gateway()

    while True:
        start = datetime.utcnow()
        for t in tools:
            if os.path.exists(t):
                code, out = run_script(t)
                if code != 0:
                    logging.warning('Script %s exited %s', t, code)
            else:
                logging.debug('Tool missing: %s', t)

        # ensure CI monitor still present
        ensure_ci_monitor()

        elapsed = (datetime.utcnow() - start).total_seconds()
        sleep_for = max(60, INTERVAL*60 - int(elapsed))
        logging.info('Sleeping %s seconds', sleep_for)
        time.sleep(sleep_for)

if __name__ == '__main__':
    try:
        main_loop()
    except KeyboardInterrupt:
        logging.info('Maintenance agent stopped by KeyboardInterrupt')
    finally:
        unregister_gateway()
