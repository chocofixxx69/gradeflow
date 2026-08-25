// lib/vtuAcademicEngine.js
/**
 * CANONICAL VTU ACADEMIC CALCULATION ENGINE
 * Single authoritative source of truth for:
 *   1. Branch normalization (including USN branch code extraction)
 *   2. Subject credit resolution (DB marks > DB catalog > VTU curriculum rules)
 *   3. Raw result normalization (Absent vs. Fail vs. Pass vs. exact Letter Grade)
 *   4. Grade Point mapping (0 to 10 scale)
 *   5. Attempt deduplication & backlog clearance
 *   6. Semester metrics (Registered Credits, Earned Credits, Grade Points, SGPA, Backlogs)
 *   7. Student-level aggregates (CGPA, Active Backlogs, Total Earned Credits)
 */

import { getOfficialCredit } from './vtu-curriculum-catalog.js';

/**
 * Normalizes branch codes from user input, profile, or USN
 */
export function normalizeBranch(branchInput, usn = '') {
    if (branchInput && typeof branchInput === 'string') {
        const b = branchInput.toUpperCase().trim();
        if (b === 'CSE' || b === 'CS' || b.includes('COMPUTER SCIENCE')) return 'CS';
        if (b === 'ECE' || b === 'EC' || b.includes('ELECTRONICS')) return 'EC';
        if (b === 'EEE' || b === 'EE' || b.includes('ELECTRICAL')) return 'EE';
        if (b === 'AIML' || b === 'AI' || b === 'CI' || b.includes('ARTIFICIAL INTELLIGENCE')) return 'AI';
        if (b === 'DS' || b === 'CD' || b.includes('DATA SCIENCE') || b.includes('CSE(DS)')) return 'DS';
        if (b === 'MECH' || b === 'ME' || b.includes('MECHANICAL')) return 'ME';
        if (b === 'CIVIL' || b === 'CV' || b.includes('CIVIL')) return 'CV';
        if (b === 'ROBOTICS' || b === 'RI' || b.includes('ROBOTICS')) return 'RI';
    }

    // Fallback: extract branch from USN (e.g., 2AB23CD001 -> CD -> DS, 2AB23CS013 -> CS -> CS)
    if (usn && typeof usn === 'string' && usn.length >= 7) {
        const uCode = usn.substring(5, 7).toUpperCase();
        if (uCode === 'CS') return 'CS';
        if (uCode === 'EC') return 'EC';
        if (uCode === 'EE') return 'EE';
        if (uCode === 'AI' || uCode === 'CI') return 'AI';
        if (uCode === 'DS' || uCode === 'CD') return 'DS';
        if (uCode === 'ME') return 'ME';
        if (uCode === 'CV') return 'CV';
        if (uCode === 'RI') return 'RI';
    }

    return 'CS';
}

/**
 * Checks if a course is a mandatory non-credit / audit course in VTU NEP
 */
export function isAuditCourse(subjectCode) {
    if (!subjectCode) return false;
    const code = String(subjectCode).toUpperCase().trim();
    return (
        code.startsWith('BPEK') || // Physical Education
        code.startsWith('BNSK') || // NSS
        code.startsWith('BYOK') || // Yoga
        code.startsWith('BIKS') || // Indian Knowledge System (sem 6)
        code.startsWith('1BPEK') ||
        code.startsWith('1BNSK') ||
        code.startsWith('1BYOK') ||
        code === '22IDT159' ||
        code === '22PRJL29' ||
        code === '22CIR38' ||
        code === '22CIR48' ||
        code === '22GC36'
    );
}

/**
 * Resolves authoritative credits for a subject
 */
export function resolveSubjectCredits(mark, scheme = '2022', branch = null, semester = null) {
    const code = (mark.subject_code || mark.code || '').trim().toUpperCase();

    // 1. Audit courses always have 0 credits towards SGPA
    if (isAuditCourse(code)) {
        return 0;
    }

    // 2. Authoritative stored credit on the mark record (from subject_marks table in Supabase)
    const storedCr = Number(mark.credits);
    if (!isNaN(storedCr) && storedCr > 0) {
        return storedCr;
    }

    // 3. Fallback to curriculum catalog lookup
    const offCr = getOfficialCredit(code, scheme, branch, semester || mark.semester);
    if (offCr !== null && !isNaN(offCr)) {
        return offCr;
    }

    // 4. Safe default for standard VTU theory subjects
    return 3;
}

