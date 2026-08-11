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

# Ensure Python can find the 'scraper' package
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper.engine import scrape_all_semesters  # type: ignore


def scrape_one(usn: str) -> None:
    """Run the engine for a single USN and print a short JSON summary."""
    print(f"\n=== Scraping {usn} ===", file=sys.stderr)
    found = scrape_all_semesters(usn)
    status = "scraped & stored" if found else "no data found"
    result = {"usn": usn, "status": status}
    print(json.dumps(result, indent=2))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Scrape VTU results for many USNs."
    )
    parser.add_argument(
        "usns", nargs="*",
        help="One or more USNs to scrape (e.g. 2AB23CS013)."
    )
    parser.add_argument(
        "-f", "--file", dest="filename",
        help="Path to a text file containing USNs, one per line."
    )
    args = parser.parse_args()

    usn_list = []

    if args.usns:
        usn_list.extend([u.strip().upper() for u in args.usns if u.strip()])

    if args.filename:
        try:
            if args.filename.lower().endswith(".csv"):
                import csv
                with open(args.filename, "r", encoding="utf-8-sig") as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        for key in row.keys():
                            if key and "usn" in key.lower():
                                usn_list.append(row[key].strip().upper())
                                break
            else:
                with open(args.filename, "r", encoding="utf-8") as f:
                    file_usns = [line.strip().upper() for line in f if line.strip()]
                    usn_list.extend(file_usns)
        except FileNotFoundError:
            print(f"[ERROR] File not found: {args.filename}", file=sys.stderr)
            sys.exit(1)

    # Deduplicate preserving order
    seen = set()
    usn_list = [u for u in usn_list if not (u in seen or seen.add(u))]

    results_summary = []
    
    for i, usn in enumerate(usn_list):
        try:
            print(f"\n[{i+1}/{len(usn_list)}] Processing {usn}...", file=sys.stderr)
            found = scrape_all_semesters(usn)
            results_summary.append({
                "usn": usn,
                "status": "✅ SUCCESS" if found else "❌ NO DATA",
                "time": time.strftime("%H:%M:%S")
            })
        except Exception as exc:
            print(f"[ERROR] Unexpected failure for {usn}: {exc}", file=sys.stderr)
            results_summary.append({
                "usn": usn,
                "status": "💥 ERROR",
                "time": time.strftime("%H:%M:%S")
            })
        
        # Polite delay
        if i < len(usn_list) - 1:
            time.sleep(2)

    # Final Summary Table
    print("\n\n" + "="*50)
    print("         BULK SCRAPE FINAL SUMMARY")
    print("="*50)
    print(f"║ {'USN':<12} ║ {'Status':<12} ║ {'Finish Time':<12} ║")
    print("╠" + "═"*14 + "╬" + "═"*14 + "╬" + "═"*15 + "╣")
    for res in results_summary:
        print(f"║ {res['usn']:<12} ║ {res['status']:<12} ║ {res['time']:<12} ║")
    print("╚" + "═"*14 + "╩" + "═"*14 + "╩" + "═"*15 + "╝")
    print(f"\nTotal Students: {len(results_summary)}")
    print(f"Successes: {sum(1 for r in results_summary if 'SUCCESS' in r['status'])}")
    print("="*50)


if __name__ == "__main__":
    main()
