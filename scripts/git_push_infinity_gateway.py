import subprocess
from pathlib import Path
import sys

def run_push():
    p = Path('infinity-gateway')
    if not p.exists():
        print('Path infinity-gateway does not exist; aborting')
        sys.exit(2)
    def run(cmd):
        print('RUN:', ' '.join(cmd))
        subprocess.check_call(cmd)
    try:
        run(['git','add','infinity-gateway'])
        run(['git','commit','-m','chore: add infinity-gateway consolidation scaffolding'])
        run(['git','push','origin','HEAD'])
        print('Push complete')
    except subprocess.CalledProcessError as e:
        print('Git operation failed:', e)
        sys.exit(1)

if __name__ == '__main__':
    run_push()
