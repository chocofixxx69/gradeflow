import os
from bs4 import BeautifulSoup

html_file = r"C:\Users\MY PC\.gemini\antigravity-ide\brain\d1ef9544-2649-463f-bd7b-68d56119b1c6\.system_generated\steps\323\content.md"
with open(html_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

soup = BeautifulSoup(content, "html.parser")

tables = soup.find_all("table")
print(f"Total tables found: {len(tables)}")

for idx, tbl in enumerate(tables):
    rows = tbl.find_all("tr")
    headers = [th.get_text(strip=True) for th in rows[0].find_all(["th", "td"])] if rows else []
    safe_headers = [h.encode('ascii', 'replace').decode('ascii') for h in headers]
    print(f"\n--- Table {idx + 1} ({len(rows)} rows) | Headers: {safe_headers} ---")
    
    # print sample rows
    for r in rows[1:10]:
        cols = r.find_all(["td", "th"])
        col_texts = []
        for c in cols:
            links = [a.get("href") for a in c.find_all("a")]
            txt = c.get_text(strip=True).encode('ascii', 'replace').decode('ascii')
            if links:
                col_texts.append(f"{txt} ({', '.join(links)})")
            else:
                col_texts.append(txt)
        print("  | ".join(col_texts[:4]))
