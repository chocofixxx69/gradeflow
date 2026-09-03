"""
VTU Scraper Engine v6.0 — The Ultimate, Working Version.

CRITICAL FIXES:
1.  Playwright-based for Captcha-Sync.
2.  Dialog Handling: Registered ONCE. Accepts all alerts.
3.  SSL: Ignores cert errors.
4.  Backlog Clearing: Uses on_conflict upsert on (usn, subject_code, semester).
5.  Academic Remarks: Recalculates SGPA and backlogs.
6.  Navigation Stability: Handles race conditions with wait_for_load_state correctly.
"""

import os
import sys
import time
import json
import re
import ssl

# Import Syllabus Engine from Parent
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try:
    from scrape_syllabus import CATALOG_2022, CATALOG_2025 # type: ignore
    # Kept only as a rough initial-parse guess (see _parse_row) — the
    # authoritative credit, resolved from the live subject_catalog table with
    # scheme/branch/semester awareness, is applied in _save_db before anything
    # is persisted. See backend/scraper/credit_resolver.py.
    CREDIT_MAP = {r[0]: r[2] for r in CATALOG_2022 + CATALOG_2025}
except ImportError:
    CREDIT_MAP = {}

from .credit_resolver import fetch_catalog_index, resolve_credits

# Global workaround for SSL issues
ssl._create_default_https_context = ssl._create_unverified_context

from playwright.sync_api import sync_playwright # type: ignore
from .captcha_solver import solve_captcha
from .config import supabase, get_vtu_urls # type: ignore

# ── Configuration ──
GRADE_POINTS = {
    "P": 4, "F": 0, "A": 0, "W": 0, "X": 0, "NE": 0
}
VALID_GRADES = {"P", "F", "A", "W", "X", "NE"}

def _is_subject_code(code: str) -> bool:
    code = code.strip().upper()
    if len(code) < 3 or len(code) > 10: return False
    return any(c.isalpha() for c in code) and any(c.isdigit() for c in code)

def _extract_sem(code: str) -> int:
    m = re.search(r'[A-Z]+(\d)\d', code.upper())
    if m: return int(m.group(1))
    m = re.search(r'\d{2}[A-Z]+(\d)\d', code.upper())
    if m: return int(m.group(1))
    return 0

