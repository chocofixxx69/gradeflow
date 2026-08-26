"""
Python port of lib/subjectCreditResolver.js — the same single canonical credit
authority, used by the scraper so future scrapes write correct credits instead
of trusting whatever digit VTU's HTML happens to print (or a hardcoded 3).

subject_catalog (Supabase) is the ONLY credit source. No hardcoded catalog, no
numeric default. A subject that can't be resolved comes back as (None,
'unresolved') — callers must exclude it from any credit/SGPA sum, never guess.

See lib/subjectCreditResolver.js for the documented rationale behind the two
normalization rules (same-prefix elective family, generic-department family).
"""

import re

_VARIANT_RE = re.compile(r'^(.+\d)([A-Z])$')
_DEPT_VARIANT_RE = re.compile(r'^(\d*)B([A-Z]{2,4})(\d+)([A-Z])$')


def build_catalog_index(rows):
    """rows: list of dicts with scheme, branch, semester, subject_code, credits."""
    exact = {}
    for row in rows or []:
        scheme = str(row.get("scheme") or "").strip()
        branch = str(row.get("branch") or "").strip().upper()
        semester = row.get("semester")
        code = str(row.get("subject_code") or "").strip().upper()
        credits = row.get("credits")
        if not scheme or not branch or not semester or not code or credits is None:
            continue
        exact[f"{scheme}|{branch}|{int(semester)}|{code}"] = credits
    return exact


def fetch_catalog_index(supabase_client):
    """Fetches the ENTIRE subject_catalog table (paginated past the 1000-row
    server cap) and builds one global index — one query, reused across the
    whole scrape run."""
    rows = []
    page_size = 1000
    start = 0
    while True:
        resp = (
            supabase_client.table("subject_catalog")
            .select("scheme, branch, semester, subject_code, credits")
            .range(start, start + page_size - 1)
            .execute()
        )
        batch = resp.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        start += page_size
    return build_catalog_index(rows)


def resolve_subject_credit(catalog_index, scheme, branch, semester, subject_code):
    """Returns (credits: int|None, source: 'exact'|'family'|'unresolved')."""
    s = str(scheme or "").strip()
    b = str(branch or "").strip().upper()
    code = str(subject_code or "").strip().upper()
    try:
        sem = int(semester)
    except (TypeError, ValueError):
        sem = None

    if not catalog_index or not s or not b or not sem or not code:
        return None, "unresolved"

    exact_key = f"{s}|{b}|{sem}|{code}"
    if exact_key in catalog_index:
        return catalog_index[exact_key], "exact"

    vm = _VARIANT_RE.match(code)
    if vm:
        base = vm.group(1)
        same_key = f"{s}|{b}|{sem}|{base}X"
        if same_key in catalog_index:
            return catalog_index[same_key], "family"

        lab_base = re.sub(r'L(?=\d+$)', '', base)
        if lab_base != base:
            lab_key = f"{s}|{b}|{sem}|{lab_base}X"
            if lab_key in catalog_index:
                return catalog_index[lab_key], "family"

    dm = _DEPT_VARIANT_RE.match(code)
    if dm:
        leading_digits, _dept, digits, _letter = dm.groups()
        generic_key = f"{s}|{b}|{sem}|{leading_digits}BXX{digits}X"
        if generic_key in catalog_index:
            return catalog_index[generic_key], "family"

        branch_slot_key = f"{s}|{b}|{sem}|{leading_digits}B{b}{digits}X"
        if branch_slot_key in catalog_index:
            return catalog_index[branch_slot_key], "family"

    if b in ("AI", "DS"):
        cs_exact = f"{s}|CS|{sem}|{code}"
        if cs_exact in catalog_index:
            return catalog_index[cs_exact], "exact"
        if vm:
            cs_same_key = f"{s}|CS|{sem}|{vm.group(1)}X"
            if cs_same_key in catalog_index:
                return catalog_index[cs_same_key], "family"

    return None, "unresolved"


_AUDIT_PREFIXES = ("BPEK", "BNSK", "BYOK", "BIKS", "1BPEK", "1BNSK", "1BYOK")
_AUDIT_CODES = {"22IDT159", "22PRJL29", "22CIR38", "22CIR48", "22GC36"}


def is_audit_course(subject_code):
    code = str(subject_code or "").strip().upper()
    if not code:
        return False
    return code.startswith(_AUDIT_PREFIXES) or code in _AUDIT_CODES


def resolve_credits(catalog_index, scheme, branch, semester, subject_code):
    """Convenience wrapper: audit courses short-circuit to (0, 'audit')."""
    if is_audit_course(subject_code):
        return 0, "audit"
    return resolve_subject_credit(catalog_index, scheme, branch, semester, subject_code)
