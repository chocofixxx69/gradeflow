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

print("=== DEEP SEMESTER MARKS MATRIX AUDIT FOR ALL CS CLASS STUDENTS ===")

# Fetch class students
class_students = fetch_all("class_students", "usn, class_id")
cs_usns = sorted(list(set((c.get("usn") or "").strip().upper() for c in class_students if (c.get("usn") or "").upper().startswith("2AB23CS") or (c.get("usn") or "").upper().startswith("2AB24CS"))))

if not cs_usns:
    # Fallback to all 2AB23CS students in database
    students = fetch_all("students", "usn")
    cs_usns = sorted(list(set((s.get("usn") or "").strip().upper() for s in students if (s.get("usn") or "").upper().startswith("2AB23CS") or (s.get("usn") or "").upper().startswith("2AB24CS"))))

print(f"Total CS Class USNs to audit: {len(cs_usns)}")

# Fetch all subject_marks for these USNs
marks = fetch_all("subject_marks", "usn, semester, subject_code")

# Group subject_marks by USN and Semester
marks_map = {u: {} for u in cs_usns}
for m in marks:
    u = (m.get("usn") or "").strip().upper()
    s = m.get("semester")
    if u in marks_map and s:
        try:
            sem_num = int(s)
            marks_map[u][sem_num] = marks_map[u].get(sem_num, 0) + 1
        except:
            pass

incomplete_cs_usns = []

print("\n" + "="*80)
print(f"{'USN':<14} | {'Sem 1':<7} | {'Sem 2':<7} | {'Sem 3':<7} | {'Sem 4':<7} | {'Sem 5':<7} | {'Sem 6':<7} | {'STATUS'}")
print("="*80)

for u in cs_usns:
    is_lat = "4" in u[7:10] if len(u) >= 10 else False
    expected = set(range(3, 7)) if is_lat else set(range(1, 7))
    
    sem_counts = marks_map.get(u, {})
    
    s1 = sem_counts.get(1, 0)
    s2 = sem_counts.get(2, 0)
    s3 = sem_counts.get(3, 0)
    s4 = sem_counts.get(4, 0)
    s5 = sem_counts.get(5, 0)
    s6 = sem_counts.get(6, 0)

    # Check completeness
    missing_sems = []
    for s in expected:
        if sem_counts.get(s, 0) < 4:
            missing_sems.append(s)

    if missing_sems:
        status = f"MISSING Sem {missing_sems}"
        incomplete_cs_usns.append(u)
    else:
        status = "OK COMPLETE"

    s1_str = "LAT" if is_lat and s1 == 0 else (f"{s1} subs" if s1 >= 4 else f"MISSING({s1})")
    s2_str = "LAT" if is_lat and s2 == 0 else (f"{s2} subs" if s2 >= 4 else f"MISSING({s2})")
    s3_str = f"{s3} subs" if s3 >= 4 else f"MISSING({s3})"
    s4_str = f"{s4} subs" if s4 >= 4 else f"MISSING({s4})"
    s5_str = f"{s5} subs" if s5 >= 4 else f"MISSING({s5})"
    s6_str = f"{s6} subs" if s6 >= 4 else f"MISSING({s6})"

    print(f"{u:<14} | {s1_str:<7} | {s2_str:<7} | {s3_str:<7} | {s4_str:<7} | {s5_str:<7} | {s6_str:<7} | {status}")

print("="*80)
print(f"Total CS Class Students: {len(cs_usns)}")
print(f"Complete: {len(cs_usns) - len(incomplete_cs_usns)}")
print(f"Incomplete (Missing 1+ Semesters): {len(incomplete_cs_usns)}")
if incomplete_cs_usns:
    print(f"Incomplete CS USNs: {', '.join(incomplete_cs_usns)}")
print("="*80)
