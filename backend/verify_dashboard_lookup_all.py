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

test_usns = ["2AB23CS006", "2AB23CS009", "2AB23CS010", "2AB23CS002", "2AB23CS039", "2AB24CS406"]

print("=== VERIFYING CASE-INSENSITIVE DASHBOARD LOOKUP FOR CS USNs ===")

for usn in test_usns:
    # 1. Fetch subject_marks using ILIKE
    res = supabase.table("subject_marks").select("semester, subject_code, grade, total").ilike("usn", usn).execute()
    marks = res.data or []
    
    # Group by semester
    by_sem = {}
    for m in marks:
        s = m.get("semester")
        if s not in by_sem: by_sem[s] = 0
        by_sem[s] += 1

    sems_found = sorted(list(by_sem.keys()))
    is_lat = "4" in usn[7:10] if len(usn) >= 10 else False
    expected_sems = [3,4,5,6] if is_lat else [1,2,3,4,5,6]
    
    missing_sems = [s for s in expected_sems if s not in sems_found]

    status = "OK 100% COMPLETE" if len(missing_sems) == 0 else f"MISSING Sem {missing_sems}"
    print(f"\nUSN: {usn:<12} | Semesters Tracked: {len(sems_found)}/6 | Sems Found: {sems_found} | Status: {status}")
    for s in expected_sems:
        cnt = by_sem.get(s, 0)
        print(f"  - Sem {s}: {cnt} subject marks")
