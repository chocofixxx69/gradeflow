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
} from './vtuGrades.js';

export { weightedCGPA } from './analytics-data.js';
export {
    VTU_SUPPORTED_BRANCHES,
    OFFICIAL_CREDITS_LOOKUP,
    VTU_OFFICIAL_SUBJECT_DATA,
    getOfficialCredit
} from './vtu-curriculum-catalog.js';

import { unifyGrade } from './vtuGrades.js';
import { getOfficialCredit } from './vtu-curriculum-catalog.js';

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

/**
 * Accurately determines the VTU exam cycle index (1-based chronological index).
 * e.g., Cycle 1 = Dec 23/Jan 24 (Sem 1), Cycle 2 = June/July 24 (Sem 2), 
 * Cycle 3 = Dec 24/Jan 25 (Sem 3), Cycle 4 = June/July 25 (Sem 4),
 * Cycle 4.5 = Makeup 2025, Cycle 5 = Dec 25/Jan 26 (Sem 5), Cycle 6 = May/June 26 (Sem 6).
 * Note: Revaluations (RV/Reval) evaluate the same written paper and stay in the same base cycle.
 */
export function getExamCycleIndex(examName, dateStr) {
    const norm = String(examName || '').toUpperCase().replace(/\s+/g, '');
    
    // Check specific exam codes (Revaluations map to their base exam cycle)
    if (norm.includes('DJCBCS24') || norm.includes('DJ24') || norm.includes('DEC23') || norm.includes('JAN24') || norm.includes('DEC/JAN2024') || norm.includes('DJRV24') || norm.includes('DJRVCBCS24')) return 1;
    if (norm.includes('JJECBCS24') || norm.includes('JJ24') || norm.includes('JUNE24') || norm.includes('JULY24') || norm.includes('JUNE/JULY2024') || norm.includes('JJRV24') || norm.includes('JJRVCBCS24')) return 2;
    if (norm.includes('DJCBCS25') || norm.includes('DJ25') || norm.includes('DEC24') || norm.includes('JAN25') || norm.includes('DEC/JAN2025') || norm.includes('DJRV25') || norm.includes('DJRVCBCS25')) return 3;
    if (norm.includes('JJECBCS25') || norm.includes('JJ25') || norm.includes('JUNE25') || norm.includes('JULY25') || norm.includes('JUNE/JULY2025') || norm.includes('JJRV25') || norm.includes('JJRVCBCS25')) return 4;
    if (norm.includes('MAKEUP') || norm.includes('MAKEUPECBCS25') || norm.includes('MAKEUPECBCS24')) return 4.5;
    if (norm.includes('D25J26') || norm.includes('DJ26') || norm.includes('DEC25') || norm.includes('JAN26') || norm.includes('DEC/JAN2026') || norm.includes('D25J26RV')) return 5;
    if (norm.includes('MJ26') || norm.includes('JJ26') || norm.includes('JUNE26') || norm.includes('JULY26') || norm.includes('MAY/JUNE2026') || norm.includes('MJ26RV')) return 6;
    if (norm.includes('D26J27') || norm.includes('DJ27')) return 7;
    if (norm.includes('MJ27') || norm.includes('JJ27')) return 8;

    // Check date string if available
    if (dateStr) {
        const d = String(dateStr);
        if (d.startsWith('2024-01') || d.startsWith('2024-02') || d.startsWith('2024-03')) return 1;
        if (d.startsWith('2024-06') || d.startsWith('2024-07') || d.startsWith('2024-08')) return 2;
        if (d.startsWith('2025-01') || d.startsWith('2025-02') || d.startsWith('2025-03')) return 3;
        if (d.startsWith('2025-06') || d.startsWith('2025-07') || d.startsWith('2025-08')) return 4;
        if (d.startsWith('2025-09') || d.startsWith('2025-10') || d.startsWith('2025-11') || d.startsWith('2025-12')) return 4.5;
        if (d.startsWith('2026-01') || d.startsWith('2026-02') || d.startsWith('2026-03')) return 5;
        if (d.startsWith('2026-05') || d.startsWith('2026-06') || d.startsWith('2026-07')) return 6;
    }

    return 0;
}

/**
 * Calculates actual attempt count for a subject based on its curriculum semester,
 * recorded exam session, announcement date, grade result, maximum student semester,
 * and any physical duplicate attempts.
 *
 * VTU Rule: Revaluation (RV/Reval) is a re-check of the existing paper, so passing
 * or failing via Revaluation in the same exam cycle remains the SAME attempt (e.g. 1st Attempt).
 * Only re-writing the exam in a makeup exam or subsequent backlog semester increments the attempt count.
 */
export function calculateVTUAttempts(subjectCode, curriculumSem, examName, dateStr, grade = 'P', maxStudentSem = 1, physicalAttemptsCount = 1) {
    const code = String(subjectCode || '').toUpperCase().trim();
    const cleanExam = String(examName || '').toUpperCase();
    const g = String(grade || '').toUpperCase();
    const isFail = g === 'F' || g === 'A' || g === 'FAIL' || g === 'ABSENT';
    
    let curSem = Number(curriculumSem);
    if (!curSem || curSem < 1 || curSem > 8) {
        const m = code.match(/^[0-9]{2,3}[A-Z]{2,3}(\d)\d/i) || code.match(/^[A-Z]{2,3}(\d)\d/i);
        if (m && m[1]) curSem = parseInt(m[1], 10);
    }
    curSem = curSem || 1;

    const examCycle = getExamCycleIndex(cleanExam, dateStr);
    const isMakeup = cleanExam.includes('MAKEUP') || (dateStr && (dateStr.startsWith('2025-10') || dateStr.startsWith('2025-11')));

    let calculatedAttempts = 1;

    // If passed / recorded in a later semester's exam cycle:
    if (examCycle > curSem) {
        const semDifference = Math.floor(examCycle) - curSem;
        calculatedAttempts = 1 + semDifference;
        if (isMakeup) {
            calculatedAttempts += 1;
        }
    } else if (isMakeup) {
        // Makeup exam in the same semester is an explicit second sitting
        calculatedAttempts = 2;
    }

    // If STILL FAILED and student has advanced to higher semesters:
    if (isFail && maxStudentSem > curSem) {
        const semDifference = maxStudentSem - curSem;
        const failAttempts = 1 + semDifference;
        calculatedAttempts = Math.max(calculatedAttempts, failAttempts);
    }

    return Math.max(1, physicalAttemptsCount, calculatedAttempts);
}
