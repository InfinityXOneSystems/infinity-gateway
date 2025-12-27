"""
Imported workspace copy of original Omni Gateway main file for consolidation.
"""
from __future__ import annotations

# This file is a recorded copy of the original mcp/omni_gateway.py used for consolidation.
import importlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
src = Path(r"C:\AI\repos\mcp\omni_gateway.py")
if src.exists():
    # Import by executing the source file into a module namespace to preserve original behavior during consolidation.
    spec_name = 'infinity_gateway_omni'
    import runpy
    runpy.run_path(str(src), run_name=spec_name)
else:
    print('Warning: source omni_gateway not found at', src)
