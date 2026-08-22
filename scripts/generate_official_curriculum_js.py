import json
import os

with open("vtu_official_catalog.json", "r", encoding="utf-8") as f:
    catalog = json.load(f)

# Structure:
# VTU_SUBJECT_DATA[ `${scheme}_${branch}` ][ semester ] = [ { code, name, credits, course_type } ]
structured_data = {}

for c in catalog:
    scheme = c["scheme"]
    branch = c["branch"]
    sem = str(c["semester"])
    key = f"{scheme}_{branch}"
    structured_data.setdefault(key, {}).setdefault(sem, []).append({
        "code": c["subject_code"],
        "name": c["subject_name"],
        "credits": c["credits"],
        "course_type": c.get("course_type", "PCC")
    })

# Also generate quick lookup map:
# OFFICIAL_CREDITS_MAP[ `${scheme}_${code}` ] = credits
credits_map = {}
for c in catalog:
    scheme = c["scheme"]
    code = c["subject_code"].upper().strip()
    credits_map[f"{scheme}_{code}"] = c["credits"]
    # also store code directly if unambiguous
    if code not in credits_map:
        credits_map[code] = c["credits"]

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

print(f"Generated {target_file} with {len(credits_map)} credit lookups and {len(structured_data)} branch-scheme datasets.")
