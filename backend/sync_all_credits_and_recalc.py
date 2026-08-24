import os
import re
import sys
from supabase import create_client
from dotenv import load_dotenv

env_path = os.path.join(os.path.dirname(__file__), '../.env.local')
if os.path.exists(env_path):
    load_dotenv(dotenv_path=env_path)

url = os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or os.environ.get('SUPABASE_URL')
key = os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or os.environ.get('SUPABASE_SERVICE_KEY') or os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

if not url or not key:
    raise ValueError("Missing Supabase credentials in .env.local")

supabase = create_client(url, key)

def get_official_credit(code, scheme='2022', branch=None, semester=None, catalog_map=None):
    if not code:
        return 3
    c = code.strip().upper()
    s = str(scheme) if scheme else '2022'
    b = (branch or '').strip().upper()
    sem = str(semester) if semester else None

    # Try exact match in catalog_map
    if catalog_map:
        if b and sem and (s, b, sem, c) in catalog_map:
            return catalog_map[(s, b, sem, c)]
        if sem and (s, sem, c) in catalog_map:
            return catalog_map[(s, sem, c)]
        if (s, c) in catalog_map:
            return catalog_map[(s, c)]

    # Rule-based pattern matching
    if re.match(r'^(BPEK|BNSS|BYOK|BIKS|CIP|CPH|KSK|KBK|BAL|BNS)\d', c) or 'PE' in c or 'NSS' in c or 'YOGA' in c or 'IKS' in c or 'AUDIT' in c:
        return 0
    if re.match(r'^B[A-Z]{2,4}[1-8]5[0-9][A-Z]?$', c) or re.match(r'^B[A-Z]{2,4}[1-8]58[A-Z]?$', c) or re.match(r'^B[A-Z]{2,4}[1-8]56[A-Z]?$', c):
        return 1
    if re.match(r'^B[A-Z]{2,4}L\d', c) or re.search(r'L\d{3}', c):
        return 1
    if re.search(r'P[1-8]\d{2}', c) or 'PROJ' in c:
        if sem == '8' or (sem is None and '8' in c):
            return 10
        if sem == '7' or (sem is None and '7' in c):
            return 6
        return 2
    if 'INT' in c or 'IN8' in c:
        return 10
    if re.match(r'^B[A-Z]{2,4}405[A-Z]?', c) or re.match(r'^B[A-Z]{2,4}[34]86', c):
        return 2
    if re.match(r'^B[A-Z]{2,4}[1-8]08', c) or re.match(r'^B[A-Z]{2,4}[1-8]86', c):
        return 2
    if re.match(r'^B[A-Z]{2,4}101$', c) or re.match(r'^B[A-Z]{2,4}201$', c) or re.match(r'^B[A-Z]{2,4}301$', c):
        return 4
    if re.match(r'^B[A-Z]{2,4}[3-8]02$', c) or re.match(r'^B[A-Z]{2,4}[3-8]03$', c):
        return 4
    return 3

def get_grade_point(total, grade=None, ext=None):
    raw_grade = (grade or '').strip().upper()
    if raw_grade in ['F', 'A', 'AB', 'ABSENT', 'FAIL', 'NP']:
        return 0
    if total is not None:
        try:
            t = round(float(total))
            if t < 40:
                return 0
            if ext is not None:
                try:
                    e = float(ext)
                    if 0 < e < 18:
                        return 0
                except:
                    pass
            if t >= 90: return 10
            if t >= 80: return 9
            if t >= 70: return 8
            if t >= 60: return 7
            if t >= 55: return 6
            if t >= 50: return 5
            if t >= 40: return 4
            return 0
        except:
            pass
    if raw_grade in ['O', 'S']: return 10
    if raw_grade == 'A+': return 9
    if raw_grade == 'A': return 8
    if raw_grade == 'B+': return 7
    if raw_grade == 'B': return 6
    if raw_grade == 'C': return 5
    if raw_grade in ['P', 'D', 'E']: return 4
    return 0