/**
 * Derives exact VTU letter grade and grade point from a total score
 */
export function getGradeFromScore(score) {
    const s = Math.round(Number(score)) || 0;
    if (s >= 90) return { grade: 'O', gp: 10 };
    if (s >= 80) return { grade: 'A+', gp: 9 };
    if (s >= 70) return { grade: 'A', gp: 8 };
    if (s >= 60) return { grade: 'B+', gp: 7 };
    if (s >= 55) return { grade: 'B', gp: 6 };
    if (s >= 50) return { grade: 'C', gp: 5 };
    if (s >= 40) return { grade: 'P', gp: 4 };
    return { grade: 'F', gp: 0 };
}

/**
 * Normalizes a single subject mark record into a canonical subject result model
 */
export function normalizeSubjectResult(mark, scheme = '2022', branch = null, semester = null) {
    if (!mark) return {
        id: null,
        subjectCode: '',
        subject_code: '',
        code: '',
        subjectName: '',
        subject_name: '',
        name: '',
        semester: Number(semester) || 1,
        credits: 0,
        internalMarks: null,
        cie_marks: null,
        internal: null,
        seeMarks: null,
        see_marks: null,
        external: null,
        totalMarks: null,
        total_marks: null,
        total: null,
        rawGrade: '',
        grade: 'F',
        gradePoint: 0,
        gpFormatted: '0.00',
        weightedPoints: 0,
        isPassed: false,
        isFailed: true,
        isAbsent: false,
        isBacklog: true,
        is_backlog: true,
        isAudit: false,
        announcedDate: null,
        announced_date: null
    };

    const code = (mark.subjectCode || mark.subject_code || mark.code || '').trim().toUpperCase();
    const name = (mark.subjectName || mark.subject_name || mark.name || '').trim();
    const rawGrade = (mark.rawGrade || mark.grade || '').trim().toUpperCase();
    const isBacklogFlag = mark.isBacklog === true || mark.is_backlog === true || mark.is_backlog === 'true';

    const cie = mark.internalMarks ?? mark.cie_marks ?? mark.internal ?? null;
    const see = mark.seeMarks ?? mark.see_marks ?? mark.external ?? null;
    const tot = mark.totalMarks ?? mark.total_marks ?? mark.total ?? null;

    const cieNum = cie !== null && cie !== undefined && cie !== '' && !isNaN(Number(cie)) ? Number(cie) : null;
    const seeNum = see !== null && see !== undefined && see !== '' && !isNaN(Number(see)) ? Number(see) : null;
    const totNum = tot !== null && tot !== undefined && tot !== '' && !isNaN(Number(tot)) ? Number(tot) : (
        cieNum !== null && seeNum !== null ? cieNum + seeNum : null
    );

    const isAudit = isAuditCourse(code);
    const credits = isAudit ? 0 : resolveSubjectCredits(mark, scheme, branch, semester || mark.semester);

    let grade = 'F';
    let gradePoint = 0;
    let isPassed = false;
    let isFailed = false;
    let isAbsent = false;

    // ── 1. Explicit Backlog / Failing Status ──
    if (isBacklogFlag || ['F', 'FAIL', 'NE', 'X'].includes(rawGrade)) {
        grade = 'F';
        gradePoint = 0;
        isFailed = true;
        isPassed = false;
    }
    // ── 2. Explicit Absent ──
    else if (['AB', 'ABSENT'].includes(rawGrade)) {
        grade = 'AB';
        gradePoint = 0;
        isAbsent = true;
        isFailed = true;
        isPassed = false;
    }
    // ── 3. Ambiguous 'A' (Letter Grade A: 70-79% vs. Absent) ──
    else if (rawGrade === 'A') {
        if (totNum !== null && totNum >= 40) {
            grade = 'A';
            gradePoint = 8;
            isPassed = true;
            isFailed = false;
        } else {
            grade = 'AB';
            gradePoint = 0;
            isAbsent = true;
            isFailed = true;
            isPassed = false;
        }
    }
    // ── 4. Explicit High Letter Grades ──
    else if (['O', 'S', 'A+', 'B+', 'B', 'C', 'D', 'E'].includes(rawGrade)) {
        const map = { 'O': 10, 'S': 10, 'A+': 9, 'B+': 7, 'B': 6, 'C': 5, 'D': 6, 'E': 5 };
        grade = rawGrade === 'S' ? 'O' : rawGrade;
        gradePoint = map[grade] || 0;
        isPassed = true;
        isFailed = false;
    }
    // ── 5. Scraped Pass Status ('P', 'PP', 'PASS') ──
    else if (['P', 'PP', 'PASS'].includes(rawGrade)) {
        if (totNum !== null && totNum >= 40) {
            const derived = getGradeFromScore(totNum);
            grade = derived.grade;
            gradePoint = derived.gp;
            isPassed = true;
            isFailed = false;
        } else if (totNum !== null && totNum < 40) {
            grade = 'F';
            gradePoint = 0;
            isFailed = true;
            isPassed = false;
        } else {
            grade = 'P';
            gradePoint = 4;
            isPassed = true;
            isFailed = false;
        }
    }
    // ── 6. Fallback from Numeric Marks ──
    else if (totNum !== null) {
        if (totNum < 40 || (seeNum !== null && seeNum > 0 && seeNum < 18)) {
            grade = 'F';
            gradePoint = 0;
            isFailed = true;
            isPassed = false;
        } else {
            const derived = getGradeFromScore(totNum);
            grade = derived.grade;
            gradePoint = derived.gp;
            isPassed = true;
            isFailed = false;
        }
    }
    // ── 7. Default Safe Fail ──
    else {
        grade = 'F';
        gradePoint = 0;
        isFailed = true;
        isPassed = false;
    }

    const weightedPoints = (isFailed || isAudit) ? 0 : gradePoint * credits;

    const announced = mark.announced_date || mark.exam_date || mark.announcedDate || null;

    return {
        id: mark.id,
        subjectCode: code,
        subject_code: code,
        code,
        subjectName: name,
        subject_name: name,
        name,
        semester: Number(mark.semester) || (semester ? Number(semester) : 1),
        credits,
        internalMarks: cieNum,
        cie_marks: cieNum,
        internal: cieNum,
        seeMarks: seeNum,
        see_marks: seeNum,
        external: seeNum,
        totalMarks: totNum,
        total_marks: totNum,
        total: totNum,
        rawGrade,
        grade,
        gradePoint,
        gpFormatted: gradePoint.toFixed(2),
        weightedPoints,
        isPassed,
        isFailed,
        isAbsent,
        isBacklog: isFailed,
        is_backlog: isFailed,
        isAudit,
        announcedDate: announced,
        announced_date: announced
    };
}

