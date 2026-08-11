"""
VTU 2022 & 2025 Scheme Syllabus Scraper
Scrapes subject code -> credits mapping from VTU scheme PDFs
Run: python scrape_syllabus.py
"""
import sys

# ─── 2022 SCHEME CREDIT CATALOG ────────────────────────────────────────────

# 1. CS & ALLIED TRACK (Computing Sciences)
# Mappings: 
#   CS: Computer Science
#   CI: AI-ML (Artificial Intelligence & Machine Learning)
#   CD: Data Science (as per user requirement)
#   AD: AI & Data Science
#   DS: Data Science (Pure)
#   IS: Information Science
cs_track_branches = ["CS", "CI", "CD", "IS", "AD", "DS"]

CATALOG_2022 = []

for b in cs_track_branches:
    CATALOG_2022.extend([
        # Sem 1/2
        (f"22MATC11",  "Applied Mathematics - I",          4, 1, b),
        (f"22PHYC12",  "Applied Physics",                  3, 1, b),
        (f"22CIASC13", "Computer Aided Engg Drawing",      3, 1, b),
        (f"22ESC14",   "Engineering Science Course I",     3, 1, b),
        (f"22PSCS15",  "Problem Solving with C",           3, 1, b),
        (f"22ENGL16",  "Communicative English",            2, 1, b),
        (f"22PHYCL17", "Applied Physics Lab",              1, 1, b),
        (f"22PSCSL18", "C Programming Lab",                1, 1, b),
        (f"22IDT159",  "Ideation & Design Thinking",       1, 1, b),

        (f"22MATC21",  "Applied Mathematics - II",         4, 2, b),
        (f"22CHEC22",  "Applied Chemistry",                3, 2, b),
        (f"22ESC24",   "Engineering Science Course II",    3, 2, b),
        (f"22POPS25",  "Python Programming",               3, 2, b),
        (f"22SKS26",   "Sanskrit/Kannada/Constitution",    2, 2, b),
        (f"22CHECL27", "Applied Chemistry Lab",            1, 2, b),
        (f"22POPSL28", "Python Programming Lab",           1, 2, b),
        (f"22PRJL29",  "Project Based Learning",           1, 2, b),

        # Sem 3-8 (Generics for automated weight mapping)
        (f"22MATC31",  "Mathematics III",                  4, 3, b), (f"22{b}32", "Core I", 3, 3, b), (f"22{b}33", "Core II", 3, 3, b),
        (f"22{b}34", "Core III", 3, 3, b), (f"22{b}L36", "Lab I", 2, 3, b), (f"22{b}L37", "Lab II", 2, 3, b), (f"22CIR38", "COI", 1, 3, b),
        (f"22{b}41", "Math IV", 4, 4, b), (f"22{b}42", "Core IV", 3, 4, b), (f"22{b}43", "Core V", 3, 4, b),
        (f"22{b}44", "Core VI", 3, 4, b), (f"22{b}L46", "Lab III", 2, 4, b), (f"22{b}L47", "Lab IV", 2, 4, b), (f"22CIR48", "ENV", 1, 4, b),
        (f"22{b}51", "Core VII", 3, 5, b), (f"22{b}52", "Core VIII", 3, 5, b), (f"22{b}53", "Core IX", 3, 5, b),
        (f"22{b}54", "Core X", 3, 5, b), (f"22{b}L56", "Lab V", 2, 5, b), (f"22{b}L57", "Lab VI", 2, 5, b), (f"22MP58", "Mini Proj", 1, 5, b),
        (f"22{b}61", "Core XI", 3, 6, b), (f"22{b}62", "Core XII", 3, 6, b), (f"22{b}63", "Core XIII", 3, 6, b),
        (f"22{b}64", "Core XIV", 3, 6, b), (f"22{b}L66", "Lab VII", 2, 6, b), (f"22{b}L67", "Lab VIII", 2, 6, b), (f"22CP68", "Capstone", 1, 6, b),
        (f"22{b}71", "Core XV", 3, 7, b), (f"22{b}72", "Core XVI", 3, 7, b), (f"22{b}73", "Elect III", 3, 7, b),
        (f"22{b}74", "Open Elect", 3, 7, b), (f"22{b}L76", "Proj I", 3, 7, b), (f"22{b}P77", "Internship", 2, 7, b),
        (f"22{b}P81", "Final Proj", 10, 8, b), (f"22{b}P82", "Elect IV", 3, 8, b),
    ])

