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
 * VTU Lateral Entry USN Detection.
 *
 * VTU RULE:
 *   - Regular students:     USN number 001–199  (e.g. 2AB23CS043) → own batch
 *   - Lateral entry:        USN number 200–499  (e.g. 2AB24CS400) → PREVIOUS year’s batch
 *   - Transfer / Special:   USN number 900+     (e.g. 2AB23CS900) → own batch (NOT lateral)
 *
 *   Lateral entry students are admitted the NEXT calendar year with the NEXT year’s
 *   USN prefix, but belong to the PREVIOUS year’s academic cohort.
 *   Example: 2AB24CS400 → admitted 2024, belongs to Batch 2023 cohort.
 *
 * @param {string} usn - e.g. "2AB24CS400"
 * @returns {boolean}
 */
export function isLateralEntryUSN(usn) {
    if (!usn || typeof usn !== 'string') return false;
    const u = usn.toUpperCase().trim();
    // Extract the trailing 3-digit number from the USN
    const m = u.match(/(\d{3})$/);
    if (!m) return false;
    const num = parseInt(m[1], 10);
    // All numbers >= 200 are lateral/special — they belong to the previous year's cohort.
    return num >= 200;
}

/**
 * Checks if a student is lateral entry via flag or USN (number >= 200).
 */