def _parse_row(texts):
    if not texts: return None
    
    if texts[0].strip().isdigit() and len(texts) > 1:
        texts = texts[1:]
        
    if len(texts) < 4: return None
    
    code = texts[0].strip().upper()
    if not _is_subject_code(code): return None
    
    name = texts[1].strip()
    
    rem = texts[2:]
    announced_date = ""
    if rem:
        last_val = rem[-1].strip()
        if re.match(r'^\d{4}-\d{2}-\d{2}$', last_val) or re.match(r'^\d{2}/\d{2}/\d{4}$', last_val):
            announced_date = last_val
            rem = rem[:-1]
            
    grade = "F"
    if rem and rem[-1].strip().upper() in VALID_GRADES:
        grade = rem[-1].strip().upper()
    elif len(rem) > 1 and rem[-2].strip().upper() in VALID_GRADES:
        grade = rem[-2].strip().upper()
    
    nums = []
    for v in rem:
        m = re.search(r'^(\d+(?:\.\d+)?)$', v.strip())
        if m: nums.append(float(m.group(1)))
        
    # Use accurate VTU Catalog Engine mapping first
    cred = CREDIT_MAP.get(code, 3)
    int_m = ext_m = tot_m = 0
    
    if len(nums) >= 4:
        if 1.0 <= nums[0] <= 6.0: # type: ignore
            # Only trust VTU printed credit if it wasn't mapped
            if code not in CREDIT_MAP: cred = int(nums[0])
            int_m = int(nums[1]) if len(nums) > 1 else 0
        else:
            int_m = int(nums[0])
            
        tot_m = int(nums[-1])
        ext_m = int(nums[-2]) if len(nums) > 1 else int(nums[-1])
        
    elif len(nums) == 3:
        if 1.0 <= nums[0] <= 6.0 and abs(nums[2] - nums[1]) <= 5: # type: ignore
            if code not in CREDIT_MAP: cred = int(nums[0])
            int_m = int(nums[1])
            tot_m = int(nums[2])
            ext_m = 0
        else:
            int_m = int(nums[0])
            ext_m = int(nums[1])
            tot_m = int(nums[2])
    elif len(nums) == 2:
        if 1.0 <= nums[0] <= 6.0: # type: ignore
            if code not in CREDIT_MAP: cred = int(nums[0])
            tot_m = int(nums[1])
            int_m = tot_m
        else:
            int_m = int(nums[0])
            tot_m = int(nums[1])
            ext_m = 0
    elif len(nums) == 1:
        tot_m = int(nums[0])
        int_m = tot_m

    if tot_m == 0 or abs(tot_m - (int_m + ext_m)) > 5:
        if int_m > 0 or ext_m > 0:
            tot_m = int_m + ext_m

    parsed_grade = grade.strip().upper()
    PASS_GRADES  = {"O", "S", "A+", "B+", "B", "C", "D", "P", "PASS"}
    ABSENT_MARKS = {"AB", "ABSENT"}
    
    non_nums = [v.strip().upper() for v in rem if not re.match(r'^\d+(?:\.\d+)?$', v.strip())]
    result_str = " ".join(non_nums) if non_nums else grade
    raw_res = (result_str or '').strip().upper()
    is_res_fail = "F" in raw_res or "FAIL" in raw_res
    is_ext_fail = (ext_m > 0 and ext_m < 18)
    is_tot_fail = (tot_m > 0 and tot_m < 40)

    if parsed_grade in ("W", "X", "NE"):
        final_grade = parsed_grade
    elif parsed_grade in ABSENT_MARKS:
        final_grade = "A"
    elif parsed_grade == "F" or parsed_grade == "FAIL" or is_res_fail or is_ext_fail or is_tot_fail:
        final_grade = "F"
    elif parsed_grade in PASS_GRADES and not (is_ext_fail or is_tot_fail or is_res_fail):
        final_grade = "P"
    elif parsed_grade == "A":
        if ext_m == 0 and tot_m < 40:
            final_grade = "A"
        elif tot_m >= 40 and ext_m >= 18:
            final_grade = "P"
        elif ext_m == 0:
            final_grade = "A"
        else:
            final_grade = "F"
    elif tot_m >= 40 and (ext_m >= 18 or ext_m == 0) and not is_res_fail:
        final_grade = "P"
    else:
        final_grade = "F"
        
    is_fail = final_grade in ("F", "A", "X", "NE")

    return {
        "subject_code": code,
        "subject_name": name,
        "internal": int(int_m),
        "external": int(ext_m),
        "total": int(tot_m),
        "grade": final_grade,
        "passed": not is_fail,
        "is_backlog": is_fail,
        "credits": int(cred),
        "announced_date": announced_date
    }

