import os
import sys
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from dotenv import load_dotenv

load_dotenv(os.path.join('backend', 'scraper', '.env'))
from supabase import create_client
from backend.scraper.credit_resolver import fetch_catalog_index, resolve_subject_credit, is_audit_course

SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_ANON_KEY')

client = create_client(SUPABASE_URL, SUPABASE_KEY)
index = fetch_catalog_index(client)
print(f"Python Scraper: Fetched {len(index)} catalog index keys.")

test_cases = [
    ('2022', 'CS', 2, 'BPLCK205B', 3),
    ('2022', 'CS', 2, 'BKBKK207', 1),
    ('2022', 'AI', 5, 'BCI586', 2),
    ('2022', 'AI', 6, 'BCO601', 4),
    ('2022', 'AI', 6, 'BCS602', 4),
    ('2022', 'AI', 6, 'BCI685', 2),
    ('2022', 'AI', 6, 'BCSL606', 1),
    ('2022', 'DS', 4, 'BDSL456C', 1),
    ('2022', 'CV', 3, 'BCVL305', 1),
    ('2022', 'CV', 4, 'BCVL456A', 1),
    ('2022', 'CV', 5, 'BCVL504', 1),
    ('2022', 'CV', 6, 'BCVL657A', 1),
    ('2022', 'CV', 6, 'BEE654B', 3),
    ('2022', 'CS', 1, 'BPHYS102', 4),
    ('2022', 'CS', 3, 'BCS301', 4),
]

all_passed = True
for scheme, branch, sem, code, expected_cr in test_cases:
    cr, src = resolve_subject_credit(index, scheme, branch, sem, code)
    passed = (cr == expected_cr)
    if not passed:
        all_passed = False
    print(f"{scheme} | {branch} | Sem {sem} | {code:<10} -> resolved: {cr} ({src}) [expected: {expected_cr}] -> {'PASS' if passed else 'FAIL'}")

print("\nPython scraper credit resolution verification:", "ALL PASSED!" if all_passed else "SOME FAILED!")
