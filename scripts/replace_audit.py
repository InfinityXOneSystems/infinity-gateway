import argparse
from pathlib import Path
import re
import json

ROOT = Path('c:/AI/repos')
PATTERN = re.compile(r"\bmcp\b|\bomni[-_]gateway\b", re.IGNORECASE)


def scan():
    hits = []
    for p in ROOT.rglob('*'):
        if p.is_file() and p.suffix not in ['.pyc', '.pkl', '.db', '.png', '.jpg', '.jpeg', '.zip', '.tar', '.gz']:
            try:
                text = p.read_text(encoding='utf-8', errors='ignore')
                if PATTERN.search(text):
                    hits.append(str(p))
            except Exception:
                continue
    return hits


def replace(old, new, dry=True):
    files = scan()
    changed = []
    for f in files:
        p = Path(f)
        txt = p.read_text(encoding='utf-8', errors='ignore')
        if old in txt:
            new_txt = txt.replace(old, new)
            changed.append(f)
            if not dry:
                p.write_text(new_txt, encoding='utf-8')
    return changed


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--replace', nargs=2, metavar=('OLD','NEW'))
    parser.add_argument('--dry', action='store_true')
    args = parser.parse_args()

    hits = scan()
    summary = {'hits_count': len(hits), 'hits': hits}
    out = Path('credentials')
    out.mkdir(exist_ok=True)
    (out / 'audit_results.json').write_text(json.dumps(summary, indent=2))

    if args.replace:
        old, new = args.replace
        changed = replace(old, new, dry=args.dry)
        print(f"Found {len(hits)} hits, changed {len(changed)} files (dry={args.dry})")


if __name__ == '__main__':
    main()
