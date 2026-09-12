import os
import sys
import re
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

def is_audit_course(code: str) -> bool:
    if not code: return False
    c = str(code).strip().upper()
    return (
        c.startswith('BPEK') or c.startswith('BNSK') or c.startswith('BYOK') or
        c.startswith('BIKS') or c.startswith('1BPEK') or c.startswith('1BNSK') or
        c.startswith('1BYOK') or c in ('22IDT159', '22PRJL29', '22CIR38', '22CIR48', '22GC36')
    )

def is_cie_only_course(code: str) -> bool:
    if not code: return False
    c = str(code).strip().upper()
    if is_audit_course(c): return True
    if c.endswith('586') or c.endswith('685'): return True
    if c == 'BSCK307' or c.startswith('1BICO') or c.startswith('1BSKS'): return True
    return False

print("Auditing & fixing backlog flags across all subject_marks rows in Supabase...")
marks = fetch_all("subject_marks", "*")
print(f"Total subject_marks rows in DB: {len(marks)}")

fixed_count = 0

for m in marks:
    m_id = m.get("id")
    code = (m.get("subject_code") or "").strip().upper()
    g = (m.get("grade") or "").strip().upper()
    tot = int(m.get("total") or 0)
    ext = int(m.get("external") or 0)
    res = (m.get("result") or "").strip().upper()
    is_backlog = m.get("is_backlog")

    # VTU Fail Condition:
    # 1. Grade is F/A/FAIL/ABSENT
    # 2. External < 18 (unless CIE-only course)
    # 3. Total < 40 (when total > 0)
    # 4. Result contains whole-word F or FAIL
    is_cie_only = is_cie_only_course(code)
    is_res_fail = bool(re.search(r'\b(F|FAIL|FAILED)\b', res)) if res else False
    is_ext_fail = (not is_cie_only and ext < 18)
    is_true_pass = (tot >= 40 and (is_cie_only or ext >= 18) and not is_res_fail)

    should_be_backlog = not is_true_pass and (
        g in ("F", "A", "FAIL", "ABSENT", "X", "NE", "NP", "DX") or
        is_ext_fail or
        (tot > 0 and tot < 40) or
        is_res_fail
    )

    expected_grade = "F" if (should_be_backlog and g not in ("A", "ABSENT")) else g

    if should_be_backlog and (is_backlog != True or g != expected_grade):
        fixed_count += 1
        usn = m.get("usn")
        code = m.get("subject_code")
        sem = m.get("semester")
        print(f"Fixing DB Row {m_id} | USN: {usn} | Sem: {sem} | Code: {code} | Int: {m.get('internal')} | Ext: {ext} | Tot: {tot} | Grade: '{g}' -> '{expected_grade}' | is_backlog: {is_backlog} -> True")
        
        supabase.table("subject_marks").update({
            "is_backlog": True,
            "grade": expected_grade,
            "passed": False
        }).eq("id", m_id).execute()

print("="*70)
print(f"Audit Complete! Total subject_marks rows updated to is_backlog = True: {fixed_count}")
print("="*70)
