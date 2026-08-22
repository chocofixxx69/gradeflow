import os
import re
from bs4 import BeautifulSoup

html_file = r"C:\Users\MY PC\.gemini\antigravity-ide\brain\d1ef9544-2649-463f-bd7b-68d56119b1c6\.system_generated\steps\323\content.md"
with open(html_file, "r", encoding="utf-8", errors="ignore") as f:
    content = f.read()

soup = BeautifulSoup(content, "html.parser")

links = soup.find_all("a")
print(f"Total <a> links in VTU page: {len(links)}")

schemes_2022_2025 = []
for a in links:
    href = a.get("href", "")
    text = a.get_text(strip=True)
    if "2022" in text or "2022" in href or "2025" in text or "2025" in href or "nep" in text.lower() or "scheme" in text.lower():
        schemes_2022_2025.append((text, href))

print(f"Found {len(schemes_2022_2025)} relevant links:")
for t, h in schemes_2022_2025[:50]:
    safe_t = t.encode("ascii", "replace").decode("ascii")
    print(f"  [{safe_t}] -> {h}")
