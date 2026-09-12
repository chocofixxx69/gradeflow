// lib/student-record.js
//
// THE single source of truth for a student's academic standing.
//
// Every surface that shows a CGPA, a backlog count, a credit total or a semester
// SGPA reads it from here. Nothing else is allowed to compute those numbers.
//
// Why this module exists — the same student, 2AB23CS006, was showing:
//
//   faculty dashboard        CGPA 7.45   (computed from marks by the academic engine)
//   students directory       CGPA 7.56   (academic_remarks weighted by results.total_credits)
//   student detail page      CGPA 7.56   (academic_remarks averaged at a flat 20 credits/sem)
//   the SAME detail page     semester 6 SGPA 6.72 in its own mark sheet
//
// and 7.56 came from academic_remarks claiming semester 6 was 7.56 when the marks
// for that semester give 6.72. The detail page was rendering 6.72 and 7.56 beside
// each other. Across the institution, 157 semesters disagree between the two
// tables by more than half a grade point.
//
// The resolution: `subject_marks` joined to `subject_catalog` is the ONLY authority.
// It is the raw scraped truth plus the official credit register, and it is the
// input to lib/vtuAcademicEngine.js's calculateAcademicRecord(), which already
// implements VTU's rules for attempt reconciliation, audit courses, elective credit
// families and SGPA/CGPA. `academic_remarks` and `results` are derived tables the
// scraper writes and does not reliably keep current; they are kept here purely as
// PROVENANCE — which exam round published a semester, and whether the published
// figure still agrees with the marks — never as a source of the numbers themselves.
//
// Adding a new page? Call loadStudentRecords()/getStudentRecord(). Do not reach for
// academic_remarks.sgpa, results.total_credits, or weightedCGPA(): those produce the
// 7.56 above. lib/data-validation.js's CGPA_SOURCE_DIVERGENCE check exists to catch
// it if anyone does.

import { calculateAcademicRecord } from './vtuAcademicEngine.js';
import { fetchCatalogIndex } from './subjectCreditResolver.js';
import { readTable, SELECTS } from './table-cache.js';
import { buildStudentIdentity, configureBranchRegistry } from './vtu-identity.js';
import { resolveResultsByStudent } from './vtu-results.js';

/** How long a computed set of records is reused. Dropped on any academic write. */
const RECORDS_TTL_MS = 60_000;

let recordsCache = { at: 0, promise: null };

export function invalidateStudentRecords() {
    recordsCache = { at: 0, promise: null };
}

function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Builds the canonical record for every student in one pass. All input comes from
 * the shared table cache, so this costs one warehouse read no matter how many
 * routes ask for it inside the TTL.
 */
