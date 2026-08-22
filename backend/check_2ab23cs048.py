import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "scraper", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

res = supabase.table("subject_marks").select("*").ilike("usn", "2AB23CS048").execute()
rows = res.data or []

print(f"Total subject_marks rows for 2AB23CS048: {len(rows)}")
for r in sorted(rows, key=lambda x: (x.get("semester") or 0, x.get("subject_code") or "")):
    print(f"Sem {r.get('semester')} | Code: {r.get('subject_code'):<12} | Int: {r.get('internal')} | Ext: {r.get('external')} | Tot: {r.get('total')} | Grade: '{r.get('grade')}' | Result: '{r.get('result')}' | is_backlog: {r.get('is_backlog')}")
