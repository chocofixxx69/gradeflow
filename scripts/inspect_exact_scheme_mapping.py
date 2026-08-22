import json

with open("vtu_all_tables_parsed.json", "r", encoding="utf-8") as f:
    tables = json.load(f)

print("=================================================================")
print("EXACT VTU DOCUMENT MAPPING FOR 2022 & 2025 SCHEMES (8 BRANCHES)")
print("=================================================================")

target_branches = {
    "AI": ["Artificial Intelligence & Machine Learning", "AIML", "AI & ML", "AI and Machine Learning"],
    "CS": ["Computer Science & Engineering", "CSE", "Computer Science and Engineering"],
    "CV": ["Civil Engineering", "Civil"],
    "DS": ["Computer Science & Engineering (Data Science)", "Data Science", "AIDS", "AI & DS", "Artificial Intelligence & Data Science", "CS (Data Science)"],
    "EC": ["Electronics and Communication", "ECE", "Electronics & Communication Engineering", "Electronics & Communication"],
    "EE": ["ELECTRICAL AND ELECTRONICS ENGINEERING", "Electrical & Electronics", "EEE", "Electrical and Electronics Engineering"],
    "ME": ["Mechanical Engineering", "ME"],
    "RI": ["Robotics and Artificial Intelligence", "Robotics & Artificial Intelligence", "Robotics", "Robotics and Automation", "RAI", "RI"]
}

out = []
out.append("=================================================================")
out.append("EXACT VTU DOCUMENT MAPPING FOR 2022 & 2025 SCHEMES (8 BRANCHES)")
out.append("=================================================================")

# 1. 2022 Scheme: Check Tables 4, 5, 6, 7, 8, 9, 10, 11
out.append("\n--- [2022 SCHEME] ---")
for t_idx in [4, 5, 6, 7, 8, 9, 10, 11]:
    t = next((tab for tab in tables if tab["table_index"] == t_idx), None)
    if not t:
        continue
    out.append(f"\n>> Table {t_idx}: {t['heading']}")
    for r in t["rows"]:
        cells_str = " | ".join(r["cells"])
        is_relevant = any(kw.lower() in cells_str.lower() for branch_kws in target_branches.values() for kw in branch_kws)
        if is_relevant or "physics" in cells_str.lower() or "chemistry" in cells_str.lower() or "common" in cells_str.lower() or "1st" in cells_str.lower() or "2nd" in cells_str.lower():
            out.append(f"  ROW: {cells_str}")
            for l in r["links"]:
                out.append(f"    -> [{l['text']}] {l['href']}")

# 2. 2025 Scheme: Check Tables 1, 2, 3
out.append("\n--- [2025 SCHEME] ---")
for t_idx in [1, 2, 3]:
    t = next((tab for tab in tables if tab["table_index"] == t_idx), None)
    if not t:
        continue
    out.append(f"\n>> Table {t_idx}: {t['heading']}")
    for r in t["rows"]:
        cells_str = " | ".join(r["cells"])
        is_relevant = any(kw.lower() in cells_str.lower() for branch_kws in target_branches.values() for kw in branch_kws)
        if is_relevant or "physics" in cells_str.lower() or "chemistry" in cells_str.lower() or "common" in cells_str.lower() or "1st" in cells_str.lower() or "2nd" in cells_str.lower() or "template" in cells_str.lower():
            out.append(f"  ROW: {cells_str}")
            for l in r["links"]:
                out.append(f"    -> [{l['text']}] {l['href']}")

with open("scheme_mapping_utf8.txt", "w", encoding="utf-8") as f_out:
    f_out.write("\n".join(out))

print("Wrote scheme_mapping_utf8.txt successfully.")
