import os
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1. Find invalid credits
res = supabase.table("subject_catalog").select("*").execute().data or []
for r in res:
    cr = r.get("credits")
    if cr is None or not isinstance(cr, int) or cr < 1 or cr > 24:
        print("Invalid credit row:", r)
        # fix it if obvious
        if r.get("subject_code") == "1BCS601" or "PROJECT" in (r.get("subject_name") or "").upper():
            supabase.table("subject_catalog").update({"credits": 4}).eq("id", r["id"]).execute()
            print("Fixed credit to 4.")
        elif cr == 0:
            supabase.table("subject_catalog").update({"credits": 1}).eq("id", r["id"]).execute()
            print("Fixed 0 credit to 1.")

# 2. Replicate 2025 Template courses for CV, EE, ME, RI Sem 6, 7, 8
# Find 2025 CS template courses for sem 6, 7, 8
cs_template_courses = [r for r in res if r.get("scheme") == "2025" and r.get("branch") == "CS" and r.get("semester") in [6, 7, 8]]
print(f"Found {len(cs_template_courses)} CS 2025 courses for Sem 6, 7, 8.")

branches_to_fill = ["CV", "EE", "ME", "RI"]
new_rows = []
for br in branches_to_fill:
    for crs in cs_template_courses:
        # replace CS with branch code in subject_code if present
        code = crs["subject_code"].replace("BCS", f"B{br}").replace("CS", br)
        name = crs["subject_name"]
        new_rows.append({
            "scheme": "2025",
            "branch": br,
            "semester": crs["semester"],
            "subject_code": code,
            "subject_name": name,
            "credits": crs["credits"]
        })

print(f"Adding {len(new_rows)} rows for CV, EE, ME, RI Sem 6-8.")
for i in range(0, len(new_rows), 100):
    batch = new_rows[i:i + 100]
    supabase.table("subject_catalog").upsert(batch).execute()

print("[SUCCESS] Filled missing slots.")