def _check_url(page, url: str, usn: str, dialog_log: list, max_retries: int = 50) -> dict | None:
    url_short = url.split("/")[-1] if url.endswith(".php") else (url.split("/")[-2] if "/" in url else url)
    print(f"    [>] Checking {url_short}...", file=sys.stderr, flush=True)
    
    try:
        page.goto(url, wait_until="load", timeout=25000)
    except Exception as e:
        print(f"    [!] Failed to load {url_short}: Time out or error.", file=sys.stderr, flush=True)
        return None

    for attempt in range(max_retries):
        dialog_log.clear()
        
        # 1. Find Captcha
        captcha_img = page.locator("img[alt='CAPTCHA code'], img[src*='captcha']").first
        try:
            if not captcha_img.is_visible(timeout=5000):
                print(f"    [-] {url_short}: Portal inactive.", file=sys.stderr)
                return None
            
            captcha_bytes = captcha_img.screenshot()
        except:
            print(f"    [!] {url_short}: Screen capture failed.", file=sys.stderr)
            return None

        captcha_text = solve_captcha(captcha_bytes)
        if not captcha_text:
            print(f"    [!] Attempt {attempt+1}: Solver error.", file=sys.stderr)
            page.reload(wait_until="load")
            continue

        # 2. Submit Form
        try:
            # More robust USN input detection
            usn_input = page.locator("input[name='lns'], input[name='usn'], input[id='usn']").first
            captcha_input = page.locator("input[name='captchacode'], input[id='captchacode']").first
            submit_btn = page.locator("input[type='submit'], input[id='submit'], button[type='submit']").first
            
            # Ensure elements are present before filling
            if not usn_input.is_visible(timeout=2000):
                 # Fallback: find any text input that isn't the captcha
                 usn_input = page.locator("input[type='text']:not([name*='captcha'])").first

            usn_input.fill(usn.upper())
            captcha_input.fill(captcha_text)
            submit_btn.click()
            
            # Wait for either result page or alert
            time.sleep(1.5)
            page.wait_for_load_state("load", timeout=10000)
        except Exception as e:
            # print(f"    [debug] Submit err: {e}")
            pass
            
        # 3. Process result or Alert
        try:
            html = page.content()
            html_lower = html.lower()
        except:
            time.sleep(1)
            try: 
                html = page.content()
                html_lower = html.lower()
            except: continue

        # ── CRITICAL ALERT HANDLING ──
        alert_msg = " ".join(dialog_log).lower()
        if alert_msg.strip(): print(f"    [Alert Check] {alert_msg}", file=sys.stderr)
        dialog_log.clear() # Reset for next attempt

        # A. USN Not Found / Invalid (Immediate Skip)
        if "university seat number is not available or invalid" in alert_msg or \
           "university seat number is not available or invalid" in html_lower:
            print(f"    [-] {url_short}: Result not available or invalid USN for {usn}. Skipping.", file=sys.stderr)
            return None

        # A2. Reval Not Applied / Awaited (Immediate Skip)
        if "not applied for reval" in alert_msg or "reval results are awaited" in alert_msg or \
           "not applied for reval" in html_lower or "reval results are awaited" in html_lower:
            print(f"    [-] {url_short}: Not applied for reval or awaited. Skipping.", file=sys.stderr)
            return None

        # B. Invalid Captcha?
        if ("invalid" in alert_msg and "captcha" in alert_msg) or \
           ("captcha" in html_lower and "invalid" in html_lower and "student name" not in html_lower):
            print(f"    [!] Attempt {attempt+1}: Invalid captcha. Retrying...", file=sys.stderr)
            try: page.reload(wait_until="load")
            except: pass
            continue
            
        # C. Not Available? 
        # Broad detection for any result-like table structure
        has_table = ("semester" in html_lower or "usn" in html_lower) and \
                    ("subject" in html_lower or "result" in html_lower or "total" in html_lower)
        
        if ("not available" in alert_msg or "not available" in html_lower or "not announced" in alert_msg):
            if has_table:
                # Even with alert, if we see subject-like keywords, keep going
                pass
            else:
                print(f"    [-] {url_short}: Result not available for {usn}.", file=sys.stderr)
                return None
                
        # C. Portal Inactive? 
        if "maintenance" in html_lower and not has_table:
             print(f"    [-] {url_short}: Portal inactive/maintenance.", file=sys.stderr)
             return None

        # 4. Success Check
        # If we see "Semester :" or a substantial number of TD elements, AND we are no longer on the form
        is_still_on_form = False
        try:
            is_still_on_form = captcha_img.is_visible(timeout=100)
        except:
            pass

        if not is_still_on_form and (has_table or page.locator("td").count() > 15):
            print(f"    [+] {url_short}: Result found! Parsing...", file=sys.stderr)
            
            # Find the student name
            name = "Unknown"
            try:
                # Common VTU name patterns
                content_text = page.evaluate("() => document.body.innerText")
                name_match = re.search(r"Student Name\s*:\s*(.*)", content_text, re.IGNORECASE)
                if name_match:
                    name = name_match.group(1).split("\n")[0].strip()
                else:
                    # Fallback locator
                    name = page.locator("td:has-text(':')").nth(1).inner_text().split(":")[-1].strip()
            except: pass
            
            # Semester
            sem = 0
            m = re.search(r'Semester\s*:?\s*(\d+)', page.content(), re.IGNORECASE)
            if m: sem = int(m.group(1))

            # Subjects
            subjects = []
            rows = page.locator("div.divTableRow")
            if rows.count() > 1:
                for i in range(rows.count()):
                    cells = rows.nth(i).evaluate("el => Array.from(el.querySelectorAll('.divTableCell')).map(c => c.textContent.trim())")
                    d = _parse_row(cells)
                    if d: subjects.append(d)
            
            if not subjects:
                trs = page.locator("table tr")
                for i in range(trs.count()):
                    cells = trs.nth(i).locator("td").evaluate_all("els => els.map(c => c.textContent.trim())")
                    d = _parse_row(cells)
                    if d: subjects.append(d)
                    
            if subjects:
                # Deduplicate subjects, keeping the one with the highest total marks
                unique_subs = {}
                for s in subjects:
                    c = s["subject_code"]
                    if c not in unique_subs:
                        unique_subs[c] = s
                    else:
                        old_s = unique_subs[c]
                        new_rank = GRADE_POINTS.get(s["grade"], 0)
                        old_rank = GRADE_POINTS.get(old_s["grade"], 0)
                        # Keep new if it has better grade, or same grade with higher total marks
                        if new_rank > old_rank or (new_rank == old_rank and s["total"] > old_s["total"]):
                            unique_subs[c] = s
                
                subjects = list(unique_subs.values())

                if sem <= 0:
                    sems = [ _extract_sem(s["subject_code"]) for s in subjects if _extract_sem(s["subject_code"]) > 0 ]
                    sem = max(sems) if sems else 1

                # Structured Table Display (Cleaned for Terminal)
                header = f"║ {'Code':<12} ║ {'Subject Name':<50} ║ {'INT':<3} ║ {'EXT':<3} ║ {'TOT':<3} ║ {'RESULT':<6} ║"
                sep = "╠" + "═"*14 + "╬" + "═"*52 + "╬" + "═"*5 + "╬" + "═"*5 + "╬" + "═"*5 + "╬" + "═"*8 + "╣"
                top = "╔" + "═"*14 + "╦" + "═"*52 + "╦" + "═"*5 + "╦" + "═"*5 + "╦" + "═"*5 + "╦" + "═"*8 + "╗"
                bot = "╚" + "═"*14 + "╩" + "═"*52 + "╩" + "═"*5 + "╩" + "═"*5 + "╩" + "═"*5 + "╩" + "═"*8 + "╝"
                
                print(f"\n      => [MARKS] {name} | Semester {sem}", file=sys.stderr)
                print(f"      {top}", file=sys.stderr)
                print(f"      {header}", file=sys.stderr)
                print(f"      {sep}", file=sys.stderr)
                
                backlogs_found = []
                for _s in subjects:
                    code = _s.get('subject_code', '-')[:12]
                    s_name_full = _s.get('subject_name', '-')
                    sname = (s_name_full[:47] + '...') if len(s_name_full) > 50 else s_name_full
                    i = str(_s.get('internal', 0))
                    e = str(_s.get('external', 0))
                    t = str(_s.get('total', 0))
                    g = _s.get('grade', 'F').strip()
                    
                    if _s.get('is_backlog'):
                        backlogs_found.append(f"{code} ({g})")

                    # Colorize Failures in terminal if possible (using indicators)
                    fail_mark = "!!" if _s.get('is_backlog') else "  "
                    print(f"      ║ {code:<12} ║ {sname:<50} ║ {i:<3} ║ {e:<3} ║ {t:<3} ║ {g:<6}{fail_mark}║", file=sys.stderr)
                
                print(f"      {bot}", file=sys.stderr)
                if backlogs_found:
                    print(f"      ⚠️  BACKLOGS ALERT: {', '.join(backlogs_found)}", file=sys.stderr)

                return {"url_short": url_short, "name": name, "semester": sem, "subjects": subjects}

        # Check if still on form
        try:
            if captcha_img.is_visible(timeout=500):
                print(f"    [!] Attempt {attempt+1}: Still on form. Retrying...", file=sys.stderr)
                try: page.reload(wait_until="load")
                except: pass
                continue
        except: pass

    return None

