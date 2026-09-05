import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from './supabase-utils.js';
import { classify, isFailedSubject } from './vtuGrades.js';
import { calculateAcademicRecord, normalizeBranch } from './vtuAcademicEngine.js';
import { fetchCatalogIndex, resolveSubjectCredit } from './subjectCreditResolver.js';
import { isLateralEntry } from './semester-utils.js';

// Shared analytics data layer — used by every /api/admin/analytics/* route, the
// exports, and risk analysis. Keeps SGPA/CGPA aggregation, backlog derivation,
// scoping, and ranking logic in ONE place. Per-student/raw-subject grade math
// (SGPA-from-marks, grade points, classification) lives in ./vtuGrades — this
// module is for cross-student aggregation and dataset loading only.

// "ALL" is the sentinel several newer faculty-analytics pages (Sections
// Comparison, Eligibility, Reval Impact) use in their branch/batch selectors
// to mean "no filter" — but loadResultAnalysisDataset below matches branch by
// substring (`class.branch.includes(branch)`), so a literal "ALL" filtered
// against real codes like "CS"/"AIML"/"DS" matches nothing and silently
// empties the entire cohort (confirmed: this is exactly why the Leaderboard
// page showed "0 students in scope" — the shared sessionStorage filter store
// carried over branch:'ALL' from another page, and this contract had no way
// to tell that apart from an actual branch code). Normalizing it to undefined
// here fixes every route built on parseFilters/parseFiltersFromBody at once.
function normalizeFilterValue(v) {
    if (!v) return undefined;
    return String(v).trim().toUpperCase() === 'ALL' ? undefined : v;
}

// Parses the common Result Analysis filter contract from request query params.
export function parseFilters(searchParams) {
    return {
        academicYear: normalizeFilterValue(searchParams.get('academicYear')),
        examSession: normalizeFilterValue(searchParams.get('examSession')),
        branch: normalizeFilterValue(searchParams.get('branch')),
        semester: normalizeFilterValue(searchParams.get('semester')),
        classId: normalizeFilterValue(searchParams.get('classId')),
        section: normalizeFilterValue(searchParams.get('section')),
    };
}

// Same filter contract, but from a plain object (POST body) instead of
// URLSearchParams — used by the export routes so every Result Analysis
// endpoint (GET query string or POST body) honors the same 6 filter keys.
export function parseFiltersFromBody(body = {}) {
    return {
        academicYear: normalizeFilterValue(body.academicYear),
        examSession: normalizeFilterValue(body.examSession),
        branch: normalizeFilterValue(body.branch),
        semester: normalizeFilterValue(body.semester),
        classId: normalizeFilterValue(body.classId),
        section: normalizeFilterValue(body.section),
    };
}

let warnedAnonFallback = false;
let _adminClientSingleton = null;

/**
 * True when a real service-role key is configured. When false, every server
 * route silently runs as `anon`, which since the RLS lockdown has no access to
 * results, subject_marks, academic_remarks, classes, class_students or
 * faculty_onboarding - those queries come back HTTP 401 / Postgres 42501 and
 * analytics renders with no data.
 *
 * Exposed so a health check can report the misconfiguration directly rather
 * than leaving it to be diagnosed from an empty dashboard.
 */
export function isUsingServiceRole() {
    return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY);
}

export function getAdminClient() {
    if (_adminClientSingleton) return _adminClientSingleton;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!serviceKey && !warnedAnonFallback) {
        warnedAnonFallback = true;
        console.error(
            '[analytics-data] FATAL CONFIG: neither SUPABASE_SERVICE_ROLE_KEY nor SUPABASE_SERVICE_KEY is set. ' +
            'Falling back to the anon key, which cannot read results, subject_marks, academic_remarks, classes, ' +
            'class_students or faculty_onboarding (RLS returns 42501). Analytics, class rosters and hall-ticket ' +
            'class mode will all return empty. Set the service role key in this environment.'
        );
    }
    _adminClientSingleton = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
        serviceKey || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        {
            global: {
                // Next.js patches the global fetch() and caches responses by
                // default (its Data Cache) independent of whatever
                // Cache-Control header the calling API ROUTE sets on its OWN
                // response — a route's `dynamic = 'force-dynamic'` controls
                // route rendering, not supabase-js's internal REST calls.
                // Without this override, a request that happens to land
                // mid-write (e.g. mid-scrape) can get cached and keep being
                // served indefinitely afterward even though Supabase itself
                // already has the current data. Confirmed: identical query
                // hit directly against Supabase's REST API returned all 34
                // rows; through this client on Vercel it returned only 25,
                // missing every Semester 4 row for 2AB24CS066.
                fetch: (url, init = {}) => fetch(url, { ...init, cache: 'no-store' }),
            },
        }
    );
    return _adminClientSingleton;
}

