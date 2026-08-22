import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

print("Searching for student with SGPAs around 7.60, 7.40, 6.62, 6.21, 5.68, 7.00...")

# Search in academic_remarks
remarks = supabase.table("academic_remarks").select("student_usn, semester, sgpa, backlog_count").execute().data or []
by_usn = {}
for r in remarks:
    by_usn.setdefault(r["student_usn"], {})[r["semester"]] = float(r["sgpa"] or 0)

for usn, s_dict in by_usn.items():
    # Check if s_dict has values close to [7.60, 7.40, 6.62, 6.21, 5.68, 7.00]
    s1 = s_dict.get(1, 0)
    s2 = s_dict.get(2, 0)
    s3 = s_dict.get(3, 0)
    s4 = s_dict.get(4, 0)
    s5 = s_dict.get(5, 0)
    s6 = s_dict.get(6, 0)
    
    # print matching candidates
    if (7.5 <= s1 <= 7.7 or 7.3 <= s2 <= 7.5 or 6.5 <= s3 <= 6.7 or 6.1 <= s4 <= 6.3 or 5.5 <= s5 <= 5.8 or 6.9 <= s6 <= 7.1):
        print(f"Found candidate USN: {usn} -> S1:{s1}, S2:{s2}, S3:{s3}, S4:{s4}, S5:{s5}, S6:{s6}")

# Also search in results table
res_rows = supabase.table("results").select("usn, semester, sgpa").execute().data or []
by_usn_res = {}
for r in res_rows:
    by_usn_res.setdefault(r["usn"], {})[r["semester"]] = float(r["sgpa"] or 0)

for usn, s_dict in by_usn_res.items():
    s1 = s_dict.get(1, 0)
    s2 = s_dict.get(2, 0)
    s3 = s_dict.get(3, 0)
    s4 = s_dict.get(4, 0)
    s5 = s_dict.get(5, 0)
    s6 = s_dict.get(6, 0)
    if (7.5 <= s1 <= 7.7 and 7.3 <= s2 <= 7.5 and 6.5 <= s3 <= 6.7):
        print(f"MATCH IN RESULTS TABLE: {usn} -> S1:{s1}, S2:{s2}, S3:{s3}, S4:{s4}, S5:{s5}, S6:{s6}")
