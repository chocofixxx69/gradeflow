import os
import json
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Error: Missing Supabase credentials.")
    exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

with open("vtu_official_catalog.json", "r", encoding="utf-8") as f:
    official_catalog = json.load(f)

print(f"Loaded {len(official_catalog)} official curriculum records.")

# Target branches and schemes only
TARGET_BRANCHES = {"AI", "CS", "CV", "DS", "EC", "EE", "ME", "RI"}
TARGET_SCHEMES = {"2022", "2025"}

filtered_catalog = [
    c for c in official_catalog
    if c["scheme"] in TARGET_SCHEMES and c["branch"] in TARGET_BRANCHES and 1 <= int(c["semester"]) <= 8
]
print(f"Filtered catalog for target branches/schemes: {len(filtered_catalog)} subjects.")

# Let's inspect existing subject_catalog rows
existing = supabase.table("subject_catalog").select("id, scheme, branch, semester, subject_code").execute().data or []
existing_keys = {
    (e["scheme"], e["branch"], int(e["semester"]), e["subject_code"].upper().strip()): e["id"]
    for e in existing
}
print(f"Found {len(existing_keys)} existing subject_catalog keys.")

# Prepare upsert batches (standard columns: scheme, branch, semester, subject_code, subject_name, credits)
batch_size = 100
records_to_insert = []
records_to_update = []

for c in filtered_catalog:
    k = (c["scheme"], c["branch"], int(c["semester"]), c["subject_code"].upper().strip())
    row_data = {
        "scheme": c["scheme"],
        "branch": c["branch"],
        "semester": int(c["semester"]),
        "subject_code": c["subject_code"].upper().strip(),
        "subject_name": c["subject_name"].strip(),
        "credits": int(c["credits"])
    }
    if k in existing_keys:
        row_data["id"] = existing_keys[k]
        records_to_update.append(row_data)
    else:
        records_to_insert.append(row_data)

print(f"To Update: {len(records_to_update)} | To Insert: {len(records_to_insert)}")

# 1. Execute inserts
for i in range(0, len(records_to_insert), batch_size):
    batch = records_to_insert[i:i + batch_size]
    res = supabase.table("subject_catalog").insert(batch).execute()
    print(f"  Inserted batch {i // batch_size + 1} ({len(batch)} rows)")

# 2. Execute updates
for i in range(0, len(records_to_update), batch_size):
    batch = records_to_update[i:i + batch_size]
    res = supabase.table("subject_catalog").upsert(batch).execute()
    print(f"  Upserted batch {i // batch_size + 1} ({len(batch)} rows)")

# Verify total in subject_catalog
total_count = supabase.table("subject_catalog").select("id", count="exact").execute().count
print(f"\n[SUCCESS] Total rows in subject_catalog after sync: {total_count}")
