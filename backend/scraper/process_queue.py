"""
process_queue.py — GitHub Actions Job Processor

Picks up 'queued' scraper_jobs from Supabase, runs the scraper, and
updates the job status. Designed to run in CI (GitHub Actions) with
a single pass — not a polling loop.

Usage:
    python -m scraper.process_queue              # Process all queued jobs
    python -m scraper.process_queue --limit 5    # Process max 5 jobs
"""

import os
import sys
import time

# Fix import path for standalone execution
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
if PARENT_DIR not in sys.path:
    sys.path.insert(0, PARENT_DIR)

from scraper.config import supabase
from scraper.engine import scrape_all_semesters


def process_queued_jobs(limit: int = 10, quiet: bool = False):
    """
    Single-pass processor: fetch all queued jobs, run each one, update status.
    Returns the number of jobs processed.
    """
    # Fetch queued jobs, oldest first
    try:
        resp = supabase.table("scraper_jobs") \
            .select("*") \
            .eq("status", "queued") \
            .order("created_at") \
            .limit(limit) \
            .execute()
    except Exception as e:
        if not quiet:
            print(f"  ❌ Could not fetch jobs from Supabase: {e}")
        return 0

    jobs = resp.data or []
    if not jobs:
        if not quiet:
            print("=" * 60)
            print("  GradeFlow Queue Processor — Starting")
            print("=" * 60)
            print("  ✓ No queued jobs. Exiting.")
        return 0

    print("=" * 60)
    print("  GradeFlow Queue Processor — Starting")
    print("=" * 60)
    print(f"  Found {len(jobs)} queued job(s).\n")
    processed = 0

    for job in jobs:
        usn = job["usn"]
        job_id = job["id"]
        faculty_id = job.get("faculty_id")
        
        print(f"\n{'─' * 50}")
        print(f"  Processing: {usn} (Job {job_id[:8]}...)")
        print(f"{'─' * 50}")

        # Mark as running
        supabase.table("scraper_jobs").update({
            "status": "running",
            "started_at": "now()"
        }).eq("id", job_id).execute()

        try:
            success = scrape_all_semesters(usn, faculty_id=faculty_id)

            final_status = "finished" if success else "no_result"
            supabase.table("scraper_jobs").update({
                "status": final_status,
                "finished_at": "now()"
            }).eq("id", job_id).execute()

            icon = "✅" if success else "⚠"
            print(f"\n  {icon} Job {job_id[:8]}... → {final_status}")
            processed += 1

        except ConnectionError as e:
            supabase.table("scraper_jobs").update({
                "status": "error",
                "error": f"VTU servers unreachable: {str(e)}",
                "finished_at": "now()"
            }).eq("id", job_id).execute()
            print(f"\n  ❌ Connection error: {e}")
            processed += 1

        except Exception as e:
            supabase.table("scraper_jobs").update({
                "status": "error",
                "error": str(e)[:500],
                "finished_at": "now()"
            }).eq("id", job_id).execute()
            print(f"\n  ❌ Error: {e}")
            processed += 1

        # Small delay between jobs
        if processed < len(jobs):
            time.sleep(2)

    print(f"\n{'=' * 60}")
    print(f"  ✓ Processed {processed}/{len(jobs)} jobs.")
    print(f"{'=' * 60}")
    return processed


if __name__ == "__main__":
    limit = 10
    quiet = "--quiet" in sys.argv
    if "--limit" in sys.argv:
        idx = sys.argv.index("--limit")
        if idx + 1 < len(sys.argv):
            limit = int(sys.argv[idx + 1])

    count = process_queued_jobs(limit=limit, quiet=quiet)
    sys.exit(0)
