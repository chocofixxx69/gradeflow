import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

tables_to_check = [
    "students", "results", "subject_marks", "marks", "academic_remarks",
    "subject_catalog", "subjects", "branches", "classes", "class_students",
    "vtu_result_urls", "vtu_urls_2022_scheme", "vtu_urls_2025_scheme"
]

print("=== PRODUCTION DATABASE AUDIT ===")
for tbl in tables_to_check:
    try:
        res = supabase.table(tbl).select("*", count="exact").limit(5).execute()
        count = res.count if res.count is not None else len(res.data or [])
        sample = res.data or []
        print(f"\n[TABLE] {tbl}: {count} rows")
        if sample:
            cols = list(sample[0].keys())
            print(f"  Columns: {', '.join(cols)}")
            print(f"  Sample row 1: {sample[0]}")
        else:
            print("  (Empty table)")
    except Exception as e:
        print(f"\n[TABLE] {tbl}: Error accessing table -> {e}")