async function buildAll(client) {
    const [students, marks, results, remarks, branches, catalogIndex] = await Promise.all([
        readTable(client, 'students', SELECTS.students, { orderCol: 'usn' }),
        readTable(client, 'subject_marks', SELECTS.subject_marks),
        readTable(client, 'results', SELECTS.results),
        readTable(client, 'academic_remarks', SELECTS.academic_remarks),
        client.from('branches').select('code, label, usn_codes, aliases, sort_order, is_active').then(r => r.data || []),
        fetchCatalogIndex(client)
    ]);

    configureBranchRegistry(branches);

    const marksByUsn = new Map();
    for (const m of marks) {
        const u = String(m.usn || '').toUpperCase().trim();
        if (!marksByUsn.has(u)) marksByUsn.set(u, []);
        marksByUsn.get(u).push(m);
    }

    // Exam provenance only — which round published each semester, never its SGPA.
    const attemptsByUsn = resolveResultsByStudent(results);

    const publishedByUsn = new Map();
    for (const r of remarks) {
        const u = String(r.student_usn || '').toUpperCase().trim();
        if (!publishedByUsn.has(u)) publishedByUsn.set(u, new Map());
        publishedByUsn.get(u).set(Number(r.semester), r);
    }

    const records = new Map();

    await Promise.all(students.map(async (s) => {
        const usn = String(s.usn || '').toUpperCase().trim();
        const uMarks = marksByUsn.get(usn) || [];

        // A lateral entrant carries the previous scheme for the semesters they
        // actually sat; the engine needs that to resolve their credits.
        const recordedSemesters = [...new Set(uMarks.map(m => Number(m.semester)).filter(Boolean))].sort((a, b) => a - b);
        const identity = buildStudentIdentity(s, recordedSemesters);

        let scheme = s.scheme;
        if (identity.lateral.isLateral && scheme === '2025') scheme = '2022';

        const engine = await calculateAcademicRecord(
            uMarks,
            { usn, name: s.name, branch: s.branch, scheme },
            { catalogIndex }
        );

        // ── Provenance and cross-checks, per semester ──
        const attempts = attemptsByUsn.get(usn) || new Map();
        const published = publishedByUsn.get(usn) || new Map();
        const provenance = {};
        let staleSemesters = 0;

        for (const sem of Object.keys(engine.semStats).map(Number)) {
            const group = attempts.get(sem) || null;
            const pub = published.get(sem) || null;
            const computed = engine.semStats[sem].sgpa;
            const publishedSgpa = num(pub?.sgpa);
            const delta = (publishedSgpa !== null && publishedSgpa > 0 && computed > 0)
                ? Number(Math.abs(publishedSgpa - computed).toFixed(2))
                : 0;
            if (delta > 0.5) staleSemesters += 1;

            provenance[sem] = {
                semester: sem,
                examName: group?.primary?.exam?.code || null,
                examKind: group?.primary?.exam?.kind || null,
                examUrl: group?.primary?.url || null,
                scrapedAt: group?.primary?.row?.scraped_at || null,
                attemptCount: group?.attemptCount || 0,
                hasRevaluation: Boolean(group?.hasRevaluation),
                // What the derived tables claim, and by how much they disagree with
                // the marks. Shown as provenance; never used as the value.
                publishedSgpa,
                publishedCredits: num(group?.primary?.credits),
                publishedBacklogs: num(pub?.backlog_count),
                sgpaDelta: delta
            };
        }

        const backlogCredits = (engine.activeBacklogSubjects || [])
            .reduce((a, sub) => a + (Number(sub.credits) || 0), 0);

        const sgpaValues = Object.values(engine.semStats).map(x => x.sgpa).filter(v => v > 0);

        records.set(usn, {
            usn,
            name: s.name || usn,
            raw: s,
            identity,
            scheme,

            // ── The canonical numbers. One computation, one origin. ──
            cgpa: engine.cgpa,
            cgpaSource: 'subject_marks + subject_catalog (vtuAcademicEngine)',
            totalRegisteredCredits: engine.totalRegisteredCredits,
            totalEarnedCredits: engine.totalEarnedCredits,
            totalActiveBacklogs: engine.totalActiveBacklogs,
            activeBacklogSubjects: engine.activeBacklogSubjects || [],
            backlogCredits,
            totalSubjects: engine.totalSubjects,
            subjectsFailed: engine.totalActiveBacklogs,
            subjectsCleared: Math.max(0, engine.totalSubjects - engine.totalActiveBacklogs),
            semestersTracked: engine.semestersTracked,
            recordedSemesters,
            bestSgpa: sgpaValues.length ? Math.max(...sgpaValues) : 0,
            semStats: engine.semStats,
            semSGPAs: engine.semSGPAs,
            marksBySemester: engine.marksBySemester,
            unresolvedSubjects: engine.unresolvedSubjects || [],

            // ── Provenance, cross-checks and quality ──
            provenance,
            staleSemesters,
            hasUnresolvedCredits: (engine.unresolvedSubjects || []).length > 0
        });
    }));

    return records;
}

// ── Single-student fast path ─────────────────────────────────────────────────
// Fetches ONLY the rows belonging to one USN, runs the same engine, and
// produces the same record shape. Skips the full-institution buildAll() when
// only one student is needed (student dashboard, faculty detail page).