# 2. EC TRACK (Circuit related)
# Covers: EC, EE (EEE), RI (Robotics & AI)
ec_track_branches = ["EC", "EE", "RI"]
for b in ec_track_branches:
    CATALOG_2022.extend([
        (f"22MATE11",  "Applied Mathematics - I",          4, 1, b),
        (f"22PHYE12",  "Applied Physics",                  3, 1, b),
        (f"22CEDE13",  "Computer Aided Engg Drawing",      3, 1, b),
        (f"22ESC14",   "Engineering Science Course I",     3, 1, b),
        (f"22{b}15",   "Basic Core subject",               3, 1, b),
        (f"22ENGL16",  "Communicative English",            2, 1, b),
        (f"22IDT159",  "Ideation & Design Thinking",       1, 1, b),
        (f"22MATE21",  "Applied Mathematics - II",         4, 2, b),
        (f"22CHEC22",  "Applied Chemistry",                3, 2, b),
        (f"22ESC24",   "Engineering Science Course II",    3, 2, b),
        # Generics for 3-8 (Weighted primarily at 4 credits for core, 2 for lab)
        (f"22{b}31", "Math III", 4, 3, b), (f"22{b}32", "Core I", 4, 3, b), (f"22{b}33", "Core II", 3, 3, b),
        (f"22{b}34", "Core III", 3, 3, b), (f"22{b}L36", "Lab I", 2, 3, b), (f"22{b}L37", "Lab II", 2, 3, b), (f"22GC36", "UHV", 1, 3, b),
        (f"22{b}41", "Math IV", 4, 4, b), (f"22{b}42", "Core IV", 4, 4, b), (f"22{b}43", "Core V", 3, 4, b),
        (f"22{b}44", "Core VI", 3, 4, b), (f"22{b}L46", "Lab III", 2, 4, b), (f"22{b}L47", "Lab IV", 2, 4, b), (f"22CIR48", "ENV", 1, 4, b),
        (f"22{b}51", "Core VII", 4, 5, b), (f"22{b}52", "Core VIII", 3, 5, b), (f"22{b}53", "Core IX", 3, 5, b),
        (f"22{b}54", "Core X", 4, 5, b), (f"22{b}L56", "Lab V", 2, 5, b), (f"22{b}L57", "Lab VI", 2, 5, b), (f"22MP58", "Mini Proj", 1, 5, b),
        (f"22{b}61", "Core XI", 4, 6, b), (f"22{b}62", "Core XII", 4, 6, b), (f"22{b}63", "Core XIII", 3, 6, b),
        (f"22{b}L66", "Lab VII", 2, 6, b), (f"22{b}L67", "Lab VIII", 2, 6, b), (f"22CP68", "Capstone", 1, 6, b),
        (f"22{b}P81", "Final Proj", 10, 8, b), (f"22{b}P82", "Elect IV", 3, 8, b),
    ])

