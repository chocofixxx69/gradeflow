import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1. Branches table
branches = supabase.table("branches").select("*").execute().data or []
print("=== BRANCHES TABLE ===")
for b in branches:
    print(f"  {b['code']}: {b.get('label')}")

# 2. Distinct branches and schemes in students
student_rows = supabase.table("students").select("branch, scheme, semester").execute().data or []

branch_counts = {}
scheme_counts = {}
for s in student_rows:
    b = s.get("branch")
    sch = s.get("scheme")
    branch_counts[b] = branch_counts.get(b, 0) + 1
    scheme_counts[sch] = scheme_counts.get(sch, 0) + 1

print(f"\nTotal students: {len(student_rows)}")
print("Student Branch Distribution:", branch_counts)
print("Student Scheme Distribution:", scheme_counts)

# 3. subject_catalog breakdown
catalog_rows = supabase.table("subject_catalog").select("scheme, branch, semester, subject_code, credits").execute().data or []

cat_dist = {}
for c in catalog_rows:
    key = (c.get("scheme"), c.get("branch"), c.get("semester"))
    cat_dist[key] = cat_dist.get(key, 0) + 1

print(f"\nTotal subject_catalog rows: {len(catalog_rows)}")
print("Subject Catalog Distribution (scheme, branch, sem):")
for k in sorted(cat_dist.keys()):
    print(f"  Scheme {k[0]} | Branch {k[1]} | Sem {k[2]}: {cat_dist[k]} subjects")