export function isLateralEntry(usn, lateralFlag = null) {
    if (lateralFlag === true || lateralFlag === 'true' || lateralFlag === 1) return true;
    return isLateralEntryUSN(usn);
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
 * Canonical branch codes, matching public.branches.code in the database and
 * fn_normalize_branch() / lib/vtuAcademicEngine.js normalizeBranch().
 *
 * Every alias here is matched as a WHOLE TOKEN, never as a substring. Substring
 * matching is what made the 'CI' (AI & ML) filter also return every Data Science
 * and Computer Science student: the label "Data Science" contains "CI" inside
 * "SCIENCE", and so does "Computer Science (CSE)". The same failure mode
 * previously misfiled EEE students as ECE, because "Electrical & Electronics
 * (EEE)" contains "ELECTRONIC".
 */
const BRANCH_ALIASES = {
    CS: ['CS', 'CSE', 'COMPUTER SCIENCE', 'COMPUTER SCIENCE & ENGINEERING'],
    AI: ['AI', 'CI', 'AIML', 'AI & MACHINE LEARNING', 'ARTIFICIAL INTELLIGENCE'],
    DS: ['DS', 'CD', 'DATA SCIENCE', 'CSE(DS)', 'CSE (DS)'],
    EC: ['EC', 'ECE', 'ENC', 'ELECTRONICS & COMMUNICATION'],
    EE: ['EE', 'EEE', 'ELECTRICAL & ELECTRONICS'],
    CV: ['CV', 'CIVIL', 'CIVIL ENGINEERING'],
    ME: ['ME', 'MECH', 'MECHANICAL', 'MECHANICAL ENGINEERING'],
    RI: ['RI', 'ROBOTICS', 'ROBOTICS & AI', 'ROBOTICS & ARTIFICIAL INTELLIGENCE'],
    BA: ['BA', 'MBA'],
    MC: ['MC', 'MCA'],
};

/** Strips punctuation so "AI & Machine Learning (AIML)" yields usable tokens. */
function branchTokens(label) {
    return String(label || '')
        .toUpperCase()
        .replace(/[^A-Z0-9&\s]/g, ' ')
        .split(/\s+/)
        .filter(Boolean);
}

/**
 * Resolves any branch spelling - a code, an alias, or a full label - to its
 * canonical code. Returns null when nothing matches, so unknown input surfaces
 * instead of silently defaulting.
 */
export function canonicalBranchCode(input) {
    const raw = String(input || '').toUpperCase().trim();
    if (!raw) return null;

    if (BRANCH_ALIASES[raw]) return raw;

    const cleaned = raw.replace(/[^A-Z0-9&\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const tokens = branchTokens(raw);

    // Pass 1: exact whole-string match.
    for (const [code, aliases] of Object.entries(BRANCH_ALIASES)) {
        if (aliases.some((alias) => cleaned === alias)) return code;
    }

    // Pass 2: multi-word phrases, longest first, across every branch before any
    // single token is considered. "ROBOTICS & AI" must resolve to RI, not AI -
    // a bare-token pass would match the trailing "AI" and misfile the student.
    const phrases = Object.entries(BRANCH_ALIASES)
        .flatMap(([code, aliases]) => aliases.filter((a) => a.includes(' ')).map((a) => [code, a]))
        .sort((a, b) => b[1].length - a[1].length);

    for (const [code, alias] of phrases) {
        if (cleaned.includes(alias)) return code;
    }

    // Pass 3: single tokens.
    for (const [code, aliases] of Object.entries(BRANCH_ALIASES)) {
        if (aliases.some((alias) => !alias.includes(' ') && tokens.includes(alias))) return code;
    }

    return null;
}

/**
 * Branch matcher. Compares canonical codes rather than raw text.
 *
 * Resolution order for the student side, most authoritative first:
 *   1. branch_code - the canonical column, FK to branches.code
 *   2. the USN, whose characters 6-7 encode the branch
 *   3. the free-text branch label, matched by whole token
 */
export function matchesBranch(studentOrBranchOrUsn, branchFilter) {
    if (!branchFilter || branchFilter === '' || branchFilter === 'ALL' || branchFilter === 'All Branches') return true;

    const target = canonicalBranchCode(branchFilter);
    if (!target) return false;

    const isObject = typeof studentOrBranchOrUsn === 'object' && studentOrBranchOrUsn !== null;
    const str = typeof studentOrBranchOrUsn === 'string' ? studentOrBranchOrUsn.trim() : '';
    const usn = isObject ? studentOrBranchOrUsn?.usn : str;
    const rawBranch = isObject ? studentOrBranchOrUsn?.branch : str;

    const actual =
        (isObject && canonicalBranchCode(studentOrBranchOrUsn?.branch_code)) ||
        canonicalBranchCode(extractBranchFromUsn(usn)) ||
        canonicalBranchCode(rawBranch);

    return actual === target;
}

/**
 * Resolves the true academic cohort batch of a student.
 * CRITICAL VTU RULE: Lateral entry students join directly in 2nd year (Semester 3),
 * receiving a USN with next year's batch digits (e.g. 2AB24CS401 joined in 2024
 * into the 2023 batch cohort). Their academic cohort batch is therefore 1 year
 * prior to their USN intake year (2024 - 1 = 2023 Batch).
 */
export function getStudentAcademicBatch(usn, isLateral = null) {
    if (!usn) return null;
    const isLat = isLateralEntry(usn, isLateral);
    const parsed = extractBatchFromUsn(usn);
    if (!parsed) return null;

    if (isLat) {
        const intYear = parseInt(parsed.twoDigit, 10);
        const cohort2Digit = String(intYear - 1).padStart(2, '0');
        const cohort4Digit = '20' + cohort2Digit;
        return {
            twoDigit: cohort2Digit,
            fullYear: cohort4Digit,
            label: `${cohort2Digit} Batch (${cohort4Digit})`,
            isLateral: true,
            rawUsnBatch: parsed.twoDigit
        };
    }

    return {
        twoDigit: parsed.twoDigit,
        fullYear: parsed.fullYear,
        label: `${parsed.twoDigit} Batch (${parsed.fullYear})`,
        isLateral: false,
        rawUsnBatch: parsed.twoDigit
    };
}

/**
 * Checks if a student (via USN, studentYear, and lateral_entry status) matches a batch filter.
 * Accurately aligns lateral entry students (e.g. 2AB24CS401) with their true academic cohort (23 Batch / 2023).
 */
export function matchesBatch(usn, batchFilter, studentYear = null, isLateral = null) {
    if (!batchFilter || batchFilter === '' || batchFilter === 'all' || batchFilter === 'All Batches') return true;

    const digits = String(batchFilter).replace(/[^0-9]/g, '');
    if (!digits) return true;

    const filter2Digit = digits.length >= 2 ? digits.slice(-2) : digits;
    const filter4Digit = '20' + filter2Digit;

    // Check academic cohort batch
    if (usn) {
        const cohort = getStudentAcademicBatch(usn, isLateral);
        if (cohort) {
            if (cohort.twoDigit === filter2Digit || cohort.fullYear === filter4Digit) {
                return true;
            }
        }
    }

    // Fallback: check studentYear if present (for regular non-lateral students)
    if (studentYear && (!usn || !isLateralEntry(usn, isLateral))) {
        const yDigits = String(studentYear).replace(/[^0-9]/g, '');
        if (yDigits === digits || yDigits.slice(-2) === filter2Digit) return true;
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

/**
 * Canonical clean branch options for faculty analytics dropdowns.
 * Eliminates duplicate codes, aliases, inactive branches (e.g. BA, MC), and free-text labels.
 */
export function getCleanBranchOptions(branches = []) {
    const canonicalOrder = ['ALL', 'CS', 'AI', 'DS', 'EC', 'EE', 'ME', 'CV', 'RI'];
    const branchLabels = {
        'ALL': 'ALL - All Branches / Departments',
        'CS': 'CS - Computer Science & Engineering',
        'AI': 'AI - AI & Machine Learning',
        'DS': 'DS - Computer Science & Engineering (Data Science)',
        'EC': 'EC - Electronics & Communication Engineering',
        'EE': 'EE - Electrical & Electronics Engineering',
        'ME': 'ME - Mechanical Engineering',
        'CV': 'CV - Civil Engineering',
        'RI': 'RI - Robotics & Artificial Intelligence'
    };

    const seen = new Set();
    const result = [];

    // Always start with 'ALL'
    result.push({ value: 'ALL', label: branchLabels['ALL'] });
    seen.add('ALL');

    if (Array.isArray(branches)) {
        for (const b of branches) {
            if (!b || !b.code) continue;
            let code = String(b.code).toUpperCase().trim();
            if (code === 'CI' || code === 'AIML') code = 'AI';
            if (code === 'CD' || code === 'CSD') code = 'DS';
            if (code === 'CSE') code = 'CS';
            if (code === 'ECE') code = 'EC';
            if (code === 'EEE') code = 'EE';
            if (code === 'MECH') code = 'ME';
            if (code === 'CIVIL') code = 'CV';
            if (code === 'ROBOTICS') code = 'RI';

            if (code === 'ALL' || code === 'BA' || code === 'MC') continue;
            if (!canonicalOrder.includes(code)) continue;
            if (seen.has(code)) continue;

            seen.add(code);
            const label = b.label && !b.label.includes('(confirm label)') ? `${code} - ${b.label}` : (branchLabels[code] || `${code} - Department`);
            result.push({ value: code, label });
        }
    }

    // Ensure all 8 canonical active branches exist
    for (const code of canonicalOrder) {
        if (!seen.has(code) && branchLabels[code]) {
            seen.add(code);
            result.push({ value: code, label: branchLabels[code] });
        }
    }

    return result;
}

