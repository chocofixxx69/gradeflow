"""
ONE-TIME, SCOPE-LIMITED historical repair for the 150 HIGH-priority candidates
in scripts/reval_candidates_report.json.

For each candidate (usn, subject_code, semester), re-scrapes ONLY the specific
reval portal(s) already implicated for that subject (via engine's `target_url`
support — never the full 16-portal battery), using the existing, already-fixed
parser. Compares the live-authoritative VTU value against the current
subject_marks row. Repairs ONLY exact VERIFIED_MISMATCH records:

  - live portal fetched successfully
  - the exact subject_code+semester was found in the live parse
  - the live value differs from the stored value

Every repair:
  - preserves the old row via an audit_logs entry (existing audit table/shape,
    reused as-is — see lib/server-audit.js's logServerAudit for the schema)
  - adds a subject_mark_attempts provenance row (existing history table)
  - updates ONLY subject_marks.{internal,external,total,grade,passed,is_backlog}
    for that one row (never credits, never other students' rows)
  - then calls the REAL, unmodified engine._recalculate_remarks(usn) — the
    scraper's existing canonical per-student SGPA/backlog recompute — for
    just that student. No new SGPA/CGPA logic is implemented here.

Idempotent by construction: a second run re-fetches the same live VTU value,
finds it already equals the stored (corrected) value, and classifies MATCH
instead of repairing again.

Checkpointed: writes scripts/high_priority_reconciliation_report.json after
every USN so the run can be interrupted and resumed (already-processed USNs
are skipped on the next run unless --restart is passed).
"""
import sys
import os
import re
import json
import time
from datetime import datetime, timezone

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.scraper import engine  # noqa: E402
from backend.scraper.config import supabase  # noqa: E402

CANDIDATES_PATH = "scripts/reval_candidates_report.json"
OUTPUT_PATH = "scripts/high_priority_reconciliation_report.json"
EXCLUDE_GRADES = {"PP", "NP", "W", "DX", "AU"}
MAX_OUTER_ATTEMPTS = 2  # bounded outer retries per usn (engine already does 5 inner captcha retries per portal)

_real_parse_row = engine._parse_row
_real_save_db = engine._save_db
_real_recalculate_remarks = engine._recalculate_remarks

_capture = {}
_raw_evidence = {}


def _portal_url(exam_name):
    return f"https://results.vtu.ac.in/{exam_name}/index.php"


def _evidence_parse_row(texts):
    """Non-invasive: independently re-derives is_reval_row/nums from the same
    input the real parser sees, purely to log Old/RV/Final evidence. Never
    changes behavior — always defers to the real, unmodified _parse_row."""
    try:
        if texts:
            t = texts[1:] if (texts[0].strip().isdigit() and len(texts) > 1) else texts
            if len(t) >= 2:
                code = t[0].strip().upper()
                rem = t[2:]
                nums = []
                for v in rem:
                    m = re.search(r'^(\d+(?:\.\d+)?)$', v.strip())
                    if m:
                        nums.append(float(m.group(1)))
                grade_tokens = [v.strip().upper() for v in rem if v.strip().upper() in engine.VALID_GRADES]
                is_reval = len(nums) >= 4 and len(grade_tokens) >= 2
                ev = {"raw_texts": texts, "nums": nums, "is_reval_row": is_reval}
                if is_reval:
                    ev.update({
                        "internal": nums[0],
                        "old_marks": nums[1] if len(nums) > 1 else None,
                        "rv_marks": nums[-2],
                        "final_marks": nums[-1],
                    })
                _raw_evidence[code] = ev
    except Exception:
        pass
    return _real_parse_row(texts)


def _capture_save_db(usn, name, sem, url, subs):
    """Never writes. Captures the freshly-parsed, live-authoritative subjects
    for this portal call so they can be compared against stored values."""
    for s in subs:
        _capture.setdefault(s["subject_code"], []).append({**s, "semester": sem, "source_url": url})
    return True


def _noop_remarks(usn):
    return


def _now():
    return datetime.now(timezone.utc).isoformat()


def _fetch_current(usn, subject_code, semester):
    res = supabase.table("subject_marks").select("*").eq("usn", usn).eq(
        "subject_code", subject_code).eq("semester", semester).limit(1).execute()
    return res.data[0] if res.data else None