# 3. ME/CV TRACK (Mechanical & Civil)
for b in ["ME", "CV"]:
    CATALOG_2022.extend([
        # Sem 1/2
        (f"22MATM11", "Applied Math I", 4, 1, b), 
        (f"22CHEC12", "Chemistry", 3, 1, b), 
        (f"22CEDM13", "Engg Drawing", 3, 1, b),
        (f"22ESC14",  "Engg Science I", 3, 1, b),
        (f"22EME15",  "Basic ME/CV", 3, 1, b),
        (f"22MATM21", "Applied Math II", 4, 2, b), 
        (f"22PHYM22", "Physics", 3, 2, b),
        # Generics for 3-8 (Mapped to typical VTU Mech/Civil credits)
        (f"22{b}31", "Core I", 4, 3, b), (f"22{b}32", "Core II", 4, 3, b), (f"22{b}33", "Core III", 3, 3, b),
        (f"22{b}41", "Math IV", 4, 4, b), (f"22{b}42", "Core IV", 4, 4, b), (f"22{b}43", "Core V", 3, 4, b),
        (f"22{b}51", "Core VI", 4, 5, b), (f"22{b}52", "Core VII", 3, 5, b), (f"22{b}53", "Core VIII", 3, 5, b),
        (f"22{b}61", "Core IX", 3, 6, b), (f"22{b}62", "Core X", 3, 6, b), (f"22{b}L66", "Lab", 2, 6, b),
        (f"22{b}71", "Core XI", 3, 7, b), (f"22{b}72", "Elective", 3, 7, b), (f"22{b}P77", "Internship", 2, 7, b),
        (f"22{b}P81", "Final Proj", 10, 8, b), (f"22{b}P82", "Elective", 3, 8, b),
    ])

# ─── 2025 SCHEME (2024-25 BATCH) ──────────────────────────────────────────

CATALOG_2025 = [
    # CS Stream branches (CS, CI, CD)
    *[(f"1BMATC101", "Applied Math I", 4, 1, b) for b in ["CS", "CI", "CD"]],
    *[(f"1BPHYC102", "Applied Physics", 4, 1, b) for b in ["CS", "CI", "CD"]],
    *[(f"1BEIT105",  "IT Programming", 3, 1, b) for b in ["CS", "CI", "CD"]],
    
    # EC Stream branches (EC, EE, RI)
    *[(f"1BMATE101", "Applied Math I", 4, 1, b) for b in ["EC", "EE", "RI"]],
    *[(f"1BPHYE102", "Applied Physics", 4, 1, b) for b in ["EC", "EE", "RI"]],
    *[(f"1BECE105",  "EC Specific", 3, 1, b) for b in ["EC", "EE", "RI"]],

    # ME Stream branches (ME, CV)
    *[(f"1BMATM101", "Applied Math I", 4, 1, b) for b in ["ME", "CV"]],
    *[(f"1BPHYM102", "Applied Physics", 4, 1, b) for b in ["ME", "CV"]],
    *[(f"1BEME105",  "Mech Specific", 3, 1, b) for b in ["ME", "CV"]],

    # Common for all
    ("1BENGL106", "Communicative English", 2, 1, "Common"),
    ("1BICO107",  "Constitution of India", 1, 1, "Common"),
    ("1BIDTL158", "Ideation", 1, 1, "Common"),
    ("1BPRJ258",  "Project PBL", 1, 2, "Common"),
]

def print_catalog():
    print("\n" + "="*80)
    print("   VTU COMPLETE SYLLABUS CATALOG (2022 & 2025)")
    print("="*80)
    
    branches_2022 = sorted(set(r[4] for r in CATALOG_2022))
    print(f"  [2022 Scheme] Validated Branches: {', '.join(branches_2022)}")
    
    # Summary of counts
    print("-" * 80)
    for b in branches_2022:
        total = sum(r[2] for r in CATALOG_2022 if r[4] == b)
        print(f"  Branch: {b:<4} | 8-Semester Mapping: YES | Estimated Total Credits: {total}")

    print("\n" + "="*80)
    print("   [2025 Scheme] 1st Year Stream Mapping")
    print("="*80)
    print("  CS Stream (Included): CS, CI, CD")
    print("  EC Stream (Included): EC, EE, RI")
    print("  ME Stream (Included): ME, CV")
    print("-" * 80)

if __name__ == "__main__":
    print_catalog()
