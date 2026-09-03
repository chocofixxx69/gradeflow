#!/usr/bin/env python
"""
Bulk VTU scraper – feed it many USNs and have each result saved to Supabase.

Usage (run from the *backend* folder, after activating the venv):

    # Pass USNs directly on the command line
    python bulk_scrape.py 2AB23CS013 2AB23CS014 2AB23CS015

    # Or read them from a file (one USN per line)
    python bulk_scrape.py -f usn_list.txt
"""

import argparse
import sys
import os
import json
import time
import re
import concurrent.futures

# Configure stdout and stderr for UTF-8 on Windows terminals
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Ensure Python can find the 'scraper' package
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper.engine import scrape_all_semesters  # type: ignore


def _scrape_worker(usn: str, scheme: str = None, tabs: int = None, delay: float = 0.0, default_name: str = None) -> dict:
    if delay > 0:
        time.sleep(delay)
    try:
        found = scrape_all_semesters(usn, scheme=scheme, burst=True, concurrency=tabs, default_name=default_name)
        return {
            "usn": usn,
            "status": "SUCCESS" if found else "NO DATA",
            "time": time.strftime("%H:%M:%S")
        }
    except Exception as exc:
        print(f"[ERROR] Unexpected failure for {usn}: {exc}", file=sys.stderr)
        return {
            "usn": usn,
            "status": "ERROR",
            "time": time.strftime("%H:%M:%S")
        }


