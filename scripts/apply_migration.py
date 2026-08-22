import os
import sys
import json
import re
import urllib.request
from dotenv import load_dotenv

load_dotenv(override=True)
load_dotenv('.env.local', override=True)

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_ACCESS_TOKEN = os.getenv("SUPABASE_ACCESS_TOKEN")

if len(sys.argv) < 2:
    print("Usage: python scripts/apply_migration.py <path-to-sql-file>")
    sys.exit(1)

migration_path = sys.argv[1]
with open(migration_path, "r", encoding="utf-8") as f:
    sql = f.read()

if not SUPABASE_URL or not SUPABASE_ACCESS_TOKEN:
    print("Error: SUPABASE_URL and SUPABASE_ACCESS_TOKEN must be set in .env/.env.local")
    sys.exit(1)

m = re.search(r"https://([a-z0-9]+)\.supabase\.co", SUPABASE_URL)
if not m:
    print(f"Error: could not parse project ref from SUPABASE_URL={SUPABASE_URL}")
    sys.exit(1)
project_ref = m.group(1)

headers = {
    'Authorization': f'Bearer {SUPABASE_ACCESS_TOKEN}',
    'User-Agent': 'SupabaseCLI/1.100.0',
    'Content-Type': 'application/json'
}

print(f"Applying {migration_path} to project {project_ref}...")
req = urllib.request.Request(
    f'https://api.supabase.com/v1/projects/{project_ref}/database/query',
    data=json.dumps({'query': sql}).encode(),
    headers=headers
)

try:
    with urllib.request.urlopen(req) as resp:
        print('Migration applied successfully. Status:', resp.status)
        print('Result:', resp.read().decode())
except Exception as e:
    print('Migration failed:', e)
    if hasattr(e, 'read'):
        print('Error body:', e.read().decode())
    sys.exit(1)
