import os
import sys
from dotenv import load_dotenv
from supabase import create_client, Client

# Load environment variables from current directory, parent directory, and .env.local
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env.local"))

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_ANON_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# ── VTU Result URLs ──
FALLBACK_URLS = []

def get_vtu_urls(faculty_id=None, scheme=None):
    """Return portal URLs in ascending chronological order (oldest exam first).

    `scheme` picks which canonical BE-only table to read when no faculty
    override applies ('2022' -> vtu_urls_2022_scheme, '2025' ->
    vtu_urls_2025_scheme, anything else/None -> union of both, since a
    portal serves any BE USN regardless of admission-year scheme).
    """
    try:
        if faculty_id:
            # Check if this faculty has been seeded in the system
            check = supabase.table("faculty_vtu_urls").select("id").eq("faculty_id", faculty_id).limit(1).execute()
            if check.data is not None and len(check.data) > 0:
                # Faculty is in the system — STRICTLY respect their active URLs.
                # If they disabled everything, return [] so the scraper skips — do NOT fall through.
                resp = supabase.table("faculty_vtu_urls")\
                    .select("url")\
                    .eq("faculty_id", faculty_id)\
                    .eq("is_active", True)\
                    .order("sort_order", desc=False)\
                    .execute()
                return [r["url"] for r in resp.data]
            # Faculty not seeded yet — fall through to global scheme tables below

        tables = {
            "2022": ["vtu_urls_2022_scheme"],
            "2025": ["vtu_urls_2025_scheme"],
        }.get(scheme, ["vtu_urls_2022_scheme", "vtu_urls_2025_scheme"])

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
    # Last resort: hardcoded list (only when DB is completely unreachable)
    return FALLBACK_URLS
