"""
VTU Result Portal Discovery.

Scrapes the VTU results homepage (https://results.vtu.ac.in/) for the list of
exam-result links it currently advertises, and syncs them into Supabase:

  - `vtu_urls_2022_scheme` / `vtu_urls_2025_scheme` — the canonical BE-only
                           portal tables. A single VTU exam-session portal
                           serves any BE USN regardless of admission-year
                           scheme, so both tables are seeded identically today
                           (see database/migrations/002_scheme_reorg.sql for
                           why they're still kept as separate tables).
  - `faculty_vtu_urls`  — every already-approved faculty gets any newly
                           discovered portal added to their own list too, so
                           existing faculty don't miss new exam sessions.

Non-BE programs (Ph.D, M.S(Research), MBA, MCA, M.Tech, Online Degree
Programs, B.Arch, BBA, BCA) are filtered out entirely — see BE_DENYLIST.
Portals are stored/read in ascending chronological order (oldest exam
session first) — see `_sort_key`.

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

# Labels matching any of these are not BE/B.Tech programs — skip entirely.
BE_DENYLIST = re.compile(
    r"ph\.?\s*d|m\.?s\s*\(?research\)?|\bmba\b|\bmca\b|m\.?\s*tech|"
    r"online degree|b\.?\s*arch|\bbba\b|\bbca\b|\bpg\b",
    re.IGNORECASE,
)

_MONTH_RANK = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _sort_key(label: str):
    """Best-effort chronological key so portals sort oldest-first.

    VTU labels mix "Jun/Jul 24 Regular" (2-digit year) and
    "December-2025/January-2026 Examination" (4-digit year) styles. We prefer
    a 4-digit year if present (normalized mod 100) else fall back to a
    2-digit one, paired with the last month mentioned, as an approximate
    (year, month) key; anything unparsed sorts first (0, 0) rather than crashing.
    """
    months = re.findall(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)", label, re.IGNORECASE)
    years4 = re.findall(r"\b(20\d{2})\b", label)
    if years4:
        year = int(years4[-1]) % 100
    else:
        years2 = re.findall(r"\b(\d{2})\b(?!\d)", label)
        year = int(years2[-1]) if years2 else 0
    month = _MONTH_RANK.get(months[-1].lower(), 0) if months else 0
    return (year, month)


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


def _filter_be(links):
    """Drop anything that isn't a BE/B.Tech program (Ph.D, M.S Research, MBA/MCA, Online Degree, etc)."""
    be_links, skipped = [], []
    for label, url in links:
        if BE_DENYLIST.search(label):
            skipped.append((label, url))
        else:
            be_links.append((label, url))
    return be_links, skipped


def sync_scheme_tables(links):
    """Seed both vtu_urls_2022_scheme and vtu_urls_2025_scheme from the same
    BE-filtered, ascending-ordered portal list (see module docstring for why
    both tables get identical content today). Returns (new_links, sort_order_by_url)."""
    ordered = sorted(links, key=lambda pair: _sort_key(pair[0]))
    sort_order_by_url = {url: i for i, (_, url) in enumerate(ordered)}

    new_links = []
    for table in ("vtu_urls_2022_scheme", "vtu_urls_2025_scheme"):
        existing = supabase.table(table).select("url").execute()
        existing_urls = {r["url"] for r in (existing.data or [])}
        new_links = [(label, url) for label, url in ordered if url not in existing_urls]

        if ordered:
            records = [
                {
                    "title": label, "url": url, "exam_name": label,
                    "is_active": True, "sort_order": i,
                }
                for i, (label, url) in enumerate(ordered)
            ]
            supabase.table(table).upsert(records, on_conflict="url").execute()

    return new_links, sort_order_by_url


def sync_faculty_tables(new_links, sort_order_by_url):
    if not new_links:
        return 0

    faculty = supabase.table("faculty_onboarding").select("id").eq("status", "approved").execute()
    faculty_ids = [r["id"] for r in (faculty.data or [])]
    if not faculty_ids:
        return 0

    records = [
        {"faculty_id": fid, "url": url, "exam_name": label, "is_active": True,
         "sort_order": sort_order_by_url.get(url, 0)}
        for fid in faculty_ids
        for label, url in new_links
    ]
    supabase.table("faculty_vtu_urls").upsert(records, on_conflict="faculty_id,url").execute()
    return len(records)


def main():
    print(f"Fetching {HOMEPAGE} ...")
    links = fetch_homepage_links()
    print(f"Found {len(links)} result portal link(s) on the homepage.")

    be_links, skipped = _filter_be(links)
    if skipped:
        print(f"Skipped {len(skipped)} non-BE program link(s):")
        for label, url in skipped:
            print(f"  - {label} -> {url}")

    new_links, sort_order_by_url = sync_scheme_tables(be_links)

    if new_links:
        print(f"Discovered {len(new_links)} NEW BE portal(s):")
        for label, url in new_links:
            print(f"  + {label} -> {url}")
    else:
        print("No new BE portals since last run.")

    seeded = sync_faculty_tables(new_links, sort_order_by_url)
    if seeded:
        print(f"Propagated new portal(s) to {seeded} faculty_vtu_urls row(s).")


if __name__ == "__main__":
    main()
