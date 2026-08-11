import sys
import os
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.getcwd()), '.env.local'))

from scraper.config import supabase

resp = supabase.table('scraper_jobs').select('*').in_('status', ['running', 'queued']).execute()
for job in resp.data:
    print(f"{job['id'][:8]} | {job['status']} | {job['usn']} | {job['error']}")

