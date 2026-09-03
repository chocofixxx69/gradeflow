// lib/subjectCreditResolver.js
//
// The single canonical credit-resolution path for the entire app. `subject_catalog`
// in Supabase is the only credit authority — this module is the only code allowed
// to turn (scheme, branch, semester, subject_code) into a credit value.
//
// Why this exists: VTU electives are catalogued under a generic "family/slot" code
// (e.g. BCS405X = "ESC/ETC/PLC", BXX654X = "Open Elective Course") but a student's
// actual result carries the *specific chosen variant* (BCS405A, BEE654B). An
// exact-code lookup for the variant fails even though the subject is perfectly
// well-defined — VTU's own scheme documents confirm the credit is the *slot's*
// credit regardless of which lettered variant was taken, and that cross-department
// electives (e.g. a CS student taking an EEE-offered open elective) surface under
// the offering department's own prefix (BEE654B) even though the student's own
// branch catalogs the slot generically (BXX654X). Both conventions are verified
// against official VTU 2022-scheme scheme-of-teaching documents (CSE sem 1-2,
// EEE sem 3-8) — see the project plan for citations.
//
// Never returns a guessed/default credit. A subject that can't be resolved via an
// exact match or one of these two documented conventions comes back as
// { credits: null, source: 'unresolved' } — callers must exclude it from any
// credit/SGPA sum and surface it, never silently assume 3 (or any other number).

import { fetchAllPaginated } from './supabase-utils.js';

/**
 * Pure function: rows -> lookup index. Exported separately from the fetch so
 * scripts/tests can build an index from an already-fetched array (e.g. the
 * standalone audit tooling) without a live Supabase client.
 */
export function buildCatalogIndex(rows) {
    const exact = new Map(); // `${scheme}|${branch}|${semester}|${CODE}` -> credits
    for (const row of (rows || [])) {
        const scheme = String(row.scheme || '').trim();
        const branch = String(row.branch || '').trim().toUpperCase();
        const semester = Number(row.semester);
        const code = String(row.subject_code || '').trim().toUpperCase();
        const credits = Number(row.credits);
        if (!scheme || !branch || !semester || !code || Number.isNaN(credits)) continue;
        exact.set(`${scheme}|${branch}|${semester}|${code}`, credits);
    }
    return { exact };
}

/**
 * Fetches the ENTIRE subject_catalog table once (it's ~2.3k rows — a few hundred
 * KB — cheap to hold in memory whole) and builds one global index covering every
 * scheme/branch/semester. Callers that only need one (scheme, branch) still just
 * call this once; callers spanning many branches (class rosters, the admin
 * analytics dataset, audit scripts) get every branch from the same single query
 * instead of one query per branch.
 *
 * Cached for 60 seconds — subject_catalog changes rarely and re-fetching it
 * on every cascadeCreditUpdate call was adding ~200ms per subject save.
 */
let _catalogCache = null;
let _catalogCacheTime = 0;
let _catalogInFlight = null;
const CATALOG_CACHE_TTL = 600_000; // 10 minutes (static curriculum data)

export async function fetchCatalogIndex(client) {
    const now = Date.now();
    if (_catalogCache && (now - _catalogCacheTime) < CATALOG_CACHE_TTL) {
        return _catalogCache;
    }
    if (_catalogInFlight) {
        return _catalogInFlight;
    }

    _catalogInFlight = (async () => {
        try {
            const rows = await fetchAllPaginated(
                'subject_catalog',
                'scheme, branch, semester, subject_code, credits',
                client
            );
            _catalogCache = buildCatalogIndex(rows);
            _catalogCacheTime = Date.now();
            return _catalogCache;
        } finally {
            _catalogInFlight = null;
        }
    })();

    return _catalogInFlight;
}

/** Invalidate the catalog cache — call after bulk imports or catalog mutations */
export function invalidateCatalogCache() {
    _catalogCache = null;
    _catalogCacheTime = 0;
}

// Matches a code ending in digits then a single trailing letter, e.g. BCS405A,
// BESCK104A, BEE654B, 1BXX605A. Group 1 is everything up to and including the
// digits ("the base"), group 2 is the trailing variant letter.
const VARIANT_RE = /^(.+\d)([A-Z])$/;

