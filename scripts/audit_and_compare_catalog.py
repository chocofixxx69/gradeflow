import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

with open("vtu_official_catalog.json", "r", encoding="utf-8") as f:
    official_catalog = json.load(f)

print(f"Loaded {len(official_catalog)} official curriculum records.")

# 1. Group by scheme, branch, sem
counts = {}
for c in official_catalog:
    key = (c["scheme"], c["branch"], c["semester"])
    counts[key] = counts.get(key, 0) + 1

print("\n=== OFFICIAL CURRICULUM SUBJECT COUNTS ===")
for k in sorted(counts.keys()):
    print(f"  Scheme {k[0]} | Branch {k[1]:2s} | Sem {k[2]}: {counts[k]} subjects")

# 2. Fetch existing subject_catalog from Supabase
existing_cat = supabase.table("subject_catalog").select("*").execute().data or []
print(f"\nExisting Supabase subject_catalog: {len(existing_cat)} rows")

existing_map = {}
for e in existing_cat:
    k = (e.get("scheme"), e.get("branch"), e.get("semester"), (e.get("subject_code") or "").upper().strip())
    existing_map[k] = e

# 3. Compare credits between existing subject_catalog and official VTU curriculum
credit_mismatches = []
missing_in_existing = []
official_map = {}

for c in official_catalog:
    k = (c["scheme"], c["branch"], c["semester"], c["subject_code"].upper().strip())
    official_map[k] = c
    if k in existing_map:
        ex_cr = existing_map[k].get("credits")
        if ex_cr != c["credits"]:
            credit_mismatches.append({
                "key": k,
                "name": c["subject_name"],
                "existing_credits": ex_cr,
                "official_credits": c["credits"]
            })
    else:
        missing_in_existing.append(c)

print(f"\nCredit Mismatches between Supabase subject_catalog and Official VTU: {len(credit_mismatches)}")
for m in credit_mismatches[:15]:
    print(f"  {m['key']}: Existing={m['existing_credits']} vs Official={m['official_credits']} ({m['name']})")

print(f"\nOfficial subjects missing in Supabase subject_catalog: {len(missing_in_existing)}")

# 4. Check subject_marks in Supabase: do they map to official subjects?
page_size = 1000
from_idx = 0
all_marks = []
while True:
    res = supabase.table("subject_marks").select("subject_code, subject_name, semester, credits, usn").range(from_idx, from_idx + page_size - 1).execute()
    rows = res.data or []
    all_marks.extend(rows)
    if len(rows) < page_size:
        break
    from_idx += page_size

print(f"\nLoaded {len(all_marks)} production subject_marks records.")
marks_distinct = {}
for m in all_marks:
    code = (m.get("subject_code") or "").upper().strip()
    sem = m.get("semester")
    cr = m.get("credits")
    name = m.get("subject_name")
    if code:
        marks_distinct.setdefault((sem, code), {"names": set(), "credits": set(), "count": 0})
        marks_distinct[(sem, code)]["names"].add(name)
        marks_distinct[(sem, code)]["credits"].add(cr)
        marks_distinct[(sem, code)]["count"] += 1

print(f"Total distinct (semester, subject_code) pairs in student results: {len(marks_distinct)}")

# Check against official catalog
unmapped_marks = []
marks_credit_diff = []
for (sem, code), data in marks_distinct.items():
    # check if in official catalog for scheme 2022
    found_official = [c for c in official_catalog if c["scheme"] == "2022" and c["subject_code"] == code]
    if not found_official:
        # also check without stream letter or variants
        unmapped_marks.append({"sem": sem, "code": code, "data": data})
    else:
        # check credits
        off_cr = found_official[0]["credits"]
        for cr in data["credits"]:
            if cr is not None and cr != off_cr:
                marks_credit_diff.append({
                    "sem": sem, "code": code, "marks_cr": cr, "official_cr": off_cr, "official": found_official[0]
                })

print(f"Result marks with credit mismatch against official VTU: {len(marks_credit_diff)}")
for md in marks_credit_diff[:10]:
    print(f"  Sem {md['sem']} | {md['code']}: Result has {md['marks_cr']} cr vs Official VTU {md['official_cr']} cr ({md['official']['subject_name']})")

print(f"Result marks subject codes unmapped in official catalog: {len(unmapped_marks)}")
for um in unmapped_marks[:15]:
    print(f"  Sem {um['sem']} | {um['code']}: {list(um['data']['names'])[:1]} ({um['data']['count']} occurrences)")
