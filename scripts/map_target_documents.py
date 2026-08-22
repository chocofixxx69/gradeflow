import json
import re

with open("vtu_all_tables_parsed.json", "r", encoding="utf-8") as f:
    tables = json.load(f)

# Target branches: AI, CS, CV, DS, EC, EE, ME, RI
# Schemes: 2022, 2025

print("=== TABLES OVERVIEW ===")
for t in tables:
    print(f"Table {t['table_index']}: {t['heading']} ({t['rows_count']} rows)")

# Let's inspect Table 1 through 10 in detail
target_branches = ["AI", "CS", "CV", "DS", "EC", "EE", "ME", "RI"]

found_2022 = {}
found_2025 = {}

for t in tables:
    t_idx = t["table_index"]
    for r in t["rows"]:
        cells_text = " ".join(r["cells"])
        links = r["links"]
        # check if 2022 or 2025 or general
        # check branches
        for b in target_branches:
            # Match keywords
            # CS: Computer Science
            # AI: Artificial Intelligence
            # CV: Civil
            # DS: Data Science
            # EC: Electronics & Communication / Telecommunication
            # EE: Electrical & Electronics
            # ME: Mechanical
            # RI: Robotics
            pass

with open("vtu_tables_summary.txt", "w", encoding="utf-8") as f_out:
    for t in tables:
        f_out.write(f"\n=======================================================\n")
        f_out.write(f"TABLE {t['table_index']}: {t['heading']} ({t['rows_count']} rows)\n")
        f_out.write(f"=======================================================\n")
        for r in t["rows"]:
            f_out.write(f"ROW: {' | '.join(r['cells'])}\n")
            if r["links"]:
                f_out.write(f"  LINKS: {json.dumps(r['links'], ensure_ascii=False)}\n")

print("Wrote vtu_tables_summary.txt")
