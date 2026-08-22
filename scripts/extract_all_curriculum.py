import os
import json
import re
import pdfplumber

PDF_DIR = os.path.join(os.path.dirname(__file__), "vtu_pdfs")

# Output: dictionary of all subjects
# key: (scheme, branch, semester, subject_code) -> dict
all_subjects = {}

def clean(v):
    if v is None:
        return ""
    return re.sub(r'\s+', ' ', str(v)).strip()

def parse_num(v):
    if not v:
        return None
    m = re.search(r'\b(\d+(?:\.\d+)?)\b', str(v))
    if m:
        try:
            val = float(m.group(1))
            return int(val) if val.is_integer() else val
        except:
            pass
    return None

def extract_sem_from_text(text):
    m = re.search(r'(?:SEMESTER|SEM)\s*[-:]?\s*([I|V|X|1-8]+)', text, re.IGNORECASE)
    if m:
        s = m.group(1).upper()
        roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'VII': 7, 'VIII': 8}
        if s in roman_map:
            return roman_map[s]
        try:
            val = int(s)
            if 1 <= val <= 8:
                return val
        except:
            pass
    return None

def parse_pdf_subjects(pdf_path, scheme, default_branches, default_semesters, source_url):
    print(f"\nParsing {os.path.basename(pdf_path)} (Scheme {scheme}, Branches {default_branches}, Sems {default_semesters})...")
    if not os.path.exists(pdf_path):
        print(f"  File not found: {pdf_path}")
        return []
    
    found_courses = []
    current_sem = default_semesters[0] if len(default_semesters) == 1 else None
    current_category = ""
    current_elective_group = ""

    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            page_text = page.extract_text() or ""
            
            # Check for semester change on page
            detected_sem = extract_sem_from_text(page_text)
            if detected_sem and detected_sem in default_semesters:
                current_sem = detected_sem

            tables = page.extract_tables()
            for tbl in tables:
                if not tbl or len(tbl) < 2:
                    continue
                
                # Analyze table columns
                header_row = [clean(c).upper() for c in tbl[0] if c]
                # Look for columns: Course Code, Course Title, Credits, Course Type
                for row_idx, row in enumerate(tbl):
                    row_clean = [clean(c) for c in row]
                    row_text = " ".join(row_clean)
                    
                    # Check if row is a semester header or elective group header
                    sem_in_row = extract_sem_from_text(row_text)
                    if sem_in_row and sem_in_row in default_semesters:
                        current_sem = sem_in_row
                    
                    if "PROFESSIONAL ELECTIVE" in row_text.upper() or "PEC" in row_text.upper():
                        current_elective_group = "Professional Elective"
                    elif "OPEN ELECTIVE" in row_text.upper() or "OEC" in row_text.upper():
                        current_elective_group = "Open Elective"
                    elif "ABILITY ENHANCEMENT" in row_text.upper() or "AEC" in row_text.upper():
                        current_elective_group = "Ability Enhancement"
                    
                    # Look for subject code pattern in cells
                    # Patterns:
                    # 2022: BMATS101, BPHYS102, BCS301, 21CS71, BCS714A, etc.
                    # 2025: 1BMATS101, 1BCS301, 1BPHYS102, 1BEMEL107, etc.
                    code = None
                    code_col_idx = -1
                    for c_idx, cell in enumerate(row_clean):
                        c_upper = cell.upper()
                        # Match valid VTU course codes (avoiding words like TOTAL, SEMESTER, etc.)
                        if re.match(r'^(?:1B|B|22|25|21)[A-Z]{2,6}\d{2,4}[A-Z0-9]*$', c_upper) or re.match(r'^[A-Z]{2,5}\d{3,4}[A-Z0-9]*$', c_upper):
                            if not any(x in c_upper for x in ["TOTAL", "CIE", "SEE", "CREDIT", "HOUR", "WEEK", "MARKS"]):
                                code = c_upper
                                code_col_idx = c_idx
                                break
                    
                    if not code:
                        continue
                    
                    # Extract Course Type (IPCC, PCC, BSC, ESC, ETC, AEC, PEC, OEC, INT, PROJ, etc.)
                    course_type = ""
                    for cell in row_clean:
                        cu = cell.upper()
                        if cu in ["IPCC", "PCC", "BSC", "ESC", "ETC", "PLC", "AEC", "PEC", "OEC", "INT", "PROJ", "MC", "HSMC", "UHV", "NSS", "PE", "OE", "PW", "SEMINAR", "MINI PROJECT"]:
                            course_type = cu
                            break
                    
                    # Extract Course Title (usually cell right after code, or longest text)
                    title = ""
                    for c_idx, cell in enumerate(row_clean):
                        if c_idx == code_col_idx:
                            continue
                        if cell and len(cell) > len(title) and not re.match(r'^\d+$', cell) and not cell.upper() in ["IPCC", "PCC", "BSC", "ESC", "ETC", "PLC", "AEC", "PEC", "OEC", "INT", "PROJ"]:
                            # Filter out TD / PSB strings
                            if not cell.startswith("TD:") and not cell.startswith("PSB:"):
                                title = cell
                    
                    # Clean title
                    title = re.sub(r'^(?:TD|PSB)\s*:\s*[A-Z\s,]+', '', title).strip()
                    title = re.sub(r'\s+', ' ', title).strip()
                    
                    # Extract Credits: in VTU tables, Credits is usually the last column or second to last
                    # Credits is usually an integer 1, 2, 3, 4, 6, 10 or float
                    credits = None
                    # Search from right to left
                    for cell in reversed(row_clean):
                        num = parse_num(cell)
                        if num is not None and 1 <= num <= 24:
                            credits = num
                            break
                    
                    # Infer semester from code if not already detected
                    # e.g., BCS301 -> Sem 3, BCS701 -> Sem 7, BMATS101 -> Sem 1, 1BCS301 -> Sem 3
                    sem = current_sem
                    if not sem:
                        m_sem = re.search(r'(?:1B|B|22|25|21)?[A-Z]{2,6}(\d)\d{2}', code)
                        if m_sem:
                            s_digit = int(m_sem.group(1))
                            if 1 <= s_digit <= 8 and (s_digit in default_semesters or not default_semesters):
                                sem = s_digit
                    
                    if not sem and default_semesters:
                        sem = default_semesters[0]
                    
                    if code and title and credits is not None and sem:
                        for b in default_branches:
                            found_courses.append({
                                "scheme": scheme,
                                "branch": b,
                                "semester": sem,
                                "subject_code": code,
                                "subject_name": title,
                                "credits": credits,
                                "course_type": course_type or ("PEC" if "x" in code.lower() else "PCC"),
                                "category": current_category or course_type,
                                "elective_group": current_elective_group if (course_type in ["PEC", "OEC", "AEC"] or "x" in code.lower()) else None,
                                "source_pdf": os.path.basename(pdf_path),
                                "source_url": source_url
                            })
    print(f"  -> Extracted {len(found_courses)} course entries.")
    return found_courses

# Run extraction on all mapped PDFs
from parse_curriculum_tables import PDF_MAPPINGS

total_extracted = 0
for mapping in PDF_MAPPINGS:
    pdf_file = os.path.join(PDF_DIR, mapping["file"])
    courses = parse_pdf_subjects(
        pdf_file,
        mapping["scheme"],
        mapping["branches"],
        mapping["semesters"],
        mapping["url"]
    )
    for c in courses:
        # Deduplicate & record
        key = (c["scheme"], c["branch"], c["semester"], c["subject_code"])
        if key not in all_subjects or (not all_subjects[key]["subject_name"] and c["subject_name"]):
            all_subjects[key] = c
    total_extracted += len(courses)

print(f"\n=======================================================")
print(f"TOTAL UNIQUE SUBJECTS EXTRACTED: {len(all_subjects)}")
print(f"=======================================================")

# Output to JSON
output_list = list(all_subjects.values())
with open("vtu_official_catalog.json", "w", encoding="utf-8") as f:
    json.dump(output_list, f, indent=2, ensure_ascii=False)

print("Saved catalog to vtu_official_catalog.json")
