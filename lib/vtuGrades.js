import {
    normalizeBranch,
    isAuditCourse,
    resolveSubjectCredits,
    getGradeFromScore,
    normalizeSubjectResult,
    calculateAcademicRecord
} from './vtuAcademicEngine.js';

export {
    normalizeBranch,
    isAuditCourse,
    resolveSubjectCredits,
    getGradeFromScore,
    normalizeSubjectResult,
    calculateAcademicRecord
};

export const VTU_SCHEMES = {
    '2025': { name: '2025 Scheme (Modern)', percentFormula: (c) => (c - 0.75) * 10, grades: getNewGrades(), gradeOrder: getNewGradeOrder(), exclude: ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'] },
    '2022': { name: '2022 Scheme (NEP)', percentFormula: (c) => (c - 0.75) * 10, grades: getNewGrades(), gradeOrder: getNewGradeOrder(), exclude: ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'] }
};

function getNewGrades() {
    return {
        'P': { label: 'PASS', points: 4, min: 40, max: 100, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'F': { label: 'FAIL', points: 0, min: 0, max: 39, color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
        'A': { label: 'ABSENT', points: 0, min: 0, max: 0, color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
        'W': { label: 'WITHHELD', points: 0, min: 0, max: 0, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
        'X': { label: 'NOT ELIGIBLE', points: 0, min: 0, max: 0, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
        'NE': { label: 'NOT ELIGIBLE', points: 0, min: 0, max: 0, color: '#6b7280', bg: 'rgba(107,114,128,0.15)' },
        // Standard absolute grading letter grades
        'O': { label: 'PASS', points: 10, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'S': { label: 'PASS', points: 10, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'A+': { label: 'PASS', points: 9, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'A': { label: 'PASS', points: 8, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'B+': { label: 'PASS', points: 7, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'B': { label: 'PASS', points: 6, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'C': { label: 'PASS', points: 5, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'D': { label: 'PASS', points: 6, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'E': { label: 'PASS', points: 5, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    };
}
function getNewGradeOrder() { return ['P', 'F', 'A', 'W', 'X', 'NE']; }

export function getGradePoint(grade, scheme = '2022', totalMarks = null, externalMarks = null) {
    const g = (grade || '').trim().toUpperCase();
    const unified = unifyGrade(g);
    if (['F', 'A', 'X', 'NE', 'ABSENT', 'AB', 'FAIL', 'NP'].includes(unified) || g === 'F' || g === 'A' || g === 'AB' || g === 'NP') return 0;

    // 1. If totalMarks is available and valid (> 0), compute GP directly from score
    if (totalMarks !== null && totalMarks !== undefined && totalMarks !== '') {
        const score = Math.round(Number(totalMarks));
        if (!isNaN(score) && score > 0) {
            if (score >= 90) return 10;
            if (score >= 80) return 9;
            if (score >= 70) return 8;
            if (score >= 60) return 7;
            if (score >= 55) return 6;
            if (score >= 50) return 5;
            if (score >= 40) return 4;
            return 0;
        }
    }

    // 2. If letter grade is explicit (O, S, A+, A, B+, B, C, D, E, P), map directly
    const letterMap = { 'O': 10, 'S': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'D': 6, 'E': 5, 'P': 4 };
    if (letterMap[g] !== undefined) return letterMap[g];

    // 3. Fallback to scheme grade map or unified status
    return VTU_SCHEMES[scheme]?.grades[g]?.points ?? (unified === 'P' ? 4 : 0);
}

export function getGradeFromTotal(total, scheme = '2022') {
    const score = Math.round(Number(total)) || 0;

    if (score >= 90) return 'O';
    if (score >= 80) return 'A+';
    if (score >= 70) return 'A';
    if (score >= 60) return 'B+';
    if (score >= 55) return 'B';
    if (score >= 50) return 'C';
    if (score >= 40) return 'P';
    return 'F';
}

export function calculatePercentage(cgpa, scheme = '2022') {
    const formula = VTU_SCHEMES[scheme]?.percentFormula;
    return formula ? formula(parseFloat(cgpa)) : 0;
}

export function unifyGrade(grade) {
    if (!grade) return '—';
    const g = grade.toUpperCase();
    if (['O', 'S', 'A+', 'B+', 'B', 'C', 'D', 'E', 'P'].includes(g)) return 'P';
    if (['AB', 'ABSENT', 'Ab', 'A'].includes(g)) return 'A';
    return g;
}

/**
 * CANONICAL BACKLOG/FAIL DETECTION — single source of truth for all dashboards,
 * analytics, PDF exports and API routes.
 *
 * Priority order:
 *  1. Explicit is_backlog flag  → fail
 *  2. Explicit failing grades   → fail  (F, FAIL, NE, X)
 *  3. Grade 'A' / 'AB' / 'ABSENT' disambiguation:
 *     - If total marks >= 40  → letter grade A (pass, 70-79% range) → NOT a backlog
 *     - If total marks = 0/null → Absent → backlog
 *     This handles VTU data where 'A' raw grade can mean either.
 *  4. Explicit passing grades   → pass  (O, S, A+, B+, B, C, P, PP)
 *  5. No grade at all           → fall back to marks only (tot < 40 or ext < 18)
 *
 * NOTE: 'NP' is used for non-credit/audit courses — NOT counted as backlogs here;
 * they are filtered out upstream by the excludeGrades list.
 */
export function isFailedSubject(m) {
    if (!m) return false;
    if (m.isFailed !== undefined) return Boolean(m.isFailed);
    const norm = normalizeSubjectResult(m);
    return norm.isFailed;
}

export function getGradeDetails(mark, scheme = '2022', branch = null, semester = null) {
    const norm = normalizeSubjectResult(mark, scheme, branch, semester);
    return {
        grade: norm.grade,
        gp: norm.gradePoint,
        gpFormatted: norm.gpFormatted,
        isPass: norm.isPassed && norm.gradePoint > 0,
        isFail: norm.isFailed
    };
}

export function getGradeBadgeTone(grade) {
    const g = (grade || '').toUpperCase();
    if (g === 'O' || g === 'S') return 'success';
    if (g === 'A+' || g === 'A') return 'success';
    if (g === 'B+' || g === 'B') return 'info';
    if (g === 'C' || g === 'P') return 'warning';
    if (g === 'F' || g === 'A' || g === 'AB' || g === 'FAIL' || g === 'NP') return 'danger';
    return 'neutral';
}

/**
 * Returns a numeric rank for grade comparison in deduplication (bestByCode).
 * Higher rank = better result. Used to pick the best attempt per subject.
 *
 * Ranks letter-grade 'A' (70-79%) the same as other passing grades.
 * Uses total marks to disambiguate 'A' = letter grade vs Absent.
 */
export function getGradeRank(grade, totalMarks = null) {
    const g = (grade || '').trim().toUpperCase();
    const tot = Number(totalMarks) || 0;

    // Ambiguous 'A': if marks show a passing score → rank as pass
    if (g === 'A') {
        return tot >= 40 ? 4 : 0; // 4 = pass rank, 0 = absent rank
    }

    const unified = unifyGrade(g);
    if (unified === 'P') return 4; // O, S, A+, B+, B, C, P → pass
    if (unified === 'F') return 1; // F, FAIL → fail (ranked above absent so later fail beats old absent)
    if (unified === 'A') return 0; // AB, ABSENT → absent/missing
    return 0;
}

export function calculateSGPA(subjects, scheme = '2022') {
    const config = VTU_SCHEMES[scheme] || VTU_SCHEMES['2022'];
    let tc = 0; // Total Registered Credits
    let tcp = 0; // Total Credit Points (Sum of C * GP)

    for (const s of (subjects || [])) {
        const grade = (s.grade || '').trim().toUpperCase();
        if (config.exclude.includes(grade)) continue;

        const gp = getGradePoint(s.grade, scheme, s.total_marks || s.total || null, s.see_marks ?? s.external ?? null);

        // ── Credit Priority ────────────────────────────────────────────────────────
        // 1. s.credits: DB value (subject_marks.credits, synced from subject_catalog)
        // 2. getOfficialCredit: JS fallback catalog (only if DB has no value)
        const dbCr = Number(s.credits);
        const offCr = getOfficialCredit(s.subject_code || s.code, scheme);
        const cr = dbCr > 0 ? dbCr : (offCr !== null ? offCr : 0);

        tc += cr;
        tcp += (gp * cr);
    }

    const result = tc === 0 ? 0 : Math.round((tcp / tc) * 100) / 100;

    return {
        sgpa: result,
        totalCredits: tc,
        totalCrP: tcp,
        formula: `Σ(C*GP) / Σ(C) = ${tcp.toFixed(1)} / ${tc} = ${result.toFixed(2)}`
    };
}

// Canonical CGPA classification — single source of truth for the whole app.
// 3-tier majority rule (confirmed): FCD >= 7.75, FC >= 6.75, else SC.
export function classify(cgpa) {
    const val = parseFloat(cgpa) || 0;
    if (val >= 7.75) return { code: 'FCD', label: 'First Class Distinction' };
    if (val >= 6.75) return { code: 'FC', label: 'First Class' };
    return { code: 'SC', label: 'Second Class' };
}

export function calculateCGPA(semesters, scheme = '2022') {
    let tc = 0, tcp = 0;
    const res = semesters.map(sem => {
        const { sgpa, totalCredits, totalCrP } = calculateSGPA(sem.subjects, scheme);
        tc += totalCredits; tcp += totalCrP;
        return { ...sem, sgpa, totalCredits };
    });

    const cgpa = tc === 0 ? 0 : parseFloat((tcp / tc).toFixed(2));
    const classification = classify(cgpa).code;

    return { cgpa, semesterResults: res, totalCredits: tc, classification };
}

export function calculateCGPAFromSGPAs(sgpas, scheme = '2022') {
    // User requested strictly 20 credits per semester
    const defaultCredits = [20, 20, 20, 20, 20, 20, 20, 20];
    let tc = 0, tcp = 0;

    const res = sgpas.map((val, i) => {
        const sgpa = parseFloat(val) || 0;
        if (sgpa === 0) return null;
        const cr = defaultCredits[i] || 20;
        tc += cr;
        tcp += (sgpa * cr);
        return { id: i + 1, sgpa, credits: cr };
    }).filter(Boolean);

    const cgpa = tc === 0 ? 0 : parseFloat((tcp / tc).toFixed(2));
    const classification = classify(cgpa).code;

    return { cgpa, semesterResults: res, totalCredits: tc, classification };
}

// ── BRANCH DATA (8 Supported Branches) ────────────────────────────────────────

export const VTU_SUPPORTED_BRANCHES = {
    'AI': 'Artificial Intelligence & Machine Learning',
    'CS': 'Computer Science & Engineering',
    'CV': 'Civil Engineering',
    'DS': 'Computer Science & Engineering (Data Science)',
    'EC': 'Electronics & Communication Engineering',
    'EE': 'Electrical & Electronics Engineering',
    'ME': 'Mechanical Engineering',
    'RI': 'Robotics & Artificial Intelligence'
};

export const VTU_BRANCHES = VTU_SUPPORTED_BRANCHES;

export function getOfficialCredit(subjectCode, scheme = '2022', branch = null, semester = null) {
    if (!subjectCode) return null;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getOfficialCredit: resolver } = require('./vtu-curriculum-catalog.js');
        return resolver(subjectCode, scheme, branch, semester);
    } catch {
        return null;
    }
}

export function getSubjectsFor(branch, sem, scheme = '2022') {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { VTU_OFFICIAL_SUBJECT_DATA } = require('./vtu-curriculum-catalog.js');
        const cleanBranch = normalizeBranch(branch);
        const s = String(scheme || '2022').trim();
        const semNum = Number(sem) || 1;
        let list = VTU_OFFICIAL_SUBJECT_DATA?.[s]?.[cleanBranch]?.[semNum];

        if (!list || list.length === 0) {
            if (semNum <= 2) {
                list = VTU_OFFICIAL_SUBJECT_DATA?.[s]?.['CS']?.[semNum] || [];
            } else {
                list = VTU_OFFICIAL_SUBJECT_DATA?.[s]?.[cleanBranch]?.[semNum] || [];
            }
        }

        const defaultGrade = VTU_SCHEMES[s]?.gradeOrder?.[0] || 'O';
        return (list || []).map(s => ({ ...s, grade: defaultGrade }));
    } catch {
        return [];
    }
}
