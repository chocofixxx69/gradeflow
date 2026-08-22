import os
import sys
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

print("Auditing 2AB23 batch & lateral entry students in database...")
students = fetch_all("students", "usn, name, branch, semester")
class_students = fetch_all("class_students", "usn, class_id")
marks = fetch_all("subject_marks", "usn, semester")
results = fetch_all("results", "usn, semester")
remarks = fetch_all("academic_remarks", "student_usn, semester")

# Read local second_year_usns.csv if available
csv_path = r"C:\Users\datas\Downloads\second_year_usns.csv"
csv_usns = set()
if os.path.exists(csv_path):
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.reader(f)
        for row in reader:
            for cell in row:
                u = cell.strip().upper()
                if u.startswith("2AB23") or (u.startswith("2AB24") and "4" in u[7:10]):
                    csv_usns.add(u)

# Collect all 2AB23 regular & 2AB24 lateral USNs
usns = set()
for s in students:
    u = (s.get("usn") or "").strip().upper()
    if u.startswith("2AB23") or (u.startswith("2AB24") and "4" in u[7:10]):
        usns.add(u)

for cs in class_students:
    u = (cs.get("usn") or "").strip().upper()
    if u.startswith("2AB23") or (u.startswith("2AB24") and "4" in u[7:10]):
        usns.add(u)

for u in csv_usns:
    usns.add(u)

all_2ab23_usns = sorted(list(usns))
print(f"Total 2AB23 batch USNs identified: {len(all_2ab23_usns)}")

# Build per-USN semester presence map
sem_presence = {u: set() for u in all_2ab23_usns}

for m in marks:
    u = (m.get("usn") or "").strip().upper()
    s = m.get("semester")
    if u in sem_presence and s:
        try: sem_presence[u].add(int(s))
        except: pass

for r in results:
    u = (r.get("usn") or "").strip().upper()
    s = r.get("semester")
    if u in sem_presence and s:
        try: sem_presence[u].add(int(s))
        except: pass

for r in remarks:
    u = (r.get("student_usn") or "").strip().upper()
    s = r.get("semester")
    if u in sem_presence and s:
        try: sem_presence[u].add(int(s))
        except: pass

incomplete_list = []
full_report = []

for u in all_2ab23_usns:
    is_lateral = "4" in u[7:10] if len(u) >= 10 else False
    expected = set(range(3, 7)) if is_lateral else set(range(1, 7))
    found = sem_presence.get(u, set())
    missing = sorted(list(expected - found))

    if len(missing) > 0:
        incomplete_list.append(u)
        status = "INCOMPLETE"
    else:
        status = "COMPLETE"

    full_report.append({
        "usn": u,
        "is_lateral": is_lateral,
        "found": sorted(list(found)),
        "missing": missing,
        "status": status
    })

# Write output files
txt_file = os.path.join(os.path.dirname(__file__), "2ab23_missing_usns.txt")
csv_file = os.path.join(os.path.dirname(__file__), "2ab23_missing_report.csv")

with open(txt_file, "w") as f:
    for u in incomplete_list:
        f.write(f"{u}\n")

with open(csv_file, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["USN", "Is_Lateral", "Found_Semesters", "Missing_Semesters", "Status"])
    for r in full_report:
        writer.writerow([
            r["usn"],
            r["is_lateral"],
            ";".join(map(str, r["found"])),
            ";".join(map(str, r["missing"])),
            r["status"]
        ])

print("\n" + "="*70)
print("             2AB23 BATCH SEMESTER AUDIT SUMMARY")
print("="*70)
print(f"Total 2AB23 Batch Students Analyzed: {len(all_2ab23_usns)}")
print(f"[OK] Fully Complete Students (All Semesters Present): {len(all_2ab23_usns) - len(incomplete_list)}")
print(f"[MISSING] Students with Missing Semesters: {len(incomplete_list)}")
print("\n--- INCOMPLETE USNs & MISSING SEMESTERS ---")
for r in full_report:
    if r["status"] == "INCOMPLETE":
        print(f"USN: {r['usn']} | Found: Sem {r['found']} | MISSING: Sem {r['missing']}")
print("="*70)