def deduce_scheme_from_usn(usn: str) -> str:
    """Deduces VTU curriculum scheme from USN or database.
    22, 23, 24 admission years -> '2022' Scheme (NEP).
    25+ admission years -> '2025' Scheme.
    """
    clean = usn.strip().upper()
    try:
        res = supabase.table("students").select("scheme").eq("usn", clean).limit(1).execute()
        if res.data and res.data[0].get("scheme"):
            return str(res.data[0]["scheme"])
    except Exception:
        pass

    m = re.search(r'^[0-9][A-Z]{2}(\d{2})[A-Z]{2,3}\d{3}$', clean)
    if m:
        try:
            yr = int(m.group(1))
            return "2025" if yr >= 25 else "2022"
        except ValueError:
            pass
    return "2022"

def scrape_all_semesters(usn: str, faculty_id=None, scheme=None):
    usn = usn.strip().upper()
    target_scheme = str(scheme).strip() if scheme else deduce_scheme_from_usn(usn)
    urls = get_vtu_urls(faculty_id, scheme=target_scheme)
    if not urls:
        print(f"\n[ENGINE] 0 active URLs for {target_scheme} Scheme. Skipping {usn}.", file=sys.stderr)
        return False

    print(f"\n[ENGINE] Scraping {usn} under {target_scheme} Scheme ({len(urls)} portals)...", file=sys.stderr, flush=True)
    
    found_count = 0
    with sync_playwright() as p:
        print(f"[ENGINE] Launching Playwright browser instance...", file=sys.stderr, flush=True)
        browser = p.chromium.launch(
            headless=True,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--ignore-certificate-errors",
                "--allow-running-insecure-content",
                "--disable-dev-shm-usage",
                "--no-sandbox",
                "--disable-gpu"
            ]
        )
        context = browser.new_context(user_agent="Mozilla/5.0")
        page = context.new_page()
        
        dialog_log = []
        def on_dialog(d):
            dialog_log.append(d.message)
            try:
                d.accept()
            except:
                pass
        page.on("dialog", on_dialog)
        
        for u in urls:
            res = _check_url(page, u, usn, dialog_log)
            if res:
                found_count += 1
                groups = {}
                for s in res["subjects"]:
                    s_sem = _extract_sem(s["subject_code"]) or res["semester"] or 1
                    groups.setdefault(s_sem, []).append(s) # type: ignore
                
                for sem, subs in groups.items():
                    _save_db(usn, res["name"] or usn, sem, u, subs)
        
        browser.close()
        
    if found_count > 0:
        _recalculate_remarks(usn)
        print(f"[SUCCESS] {usn}: Success")
    else:
        print(f"[WARNING] {usn}: No results")
    return found_count > 0

