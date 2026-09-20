"""
ONE-TIME HISTORICAL RECONCILIATION — DRY RUN ONLY.

Re-scrapes a given list of USNs against the LIVE VTU site using the existing,
already-fixed engine parser (backend/scraper/engine.py), and compares the
freshly-parsed VTU values against what is currently stored in Supabase.

This module performs ZERO database writes. It monkeypatches the engine's two
DB-writing functions (`_save_db`, `_recalculate_remarks`) with read-only
stand-ins that only compare and record findings in memory, then restores
nothing to disk except a JSON report.

This is NOT imported by the normal per-student scraping path
(backend/scraper/engine.py never imports this module), so it has zero effect
on live scraping performance or behavior.

Usage:
    python -m backend.scraper.reconcile_historical USN1 USN2 USN3 ...
    python -m backend.scraper.reconcile_historical --sample 15
"""
import sys
import os
import json
import random
import asyncio

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.scraper import engine  # noqa: E402
from backend.scraper.config import supabase  # noqa: E402

REPORT = []
SUMMARY = {
    "students_checked": 0,
    "students_with_data_found": 0,
    "subjects_compared": 0,
    "matches": 0,
    "verified_mismatches": 0,
    "new_subjects_not_in_db": 0,
    "errors": 0,
}


def _dry_run_save_db(usn, name, sem, url, subs):
    """Read-only stand-in for engine._save_db. Never writes. Compares
    freshly parsed VTU subjects for one semester against the currently
    stored subject_marks/results rows for that usn+semester."""
    try:
        scheme = engine._get_student_scheme(usn)
        branch_code = engine._parse_branch_code(usn)
        catalog_index = engine._get_catalog_index()
        for s in subs:
            code = s.get("subject_code")
            resolved_cr, _source = engine.resolve_credits(catalog_index, scheme, branch_code, sem, code)
            s["credits"] = resolved_cr

        existing_rows = supabase.table("subject_marks").select(
            "subject_code, subject_name, internal, external, total, grade, passed, is_backlog, credits"
        ).eq("usn", usn).eq("semester", sem).execute().data or []
        existing_by_code = {r["subject_code"]: r for r in existing_rows}

        existing_result = supabase.table("results").select("sgpa, total_credits").eq(
            "usn", usn).eq("semester", sem).execute().data
        current_sgpa = existing_result[0]["sgpa"] if existing_result else None

        tc = tcp = 0
        exclude_grades = {"PP", "NP", "W", "DX", "AU"}
        for s in subs:
            g = (s.get("grade") or "F").strip().upper()
            if g in exclude_grades:
                continue
            pts = engine._get_true_grade_point(g, s.get("total", 0), ext_m=s.get("external"), code=s.get("subject_code"))
            cr = s.get("credits")
            if cr is None:
                continue
            tc += cr
            tcp += (pts * cr)
        proposed_sgpa = round(tcp / tc, 2) if tc > 0 else 0.0

        for s in subs:
            code = s.get("subject_code")
            prev = existing_by_code.get(code)
            SUMMARY["subjects_compared"] += 1
            entry = {
                "usn": usn,
                "semester": sem,
                "subject_code": code,
                "subject_name": s.get("subject_name"),
                "current_external": prev.get("external") if prev else None,
                "current_total": prev.get("total") if prev else None,
                "current_grade": prev.get("grade") if prev else None,
                "current_passed": prev.get("passed") if prev else None,
                "current_is_backlog": prev.get("is_backlog") if prev else None,
                "vtu_internal": s.get("internal"),
                "vtu_external": s.get("external"),
                "vtu_total": s.get("total"),
                "vtu_grade": s.get("grade"),
                "vtu_passed": s.get("passed"),
                "vtu_is_backlog": s.get("is_backlog"),
                "current_sem_sgpa": current_sgpa,
                "vtu_reparsed_sem_sgpa": proposed_sgpa,
                "source_url": url,
            }

            if prev is None:
                entry["classification"] = "NEW_SUBJECT_NOT_IN_DB"
                SUMMARY["new_subjects_not_in_db"] += 1
            elif (prev.get("external") == s.get("external")
                  and prev.get("total") == s.get("total")
                  and (prev.get("grade") or "").strip().upper() == (s.get("grade") or "").strip().upper()
                  and bool(prev.get("passed")) == bool(s.get("passed"))):
                entry["classification"] = "MATCH"
                SUMMARY["matches"] += 1
            else:
                entry["classification"] = "VERIFIED_MISMATCH"
                entry["reason"] = (
                    f"Live VTU re-parse (corrected Final-Marks logic) differs from stored value: "
                    f"external {prev.get('external')}->{s.get('external')}, "
                    f"total {prev.get('total')}->{s.get('total')}, "
                    f"grade {prev.get('grade')}->{s.get('grade')}"
                )
                SUMMARY["verified_mismatches"] += 1

            REPORT.append(entry)

        print(f"      [DRY-RUN] {usn} Sem {sem}: {len(subs)} subject(s) compared, 0 DB writes performed.",
              file=sys.stderr, flush=True)
        return True
    except Exception as e:
        print(f"      [DRY-RUN ERROR] {usn} Sem {sem}: {e}", file=sys.stderr, flush=True)
        SUMMARY["errors"] += 1
        return False


def _dry_run_recalc_remarks(usn):
    """Read-only stand-in for engine._recalculate_remarks. No-op, no writes."""
    return


def _pick_sample(n):
    resp = supabase.table("students").select("usn").limit(2000).execute()
    all_usns = [r["usn"] for r in (resp.data or []) if r.get("usn")]
    if not all_usns:
        return []
    random.seed(42)
    return random.sample(all_usns, min(n, len(all_usns)))


def main():
    args = sys.argv[1:]
    if not args:
        print("Usage: python -m backend.scraper.reconcile_historical USN1 USN2 ... | --sample N")
        return
    if args[0] == "--sample":
        n = int(args[1]) if len(args) > 1 else 15
        usns = _pick_sample(n)
        print(f"[RECONCILE] Selected random sample of {len(usns)} students: {usns}")
    else:
        usns = [u.strip().upper() for u in args]

    # Monkeypatch the engine's DB-writing functions with dry-run stand-ins.
    # engine._async_scrape_all_semesters looks up these names as bare globals
    # at call time, so this patch takes effect without editing engine.py.
    engine._save_db = _dry_run_save_db
    engine._recalculate_remarks = _dry_run_recalc_remarks

    for usn in usns:
        SUMMARY["students_checked"] += 1
        try:
            before_count = len(REPORT)
            engine.scrape_all_semesters(usn, burst=True)
            if len(REPORT) > before_count:
                SUMMARY["students_with_data_found"] += 1
        except Exception as e:
            print(f"[RECONCILE ERROR] {usn}: {e}", file=sys.stderr, flush=True)
            SUMMARY["errors"] += 1

    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "scripts", "reconciliation_dry_run_report.json")
    out_path = os.path.abspath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"summary": SUMMARY, "records": REPORT}, f, indent=2)

    print("\n=== DRY RUN SUMMARY ===")
    print(json.dumps(SUMMARY, indent=2))
    mismatches = [r for r in REPORT if r["classification"] == "VERIFIED_MISMATCH"]
    print(f"\n=== {len(mismatches)} VERIFIED MISMATCHES ===")
    print(json.dumps(mismatches, indent=2))
    print(f"\nFull report written to: {out_path}")


if __name__ == "__main__":
    main()
