import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

usn = "2AB23CS043"
print(f"=== DETAILED AUDIT OF {usn} ===")

# 1. Fetch marks from subject_marks
marks = supabase.table("subject_marks").select("*").ilike("usn", usn).execute().data or []
print(f"Total marks rows: {len(marks)}")

# 2. Fetch academic_remarks
remarks = supabase.table("academic_remarks").select("*").ilike("student_usn", usn).execute().data or []
print("\nAcademic Remarks stored in DB:")
for r in sorted(remarks, key=lambda x: x["semester"]):
    print(f"  Sem {r['semester']}: SGPA = {r['sgpa']}, Backlogs = {r.get('backlog_count')}, Result = {r.get('result_status')}")

# 3. Fetch results table
results = supabase.table("results").select("*").ilike("usn", usn).execute().data or []
print("\nResults table stored in DB:")
for res in sorted(results, key=lambda x: x["semester"]):
    print(f"  Sem {res['semester']}: SGPA = {res['sgpa']}, Total Cr = {res.get('total_credits')}, Exam = {res.get('exam_name')}")

# 4. Group marks by semester and show each subject, internal, external, total, grade, credits
by_sem = {}
for m in marks:
    by_sem.setdefault(m["semester"], []).append(m)

for s in sorted(by_sem.keys()):
    print(f"\n--- SEMESTER {s} MARKS ---")
    for m in by_sem[s]:
        print(f"  Code: {m['subject_code']:10s} | Name: {m['subject_name'][:28]:28s} | Grade: {m.get('grade')} | CIE: {m.get('internal')} | SEE: {m.get('external')} | Total: {m.get('total')} | Stored Cr: {m.get('credits')}")
