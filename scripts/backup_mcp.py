import shutil
import datetime
from pathlib import Path

src = Path(r"C:\AI\repos\mcp")
if not src.exists():
    print("Source not found:", src)
    raise SystemExit(1)

ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
dest = Path(r"C:\AI\repos") / f"mcp_backup_{ts}"
print('Backing up', src, '->', dest)
shutil.copytree(src, dest)
print('Backup completed:', dest)
