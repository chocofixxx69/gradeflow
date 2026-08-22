import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1. Fetch official credits map from subject_catalog
print("=== FETCHING OFFICIAL CATALOG CREDITS ===")
catalog_res = supabase.table("subject_catalog").select("scheme, branch, semester, subject_code, credits").execute().data or []
catalog_map = {}
for c in catalog_res:
    catalog_map[(c["scheme"], c["subject_code"].upper().strip())] = c["credits"]
    catalog_map[c["subject_code"].upper().strip()] = c["credits"]

print(f"Loaded {len(catalog_res)} catalog entries for credit resolution.")

# 2. Pick sample USNs from different branches/classes
sample_usns = [
    "2AB23CS043",  # Student with backlog
    "2AB23CD020",  # Clear student
    "2AB23CI024",  # Student with multiple backlogs
    "2AB23CS001",  # Clear student
    "2AB23CD023"   # Student with backlogs
]

def get_grade_point(grade, total_marks=None, ext_marks=None):
    g = (grade or "").strip().upper()
    if g in ["F", "A", "AB", "FAIL", "ABSENT", "NP", "NE", "X"]:
        return 0
    if ext_marks is not None and 0 < ext_marks < 18:
        return 0
    if total_marks is not None and 0 < total_marks < 40:
        return 0
    if total_marks is not None and total_marks > 0:
        score = round(total_marks)
        if score >= 90: return 10
        if score >= 80: return 9
        if score >= 70: return 8
        if score >= 60: return 7
        if score >= 55: return 6
        if score >= 50: return 5
        if score >= 40: return 4
        return 0
    letter_map = {"O": 10, "S": 10, "A+": 9, "A": 8, "B+": 7, "B": 6, "C": 5, "D": 6, "E": 5, "P": 4}
    return letter_map.get(g, 0)

print("\n=======================================================")
print("LIVE STUDENT RESULTS & CALCULATED SGPA / CGPA AUDIT")
print("=======================================================")

for usn in sample_usns:
    # Fetch student profile
    student = supabase.table("students").select("usn, name, branch, scheme").ilike("usn", usn).maybe_single().execute().data
    scheme = (student.get("scheme") if student else "2022") or "2022"
    
    # Fetch all marks for this student
    marks_res = supabase.table("subject_marks").select("semester, subject_code, subject_name, grade, total, external, credits, is_backlog").ilike("usn", usn).execute().data or []
    
    if not marks_res:
        print(f"\nUSN: {usn} - No marks found.")
        continue
        
    print(f"\n-------------------------------------------------------")
    print(f"USN: {usn} | Name: {student.get('name') if student else 'N/A'} | Branch: {student.get('branch') if student else 'N/A'} | Scheme: {scheme}")
    print(f"Total Subject Mark Records: {len(marks_res)}")
    
    # Group by semester
    sem_groups = {}
    for m in marks_res:
        s = m.get("semester") or 1
        sem_groups.setdefault(s, []).append(m)
        
    total_degree_cr = 0
    total_degree_crp = 0
    total_backlogs = 0
    
    for s in sorted(sem_groups.keys()):
        subs = sem_groups[s]
        sem_tc = 0
        sem_tcp = 0
        sem_backlogs = 0
        
        print(f"\n  [ Semester {s} ] ({len(subs)} subjects):")
        for sub in subs:
            code = (sub.get("subject_code") or "").upper().strip()
            name = (sub.get("subject_name") or "").strip()
            grade = (sub.get("grade") or "-").upper().strip()
            tot = float(sub.get("total") or 0)
            ext = float(sub.get("external") or 0)
            
            # Resolve official credit
            off_cr = catalog_map.get((scheme, code)) or catalog_map.get(code) or (sub.get("credits") or 0)
            gp = get_grade_point(grade, tot, ext)
            
            is_fail = (gp == 0 and grade not in ["PP", "AU", "W"]) or (0 < ext < 18) or (0 < tot < 40)
            if is_fail:
                sem_backlogs += 1
                status_str = "FAIL / BACKLOG"
            else:
                status_str = f"PASS (GP: {gp})"
                
            sem_tc += off_cr
            sem_tcp += (gp * off_cr)
            print(f"    - {code:10s} | {name[:28]:28s} | Grade: {grade:2s} | Marks: {tot:3.0f} | Cr: {off_cr} | {status_str}")
            
        sem_sgpa = round(sem_tcp / sem_tc, 2) if sem_tc > 0 else 0.0
        print(f"  -> SEM {s} SGPA: {sem_sgpa:.2f} | Total Credits: {sem_tc} | Status: {'CLEAR' if sem_backlogs == 0 else f'{sem_backlogs} BACKLOG(S)'}")
        
        total_degree_cr += sem_tc
        total_degree_crp += sem_tcp
        total_backlogs += sem_backlogs
        
    overall_cgpa = round(total_degree_crp / total_degree_cr, 2) if total_degree_cr > 0 else 0.0
    print(f"\n  =========================================")
    print(f"  OVERALL CGPA: {overall_cgpa:.2f} (Total Credits: {total_degree_cr})")
    print(f"  ACTIVE BACKLOG STATUS: {'ALL CLEAR' if total_backlogs == 0 else f'{total_backlogs} ACTIVE BACKLOG(S)'}")
    print(f"  =========================================")
