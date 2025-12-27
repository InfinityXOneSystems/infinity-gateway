import os
import tempfile
import subprocess
import shutil
from celery_app import celery_app
import requests

GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')


def run_validator_on_path(path: str) -> str:
    cli = shutil.which('python') or 'python'
    cmd = [cli, '-m', 'pr_validator.cli', path]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True)
        return out
    except subprocess.CalledProcessError as e:
        return e.output


@celery_app.task(bind=True)
def process_pr(self, repo_full_name: str, pr_number: int, clone_url: str, branch: str):
    tmpdir = tempfile.mkdtemp(prefix='pr_agent_')
    try:
        # clone the PR branch
        subprocess.check_call(['git', 'clone', '--single-branch', '--branch', branch, clone_url, tmpdir])

        # run validator
        result = run_validator_on_path(tmpdir)

        # post comment to PR
        if GITHUB_TOKEN:
            url = f'https://api.github.com/repos/{repo_full_name}/issues/{pr_number}/comments'
            headers = {'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'}
            body = {'body': f'PR Validator results:\n\n```
{result}
```'}
            requests.post(url, json=body, headers=headers, timeout=15)

        return {'status': 'done', 'output': result}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