def _write_audit(usn, subject_code, semester, old_row, new_row, portal, evidence, retry_count):
    try:
        supabase.table("audit_logs").insert({
            "action": "VTU_REVAL_FINAL_MARKS_CORRECTION",
            "details": {
                "actor": "system:reconcile_high_priority",
                "actor_role": "system",
                "severity": "INFO",
                "entity_type": "subject_marks",
                "entity_id": usn,
                "description": (
                    f"Corrected {subject_code} sem {semester} for {usn}: stored external "
                    f"{old_row.get('external')} -> live VTU Final Marks {new_row.get('external')} "
                    f"(total {old_row.get('total')} -> {new_row.get('total')})."
                ),
                "old_values": old_row,
                "new_values": new_row,
                "metadata": {
                    "subject_code": subject_code,
                    "semester": semester,
                    "portal": portal,
                    "vtu_evidence": evidence,
                    "retry_count": retry_count,
                    "reason": "Historical VTU revaluation parser bug: old parser stored RV Marks instead "
                              "of Final Marks for reval-structured rows. This record's live VTU page was "
                              "re-scraped with the corrected parser and the authoritative Final Marks value "
                              "differed from the stored value.",
                },
                "timestamp": _now(),
            },
        }).execute()
    except Exception as e:
        print(f"      [WARN] audit_logs insert failed for {usn}/{subject_code}: {e}", file=sys.stderr, flush=True)


def _write_attempt_provenance(usn, semester, subject_code, subject_name, live, portal, result_id):
    try:
        supabase.table("subject_mark_attempts").insert({
            "result_id": result_id, "usn": usn, "semester": semester,
            "subject_code": subject_code, "subject_name": subject_name,
            "internal": live.get("internal"), "external": live.get("external"), "total": live.get("total"),
            "grade": live.get("grade"), "credits": live.get("credits"), "passed": live.get("passed"),
            "exam_name": portal,
        }).execute()
    except Exception as e:
        print(f"      [WARN] subject_mark_attempts insert failed for {usn}/{subject_code}: {e}", file=sys.stderr, flush=True)


def load_checkpoint():
    if os.path.exists(OUTPUT_PATH) and "--restart" not in sys.argv:
        try:
            with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"generated_at": _now(), "records": [], "processed_usns": []}


def save_checkpoint(state):
    state["updated_at"] = _now()
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2)


def process_usn(usn, candidates, state):
    """candidates: list of dicts {subject_code, semester, portals(list)}"""
    global _capture, _raw_evidence

    portals = sorted(set(p for c in candidates for p in c["portals"]))
    target_url = ",".join(_portal_url(p) for p in portals)

    engine._parse_row = _evidence_parse_row
    engine._save_db = _capture_save_db
    engine._recalculate_remarks = _noop_remarks

    success = False
    retry_count = 0
    for attempt in range(1, MAX_OUTER_ATTEMPTS + 1):
        retry_count = attempt
        _capture = {}
        _raw_evidence = {}
        try:
            engine.scrape_all_semesters(usn, target_url=target_url, burst=True)
        except Exception as e:
            print(f"[RECONCILE ERROR] {usn}: {e}", file=sys.stderr, flush=True)
        if _capture:
            success = True
            break
        if attempt < MAX_OUTER_ATTEMPTS:
            time.sleep(3 * attempt)

    engine._parse_row = _real_parse_row
    engine._save_db = _real_save_db
    engine._recalculate_remarks = _real_recalculate_remarks

    repaired_any = False
    for c in candidates:
        code, sem = c["subject_code"], c["semester"]
        rec = {
            "usn": usn, "subject_code": code, "semester": sem, "portals_targeted": portals,
            "retry_count": retry_count, "timestamp": _now(),
        }
        current = _fetch_current(usn, code, sem)
        rec["current_db_external"] = current.get("external") if current else None
        rec["current_db_total"] = current.get("total") if current else None

        if not success:
            rec.update(classification="VTU_DATA_UNAVAILABLE", repair_status="skipped",
                       reason="Live portal(s) could not be fetched/solved after bounded retries.")
            state["records"].append(rec)
            continue

        matches = [c2 for c2 in _capture.get(code, []) if c2["semester"] == sem]
        if not matches:
            rec.update(classification="AMBIGUOUS", repair_status="skipped",
                       reason="Portal fetched successfully but this exact subject_code+semester was not "
                              "found in the live parse (subject may not appear on this exam session for "
                              "this student).")
            state["records"].append(rec)
            continue
        if current is None:
            rec.update(classification="AMBIGUOUS", repair_status="skipped",
                       reason="Live value found but no current subject_marks row exists to compare against.")
            state["records"].append(rec)
            continue

        live = matches[-1]
        ev = _raw_evidence.get(code, {})
        rec.update({
            "live_internal": live.get("internal"), "live_external": live.get("external"),
            "live_total": live.get("total"), "live_grade": live.get("grade"),
            "live_passed": live.get("passed"), "portal_used": live.get("source_url"),
            "old_marks_evidence": ev.get("old_marks"), "rv_marks_evidence": ev.get("rv_marks"),
            "final_marks_evidence": ev.get("final_marks"), "is_reval_row_evidence": ev.get("is_reval_row"),
        })

        is_match = (
            live.get("external") == current.get("external")
            and live.get("total") == current.get("total")
            and (live.get("grade") or "").strip().upper() == (current.get("grade") or "").strip().upper()
            and bool(live.get("passed")) == bool(current.get("passed"))
        )

        if is_match:
            rec.update(classification="MATCH", repair_status="none",
                       reason="Live VTU value already matches stored value.")
            state["records"].append(rec)
            continue

        # VERIFIED_MISMATCH -> repair
        new_row = {
            "internal": live.get("internal"), "external": live.get("external"), "total": live.get("total"),
            "grade": live.get("grade"), "passed": live.get("passed"), "is_backlog": live.get("is_backlog"),
        }
        try:
            _write_audit(usn, code, sem, current, new_row, live.get("source_url"), ev, retry_count)
            supabase.table("subject_marks").update(new_row).eq("id", current["id"]).execute()
            _write_attempt_provenance(usn, sem, code, current.get("subject_name"), live,
                                       live.get("source_url", "").split("/")[-2] if live.get("source_url") else None,
                                       current.get("result_id"))
            rec.update(classification="VERIFIED_MISMATCH", repair_status="repaired",
                       reason="Live VTU Final Marks differed from stored value; corrected.")
            repaired_any = True
        except Exception as e:
            rec.update(classification="VERIFIED_MISMATCH", repair_status="error",
                       reason=f"Repair write failed: {e}")
        state["records"].append(rec)

    if repaired_any:
        try:
            _real_recalculate_remarks(usn)
        except Exception as e:
            print(f"      [WARN] _recalculate_remarks failed for {usn}: {e}", file=sys.stderr, flush=True)

    state["processed_usns"].append(usn)
    save_checkpoint(state)
    return repaired_any