// Real-time queries against live Supabase database
const _datasetCache = new Map();
const DATASET_CACHE_TTL = 0;

export function invalidateAnalyticsCache() {
    _datasetCache.clear();
}

// Canonical CGPA aggregation from stored per-semester SGPA + per-semester credits.
// This is the ONE weighted-CGPA implementation — every route must import this
// rather than re-deriving it inline.
export function weightedCGPA(remarks, creditsBySem) {
    let weighted = 0, totalCredits = 0;
    for (const r of remarks) {
        const sgpa = Number(r.sgpa) || 0;
        const cr = creditsBySem[r.semester] || 0;
        if (cr > 0) { weighted += sgpa * cr; totalCredits += cr; }
    }
    if (totalCredits > 0) return Math.round((weighted / totalCredits) * 100) / 100;
    if (remarks.length) {
        const avg = remarks.reduce((a, r) => a + (Number(r.sgpa) || 0), 0) / remarks.length;
        return Math.round(avg * 100) / 100;
    }
    return 0;
}

// Canonical backlog derivation with backlog clearing support.
// If a student failed a subject in an earlier semester/attempt but passed it later,
// the outstanding backlog is cleared while keeping the history intact.
export function computeBacklogs(subjectMarksForUsn) {
    const bySemester = {};
    const failedSubjects = [];
    const subjectsMap = {};

    for (const m of (subjectMarksForUsn || [])) {
        const code = (m.subject_code || m.code || '').trim().toUpperCase();
        if (!code) continue;
        const g = (m.grade || '').trim().toUpperCase();
        const ext = Number(m.external ?? m.see_marks) || 0;
        const tot = Number(m.total ?? m.total_marks) || 0;
        const resStr = (m.result || m.result_status || '').trim().toUpperCase();
        const isFail = isFailedSubject(m);
        
        if (!subjectsMap[code]) {
            subjectsMap[code] = { isCleared: false, attempts: [] };
        }
        subjectsMap[code].attempts.push({ ...m, isFail });
        if (!isFail && m.passed !== false) {
            subjectsMap[code].isCleared = true;
        }
    }

    for (const [code, info] of Object.entries(subjectsMap)) {
        if (!info.isCleared) {
            const lastFail = info.attempts[info.attempts.length - 1];
            bySemester[lastFail.semester] = (bySemester[lastFail.semester] || 0) + 1;
            failedSubjects.push({
                subject_code: lastFail.subject_code,
                subject_name: lastFail.subject_name || lastFail.name || lastFail.subject_code,
                semester: lastFail.semester,
                grade: lastFail.grade,
                total: lastFail.total,
                credits: Number(lastFail.credits) || 3
            });
        }
    }
    const totalBacklogs = failedSubjects.length;
    const maxSemesterBacklogs = Object.values(bySemester).reduce((m, v) => Math.max(m, v), 0);
    return { totalBacklogs, maxSemesterBacklogs, bySemester, failedSubjects, isAllClear: totalBacklogs === 0 };
}

