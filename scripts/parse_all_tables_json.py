import json
from bs4 import BeautifulSoup

html_file = r"C:\Users\MY PC\.gemini\antigravity-ide\brain\d1ef9544-2649-463f-bd7b-68d56119b1c6\.system_generated\steps\323\content.md"
with open(html_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

soup = BeautifulSoup(content, "html.parser")

out_tables = []
for idx, tbl in enumerate(soup.find_all("table")):
    prev_h = tbl.find_previous(["h1", "h2", "h3", "h4", "h5", "h6", "strong", "b"])
    heading_text = prev_h.get_text(strip=True) if prev_h else "None"
    
    rows_data = []
    for r in tbl.find_all("tr"):
        cells = [c.get_text(strip=True) for c in r.find_all(["td", "th"])]
        links = [{"text": a.get_text(strip=True), "href": a.get("href")} for a in r.find_all("a")]
        if cells:
            rows_data.append({"cells": cells, "links": links})
            
    out_tables.append({
        "table_index": idx + 1,
        "heading": heading_text,
        "rows_count": len(rows_data),
        "rows": rows_data
    })

with open("vtu_all_tables_parsed.json", "w", encoding="utf-8") as f:
    json.dump(out_tables, f, indent=2, ensure_ascii=False)

print(f"Parsed {len(out_tables)} tables to vtu_all_tables_parsed.json")
