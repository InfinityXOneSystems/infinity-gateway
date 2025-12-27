#!/usr/bin/env python3
"""
update_readmes.py

Walk repos under a root directory and update or inject a short README note pointing to the credentials hub location.
It looks for README.md files and appends or updates a `## Credentials` section with the hub location and instructions.
"""
from pathlib import Path
import re

HUB_LOCATION = 'https://github.com/your-org/credentials'  # update as appropriate


def update_readme(readme_path: Path, hub_location: str = HUB_LOCATION):
    text = readme_path.read_text(encoding='utf-8')
    # Remove existing Credentials section
    new_text = re.sub(r'## Credentials[\s\S]*?(?=## |$)', '', text)
    # Append new Credentials section
    credentials_section = f"\n## Credentials\n\nThe canonical credentials hub for this workspace is: {hub_location}\n\nDo not store secrets here; see the hub for sanitized manifests and instructions.\n"
    if not new_text.endswith('\n'):
        new_text += '\n'
    new_text = new_text + credentials_section
    readme_path.write_text(new_text, encoding='utf-8')


def walk_and_update(root: Path, hub_location: str = HUB_LOCATION):
    for p in root.rglob('README.md'):
        try:
            update_readme(p, hub_location)
            print('Updated', p)
        except Exception as e:
            print('Failed', p, e)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', default='c:/AI/repos')
    parser.add_argument('--hub', default=HUB_LOCATION)
    args = parser.parse_args()
    walk_and_update(Path(args.root), args.hub)