def main():
    with open(CANDIDATES_PATH, "r", encoding="utf-8") as f:
        report = json.load(f)
    high = report["high_priority_candidates"]

    by_usn = {}
    for c in high:
        portals = sorted(set(a["exam_name"] for a in c["reval_attempts"]))
        by_usn.setdefault(c["usn"], []).append({
            "subject_code": c["subject_code"], "semester": c["semester"], "portals": portals,
        })

    state = load_checkpoint()
    already_done = set(state["processed_usns"])
    remaining = [u for u in by_usn if u not in already_done]
    print(f"[RECONCILE] {len(by_usn)} unique USNs, {len(already_done)} already processed (resume), "
          f"{len(remaining)} remaining.", flush=True)

    for i, usn in enumerate(remaining, 1):
        print(f"[RECONCILE] ({i}/{len(remaining)}) processing {usn} "
              f"({len(by_usn[usn])} candidate subject(s))...", flush=True)
        process_usn(usn, by_usn[usn], state)

    records = state["records"]
    summary = {
        "high_candidates_processed": len(records),
        "unique_usns": len(by_usn),
        "MATCH": sum(1 for r in records if r["classification"] == "MATCH"),
        "VERIFIED_MISMATCH": sum(1 for r in records if r["classification"] == "VERIFIED_MISMATCH"),
        "repaired": sum(1 for r in records if r["repair_status"] == "repaired"),
        "repair_errors": sum(1 for r in records if r["repair_status"] == "error"),
        "VTU_DATA_UNAVAILABLE": sum(1 for r in records if r["classification"] == "VTU_DATA_UNAVAILABLE"),
        "AMBIGUOUS": sum(1 for r in records if r["classification"] == "AMBIGUOUS"),
        "PARSE_FAILURE": sum(1 for r in records if r["classification"] == "PARSE_FAILURE"),
        "students_affected": len(set(r["usn"] for r in records if r["repair_status"] == "repaired")),
        "subjects_affected": len(set((r["usn"], r["subject_code"], r["semester"]) for r in records if r["repair_status"] == "repaired")),
    }
    state["summary"] = summary
    save_checkpoint(state)
    print("\n=== FINAL SUMMARY ===", flush=True)
    print(json.dumps(summary, indent=2), flush=True)


if __name__ == "__main__":
    main()
