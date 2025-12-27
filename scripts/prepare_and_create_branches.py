import subprocess
import sys
from pathlib import Path

def run(cmd):
    print('RUN:', ' '.join(cmd))
    subprocess.check_call(cmd)

def main():
    # stash untracked files to allow branch checkouts
    try:
        run(['git','stash','push','-u','-m','temp-untracked-autonomy'])
    except subprocess.CalledProcessError as e:
        print('git stash failed:', e)

    try:
        import scripts.create_autonomy_branches as cab
        cab.main()
    except Exception as e:
        print('create_autonomy_branches failed:', e)

    # try to pop stash
    try:
        run(['git','stash','pop'])
    except subprocess.CalledProcessError as e:
        print('git stash pop failed (you may need to pop manually):', e)

if __name__ == '__main__':
    main()
