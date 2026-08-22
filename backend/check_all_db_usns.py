import os
import sys
import json
import csv
import re
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "scraper", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_KEY not configured.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_all(table, select="*"):
    rows = []
    page_size = 1000
    offset = 0
    while True:
        res = supabase.table(table).select(select).range(offset, offset + page_size - 1).execute()
        data = res.data or []
        rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return rows

print("1. Fetching all USNs from local CSV files in Downloads...")
csv_usns = set()
downloads_dir = r"C:\Users\datas\Downloads"

vtu_regex = re.compile(r'^2AB\d{2}[A-Z]{2,3}\d{3}$')

for fname in os.listdir(downloads_dir):
    if fname.endswith(".csv") and ("usn" in fname.lower() or "year" in fname.lower() or "student" in fname.lower()):
        fpath = os.path.join(downloads_dir, fname)
        try:
            with open(fpath, "r", encoding="utf-8-sig") as f:
                reader = csv.reader(f)
                for row in reader:
                    for cell in row:
                        val = cell.strip().upper()
                        if vtu_regex.match(val):
                            csv_usns.add(val)
        except Exception as e:
            pass

print(f"   Found {len(csv_usns)} USNs across local CSV files in Downloads.")

print("2. Fetching all USNs from Supabase tables...")
students = fetch_all("students", "usn, name, branch, semester")
class_students = fetch_all("class_students", "usn, class_id")
marks = fetch_all("subject_marks", "usn, semester")
results = fetch_all("results", "usn, semester")
remarks = fetch_all("academic_remarks", "student_usn, semester")

db_usns = set()
student_profile_map = {}
for s in students:
    u = (s.get("usn") or "").strip().upper()
    if u and vtu_regex.match(u):
        db_usns.add(u)
        student_profile_map[u] = s

for cs in class_students:
    u = (cs.get("usn") or "").strip().upper()
    if u and vtu_regex.match(u):
        db_usns.add(u)

for m in marks:
    u = (m.get("usn") or "").strip().upper()
    if u and vtu_regex.match(u):
        db_usns.add(u)

all_usns = sorted(list(db_usns.union(csv_usns)))
print(f"   Total unique USNs across Database & Local CSVs: {len(all_usns)}")

# Build semester map per USN
sem_map = {u: set() for u in all_usns}

for m in marks:
    u = (m.get("usn") or "").strip().upper()
    s = m.get("semester")
    if u in sem_map and s:
        try: sem_map[u].add(int(s))
        except: pass

for r in results:
    u = (r.get("usn") or "").strip().upper()
    s = r.get("semester")
    if u in sem_map and s:
        try: sem_map[u].add(int(s))
        except: pass

for r in remarks:
    u = (r.get("student_usn") or "").strip().upper()
    s = r.get("semester")
    if u in sem_map and s:
        try: sem_map[u].add(int(s))
        except: pass

# Categorize USNs by batch
batch_stats = {}
incomplete_usns = []
completely_missing_usns = []
full_audit = []

for u in all_usns:
    # Determine expected semesters based on USN batch year
    # 2AB21 -> Sem 1-7
    # 2AB22 -> Sem 1-6 (or Sem 3-6 if lateral 4XX)
    # 2AB23 -> Sem 1-6 (or Sem 3-6 if lateral 4XX)
    # 2AB24 -> Sem 1-2
    batch_year = "Unknown"
    is_lateral = False
    expected_sems = set(range(1, 7))

    if len(u) >= 7:
        prefix = u[3:5] # e.g. '21', '22', '23', '24'
        is_lateral = "4" in u[7:10] if len(u) >= 10 else False
        if prefix == "21":
            batch_year = "2021 Batch (Sem 1-7)"
            expected_sems = set(range(3, 8)) if is_lateral else set(range(1, 8))
        elif prefix == "22":
            batch_year = "2022 Batch (Sem 1-6)"
            expected_sems = set(range(3, 7)) if is_lateral else set(range(1, 7))
        elif prefix == "23":
            batch_year = "2023 Batch (Sem 1-6)"
            expected_sems = set(range(3, 7)) if is_lateral else set(range(1, 7))
        elif prefix == "24":
            batch_year = "2024 Batch (Sem 1-2)"
            expected_sems = set(range(1, 3))

    found = sem_map.get(u, set())
    missing = sorted(list(expected_sems - found))

    if batch_year not in batch_stats:
        batch_stats[batch_year] = {"total": 0, "complete": 0, "partial": 0, "missing": 0}
    
    batch_stats[batch_year]["total"] += 1

    if len(found) == 0:
        status = "COMPLETELY_MISSING"
        batch_stats[batch_year]["missing"] += 1
        completely_missing_usns.append(u)
        incomplete_usns.append(u)
    elif len(missing) > 0:
        status = "PARTIALLY_SCRAPED"
        batch_stats[batch_year]["partial"] += 1
        incomplete_usns.append(u)
    else:
        status = "COMPLETE"
        batch_stats[batch_year]["complete"] += 1

    full_audit.append({
        "usn": u,
        "batch": batch_year,
        "is_lateral": is_lateral,
        "found_semesters": sorted(list(found)),
        "missing_semesters": missing,
        "status": status
    })

# Output results
out_all_usns = os.path.join(os.path.dirname(__file__), "all_incomplete_usns.txt")
out_csv = os.path.join(os.path.dirname(__file__), "full_database_audit.csv")

with open(out_all_usns, "w") as f:
    for u in incomplete_usns:
        f.write(f"{u}\n")

with open(out_csv, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["USN", "Batch", "Is_Lateral", "Found_Semesters", "Missing_Semesters", "Status"])
    for item in full_audit:
        writer.writerow([
            item["usn"],
            item["batch"],
            item["is_lateral"],
            ";".join(map(str, item["found_semesters"])),
            ";".join(map(str, item["missing_semesters"])),
            item["status"]
        ])

print("\n" + "="*70)
print("             FULL DATABASE & CSV AUDIT REPORT")
print("="*70)
for bname, bdata in batch_stats.items():
    print(f"--- {bname} ---")
    print(f"   Total USNs: {bdata['total']}")
    print(f"   [OK] Fully Complete: {bdata['complete']}")
    print(f"   [PARTIAL] Partially Scraped: {bdata['partial']}")
    print(f"   [MISSING] Completely Missing: {bdata['missing']}")
    print("-"*40)

print(f"\nTOTAL USNs IN DATABASE & CSVs: {len(all_usns)}")
print(f"TOTAL USNs NEEDING SCRAPING: {len(incomplete_usns)}")
print(f"Saved complete USN list to scrape: {out_all_usns}")
print(f"Saved full CSV audit to: {out_csv}")
print("="*70)
