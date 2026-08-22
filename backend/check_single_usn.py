import os
import sys
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

usn = "2AB23CS039"

print(f"=== CHECKING DATABASE RECORDS FOR {usn} ===")

# 1. Student profile
res_st = supabase.table("students").select("*").ilike("usn", usn).execute()
print("\n1. Student Profile:")
print(json.dumps(res_st.data, indent=2))

# 2. Subject marks
res_marks = supabase.table("subject_marks").select("semester, subject_code, subject_name, grade, total, is_backlog").ilike("usn", usn).order("semester").execute()
print(f"\n2. Subject Marks ({len(res_marks.data or [])} total subject rows):")

marks_by_sem = {}
for m in (res_marks.data or []):
    s = m.get("semester")
    if s not in marks_by_sem:
        marks_by_sem[s] = []
    marks_by_sem[s].append(m)

for s in sorted(marks_by_sem.keys()):
    print(f"\n  --- Semester {s} ({len(marks_by_sem[s])} subjects) ---")
    for m in marks_by_sem[s]:
        print(f"    Code: {m['subject_code']} | Name: {m['subject_name']} | Grade: {m['grade']} | Total: {m['total']} | Backlog: {m['is_backlog']}")

# 3. Results table
res_results = supabase.table("results").select("*").ilike("usn", usn).order("semester").execute()
print(f"\n3. Results Table ({len(res_results.data or [])} rows):")
print(json.dumps(res_results.data, indent=2))

# 4. Academic Remarks table
res_remarks = supabase.table("academic_remarks").select("*").ilike("student_usn", usn).order("semester").execute()
print(f"\n4. Academic Remarks Table ({len(res_remarks.data or [])} rows):")
print(json.dumps(res_remarks.data, indent=2))