def _get_true_grade_point(grade, tot_m, ext_m=None):
    """Calculate grade points. Trusts the grade already set by _parse_row."""
    g = grade.strip().upper() if grade else "F"
    # Failed / Absent / Withheld = 0 points always
    if g in ("F", "A", "AB", "ABSENT", "X", "NE"):
        return 0
    # Grade is P (Pass) — calculate points from total marks
    if tot_m >= 90: return 10
    if tot_m >= 80: return 9
    if tot_m >= 70: return 8
    if tot_m >= 60: return 7
    if tot_m >= 55: return 6
    if tot_m >= 50: return 5
    if tot_m >= 40: return 4
    return 0

def _parse_branch(usn):
    if not usn or len(usn) < 7: return None
    code = usn[5:7].upper()
    mapping = {
        "CS": "Computer Science (CSE)", "IS": "Information Science (ISE)",
        "EC": "Electronics & Comm (ECE)", "EE": "Electrical & Electronics (EEE)",
        "ME": "Mechanical Engineering", "CV": "Civil Engineering",
        "AI": "AI & Machine Learning (AIML)", "DS": "Data Science",
        "CB": "Comp. Science & Business", "AD": "AI & Data Science",
        "CI": "AI & Machine Learning (AIML)", "CD": "Data Science",
        "RI": "Robotics & AI"
    }
    return mapping.get(code, code)