// Dynamic ranking: items with identical scores receive the exact same rank.
// Ties are displayed deterministically using tieBreakKey (e.g., USN).
// dense = true assigns (1, 1, 2, 3...) so subsequent medal tiers are not skipped.
export function rankBy(items, keyFn, { ascending = false, tieBreakKey = null, dense = true, precision = 2 } = {}) {
    if (!items || !items.length) return [];

    const normalizeScore = (val) => {
        if (val === null || val === undefined || Number.isNaN(Number(val))) return null;
        const num = Number(val);
        return precision !== null && precision !== undefined ? Number(num.toFixed(precision)) : num;
    };

    const sorted = [...items].sort((a, b) => {
        const rawAv = keyFn(a), rawBv = keyFn(b);
        const av = normalizeScore(rawAv);
        const bv = normalizeScore(rawBv);

        if (av !== null && bv !== null && av !== bv) {
            return ascending ? av - bv : bv - av;
        }
        if (av !== null && bv === null) return -1;
        if (av === null && bv !== null) return 1;

        if (tieBreakKey) {
            const at = String(tieBreakKey(a) || '');
            const bt = String(tieBreakKey(b) || '');
            if (at < bt) return -1;
            if (at > bt) return 1;
        }
        return 0;
    });

    let currentRank = 1;
    let lastValue = null;
    let rankedCount = 0;

    return sorted.map((item) => {
        const rawVal = keyFn(item);
        const val = normalizeScore(rawVal);

        if (val === null) {
            return { ...item, rank: '—' };
        }

        if (rankedCount === 0) {
            currentRank = 1;
            lastValue = val;
        } else if (val === lastValue) {
            // Tied score: keep same rank
        } else {
            currentRank = dense ? (currentRank + 1) : (rankedCount + 1);
            lastValue = val;
        }
        rankedCount++;

        return { ...item, rank: currentRank };
    });
}

/**
 * Batch-loads every table the Result Analysis module needs, once, and applies
 * role scoping + the common filter contract (academicYear, examSession, branch,
 * semester, classId, section). Every analytics endpoint derives its view from
 * this single dataset instead of issuing its own Supabase calls (no N+1).
 *
 * filters: { academicYear, examSession, branch, semester, classId, section }
 */