async function buildSingle(client, usn) {
    const cleanUsn = String(usn || '').toUpperCase().trim();
    if (!cleanUsn) return null;

    // Fetch just this student's data — all 6 queries run in parallel.
    // catalogIndex and branches are shared/cached; the per-student tables use
    // .eq() so Supabase only returns rows for this USN.
    const [studentRes, marksRes, resultsRes, remarksRes, branchesRes, catalogIndex] = await Promise.all([
        client.from('students').select(SELECTS.students).eq('usn', cleanUsn).maybeSingle(),
        client.from('subject_marks').select(SELECTS.subject_marks).eq('usn', cleanUsn),
        client.from('results').select(SELECTS.results).eq('usn', cleanUsn),
        client.from('academic_remarks').select(SELECTS.academic_remarks).eq('student_usn', cleanUsn),
        client.from('branches').select('code, label, usn_codes, aliases, sort_order, is_active'),
        fetchCatalogIndex(client)
    ]);

    const s = studentRes.data;
    if (!s) return null;

    const uMarks   = marksRes.data   || [];
    const results  = resultsRes.data  || [];
    const remarks  = remarksRes.data  || [];
    const branches = branchesRes.data || [];

    configureBranchRegistry(branches);

    // ── Same logic as buildAll, applied to one student ──

    const recordedSemesters = [...new Set(uMarks.map(m => Number(m.semester)).filter(Boolean))].sort((a, b) => a - b);
    const identity = buildStudentIdentity(s, recordedSemesters);

    let scheme = s.scheme;
    if (identity.lateral.isLateral && scheme === '2025') scheme = '2022';

    const engine = await calculateAcademicRecord(
        uMarks,
        { usn: cleanUsn, name: s.name, branch: s.branch, scheme },
        { catalogIndex }
    );

    // Provenance — resolveResultsByStudent works on an array; we pass only this
    // student's result rows so the Map it returns has at most one key.
    const attemptsByUsn = resolveResultsByStudent(results);
    const attempts = attemptsByUsn.get(cleanUsn) || new Map();

    const publishedMap = new Map();
    for (const r of remarks) {
        publishedMap.set(Number(r.semester), r);
    }

    const provenance = {};
    let staleSemesters = 0;

    for (const sem of Object.keys(engine.semStats).map(Number)) {
        const group = attempts.get(sem) || null;
        const pub = publishedMap.get(sem) || null;
        const computed = engine.semStats[sem].sgpa;
        const publishedSgpa = num(pub?.sgpa);
        const delta = (publishedSgpa !== null && publishedSgpa > 0 && computed > 0)
            ? Number(Math.abs(publishedSgpa - computed).toFixed(2))
            : 0;
        if (delta > 0.5) staleSemesters += 1;

        provenance[sem] = {
            semester: sem,
            examName: group?.primary?.exam?.code || null,
            examKind: group?.primary?.exam?.kind || null,
            examUrl: group?.primary?.url || null,
            scrapedAt: group?.primary?.row?.scraped_at || null,
            attemptCount: group?.attemptCount || 0,
            hasRevaluation: Boolean(group?.hasRevaluation),
            publishedSgpa,
            publishedCredits: num(group?.primary?.credits),
            publishedBacklogs: num(pub?.backlog_count),
            sgpaDelta: delta
        };
    }

    const backlogCredits = (engine.activeBacklogSubjects || [])
        .reduce((a, sub) => a + (Number(sub.credits) || 0), 0);

    const sgpaValues = Object.values(engine.semStats).map(x => x.sgpa).filter(v => v > 0);

    return {
        usn: cleanUsn,
        name: s.name || cleanUsn,
        raw: s,
        identity,
        scheme,
        cgpa: engine.cgpa,
        cgpaSource: 'subject_marks + subject_catalog (vtuAcademicEngine)',
        totalRegisteredCredits: engine.totalRegisteredCredits,
        totalEarnedCredits: engine.totalEarnedCredits,
        totalActiveBacklogs: engine.totalActiveBacklogs,
        activeBacklogSubjects: engine.activeBacklogSubjects || [],
        backlogCredits,
        totalSubjects: engine.totalSubjects,
        subjectsFailed: engine.totalActiveBacklogs,
        subjectsCleared: Math.max(0, engine.totalSubjects - engine.totalActiveBacklogs),
        semestersTracked: engine.semestersTracked,
        recordedSemesters,
        bestSgpa: sgpaValues.length ? Math.max(...sgpaValues) : 0,
        semStats: engine.semStats,
        semSGPAs: engine.semSGPAs,
        marksBySemester: engine.marksBySemester,
        unresolvedSubjects: engine.unresolvedSubjects || [],
        provenance,
        staleSemesters,
        hasUnresolvedCredits: (engine.unresolvedSubjects || []).length > 0
    };
}

