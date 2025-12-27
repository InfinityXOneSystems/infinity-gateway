import subprocess
from pathlib import Path
import sys

ROOT = Path.cwd()
SAFE_PATHS = ['background_agent', 'scripts', 'credentials']
BRANCHES = [
    ('autonomy/background-agent-finalize', 'autonomy(finalize-background): alembic, RBAC, tests, celery scaffold'),
    ('autonomy/infra-ci', 'autonomy(infra-ci): CI tests + build workflow, Dockerfile healthcheck, local docker-compose'),
    ('autonomy/audit-sync', 'autonomy(audit-sync): add audit scanner and replace script; add audit results scaffold'),
    ('autonomy/monitoring-secrets-queue', 'autonomy(monitor-secrets-queue): add GCP secrets loader, Celery scaffold, prometheus/grafana stubs')
]

def run(cmd, cwd=None):
    print('RUN:', ' '.join(cmd))
    subprocess.check_call(cmd, cwd=cwd or None)

def ensure_ignore():
    gi = ROOT / '.gitignore'
    need = 'infinity-gateway/.git\n'
    if gi.exists():
        txt = gi.read_text(encoding='utf-8')
        if 'infinity-gateway/.git' in txt:
            return
        # append
        gi.write_text(txt + '\n' + need, encoding='utf-8')
    else:
        gi.write_text(need, encoding='utf-8')

def main():
    # ensure .git exists
    if not (ROOT / '.git').exists():
        print('.git missing at root; cannot bootstrap safely')
        sys.exit(1)

    ensure_ignore()

    # add .gitignore and safe paths
    try:
        run(['git','add','.gitignore'])
    except subprocess.CalledProcessError as e:
        print('git add .gitignore failed:', e)

    for p in SAFE_PATHS:
        if (ROOT / p).exists():
            try:
                run(['git','add',p])
            except subprocess.CalledProcessError as e:
                print('git add failed for', p, e)

    # commit initial if no commits yet
    try:
        # check if any commit exists
        subprocess.check_output(['git','rev-parse','--verify','HEAD'])
        print('Repository already has commits')
    except subprocess.CalledProcessError:
        # create initial commit
        try:
            run(['git','commit','-m','chore: initial bootstrap commit for autonomy branches'])
        except subprocess.CalledProcessError as e:
            print('Initial commit failed (maybe nothing staged):', e)

    # ensure main branch
    try:
        run(['git','checkout','-B','main'])
    except subprocess.CalledProcessError as e:
        print('Failed to ensure main branch:', e)

    # create autonomy branches and commit safe files if needed
    for branch, msg in BRANCHES:
        try:
            run(['git','checkout','-B',branch])
        except subprocess.CalledProcessError as e:
            print('Failed to create branch', branch, e); continue

        # commit any staged changes
        try:
            run(['git','commit','-m',msg])
            print('Committed on', branch)
        except subprocess.CalledProcessError:
            print('No changes to commit on', branch)

    # return to main
    try:
        run(['git','checkout','main'])
    except subprocess.CalledProcessError:
        pass

if __name__ == '__main__':
    main()
