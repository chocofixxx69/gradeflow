import { unifyGrade, calculateSGPA as calculateSGPACore } from './vtuGrades';
import { getOfficialCredit } from './vtu-curriculum-catalog';

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
 * Groups a flat list of marks by semester and calculates stats for each semester.
 * 
 * @param {Array} marks - List of mark objects
 * @param {string} scheme - VTU Scheme (2022, 2025)
 * @param {Object} options - { isLateralEntry: boolean }
 * @returns {Object} - { grouped, stats, cgpa, totalCredits, semesterCount, ncEligibility, yearBackRisk }
 */
export function processStudentResults(marks, scheme = '2022', options = {}) {
    const isLateralEntry = options.isLateralEntry || (options.usn ? isLateralEntryUSN(options.usn) : false);
    const grouped = {};
    const stats = {};
    
    // 1. Group by Semester
    marks.forEach(m => {
        const sem = m.semester || 1;
        // For lateral entry students, skip sem 1 & 2
        if (isLateralEntry && (sem === 1 || sem === 2)) return;
        if (!grouped[sem]) grouped[sem] = [];
        grouped[sem].push(m);
    });
    
    // 2. Sort subjects within each semester (by code)
    Object.keys(grouped).forEach(sem => {
        grouped[sem].sort((a, b) => {
            const codeA = (a.subject_code || a.code || '').toUpperCase();
            const codeB = (b.subject_code || b.code || '').toUpperCase();
            return codeA.localeCompare(codeB);
        });
    });
    
    // 3. Calculate SGPA and Stats for each semester
    let totalWeightedSGPA = 0;
    let totalCredits = 0;
    
    Object.keys(grouped).sort((a, b) => a - b).forEach(sem => {
        const subjects = grouped[sem];
        const res = calculateSGPA(subjects, scheme);
        stats[sem] = res;
        
        if (res.totalCredits > 0) {
            totalWeightedSGPA += res.sgpa * res.totalCredits;
            totalCredits += res.totalCredits;
        }
    });
    
    const cgpa = totalCredits > 0 ? (totalWeightedSGPA / totalCredits) : 0;

    // 4. Check non-credit mandatory course eligibility
    const ncEligibility = checkNonCreditEligibility(marks);
    
    // 5. Year-back risk assessment
    const yearBackRisk = assessYearBackRisk(stats, marks);

    return {
        grouped,
        stats,
        cgpa,
        totalCredits,
        semesterCount: Object.keys(grouped).length,
        ncEligibility,
        yearBackRisk,
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
 * Calculates SGPA for a list of subjects.
 * Delegates the actual grade-point/credit math to the canonical
 * lib/vtuGrades.js#calculateSGPA — this wrapper only adds the
 * earnedCredits/backlogs bookkeeping this call site needs on top.
 */
export function calculateSGPA(subjects, scheme = '2022') {
    const excludeGrades = ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'];
    // Filter out subjects with grades that don't count towards SGPA
    const validSubs = subjects.filter(m => !excludeGrades.includes(((m.grade || '').trim().toUpperCase())));

    // Normalize total_marks to 0 when absent
    const core = calculateSGPACore(validSubs.map(m => ({ ...m, total_marks: m.total_marks || m.total || 0 })), scheme);

    let earnedCr = 0;
    let backlogs = 0;
    subjects.forEach(m => {
        const grade = (m.grade || '').trim().toUpperCase();
        const ext = Number(m.external ?? m.see_marks) || 0;
        const tot = Number(m.total ?? m.total_marks) || 0;
        const resStr = (m.result || m.result_status || '').trim().toUpperCase();
        const isFail = m.is_backlog === true || m.is_backlog === 'true'
            || grade === 'F' || grade === 'A' || grade === 'FAIL' || grade === 'ABSENT'
            || grade === 'NP' || grade === 'NE' || grade === 'X'
            || (ext > 0 && ext < 18) || (tot > 0 && tot < 40) || resStr.includes('F');
        const offCr = getOfficialCredit(m.subject_code || m.code, scheme);
        const credits = offCr !== null ? offCr : (Number(m.credits) || 0);

        if (isFail) {
            backlogs++;
        } else if (!excludeGrades.includes(grade)) {
            earnedCr += credits;
        }
    });

    return {
        sgpa: core.sgpa,
        totalCredits: core.totalCredits,
        earnedCredits: earnedCr,
        backlogs,
        gradePoints: core.totalCrP,
        subjectCount: subjects.length
    };
}
