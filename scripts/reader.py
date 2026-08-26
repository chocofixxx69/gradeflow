import sys
import json
import re
import pdfplumber
from pypdf import PdfReader

def clean_text(text):
    if not text:
        return ""
    return re.sub(r'\s+', ' ', str(text)).strip()

# NOTE: this script only extracts what's literally printed on the uploaded PDF.
# It has no DB access (no USN -> scheme/branch -> subject_catalog lookup is
# possible from a stateless subprocess), so it cannot resolve credits against
# the canonical catalog itself — lib/pdfParser.js's caller is responsible for
# that. When the PDF's own credit column can't be read, this returns `None`
# rather than guessing from the subject name/code (VTU credit values aren't
# derivable from a name pattern — e.g. "Project Phase I" is 2 credits in one
# scheme's semester and 3 in another) — a guessed number here would silently
# corrupt every downstream SGPA calculation.

def extract_vtu_data(pdf_path_or_stream):
    results = {
        "isParsed": False,
        "subjects": [],
        "studentInfo": {"usn": "Unknown", "semester": 1, "branch": "Detected", "name": ""},
        "scheme": "2022"
    }

    try:
        reader = PdfReader(pdf_path_or_stream)
        full_text = ""
        for page in reader.pages:
            full_text += (page.extract_text() or "") + "\n"

        # 1. Verify this is a VTU document (relaxed check)
        vtu_keywords = ["VISVESVARAYA", "VTU", "BELAGAVI", "TECHNOLOGICAL", 
                        "MARKS", "RESULT", "USN", "GRADE CARD", "SEMESTER",
                        "SUBJECT", "CREDITS", "TOTAL", "EXAMINATION"]
        if not any(kw in full_text.upper() for kw in vtu_keywords):
            results["error"] = "Not a recognized VTU document. Please use an official Result PDF."
            return results

        # 2. Extract USN — multiple patterns
        usn_patterns = [
            r'([1-9][A-Z]{2}\d{2}[A-Z]{2,3}\d{3})',  # Standard: 4AB22CS001
            r'(\d[A-Z]{2}\d{2}[A-Z]{2}\d{3})',          # Alternate: 1AB22CS001
            r'USN\s*[:\-]?\s*([A-Z0-9]{10,12})',         # Explicit USN label
        ]
        for pattern in usn_patterns:
            usn_match = re.search(pattern, full_text, re.IGNORECASE)
            if usn_match:
                results["studentInfo"]["usn"] = usn_match.group(1).upper()
                break

        # 3. Extract Student Name
        name_patterns = [
            r'(?:Student\s*Name|Name\s*of\s*(?:the\s*)?Student|Candidate)\s*[:\-]?\s*([A-Z][A-Z\s]{3,40})',
            r'(?:Name)\s*[:\-]\s*([A-Z][A-Z\s]{3,40})',
        ]
        for pattern in name_patterns:
            name_match = re.search(pattern, full_text, re.IGNORECASE)
            if name_match:
                name = clean_text(name_match.group(1))
                # Filter out common non-name words
                if name and not any(x in name.upper() for x in ['SEMESTER', 'RESULT', 'UNIVERSITY', 'VISVESVARAYA', 'EXAMINATION']):
                    results["studentInfo"]["name"] = name.title()
                    break

        # 4. Determine Scheme
        usn = results["studentInfo"].get("usn", "")
        year_code = usn[3:5] if len(usn) >= 5 else ""
        if any(x in full_text for x in ["BMA", "BCS", "BPH", "BCH", "BES", "BET", "BPO", "BSF", "BPL", "BOK"]):
            results["scheme"] = "2022"
        elif year_code in ["22", "23", "24", "25"]:
            results["scheme"] = "2022"
        elif year_code in ["21"]:
            results["scheme"] = "2021"
        else:
            results["scheme"] = "2022"

        # 5. Detect Semester from text
        all_semesters = []
        sem_patterns = [
            r'(?:Semester|Sem)\s*[:\-]?\s*(\d)',
            r'(\d)\s*(?:st|nd|rd|th)\s*Semester',
            r'(?:Semester|SEM)\s*(\d)',
        ]
        for pattern in sem_patterns:
            for m in re.finditer(pattern, full_text, re.IGNORECASE):
                sem_num = int(m.group(1))
                if 1 <= sem_num <= 8:
                    all_semesters.append(sem_num)

        current_sem = all_semesters[0] if all_semesters else 1

        all_subjects = []

        # 6. Strategy A: pdfplumber Table Extraction
        with pdfplumber.open(pdf_path_or_stream) as pdf:
            page_sem = current_sem
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                
                # Detect semester per page
                for pattern in sem_patterns:
                    sm = re.search(pattern, page_text, re.IGNORECASE)
                    if sm:
                        page_sem = int(sm.group(1))
                        break

                tables = page.extract_tables()
                for table in tables:
                    if not table or len(table) < 2:
                        continue
                    
                    header_map = {}
                    header_row_idx = -1

                    # Find header row
                    for idx, row in enumerate(table[:5]):
                        row_str = " ".join([clean_text(c) for c in row if c]).upper()
                        if any(k in row_str for k in ["CODE", "SUBJECT", "MARKS", "GRADE", "CREDIT"]):
                            header_row_idx = idx
                            for i, cell in enumerate(row):
                                c = clean_text(cell).upper()
                                if "CODE" in c or "SUB" in c and "CODE" in row_str:
                                    header_map["code"] = i
                                elif any(x in c for x in ["SUBJECT NAME", "NAME", "TITLE"]) and "CODE" not in c:
                                    header_map["name"] = i
                                elif "CREDIT" in c:
                                    header_map["credits"] = i
                                elif "INT" in c or "CIE" in c or "IA" in c:
                                    header_map["internal"] = i
                                elif "EXT" in c or "SEE" in c or "TEE" in c:
                                    header_map["external"] = i
                                elif "TOTAL" in c:
                                    header_map["total"] = i
                                elif "GRADE" in c and "POINT" not in c:
                                    header_map["grade"] = i
                                elif "RESULT" in c:
                                    header_map["result"] = i
                            break

                    start_idx = header_row_idx + 1 if header_row_idx != -1 else 0
                    for row in table[start_idx:]:
                        row = [clean_text(cell) for cell in row]
                        if not any(row):
                            continue

                        # Find subject code
                        code = None
                        search_indices = [header_map["code"]] if "code" in header_map else range(min(3, len(row)))
                        for idx in search_indices:
                            if idx >= len(row):
                                continue
                            c_m = re.search(r'\b([A-Z]{2,6}\d{2,4}[A-Z\d]?)\b', row[idx], re.IGNORECASE)
                            if c_m:
                                code = c_m.group(1).upper()
                                skip_words = ['RESULT', 'VTU', 'BELAGAVI', 'MARKS', 'GRADE', 
                                            'TOTAL', 'CREDITS', 'SUBJECT', 'SGPA', 'CGPA']
                                if code not in skip_words:
                                    break
                                else:
                                    code = None

                        if not code:
                            continue

                        # Extract fields
                        name = row[header_map["name"]] if "name" in header_map and header_map["name"] < len(row) else code
                        
                        # Credits — only trust what was actually printed in the
                        # PDF's own credits column; never guess.
                        credits_str = row[header_map["credits"]] if "credits" in header_map and header_map["credits"] < len(row) else ""
                        parsed_credits = int(re.sub(r'\D', '', str(credits_str)) or 0) if credits_str else 0
                        credits = parsed_credits if 0 < parsed_credits <= 10 else None

                        internal = row[header_map["internal"]] if "internal" in header_map and header_map["internal"] < len(row) else "0"
                        external = row[header_map["external"]] if "external" in header_map and header_map["external"] < len(row) else "0"
                        total_str = row[header_map["total"]] if "total" in header_map and header_map["total"] < len(row) else "0"
                        grade = row[header_map["grade"]].upper() if "grade" in header_map and header_map["grade"] < len(row) and row[header_map["grade"]] else None

                        # Fallback grade detection from any cell
                        if not grade:
                            grade_set = {'O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F', 'S', 'D', 'E', 'ABS', 'AB'}
                            for cell in reversed(row):
                                if cell.upper().strip() in grade_set:
                                    grade = cell.upper().strip()
                                    break

                        int_val = int(re.sub(r'\D', '', str(internal)) or 0)
                        ext_val = int(re.sub(r'\D', '', str(external)) or 0)
                        tot_val = int(re.sub(r'\D', '', str(total_str)) or 0)

                        # Auto-calculate total if missing
                        if tot_val == 0 and (int_val > 0 or ext_val > 0):
                            tot_val = int_val + ext_val

                        all_subjects.append({
                            "code": code,
                            "name": clean_text(name),
                            "credits": credits,
                            "internal": int_val,
                            "external": ext_val,
                            "total": tot_val,
                            "grade": grade or ("F" if tot_val < 40 else "P"),
                            "semester": page_sem
                        })

        # 7. Strategy B: Regex Fallback
        if len(all_subjects) < 3:
            patterns = [
                # Pattern with credits: CODE NAME CREDITS INT EXT TOTAL GRADE
                re.compile(r'([A-Z]{2,6}\d{2,4}[A-Z\d]?)\s+([\w\s&()\-]+?)\s+(\d{1,2})\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+([OABCPFSE][+]?)', re.IGNORECASE),
                # Pattern without credits
                re.compile(r'([A-Z]{2,6}\d{2,4}[A-Z\d]?)\s+([\w\s&()\-]+?)\s+(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})\s+([OABCPFSE][+]?)', re.IGNORECASE),
            ]
            for pattern in patterns:
                for match in pattern.finditer(full_text):
                    groups = match.groups()
                    if len(groups) == 7:
                        code, name, credits_s, int_m, ext_m, tot_m, grd = groups
                        cred = int(credits_s) if 0 < int(credits_s) <= 10 else None
                    else:
                        code, name, int_m, ext_m, tot_m, grd = groups
                        cred = None  # Credits column wasn't captured by this pattern — unresolved, not guessed.
                    
                    if not any(s["code"] == code.upper() for s in all_subjects):
                        all_subjects.append({
                            "code": code.upper(),
                            "name": clean_text(name),
                            "credits": cred,
                            "internal": int(int_m),
                            "external": int(ext_m),
                            "total": int(tot_m),
                            "grade": grd.upper(),
                            "semester": current_sem
                        })

        # 8. Final Deduplication
        seen = set()
        unique_subjects = []
        for s in all_subjects:
            key = f"{s['code']}_{s['semester']}"
            if key not in seen:
                unique_subjects.append(s)
                seen.add(key)

        results["subjects"] = unique_subjects
        results["isParsed"] = len(unique_subjects) > 0
        results["studentInfo"]["semester"] = current_sem
        
        if not results["isParsed"]:
            results["error"] = "Could not find marks table. Please ensure this is a standard VTU Result PDF."

    except Exception as e:
        results["error"] = f"Extraction Exception: {str(e)}"

    return results

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)
    print(json.dumps(extract_vtu_data(sys.argv[1]), indent=2))
