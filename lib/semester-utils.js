import { calculateAcademicRecord, normalizeSubjectResult } from './vtuAcademicEngine.js';
import { unifyGrade } from './vtuGrades.js';

// Non-credit mandatory courses (audit/non-credit) — these count for eligibility but NOT for SGPA
const NON_CREDIT_CODES = new Set(['22IDT159', '22PRJL29', '22CIR38', '22CIR48', '22GC36']);
const NON_CREDIT_GRADES = new Set(['PP', 'NP', 'AU']);

/**
 * Check eligibility of non-credit mandatory courses.
 * Returns { eligible: boolean, pending: [...courses] }
 */
export function checkNonCreditEligibility(marks) {
    const ncMarks = marks.filter(m => {
        const code = (m.subject_code || m.code || '').toUpperCase();
        const grade = (m.grade || '').toUpperCase();
        return NON_CREDIT_CODES.has(code) || NON_CREDIT_GRADES.has(grade);
    });

    const pending = ncMarks.filter(m => {
        const grade = (m.grade || '').toUpperCase();
        const unified = unifyGrade(grade);
        // NP = Not Passed, F = Fail, A = Absent for mandatory NC courses
        return unified === 'F' || unified === 'A' || grade === 'NP';
    });

    return {
        eligible: pending.length === 0,
        total: ncMarks.length,
        pending,
    };
}

/**
 * Automatically detects whether a USN belongs to a Lateral Entry (400 series) or Transfer (900 series) student.
 * e.g., 2AB24CS401, 2AB24CS402, 2AB23CS900, 2AB23CS901
 */
export function isLateralEntryUSN(usn) {
    if (!usn || typeof usn !== 'string') return false;
    const u = usn.toUpperCase().trim();
    return /[A-Z]{2,3}(4|9)\d{2}/.test(u);
}

/**
 * Authoritative VTU USN Batch Year extractor.
 * In VTU format, the batch year sits directly after the college code:
 * e.g. 2AB23CS043 -> '23' (2023 batch)
 *      2AB24CS401 -> '24' (2024 batch)
 *      1VA22EC001 -> '22' (2022 batch)
 */
export function extractBatchFromUsn(usn) {
    if (!usn || typeof usn !== 'string') return null;
    const clean = usn.trim().toUpperCase();

    // Look for 2 digits immediately following the 2-3 letter college code
    const match = clean.match(/^[0-9]?[A-Z]{2,3}([0-9]{2})/i);
    if (match && match[1]) {
        return {
            twoDigit: match[1],
            fullYear: '20' + match[1],
            label: `${match[1]} Batch (20${match[1]})`
        };
    }

    // Fallback: look for 2 digits between letters
    const fallback = clean.match(/[A-Z]+([0-9]{2})/i);
    if (fallback && fallback[1]) {
        return {
            twoDigit: fallback[1],
            fullYear: '20' + fallback[1],
            label: `${fallback[1]} Batch (20${fallback[1]})`
        };
    }

    return null;
}

/**
 * Checks if a student (via USN and/or student.year) matches a batch filter.
 * Handles all formats: '2023', '23', '2023 Batch', '23 Batch'.
 */
