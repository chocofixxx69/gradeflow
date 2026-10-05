"""
run_batch.py — High-Performance VTU Mass Batch Scraper & Revaluation Synchronizer.

Features:
1. Multi-Targeting: Scrape all students (--all), specific batch (--batch 2025),
   specific scheme (--scheme 2025/2022), branch (--branch AI), or USN list.
2. Hardware Acceleration: Automatically detects and utilizes NVIDIA GeForce RTX 4060 GPU
   via PyTorch CUDA for parallel fast-path OCR and multi-tab browser bursts.
3. Complete Revaluation & Re-exam Tracking:
   - Full attempt history saved to 'subject_mark_attempts'.
   - Official best/canonical marks safely updated in 'subject_marks'.
   - Semester audit summaries saved in 'results'.
   - SGPAs and backlogs recalculated in 'academic_remarks'.
4. Dual Storage ("Double Store"):
   - Primary: Live relational storage across 4 tables in Supabase.
   - Secondary: Immutable JSONL raw audit archive in data/scraped_archive/.
5. Checkpoint & Resume: Tracks progress and supports resuming interrupted runs.

Usage:
  # Run all students using RTX GPU:
  python -m backend.scraper.run_batch --all

  # Run Batch 2025 only:
  python -m backend.scraper.run_batch --batch 2025

  # Run specific branch with concurrency 8:
  python -m backend.scraper.run_batch --batch 2025 --branch AI --concurrency 8

  # Run specific USN list:
  python -m backend.scraper.run_batch --usns 2AB25CI089,2AB25CI067,2AB25CI068
"""

import os
import sys
import json
import time
import argparse
from datetime import datetime
from collections import defaultdict

# Force UTF-8 on Windows stdout/stderr
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

# Setup paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(os.path.dirname(BASE_DIR))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from backend.scraper.config import supabase
from backend.scraper.engine import scrape_all_semesters

ARCHIVE_DIR = os.path.join(PROJECT_ROOT, "data", "scraped_archive")
CHECKPOINT_FILE = os.path.join(PROJECT_ROOT, "scratch", ".scraper_checkpoint.json")


def setup_gpu():
    """Detect and configure CUDA GPU if available."""
    try:
        import torch
        if torch.cuda.is_available():
            device_name = torch.cuda.get_device_name(0)
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            print(f"[GPU] CUDA Acceleration ACTIVE: {device_name} ({vram_gb:.1f} GB VRAM)")
            torch.backends.cudnn.benchmark = True
            return True, device_name, vram_gb
    except Exception as e:
        print(f"[GPU] Notice: CUDA check encountered {e}")
    print("[GPU] Running in Multi-Core CPU mode.")
    return False, "CPU", 0.0


def load_checkpoint():
    """Load list of already processed USNs for resuming."""
    if os.path.exists(CHECKPOINT_FILE):
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return set(data.get("completed_usns", []))
        except Exception:
            pass
    return set()


def save_checkpoint(completed_usns):
    """Save processed USNs checkpoint."""
    try:
        os.makedirs(os.path.dirname(CHECKPOINT_FILE), exist_ok=True)
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "updated_at": datetime.now().isoformat(),
                "completed_usns": list(completed_usns)
            }, f, indent=2)
    except Exception as e:
        print(f"[WARN] Failed to save checkpoint: {e}", file=sys.stderr)


def archive_student_record(usn, archive_file):
    """Secondary Storage: Dump student's latest DB snapshot into JSONL archive."""
    try:
        stud = supabase.table("students").select("*").eq("usn", usn).execute().data
        marks = supabase.table("subject_marks").select("*").eq("usn", usn).execute().data
        attempts = supabase.table("subject_mark_attempts").select("*").eq("usn", usn).execute().data
        results = supabase.table("results").select("*").eq("usn", usn).execute().data
        remarks = supabase.table("academic_remarks").select("*").eq("student_usn", usn).execute().data

        record = {
            "timestamp": datetime.now().isoformat(),
            "usn": usn,
            "profile": stud[0] if stud else {},
            "subject_marks": marks or [],
            "subject_mark_attempts": attempts or [],
            "results": results or [],
            "academic_remarks": remarks or []
        }

        with open(archive_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(record) + "\n")
        return True
    except Exception as e:
        print(f"[ARCHIVE WARN] Failed to double-store record for {usn}: {e}", file=sys.stderr)
        return False


def fetch_target_students(args):
    """Query student list according to filter parameters."""
    query = supabase.table("students").select("usn, name, scheme, branch, semester")

    if args.usns:
        from backend.scraper.engine import deduce_scheme_from_usn
        raw_list = [u.strip().upper() for u in args.usns.split(",") if u.strip()]
        return [{"usn": u, "scheme": args.scheme or deduce_scheme_from_usn(u)} for u in raw_list]

    if args.scheme:
        query = query.eq("scheme", str(args.scheme))

    data = query.execute().data or []

    # Filter in memory for batch or branch if provided
    filtered = []
    for s in data:
        usn = (s.get("usn") or "").strip().upper()
        if not usn:
            continue

        # Batch filter (from USN format e.g. 2AB25... -> 2025)
        if args.batch:
            target_batch = str(args.batch).strip()
            # If batch is '2025', short year is '25'
            short_yr = target_batch[-2:]
            import re
            m = re.search(r'^[0-9][A-Z]{2}(\d{2})', usn)
            if not m or m.group(1) != short_yr:
                continue

        # Branch filter
        if args.branch:
            b_filter = str(args.branch).strip().upper()
            import re
            m = re.search(r'^[0-9][A-Z]{2}\d{2}([A-Z]{2,3})\d{3}$', usn)
            b_code = m.group(1).upper() if m else ""
            if b_filter not in (s.get("branch") or "").upper() and b_filter != b_code:
                continue

        filtered.append(s)

    if args.limit and args.limit > 0:
        filtered = filtered[:args.limit]

    return filtered


