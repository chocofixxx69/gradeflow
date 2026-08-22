import os
from bs4 import BeautifulSoup

html_file = r"C:\Users\MY PC\.gemini\antigravity-ide\brain\d1ef9544-2649-463f-bd7b-68d56119b1c6\.system_generated\steps\323\content.md"
with open(html_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

soup = BeautifulSoup(content, "html.parser")

# Find all headings
headings = soup.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "strong", "b"])

print("=== RELEVANT HEADINGS ===")
for h in headings:
    txt = h.get_text(strip=True)
    if any(k in txt.lower() for k in ["2022", "2025", "nep", "b.e", "scheme", "syllabus"]):
        safe = txt.encode("ascii", "replace").decode("ascii")
        print(f"[{h.name}] {safe}")

# Also find which tables are under 2022 and 2025
print("\n=== FIND TABLES WITH 2022 OR 2025 ===")
for idx, tbl in enumerate(soup.find_all("table")):
    tbl_text = tbl.get_text(strip=True)
    if "2022" in tbl_text or "2025" in tbl_text or "NEP" in tbl_text:
        # get preceding heading
        prev_h = tbl.find_previous(["h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "p"])
        prev_text = prev_h.get_text(strip=True) if prev_h else "None"
        prev_safe = prev_text.encode("ascii", "replace").decode("ascii")
        print(f"\nTable {idx + 1} (under '{prev_safe}'):")
        rows = tbl.find_all("tr")
        print(f"  Rows count: {len(rows)}")
        for r in rows[:15]:
            cells = [c.get_text(strip=True).encode("ascii", "replace").decode("ascii") for c in r.find_all(["td", "th"])]
            links = [a.get("href") for a in r.find_all("a")]
            print(f"    {' | '.join(cells[:3])} -> Links: {links}")
