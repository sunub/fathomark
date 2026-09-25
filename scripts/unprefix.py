"""Reverses prefix-codemod.py: strips a leading `tw:` from every class token."""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
changed = 0
for pattern in ("src/components/**/*.tsx", "src/docs/**/*.tsx", "src/docs/**/*.mdx", "src/stories/**/*.tsx"):
    for path in (ROOT / "design-system").glob(pattern):
        text = path.read_text()
        new = re.sub(r"(?<![\w:/[-])tw:", "", text)
        if new != text:
            path.write_text(new)
            changed += 1
print(f"un-prefixed {changed} files")
