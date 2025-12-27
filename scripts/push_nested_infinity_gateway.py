import subprocess
from pathlib import Path
import sys

REPO = Path('infinity-gateway')
if not REPO.exists():
    print('infinity-gateway missing'); sys.exit(1)

def run(cmd, cwd=None):
    print('RUN:', ' '.join(cmd), 'CWD=', cwd or REPO)
    subprocess.check_call(cmd, cwd=cwd or str(REPO))

try:
    run(['git','status'])
    run(['git','remote','-v'])
    run(['git','add','--all'])
    try:
        run(['git','commit','-m','chore: consolidate into infinity-gateway'])
    except subprocess.CalledProcessError:
        print('No commit created (maybe nothing to commit)')
    run(['git','branch','-M','main'])
    run(['git','push','-u','origin','main'])
except subprocess.CalledProcessError as e:
    print('Git error:', e)
    sys.exit(1)
