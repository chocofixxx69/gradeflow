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
by_sem = {}
for m in marks:
    by_sem.setdefault(m["semester"], []).append(m)

# Target SGPAs from Image 2:
target_sgpas = {
    1: 7.60,
    2: 7.40,
    3: 6.62,
    4: 6.21,
    5: 5.68,
    6: 7.00
}

# Official curriculum credits:
official_cr = {
    # Sem 1
    "BMATS101": 4, "BPHYS102": 4, "BPOPS103": 3, "BENGK106": 1, "BICOK107": 1, "BSFHK158": 1, "BESCK104B": 3, "BETCK105I": 3,
    # Sem 2
    "BMATS201": 4, "BCHES202": 4, "BCEDK203": 3, "BPWSK206": 1, "BKBKK207": 1, "BIDTK258": 1, "BPLCK205B": 3, "BESCK204C": 3,
    # Sem 3
    "BCS301": 4, "BCS302": 4, "BCS303": 4, "BCS304": 3, "BCSL305": 1, "BSCK307": 1, "BPEK359": 0, "BCS306A": 3, "BCS358C": 1,
    # Sem 4
    "BUHK408": 1, "BCS405A": 3, "BCS401": 3, "BCS402": 4, "BCS403": 4, "BCS456C": 1, "BCSL404": 1, "BBOC407": 2, "BPEK459": 0,
    # Sem 5
    "BCS503": 4, "BCSL504": 1, "BRMK557": 3, "BCS515B": 3, "BCS501": 3, "BCS502": 4, "BCS586": 2, "BCS508": 2, "BPEK559": 0,
    # Sem 6
    "BCS602": 4, "BCS685": 2, "BCSL606": 1, "BPEK658": 0, "BIKS609": 1, "BEE654B": 3, "BCS613B": 3, "BAIL657C": 1, "BCS601": 4
}

# Try different GP formulas
def gp_scale_vtu_nep(tot, ext=None):
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

def gp_scale_vtu_2018(tot, ext=None):
    if ext is not None and 0 < ext < 18: return 0
    if tot < 40: return 0
    if tot >= 90: return 10
    if tot >= 80: return 9
    if tot >= 70: return 8
    if tot >= 60: return 7
    if tot >= 50: return 6
    if tot >= 45: return 5
    if tot >= 40: return 4
    return 0

print("Testing official credits with VTU NEP grading scale (non-credit PE/NSS = 0 or excluded):")
for s in sorted(by_sem.keys()):
    subs = by_sem[s]
    # Test with official credits
    tc = 0
    tcp = 0
    for m in subs:
        c = m["subject_code"].upper().strip()
        tot = float(m["total"] or 0)
        ext = float(m["external"] or 0)
        g = m.get("grade", "").upper()
        if g == "A" and ext == 0 and tot > 0:
            # check if absent or fail
            pass
        cr = official_cr.get(c, m.get("credits") or 3)
        if "BPEK" in c or "BNSK" in c:
            # Physical education is non-credit mandatory course (0 credit) in VTU 2022 scheme
            cr = 0
        if cr == 0:
            continue
        gp = gp_scale_vtu_nep(tot, ext)
        if g in ["A", "F"] and tot < 40:
            gp = 0
        if c == "BCS508" and g == "A":
            # Absent for BCS508
            gp = 0
        tc += cr
        tcp += (gp * cr)
    sgpa = round(tcp / tc, 2) if tc > 0 else 0
    target = target_sgpas.get(s, 0)
    diff = round(sgpa - target, 2)
    print(f"  Sem {s}: Calculated SGPA = {sgpa:5.2f} (Total Cr: {tc:2d}, CrP: {tcp:5.1f}) | Image 2 Target = {target:5.2f} | Diff = {diff:+.2f}")
