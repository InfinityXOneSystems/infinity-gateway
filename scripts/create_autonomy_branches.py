import subprocess
from pathlib import Path
import sys

ROOT = Path.cwd()
SAFE_PATHS = ['background_agent', 'scripts', 'credentials']
BRANCHES = [
    ('autonomy/background-agent-finalize', 'autonomy(finalize-background): alembic, RBAC, tests, celery scaffold'),
    ('autonomy/infra-ci', 'autonomy(infra-ci): CI tests + build workflow, Dockerfile healthcheck, local docker-compose'),
    ('autonomy/audit-sync', 'autonomy(audit-sync): add audit scanner and replace script; add audit results scaffold'),
    ('autonomy/monitoring-secrets-queue', 'autonomy(monitoring-secrets-queue): add GCP secrets loader, Celery scaffold, prometheus/grafana stubs')
]

def run(cmd):
    print('RUN:', ' '.join(cmd))
    subprocess.check_call(cmd)

def safe_add(paths):
    added = False
    for p in paths:
        if (ROOT / p).exists():
            try:
                run(['git','add',p])
                added = True
            except subprocess.CalledProcessError as e:
                print('git add failed for', p, e)
    return added

def main():
    # Ensure main branch exists
    try:
        run(['git','rev-parse','--verify','main'])
    except subprocess.CalledProcessError:
        # create main from current HEAD
        try:
            run(['git','checkout','-b','main'])
        except subprocess.CalledProcessError as e:
            print('Failed to ensure main exists', e); sys.exit(1)

    for branch, msg in BRANCHES:
        try:
            run(['git','checkout','main'])
            run(['git','checkout','-B',branch])
        except subprocess.CalledProcessError as e:
            print('Failed to create branch', branch, e); continue

        if safe_add(SAFE_PATHS):
            try:
                run(['git','commit','-m',msg])
                print('Committed branch', branch)
            except subprocess.CalledProcessError:
                print('Nothing to commit on', branch)
        else:
            print('No safe files to add for', branch)

    # Return to main
    run(['git','checkout','main'])

if __name__ == '__main__':
    main()
