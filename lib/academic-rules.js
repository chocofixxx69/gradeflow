// Canonical academic-rule implementations for the Result Analysis module.
//
// This file does not reimplement grading logic that already has a single correct
// home elsewhere — it re-exports vtuGrades.js (grade mapping, grade points, SGPA)
// and analytics-data.js (credit-weighted CGPA), and adds only the small set of
// pure functions Result Analysis needs that don't exist anywhere yet (subject
// average, pass/arrear/withheld predicates, ranking tie-break, percentage rounding).
//
// See the Result Analysis audit for why each of these was chosen over the other
// conflicting implementations found in the repo (batch-parse's GP map, the
// faculty/reports/page.jsx inline pass-grade lists, engine.py's backlog set, etc.)
// — those are left untouched; this module is authoritative for Result Analysis only.

export {
    unifyGrade,
    getGradePoint,
    calculateSGPA,
    calculatePercentage,
} from './vtuGrades';

export { weightedCGPA } from './analytics-data';

import { unifyGrade } from './vtuGrades';

/** Percentage rounded to one decimal place. Returns 0 when the denominator is 0. */
export function pct(numerator, denominator) {
    return denominator ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

/** A subject attempt counts toward pass/fail once a result is out (not Withheld). */
export function isAppeared(grade) {
    return unifyGrade(grade) !== 'W';
}

export function isPass(grade) {
    return unifyGrade(grade) === 'P';
}

/** Arrear/backlog = Fail or Absent. Withheld/Not-Eligible are excluded (result not final). */
export function isArrear(grade) {
    return ['F', 'A'].includes(unifyGrade(grade));
}

export function isWithheld(grade) {
    return unifyGrade(grade) === 'W';
}

/** Mean of `total` across appeared (non-Withheld) subject_marks rows for one subject. */
export function subjectAverageMarks(marksRows) {
    const appeared = marksRows.filter(m => isAppeared(m.grade));
    if (appeared.length === 0) return 0;
    const sum = appeared.reduce((a, m) => a + (Number(m.total) || 0), 0);
    return Math.round((sum / appeared.length) * 100) / 100;
}

/** cgpa >= 7.75 First Class Distinction, >= 6.75 First Class, else Second Class. */
export function classifyCgpa(cgpa) {
    const v = Number(cgpa) || 0;
    if (v >= 7.75) return 'FCD';
    if (v >= 6.75) return 'FC';
    return 'SC';
}

/**
 * Canonical Result Analysis ranking tie-break: total marks desc, then fewer
 * arrears, then USN asc. Matches the rule already documented/shipped in the
 * original lib/result-analysis.js top-10 logic.
 */
export function compareForRanking(a, b) {
    return (b.total_marks - a.total_marks) || (a.arrears - b.arrears) || String(a.usn).localeCompare(String(b.usn));
}
