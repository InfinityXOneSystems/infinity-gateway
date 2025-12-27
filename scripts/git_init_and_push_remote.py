import subprocess
from pathlib import Path
import sys

REMOTE = 'https://github.com/InfinityXOneSystems/infinity-gateway.git'
ROOT = Path.cwd()

def run(cmd):
    print('RUN:', ' '.join(cmd))
    subprocess.check_call(cmd)

def main():
    # Initialize repo if missing
    if not (ROOT / '.git').exists():
        run(['git','init'])
    run(['git','remote','remove','origin']) if 'origin' in subprocess.check_output(['git','remote']).decode().split() else None
    run(['git','remote','add','origin', REMOTE])
    run(['git','add','infinity-gateway'])
    try:
        run(['git','commit','-m','chore: add infinity-gateway consolidation scaffolding'])
    except subprocess.CalledProcessError:
        # nothing to commit or commit failed
        print('Commit may have failed or no changes to commit')
    run(['git','branch','-M','main'])
    run(['git','push','-u','origin','main'])

if __name__ == '__main__':
    main()
