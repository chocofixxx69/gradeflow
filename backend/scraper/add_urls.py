import os
from dotenv import load_dotenv
from supabase import create_client

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")
supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

urls_to_add = [
    ("Dec 25/Jan 26 Regular", "https://results.vtu.ac.in/D25J26Ecbcs/index.php"),
    ("Jun/Jul 25 Regular", "https://results.vtu.ac.in/JJEcbcs25/index.php"),
    ("Jun/Jul 25 Reval", "https://results.vtu.ac.in/JJRVcbcs25/index.php"),
    ("Jun/Jul 25 MakeUp", "https://results.vtu.ac.in/MakeUpEcbcs25/index.php"),
    ("Jun/Jul 25 Summer", "https://results.vtu.ac.in/SEcbcs25/index.php"),
    ("Jun/Jul 25 Summer Reval", "https://results.vtu.ac.in/SERVcbcs25/index.php"),
    ("Dec 24/Jan 25 Regular", "https://results.vtu.ac.in/DJcbcs25/index.php"),
    ("Dec 24/Jan 25 Reval", "https://results.vtu.ac.in/DJRVcbcs25/index.php"),
    ("Jun/Jul 24 Makeup", "https://results.vtu.ac.in/MakeUpEcbcs24/index.php"),
    ("Jun/Jul 24 Regular", "https://results.vtu.ac.in/JJEcbcs24/index.php"),
    ("Jun/Jul 24 Reval", "https://results.vtu.ac.in/JJRVcbcs24/index.php"),
    ("Dec 23/Jan 24 Regular", "https://results.vtu.ac.in/DJcbcs24/index.php"),
    ("Dec 23/Jan 24 Reval", "https://results.vtu.ac.in/DJRVcbcs24/index.php"),
    ("Jun/Jul 23 Regular", "https://results.vtu.ac.in/JJEcbcs23/index.php"),
    ("Jun/Jul 23 Reval", "https://results.vtu.ac.in/JJRVcbcs23/index.php"),
    ("Jun/Jul 23 Makeup", "https://results.vtu.ac.in/MakeUpEcbcs23/index.php"),
    ("Dec 22/Jan 23 Regular", "https://results.vtu.ac.in/JFEcbcs23/index.php"),
    ("Dec 22/Jan 23 Reval", "https://results.vtu.ac.in/JFRVcbcs23/index.php")
]

# Fetch existing by URL
try:
    existing = supabase.table("vtu_result_urls").select("url").execute()
    existing_urls = [r["url"] for r in existing.data] if existing.data else []
except Exception as e:
    print("Table might not exist:", e)
    # create table?
    existing_urls = []

print(f"Existing in DB: {len(existing_urls)}")

records_to_insert = []
for title, url in urls_to_add:
    if url not in existing_urls:
        records_to_insert.append({
            "title": title,
            "url": url,
            "is_active": True
        })

if records_to_insert:
    try:
        supabase.table("vtu_result_urls").insert(records_to_insert).execute()
        print(f"Inserted {len(records_to_insert)} new URLs into DB.")
    except Exception as e:
        print(f"Failed to insert URLs. Ensure 'vtu_result_urls' has 'title', 'url', 'is_active'. Err: {e}")
        # Let's see what columns exist
        print("Creating table via RPC or manual insert may be needed.")
else:
    print("All URLs are already present in DB.")