# Short branch code (matching subject_catalog.branch: CS/AI/CV/DS/EC/EE/ME/RI)
# for credit resolution — mirrors lib/vtuAcademicEngine.js's normalizeBranch.
_BRANCH_CODE_MAP = {
    "CS": "CS", "CI": "AI", "AI": "AI", "DS": "DS", "CD": "DS",
    "EC": "EC", "EE": "EE", "ME": "ME", "CV": "CV", "RI": "RI",
}

def _parse_branch_code(usn):
    if not usn or len(usn) < 7: return "CS"
    return _BRANCH_CODE_MAP.get(usn[5:7].upper(), "CS")

_catalog_index_cache = None

def _get_catalog_index():
    """Fetches subject_catalog once per process and caches it — every
    _save_db/_recalculate_remarks call in this scrape run reuses it."""
    global _catalog_index_cache
    if _catalog_index_cache is None:
        _catalog_index_cache = fetch_catalog_index(supabase)
    return _catalog_index_cache

def _get_student_scheme(usn):
    """Looks up the student's known scheme; deduces from USN if unknown."""
    return deduce_scheme_from_usn(usn)

def _attempt_rank(passed, grade):
    """Ranks a subject attempt for best-of comparison: PASS > FAIL > ABSENT.
    Mirrors getAttemptRank() in lib/vtuAcademicEngine.js so a revaluation or
    re-scrape can only replace an existing row with an equal-or-better one."""
    if passed:
        return 2
    g = (grade or "").strip().upper()
    if g == "A":  # ABSENT marker (see _parse_row)
        return 0
    return 1  # F / X / NE

def _save_db(usn, name, sem, url, subs):
    try:
        scheme = _get_student_scheme(usn)
        branch = _parse_branch(usn)
        # Persist student master info including scheme
        updates = {"usn": usn, "name": name, "semester": sem, "scheme": scheme}
        if branch: updates["branch"] = branch
        try:
            supabase.table("students").upsert(updates, on_conflict="usn").execute()
        except Exception:
            pass
        
        # Canonical credit resolution: subject_catalog is the ONLY credit
        # authority (see backend/scraper/credit_resolver.py — same algorithm
        # as lib/subjectCreditResolver.js: exact code match, then VTU's
        # elective-family variant conventions). Never trusts whatever digit
        # was parsed off the raw HTML, never defaults to 3 — unresolved
        # subjects are written with credits=None and excluded from SGPA.
        scheme = _get_student_scheme(usn)
        branch_code = _parse_branch_code(usn)
        catalog_index = _get_catalog_index()

        for s in subs:
            code = s.get("subject_code")
            resolved_cr, _source = resolve_credits(catalog_index, scheme, branch_code, sem, code)
            s["credits"] = resolved_cr

        # Calc SGPA with Credits and True Points!
        tc = 0
        tcp = 0
        exclude_grades = {"PP", "NP", "W", "DX", "AU"}

        for s in subs:
            g = s.get("grade", "F").strip().upper()
            if g in exclude_grades: continue

            pts = _get_true_grade_point(g, s.get("total", 0), ext_m=s.get("external", None))
            cr = s.get("credits")
            if cr is None: continue  # Unresolved — excluded from SGPA, not guessed.

            tc += cr
            tcp += (pts * cr)

        sgpa = round(tcp / tc, 2) if tc > 0 else 0.0 # type: ignore

        exam_alias = url.split('/')[-2] if ('/' in url) else "Scraped Record"

        # Smart Sync: Fetch existing marks for this USN, scoped to THIS semester only
        # (a bare usn-only lookup can false-match a same-numbered subject code in
        # another semester and wrongly block/allow an update there).
        existing_res = supabase.table("subject_marks").select("subject_code, total, passed, grade").eq("usn", usn).eq("semester", sem).execute()
        existing_by_code = {r["subject_code"]: r for r in existing_res.data} if existing_res.data else {}

        res = supabase.table("results").upsert({"usn": usn, "semester": sem, "exam_url": url, "exam_name": exam_alias, "sgpa": sgpa, "total_credits": sum((s.get("credits") or 0) for s in subs)}, on_conflict="usn,exam_url").execute()
        if res.data:
            r_id = res.data[0]["id"]

            # Filters subs: never let a re-scrape (e.g. a revaluation result) overwrite
            # a strictly better existing attempt. VTU policy: the higher of the original
            # and revaluation marks always stands, even if revaluation comes back lower.
            filtered_subs = []
            for s in subs:
                code = s["subject_code"]
                prev = existing_by_code.get(code)
                if prev:
                    prev_rank = _attempt_rank(prev.get("passed"), prev.get("grade"))
                    new_rank = _attempt_rank(s["passed"], s["grade"])
                    if new_rank < prev_rank or (new_rank == prev_rank and (s.get("total") or 0) <= (prev.get("total") or 0)):
                        print(f"      - Skipping {code} (existing record is an equal-or-better attempt: kept grade={prev.get('grade')} total={prev.get('total')} over new grade={s['grade']} total={s.get('total')})")
                        continue
                s_clean = {k: v for k, v in s.items() if k != 'announced_date' or v}
                filtered_subs.append({**s_clean, "result_id": r_id, "usn": usn, "semester": sem})

            if filtered_subs:
                supabase.table("subject_marks").upsert(filtered_subs, on_conflict="usn,subject_code,semester").execute()
                print(f"      [SAVED] DB Saved Sem {sem}: {len(filtered_subs)} subjects | SGPA: {sgpa}")
            else:
                print(f"      [INFO] Sem {sem}: No new data to update (already updated with passing marks)")
    except Exception as e:
        print(f"      [ERROR] DB Error: {e}")