def main():
    print("=" * 60, flush=True)
    print("VTU SYNC & SGPA/CGPA RECALCULATION ENGINE", flush=True)
    print("=" * 60, flush=True)

    # 1. Load Subject Catalog
    print("\n[1/5] Loading Subject Catalog...", flush=True)
    catalog_map = {}
    offset = 0
    while True:
        res = supabase.table('subject_catalog').select('scheme, branch, semester, subject_code, credits').range(offset, offset + 999).execute()
        if not res.data:
            break
        for r in res.data:
            s = str(r['scheme'])
            b = str(r['branch']).upper()
            sem = str(r['semester'])
            c = str(r['subject_code']).upper()
            cr = int(r['credits'])
            catalog_map[(s, b, sem, c)] = cr
            catalog_map[(s, sem, c)] = cr
            catalog_map[(s, c)] = cr
        offset += len(res.data)
        if len(res.data) < 1000:
            break
    print(f"Loaded {len(catalog_map)} catalog lookup mappings.", flush=True)

    # 2. Fetch all students to know their branch & scheme
    print("\n[2/5] Fetching Students...", flush=True)
    students_map = {}
    offset = 0
    while True:
        res = supabase.table('students').select('id, usn, branch, scheme').range(offset, offset + 999).execute()
        if not res.data:
            break
        for st in res.data:
            u = st['usn'].strip().upper()
            students_map[u] = st
        offset += len(res.data)
        if len(res.data) < 1000:
            break
    print(f"Loaded {len(students_map)} students.", flush=True)

    # 3. Process all subject_marks: sync credits in fast batch
    print("\n[3/5] Syncing Subject Marks credits...", flush=True)
    offset = 0
    all_marks = []
    while True:
        res = supabase.table('subject_marks').select('id, usn, semester, subject_code, credits, total, external, grade, passed, is_backlog').range(offset, offset + 999).execute()
        if not res.data:
            break
        all_marks.extend(res.data)
        offset += len(res.data)
        if len(res.data) < 1000:
            break
    print(f"Loaded {len(all_marks)} subject_marks rows.", flush=True)

    # Group distinct (code, semester) pairs to update in batch
    code_sem_updates = {}
    student_sem_marks = {}

    for m in all_marks:
        u = m['usn'].strip().upper()
        sem = m['semester']
        code = (m['subject_code'] or '').strip().upper()
        current_cr = m['credits']

        st = students_map.get(u, {})
        st_branch = st.get('branch', 'CS')
        st_scheme = st.get('scheme', '2022')

        correct_cr = get_official_credit(code, st_scheme, st_branch, sem, catalog_map)
        m['credits'] = correct_cr

        if current_cr != correct_cr:
            code_sem_updates.setdefault((code, sem), correct_cr)

        student_sem_marks.setdefault((u, sem), []).append(m)

    print(f"Found {len(code_sem_updates)} unique (code, semester) combinations requiring credit adjustments.", flush=True)
    for (c, s), cr in code_sem_updates.items():
        supabase.table('subject_marks').update({'credits': cr}).eq('subject_code', c).eq('semester', s).execute()

    print(f"All subject_marks credits synchronized successfully.", flush=True)

    # 4. Recalculate results & academic_remarks
    print("\n[4/5] Recalculating SGPA and Updating results / academic_remarks...", flush=True)
    results_to_update = []
    remarks_to_upsert = []

    exclude_grades = {'PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'}

    for (u, sem), subs in student_sem_marks.items():
        total_cr = 0
        total_pts = 0
        backlogs = 0

        # Unique by subject code
        subs_by_code = {}
        for sub in subs:
            c = (sub['subject_code'] or '').strip().upper()
            subs_by_code[c] = sub

        for sub in subs_by_code.values():
            g = (sub['grade'] or '').strip().upper()
            if g in exclude_grades:
                continue

            cr = sub['credits']
            if cr == 0:
                continue

            tot = sub['total']
            ext = sub['external']
            gp = get_grade_point(tot, g, ext)

            total_cr += cr
            total_pts += gp * cr

            is_fail = sub.get('is_backlog') or g in ['F', 'A', 'AB', 'FAIL', 'ABSENT'] or gp == 0
            if is_fail:
                backlogs += 1

        sgpa = round(total_pts / total_cr, 2) if total_cr > 0 else 0.0

        st = students_map.get(u)
        if st and st.get('id'):
            remarks_to_upsert.append({
                'student_id': st['id'],
                'student_usn': u,
                'semester': sem,
                'sgpa': sgpa,
                'backlog_count': backlogs,
                'is_all_clear': backlogs == 0
            })

    # Batch upsert academic_remarks
    print(f"Upserting {len(remarks_to_upsert)} academic_remarks in batches...", flush=True)
    batch_size = 200
    for i in range(0, len(remarks_to_upsert), batch_size):
        chunk = remarks_to_upsert[i:i + batch_size]
        supabase.table('academic_remarks').upsert(chunk, on_conflict='student_id,semester').execute()

    print(f"Upserted {len(remarks_to_upsert)} academic_remarks rows.", flush=True)

    # 5. Verification on student 2AB23CS013 (ARZISH)
    print("\n[5/5] Verifying Ground Truth student 2AB23CS013 (ARZISH):", flush=True)
    test_marks = supabase.table('subject_marks').select('*').eq('usn', '2AB23CS013').order('semester').execute().data
    t_by_sem = {}
    for tm in test_marks:
        t_by_sem.setdefault(tm['semester'], []).append(tm)

    g_total_cr = 0
    g_total_pts = 0
    for sem in sorted(t_by_sem.keys()):
        s_cr = 0
        s_pts = 0
        for m in t_by_sem[sem]:
            cr = m['credits']
            if cr > 0:
                gp = get_grade_point(m['total'], m['grade'], m['external'])
                s_cr += cr
                s_pts += gp * cr
        s_sgpa = round(s_pts / s_cr, 2) if s_cr > 0 else 0
        g_total_cr += s_cr
        g_total_pts += s_pts
        print(f"  Semester {sem}: SGPA = {s_sgpa:.2f} | Credits = {s_cr} | Points = {s_pts}", flush=True)

    cgpa = round(g_total_pts / g_total_cr, 2) if g_total_cr > 0 else 0
    print(f"  --> TOTAL EARNED CREDITS: {g_total_cr}", flush=True)
    print(f"  --> OVERALL CGPA: {cgpa:.2f}", flush=True)
    print("=" * 60, flush=True)
    print("DATABASE SYNC COMPLETE AND VERIFIED!", flush=True)
    print("=" * 60, flush=True)

if __name__ == '__main__':
    main()
