#!/usr/bin/env python
"""
D8 — Live Scrape Demo / Throughput Benchmark
GradeFlow — VTU Academic Intelligence Platform

Runs the VTU scraper against a small list of USNs and prints, LIVE in the
terminal:
  - each student's marks tables (semester-wise, with backlog alerts)
  - a per-student timing line (seconds taken)
  - a final summary table with average throughput

Designed for a live meeting demo: just run it in the VS Code integrated
terminal and the preview streams as it scrapes.

Windows-safe: forces UTF-8 on stdout/stderr so the box-drawing tables and
emoji never trigger a cp1252 UnicodeEncodeError.

Usage (run from the backend/ folder):

    python benchmarks/demo_scrape.py                     # default 3-student sample
    python benchmarks/demo_scrape.py 2AB24CS001          # one USN
    python benchmarks/demo_scrape.py 2AB24CS001 2AB24CD002 2AB24CI001
    python benchmarks/demo_scrape.py -f students.csv     # from a CSV/txt list

Works without a database: the engine falls back to its 24 built-in VTU URLs,
and DB-write errors are caught — the live preview still appears.
"""

import sys
import os
import time
import argparse

# ── Force UTF-8 so the marks tables (║ ╔ ╗) and emoji (✅ ⚠️) print on Windows ──
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass


# ── Presentation filter: hides captcha-retry / portal-probing noise so a lead
#    sees only the meaningful output (marks tables, backlog alerts, status). ──
_NOISE = (
    "[CAPTCHA]",
    "Invalid captcha",
    "Portal inactive",
    "[Alert Check]",
    "Not applied for reval",
    "Result not available or invalid USN",
    "[config] get_vtu_urls error",
    "Screen capture failed",
    "Solver error",
    "Still on form",
    "pin_memory",
    "UserWarning",
    "super().__init__",
    "[>] Checking",
)


class _QuietStderr:
    """Line-buffered wrapper that drops noisy progress lines."""

    def __init__(self, real):
        self._real = real
        self._buf = ""

    def write(self, text):
        self._buf += text
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            if not any(tok in line for tok in _NOISE):
                self._real.write(line + "\n")
        return len(text)

    def flush(self):
        self._real.flush()

# Make the 'scraper' package importable when run from backend/
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

DEFAULT_SAMPLE = ["2AB24CS001", "2AB24CD002", "2AB24CI001"]


def _load_usns(args):
    usns = []
    if args.usns:
        usns.extend(u.strip().upper() for u in args.usns if u.strip())
    if args.filename:
        path = args.filename
        if not os.path.isabs(path):
            path = os.path.join(BACKEND_DIR, path)
        if path.lower().endswith(".csv"):
            import csv
            with open(path, "r", encoding="utf-8-sig") as f:
                for row in csv.DictReader(f):
                    for key in row.keys():
                        if key and "usn" in key.lower():
                            usns.append(row[key].strip().upper())
                            break
        else:
            with open(path, "r", encoding="utf-8") as f:
                usns.extend(line.strip().upper() for line in f
                            if line.strip() and not line.startswith("#"))
    if not usns:
        usns = list(DEFAULT_SAMPLE)
    # de-dupe, preserve order
    seen = set()
    return [u for u in usns if not (u in seen or seen.add(u))]


def main():
    parser = argparse.ArgumentParser(description="Live VTU scrape demo + throughput benchmark.")
    parser.add_argument("usns", nargs="*", help="USNs to scrape (defaults to a 3-student sample).")
    parser.add_argument("-f", "--file", dest="filename", help="CSV/txt file of USNs.")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="Show all engine output incl. captcha retries (default: clean/presentation mode).")
    args = parser.parse_args()

    usns = _load_usns(args)

    # Clean presentation mode (default): hide captcha-retry / portal-probing noise.
    if not args.verbose:
        sys.stderr = _QuietStderr(sys.stderr)

    # Imported here so the UTF-8 reconfigure above is already in effect.
    from scraper.engine import scrape_all_semesters

    print("=" * 70)
    print("  GradeFlow — Live VTU Scrape Demo (D8 Throughput Benchmark)")
    print(f"  Students to scrape: {len(usns)}")
    print("=" * 70)

    results = []
    run_start = time.time()

    for i, usn in enumerate(usns, 1):
        print(f"\n{'─' * 70}")
        print(f"  [{i}/{len(usns)}]  SCRAPING  {usn}")
        print(f"{'─' * 70}", flush=True)

        t0 = time.time()
        try:
            found = scrape_all_semesters(usn)
            status = "SUCCESS" if found else "NO DATA"
        except Exception as exc:
            status = "ERROR"
            print(f"  [ERROR] {usn}: {exc}")
        elapsed = time.time() - t0

        results.append({"usn": usn, "status": status, "secs": elapsed})
        print(f"\n  ⏱  {usn}: {status} in {elapsed:.1f}s", flush=True)

    total = time.time() - run_start
    ok = [r for r in results if r["status"] == "SUCCESS"]
    avg = (sum(r["secs"] for r in results) / len(results)) if results else 0

    print("\n\n" + "=" * 70)
    print("  SCRAPE SUMMARY")
    print("=" * 70)
    print(f"  {'USN':<14} {'STATUS':<10} {'TIME (s)':>10}")
    print(f"  {'-'*14} {'-'*10} {'-'*10}")
    for r in results:
        print(f"  {r['usn']:<14} {r['status']:<10} {r['secs']:>10.1f}")
    print(f"  {'-'*14} {'-'*10} {'-'*10}")
    print(f"  Students:        {len(results)}")
    print(f"  Successful:      {len(ok)}")
    print(f"  Total wall-time: {total:.1f}s")
    print(f"  Avg per student: {avg:.1f}s")
    print("=" * 70)


if __name__ == "__main__":
    main()
