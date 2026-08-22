import json
import re

with open("vtu_tables_dump.txt", "r", encoding="utf-8") as f:
    text = f.read()

# Let's inspect sections and table headers
blocks = text.split("==========================================")

print(f"Total table blocks: {len(blocks)}")
for b in blocks:
    if not b.strip():
        continue
    lines = b.strip().split("\n")
    header = lines[0] if lines else ""
    print(f"\n--- {header} ---")
    for l in lines[1:10]:
        print(" ", l[:120])
