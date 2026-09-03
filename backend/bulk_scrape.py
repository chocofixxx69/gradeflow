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
import concurrent.futures

# Ensure Python can find the 'scraper' package
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper.engine import scrape_all_semesters  # type: ignore


def _scrape_worker(usn: str, scheme: str = None, tabs: int = None, delay: float = 0.0) -> dict:
    if delay > 0:
        time.sleep(delay)
    try:
        found = scrape_all_semesters(usn, scheme=scheme, burst=True, concurrency=tabs)
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
        "--students", "-w", "--workers", dest="students", type=int, default=2,
        help="Number of students to scrape simultaneously in burst mode (e.g. 2, 3, or 4). Default: 2."
    )
    parser.add_argument(
        "--tabs", "-t", dest="tabs", type=int, default=None,
        help="Number of concurrent portal tabs per student (default: all portals in burst mode)."
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

    if args.usns:
        usn_list.extend([u.strip().upper() for u in args.usns if u.strip()])

    if args.filename:
        try:
            import re
            with open(args.filename, "r", encoding="utf-8-sig", errors="ignore") as f:
                content = f.read()
                # Automatically extract any valid VTU USN patterns (e.g. 2AB25CS021, 1RV22EC045)
                usn_matches = re.findall(r'\b([1-9][A-Za-z]{2}\d{2}[A-Za-z]{2}\d{3})\b', content)
                if usn_matches:
                    usn_list.extend([u.upper() for u in usn_matches])
                else:
                    # Fallback line-by-line / comma-separated splitting
                    for line in content.splitlines():
                        cleaned = line.strip().replace(",", " ").replace('"', "").replace("'", "")
                        for token in cleaned.split():
                            if len(token) >= 7:
                                usn_list.append(token.upper())
            print(f"[INFO] Loaded {len(usn_list)} USNs from {args.filename}.", file=sys.stderr)
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

    existing_usns = set()
    if not args.force:
        try:
            from scraper.config import supabase
            resp = supabase.table("students").select("usn").execute()
            if resp.data:
                existing_usns = {r["usn"].upper() for r in resp.data if r.get("usn")}
            print(f"[INFO] Found {len(existing_usns)} existing student records in Supabase.", file=sys.stderr)
        except Exception as err:
            print(f"[WARNING] Could not fetch existing student USNs from Supabase: {err}", file=sys.stderr)

    results_summary = []
    to_scrape = []
    
    for i, usn in enumerate(usn_list):
        if not args.force and usn in existing_usns:
            print(f"[{i+1}/{len(usn_list)}] Skipping {usn} (Already exists in Supabase)", file=sys.stderr)
            results_summary.append({
                "usn": usn,
                "status": "SKIPPED",
                "time": time.strftime("%H:%M:%S")
            })
        else:
            to_scrape.append(usn)

    if to_scrape:
        workers = max(1, args.students)
        print(f"\n[INFO] Scraping {len(to_scrape)} USNs ({workers} concurrent student(s) in Burst Mode)...\n", file=sys.stderr)
        
        if workers == 1:
            for i, usn in enumerate(to_scrape):
                print(f"[{i+1}/{len(to_scrape)}] Processing {usn}...", file=sys.stderr)
                res = _scrape_worker(usn, scheme=args.scheme, tabs=args.tabs)
                results_summary.append(res)
                if i < len(to_scrape) - 1:
                    time.sleep(1)
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                futures = {}
                for idx, usn in enumerate(to_scrape):
                    stagger = (idx % workers) * 0.4
                    f = executor.submit(_scrape_worker, usn, args.scheme, args.tabs, stagger)
                    futures[f] = usn

                completed = 0
                for future in concurrent.futures.as_completed(futures):
                    res = future.result()
                    completed += 1
                    results_summary.append(res)
                    print(f"\n>>> [OVERALL PROGRESS: {completed}/{len(to_scrape)}] {res['usn']}: {res['status']}\n", file=sys.stderr, flush=True)

    # Final Summary Table
    print("\n\n" + "="*50)
    print("         BULK SCRAPE FINAL SUMMARY")
    print("="*50)
    print(f"| {'USN':<12} | {'Status':<12} | {'Finish Time':<12} |")
    print("|" + "-"*14 + "|" + "-"*14 + "|" + "-"*15 + "|")
    for res in results_summary:
        print(f"| {res['usn']:<12} | {res['status']:<12} | {res['time']:<12} |")
    print("="*50)
    print(f"\nTotal Students: {len(results_summary)}")
    print(f"Successes: {sum(1 for r in results_summary if r['status'] == 'SUCCESS')}")
    print(f"Skipped:   {sum(1 for r in results_summary if r['status'] == 'SKIPPED')}")
    print("="*50)


if __name__ == "__main__":
    main()