def main():
    parser = argparse.ArgumentParser(
        description="GradeFlow High-Performance VTU Mass Batch Scraper & Revaluation Synchronizer"
    )
    parser.add_argument("--all", action="store_true", help="Scrape all students in the database")
    parser.add_argument("--batch", type=str, default=None, help="Target specific batch year (e.g. 2025, 2024, 2023)")
    parser.add_argument("--scheme", type=str, default=None, help="Target specific scheme (2022, 2025, mba, mca)")
    parser.add_argument("--branch", type=str, default=None, help="Target specific branch code (e.g. AI, CS, EC)")
    parser.add_argument("--usns", type=str, default=None, help="Comma-separated list of specific USNs to scrape")
    parser.add_argument("--url", type=str, default=None, help="Target specific portal URL(s), comma-separated")
    parser.add_argument("--concurrency", type=int, default=None, help="Browser tab concurrency (default: 8 with GPU, 4 CPU)")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of students to process")
    parser.add_argument("--resume", action="store_true", default=True, help="Resume from last checkpoint (skips completed USNs)")
    parser.add_argument("--no-resume", dest="resume", action="store_false", help="Force scrape all matching students from scratch")

    args = parser.parse_args()

    if not (args.all or args.batch or args.scheme or args.branch or args.usns):
        print("Please specify a target: --all, --batch <year>, --scheme <scheme>, --branch <branch>, or --usns <list>")
        print("Example: python -m backend.scraper.run_batch --batch 2025")
        sys.exit(1)

    print("=" * 75)
    print("  GRADEFLOW MASS BATCH SCRAPER & REVALUATION SYNCHRONIZER")
    print("=" * 75)

    has_gpu, gpu_name, vram = setup_gpu()
    concurrency = args.concurrency or (8 if has_gpu else 4)
    print(f"[CONFIG] Tab Concurrency: {concurrency} parallel browser tabs")
    print(f"[CONFIG] Checkpoint Resuming: {'ENABLED' if args.resume else 'DISABLED'}")

    os.makedirs(ARCHIVE_DIR, exist_ok=True)
    archive_file = os.path.join(ARCHIVE_DIR, f"vtu_results_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl")
    print(f"[STORAGE] Double-Store Archive: {archive_file}")

    print("\n[DB] Querying target student records from database...")
    target_students = fetch_target_students(args)
    total_found = len(target_students)
    print(f"[DB] Found {total_found} student(s) matching criteria.")

    if total_found == 0:
        print("[DB] No students found. Exiting.")
        sys.exit(0)

    completed_usns = load_checkpoint() if args.resume else set()
    todo_students = [s for s in target_students if s["usn"] not in completed_usns]

    print(f"[QUEUE] Total to process: {len(todo_students)} (already completed: {total_found - len(todo_students)})")

    success_count = 0
    fail_count = 0
    start_time = time.time()

    for idx, s in enumerate(todo_students, 1):
        usn = s["usn"]
        scheme = s.get("scheme")
        name = s.get("name") or usn

        print(f"\n" + "-" * 75)
        print(f"[{idx}/{len(todo_students)}] Processing {usn} ({name}) | Scheme: {scheme or 'Auto'}")

        t0 = time.time()
        try:
            ok = scrape_all_semesters(
                usn=usn,
                scheme=scheme,
                target_url=args.url,
                concurrency=concurrency,
                default_name=name
            )

            elapsed = time.time() - t0
            if ok:
                success_count += 1
                print(f"[{usn}] [OK] Scrape & Revaluation Sync Succeeded ({elapsed:.2f}s)")
                # Secondary Storage: Write audit archive
                archive_student_record(usn, archive_file)
            else:
                fail_count += 1
                print(f"[{usn}] [INFO] No new marks or result not available ({elapsed:.2f}s)")

            completed_usns.add(usn)
            save_checkpoint(completed_usns)

        except KeyboardInterrupt:
            print("\n\n[INTERRUPT] Gracefully stopping batch run... Checkpoint saved.")
            print(f"[INTERRUPT] Resume anytime using: python -m backend.scraper.run_batch {' '.join(sys.argv[1:])}")
            sys.exit(0)
        except Exception as e:
            fail_count += 1
            print(f"[{usn}] [FAIL] Exception during scrape: {e}", file=sys.stderr)

    total_time = time.time() - start_time
    avg_speed = total_time / max(1, len(todo_students))

    print("\n" + "=" * 75)
    print("  BATCH RUN COMPLETE")
    print("=" * 75)
    print(f"  Total Processed : {len(todo_students)}")
    print(f"  Successful Sync : {success_count}")
    print(f"  No Result / Skip: {fail_count}")
    print(f"  Total Time Taken: {total_time / 60:.2f} minutes (avg {avg_speed:.2f}s per student)")
    print(f"  Dual Storage Log: {archive_file}")
    print("=" * 75)


if __name__ == "__main__":
    main()