// Matches the narrower "B<dept><digits><letter>" shape used by professional/open
// elective and AEC/SDC slots (BCS405A, BEE654B, BAIL657C — offering-department
// mnemonics run 2-4 letters, e.g. CS/EE/AIL — optionally a leading scheme-marker
// digit for 2025-scheme codes like 1BEE654B). The catalog's own generic row for
// these slots always uses a 2-letter "XX" placeholder regardless of how long the
// real offering department's mnemonic is (confirmed against subject_catalog:
// BXX654X, BXX613X, BXX657X), so the dept segment is replaced wholesale with "XX".
const DEPT_VARIANT_RE = /^(\d*)B([A-Z]{2,4})(\d+)([A-Z])$/;

/**
 * Resolves one subject's credit against a pre-fetched catalog index.
 * Returns { credits: number, source: 'exact' | 'family' } on success, or
 * { credits: null, source: 'unresolved' } when nothing matches — never a guess.
 *
 * `isAuditCourse` (from vtuAcademicEngine.js) must be checked by the caller
 * BEFORE calling this — audit courses short-circuit to 0 credit and never reach
 * catalog resolution at all.
 */
export function resolveSubjectCredit(catalogIndex, { scheme, branch, semester, subject_code }) {
    const s = String(scheme || '').trim();
    const b = String(branch || '').trim().toUpperCase();
    const sem = Number(semester);
    const code = String(subject_code || '').trim().toUpperCase();

    if (!catalogIndex || !s || !b || !sem || !code) {
        return { credits: null, source: 'unresolved' };
    }

    const exactKey = `${s}|${b}|${sem}|${code}`;
    if (catalogIndex.exact.has(exactKey)) {
        return { credits: catalogIndex.exact.get(exactKey), source: 'exact' };
    }

    // 1. Same-prefix elective family: BCS405A -> BCS405X, BESCK104A -> BESCK104X.
    const vm = code.match(VARIANT_RE);
    if (vm) {
        const base = vm[1];
        const sameKey = `${s}|${b}|${sem}|${base}X`;
        if (catalogIndex.exact.has(sameKey)) {
            return { credits: catalogIndex.exact.get(sameKey), source: 'family' };
        }

        // Lab variant without 'L' base: BCVL456A -> BCV456X, BDSL456C -> BDS456X
        const labBase = base.replace(/L(?=\d+$)/, '');
        if (labBase !== base) {
            const labKey = `${s}|${b}|${sem}|${labBase}X`;
            if (catalogIndex.exact.has(labKey)) {
                return { credits: catalogIndex.exact.get(labKey), source: 'family' };
            }
        }
    }

    // 2. Generic-department elective family: BEE654B -> BXX654X or B<branch>654X (e.g. BCV654X)
    const dm = code.match(DEPT_VARIANT_RE);
    if (dm) {
        const [, leadingDigits, , digits] = dm;
        const genericKey = `${s}|${b}|${sem}|${leadingDigits}BXX${digits}X`;
        if (catalogIndex.exact.has(genericKey)) {
            return { credits: catalogIndex.exact.get(genericKey), source: 'family' };
        }

        const branchSlotKey = `${s}|${b}|${sem}|${leadingDigits}B${b}${digits}X`;
        if (catalogIndex.exact.has(branchSlotKey)) {
            return { credits: catalogIndex.exact.get(branchSlotKey), source: 'family' };
        }
    }

    // 3. Department alias lookup for allied branches (e.g. AI/DS -> CS shared core subjects)
    if (b === 'AI' || b === 'DS') {
        const csExact = `${s}|CS|${sem}|${code}`;
        if (catalogIndex.exact.has(csExact)) {
            return { credits: catalogIndex.exact.get(csExact), source: 'exact' };
        }
        if (vm) {
            const csSameKey = `${s}|CS|${sem}|${vm[1]}X`;
            if (catalogIndex.exact.has(csSameKey)) {
                return { credits: catalogIndex.exact.get(csSameKey), source: 'family' };
            }
        }
    }

    return { credits: null, source: 'unresolved' };
}