def scrape_one(usn: str) -> None:
    """Run the engine for a single USN and print a short JSON summary."""
    print(f"\n=== Scraping {usn} ===", file=sys.stderr)
    found = scrape_all_semesters(usn, burst=True)
    status = "scraped & stored" if found else "no data found"
    result = {"usn": usn, "status": status}
    print(json.dumps(result, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape VTU results for many USNs in GPU+CPU Burst Mode."
    )
    parser.add_argument(
        "usns", nargs="*",
        help="One or more USNs to scrape (e.g. 2AB25CS021)."
    )
    parser.add_argument(
        "-f", "--file", dest="filename",
        help="Path to a text or CSV file containing USNs."
    )
    parser.add_argument(
        "--students", "-w", "--workers", dest="students", type=int, default=3,
        help="Number of students to scrape simultaneously in burst mode (default: 3 for peak throughput without server throttling)."
    )
    parser.add_argument(
        "--tabs", "-t", dest="tabs", type=int, default=1,
        help="Number of concurrent portal tabs per student (default: 1 in bulk mode to ensure ultra-stable multi-student concurrency)."
    )
    parser.add_argument(
        "-b", "--branch", dest="branch", type=str, default=None,
        help="Filter scraping strictly to a specific branch code (e.g. CS, CD, EC)."
    )
    parser.add_argument(
        "--skip-existing", dest="skip_existing", action="store_true", default=True,
        help="Skip USNs already saved in Supabase (default: True)."
    )
    parser.add_argument(
        "-s", "--scheme", dest="scheme", type=str, default=None,
        choices=["2022", "2025"],
        help="Target VTU curriculum scheme ('2022' or '2025'). Defaults to auto-detect."
    )
    parser.add_argument(
        "--force", dest="force", action="store_true",
        help="Force re-scraping all USNs even if already saved in Supabase."
    )
    args = parser.parse_args()

    usn_list = []
    name_map = {}

    if args.usns:
        usn_list.extend([u.strip().upper() for u in args.usns if u.strip()])

    if args.filename:
        try:
            import re
            import csv
            with open(args.filename, "r", encoding="utf-8-sig", errors="ignore") as f:
                content = f.read()

            # Attempt structured CSV parsing to associate USNs with student names
            try:
                reader = csv.DictReader(content.splitlines())
                for row in reader:
                    u = (row.get("USN") or row.get("usn") or "").strip().upper()
                    n = (row.get("Student Name") or row.get("student_name") or row.get("Name") or row.get("name") or "").strip()
                    if u and re.match(r'^[1-9][A-Za-z]{2}\d{2}[A-Za-z]{2}\d{3}$', u):
                        usn_list.append(u)
                        if n:
                            name_map[u] = n
            except Exception:
                pass

            # Fallback regex extraction if CSV format differed
            if not usn_list:
                usn_matches = re.findall(r'\b([1-9][A-Za-z]{2}\d{2}[A-Za-z]{2}\d{3})\b', content)
                if usn_matches:
                    usn_list.extend([u.upper() for u in usn_matches])
                else:
                    for line in content.splitlines():
                        cleaned = line.strip().replace(",", " ").replace('"', "").replace("'", "")
                        for token in cleaned.split():
                            if len(token) >= 7:
                                usn_list.append(token.upper())

            print(f"[INFO] Loaded {len(usn_list)} USNs ({len(name_map)} with student names) from {args.filename}.", file=sys.stderr)
        except FileNotFoundError:
            print(f"[ERROR] File not found: {args.filename}", file=sys.stderr)
            sys.exit(1)

    # Deduplicate preserving order
    seen = set()
    usn_list = [u for u in usn_list if not (u in seen or seen.add(u))]

    if args.branch:
        target_b = args.branch.strip().upper()
        filtered = []
        for u in usn_list:
            if len(u) >= 7 and target_b in u[5:7].upper():
                filtered.append(u)
            elif target_b in u:
                filtered.append(u)
        usn_list = filtered
        print(f"[INFO] Filtered to {len(usn_list)} USNs matching branch '{target_b}'.", file=sys.stderr)

    if not usn_list:
        print("[ERROR] No valid USNs found to scrape.", file=sys.stderr)
        sys.exit(1)

    complete_usns = set()
    if not args.force:
        try:
            from scraper.config import supabase
            from collections import defaultdict
            # Only consider a student complete if they have BOTH Sem 1 and Sem 2 in the results table!
            # Fetch all existing results using pagination (bypasses PostgREST 1000-row default limit)
            all_results = []
            offset = 0
            chunk = 1000
            while True:
                resp = supabase.table("results").select("usn, semester").in_("usn", usn_list).range(offset, offset + chunk - 1).execute()
                rows = resp.data or []
                all_results.extend(rows)
                if len(rows) < chunk:
                    break
                offset += chunk

            sems_by_usn = defaultdict(set)
            for r in all_results:
                u = r.get("usn")
                sem = r.get("semester")
                if u and sem is not None:
                    sems_by_usn[u.upper()].add(int(sem))

            def is_student_complete(u, sems):
                m = re.search(r'^[0-9][A-Z]{2}(\d{2})[A-Z]{2,3}(\d{3})$', u)
                if m:
                    y = int(m.group(1))
                    num = int(m.group(2))
                    is_lateral = num >= 400
                    if is_lateral:
                        if y == 24: # Lateral entry for 3rd year (joined in 2024 at Sem 3)
                            return {3, 4, 5, 6}.issubset(sems)
                        return {3, 4}.issubset(sems)
                    if y >= 25:
                        return (1 in sems and 2 in sems)
                    elif y == 24:
                        return {1, 2, 3, 4}.issubset(sems)
                    elif y == 23:
                        # 3rd year regular student: Has Semesters 1 through 6
                        return {1, 2, 3, 4, 5, 6}.issubset(sems)
                return len(sems) >= 6

            complete_usns = {u for u, sems in sems_by_usn.items() if is_student_complete(u, sems)}
            print(f"[INFO] Found {len(complete_usns)} students already complete in Supabase.", file=sys.stderr)
            partial = len([u for u, sems in sems_by_usn.items() if not is_student_complete(u, sems)])
            if partial > 0:
                print(f"[INFO] {partial} student(s) have incomplete semesters and will be automatically re-scraped to fetch missing data.", file=sys.stderr)
        except Exception as err:
            print(f"[WARNING] Could not fetch existing student results from Supabase: {err}", file=sys.stderr)

    results_summary = []
    to_scrape = []
    
    for i, usn in enumerate(usn_list):
        if not args.force and usn in complete_usns:
            print(f"[{i+1}/{len(usn_list)}] Skipping {usn} (All available semesters already complete in Supabase)", file=sys.stderr)
            results_summary.append({
                "usn": usn,
                "status": "SKIPPED",
                "time": time.strftime("%H:%M:%S")
            })
        else:
            to_scrape.append(usn)

    start_time = time.perf_counter()
    if to_scrape:
        workers = max(1, args.students)
        print(f"\n[INFO] ⏱️  TIMER STARTED! Scraping {len(to_scrape)} USNs ({workers} concurrent student(s) in Burst Mode)...\n", file=sys.stderr, flush=True)
        
        if workers == 1:
            for i, usn in enumerate(to_scrape):
                print(f"[{i+1}/{len(to_scrape)}] Processing {usn}...", file=sys.stderr)
                res = _scrape_worker(usn, scheme=args.scheme, tabs=args.tabs, default_name=name_map.get(usn))
                results_summary.append(res)
                elapsed = time.perf_counter() - start_time
                m, s = divmod(int(elapsed), 60)
                print(f">>> [⏱️ {m:02d}m {s:02d}s | {i+1}/{len(to_scrape)}] {res['usn']}: {res['status']}", file=sys.stderr, flush=True)
                if i < len(to_scrape) - 1:
                    time.sleep(1)
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {}
                for idx, usn in enumerate(to_scrape):
                    # Stagger start slightly (0.35s) for the initial batch to prevent socket collision
                    stagger = (idx % workers) * 0.35
                    f = executor.submit(_scrape_worker, usn, args.scheme, args.tabs, stagger, name_map.get(usn))
                    futures[f] = usn

                completed = 0
                for future in concurrent.futures.as_completed(futures):
                    res = future.result()
                    completed += 1
                    results_summary.append(res)
                    elapsed = time.perf_counter() - start_time
                    rate = completed / elapsed if elapsed > 0 else 0.001
                    rem_secs = (len(to_scrape) - completed) / rate if rate > 0 else 0
                    m, s = divmod(int(elapsed), 60)
                    rm, rs = divmod(int(rem_secs), 60)
                    pct = (completed * 100) // len(to_scrape)
                    print(f"\n>>> [⏱️ {m:02d}m {s:02d}s | PROGRESS: {completed}/{len(to_scrape)} ({pct}%)] {res['usn']}: {res['status']} | ETA: {rm:02d}m {rs:02d}s\n", file=sys.stderr, flush=True)

    total_time = time.perf_counter() - start_time
    tot_m, tot_s = divmod(int(total_time), 60)
    avg_speed = round(total_time / len(to_scrape), 2) if to_scrape else 0.0

    # Final Summary Table
    print("\n\n" + "="*58)
    print("             BULK SCRAPE BENCHMARK SUMMARY")
    print("="*58)
    print(f"| {'USN':<12} | {'Status':<12} | {'Finish Time':<12} |")
    print("|" + "-"*14 + "|" + "-"*14 + "|" + "-"*15 + "|")
    for res in results_summary:
        print(f"| {res['usn']:<12} | {res['status']:<12} | {res['time']:<12} |")
    print(f"\n[SUMMARY] Total Students in List: {len(results_summary)}")
    print(f"[SUCCESS] Successfully Scraped:   {sum(1 for r in results_summary if r['status'] == 'SUCCESS')}")
    print(f"[SKIPPED] Skipped (Already in DB):{sum(1 for r in results_summary if r['status'] == 'SKIPPED')}")
    print(f"[ALERT]   No Data / Errors:       {sum(1 for r in results_summary if r['status'] in ('NO DATA', 'ERROR'))}")
    print(f"\n[TIMER]   TOTAL TIME TAKEN:       {tot_m} min {tot_s:02d} sec ({round(total_time, 1)} seconds)")
    if to_scrape:
        print(f"[SPEED]   AVERAGE SPEED:          {avg_speed}s per student ({workers} students concurrent)")
    print("="*58 + "\n")


if __name__ == "__main__":
    main()