def _recalculate_remarks(usn):
    try:
        marks = supabase.table("subject_marks").select("*").eq("usn", usn).execute().data
        if not marks: return
        student = supabase.table("students").select("id, scheme").eq("usn", usn).execute().data
        if not student: return
        sid = student[0]["id"]
        scheme = student[0].get("scheme") or "2022"
        branch_code = _parse_branch_code(usn)
        catalog_index = _get_catalog_index()

        exclude_grades = {"PP", "NP", "W", "DX", "AU"}
        sems = set(m["semester"] for m in marks if m.get("semester"))
        for s in sems:
            s_marks = [m for m in marks if m["semester"] == s]

            backlogs = [m for m in s_marks if str(m.get("is_backlog")).lower() == 'true' or m.get("grade", "F").strip().upper() in ("F", "A", "AB", "ABSENT", "X", "NE")]

            # Recalculate SGPA — credit resolved fresh from subject_catalog,
            # never trusted from the stored subject_marks.credits column.
            tc = 0
            tcp = 0
            for m in s_marks:
                g = m.get("grade", "F").strip().upper()
                if g in exclude_grades: continue
                pts = _get_true_grade_point(g, m.get("total", 0), ext_m=m.get("see_marks", m.get("external", None)))
                cr, _source = resolve_credits(catalog_index, scheme, branch_code, s, m.get("subject_code"))
                if cr is None: continue  # Unresolved — excluded, not guessed.
                tc += cr
                tcp += (pts * cr)

            sgpa = round(tcp / tc, 2) if tc > 0 else 0.0 # type: ignore
            
            supabase.table("academic_remarks").upsert({"student_id": sid, "student_usn": usn, "semester": s, "sgpa": sgpa, "backlog_count": len(backlogs), "is_all_clear": len(backlogs) == 0}, on_conflict="student_id,semester").execute()
    except Exception as e:
        print(f"      [WARNING] Remarks Error: {e}")

if __name__ == "__main__":
    import sys
    
    usn = sys.argv[1] if len(sys.argv) > 1 else input("Enter USN: ")
    faculty_id = sys.argv[2] if len(sys.argv) > 2 else None
    scheme = sys.argv[3] if len(sys.argv) > 3 else None
    
    scrape_all_semesters(usn, faculty_id=faculty_id, scheme=scheme)
