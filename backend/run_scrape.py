#!/usr/bin/env python
"""
run_scrape.py – High-Performance VTU Scraper (Burst Mode + GPU CUDA Inference).

Usage:
    python backend/run_scrape.py 2AB25CS021
    python backend/run_scrape.py 2AB25CS021 --burst
    python backend/run_scrape.py 2AB25CS021 --tabs 5
    python backend/run_scrape.py 2AB25CS021 --scheme 2025
"""

import sys
import os
import json
import argparse

# Ensure local imports work
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scraper.engine import scrape_all_semesters

def main():
    parser = argparse.ArgumentParser(description="GradeFlow High-Performance VTU Scraper")
    parser.add_argument("usn", nargs="?", default=None, help="USN to scrape (e.g. 2AB25CS021)")
    parser.add_argument("-s", "--scheme", default=None, choices=["2022", "2025"], help="Scheme override ('2022' or '2025')")
    parser.add_argument("-t", "--tabs", type=int, default=None, help="Number of concurrent browser tabs (default: all portals in burst mode)")
    parser.add_argument("--burst", action="store_true", default=True, help="Enable full burst mode (default: True)")
    parser.add_argument("--faculty-id", default=None, help="Faculty ID for custom portal configurations")

    args = parser.parse_args()

    usn = args.usn
    if not usn:
        usn = input("Enter USN (e.g. 2AB25CS021): ").strip().upper()

    if not usn:
        print("[ERROR] No USN supplied.", file=sys.stderr)
        sys.exit(1)

    usn = usn.strip().upper()
    print(f"[INFO] Starting Burst Scrape for {usn} (Scheme: {args.scheme or 'auto-detect'})...", file=sys.stderr)

    found = scrape_all_semesters(
        usn,
        faculty_id=args.faculty_id,
        scheme=args.scheme,
        burst=args.burst,
        concurrency=args.tabs
    )

    if found:
        result = {
            "usn": usn,
            "status": "scraped & stored",
            "message": "Results saved to Supabase: students, results, subject_marks"
        }
    else:
        result = {"usn": usn, "status": "no data found"}

    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
