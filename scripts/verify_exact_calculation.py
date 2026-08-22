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
marks = supabase.table("subject_marks").select("*").ilike("usn", usn).execute().data or []

with open("lib/vtu-curriculum-catalog.js", "r", encoding="utf-8") as f:
    js_content = f.read()

# Extract credits lookup
import re
match = re.search(r"export const OFFICIAL_CREDITS_LOOKUP = ({.*?});", js_content, re.DOTALL)
credits_lookup = json.loads(match.group(1)) if match else {}

def get_official_credit(code, scheme="2022"):
    c = code.upper().strip()
    if c.startswith("BPEK") or c.startswith("BNSK") or c.startswith("BYOK"):
        return 0
    return credits_lookup.get(f"{scheme}_{c}", credits_lookup.get(c, 0))

def get_gp(tot, ext=None):
    if ext is not None and 0 < ext < 18: return 0
    if tot < 40: return 0
    if tot >= 90: return 10
    if tot >= 80: return 9
    if tot >= 70: return 8
    if tot >= 60: return 7
    if tot >= 55: return 6
    if tot >= 50: return 5
    if tot >= 40: return 4
    return 0

by_sem = {}
for m in marks:
    by_sem.setdefault(m["semester"], []).append(m)

print(f"=== RE-CALCULATING SGPA FOR {usn} WITH OFFICIAL CURRICULUM ===")
total_cr = 0
total_crp = 0

for s in sorted(by_sem.keys()):
    tc = 0
    tcp = 0
    failed_count = 0
    for m in by_sem[s]:
        code = m["subject_code"].upper().strip()
        tot = float(m["total"] or 0)
        ext = float(m["external"] or 0)
        cr = get_official_credit(code, "2022")
        gp = get_gp(tot, ext)
        g = m.get("grade", "").upper()
        if g in ["A", "F"] and tot < 40:
            gp = 0
        if code == "BCS508" and g == "A":
            gp = 0
        if gp == 0 and cr > 0:
            failed_count += 1
            
        if cr > 0:
            tc += cr
            tcp += (gp * cr)
            
    sgpa = round(tcp / tc, 2) if tc > 0 else 0
    total_cr += tc
    total_crp += tcp
    print(f"  Semester {s}: SGPA = {sgpa:.2f} | Total Credits = {tc} | Failed Subjects = {failed_count}")

cgpa = round(total_crp / total_cr, 2) if total_cr > 0 else 0
print(f"\nFinal Calculated CGPA: {cgpa:.2f}")
