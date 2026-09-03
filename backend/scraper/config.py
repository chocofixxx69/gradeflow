import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from current directory, parent directory, and .env.local
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY") or os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── VTU Result URLs ──
FALLBACK_2022_URLS = [
    "https://results.vtu.ac.in/D25J26RVcbcs/index.php",       # Dec 25/Jan 26 Revaluation
    "https://results.vtu.ac.in/MJ26rvcbcs/index.php",         # May/June 2026 Revaluation
    "https://results.vtu.ac.in/MJ26cbcs/index.php",           # May/June 2026 Regular
    "https://results.vtu.ac.in/D25J26Ecbcs/index.php",        # Dec 25/Jan 26 Regular
    "https://results.vtu.ac.in/JJEcbcs25/index.php",          # Jun/Jul 25 Regular
    "https://results.vtu.ac.in/JJRVcbcs25/index.php",         # Jun/Jul 25 Reval
    "https://results.vtu.ac.in/MakeUpEcbcs25/index.php",      # Jun/Jul 25 MakeUp
    "https://results.vtu.ac.in/SEcbcs25/index.php",           # Jun/Jul 25 Summer
    "https://results.vtu.ac.in/SERVcbcs25/index.php",         # Jun/Jul 25 Summer Reval
    "https://results.vtu.ac.in/DJcbcs25/index.php",           # Dec 24/Jan 25 Regular
    "https://results.vtu.ac.in/DJRVcbcs25/index.php",         # Dec 24/Jan 25 Reval
    "https://results.vtu.ac.in/MakeUpEcbcs24/index.php",      # Jun/Jul 24 Makeup
    "https://results.vtu.ac.in/JJEcbcs24/index.php",          # Jun/Jul 24 Regular
    "https://results.vtu.ac.in/JJRVcbcs24/index.php",         # Jun/Jul 24 Reval
    "https://results.vtu.ac.in/DJcbcs24/index.php",           # Dec 23/Jan 24 Regular
    "https://results.vtu.ac.in/DJRVcbcs24/index.php",         # Dec 23/Jan 24 Reval
    "https://results.vtu.ac.in/JJEcbcs23/index.php",          # Jun/Jul 23 Regular
    "https://results.vtu.ac.in/JJRVcbcs23/index.php",         # Jun/Jul 23 Reval
    "https://results.vtu.ac.in/MakeUpEcbcs23/index.php",      # Jun/Jul 23 Makeup
    "https://results.vtu.ac.in/JFEcbcs23/index.php",          # Dec 22/Jan 23 Regular
    "https://results.vtu.ac.in/JFRVcbcs23/index.php",         # Dec 22/Jan 23 Reval
    "https://results.vtu.ac.in/indexD5J6.php",                # Dec 25/Jan 26 Regular (NEP)
    "https://results.vtu.ac.in/indexJJ25.php",                # Jun/Jul 25 Regular (NEP)
    "https://results.vtu.ac.in/indexD4J5.php",                # Dec 24/Jan 25 Regular (NEP)
    "https://results.vtu.ac.in/indexJJ24.php",                # Jun/Jul 24 Regular (NEP)
    "https://results.vtu.ac.in/indexD3J4.php",                # Dec 23/Jan 24 Regular (NEP)
]

FALLBACK_2025_URLS = [
    "https://results.vtu.ac.in/MJ26cbcs/index.php",           # May/June 2026 Regular (Sem 2)
    "https://results.vtu.ac.in/D25J26Ecbcs/index.php",        # Dec 25/Jan 26 Regular (Sem 1)
    "https://results.vtu.ac.in/MJ26rvcbcs/index.php",         # May/June 2026 Revaluation
    "https://results.vtu.ac.in/D25J26RVcbcs/index.php",       # Dec 25/Jan 26 Revaluation
    "https://results.vtu.ac.in/JJEcbcs25/index.php",          # Jun/Jul 25 Regular
    "https://results.vtu.ac.in/JJRVcbcs25/index.php",         # Jun/Jul 25 Reval
    "https://results.vtu.ac.in/DJcbcs25/index.php",           # Dec 24/Jan 25 Regular
    "https://results.vtu.ac.in/DJRVcbcs25/index.php",         # Dec 24/Jan 25 Reval
]

FALLBACK_URLS = FALLBACK_2022_URLS

def get_vtu_urls(faculty_id=None, scheme=None):
    """Return portal URLs in ascending chronological order (oldest exam first).

    `scheme` strictly determines which scheme's portals to query ('2022' or '2025').
    If faculty_id is provided, their configured URLs for THAT specific scheme are loaded.
    If none configured for that scheme or faculty_id is None, falls back to the canonical scheme table.
    """
    try:
        scheme_str = str(scheme).strip() if scheme else None
        if faculty_id:
            # Check if this faculty has active URLs for this specific scheme
            query = supabase.table("faculty_vtu_urls")\
                .select("url")\
                .eq("faculty_id", faculty_id)\
                .eq("is_active", True)
            
            if scheme_str:
                query = query.eq("scheme", scheme_str)
            
            resp = query.order("sort_order", desc=False).execute()
            if resp.data is not None and len(resp.data) > 0:
                return [r["url"] for r in resp.data]
            
            # If faculty explicitly configured this scheme and turned all URLs OFF, respect that and return []!
            all_for_scheme = supabase.table("faculty_vtu_urls")\
                .select("id")\
                .eq("faculty_id", faculty_id)
            if scheme_str:
                all_for_scheme = all_for_scheme.eq("scheme", scheme_str)
            check_exist = all_for_scheme.limit(1).execute()
            if check_exist.data and len(check_exist.data) > 0:
                return []
            # Faculty not seeded for this scheme yet — fall through to global scheme tables below

        tables = {
            "2022": ["vtu_urls_2022_scheme"],
            "2025": ["vtu_urls_2025_scheme"],
        }.get(scheme_str, ["vtu_urls_2022_scheme"] if scheme_str == "2022" else (["vtu_urls_2025_scheme"] if scheme_str == "2025" else ["vtu_urls_2022_scheme", "vtu_urls_2025_scheme"]))

        urls, seen = [], set()
        for table in tables:
            resp = supabase.table(table)\
                .select("url")\
                .eq("is_active", True)\
                .order("sort_order", desc=False)\
                .execute()
            for r in (resp.data or []):
                if r["url"] not in seen:
                    seen.add(r["url"])
                    urls.append(r["url"])
        if urls:
            return urls
    except Exception as e:
        print(f"[config] get_vtu_urls error: {e}", file=sys.stderr)

    # Last resort fallback:
    if scheme_str == "2025":
        return FALLBACK_2025_URLS
    return FALLBACK_2022_URLS