/** Canonical records for every student, keyed by USN. Shared and cached. */
export function loadStudentRecords(client, { fresh = false } = {}) {
    if (!fresh && recordsCache.promise && (Date.now() - recordsCache.at) < RECORDS_TTL_MS) {
        return recordsCache.promise;
    }
    const promise = buildAll(client).catch(err => {
        recordsCache = { at: 0, promise: null };
        throw err;
    });
    recordsCache = { at: Date.now(), promise };
    return promise;
}

/** The canonical record for one student, or null when the USN is unknown. */
export async function getStudentRecord(client, usn, opts = {}) {
    const all = await loadStudentRecords(client, opts);
    return all.get(String(usn || '').toUpperCase().trim()) || null;
}

/**
 * Direct single-student record — bypasses the full buildAll() warehouse.
 * Returns the same record shape as getStudentRecord(). Use this when only
 * one student is needed and the caller has no use for the full Map.
 *
 * Falls back to the warehouse cache if it is already warm (< TTL) to avoid
 * a redundant single-student fetch when the data is already in memory.
 */
export async function getStudentRecordDirect(client, usn) {
    const cleanUsn = String(usn || '').toUpperCase().trim();
    if (!cleanUsn) return null;

    // If the full warehouse cache is warm, read from it — free.
    if (recordsCache.promise && (Date.now() - recordsCache.at) < RECORDS_TTL_MS) {
        const all = await recordsCache.promise;
        return all.get(cleanUsn) || null;
    }

    // Cold path: build only this student instead of all ~627.
    return buildSingle(client, cleanUsn);
}

/**
 * The flat summary list surfaces render in tables — the same numbers as the full
 * record, projected to the fields a row needs.
 */
export function toSummary(record) {
    if (!record) return null;
    const id = record.identity;
    return {
        usn: record.usn,
        name: record.name,
        branch: id.branch.code || '—',
        branchLabel: id.branch.label,
        batch: id.batch.year,
        batchLabel: id.batch.label,
        semester: id.standing.current || 1,
        declaredSemester: id.standing.declared,
        recordedSemesters: record.recordedSemesters,
        semesterDrift: id.standing.drift,
        lateral_entry: id.lateral.isLateral,
        lateralConfidence: id.lateral.confidence,
        scheme: record.scheme,
        is_inactive: id.isInactive,
        cgpa: record.cgpa > 0 ? record.cgpa : null,
        total_backlogs: record.totalActiveBacklogs,
        backlog_credits: record.backlogCredits,
        credits_earned: record.totalEarnedCredits,
        credits_registered: record.totalRegisteredCredits,
        subjects_cleared: record.subjectsCleared,
        subjects_failed: record.subjectsFailed,
        semesters_tracked: record.semestersTracked,
        best_sgpa: record.bestSgpa,
        failedSubjects: record.activeBacklogSubjects.map(s => s.subjectCode || s.subject_code).filter(Boolean)
    };
}