export async function loadResultAnalysisDataset(client, { role, facultyId, filters = {} } = {}) {
    const cacheKey = `${role || 'all'}:${facultyId || 'all'}:${JSON.stringify(filters || {})}`;
    const now = Date.now();
    const cached = _datasetCache.get(cacheKey);
    if (cached && (now - cached.timestamp) < DATASET_CACHE_TTL) {
        return cached.data;
    }

    const [students, remarks, results, subjectMarks, classes, classStudents, facultyAssignments, examSessions, facultyList, catalogIndex] = await Promise.all([
        fetchAllPaginated('students', 'usn, name, branch, semester, scheme, lateral_entry', client),
        fetchAllPaginated('academic_remarks', 'student_usn, semester, sgpa', client, 'semester', true),
        fetchAllPaginated('results', 'usn, semester, total_credits, exam_session_id', client),
        fetchAllPaginated('subject_marks', 'usn, semester, subject_code, subject_name, internal, external, total, grade, credits, passed, is_backlog, is_makeup, result_id', client),
        // classes has no subject_name/subject_code column — per-subject teaching
        // assignments live in faculty_subject_assignments instead (below).
        fetchAllPaginated('classes', 'id, name, branch, semester, section, faculty_id, academic_year, created_at', client, 'created_at', false),
        fetchAllPaginated('class_students', 'class_id, usn', client),
        // faculty_subject_assignments has no subject_name column; only
        // .faculty_id is ever read off these rows (see findFacultyAssignment
        // callers) — subject display names come from subject_catalog/marks.
        fetchAllPaginated('faculty_subject_assignments', 'id, faculty_id, class_id, subject_code', client),
        // exam_sessions has no start_date/end_date/status columns — only
        // .id/.name are ever read off these rows below.
        fetchAllPaginated('exam_sessions', 'id, name, exam_type, academic_year', client),
        fetchAllPaginated('faculty_onboarding', 'id, full_name, department', client),
        fetchCatalogIndex(client),
    ]);

    const facultyById = {};
    for (const f of facultyList) facultyById[f.id] = f;

    // subject_catalog (via lib/subjectCreditResolver.js) is the single credit
    // authority — resolves exact-code matches AND VTU elective-family variants
    // (e.g. BCS405A -> BCS405X). Subject *names* aren't in the catalog index, so
    // this falls back to the most common name seen on a real mark for that code.
    const subjectNameByCode = {};
    for (const m of subjectMarks) {
        const code = (m.subject_code || '').toUpperCase().trim();
        if (code && m.subject_name && !subjectNameByCode[code]) subjectNameByCode[code] = m.subject_name;
    }
    function lookupSubjectCatalog({ code, branch, semester, scheme }) {
        // subject_catalog.branch is always a short code — students.branch/mode()
        // output here can be a raw USN-derived code or a full label.
        const normBranch = normalizeBranch(branch);
        const resolved = resolveSubjectCredit(catalogIndex, { scheme, branch: normBranch, semester, subject_code: code });
        if (resolved.source === 'unresolved') return null;
        return { code, credits: resolved.credits, creditSource: resolved.source, name: subjectNameByCode[(code || '').toUpperCase().trim()] || null };
    }

    // Precompute each student's canonical academic record ONCE — the exact same
    // function (lib/vtuAcademicEngine.js) Student Results and Class Section use —
    // so CGPA/earned-credits/backlogs agree everywhere. One catalog fetch above,
    // pure in-memory computation here — no per-student queries.
    const marksByUsnForRecord = {};
    for (const m of subjectMarks) (marksByUsnForRecord[m.usn] ||= []).push(m);
    const recordsByUsn = {};
    await Promise.all(students.map(async s => {
        const studMarks = marksByUsnForRecord[s.usn] || [];
        let effScheme = s.scheme;
        if (isLateralEntry(s.usn, s.lateral_entry) && effScheme === '2025') {
            effScheme = '2022';
        }
        recordsByUsn[s.usn] = await calculateAcademicRecord(studMarks, { usn: s.usn, branch: s.branch, scheme: effScheme }, { catalogIndex });
    }));

    // Faculty access is deliberately flat and broad in this app — any
    // authenticated faculty member can view any student/class/roster, not just
    // their own assigned classes. There used to be a role==='faculty' restriction
    // here that scoped every admin-analytics page (Overview, Students, Classes,
    // Subjects, Faculty, Rankings, Backlogs, Charts, Risk, Leaderboard, exports,
    // Reports) down to only the calling faculty's own classes — inconsistent
    // with that policy, and inconsistent with sibling routes like merit-list
    // (fetchDynamicStudents) which never applied such a restriction. Removed so
    // every route sharing this dataset behaves the same way for every faculty
    // member: full institutional visibility, filtered only by the explicit
    // branch/semester/section/etc. params a caller actually passes.

    // ── Index maps ──
    const classesById = {};
    for (const c of classes) classesById[c.id] = c;

    const classIdsByUsn = {};
    for (const cs of classStudents) (classIdsByUsn[cs.usn] ||= []).push(cs.class_id);

    const examSessionsById = {};
    for (const e of examSessions) examSessionsById[e.id] = e;

    const remarksByUsn = {};
    for (const r of remarks) (remarksByUsn[r.student_usn] ||= []).push(r);

    const creditsByUsnSem = {};
    for (const res of results) {
        (creditsByUsnSem[res.usn] ||= {});
        creditsByUsnSem[res.usn][res.semester] = Math.max(creditsByUsnSem[res.usn][res.semester] || 0, res.total_credits || 0);
    }
    const usnsWithResults = new Set(results.map(r => r.usn));
    const examSessionIdsByUsnSem = {};
    for (const r of results) {
        if (!r.exam_session_id) continue;
        (examSessionIdsByUsnSem[r.usn] ||= {});
        examSessionIdsByUsnSem[r.usn][r.semester] = r.exam_session_id;
    }

    const marksByUsn = {};
    for (const m of subjectMarks) (marksByUsn[m.usn] ||= []).push(m);

    // ── Apply filters to determine the scoped set of USNs and classes ──
    const { academicYear, examSession, branch, semester, classId, section } = filters;

    let filteredClasses = classes;
    if (branch) filteredClasses = filteredClasses.filter(c => (c.branch || '').toUpperCase().includes(String(branch).toUpperCase()));
    if (semester) filteredClasses = filteredClasses.filter(c => String(c.semester) === String(semester));
    if (section) filteredClasses = filteredClasses.filter(c => (c.section || '').toUpperCase() === String(section).toUpperCase());
    if (academicYear) filteredClasses = filteredClasses.filter(c => (c.academic_year || '') === String(academicYear));
    if (classId) filteredClasses = filteredClasses.filter(c => c.id === classId);

    const classFilterActive = !!(branch || semester || section || academicYear || classId);
    const filteredClassIds = new Set(filteredClasses.map(c => c.id));
    const usnsInFilteredClasses = classFilterActive
        ? new Set(classStudents.filter(cs => filteredClassIds.has(cs.class_id)).map(cs => cs.usn))
        : null;

    let scopedStudents = students.filter(s => {
        if (branch && !(s.branch || '').toUpperCase().includes(String(branch).toUpperCase())) return false;
        if (semester && String(s.semester) !== String(semester)) return false;
        if (usnsInFilteredClasses && !usnsInFilteredClasses.has(s.usn)) return false;
        return true;
    });

    if (examSession) {
        const sessionIds = new Set(examSessions.filter(e => e.name === examSession || e.id === examSession).map(e => e.id));
        scopedStudents = scopedStudents.filter(s => {
            const bySem = examSessionIdsByUsnSem[s.usn] || {};
            return Object.values(bySem).some(id => sessionIds.has(id));
        });
    }

    const dataset = {
        students: scopedStudents,
        allStudents: students,
        classes: filteredClasses,
        allClasses: classes,
        classesById,
        classIdsByUsn,
        classStudents,
        remarksByUsn,
        creditsByUsnSem,
        usnsWithResults,
        marksByUsn,
        subjectMarks,
        facultyAssignments,
        examSessions,
        examSessionsById,
        facultyById,
        lookupSubjectCatalog,
        catalogIndex,
        recordsByUsn,
        filters,
    };

    _datasetCache.set(cacheKey, { timestamp: Date.now(), data: dataset });
    return dataset;
}

