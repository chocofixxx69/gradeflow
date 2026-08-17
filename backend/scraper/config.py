import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

env_path = os.path.join(os.path.dirname(__file__), ".env")
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── VTU Result URLs ──
FALLBACK_URLS = [
    "https://results.vtu.ac.in/indexD5J6.php",          # Dec 25/Jan 26 Regular (NEP)
    "https://results.vtu.ac.in/indexJJ25.php",          # Jun/Jul 25 Regular (NEP)
    "https://results.vtu.ac.in/indexD4J5.php",          # Dec 24/Jan 25 Regular (NEP)
    "https://results.vtu.ac.in/indexJJ24.php",          # Jun/Jul 24 Regular (NEP)
    "https://results.vtu.ac.in/indexD3J4.php",          # Dec 23/Jan 24 Regular (NEP)
    "https://results.vtu.ac.in/MAKEUPEcbcS25/index.php",# Makeup 25
    "https://results.vtu.ac.in/D25J26Ecbcs/index.php",  # Dec 25/Jan 26 Regular
    "https://results.vtu.ac.in/JJEcbcs25/index.php",    # Jun/Jul 25 Regular
    "https://results.vtu.ac.in/JJRVcbcs25/index.php",   # Jun/Jul 25 Reval
    "https://results.vtu.ac.in/MakeUpEcbcs25/index.php",# Jun/Jul 25 MakeUp
    "https://results.vtu.ac.in/SEcbcs25/index.php",     # Jun/Jul 25 Summer
    "https://results.vtu.ac.in/SERVcbcs25/index.php",   # Jun/Jul 25 Summer Reval
    "https://results.vtu.ac.in/DJcbcs25/index.php",     # Dec 24/Jan 25 Regular
    "https://results.vtu.ac.in/DJRVcbcs25/index.php",   # Dec 24/Jan 25 Reval
    "https://results.vtu.ac.in/MakeUpEcbcs24/index.php",# Jun/Jul 24 Makeup
    "https://results.vtu.ac.in/JJEcbcs24/index.php",    # Jun/Jul 24 Regular
    "https://results.vtu.ac.in/JJRVcbcs24/index.php",   # Jun/Jul 24 Reval
    "https://results.vtu.ac.in/DJcbcs24/index.php",     # Dec 23/Jan 24 Regular
    "https://results.vtu.ac.in/DJRVcbcs24/index.php",   # Dec 23/Jan 24 Reval
    "https://results.vtu.ac.in/JJEcbcs23/index.php",    # Jun/Jul 23 Regular
    "https://results.vtu.ac.in/JJRVcbcs23/index.php",   # Jun/Jul 23 Reval
    "https://results.vtu.ac.in/MakeUpEcbcs23/index.php",# Jun/Jul 23 Makeup
    "https://results.vtu.ac.in/JFEcbcs23/index.php",    # Dec 22/Jan 23 Regular
    "https://results.vtu.ac.in/JFRVcbcs23/index.php",   # Dec 22/Jan 23 Reval
    "https://results.vtu.ac.in/indexCDOE.php",          # VTU Online Degree Programs Provisional Results
    "https://results.vtu.ac.in/indexMJ26.php",          # May/June-2026 Examination
    "https://results.vtu.ac.in/indexSUMU25.php",        # Summer Semester Examination-2025
    "https://results.vtu.ac.in/indexSJSEJJ25.php",      # Silver Jubilee July 2025 Examination
    "https://results.vtu.ac.in/NDPhDRV24/index.php",    # Ph.D./M.S(Research) Course-Work Reval Nov/Dec-2024
    "https://results.vtu.ac.in/SplJcbcs25/index.php",   # January-2025 Special Examination
    "https://results.vtu.ac.in/JanSplRVEnoncbcs24/index.php", # Jan-2024 Special Exam [B.E] Revaluation
    "https://results.vtu.ac.in/JanSplEnoncbcs24/index.php",   # January-2024 Special Exam [B.E & PG]
]

def get_vtu_urls(faculty_id=None):
    try:
        if faculty_id:
            # Check if this faculty has been seeded in the system
            check = supabase.table("faculty_vtu_urls").select("id").eq("faculty_id", faculty_id).limit(1).execute()
            if check.data is not None and len(check.data) > 0:
                # Faculty is in the system — STRICTLY respect their active URLs.
                # If they disabled everything, return [] so the scraper skips — do NOT fall through.
                resp = supabase.table("faculty_vtu_urls").select("url").eq("faculty_id", faculty_id).eq("is_active", True).execute()
                return [r["url"] for r in resp.data]
            # Faculty not seeded yet — fall through to global table below

        # No faculty_id given, or faculty not seeded — use the global vtu_result_urls table
        resp = supabase.table("vtu_result_urls")\
            .select("url")\
            .eq("is_active", True)\
            .execute()
        if resp.data and len(resp.data) > 0:
            return [r["url"] for r in resp.data]
    except Exception as e:
        print(f"[config] get_vtu_urls error: {e}", file=sys.stderr)
    # Last resort: hardcoded list (only when DB is completely unreachable)
    return FALLBACK_URLS
