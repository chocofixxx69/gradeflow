// lib/vtuGrades.js (Enhanced with Branch & Comprehensive Subject Data)

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
        // Historical Support for old data in DB
        'O': { label: 'PASS', points: 10, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'A+': { label: 'PASS', points: 9, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'B+': { label: 'PASS', points: 7, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'B': { label: 'PASS', points: 6, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
        'C': { label: 'PASS', points: 5, color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
    };
}
function getNewGradeOrder() { return ['P', 'F', 'A', 'W', 'X', 'NE']; }

export function getGradePoint(grade, scheme = '2022', totalMarks = null, externalMarks = null) {
    // F, A (Absent), X, NE = always 0 points
    const unified = unifyGrade(grade);
    if (['F', 'A', 'X', 'NE'].includes(unified)) return 0;

    // Grade is P (Pass) — trust it. VTU already determined pass/fail correctly.
    // Labs, projects, PE may have ext=0 but are legitimate passes.
    if (totalMarks !== null && (scheme === '2022' || scheme === '2025')) {
        const score = Math.round(Number(totalMarks)) || 0;
        if (score >= 90) return 10;
        if (score >= 80) return 9;
        if (score >= 70) return 8;
        if (score >= 60) return 7;
        if (score >= 55) return 6;
        if (score >= 50) return 5;
        if (score >= 40) return 4;
        return 0;
    }

    return VTU_SCHEMES[scheme]?.grades[grade]?.points ?? 0;
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
    if (['O', 'S', 'A+', 'B+', 'B', 'C', 'P'].includes(g)) return 'P';
    if (['AB', 'ABSENT', 'Ab', 'A'].includes(g)) return 'A';
    return g;
}

export function getGradeRank(grade) {
    const unified = unifyGrade(grade);
    if (unified === 'P') return 4;
    if (unified === 'F') return 1;
    if (unified === 'A') return 0;
    return 0;
}

export function calculateSGPA(subjects, scheme = '2022') {
    const config = VTU_SCHEMES[scheme];
    let tc = 0; // Total Registered Credits
    let tcp = 0; // Total Credit Points (Sum of C * GP)

    for (const s of subjects) {
        const grade = s.grade?.toUpperCase();
        if (config.exclude.includes(grade)) continue;

        // Use the unified getGradePoint which handles F/A, ext<18, and marks-based points
        const gp = getGradePoint(s.grade, scheme, s.total_marks || s.total || null, s.see_marks ?? s.external ?? null);

        // Use actual credits from the subject, fallback to 3 if missing
        const cr = Number(s.credits) || 3;

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

export function getPerformanceLabel(v) {
    const val = parseFloat(v);
    if (val >= 9.5) return { label: 'Outstanding', color: '#10b981', emoji: '🏆' };
    if (val >= 8.5) return { label: 'Excellent', color: '#3b82f6', emoji: '⭐' };
    if (val >= 7.5) return { label: 'Very Good', color: '#8b5cf6', emoji: '✨' };
    if (val >= 6.5) return { label: 'Good', color: '#f59e0b', emoji: '👍' };
    if (val >= 5.5) return { label: 'Average', color: '#f97316', emoji: '📈' };
    if (val >= 4.0) return { label: 'Pass', color: '#6b7280', emoji: '✅' };
    return { label: 'Needs Improvement', color: '#ef4444', emoji: '⚠️' };
}

export function createEmptySubject(id, scheme = '2022') {
    return { id, code: '', name: '', credits: 3, grade: VTU_SCHEMES[scheme].gradeOrder[0] };
}

// ── BRANCH DATA ───────────────────────────────────────────────────────────

export const VTU_BRANCHES = {
    'COMMON': 'Physics/Chemistry Cycle (Sem 1-2)',
    'CSE': 'Computer Science',
    'ISE': 'Information Science',
    'ECE': 'Electronics & Comm.',
    'EEE': 'Electrical & Electronics',
    'ME': 'Mechanical Engineering',
    'CIVIL': 'Civil Engineering',
    'AIML': 'AI & Machine Learning',
    'DS': 'Data Science'
};

export const VTU_SUBJECT_DATA = {
    "2022_COMMON": {
        "1": [
            {
                "code": "22MATC11",
                "name": "Applied Mathematics - I",
                "credits": 4
            },
            {
                "code": "22PHYC12",
                "name": "Applied Physics",
                "credits": 3
            },
            {
                "code": "22CIASC13",
                "name": "Computer Aided Engg Drawing",
                "credits": 3
            },
            {
                "code": "22ESC14",
                "name": "Engineering Science Course I",
                "credits": 3
            },
            {
                "code": "22PSCS15",
                "name": "Problem Solving with C",
                "credits": 3
            },
            {
                "code": "22ENGL16",
                "name": "Communicative English",
                "credits": 2
            },
            {
                "code": "22PHYCL17",
                "name": "Applied Physics Lab",
                "credits": 1
            },
            {
                "code": "22PSCSL18",
                "name": "C Programming Lab",
                "credits": 1
            },
            {
                "code": "22IDT159",
                "name": "Ideation & Design Thinking",
                "credits": 1
            },
            {
                "code": "22MATE11",
                "name": "Applied Mathematics - I",
                "credits": 4
            },
            {
                "code": "22PHYE12",
                "name": "Applied Physics",
                "credits": 3
            },
            {
                "code": "22CEDE13",
                "name": "Computer Aided Engg Drawing",
                "credits": 3
            },
            {
                "code": "22EC15",
                "name": "Basic Core subject",
                "credits": 3
            },
            {
                "code": "22EE15",
                "name": "Basic Core subject",
                "credits": 3
            },
            {
                "code": "22RI15",
                "name": "Basic Core subject",
                "credits": 3
            },
            {
                "code": "22MATM11",
                "name": "Applied Math I",
                "credits": 4
            },
            {
                "code": "22CHEC12",
                "name": "Chemistry",
                "credits": 3
            },
            {
                "code": "22CEDM13",
                "name": "Engg Drawing",
                "credits": 3
            },
            {
                "code": "22EME15",
                "name": "Basic ME/CV",
                "credits": 3
            }
        ],
        "2": [
            {
                "code": "22MATC21",
                "name": "Applied Mathematics - II",
                "credits": 4
            },
            {
                "code": "22CHEC22",
                "name": "Applied Chemistry",
                "credits": 3
            },
            {
                "code": "22ESC24",
                "name": "Engineering Science Course II",
                "credits": 3
            },
            {
                "code": "22POPS25",
                "name": "Python Programming",
                "credits": 3
            },
            {
                "code": "22SKS26",
                "name": "Sanskrit/Kannada/Constitution",
                "credits": 2
            },
            {
                "code": "22CHECL27",
                "name": "Applied Chemistry Lab",
                "credits": 1
            },
            {
                "code": "22POPSL28",
                "name": "Python Programming Lab",
                "credits": 1
            },
            {
                "code": "22PRJL29",
                "name": "Project Based Learning",
                "credits": 1
            },
            {
                "code": "22MATE21",
                "name": "Applied Mathematics - II",
                "credits": 4
            },
            {
                "code": "22MATM21",
                "name": "Applied Math II",
                "credits": 4
            },
            {
                "code": "22PHYM22",
                "name": "Physics",
                "credits": 3
            }
        ]
    },
    "CSE": {
        "3": [
            {
                "code": "22MATC31",
                "name": "Mathematics III",
                "credits": 4
            },
            {
                "code": "22CS32",
                "name": "Core I",
                "credits": 3
            },
            {
                "code": "22CS33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22CS34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22CSL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22CSL37",
                "name": "Lab II",
                "credits": 2
            },
            {
                "code": "22CIR38",
                "name": "COI",
                "credits": 1
            }
        ],
        "4": [
            {
                "code": "22CS41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22CS42",
                "name": "Core IV",
                "credits": 3
            },
            {
                "code": "22CS43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22CS44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22CSL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22CSL47",
                "name": "Lab IV",
                "credits": 2
            },
            {
                "code": "22CIR48",
                "name": "ENV",
                "credits": 1
            }
        ],
        "5": [
            {
                "code": "22CS51",
                "name": "Core VII",
                "credits": 3
            },
            {
                "code": "22CS52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22CS53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22CS54",
                "name": "Core X",
                "credits": 3
            },
            {
                "code": "22CSL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22CSL57",
                "name": "Lab VI",
                "credits": 2
            },
            {
                "code": "22MP58",
                "name": "Mini Proj",
                "credits": 1
            }
        ],
        "6": [
            {
                "code": "22CS61",
                "name": "Core XI",
                "credits": 3
            },
            {
                "code": "22CS62",
                "name": "Core XII",
                "credits": 3
            },
            {
                "code": "22CS63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22CS64",
                "name": "Core XIV",
                "credits": 3
            },
            {
                "code": "22CSL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22CSL67",
                "name": "Lab VIII",
                "credits": 2
            },
            {
                "code": "22CP68",
                "name": "Capstone",
                "credits": 1
            }
        ],
        "7": [
            {
                "code": "22CS71",
                "name": "Core XV",
                "credits": 3
            },
            {
                "code": "22CS72",
                "name": "Core XVI",
                "credits": 3
            },
            {
                "code": "22CS73",
                "name": "Elect III",
                "credits": 3
            },
            {
                "code": "22CS74",
                "name": "Open Elect",
                "credits": 3
            },
            {
                "code": "22CSL76",
                "name": "Proj I",
                "credits": 3
            },
            {
                "code": "22CSP77",
                "name": "Internship",
                "credits": 2
            }
        ],
        "8": [
            {
                "code": "22CSP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22CSP82",
                "name": "Elect IV",
                "credits": 3
            }
        ]
    },
    "AIML": {
        "3": [
            {
                "code": "22MATC31",
                "name": "Mathematics III",
                "credits": 4
            },
            {
                "code": "22CI32",
                "name": "Core I",
                "credits": 3
            },
            {
                "code": "22CI33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22CI34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22CIL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22CIL37",
                "name": "Lab II",
                "credits": 2
            },
            {
                "code": "22CIR38",
                "name": "COI",
                "credits": 1
            },
            {
                "code": "22AD32",
                "name": "Core I",
                "credits": 3
            },
            {
                "code": "22AD33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22AD34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22ADL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22ADL37",
                "name": "Lab II",
                "credits": 2
            },
            {
                "code": "22RI31",
                "name": "Math III",
                "credits": 4
            },
            {
                "code": "22RI32",
                "name": "Core I",
                "credits": 4
            },
            {
                "code": "22RI33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22RI34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22RIL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22RIL37",
                "name": "Lab II",
                "credits": 2
            },
            {
                "code": "22GC36",
                "name": "UHV",
                "credits": 1
            }
        ],
        "4": [
            {
                "code": "22CI41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22CI42",
                "name": "Core IV",
                "credits": 3
            },
            {
                "code": "22CI43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22CI44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22CIL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22CIL47",
                "name": "Lab IV",
                "credits": 2
            },
            {
                "code": "22CIR48",
                "name": "ENV",
                "credits": 1
            },
            {
                "code": "22AD41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22AD42",
                "name": "Core IV",
                "credits": 3
            },
            {
                "code": "22AD43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22AD44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22ADL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22ADL47",
                "name": "Lab IV",
                "credits": 2
            },
            {
                "code": "22RI41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22RI42",
                "name": "Core IV",
                "credits": 4
            },
            {
                "code": "22RI43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22RI44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22RIL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22RIL47",
                "name": "Lab IV",
                "credits": 2
            }
        ],
        "5": [
            {
                "code": "22CI51",
                "name": "Core VII",
                "credits": 3
            },
            {
                "code": "22CI52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22CI53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22CI54",
                "name": "Core X",
                "credits": 3
            },
            {
                "code": "22CIL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22CIL57",
                "name": "Lab VI",
                "credits": 2
            },
            {
                "code": "22MP58",
                "name": "Mini Proj",
                "credits": 1
            },
            {
                "code": "22AD51",
                "name": "Core VII",
                "credits": 3
            },
            {
                "code": "22AD52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22AD53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22AD54",
                "name": "Core X",
                "credits": 3
            },
            {
                "code": "22ADL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22ADL57",
                "name": "Lab VI",
                "credits": 2
            },
            {
                "code": "22RI51",
                "name": "Core VII",
                "credits": 4
            },
            {
                "code": "22RI52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22RI53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22RI54",
                "name": "Core X",
                "credits": 4
            },
            {
                "code": "22RIL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22RIL57",
                "name": "Lab VI",
                "credits": 2
            }
        ],
        "6": [
            {
                "code": "22CI61",
                "name": "Core XI",
                "credits": 3
            },
            {
                "code": "22CI62",
                "name": "Core XII",
                "credits": 3
            },
            {
                "code": "22CI63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22CI64",
                "name": "Core XIV",
                "credits": 3
            },
            {
                "code": "22CIL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22CIL67",
                "name": "Lab VIII",
                "credits": 2
            },
            {
                "code": "22CP68",
                "name": "Capstone",
                "credits": 1
            },
            {
                "code": "22AD61",
                "name": "Core XI",
                "credits": 3
            },
            {
                "code": "22AD62",
                "name": "Core XII",
                "credits": 3
            },
            {
                "code": "22AD63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22AD64",
                "name": "Core XIV",
                "credits": 3
            },
            {
                "code": "22ADL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22ADL67",
                "name": "Lab VIII",
                "credits": 2
            },
            {
                "code": "22RI61",
                "name": "Core XI",
                "credits": 4
            },
            {
                "code": "22RI62",
                "name": "Core XII",
                "credits": 4
            },
            {
                "code": "22RI63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22RIL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22RIL67",
                "name": "Lab VIII",
                "credits": 2
            }
        ],
        "7": [
            {
                "code": "22CI71",
                "name": "Core XV",
                "credits": 3
            },
            {
                "code": "22CI72",
                "name": "Core XVI",
                "credits": 3
            },
            {
                "code": "22CI73",
                "name": "Elect III",
                "credits": 3
            },
            {
                "code": "22CI74",
                "name": "Open Elect",
                "credits": 3
            },
            {
                "code": "22CIL76",
                "name": "Proj I",
                "credits": 3
            },
            {
                "code": "22CIP77",
                "name": "Internship",
                "credits": 2
            },
            {
                "code": "22AD71",
                "name": "Core XV",
                "credits": 3
            },
            {
                "code": "22AD72",
                "name": "Core XVI",
                "credits": 3
            },
            {
                "code": "22AD73",
                "name": "Elect III",
                "credits": 3
            },
            {
                "code": "22AD74",
                "name": "Open Elect",
                "credits": 3
            },
            {
                "code": "22ADL76",
                "name": "Proj I",
                "credits": 3
            },
            {
                "code": "22ADP77",
                "name": "Internship",
                "credits": 2
            }
        ],
        "8": [
            {
                "code": "22CIP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22CIP82",
                "name": "Elect IV",
                "credits": 3
            },
            {
                "code": "22ADP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22ADP82",
                "name": "Elect IV",
                "credits": 3
            },
            {
                "code": "22RIP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22RIP82",
                "name": "Elect IV",
                "credits": 3
            }
        ]
    },
    "DS": {
        "3": [
            {
                "code": "22MATC31",
                "name": "Mathematics III",
                "credits": 4
            },
            {
                "code": "22CD32",
                "name": "Core I",
                "credits": 3
            },
            {
                "code": "22CD33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22CD34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22CDL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22CDL37",
                "name": "Lab II",
                "credits": 2
            },
            {
                "code": "22CIR38",
                "name": "COI",
                "credits": 1
            },
            {
                "code": "22DS32",
                "name": "Core I",
                "credits": 3
            },
            {
                "code": "22DS33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22DS34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22DSL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22DSL37",
                "name": "Lab II",
                "credits": 2
            }
        ],
        "4": [
            {
                "code": "22CD41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22CD42",
                "name": "Core IV",
                "credits": 3
            },
            {
                "code": "22CD43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22CD44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22CDL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22CDL47",
                "name": "Lab IV",
                "credits": 2
            },
            {
                "code": "22CIR48",
                "name": "ENV",
                "credits": 1
            },
            {
                "code": "22DS41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22DS42",
                "name": "Core IV",
                "credits": 3
            },
            {
                "code": "22DS43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22DS44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22DSL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22DSL47",
                "name": "Lab IV",
                "credits": 2
            }
        ],
        "5": [
            {
                "code": "22CD51",
                "name": "Core VII",
                "credits": 3
            },
            {
                "code": "22CD52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22CD53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22CD54",
                "name": "Core X",
                "credits": 3
            },
            {
                "code": "22CDL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22CDL57",
                "name": "Lab VI",
                "credits": 2
            },
            {
                "code": "22MP58",
                "name": "Mini Proj",
                "credits": 1
            },
            {
                "code": "22DS51",
                "name": "Core VII",
                "credits": 3
            },
            {
                "code": "22DS52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22DS53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22DS54",
                "name": "Core X",
                "credits": 3
            },
            {
                "code": "22DSL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22DSL57",
                "name": "Lab VI",
                "credits": 2
            }
        ],
        "6": [
            {
                "code": "22CD61",
                "name": "Core XI",
                "credits": 3
            },
            {
                "code": "22CD62",
                "name": "Core XII",
                "credits": 3
            },
            {
                "code": "22CD63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22CD64",
                "name": "Core XIV",
                "credits": 3
            },
            {
                "code": "22CDL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22CDL67",
                "name": "Lab VIII",
                "credits": 2
            },
            {
                "code": "22CP68",
                "name": "Capstone",
                "credits": 1
            },
            {
                "code": "22DS61",
                "name": "Core XI",
                "credits": 3
            },
            {
                "code": "22DS62",
                "name": "Core XII",
                "credits": 3
            },
            {
                "code": "22DS63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22DS64",
                "name": "Core XIV",
                "credits": 3
            },
            {
                "code": "22DSL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22DSL67",
                "name": "Lab VIII",
                "credits": 2
            }
        ],
        "7": [
            {
                "code": "22CD71",
                "name": "Core XV",
                "credits": 3
            },
            {
                "code": "22CD72",
                "name": "Core XVI",
                "credits": 3
            },
            {
                "code": "22CD73",
                "name": "Elect III",
                "credits": 3
            },
            {
                "code": "22CD74",
                "name": "Open Elect",
                "credits": 3
            },
            {
                "code": "22CDL76",
                "name": "Proj I",
                "credits": 3
            },
            {
                "code": "22CDP77",
                "name": "Internship",
                "credits": 2
            },
            {
                "code": "22DS71",
                "name": "Core XV",
                "credits": 3
            },
            {
                "code": "22DS72",
                "name": "Core XVI",
                "credits": 3
            },
            {
                "code": "22DS73",
                "name": "Elect III",
                "credits": 3
            },
            {
                "code": "22DS74",
                "name": "Open Elect",
                "credits": 3
            },
            {
                "code": "22DSL76",
                "name": "Proj I",
                "credits": 3
            },
            {
                "code": "22DSP77",
                "name": "Internship",
                "credits": 2
            }
        ],
        "8": [
            {
                "code": "22CDP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22CDP82",
                "name": "Elect IV",
                "credits": 3
            },
            {
                "code": "22DSP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22DSP82",
                "name": "Elect IV",
                "credits": 3
            }
        ]
    },
    "ISE": {
        "3": [
            {
                "code": "22MATC31",
                "name": "Mathematics III",
                "credits": 4
            },
            {
                "code": "22IS32",
                "name": "Core I",
                "credits": 3
            },
            {
                "code": "22IS33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22IS34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22ISL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22ISL37",
                "name": "Lab II",
                "credits": 2
            },
            {
                "code": "22CIR38",
                "name": "COI",
                "credits": 1
            }
        ],
        "4": [
            {
                "code": "22IS41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22IS42",
                "name": "Core IV",
                "credits": 3
            },
            {
                "code": "22IS43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22IS44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22ISL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22ISL47",
                "name": "Lab IV",
                "credits": 2
            },
            {
                "code": "22CIR48",
                "name": "ENV",
                "credits": 1
            }
        ],
        "5": [
            {
                "code": "22IS51",
                "name": "Core VII",
                "credits": 3
            },
            {
                "code": "22IS52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22IS53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22IS54",
                "name": "Core X",
                "credits": 3
            },
            {
                "code": "22ISL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22ISL57",
                "name": "Lab VI",
                "credits": 2
            },
            {
                "code": "22MP58",
                "name": "Mini Proj",
                "credits": 1
            }
        ],
        "6": [
            {
                "code": "22IS61",
                "name": "Core XI",
                "credits": 3
            },
            {
                "code": "22IS62",
                "name": "Core XII",
                "credits": 3
            },
            {
                "code": "22IS63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22IS64",
                "name": "Core XIV",
                "credits": 3
            },
            {
                "code": "22ISL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22ISL67",
                "name": "Lab VIII",
                "credits": 2
            },
            {
                "code": "22CP68",
                "name": "Capstone",
                "credits": 1
            }
        ],
        "7": [
            {
                "code": "22IS71",
                "name": "Core XV",
                "credits": 3
            },
            {
                "code": "22IS72",
                "name": "Core XVI",
                "credits": 3
            },
            {
                "code": "22IS73",
                "name": "Elect III",
                "credits": 3
            },
            {
                "code": "22IS74",
                "name": "Open Elect",
                "credits": 3
            },
            {
                "code": "22ISL76",
                "name": "Proj I",
                "credits": 3
            },
            {
                "code": "22ISP77",
                "name": "Internship",
                "credits": 2
            }
        ],
        "8": [
            {
                "code": "22ISP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22ISP82",
                "name": "Elect IV",
                "credits": 3
            }
        ]
    },
    "ECE": {
        "3": [
            {
                "code": "22EC31",
                "name": "Math III",
                "credits": 4
            },
            {
                "code": "22EC32",
                "name": "Core I",
                "credits": 4
            },
            {
                "code": "22EC33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22EC34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22ECL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22ECL37",
                "name": "Lab II",
                "credits": 2
            },
            {
                "code": "22GC36",
                "name": "UHV",
                "credits": 1
            }
        ],
        "4": [
            {
                "code": "22EC41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22EC42",
                "name": "Core IV",
                "credits": 4
            },
            {
                "code": "22EC43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22EC44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22ECL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22ECL47",
                "name": "Lab IV",
                "credits": 2
            },
            {
                "code": "22CIR48",
                "name": "ENV",
                "credits": 1
            }
        ],
        "5": [
            {
                "code": "22EC51",
                "name": "Core VII",
                "credits": 4
            },
            {
                "code": "22EC52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22EC53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22EC54",
                "name": "Core X",
                "credits": 4
            },
            {
                "code": "22ECL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22ECL57",
                "name": "Lab VI",
                "credits": 2
            },
            {
                "code": "22MP58",
                "name": "Mini Proj",
                "credits": 1
            }
        ],
        "6": [
            {
                "code": "22EC61",
                "name": "Core XI",
                "credits": 4
            },
            {
                "code": "22EC62",
                "name": "Core XII",
                "credits": 4
            },
            {
                "code": "22EC63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22ECL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22ECL67",
                "name": "Lab VIII",
                "credits": 2
            },
            {
                "code": "22CP68",
                "name": "Capstone",
                "credits": 1
            }
        ],
        "8": [
            {
                "code": "22ECP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22ECP82",
                "name": "Elect IV",
                "credits": 3
            }
        ]
    },
    "EEE": {
        "3": [
            {
                "code": "22EE31",
                "name": "Math III",
                "credits": 4
            },
            {
                "code": "22EE32",
                "name": "Core I",
                "credits": 4
            },
            {
                "code": "22EE33",
                "name": "Core II",
                "credits": 3
            },
            {
                "code": "22EE34",
                "name": "Core III",
                "credits": 3
            },
            {
                "code": "22EEL36",
                "name": "Lab I",
                "credits": 2
            },
            {
                "code": "22EEL37",
                "name": "Lab II",
                "credits": 2
            },
            {
                "code": "22GC36",
                "name": "UHV",
                "credits": 1
            }
        ],
        "4": [
            {
                "code": "22EE41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22EE42",
                "name": "Core IV",
                "credits": 4
            },
            {
                "code": "22EE43",
                "name": "Core V",
                "credits": 3
            },
            {
                "code": "22EE44",
                "name": "Core VI",
                "credits": 3
            },
            {
                "code": "22EEL46",
                "name": "Lab III",
                "credits": 2
            },
            {
                "code": "22EEL47",
                "name": "Lab IV",
                "credits": 2
            },
            {
                "code": "22CIR48",
                "name": "ENV",
                "credits": 1
            }
        ],
        "5": [
            {
                "code": "22EE51",
                "name": "Core VII",
                "credits": 4
            },
            {
                "code": "22EE52",
                "name": "Core VIII",
                "credits": 3
            },
            {
                "code": "22EE53",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22EE54",
                "name": "Core X",
                "credits": 4
            },
            {
                "code": "22EEL56",
                "name": "Lab V",
                "credits": 2
            },
            {
                "code": "22EEL57",
                "name": "Lab VI",
                "credits": 2
            },
            {
                "code": "22MP58",
                "name": "Mini Proj",
                "credits": 1
            }
        ],
        "6": [
            {
                "code": "22EE61",
                "name": "Core XI",
                "credits": 4
            },
            {
                "code": "22EE62",
                "name": "Core XII",
                "credits": 4
            },
            {
                "code": "22EE63",
                "name": "Core XIII",
                "credits": 3
            },
            {
                "code": "22EEL66",
                "name": "Lab VII",
                "credits": 2
            },
            {
                "code": "22EEL67",
                "name": "Lab VIII",
                "credits": 2
            },
            {
                "code": "22CP68",
                "name": "Capstone",
                "credits": 1
            }
        ],
        "8": [
            {
                "code": "22EEP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22EEP82",
                "name": "Elect IV",
                "credits": 3
            }
        ]
    },
    "ME": {
        "3": [
            {
                "code": "22ME31",
                "name": "Core I",
                "credits": 4
            },
            {
                "code": "22ME32",
                "name": "Core II",
                "credits": 4
            },
            {
                "code": "22ME33",
                "name": "Core III",
                "credits": 3
            }
        ],
        "4": [
            {
                "code": "22ME41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22ME42",
                "name": "Core IV",
                "credits": 4
            },
            {
                "code": "22ME43",
                "name": "Core V",
                "credits": 3
            }
        ],
        "5": [
            {
                "code": "22ME51",
                "name": "Core VI",
                "credits": 4
            },
            {
                "code": "22ME52",
                "name": "Core VII",
                "credits": 3
            },
            {
                "code": "22ME53",
                "name": "Core VIII",
                "credits": 3
            }
        ],
        "6": [
            {
                "code": "22ME61",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22ME62",
                "name": "Core X",
                "credits": 3
            },
            {
                "code": "22MEL66",
                "name": "Lab",
                "credits": 2
            }
        ],
        "7": [
            {
                "code": "22ME71",
                "name": "Core XI",
                "credits": 3
            },
            {
                "code": "22ME72",
                "name": "Elective",
                "credits": 3
            },
            {
                "code": "22MEP77",
                "name": "Internship",
                "credits": 2
            }
        ],
        "8": [
            {
                "code": "22MEP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22MEP82",
                "name": "Elective",
                "credits": 3
            }
        ]
    },
    "CIVIL": {
        "3": [
            {
                "code": "22CV31",
                "name": "Core I",
                "credits": 4
            },
            {
                "code": "22CV32",
                "name": "Core II",
                "credits": 4
            },
            {
                "code": "22CV33",
                "name": "Core III",
                "credits": 3
            }
        ],
        "4": [
            {
                "code": "22CV41",
                "name": "Math IV",
                "credits": 4
            },
            {
                "code": "22CV42",
                "name": "Core IV",
                "credits": 4
            },
            {
                "code": "22CV43",
                "name": "Core V",
                "credits": 3
            }
        ],
        "5": [
            {
                "code": "22CV51",
                "name": "Core VI",
                "credits": 4
            },
            {
                "code": "22CV52",
                "name": "Core VII",
                "credits": 3
            },
            {
                "code": "22CV53",
                "name": "Core VIII",
                "credits": 3
            }
        ],
        "6": [
            {
                "code": "22CV61",
                "name": "Core IX",
                "credits": 3
            },
            {
                "code": "22CV62",
                "name": "Core X",
                "credits": 3
            },
            {
                "code": "22CVL66",
                "name": "Lab",
                "credits": 2
            }
        ],
        "7": [
            {
                "code": "22CV71",
                "name": "Core XI",
                "credits": 3
            },
            {
                "code": "22CV72",
                "name": "Elective",
                "credits": 3
            },
            {
                "code": "22CVP77",
                "name": "Internship",
                "credits": 2
            }
        ],
        "8": [
            {
                "code": "22CVP81",
                "name": "Final Proj",
                "credits": 10
            },
            {
                "code": "22CVP82",
                "name": "Elective",
                "credits": 3
            }
        ]
    },
    "2025_COMMON": {
        "1": [
            {
                "code": "1BMATC101",
                "name": "Applied Math I",
                "credits": 4
            },
            {
                "code": "1BPHYC102",
                "name": "Applied Physics",
                "credits": 4
            },
            {
                "code": "1BEIT105",
                "name": "IT Programming",
                "credits": 3
            },
            {
                "code": "1BMATE101",
                "name": "Applied Math I",
                "credits": 4
            },
            {
                "code": "1BPHYE102",
                "name": "Applied Physics",
                "credits": 4
            },
            {
                "code": "1BECE105",
                "name": "EC Specific",
                "credits": 3
            },
            {
                "code": "1BMATM101",
                "name": "Applied Math I",
                "credits": 4
            },
            {
                "code": "1BPHYM102",
                "name": "Applied Physics",
                "credits": 4
            },
            {
                "code": "1BEME105",
                "name": "Mech Specific",
                "credits": 3
            },
            {
                "code": "1BENGL106",
                "name": "Communicative English",
                "credits": 2
            },
            {
                "code": "1BICO107",
                "name": "Constitution of India",
                "credits": 1
            },
            {
                "code": "1BIDTL158",
                "name": "Ideation",
                "credits": 1
            }
        ],
        "2": [
            {
                "code": "1BPRJ258",
                "name": "Project PBL",
                "credits": 1
            }
        ]
    }
};

export function getSubjectInfo(code) {
    for (const b in VTU_SUBJECT_DATA) {
        for (const s in VTU_SUBJECT_DATA[b]) {
            const found = VTU_SUBJECT_DATA[b][s].find(sub => sub.code === code);
            if (found) return found;
        }
    }
    return null;
}

export function getSubjectsFor(branch, sem, scheme = '2022') {
    let data = {};
    if (sem <= 2) {
        data = VTU_SUBJECT_DATA['2022_COMMON'] || {};
    } else {
        data = VTU_SUBJECT_DATA[branch] || {};
    }

    // Safety check for empty data objects
    const list = data ? (data[sem] || []) : [];
    const defaultGrade = VTU_SCHEMES[scheme]?.gradeOrder?.[0] || 'O';

    return list.map(s => ({ ...s, grade: defaultGrade }));
}