export function matchesBatch(usn, batchFilter, studentYear = null) {
    if (!batchFilter || batchFilter === '' || batchFilter === 'all' || batchFilter === 'All Batches') return true;

    const digits = String(batchFilter).replace(/[^0-9]/g, '');
    if (!digits) return true;

    const filter2Digit = digits.length >= 2 ? digits.slice(-2) : digits;
    const filter4Digit = '20' + filter2Digit;

    // Check studentYear if present
    if (studentYear) {
        const yDigits = String(studentYear).replace(/[^0-9]/g, '');
        if (yDigits === digits || yDigits.slice(-2) === filter2Digit) return true;
    }

    // Check USN
    if (usn) {
        const parsed = extractBatchFromUsn(usn);
        if (parsed) {
            if (parsed.twoDigit === filter2Digit || parsed.fullYear === filter4Digit) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Groups a flat list of marks by semester and calculates stats for each semester.
 *
 * @param {Array} marks - List of mark objects
 * @param {string} scheme - VTU Scheme (2022, 2025)
 * @param {Object} options - { isLateralEntry: boolean, usn: string, branch: string, catalogIndex }
 *   `catalogIndex` (lib/subjectCreditResolver.js) can be pre-fetched and passed in
 *   to avoid a redundant query; omitted, it's fetched once inside calculateAcademicRecord.
 * @returns {Promise<Object>} - { grouped, stats, cgpa, totalCredits, totalEarnedCredits, semesterCount, ncEligibility, yearBackRisk, unresolvedSubjects }
 */
export async function processStudentResults(marks, scheme = '2022', options = {}) {
    const isLateralEntry = options.isLateralEntry || (options.usn ? isLateralEntryUSN(options.usn) : false);

    // Filter out Sem 1 & 2 for lateral entry if applicable
    const filteredMarks = isLateralEntry
        ? marks.filter(m => Number(m.semester) !== 1 && Number(m.semester) !== 2)
        : marks;

    const record = await calculateAcademicRecord(filteredMarks, {
        usn: options.usn || '',
        branch: options.branch || '',
        scheme: scheme || '2022'
    }, { catalogIndex: options.catalogIndex });

    const ncEligibility = checkNonCreditEligibility(marks);
    const yearBackRisk = assessYearBackRisk(record.semStats, marks);

    return {
        grouped: record.marksBySemester,
        stats: record.semStats,
        cgpa: record.cgpa,
        totalCredits: record.totalRegisteredCredits,
        totalEarnedCredits: record.totalEarnedCredits,
        semesterCount: record.semestersTracked,
        ncEligibility,
        yearBackRisk,
        unresolvedSubjects: record.unresolvedSubjects,
    };
}

/**
 * Assess year-back risk based on VTU regulations.
 * VTU Rule: A student cannot appear for N+2 sem if they have >4 backlogs in N sem.
 */
export function assessYearBackRisk(stats, marks = []) {
    const semesters = Object.keys(stats).map(Number).sort((a, b) => a - b);
    const risks = [];
    let totalActiveBacklogs = 0;

    semesters.forEach(sem => {
        const s = stats[sem];
        if (s && s.backlogs > 0) {
            totalActiveBacklogs += s.backlogs;
            if (s.backlogs >= 4) {
                risks.push({
                    semester: sem,
                    backlogs: s.backlogs,
                    severity: 'HIGH',
                    message: `${s.backlogs} backlogs in Sem ${sem} — may block Sem ${sem + 2} registration`,
                });
            } else if (s.backlogs >= 2) {
                risks.push({
                    semester: sem,
                    backlogs: s.backlogs,
                    severity: 'MEDIUM',
                    message: `${s.backlogs} backlogs in Sem ${sem} — clear soon to avoid accumulation`,
                });
            }
        }
    });

    return {
        hasRisk: risks.length > 0,
        totalActiveBacklogs,
        risks,
        level: totalActiveBacklogs >= 8 ? 'CRITICAL' : totalActiveBacklogs >= 4 ? 'HIGH' : totalActiveBacklogs > 0 ? 'MODERATE' : 'NONE',
    };
}

/**
 * Calculates SGPA for a list of subjects using the canonical academic engine.
 */
export function calculateSGPA(subjects, scheme = '2022', branch = null, semester = null) {
    let semTotalCredits = 0;
    let semEarnedCredits = 0;
    let semGradePoints = 0;
    let semBacklogs = 0;

    subjects.forEach(m => {
        const norm = normalizeSubjectResult(m, scheme, branch, semester);
        if (norm.isAudit || norm.credits === 0) return;

        semTotalCredits += norm.credits;
        if (norm.isPassed) {
            semEarnedCredits += norm.credits;
            semGradePoints += norm.weightedPoints;
        } else {
            semBacklogs++;
        }
    });

    const sgpa = semTotalCredits > 0 ? Number((semGradePoints / semTotalCredits).toFixed(2)) : 0.0;

    return {
        sgpa,
        totalCredits: semTotalCredits,
        earnedCredits: semEarnedCredits,
        backlogs: semBacklogs,
        gradePoints: semGradePoints,
        subjectCount: subjects.length
    };
}
