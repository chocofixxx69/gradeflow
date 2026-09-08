// lib/vtu-results.js
//
// Resolves the `results` table into ONE authoritative row per (usn, semester).
//
// `results` is a scrape log, not a keyed table. The live database holds 4,047 rows
// covering only 2,394 distinct (usn, semester) pairs: 803 pairs carry between 2 and
// 15 rows each, because VTU publishes the same semester several times - the regular
// announcement, revaluation, makeup and supplementary rounds each land as their own
// row with their own exam URL and SGPA.
//
// Every consumer that built a `usn|semester -> row` map by iterating and assigning
// therefore kept whichever row the database happened to return last. Measured
// against the live data, that arbitrary choice lands on a worse or zero-SGPA row for
// 356 of the 803 contested semesters - including 191 where the most recent scrape
// stored 0 while an older one holds a real SGPA, which is why "just take the latest
// scraped_at" is equally wrong.
//
// The resolution below encodes what the exam names actually mean:
//
//   revaluation   *RV*        supersedes the round it revalues - VTU republishes the
//                             corrected SGPA under an RV code
//   makeup        MakeUp*     a re-sit covering only the subjects that were failed
//   supplementary SE*         the supplementary/backlog-clearing round
//   regular       everything  the original announcement for the semester
//
// A row with no SGPA *and* no credits is an unpublished placeholder from a scrape
// that found nothing, and is discarded before any of the above is considered.

export const EXAM_KINDS = {
    REVALUATION: 'revaluation',
    MAKEUP: 'makeup',
    SUPPLEMENTARY: 'supplementary',
    REGULAR: 'regular'
};

/** Precedence when several rounds published a result for the same semester. */
const KIND_RANK = {
    [EXAM_KINDS.REVALUATION]: 4,
    [EXAM_KINDS.MAKEUP]: 3,
    [EXAM_KINDS.SUPPLEMENTARY]: 2,
    [EXAM_KINDS.REGULAR]: 1
};

const KIND_LABELS = {
    [EXAM_KINDS.REVALUATION]: 'Revaluation',
    [EXAM_KINDS.MAKEUP]: 'Makeup',
    [EXAM_KINDS.SUPPLEMENTARY]: 'Supplementary',
    [EXAM_KINDS.REGULAR]: 'Regular'
};

/**
 * Classifies a VTU exam code. Matching is ordered most-specific first: "SERVcbcs25"
 * is a revaluation OF the supplementary round, so the RV test has to win over the
 * SE test, and "MakeUpEcbcs25" must not be caught by a bare "E" heuristic.
 */
export function classifyExam(examName) {
    const name = String(examName || '').trim();
    if (!name) return { kind: EXAM_KINDS.REGULAR, label: KIND_LABELS[EXAM_KINDS.REGULAR], rank: KIND_RANK[EXAM_KINDS.REGULAR], code: '' };

    const upper = name.toUpperCase();
    let kind = EXAM_KINDS.REGULAR;
    if (/RV/.test(upper)) kind = EXAM_KINDS.REVALUATION;
    else if (/MAKEUP/.test(upper)) kind = EXAM_KINDS.MAKEUP;
    else if (/^SE/.test(upper)) kind = EXAM_KINDS.SUPPLEMENTARY;

    return { kind, label: KIND_LABELS[kind], rank: KIND_RANK[kind], code: name };
}

function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function timestamp(v) {
    const t = new Date(v || 0).getTime();
    return Number.isFinite(t) ? t : 0;
}

/**
 * Picks the authoritative row out of every attempt published for one semester, and
 * returns the discarded ones alongside it so the UI can show the real exam history
 * rather than pretending a single row was all there ever was.
 */
