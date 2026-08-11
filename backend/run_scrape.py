#!/usr/bin/env python
"""
run_scrape.py – interactive wrapper for the VTU scraper.

Usage:
    python run_scrape.py               # prompts for a USN
    python run_scrape.py 2AB23CS013    # USN supplied on the CLI
"""

import sys
import json
from scraper.engine import scrape_all_semesters

def main():
    # Get USN from CLI or prompt
    if len(sys.argv) > 1:
        usn = sys.argv[1].strip().upper()
    else:
        usn = input("Enter USN (e.g. 2AB23CS013): ").strip().upper()

    if not usn:
        print("[ERROR] No USN supplied.", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Starting scrape for {usn} …", file=sys.stderr)
    found = scrape_all_semesters(usn)

    if found:
        result = {
            "usn": usn,
            "status": "scraped & stored",
            "message": "Check Supabase tables: students, results, subject_marks"
        }
    else:
        result = {"usn": usn, "status": "no data found"}

    print(json.dumps(result, indent=2))

if __name__ == "__main__":
    main()
