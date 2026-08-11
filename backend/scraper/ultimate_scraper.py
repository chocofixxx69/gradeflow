#!/usr/bin/env python3
"""
ULTIMATE VTU SCRAPER — Standalone CLI

Usage:
    python ultimate_scraper.py --single 2AB23CS013
    python ultimate_scraper.py --usns students.csv

This is a thin CLI wrapper around the scraper engine.
All actual scraping logic lives in engine.py.
"""

import sys
import os
import time
import csv

# Fix imports when running standalone
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(BASE_DIR)
if PARENT_DIR not in sys.path:
    sys.path.insert(0, PARENT_DIR)

from scraper.engine import scrape_all_semesters

# Colors for terminal output
class C:
    G = '\033[92m'
    Y = '\033[93m'
    R = '\033[91m'
    C = '\033[96m'
    B = '\033[1m'
    M = '\033[95m'
    E = '\033[0m'


def print_header():
    print(f"\n{C.B}{C.C}{'='*70}")
    print(f"  ULTIMATE VTU SCRAPER v3.0 — Rebuilt & Battle-Tested")
    print(f"{'='*70}{C.E}\n")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="VTU Result Scraper")
    parser.add_argument("--usns", help="CSV file with USNs (one per line or column)")
    parser.add_argument("--single", help="Single USN to scrape")
    args = parser.parse_args()

    print_header()

    # Build USN list
    if args.single:
        usns = [args.single.strip().upper()]
    elif args.usns:
        usns = []
        with open(args.usns, newline="", encoding="utf-8") as f:
            reader = csv.reader(f)
            for row in reader:
                if row and row[0].strip():
                    usn = row[0].strip().upper()
                    if usn and usn != "USN":  # skip header
                        usns.append(usn)
        usns = list(dict.fromkeys(usns))  # deduplicate preserving order
    else:
        print(f"{C.R}Error: Use --usns <file.csv> or --single <USN>{C.E}")
        sys.exit(1)

    print(f"{C.C}📋 {len(usns)} USN(s) to process{C.E}\n")

    # Process each USN
    start = time.time()
    success_count = 0

    for i, usn in enumerate(usns, 1):
        print(f"\n{C.B}{C.M}{'─'*70}")
        print(f"  [{i}/{len(usns)}] Processing: {usn}")
        print(f"{'─'*70}{C.E}")

        try:
            found = scrape_all_semesters(usn)
            if found:
                success_count += 1
                print(f"  {C.G}✅ {usn}: Results saved to database{C.E}")
            else:
                print(f"  {C.Y}⚠ {usn}: No results found{C.E}")
        except Exception as e:
            print(f"  {C.R}❌ {usn}: Error — {e}{C.E}")

        # Polite delay between USNs
        if i < len(usns):
            time.sleep(2)

    elapsed = time.time() - start

    # Summary
    print(f"\n{C.B}{C.G}{'='*70}")
    print(f"  ✅ COMPLETE: {success_count}/{len(usns)} successful ({success_count*100//max(len(usns),1)}%)")
    print(f"  ⏱ Total: {elapsed/60:.1f} min | Avg: {elapsed/max(len(usns),1):.1f}s per USN")
    print(f"{'='*70}{C.E}\n")


if __name__ == "__main__":
    main()
