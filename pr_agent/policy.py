DEFAULT_POLICY = {
    'max_diff_lines': 1000,
    'forbidden_paths': ['credentials/', '.secrets/'],
}

def check_policy(diff_summary):
    # diff_summary: dict with 'total_lines' and 'paths'
    if diff_summary.get('total_lines', 0) > DEFAULT_POLICY['max_diff_lines']:
        return False, 'diff too large'
    for p in diff_summary.get('paths', []):
        for forbidden in DEFAULT_POLICY['forbidden_paths']:
            if p.startswith(forbidden):
                return False, f'forbidden path modified: {p}'
    return True, 'ok'
