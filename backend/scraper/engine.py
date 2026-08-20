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
    CREDIT_MAP = {r[0]: r[2] for r in CATALOG_2022 + CATALOG_2025}
except ImportError:
    CREDIT_MAP = {}

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
    
    if parsed_grade in ("W", "X", "NE"):
        final_grade = parsed_grade
    elif parsed_grade in ABSENT_MARKS:
        final_grade = "A"
    elif parsed_grade == "F" or parsed_grade == "FAIL":
        final_grade = "F"
    elif parsed_grade in PASS_GRADES:
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
    elif tot_m >= 40 and (ext_m >= 18 or ext_m == 0):
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
            
            # Save captcha bytes to check what Playwright grabbed
            debug_img = f"debug_{usn}_{url_short}_attempt_{attempt+1}.png"
            with open(debug_img, "wb") as f:
                f.write(captcha_bytes)
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
        # If we see "Semester :" or a substantial number of TD elements, it's a success
        if has_table or page.locator("td").count() > 15:
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

                # Save for training
                try:
                    train_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "training_data")
                    os.makedirs(train_dir, exist_ok=True)
                    # filename format: LABEL_TIMESTAMP.png
                    train_img_path = os.path.join(train_dir, f"{captcha_text}_{int(time.time())}.png")
                    with open(train_img_path, "wb") as f_train:
                        f_train.write(captcha_bytes)
                except: pass

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

def scrape_all_semesters(usn: str, faculty_id=None):
    urls = get_vtu_urls(faculty_id)
    if not urls:
        print(f"\n[ENGINE] Faculty has 0 active URLs. Skipping {usn}.", file=sys.stderr)
        return False
        
    usn = usn.strip().upper()
    print(f"\n[ENGINE] Scraping {usn} ({len(urls)} portals)...", file=sys.stderr, flush=True)
    
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
        print(f"✅ {usn}: Success")
    else:
        print(f"⚠ {usn}: No results")
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

def _save_db(usn, name, sem, url, subs):
    try:
        branch = _parse_branch(usn)
        # Update branch if we parsed it
        updates = {"usn": usn, "name": name, "semester": sem}
        if branch: updates["branch"] = branch
        
        supabase.table("students").upsert(updates, on_conflict="usn").execute()
        
        # Calc SGPA with Credits and True Points!
        tc = 0
        tcp = 0
        exclude_grades = {"PP", "NP", "W", "DX", "AU"}
        
        for s in subs:
            g = s.get("grade", "F").strip().upper()
            if g in exclude_grades: continue
            
            pts = _get_true_grade_point(g, s.get("total", 0), ext_m=s.get("external", None))
            cr = s.get("credits")
            if cr is None: cr = 3
            
            tc += cr
            tcp += (pts * cr)
            
        sgpa = round(tcp / tc, 2) if tc > 0 else 0.0 # type: ignore
        
        exam_alias = url.split('/')[-2] if ('/' in url) else "Scraped Record"
        
        # Smart Sync: Fetch existing marks for this USN and Semester
        existing_res = supabase.table("subject_marks").select("subject_code, passed").eq("usn", usn).execute()
        already_passed = {r["subject_code"] for r in existing_res.data if r["passed"]} if existing_res.data else set()

        res = supabase.table("results").upsert({"usn": usn, "semester": sem, "exam_url": url, "exam_name": exam_alias, "sgpa": sgpa, "total_credits": sum((s.get("credits") or 3) for s in subs)}, on_conflict="usn,exam_url").execute()
        if res.data:
            r_id = res.data[0]["id"]
            
            # Filters subs: Don't let a FAIL override a PASS for the same semester
            filtered_subs = []
            for s in subs:
                code = s["subject_code"]
                # If student already passed this subject-sem in this USN record, and new record is a fail, SKIP
                if code in already_passed and s["grade"] in ("F", "A", "X", "NE"): # type: ignore
                    print(f"      - Skipping {code} (Student already has a PASS record for this sem)")
                    continue
                filtered_subs.append({**s, "result_id": r_id, "usn": usn, "semester": sem})

            if filtered_subs:
                supabase.table("subject_marks").upsert(filtered_subs, on_conflict="usn,subject_code,semester").execute()
                print(f"      💾 DB Saved Sem {sem}: {len(filtered_subs)} subjects | SGPA: {sgpa}")
            else:
                print(f"      ℹ️ Sem {sem}: No new data to update (already updated with passing marks)")
    except Exception as e:
        print(f"      ❌ DB Error: {e}")

def _recalculate_remarks(usn):
    try:
        marks = supabase.table("subject_marks").select("*").eq("usn", usn).execute().data
        if not marks: return
        student = supabase.table("students").select("id").eq("usn", usn).execute().data
        if not student: return
        sid = student[0]["id"]
        
        exclude_grades = {"PP", "NP", "W", "DX", "AU"}
        sems = set(m["semester"] for m in marks if m.get("semester"))
        for s in sems:
            s_marks = [m for m in marks if m["semester"] == s]
            
            backlogs = [m for m in s_marks if str(m.get("is_backlog")).lower() == 'true' or m.get("grade", "F").strip().upper() in ("F", "A", "AB", "ABSENT", "X", "NE")]
            
            # Recalculate SGPA
            tc = 0
            tcp = 0
            for m in s_marks:
                g = m.get("grade", "F").strip().upper()
                if g in exclude_grades: continue
                pts = _get_true_grade_point(g, m.get("total", 0), ext_m=m.get("see_marks", m.get("external", None)))
                cr = m.get("credits")
                if cr is None: cr = 3
                tc += cr
                tcp += (pts * cr)
                
            sgpa = round(tcp / tc, 2) if tc > 0 else 0.0 # type: ignore
            
            supabase.table("academic_remarks").upsert({"student_id": sid, "student_usn": usn, "semester": s, "sgpa": sgpa, "backlog_count": len(backlogs), "is_all_clear": len(backlogs) == 0}, on_conflict="student_id,semester").execute()
    except Exception as e:
        print(f"      ⚠ Remarks Error: {e}")

if __name__ == "__main__":
    import sys
    
    usn = sys.argv[1] if len(sys.argv) > 1 else input("Enter USN: ")
    faculty_id = sys.argv[2] if len(sys.argv) > 2 else None
    
    scrape_all_semesters(usn, faculty_id=faculty_id)