export function resolveAttempts(rows = []) {
    const attempts = (rows || []).map(r => {
        const exam = classifyExam(r.exam_name);
        return {
            row: r,
            exam,
            sgpa: num(r.sgpa),
            credits: num(r.total_credits),
            scrapedAt: timestamp(r.scraped_at),
            url: r.exam_url || null
        };
    });

    if (attempts.length === 0) {
        return { primary: null, attempts: [], attemptCount: 0, hasRevaluation: false, kinds: [], contested: false };
    }

    // A row carrying neither an SGPA nor any credits is a scrape that found nothing.
    const published = attempts.filter(a => (a.sgpa ?? 0) > 0 || (a.credits ?? 0) > 0);
    const pool = published.length > 0 ? published : attempts;

    const ranked = [...pool].sort((a, b) =>
        (b.exam.rank - a.exam.rank) ||
        (b.scrapedAt - a.scrapedAt) ||
        ((b.sgpa ?? 0) - (a.sgpa ?? 0))
    );

    const primary = ranked[0];
    return {
        primary,
        attempts: attempts.sort((a, b) => b.scrapedAt - a.scrapedAt),
        attemptCount: attempts.length,
        publishedCount: published.length,
        hasRevaluation: attempts.some(a => a.exam.kind === EXAM_KINDS.REVALUATION && ((a.sgpa ?? 0) > 0 || (a.credits ?? 0) > 0)),
        kinds: [...new Set(attempts.map(a => a.exam.kind))],
        contested: attempts.length > 1
    };
}

/**
 * Groups raw `results` rows by (usn, semester) and resolves each group.
 * Returns Map<usn, Map<semester, resolvedGroup>>.
 */
export function resolveResultsByStudent(resultRows = []) {
    const grouped = new Map();
    for (const r of resultRows || []) {
        const usn = String(r.usn || '').toUpperCase().trim();
        const sem = Number(r.semester);
        if (!usn || !Number.isFinite(sem) || sem < 1) continue;
        const perStudent = grouped.get(usn) || new Map();
        const list = perStudent.get(sem) || [];
        list.push(r);
        perStudent.set(sem, list);
        grouped.set(usn, perStudent);
    }

    const resolved = new Map();
    for (const [usn, perStudent] of grouped) {
        const out = new Map();
        for (const [sem, rows] of perStudent) out.set(sem, resolveAttempts(rows));
        resolved.set(usn, out);
    }
    return resolved;
}

/**
 * THE per-(usn, semester) academic record every route should read.
 *
 * SGPA precedence, and why:
 *   1. a revaluation result - VTU republishes the corrected SGPA under an RV code
 *      and that supersedes whatever was announced first;
 *   2. `academic_remarks.sgpa` - the deduplicated published table (2,345 rows, no
 *      duplicate keys), which is what the rest of the app already treats as the
 *      semester's official number;
 *   3. the resolved `results` row for semesters `academic_remarks` never received.
 *
 * `sgpaSource` and `sgpaConflict` are carried on every entry so a disagreement
 * between the two tables is visible instead of being silently resolved away.
 */
