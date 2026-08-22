import json
import os

with open("vtu_official_catalog.json", "r", encoding="utf-8") as f:
    catalog = json.load(f)

# Update catalog entries for exact credit accuracy
for c in catalog:
    code = c["subject_code"].upper().strip()
    name = (c.get("subject_name") or "").upper()
    
    # 1. Non-credit mandatory courses (NSS, PE, Yoga, Sports)
    if code.startswith("BPEK") or code.startswith("BNSK") or code.startswith("BYOK") or "PHYSICAL EDUCATION" in name or "NATIONAL SERVICE SCHEME" in name:
        c["credits"] = 0
        c["course_type"] = "MC"
        
    # 2. Ability Enhancement Courses (AEC) - 1 credit
    elif code.startswith("BCS358") or code.startswith("BCS456") or code.startswith("BAIL657") or code.startswith("BDSL456") or code.startswith("BCSL657") or code.startswith("BENGK") or code.startswith("BPWSK") or code.startswith("BIDTK") or code.startswith("BSFHK") or code.startswith("BICOK") or code.startswith("BSCK") or code.startswith("BUHK") or code.startswith("BIKS"):
        c["credits"] = 1
        c["course_type"] = "AEC"

with open("vtu_official_catalog.json", "w", encoding="utf-8") as f:
    json.dump(catalog, f, indent=2)

# Build credits_map
credits_map = {}
structured_data = {}

for c in catalog:
    scheme = c["scheme"]
    branch = c["branch"]
    sem = str(c["semester"])
    code = c["subject_code"].upper().strip()
    
    key = f"{scheme}_{branch}"
    structured_data.setdefault(key, {}).setdefault(sem, []).append({
        "code": c["subject_code"],
        "name": c["subject_name"],
        "credits": c["credits"],
        "course_type": c.get("course_type", "PCC")
    })
    
    credits_map[f"{scheme}_{code}"] = c["credits"]
    if code not in credits_map or c["credits"] > 0:
        credits_map[code] = c["credits"]

# Additional explicit overrides for all branch AEC/MC codes
explicit_overrides = {
    # Non-credit mandatory courses (0 credits)
    "BPEK359": 0, "BPEK459": 0, "BPEK559": 0, "BPEK658": 0,
    "BNSK359": 0, "BNSK459": 0, "BNSK559": 0, "BNSK658": 0,
    "BYOK359": 0, "BYOK459": 0, "BYOK559": 0, "BYOK658": 0,
    # AEC Courses (1 credit)
    "BCS358A": 1, "BCS358B": 1, "BCS358C": 1, "BCS358D": 1,
    "BCS456A": 1, "BCS456B": 1, "BCS456C": 1, "BCS456D": 1,
    "BAIL657A": 1, "BAIL657B": 1, "BAIL657C": 1, "BAIL657D": 1,
    "BDSL456A": 1, "BDSL456B": 1, "BDSL456C": 1, "BDSL456D": 1,
    "BIKS609": 1, "BSCK307": 1, "BUHK408": 1, "BENGK106": 1, "BPWSK106": 1,
    "BENGK206": 1, "BPWSK206": 1, "BICOK107": 1, "BICOK207": 1,
    "BKSKK107": 1, "BKSKK207": 1, "BKBKK107": 1, "BKBKK207": 1,
    "BIDTK158": 1, "BIDTK258": 1, "BSFHK158": 1, "BSFHK258": 1,
    "BCSL305": 1, "BCSL404": 1, "BCSL504": 1, "BCSL606": 1,
    # Core & IPCC
    "BMATS101": 4, "BPHYS102": 4, "BPOPS103": 3, "BCHES102": 4, "BCEDK103": 3,
    "BMATS201": 4, "BPHYS202": 4, "BPOPS203": 3, "BCHES202": 4, "BCEDK203": 3,
    "BCS301": 4, "BCS302": 4, "BCS303": 4, "BCS304": 3, "BCS306A": 3, "BCS306B": 3,
    "BCS401": 3, "BCS402": 4, "BCS403": 4, "BCS405A": 3, "BBOC407": 2,
    "BCS501": 3, "BCS502": 4, "BCS503": 4, "BCS515A": 3, "BCS515B": 3, "BCS586": 2, "BCS508": 2, "BRMK557": 3,
    "BCS601": 4, "BCS602": 4, "BCS613A": 3, "BCS613B": 3, "BEE654B": 3, "BCS685": 2
}

for k, v in explicit_overrides.items():
    credits_map[k] = v
    credits_map[f"2022_{k}"] = v

js_content = f"""// lib/vtu-curriculum-catalog.js
// Official VTU Curriculum Data for Schemes 2022 and 2025 across 8 branches (AI, CS, CV, DS, EC, EE, ME, RI)

export const VTU_SUPPORTED_BRANCHES = {{
    'AI': 'AI & Machine Learning',
    'CS': 'Computer Science & Engineering',
    'CV': 'Civil Engineering',
    'DS': 'Computer Science & Engineering (Data Science)',
    'EC': 'Electronics & Communication Engineering',
    'EE': 'Electrical & Electronics Engineering',
    'ME': 'Mechanical Engineering',
    'RI': 'Robotics & Artificial Intelligence'
}};

export const OFFICIAL_CREDITS_LOOKUP = {json.dumps(credits_map, indent=2)};

export const VTU_OFFICIAL_SUBJECT_DATA = {json.dumps(structured_data, indent=2)};

export function getOfficialCredit(subjectCode, scheme = '2022') {{
    if (!subjectCode) return null;
    const cleanCode = String(subjectCode).toUpperCase().trim();
    
    // Check non-credit audit courses first (NSS, PE, Yoga, etc.)
    if (cleanCode.startsWith('BPEK') || cleanCode.startsWith('BNSK') || cleanCode.startsWith('BYOK')) {{
        return 0;
    }}
    
    if (OFFICIAL_CREDITS_LOOKUP[`${{scheme}}_${{cleanCode}}`] !== undefined) {{
        return OFFICIAL_CREDITS_LOOKUP[`${{scheme}}_${{cleanCode}}`];
    }}
    if (OFFICIAL_CREDITS_LOOKUP[cleanCode] !== undefined) {{
        return OFFICIAL_CREDITS_LOOKUP[cleanCode];
    }}
    return null;
}}
"""

target_file = os.path.join(os.path.dirname(__file__), "..", "lib", "vtu-curriculum-catalog.js")
with open(target_file, "w", encoding="utf-8") as f:
    f.write(js_content)

print(f"Updated {target_file} with refined credit definitions.")
