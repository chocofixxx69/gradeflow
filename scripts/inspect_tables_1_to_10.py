with open("vtu_tables_dump.txt", "r", encoding="utf-8") as f:
    text = f.read()

blocks = text.split("==========================================")
out = []
for b in blocks:
    if not b.strip():
        continue
    lines = b.strip().split("\n")
    header = lines[0] if lines else ""
    if any(f"TABLE {i} " in header for i in range(1, 11)):
        out.append(f"\n***************************************************")
        out.append(header)
        out.append("***************************************************")
        out.extend(lines[1:])

with open("tables_1_to_10_utf8.txt", "w", encoding="utf-8") as f_out:
    f_out.write("\n".join(out))

print(f"Dumped {len(out)} lines.")