export function buildSemesterIndex({ results = [], remarks = [], marks = [] } = {}) {
    const resolvedResults = resolveResultsByStudent(results);

    const remarkIndex = new Map();
    for (const r of remarks || []) {
        const usn = String(r.student_usn || '').toUpperCase().trim();
        const sem = Number(r.semester);
        if (!usn || !Number.isFinite(sem) || sem < 1) continue;
        const perStudent = remarkIndex.get(usn) || new Map();
        perStudent.set(sem, r);
        remarkIndex.set(usn, perStudent);
    }

    const marksIndex = new Map();
    for (const m of marks || []) {
        const usn = String(m.usn || '').toUpperCase().trim();
        const sem = Number(m.semester);
        if (!usn || !Number.isFinite(sem) || sem < 1) continue;
        const perStudent = marksIndex.get(usn) || new Map();
        const list = perStudent.get(sem) || [];
        list.push(m);
        perStudent.set(sem, list);
        marksIndex.set(usn, perStudent);
    }

    const usns = new Set([...resolvedResults.keys(), ...remarkIndex.keys(), ...marksIndex.keys()]);
    const index = new Map();

    for (const usn of usns) {
        const perResults = resolvedResults.get(usn) || new Map();
        const perRemarks = remarkIndex.get(usn) || new Map();
        const perMarks = marksIndex.get(usn) || new Map();
        const semesters = new Set([...perResults.keys(), ...perRemarks.keys(), ...perMarks.keys()]);

        const out = new Map();
        for (const sem of [...semesters].sort((a, b) => a - b)) {
            const group = perResults.get(sem) || null;
            const remark = perRemarks.get(sem) || null;
            const semMarks = perMarks.get(sem) || [];

            const resultSgpa = group?.primary ? group.primary.sgpa : null;
            const remarkSgpa = num(remark?.sgpa);

            let sgpa = null;
            let sgpaSource = 'none';
            if (group?.hasRevaluation && resultSgpa !== null && resultSgpa > 0) {
                sgpa = resultSgpa;
                sgpaSource = 'revaluation';
            } else if (remarkSgpa !== null && remarkSgpa > 0) {
                sgpa = remarkSgpa;
                sgpaSource = 'academic_remarks';
            } else if (resultSgpa !== null && resultSgpa > 0) {
                sgpa = resultSgpa;
                sgpaSource = 'results';
            } else if (remarkSgpa !== null) {
                sgpa = remarkSgpa;
                sgpaSource = 'academic_remarks';
            } else if (resultSgpa !== null) {
                sgpa = resultSgpa;
                sgpaSource = 'results';
            }

            const conflict = (resultSgpa !== null && resultSgpa > 0 && remarkSgpa !== null && remarkSgpa > 0)
                ? Math.abs(resultSgpa - remarkSgpa)
                : 0;

            out.set(sem, {
                semester: sem,
                sgpa,
                sgpaSource,
                sgpaConflict: conflict > 0.005 ? Number(conflict.toFixed(2)) : 0,
                resultSgpa,
                remarkSgpa,
                credits: group?.primary ? group.primary.credits : null,
                backlogCount: num(remark?.backlog_count),
                isAllClear: remark?.is_all_clear ?? null,
                subjectCount: semMarks.length,
                hasMarks: semMarks.length > 0,
                examName: group?.primary?.exam?.code || null,
                examKind: group?.primary?.exam?.kind || null,
                examUrl: group?.primary?.url || null,
                scrapedAt: group?.primary?.row?.scraped_at || null,
                attemptCount: group?.attemptCount || 0,
                hasRevaluation: Boolean(group?.hasRevaluation),
                contested: Boolean(group?.contested)
            });
        }

        index.set(usn, out);
    }

    return index;
}

/** The semesters a student has any academic evidence for, ascending. */
export function recordedSemestersFor(semesterIndex, usn) {
    const per = semesterIndex.get(String(usn || '').toUpperCase().trim());
    if (!per) return [];
    return [...per.keys()].sort((a, b) => a - b);
}

/**
 * Cumulative GPA over a student's resolved semesters, weighted by each semester's
 * own credit load. Semesters with no SGPA are skipped rather than counted as zero,
 * and a semester whose credit total is missing falls back to an equal weight so one
 * unrecorded credit figure cannot silently erase the semester from the average.
 */
export function cumulativeGPA(perSemester) {
    const entries = [...(perSemester?.values?.() || perSemester || [])]
        .filter(e => Number.isFinite(e.sgpa) && e.sgpa > 0);
    if (entries.length === 0) return { cgpa: null, credits: 0, semesters: 0 };

    const withCredits = entries.filter(e => Number.isFinite(e.credits) && e.credits > 0);
    if (withCredits.length === entries.length) {
        const totalCredits = withCredits.reduce((a, e) => a + e.credits, 0);
        const weighted = withCredits.reduce((a, e) => a + e.sgpa * e.credits, 0);
        return { cgpa: Number((weighted / totalCredits).toFixed(2)), credits: totalCredits, semesters: entries.length };
    }

    const avg = entries.reduce((a, e) => a + e.sgpa, 0) / entries.length;
    return {
        cgpa: Number(avg.toFixed(2)),
        credits: withCredits.reduce((a, e) => a + e.credits, 0),
        semesters: entries.length
    };
}