// Most frequent value in a list (ties broken by first-seen). Used to attribute
// a subject's aggregate row to a single branch/semester for faculty lookup.
export function mode(values) {
    const counts = new Map();
    let best = null, bestCount = 0;
    for (const v of values) {
        if (v === null || v === undefined) continue;
        const c = (counts.get(v) || 0) + 1;
        counts.set(v, c);
        if (c > bestCount) { best = v; bestCount = c; }
    }
    return best;
}

export function average(values) {
    const nums = values.filter(v => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
    if (!nums.length) return null;
    return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

// Finds the faculty_subject_assignments row for a subject, falling back to
// "Unassigned" (per spec) when no assignment matches.
export function findFacultyAssignment(assignments, { subjectCode, branch, semester, scheme }) {
    return assignments.find(a =>
        a.subject_code === subjectCode &&
        (!branch || a.branch === branch) &&
        (!semester || String(a.semester) === String(semester)) &&
        (!scheme || !a.scheme || a.scheme === scheme)
    ) || null;
}

/**
 * Derives the completed per-student analytics row (Student Analysis fields).
 */
export function buildStudentRow(s, dataset) {
    const rem = dataset.remarksByUsn[s.usn] || [];
    const marks = dataset.marksByUsn[s.usn] || [];
    const record = dataset.recordsByUsn[s.usn] || null;

    // Canonical values (lib/vtuAcademicEngine.js) — credits resolved fresh from
    // subject_catalog, backlog derived subject-result-based. Falls back to the
    // pre-existing cache-based figures only when there's no record at all (e.g.
    // a student with zero subject_marks rows), so the UI still shows something
    // rather than a hard zero.
    // Existing, unmodified CGPA formula (weightedCGPA) — fed live per-semester
    // SGPA/credits from the canonical record instead of the stale
    // academic_remarks/results caches, so it never diverges from a second,
    // different CGPA computation.
    let cgpa;
    if (record) {
        const remarks = Object.entries(record.semStats).map(([sem, st]) => ({ semester: Number(sem), sgpa: st.sgpa }));
        const creditsBySem = {};
        Object.entries(record.semStats).forEach(([sem, st]) => { creditsBySem[sem] = st.totalCredits; });
        cgpa = weightedCGPA(remarks, creditsBySem);
    } else {
        cgpa = weightedCGPA(rem, dataset.creditsByUsnSem[s.usn] || {});
    }
    const totalBacklogs = record ? record.totalActiveBacklogs : computeBacklogs(marks).totalBacklogs;
    const failedSubjects = record
        ? record.activeBacklogSubjects.map(sub => ({ subject_code: sub.subjectCode, subject_name: sub.subjectName, semester: sub.semester, grade: sub.grade, total: sub.totalMarks }))
        : computeBacklogs(marks).failedSubjects;
    const maxSemesterBacklogs = record
        ? Object.values(record.semStats).reduce((m, st) => Math.max(m, st.backlogs), 0)
        : computeBacklogs(marks).maxSemesterBacklogs;
    const isAllClear = totalBacklogs === 0;
    const totalCredits = record ? record.totalRegisteredCredits : Object.values(dataset.creditsByUsnSem[s.usn] || {}).reduce((a, b) => a + b, 0);
    const earnedCredits = record ? record.totalEarnedCredits : marks.filter(m => m.passed).reduce((a, m) => a + (m.credits || 0), 0);
    const classIds = dataset.classIdsByUsn[s.usn] || [];
    const studentClasses = classIds.map(id => dataset.classesById[id]).filter(Boolean);
    const primaryClass = studentClasses[0] || null;
    const { code: classificationCode, label: classificationLabel } = classify(cgpa);

    // "Current" SGPA = the canonical record's highest tracked semester, falling
    // back to the academic_remarks cache only when there's no record at all.
    let currentSgpa = null;
    if (record) {
        const semNums = Object.keys(record.semStats).map(Number);
        if (semNums.length) currentSgpa = record.semStats[Math.max(...semNums)].sgpa;
    } else if (rem.length) {
        currentSgpa = rem.reduce((latest, r) => (r.semester ?? -1) > (latest.semester ?? -1) ? r : latest).sgpa;
    }

    return {
        usn: s.usn,
        name: s.name || '',
        branch: s.branch || '',
        semester: s.semester ?? '',
        section: primaryClass?.section || '',
        batch: primaryClass?.batch || '',
        class_name: primaryClass?.name || null,
        sgpa: currentSgpa,
        cgpa,
        total_credits: totalCredits,
        earned_credits: earnedCredits,
        backlog_count: totalBacklogs,
        total_backlogs: totalBacklogs, // back-compat alias for existing risk/export consumers
        max_semester_backlogs: maxSemesterBacklogs,
        failed_subjects: failedSubjects,
        result_status: isAllClear ? 'CLEAR' : 'BACKLOG',
        classification: classificationCode,
        classification_label: classificationLabel,
        is_all_clear: isAllClear,
        has_results: dataset.usnsWithResults.has(s.usn),
        lateral_entry: isLateralEntry(s.usn, s.lateral_entry),
    };
}

/**
 * Builds per-student analytics rows, scoped by role + optional filters.
 * Kept for backward compatibility with existing callers (risk route, exports).
 * @returns {{ students: Array, classes: Array, classStudents: Array }}
 */
export async function getStudentAnalytics(client, { role, facultyId, filters = {} } = {}) {
    const dataset = await loadResultAnalysisDataset(client, { role, facultyId, filters });
    const rows = dataset.students.map(s => buildStudentRow(s, dataset));
    return { students: rows, classes: dataset.allClasses, classStudents: dataset.classStudents };
}

// Maps whatever alias a caller's branch filter might use (AIML, CSE, ECE,
// EEE, MECH, CIVIL, CI, CD, ...) to the same canonical short code
// normalizeBranch() below produces for a student, so the two sides of the
// comparison always speak the same language.
function canonicalBranchFilter(branch) {
    const b = String(branch || '').toUpperCase().trim();
    if (b === 'AI' || b === 'AIML' || b === 'CI') return 'AI';
    if (b === 'CD' || b === 'CSD') return 'CD';
    if (b === 'DS') return 'DS';
    if (b === 'CS' || b === 'CSE') return 'CS';
    if (b === 'EC' || b === 'ECE' || b === 'ENC') return 'EC';
    if (b === 'EE' || b === 'EEE') return 'EE';
    if (b === 'CV' || b === 'CIVIL') return 'CV';
    if (b === 'ME' || b === 'MECH') return 'ME';
    if (b === 'RI' || b === 'ROBOTICS') return 'RI';
    return b;
}

/**
 * Dynamically fetches all students matching an optional branch without arbitrary row limits.
 * Paginates automatically in 1000-row chunks so databases with any number of students load completely.
 *
 * Branch matching is done in JS via the same canonical normalizeBranch()
 * (lib/vtuAcademicEngine.js) that resolves every student's branch for
 * SGPA/CGPA/credit purposes — never raw SQL ilike substring matching. This
 * used to build `.or('branch.ilike.%CI%', 'usn.ilike.%AI%', ...)` clauses,
 * which collide badly against real free-text branch labels on file: "CI" (the
 * short code some students' branch is stored as) matches as a bare substring
 * inside "Data SCIence" and "CIvil Engineering", so filtering for the "AI"
 * branch was silently pulling in ~40% of Civil and Data Science students too
 * (confirmed against live data: 389 of 556 students matched an "AI" filter
 * that should have matched ~150). Exact canonical-code comparison in JS
 * eliminates that entire class of false positive.
 */
export async function fetchDynamicStudents(supabaseAdmin, { branch = '', select = 'id, usn, name, branch, semester, year, lateral_entry' } = {}) {
    const selectWithUsn = select.includes('usn') ? select : `${select}, usn`;
    const allStudents = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
        const { data, error } = await supabaseAdmin.from('students').select(selectWithUsn).range(from, from + pageSize - 1);
        if (error) {
            console.error('fetchDynamicStudents error:', error);
            throw error;
        }
        if (data && data.length > 0) allStudents.push(...data);
        if (!data || data.length < pageSize) break;
        from += pageSize;
    }

    if (!branch || String(branch).toUpperCase().trim() === 'ALL') return allStudents;

    const target = canonicalBranchFilter(branch);
    return allStudents.filter(s => normalizeBranch(s.branch, s.usn) === target);
}

/**
 * Dynamically fetches marks for a list of USNs without URL-length overflow.
 * Automatically chunks large USN lists and paginates ranges.
 */
export async function fetchDynamicMarks(supabaseAdmin, { usns = [], semester = null, select = '*' } = {}) {
    if (!usns || usns.length === 0) return [];
    const uniqueUsns = [...new Set(usns.filter(Boolean))];
    if (uniqueUsns.length === 0) return [];

    const chunkSize = 150;
    const chunks = [];
    for (let i = 0; i < uniqueUsns.length; i += chunkSize) {
        chunks.push(uniqueUsns.slice(i, i + chunkSize));
    }

    const pageSize = 1000;
    const chunkPromises = chunks.map(async (chunk) => {
        let chunkData = [];
        let from = 0;
        while (true) {
            let q = supabaseAdmin
                .from('subject_marks')
                .select(select)
                .in('usn', chunk)
                .order('id', { ascending: true });
            
            if (semester !== null && semester !== undefined && semester !== 'all') {
                q = q.eq('semester', semester);
            }
            q = q.range(from, from + pageSize - 1);

            const { data, error } = await q;
            if (error) {
                console.error('fetchDynamicMarks chunk error:', error);
                throw error;
            }
            if (data && data.length > 0) {
                chunkData.push(...data);
            }
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }
        return chunkData;
    });

    const results = await Promise.all(chunkPromises);
    return results.flat();
}
