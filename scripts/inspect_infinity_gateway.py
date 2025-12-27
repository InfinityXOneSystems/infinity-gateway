from pathlib import Path
import sys

P = Path('infinity-gateway')
if not P.exists():
    print('infinity-gateway does not exist')
    sys.exit(1)

print('Path:', P.resolve())
print('.git inside infinity-gateway?', (P / '.git').exists())
print('Is infinity-gateway a git worktree? (contains .git file)', (P / '.git').is_file())
print('Listing top-level entries:')
for i, p in enumerate(sorted(P.iterdir())):
    if i >= 200:
        break
    t = 'DIR' if p.is_dir() else 'FILE'
    print(f' - {t}: {p.name}')

 # check for nested .git in subdirs
for sub in P.rglob('.git'):
    print('Nested .git found at', sub)
