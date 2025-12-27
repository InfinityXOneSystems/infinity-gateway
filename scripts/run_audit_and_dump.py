from scripts.audit_mcp_references import scan
from pathlib import Path

out = Path('scripts/mcp_reference_list.txt')
hits = scan()
out.write_text('\n'.join(hits), encoding='utf-8')
print(f'Wrote {len(hits)} entries to {out}')
