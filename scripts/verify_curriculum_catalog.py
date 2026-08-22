import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

TARGET_BRANCHES = ["AI", "CS", "CV", "DS", "EC", "EE", "ME", "RI"]
TARGET_SCHEMES = ["2022", "2025"]

print("=== VERIFYING SUPABASE SUBJECT CATALOG ===")

# Fetch all rows from subject_catalog
page_size = 1000
from_idx = 0
all_catalog = []
while True:
    res = supabase.table("subject_catalog").select("*").range(from_idx, from_idx + page_size - 1).execute()
    rows = res.data or []
    all_catalog.extend(rows)
    if len(rows) < page_size:
        break
    from_idx += page_size

print(f"Total rows in subject_catalog: {len(all_catalog)}")

# Check coverage
coverage = {}
invalid_credits = []
null_credits = []

for row in all_catalog:
    sc = row.get("scheme")
    br = row.get("branch")
    sem = row.get("semester")
    cr = row.get("credits")
    code = row.get("subject_code")
    
    if sc in TARGET_SCHEMES and br in TARGET_BRANCHES and 1 <= sem <= 8:
        coverage.setdefault((sc, br, sem), []).append(row)
        
    if cr is None:
        null_credits.append(row)
    elif not isinstance(cr, int) or cr < 1 or cr > 24:
        invalid_credits.append(row)

print(f"\nNull credits count: {len(null_credits)}")
print(f"Invalid credits (<1 or >24) count: {len(invalid_credits)}")

missing_slots = []
for sc in TARGET_SCHEMES:
    for br in TARGET_BRANCHES:
        for sem in range(1, 9):
            subs = coverage.get((sc, br, sem), [])
            if not subs:
                missing_slots.append(f"Scheme {sc} | Branch {br} | Sem {sem}")

print(f"\nMissing (scheme, branch, semester) combinations: {len(missing_slots)}")
if missing_slots:
    for ms in missing_slots:
        print(f"  MISSING: {ms}")
else:
    print("  [SUCCESS] All 128 (scheme, branch, semester) slots are 100% covered!")

print("\nSample check of subject counts by branch/scheme:")
for sc in TARGET_SCHEMES:
    for br in TARGET_BRANCHES:
        total_b = sum(len(coverage.get((sc, br, s), [])) for s in range(1, 9))
        print(f"  Scheme {sc} | Branch {br:2s} -> {total_b} courses across Sem 1-8")

if not null_credits and not invalid_credits and not missing_slots:
    print("\n>>> ALL CURRICULUM CATALOG INTEGRITY TESTS PASSED SUCCESSFULLY! <<<")
else:
    print("\n>>> INTEGRITY ISSUES FOUND! <<<")
