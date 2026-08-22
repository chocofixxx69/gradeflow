import os
import sys
import json
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "scraper", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: SUPABASE_URL or SUPABASE_KEY not configured.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def fetch_all(table, select="*", where_field=None, where_op="eq", where_val=None):
    rows = []
    page_size = 1000
    offset = 0
    while True:
        query = supabase.table(table).select(select).range(offset, offset + page_size - 1)
        if where_field and where_val is not None:
            if where_op == "eq":
                query = query.eq(where_field, where_val)
            elif where_op == "like":
                query = query.like(where_field, where_val)
            elif where_op == "ilike":
                query = query.ilike(where_field, where_val)
        res = query.execute()
        data = res.data or []
        rows.extend(data)
        if len(data) < page_size:
            break
        offset += page_size
    return rows

print("Fetching student profiles from Supabase...")
all_students = fetch_all("students", "usn, name, branch, semester")

# Filter for 2AB23 regular batch and 2AB24 lateral entry batch (CS, CD, CI, EC, ME, CV, etc.)
target_students = []
for s in all_students:
    u = (s.get("usn") or "").strip().upper()
    if u.startswith("2AB23") or (u.startswith("2AB24") and "4" in u[7:10]):
        target_students.append(s)

print(f"Found {len(target_students)} target students in 2AB23/2AB24 lateral batch.")

# Also get all class enrolled students
class_students = fetch_all("class_students", "usn, class_id")
class_usns = set((c.get("usn") or "").strip().upper() for c in class_students)
print(f"Total enrolled class students in DB: {len(class_usns)}")

# Combine USNs
all_target_usns = set((s.get("usn") or "").strip().upper() for s in target_students).union(class_usns)

print(f"Total unique target USNs to verify: {len(all_target_usns)}")

# Fetch marks & results for these USNs
print("Fetching subject_marks from Supabase...")
marks_rows = fetch_all("subject_marks", "usn, semester, subject_code, grade, total")

print("Fetching results from Supabase...")
results_rows = fetch_all("results", "usn, semester, sgpa")

print("Fetching academic_remarks from Supabase...")
remarks_rows = fetch_all("academic_remarks", "student_usn, semester, sgpa")

# Map existing semesters per USN
student_sems = {u: set() for u in all_target_usns}

for m in marks_rows:
    u = (m.get("usn") or "").strip().upper()
    s = m.get("semester")
    if u in student_sems and s:
        try:
            student_sems[u].add(int(s))
        except ValueError:
            pass

for r in results_rows:
    u = (r.get("usn") or "").strip().upper()
    s = r.get("semester")
    if u in student_sems and s:
        try:
            student_sems[u].add(int(s))
        except ValueError:
            pass

for r in remarks_rows:
    u = (r.get("student_usn") or "").strip().upper()
    s = r.get("semester")
    if u in student_sems and s:
        try:
            student_sems[u].add(int(s))
        except ValueError:
            pass

# Analyze missing semesters (For 2AB23 regular: Sem 1 to 6 expected; For lateral 2AB24: Sem 3 to 6 expected)
missing_report = []
usns_needing_scrape = []

for u in sorted(all_target_usns):
    is_lateral = "4" in u[7:10] if len(u) >= 10 else False
    expected_sems = set(range(3, 7)) if is_lateral else set(range(1, 7))
    found_sems = student_sems.get(u, set())
    missing_sems = sorted(list(expected_sems - found_sems))
    
    if len(found_sems) == 0:
        status = "COMPLETELY_UNSCRAPED"
        usns_needing_scrape.append(u)
    elif len(missing_sems) > 0:
        status = "PARTIALLY_SCRAPED"
        usns_needing_scrape.append(u)
    else:
        status = "COMPLETE"

    missing_report.append({
        "usn": u,
        "is_lateral": is_lateral,
        "found_semesters": sorted(list(found_sems)),
        "missing_semesters": missing_sems,
        "status": status
    })

# Write output files
output_txt = os.path.join(os.path.dirname(__file__), "missing_2ab23_usns.txt")
output_csv = os.path.join(os.path.dirname(__file__), "missing_2ab23_report.csv")
output_json = os.path.join(os.path.dirname(__file__), "missing_2ab23_report.json")

with open(output_txt, "w") as f:
    for u in usns_needing_scrape:
        f.write(f"{u}\n")

with open(output_csv, "w") as f:
    f.write("USN,Is_Lateral,Found_Semesters,Missing_Semesters,Status\n")
    for item in missing_report:
        f_sems = ";".join(map(str, item["found_semesters"]))
        m_sems = ";".join(map(str, item["missing_semesters"]))
        f.write(f"{item['usn']},{item['is_lateral']},\"{f_sems}\",\"{m_sems}\",{item['status']}\n")

with open(output_json, "w") as f:
    json.dump(missing_report, f, indent=2)

print("\n" + "="*60)
print(f"ANALYSIS COMPLETE:")
print(f"Total Target Students Analyzed: {len(all_target_usns)}")
print(f"Fully Scraped Students (Sem 1-6 / Sem 3-6): {len(all_target_usns) - len(usns_needing_scrape)}")
print(f"Students Needing Scraping (Missing 1+ Semesters): {len(usns_needing_scrape)}")
print(f"\nSaved USN list to scrape: {output_txt}")
print(f"Saved Detailed CSV report to: {output_csv}")
print("="*60)
