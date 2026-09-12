import { calculateAcademicRecord, normalizeSubjectResult } from './vtuAcademicEngine.js';
import { unifyGrade } from './vtuGrades.js';
import {
    parseUSN,
    resolveBatch,
    resolveCohort,
    resolveBranch,
    resolveLateralEntry,
    canonicalBranch,
    isLateralSerial,
    branchLabelFor,
    listBranches,
    matchesBatchYear
} from './vtu-identity.js';

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
 * VTU lateral-entry detection from the USN alone.
 *
 * Lateral entrants carry a serial in the 200-899 band; 9xx serials are
 * re-admissions and transfers who still hold a full first-year history, so they are
 * deliberately excluded (see lib/vtu-identity.js). Lateral entry is an attribute of
 * the student and never shifts their batch: 2AB24CS400 is a 24-batch student.
 *
 * Callers that have the student's semester history should prefer
 * `resolveLateralEntry(student, recordedSemesters)` from lib/vtu-identity.js, which
 * corroborates the serial against the semesters actually on record.
 *
 * @param {string} usn
 * @returns {boolean}
 */
export function isLateralEntryUSN(usn) {
    const parsed = parseUSN(usn);
    return parsed.valid && isLateralSerial(parsed.serial);
}

/**
 * Lateral entry via the stored flag or the USN serial band.
 *
 * The stored `lateral_entry` column is a weak hint - it is wrong for 32 of the live
 * student records - so the USN is consulted whenever the column is not set.
 */
export function isLateralEntry(usn, lateralFlag = null) {
    if (lateralFlag === true || lateralFlag === 'true' || lateralFlag === 1) return true;
    return isLateralEntryUSN(usn);
}

/**
 * Batch year carried by a USN. The two digits directly after the college code ARE
 * the batch, whatever branch mnemonic follows them:
 *   2AB23CS043 -> 23    2AB23CD001 -> 23    2AB23CI017 -> 23
 *   2AB24EC030 -> 24    2AB25EE400 -> 25
 * Delegates to lib/vtu-identity.js so there is exactly one implementation of the
 * rule in the codebase.
 */
export function extractBatchFromUsn(usn) {
    const parsed = parseUSN(usn);
    if (!parsed.valid) return null;
    return {
        twoDigit: parsed.batchTwoDigit,
        fullYear: parsed.batchYear,
        label: `${parsed.batchTwoDigit} Batch (${parsed.batchYear})`
    };
}

/**
 * Authoritative VTU USN Branch extractor.
 * In VTU format, the branch code is 2-3 uppercase letters immediately following the 2-digit year:
 * e.g. 2AB23CS043 -> 'CS'
 *      2AB24CI400 -> 'CI'
 *      2AB24CD002 -> 'CD'
 *      1VA22EC001 -> 'EC'
 *      2AB23EE005 -> 'EE'
 *      2AB23CV012 -> 'CV'
 *      2AB23ME003 -> 'ME'
 */
