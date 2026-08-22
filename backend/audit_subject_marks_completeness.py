import os
import sys
import csv
import json
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

print("Auditing SUBJECT_MARKS table specifically for all 2AB23 batch & lateral USNs...")
students = fetch_all("students", "usn, name, branch, semester")
class_students = fetch_all("class_students", "usn, class_id")
marks = fetch_all("subject_marks", "usn, semester, subject_code")

# Read local second_year_usns.csv
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

# Group subject_marks by USN and Semester
marks_count_map = {}
for u in all_2ab23_usns:
    marks_count_map[u] = {}

for m in marks:
    u = (m.get("usn") or "").strip().upper()
    s = m.get("semester")
    if u in marks_count_map and s:
        try:
            sem_num = int(s)
            marks_count_map[u][sem_num] = marks_count_map[u].get(sem_num, 0) + 1
        except:
            pass

incomplete_list = []
full_report = []

for u in all_2ab23_usns:
    is_lateral = "4" in u[7:10] if len(u) >= 10 else False
    expected = set(range(3, 7)) if is_lateral else set(range(1, 7))
    
    # A semester is valid ONLY IF it has at least 4 subject marks saved
    sem_counts = marks_count_map.get(u, {})
    found = [s for s in sorted(expected) if sem_counts.get(s, 0) >= 4]
    missing = [s for s in sorted(expected) if sem_counts.get(s, 0) < 4]

    if len(missing) > 0:
        incomplete_list.append(u)
        status = "INCOMPLETE"
    else:
        status = "COMPLETE"

    full_report.append({
        "usn": u,
        "is_lateral": is_lateral,
        "found_semesters": found,
        "missing_semesters": missing,
        "sem_mark_counts": {s: sem_counts.get(s, 0) for s in sorted(expected)},
        "status": status
    })

# Output files
out_txt = os.path.join(os.path.dirname(__file__), "true_missing_2ab23_usns.txt")
out_csv = os.path.join(os.path.dirname(__file__), "true_missing_2ab23_report.csv")

with open(out_txt, "w") as f:
    for u in incomplete_list:
        f.write(f"{u}\n")

with open(out_csv, "w", newline="", encoding="utf-8") as f:
    writer = csv.writer(f)
    writer.writerow(["USN", "Is_Lateral", "Valid_Subject_Semesters", "Missing_Subject_Semesters", "Mark_Counts_Per_Sem", "Status"])
    for r in full_report:
        writer.writerow([
            r["usn"],
            r["is_lateral"],
            ";".join(map(str, r["found_semesters"])),
            ";".join(map(str, r["missing_semesters"])),
            json.dumps(r["sem_mark_counts"]),
            r["status"]
        ])

print("="*70)
print("     SUBJECT_MARKS DETAILED COMPLETENESS AUDIT FOR 2AB23 BATCH")
print("="*70)
print(f"Total 2AB23 Batch USNs Analyzed: {len(all_2ab23_usns)}")
print(f"[OK] Fully Complete (Detailed Subject Marks Present for All Semesters): {len(all_2ab23_usns) - len(incomplete_list)}")
print(f"[MISSING] USNs Missing Detailed Subject Marks for 1+ Semesters: {len(incomplete_list)}")
print("\n--- DETAILED MISSING SUBJECT MARKS LIST ---")
for r in full_report:
    if r["status"] == "INCOMPLETE":
        print(f"USN: {r['usn']} | Valid Subject Sems: {r['found_semesters']} | MISSING SUBJECT MARKS: Sem {r['missing_semesters']} | Counts: {r['sem_mark_counts']}")
print("="*70)
