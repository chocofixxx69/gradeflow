"""
VTU Result Portal Discovery.

Scrapes the VTU results homepage (https://results.vtu.ac.in/) for the list of
exam-result links it currently advertises, and syncs them into Supabase:

  - `vtu_result_urls`   — the global fallback table used for faculty who have
                           not been individually seeded yet.
  - `faculty_vtu_urls`  — every already-approved faculty gets any newly
                           discovered portal added to their own list too, so
                           existing faculty don't miss new exam sessions.

Run manually:  python backend/scraper/discover_urls.py
Run in CI:     see .github/workflows/vtu-url-discovery.yml (scheduled)
"""

import os
import re
import ssl

import urllib3
import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from supabase import create_client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

ssl._create_default_https_context = ssl._create_unverified_context
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

HOMEPAGE = "https://results.vtu.ac.in/"

# Links that appear on the homepage but aren't exam-result portals.
IGNORE_PATTERNS = (
    "index.php",  # the homepage logo link itself
)


def fetch_homepage_links():
    """Return [(label, absolute_url)] for every result link on the VTU homepage."""
    resp = requests.get(HOMEPAGE, headers={"User-Agent": "Mozilla/5.0"}, verify=False, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    links = []
    seen = set()

    for el in soup.find_all(onclick=re.compile(r"window\.open\(")):
        m = re.search(r"window\.open\(\s*['\"]([^'\"]+)['\"]", el.get("onclick", ""))
        if not m:
            continue
        href = m.group(1).strip()
        if not href or href in IGNORE_PATTERNS:
            continue

        label_tag = el.find("b")
        label = label_tag.get_text(strip=True) if label_tag else el.get_text(strip=True)
        label = re.sub(r"\s+", " ", label).strip()
        if not label:
            continue

        url = href if href.startswith("http") else HOMEPAGE + href.lstrip("/")

        if url in seen:
            continue
        seen.add(url)
        links.append((label, url))

    return links


def sync_global_table(links):
    existing = supabase.table("vtu_result_urls").select("url").execute()
    existing_urls = {r["url"] for r in (existing.data or [])}

    new_links = [(label, url) for label, url in links if url not in existing_urls]

    if links:
        records = [
            {"title": label, "url": url, "exam_name": label, "is_active": True}
            for label, url in links
        ]
        supabase.table("vtu_result_urls").upsert(records, on_conflict="url").execute()

    return new_links


def sync_faculty_tables(new_links):
    if not new_links:
        return 0

    faculty = supabase.table("faculty_onboarding").select("id").eq("status", "approved").execute()
    faculty_ids = [r["id"] for r in (faculty.data or [])]
    if not faculty_ids:
        return 0

    records = [
        {"faculty_id": fid, "url": url, "exam_name": label, "is_active": True}
        for fid in faculty_ids
        for label, url in new_links
    ]
    supabase.table("faculty_vtu_urls").upsert(records, on_conflict="faculty_id,url").execute()
    return len(records)


def main():
    print(f"Fetching {HOMEPAGE} ...")
    links = fetch_homepage_links()
    print(f"Found {len(links)} result portal link(s) on the homepage.")

    new_links = sync_global_table(links)

    if new_links:
        print(f"Discovered {len(new_links)} NEW portal(s):")
        for label, url in new_links:
            print(f"  + {label} -> {url}")
    else:
        print("No new portals since last run.")

    seeded = sync_faculty_tables(new_links)
    if seeded:
        print(f"Propagated new portal(s) to {seeded} faculty_vtu_urls row(s).")


if __name__ == "__main__":
    main()