/**
 * Returns rank for deduplication: higher rank = better attempt
 */
function getAttemptRank(normalized) {
    if (normalized.isPassed) return 4;
    if (normalized.isAbsent) return 0;
    if (normalized.isFailed) return 1;
    return 0;
}

/**
 * CANONICAL PIPELINE: Process a complete list of student marks into
 * reconciled semester records, SGPA, CGPA, and Active Backlogs.
 *
 * @param {Array} rawMarks - List of mark objects from subject_marks table or API
 * @param {Object} studentProfile - Student profile object { usn, name, branch, scheme }
 * @returns {Object} Canonical academic result
 */
export function calculateAcademicRecord(rawMarks = [], studentProfile = {}) {
    const usn = (studentProfile.usn || '').trim().toUpperCase();
    const scheme = studentProfile.scheme || '2022';
    const branch = normalizeBranch(studentProfile.branch, usn);

    // 1. Normalize all raw marks strictly belonging to this USN
    const normalizedPool = (rawMarks || [])
        .filter(m => {
            if (!usn) return true;
            const mUsn = (m.usn || '').trim().toUpperCase();
            return !mUsn || mUsn === usn;
        })
        .map(m => normalizeSubjectResult(m, scheme, branch));

    // 2. Reconcile multiple attempts by subjectCode
    // A subject is cleared if ANY attempt has isPassed === true
    const subjectsMap = {};
    normalizedPool.forEach(norm => {
        const code = norm.subjectCode;
        if (!code) return;

        if (!subjectsMap[code]) {
            subjectsMap[code] = {
                code,
                isCleared: false,
                bestAttempt: norm,
                allAttempts: [norm]
            };
        } else {
            subjectsMap[code].allAttempts.push(norm);
        }

        if (norm.isPassed) {
            subjectsMap[code].isCleared = true;
        }

        // Keep the best attempt for SGPA calculation
        const currentBest = subjectsMap[code].bestAttempt;
        const currentRank = getAttemptRank(currentBest);
        const newRank = getAttemptRank(norm);

        if (newRank > currentRank) {
            subjectsMap[code].bestAttempt = norm;
        } else if (newRank === currentRank) {
            if ((norm.totalMarks || 0) > (currentBest.totalMarks || 0)) {
                subjectsMap[code].bestAttempt = norm;
            }
        }
    });

    // 3. Group best attempts by original semester
    const groupedBySem = {};
    Object.values(subjectsMap).forEach(entry => {
        const best = entry.bestAttempt;
        // If the subject is cleared by ANY attempt, mark isFailed=false and isBacklog=false
        if (entry.isCleared) {
            best.isFailed = false;
            best.isBacklog = false;
        }
        const sem = best.semester || 1;
        if (!groupedBySem[sem]) groupedBySem[sem] = [];
        groupedBySem[sem].push(best);
    });

    // Chronological curriculum sorting within each semester
    Object.keys(groupedBySem).forEach(sem => {
        groupedBySem[sem].sort((a, b) => {
            const getNum = c => {
                const m = (c || '').match(/\d+/g);
                return m ? parseInt(m[m.length - 1], 10) : 0;
            };
            return getNum(a.subjectCode) - getNum(b.subjectCode);
        });
    });

    // 4. Calculate Semester Metrics
    const semStats = {};
    const semSGPAs = {};
    let totalCumulativePoints = 0;
    let totalCumulativeRegCredits = 0;
    let totalCumulativeEarnedCredits = 0;
    let totalActiveBacklogs = 0;
    const activeBacklogSubjects = [];

    const sortedSemNumbers = Object.keys(groupedBySem).map(Number).sort((a, b) => a - b);

    sortedSemNumbers.forEach(sem => {
        const subjects = groupedBySem[sem];
        let semTotalCredits = 0;
        let semEarnedCredits = 0;
        let semGradePoints = 0;
        let semBacklogs = 0;

        subjects.forEach(s => {
            if (s.isAudit || s.credits === 0) return; // Non-credit audit course

            semTotalCredits += s.credits;

            if (s.isPassed) {
                semEarnedCredits += s.credits;
                semGradePoints += s.weightedPoints;
            } else if (s.isFailed) {
                semBacklogs += 1;
                activeBacklogSubjects.push(s);
            }
        });

        const sgpa = semTotalCredits > 0 ? Number((semGradePoints / semTotalCredits).toFixed(2)) : 0.0;

        semStats[sem] = {
            semester: sem,
            sgpa,
            totalCredits: semTotalCredits,
            earnedCredits: semEarnedCredits,
            gradePoints: semGradePoints,
            backlogs: semBacklogs,
            subjectCount: subjects.length
        };

        semSGPAs[sem] = sgpa;

        totalCumulativePoints += semGradePoints;
        totalCumulativeRegCredits += semTotalCredits;
        totalCumulativeEarnedCredits += semEarnedCredits;
        totalActiveBacklogs += semBacklogs;
    });

    const cgpa = totalCumulativeRegCredits > 0 ? Number((totalCumulativePoints / totalCumulativeRegCredits).toFixed(2)) : 0.0;

    return {
        profile: {
            usn,
            name: studentProfile.name || usn,
            branch,
            scheme
        },
        cgpa,
        totalActiveBacklogs,
        activeBacklogSubjects,
        totalRegisteredCredits: totalCumulativeRegCredits,
        totalEarnedCredits: totalCumulativeEarnedCredits,
        totalSubjects: Object.keys(subjectsMap).length,
        semestersTracked: sortedSemNumbers.length,
        semStats,
        semSGPAs,
        marksBySemester: groupedBySem
    };
}
