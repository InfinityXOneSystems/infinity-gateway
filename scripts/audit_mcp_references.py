import os
import re
from pathlib import Path

ROOT = Path('C:/AI/repos')
PATTERN = re.compile(r"\bmcp\b|\bomni[-_]gateway\b", re.IGNORECASE)

def scan():
    results = []
    for p in ROOT.rglob('*'):
        if p.is_file() and p.suffix not in ['.pyc', '.pkl', '.db', '.png', '.jpg', '.jpeg', '.zip', '.tar', '.gz']:
            try:
                text = p.read_text(encoding='utf-8', errors='ignore')
                if PATTERN.search(text):
                    results.append(str(p))
            except Exception:
                continue
    return results

if __name__ == '__main__':
    hits = scan()
    print(f'Found {len(hits)} files containing mcp/omni references')
    for f in hits:
        print(f)
