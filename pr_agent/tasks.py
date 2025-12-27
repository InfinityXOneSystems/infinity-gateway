import os
import tempfile
import subprocess
import os
import tempfile
import subprocess
import shutil
import json
from typing import Dict, Any
from celery_app import celery_app
import requests

GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
AUTO_FIX = os.getenv('AUTO_FIX', 'false').lower() in ('1', 'true', 'yes')
CLONE_TIMEOUT = int(os.getenv('CLONE_TIMEOUT', '120'))
VALIDATOR_TIMEOUT = int(os.getenv('VALIDATOR_TIMEOUT', '120'))
GIT_AUTHOR_NAME = os.getenv('GIT_AUTHOR_NAME', 'pr-agent')
GIT_AUTHOR_EMAIL = os.getenv('GIT_AUTHOR_EMAIL', 'pr-agent@example.com')


def _run(cmd, cwd=None, timeout=None) -> Dict[str, Any]:
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.STDOUT, text=True, cwd=cwd, timeout=timeout)
        return {'returncode': 0, 'output': out}
    except subprocess.CalledProcessError as e:
        return {'returncode': e.returncode, 'output': e.output}
    except subprocess.TimeoutExpired:
        return {'returncode': -1, 'output': 'timeout'}
    except FileNotFoundError as e:
        return {'returncode': -2, 'output': f'not found: {e}'}


def run_validator_on_path(path: str) -> Dict[str, Any]:
    cli = shutil.which('python') or 'python'
    cmd = [cli, '-m', 'pr_validator.cli', path]
    return _run(cmd, timeout=VALIDATOR_TIMEOUT)


def try_auto_fix(path: str) -> Dict[str, Any]:
    # Attempt deterministic fixes: prefer pr_validator's autofix if available,
    # otherwise run common fixers if installed.
    results = []

    # 1) Try a pr_validator autofix flag
    cli = shutil.which('python') or 'python'
    cmd = [cli, '-m', 'pr_validator.cli', '--autofix', path]
    r = _run(cmd, timeout=VALIDATOR_TIMEOUT)
    results.append({'tool': 'pr_validator --autofix', **r})
    if r['returncode'] == 0 and 'applied fixes' in r['output'].lower():
        return {'fixed': True, 'details': results}

    # 2) Try black (python) if present
    if shutil.which('black'):
        r = _run(['black', path], timeout=VALIDATOR_TIMEOUT)
        results.append({'tool': 'black', **r})
    # 3) Try ruff --fix if present
    if shutil.which('ruff'):
        r = _run(['ruff', path, '--fix'], timeout=VALIDATOR_TIMEOUT)
        results.append({'tool': 'ruff --fix', **r})

    # Determine if git status shows changes
    return {'fixed': False, 'details': results}


def git_commit_and_push(path: str, branch: str, repo_full_name: str) -> Dict[str, Any]:
    # Configure git author
    _run(['git', 'config', 'user.name', GIT_AUTHOR_NAME], cwd=path)
    _run(['git', 'config', 'user.email', GIT_AUTHOR_EMAIL], cwd=path)

    # Stage changes
    _run(['git', 'add', '-A'], cwd=path)
    status = _run(['git', 'status', '--porcelain'], cwd=path)
    if not status['output'].strip():
        return {'pushed': False, 'reason': 'no_changes'}

    _run(['git', 'commit', '-m', 'chore: apply automatic fixes by pr-agent'], cwd=path)

    # Push back using token if available
    push_cmd = ['git', 'push', 'origin', f'HEAD:{branch}']
    if GITHUB_TOKEN:
        # set remote URL with token temporarily
        push_cmd = ['git', 'push', f'https://{GITHUB_TOKEN}@github.com/{repo_full_name}.git', f'HEAD:{branch}']

    r = _run(push_cmd, cwd=path, timeout=VALIDATOR_TIMEOUT)
    return {'pushed': r['returncode'] == 0, 'push_result': r}


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, retry_backoff_max=60, max_retries=3)
def process_pr(self, repo_full_name: str, pr_number: int, clone_url: str, branch: str):
    tmpdir = tempfile.mkdtemp(prefix='pr_agent_')
    try:
        # clone the PR branch (shallow clone)
        r = _run(['git', 'clone', '--depth', '1', '--single-branch', '--branch', branch, clone_url, tmpdir], timeout=CLONE_TIMEOUT)
        if r['returncode'] != 0:
            return {'status': 'error', 'step': 'clone', 'detail': r}

        # initial validation
        initial = run_validator_on_path(tmpdir)

        auto_fix_result = None
        revalidate = None

        # Decide if we should try auto-fix
        failures_present = initial['returncode'] != 0
        if failures_present and AUTO_FIX:
            if not GITHUB_TOKEN:
                auto_fix_result = {'skipped': True, 'reason': 'missing_github_token'}
            else:
                auto_fix_result = try_auto_fix(tmpdir)
                if auto_fix_result.get('fixed'):
                    push_res = git_commit_and_push(tmpdir, branch, repo_full_name)
                    auto_fix_result['push'] = push_res
                    # re-run validator after fixes
                    revalidate = run_validator_on_path(tmpdir)

        # Post a structured comment
        comment = {
            'initial': initial,
            'auto_fix': auto_fix_result,
            'revalidate': revalidate,
        }

        if GITHUB_TOKEN:
            url = f'https://api.github.com/repos/{repo_full_name}/issues/{pr_number}/comments'
            headers = {'Authorization': f'token {GITHUB_TOKEN}', 'Accept': 'application/vnd.github.v3+json'}
            body = {'body': 'PR Validator Summary:\n\n' + '```json\n' + json.dumps(comment, indent=2) + '\n```'}
            try:
                requests.post(url, json=body, headers=headers, timeout=15)
            except Exception:
                pass

        return {'status': 'done', 'comment': comment}
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
