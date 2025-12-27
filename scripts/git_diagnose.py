import subprocess
from pathlib import Path

def diagnose():
    p = Path.cwd()
    print('CWD:', p)
    print('.git exists?', Path('.git').exists())
    try:
        out = subprocess.check_output(['git','rev-parse','--show-toplevel'], stderr=subprocess.STDOUT).decode().strip()
        print('Git top-level:', out)
        remotes = subprocess.check_output(['git','remote','-v']).decode().strip()
        print('Remotes:\n', remotes)
    except subprocess.CalledProcessError as e:
        print('Git error:', e.output.decode())

if __name__ == '__main__':
    diagnose()
