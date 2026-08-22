import os
from bs4 import BeautifulSoup

html_file = r"C:\Users\MY PC\.gemini\antigravity-ide\brain\d1ef9544-2649-463f-bd7b-68d56119b1c6\.system_generated\steps\323\content.md"
with open(html_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

soup = BeautifulSoup(content, "html.parser")

out_lines = []
for idx, tbl in enumerate(soup.find_all("table")):
    prev_h = tbl.find_previous(["h1", "h2", "h3", "h4", "h5", "h6", "strong", "b"])
    prev_text = prev_h.get_text(strip=True) if prev_h else "None"
    out_lines.append(f"\n==========================================")
    out_lines.append(f"TABLE {idx + 1} (Preceded by: {prev_text})")
    out_lines.append(f"==========================================")
    rows = tbl.find_all("tr")
    for r in rows:
        cells = [c.get_text(strip=True) for c in r.find_all(["td", "th"])]
        links = [(a.get_text(strip=True), a.get("href")) for a in r.find_all("a")]
        if cells:
            out_lines.append(f"  Row: {' | '.join(cells[:2])}")
            if links:
                out_lines.append(f"    Links: {links}")

with open("vtu_tables_dump.txt", "w", encoding="utf-8") as f_out:
    f_out.write("\n".join(out_lines))

print(f"Successfully dumped {len(out_lines)} lines to vtu_tables_dump.txt")
