import shutil
from pathlib import Path
src = Path(r'C:\AI\repos\mcp')
dst = Path(r'C:\AI\repos\infinity-gateway')
if not src.exists():
    print('Source not found:', src)
    raise SystemExit(1)
if dst.exists():
    print('Destination exists, aborting to avoid overwrite:', dst)
    raise SystemExit(1)
print('Copying', src, '->', dst)
shutil.copytree(src, dst)
print('Copy completed')