export function extractBranchFromUsn(usn) {
    if (!usn || typeof usn !== 'string') return null;
    const clean = usn.trim().toUpperCase();
    const match = clean.match(/^[0-9]?[A-Z]{2,3}[0-9]{2}([A-Z]{2,3})[0-9]{3}/i);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Authoritative default institutional email generator for VTU students.
 * Pattern: <usn_lower>@anjuman.edu.in
 * e.g. '2AB23CS043' -> '2ab23cs043@anjuman.edu.in'
 *
 * @param {string} usn
 * @returns {string}
 */
export function getStudentDefaultEmail(usn) {
    if (!usn || typeof usn !== 'string') return '';
    const clean = usn.trim().toLowerCase();
    if (!clean) return '';
    if (clean.includes('@')) {
        return clean.endsWith('@anjuman.edu.in') ? clean : `${clean.split('@')[0]}@anjuman.edu.in`;
    }
    return `${clean}@anjuman.edu.in`;
}

/**
 * Resolves any branch spelling - a USN mnemonic, a canonical code, an alias, or a
 * full free-text label - to its canonical code, or null when nothing matches so
 * unknown input surfaces instead of silently defaulting.
 *
 * The alias table lives in lib/vtu-identity.js, seeded from the `branches` table so
 * the database stays the department authority. This wrapper is kept because a dozen
 * routes import it under this name.
 */
export function canonicalBranchCode(input) {
    return canonicalBranch(input);
}

/**
 * Branch matcher. Compares canonical codes rather than raw text, resolving the
 * student side USN-first (the university assigns it and it never changes), then
 * branch_code, then the free-text label.
 */
export function matchesBranch(studentOrBranchOrUsn, branchFilter) {
    if (!branchFilter || branchFilter === '' || branchFilter === 'ALL' || branchFilter === 'All Branches') return true;

    const target = canonicalBranch(branchFilter);
    if (!target) return false;

    if (studentOrBranchOrUsn && typeof studentOrBranchOrUsn === 'object') {
        return resolveBranch(studentOrBranchOrUsn).code === target;
    }

    const str = typeof studentOrBranchOrUsn === 'string' ? studentOrBranchOrUsn.trim() : '';
    if (!str) return false;
    return resolveBranch({ usn: str, branch: str, branch_code: str }).code === target;
}

/**
 * The batch a student belongs to.
 *
 * THE RULE: the two digits immediately after the college code in the USN are the
 * batch, and the branch mnemonic that follows them is irrelevant to it.
 *   2AB23CS043 / 2AB23CD001 / 2AB23CI017 / 2AB23CV004 / 2AB23EE002 / 2AB23EC011
 *   are all 23 batch. The same holds for every 2AB24* and 2AB25* USN.
 *
 * Nothing overrides the USN. `students.year` is consulted only when the USN cannot
 * be parsed at all - it merely mirrors the USN year in 625 of the 627 live records,
 * so it is a fallback, not an authority.
 *
 * ONE exception, and it is the whole point of this function: a lateral entrant is
 * ADMITTED a year after the cohort they then study with (see LATERAL_COHORT_OFFSET
 * in lib/vtu-identity.js), so 2AB24CS400 - who sat semesters 3-6 alongside the 2023
 * batch and is enrolled in the "CSE - A 2023" roster - is reported here as 2023.
 * `admissionYear`/`admissionTwoDigit` carry the untouched USN year for provenance.
 *
 * Shape is preserved for the fourteen routes that already read this function.
 *
 * @param {string|object} studentOrUsn - Student object or a bare USN
 * @param {boolean|null} isLateral - Optional lateral flag when passing a USN string
 * @param {number|string|null} studentYear - Optional students.year when passing a USN string
 */
export function getStudentAcademicBatch(studentOrUsn, isLateral = null, studentYear = null, recordedSemesters = null) {
    if (!studentOrUsn) return null;
    const isObject = typeof studentOrUsn === 'object' && studentOrUsn !== null;
    const usn = isObject ? studentOrUsn?.usn : (typeof studentOrUsn === 'string' ? studentOrUsn : '');
    const isLat = isObject ? (studentOrUsn?.lateral_entry ?? isLateral) : isLateral;
    const explicitYear = isObject
        ? (studentOrUsn?.year ?? studentOrUsn?.academic_batch ?? studentOrUsn?.batch)
        : studentYear;
    const sems = recordedSemesters
        || (isObject ? (studentOrUsn?.recordedSemesters || studentOrUsn?.recorded_semesters) : null)
        || [];

    if (!usn && (explicitYear === null || explicitYear === undefined || String(explicitYear).trim() === '')) return null;

    const cohort = resolveCohort({ usn, year: explicitYear, lateral_entry: isLat }, { recordedSemesters: sems });
    if (!cohort.year) return null;

    const parsed = parseUSN(usn);
    return {
        // The ACADEMIC cohort — what every batch dropdown and batch filter means.
        twoDigit: cohort.twoDigit,
        fullYear: cohort.year,
        label: cohort.label,
        isLateral: cohort.isLateral,
        // The immutable admission facts, kept for provenance and USN validation.
        admissionTwoDigit: cohort.admissionTwoDigit,
        admissionYear: cohort.admissionYear,
        admissionLabel: cohort.admissionLabel,
        cohortOffsetApplied: cohort.offsetApplied,
        rawUsnBatch: parsed.valid ? parsed.batchTwoDigit : cohort.admissionTwoDigit,
        // True when the USN could not supply the batch and the year column had to.
        isOverridden: cohort.source !== 'usn',
        source: cohort.source
    };
}

/**
 * Does a student fall in the requested batch? Accepts "23", "2023" and
 * "23 Batch (2023)" so a value from any surface resolves identically.
 *
 * Matches on the ACADEMIC COHORT, so lateral entrants answer to the batch they
 * graduate with rather than the year printed in their USN.
 */
export function matchesBatch(studentOrUsn, batchFilter, studentYear = null, isLateral = null, recordedSemesters = null) {
    if (!batchFilter || batchFilter === '' || batchFilter === 'all' || batchFilter === 'All Batches') return true;

    const isObject = typeof studentOrUsn === 'object' && studentOrUsn !== null;
    if (isObject && studentOrUsn.identity?.cohort) {
        return matchesBatchYear(studentOrUsn.identity, batchFilter);
    }
    const usn = isObject ? studentOrUsn?.usn : (typeof studentOrUsn === 'string' ? studentOrUsn : '');
    const year = isObject
        ? (studentOrUsn?.year ?? studentOrUsn?.academic_batch ?? studentOrUsn?.batch ?? studentOrUsn?.raw?.year)
        : studentYear;
    const lateralFlag = isObject
        ? (studentOrUsn?.lateral_entry ?? studentOrUsn?.raw?.lateral_entry ?? isLateral)
        : isLateral;
    const sems = recordedSemesters
        || (isObject ? (studentOrUsn?.recordedSemesters || studentOrUsn?.recorded_semesters || studentOrUsn?.raw?.recordedSemesters) : null)
        || [];

    // Cohort-based: a lateral entrant graduates with the batch admitted a year
    // before them and must answer to that batch filter, not their USN year.
    return matchesBatchYear({ usn, year, lateral_entry: lateralFlag }, batchFilter, { recordedSemesters: sems });
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

/**
 * Department order and labels. Both come from the identity registry (lib/vtu-identity.js),
 * which is seeded from the `branches` table, so a department added in the database
 * appears here without a code change.
 */
export const BRANCH_ORDER = ['ALL', ...listBranches().map(b => b.code)];

export const BRANCH_LABELS = Object.fromEntries([
    ['ALL', 'ALL - All Branches / Departments'],
    ...listBranches().map(b => [b.code, `${b.code} - ${b.label}`])
]);

/** Label for a branch code, falling back to the bare code for unknown branches. */
export function branchLabel(code) {
    const c = String(code || '').toUpperCase().trim();
    if (c === 'ALL') return BRANCH_LABELS.ALL;
    const label = branchLabelFor(c);
    return label.startsWith(`${c} -`) ? label : `${c} - ${label}`;
}

/**
 * Canonical clean branch options for faculty analytics dropdowns.
 * Eliminates duplicate codes, aliases, inactive branches (e.g. BA, MC), and free-text labels.
 */
export function getCleanBranchOptions(branches = []) {
    const seen = new Set(['ALL']);
    const result = [{ value: 'ALL', label: BRANCH_LABELS.ALL }];

    // Caller-supplied rows first, so a live `branches` row can override the label.
    for (const b of (Array.isArray(branches) ? branches : [])) {
        const code = canonicalBranch(b?.code);
        if (!code || seen.has(code)) continue;
        if (!BRANCH_LABELS[code]) continue; // inactive or unknown department
        seen.add(code);
        const supplied = b.label && !String(b.label).includes('(confirm label)') ? `${code} - ${b.label}` : null;
        result.push({ value: code, label: supplied || BRANCH_LABELS[code] });
    }

    // Then every active department the registry knows about, so a dropdown is never
    // short just because the caller passed a sparse list.
    for (const code of BRANCH_ORDER) {
        if (seen.has(code)) continue;
        seen.add(code);
        result.push({ value: code, label: BRANCH_LABELS[code] });
    }

    return result;
}


