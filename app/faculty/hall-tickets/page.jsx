'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import { useLive, LIVE } from '@/lib/api/live';
import { matchesBranch, canonicalBranchCode, extractBranchFromUsn } from '@/lib/semester-utils';
import { filterAndRankStudents } from '@/lib/search-utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';
import HallTicketSheet from '@/components/hall-tickets/HallTicketSheet';
import TimetableEditor from '@/components/hall-tickets/TimetableEditor';
import { getJsPDF } from '@/lib/lazy-export-libs';
import { recordFacultyAction } from '@/lib/api/faculty-action';

// Standard default timetable by semester for CS stream
const DEFAULT_TIMETABLES = {
    6: [
        { date: '24/03/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS601', subjectName: 'CC' },
        { date: '24/03/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS602', subjectName: 'ML' },
        { date: '25/03/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS613B', subjectName: 'CV' },
        { date: '25/03/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BEE654B', subjectName: 'TRES' }
    ],
    7: [
        { date: '02/12/2025', time: '10:00 am to 11:00 am', subjectCode: 'BCS701', subjectName: 'IOT' },
        { date: '02/12/2025', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS702', subjectName: 'PC' },
        { date: '03/12/2025', time: '10:00 am to 11:00 am', subjectCode: 'BCS703', subjectName: 'CN' },
        { date: '03/12/2025', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS714D', subjectName: 'BDA' },
        { date: '04/12/2025', time: '10:00 am to 11:00 am', subjectCode: 'BME755D', subjectName: 'NCS' }
    ],
    4: [
        { date: '20/05/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS401', subjectName: 'ADA' },
        { date: '20/05/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS402', subjectName: 'MC' },
        { date: '21/05/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS403', subjectName: 'DBMS' },
        { date: '21/05/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS456C', subjectName: 'UI/UX' }
    ],
    3: [
        { date: '15/11/2025', time: '10:00 am to 11:00 am', subjectCode: 'BCS301', subjectName: 'MATHS' },
        { date: '15/11/2025', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS302', subjectName: 'DDCO' },
        { date: '16/11/2025', time: '10:00 am to 11:00 am', subjectCode: 'BCS303', subjectName: 'OS' },
        { date: '16/11/2025', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS304', subjectName: 'DSA' }
    ],
    1: [
        { date: '10/01/2026', time: '10:00 am to 11:00 am', subjectCode: 'BMATS101', subjectName: 'MATHS-I' },
        { date: '10/01/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BPHYS102', subjectName: 'PHYSICS' },
        { date: '11/01/2026', time: '10:00 am to 11:00 am', subjectCode: 'BPOPS103', subjectName: 'POP C' },
        { date: '11/01/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BESCK104B', subjectName: 'ELECTRICAL' }
    ]
};

const ROMAN_SEMESTERS = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII'
};

const KNOWN_VTU_ACRONYMS = {
    'INTERNET OF THINGS': 'IOT',
    'PARALLEL COMPUTING': 'PC',
    'CRYPTOGRAPHY & NETWORK SECURITY': 'CNS',
    'CRYPTOGRAPHY AND NETWORK SECURITY': 'CNS',
    'MACHINE LEARNING': 'ML',
    'CLOUD COMPUTING': 'CC',
    'COMPUTER VISION': 'CV',
    'OPERATING SYSTEMS': 'OS',
    'DATA STRUCTURES AND APPLICATIONS': 'DSA',
    'DATA STRUCTURES': 'DS',
    'BIG DATA ANALYTICS': 'BDA',
    'ARTIFICIAL INTELLIGENCE & MACHINE LEARNING': 'AIML',
    'MICROCONTROLLERS & EMBEDDED SYSTEMS': 'MES',
    'DIGITAL DESIGN AND COMPUTER ORGANIZATION': 'DDCO',
    'SOFTWARE ENGINEERING AND PROJECT MANAGEMENT': 'SEPM',
    'THEORY OF COMPUTATION': 'TOC',
    'DATABASE MANAGEMENT SYSTEMS': 'DBMS',
    'ADVANCED JAVA PROGRAMMING': 'AJP',
    'HIGH PERFORMANCE COMPUTING': 'HPC',
    'POWER SYSTEM ANALYSIS - I': 'PSA-1',
    'CONTROL SYSTEMS': 'CS',
    'CLOUD COMPUTING OPEN STACK GOOGLE': 'CC',
    'PROFESSIONAL ELECTIVE COURSE': 'PEC',
    'OPEN ELECTIVE COURSE': 'OEC',
    'ABILITY ENHANCEMENT COURSE SKILL DEVELOPMENT COURSE V': 'AEC-V',
    'PHYSICAL EDUCATION': 'PE',
    'INDIAN KNOWLEDGE SYSTEM': 'IKS',
    'CAPSTONE PROJECT PHASE I': 'CP-1',
    'IOT LABORATORY': 'IOT LAB',
    'MACHINE LEARNING LAB': 'ML LAB',
    'PROJECT PHASE I': 'PRJ-1'
};

function getSubjectShortName(name, code) {
    if (!name) return code || '';
    const cleanUpper = name.replace(/[^a-zA-Z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
    if (KNOWN_VTU_ACRONYMS[cleanUpper]) return KNOWN_VTU_ACRONYMS[cleanUpper];

    const words = cleanUpper.split(/\s+/).filter(w => !['AND', 'OF', 'THE', 'FOR', 'TO', 'IN', 'WITH', 'BY', '&'].includes(w));
    if (words.length > 1) {
        return words.map(w => w[0]).join('').slice(0, 5);
    }
    return (words[0] || code || '').slice(0, 5);
}

export default function HallTicketsPage() {
    return (
        <AuthGuard role="faculty">
            <HallTicketsContent />
        </AuthGuard>
    );
}

function HallTicketsContent() {
    const [meta, setMeta] = useState({ branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8], subjects: [], cohortMatrix: {} });

    // Scope Selection. Faculty selects Department, Semester, and one or multiple Classes.
    const [selectedClassIds, setSelectedClassIds] = useState([]);
    const [branch, setBranch] = useState('CS');
    const [semester, setSemester] = useState(6);

    // Students Data
    const [selectedUsns, setSelectedUsns] = useState(new Set());
    const [studentSearch, setStudentSearch] = useState('');

    // Exam Metadata
    const [examType, setExamType] = useState('IA-1'); // 'IA-1' | 'IA-2' | 'IA-3' | 'Semester End'
    const [examMonthYear, setExamMonthYear] = useState('MARCH 2026');
    const [examTitle, setExamTitle] = useState('VII Semester IA-1 MARCH 2026 Examination');
    // Whether examTitle was hand-edited — once true, the auto-sync effect below
    // stops overwriting it, so a manual edit isn't silently clobbered by the
    // next Exam Type / Month change. "Reset to auto" (below) clears this.
    const [examTitleManual, setExamTitleManual] = useState(false);
    const [departmentName, setDepartmentName] = useState('Department of Computer Science & Engineering');

    // Timetable
    const [timetable, setTimetable] = useState(DEFAULT_TIMETABLES[6] || DEFAULT_TIMETABLES[7]);
    const [timetableLoading, setTimetableLoading] = useState(false);
    const [catalogSubjects, setCatalogSubjects] = useState([]);
    const [dismissedMismatch, setDismissedMismatch] = useState(false);

    // Preview Controls
    const [previewMode, setPreviewMode] = useState('paged'); // 'paged' | 'continuous'
    const [activePage, setActivePage] = useState(1);

    // 1. Fetch Metadata
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) {
                    setMeta(res);
                }
            } catch (err) {
                console.error('Meta loading failed:', err);
            }
        }
        loadMeta();
    }, []);

    // 1b. Fetch active catalog subjects for the current branch & semester from /api/subjects
    useEffect(() => {
        let cancelled = false;
        async function loadCatalog() {
            const normBranch = canonicalBranchCode(branch) || branch || 'CS';
            try {
                const res = await apiRequest(`/api/subjects?branch=${normBranch}&semester=${semester}`);
                if (!cancelled && res?.subjects && res.subjects.length > 0) {
                    const formatted = res.subjects.map(s => ({
                        code: s.code,
                        name: s.name,
                        shortName: getSubjectShortName(s.name, s.code),
                        credits: s.credits
                    }));
                    setCatalogSubjects(formatted);
                    return;
                }
            } catch (err) {
                console.warn('Live catalog fetch for branch/sem failed:', err);
            }

            // Fallback to meta.subjects
            if (!cancelled && meta?.subjects?.length > 0) {
                const filtered = (meta.subjects || []).filter(s => {
                    if (Number(s.semester) !== Number(semester)) return false;
                    return s.branches?.some(b => matchesBranch(b, normBranch)) || matchesBranch(s.branch, normBranch);
                }).map(s => ({
                    code: s.code,
                    name: s.name,
                    shortName: getSubjectShortName(s.name, s.code),
                    credits: s.credits
                }));
                setCatalogSubjects(filtered);
            }
        }
        loadCatalog();
        return () => { cancelled = true; };
    }, [branch, semester, meta?.subjects]);

    // 1b. Class list driving the primary scope selector.
    const { data: classesData } = useLive('/api/classes', { interval: LIVE.NORMAL });
    const classes = useMemo(() => classesData?.classes || [], [classesData]);

    // All classes for the chosen Department/Branch
    const branchClasses = useMemo(() => {
        const normBranch = canonicalBranchCode(branch) || branch;
        return classes.filter(c => matchesBranch(c.branch, normBranch) || matchesBranch(c.branch_code, normBranch));
    }, [classes, branch]);

    // Available classes filtered to the chosen Department & Semester
    const availableClasses = useMemo(() => {
        return branchClasses.filter(c => Number(c.semester) === Number(semester));
    }, [branchClasses, semester]);

    // 2. Roster. If specific class(es) are selected, query by class_ids; otherwise
    // query by branch & semester.
    const rosterQuery = useMemo(() => {
        if (selectedClassIds.length > 0) {
            return { class_ids: selectedClassIds.join(',') };
        }
        return { branch, semester: String(semester) };
    }, [selectedClassIds, branch, semester]);

    const {
        data: rosterData,
        isLoading: rosterLoading,
        isRefreshing: rosterRefreshing,
    } = useLive('/api/faculty/hall-tickets/students', {
        query: rosterQuery,
        interval: LIVE.NORMAL,
    });

    const allStudents = useMemo(() => rosterData?.students || [], [rosterData]);
    const activeClass = useMemo(() => rosterData?.class || null, [rosterData]);
    const activeClasses = useMemo(() => rosterData?.classes || [], [rosterData]);
    const loading = rosterLoading;

    // Dynamic branch options derived from live database metadata & cohort matrix
    const branchOptions = useMemo(() => {
        const matrix = meta?.cohortMatrix || {};
        const knownOrder = ['CS', 'AI', 'DS', 'EC', 'EE', 'CV', 'ME', 'RI'];

        let list = (meta?.branches || []).filter(b => b.code !== 'ALL');
        if (list.length === 0) {
            list = [
                { code: 'CS', label: 'Computer Science & Engineering' },
                { code: 'AI', label: 'AI & Machine Learning (AIML)' },
                { code: 'DS', label: 'Computer Science & Data Science' },
                { code: 'EC', label: 'Electronics & Communication' },
                { code: 'EE', label: 'Electrical & Electronics' },
                { code: 'CV', label: 'Civil Engineering' },
                { code: 'ME', label: 'Mechanical Engineering' },
                { code: 'RI', label: 'Robotics & Artificial Intelligence' }
            ];
        }

        const sorted = [...list].sort((a, b) => {
            const idxA = knownOrder.indexOf(a.code);
            const idxB = knownOrder.indexOf(b.code);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return (a.label || a.code).localeCompare(b.label || b.code);
        });

        return sorted.map(b => {
            const cCode = canonicalBranchCode(b.code) || b.code;
            const count = b.studentCount ?? matrix[cCode]?.total ?? matrix[b.code]?.total ?? 0;
            return {
                value: b.code,
                label: `${b.code} - ${b.label || b.name || b.code}${count > 0 ? ` (${count} students)` : ''}`,
                studentCount: count
            };
        });
    }, [meta?.branches, meta?.cohortMatrix]);


    // Dynamic semester options with live student counts per semester
    const semesterOptions = useMemo(() => {
        const matrix = meta?.cohortMatrix || {};
        const cBranch = canonicalBranchCode(branch) || branch;
        const branchCohort = matrix[cBranch] || matrix[branch] || null;
        const semCounts = branchCohort?.semesters || {};

        return [1, 2, 3, 4, 5, 6, 7, 8].map(s => {
            const count = semCounts[s] || 0;
            const roman = ROMAN_SEMESTERS[s] || String(s);
            // Also count enrolled students across active classes for this branch & sem
            const classCount = classes
                .filter(c => {
                    const bMatch = matchesBranch(c.branch, cBranch) || matchesBranch(c.branch_code, cBranch);
                    return bMatch && Number(c.semester) === Number(s);
                })
                .reduce((sum, c) => sum + (c.student_count || 0), 0);
            const displayCount = classCount > 0 ? classCount : count;
            const badge = displayCount > 0 ? ` · ${displayCount} stu` : '';
            return {
                value: s,
                label: `Semester ${s} (${roman})${badge}`,
                studentCount: displayCount
            };
        });
    }, [meta?.cohortMatrix, branch, classes]);

    // Auto-fill Timetable dynamically from live syllabus / subject_catalog in DB
    const autoFillSyllabus = useCallback(async (targetBranch = branch, targetSem = semester) => {
        setTimetableLoading(true);
        try {
            const normBranch = canonicalBranchCode(targetBranch) || targetBranch || 'CS';
            let subjectList = [];

            // 1. Live query to /api/subjects for official scheme 2022/2025 catalog
            try {
                const res = await apiRequest(`/api/subjects?branch=${normBranch}&semester=${targetSem}`);
                if (res?.subjects && res.subjects.length > 0) {
                    subjectList = res.subjects;
                }
            } catch (err) {
                console.warn('Live syllabus fetch failed, falling back to metadata:', err);
            }

            // 2. Fallback to meta.subjects if /api/subjects had no records
            if (subjectList.length === 0 && meta?.subjects?.length > 0) {
                subjectList = (meta.subjects || []).filter(s => {
                    if (Number(s.semester) !== Number(targetSem)) return false;
                    return s.branches?.some(b => matchesBranch(b, normBranch)) || matchesBranch(s.branch, normBranch);
                });
            }

            // 3. If subjects found, map to timetable slots
            if (subjectList.length > 0) {
                const today = new Date();
                const dayOffset = ((1 + 7 - today.getDay()) % 7) || 7; // upcoming Monday
                const startDate = new Date(today);
                startDate.setDate(today.getDate() + dayOffset);

                // Filter out non-theory/project courses if possible
                const theorySubjects = subjectList.filter(s => {
                    const c = (s.code || '').toUpperCase();
                    return !c.includes('PRJ') && !c.includes('INT') && !c.includes('NSK');
                });
                const chosenSubjects = theorySubjects.length >= 4 ? theorySubjects.slice(0, 6) : subjectList.slice(0, 5);

                const formatted = chosenSubjects.map((s, idx) => {
                    const examDate = new Date(startDate);
                    examDate.setDate(startDate.getDate() + Math.floor(idx / 2));
                    const dStr = `${String(examDate.getDate()).padStart(2, '0')}/${String(examDate.getMonth() + 1).padStart(2, '0')}/${examDate.getFullYear()}`;
                    const timeSlot = idx % 2 === 0 ? '10:00 am to 11:00 am' : '02:30 pm to 03:30 pm';

                    const shortName = getSubjectShortName(s.name, s.code);

                    return {
                        date: dStr,
                        time: timeSlot,
                        subjectCode: s.code,
                        subjectName: shortName || s.code
                    };
                });

                if (formatted.length > 0) {
                    setTimetable(formatted);
                    return;
                }
            }

            // 4. Default timetable fallback by semester
            if (DEFAULT_TIMETABLES[targetSem]) {
                setTimetable(DEFAULT_TIMETABLES[targetSem]);
            }
        } finally {
            setTimetableLoading(false);
        }
    }, [branch, semester, meta?.subjects]);

    // Explicit Semester change handler that never reverts
    const handleSemesterChange = useCallback((newSem) => {
        const s = Number(newSem);
        setSemester(s);
        setSelectedClassIds([]);
        setDismissedMismatch(false);
        autoFillSyllabus(branch, s);
    }, [branch, autoFillSyllabus]);

    // Class selection handler: toggles class in multi-select
    const toggleClassSelection = useCallback((id) => {
        setSelectedClassIds(prev => {
            return prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id];
        });
    }, []);

    const selectAllClasses = useCallback(() => {
        if (availableClasses.length > 0) {
            setSelectedClassIds(availableClasses.map(c => c.id));
        }
    }, [availableClasses]);

    const deselectAllClasses = useCallback(() => {
        setSelectedClassIds([]);
    }, []);

    // Explicit Branch change handler
    const handleBranchChange = useCallback((newBranch) => {
        setBranch(newBranch);
        setSelectedClassIds([]);
        setDismissedMismatch(false);
        autoFillSyllabus(newBranch, semester);
    }, [semester, autoFillSyllabus]);

    // Update Exam Title when Semester, Exam Type, or Month/Year changes —
    // but only while the title is still in "auto" mode (see examTitleManual).
    useEffect(() => {
        if (examTitleManual) return;
        const roman = ROMAN_SEMESTERS[semester] || String(semester);
        setExamTitle(`${roman} Semester ${examType} ${examMonthYear} Examination`);
    }, [semester, examType, examMonthYear, examTitleManual]);

    const resetExamTitleToAuto = useCallback(() => {
        setExamTitleManual(false);
        const roman = ROMAN_SEMESTERS[semester] || String(semester);
        setExamTitle(`${roman} Semester ${examType} ${examMonthYear} Examination`);
    }, [semester, examType, examMonthYear]);

    // Update Department Name when branch changes
    useEffect(() => {
        const foundBranch = meta.branches.find(b => b.code === branch);
        const name = foundBranch?.label || foundBranch?.name || 'Computer Science & Engineering';
        const cleanName = name.replace(/\band\b/gi, '&');
        setDepartmentName(`Department of ${cleanName}`);
    }, [branch, meta.branches]);

    // Filtered Students: allStudents returned by API already match branch and batch
    const filteredStudents = useMemo(() => {
        return (allStudents || []).sort((a, b) => (a.usn || '').localeCompare(b.usn || ''));
    }, [allStudents]);

    // Pre-select all students when the student list loads or changes
    useEffect(() => {
        if (filteredStudents.length > 0) {
            setSelectedUsns(new Set(filteredStudents.map(s => s.usn)));
        } else {
            setSelectedUsns(new Set());
        }
    }, [filteredStudents]);


    // Selected students objects
    const selectedStudentsList = useMemo(() => {
        return filteredStudents.filter(s => selectedUsns.has(s.usn));
    }, [filteredStudents, selectedUsns]);

    // Group selected students into chunks of 3 per A4 sheet
    const sheets = useMemo(() => {
        const chunks = [];
        for (let i = 0; i < selectedStudentsList.length; i += 3) {
            chunks.push(selectedStudentsList.slice(i, i + 3));
        }
        return chunks;
    }, [selectedStudentsList]);

    const totalSheets = Math.max(1, sheets.length);

    // Lets the preview's "Jump to student" box find which sheet a given
    // student's ticket landed on, instead of paging through up to dozens of
    // sheets one at a time to spot-check one person's ticket.
    const [previewJumpQuery, setPreviewJumpQuery] = useState('');
    const previewJumpMatches = useMemo(() => {
        const q = previewJumpQuery.trim().toLowerCase();
        if (!q) return [];
        return selectedStudentsList
            .map((s, idx) => ({ ...s, sheetIndex: Math.floor(idx / 3) + 1 }))
            .filter(s => s.usn?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q))
            .slice(0, 8);
    }, [previewJumpQuery, selectedStudentsList]);

    const jumpToSheet = useCallback((sheetIndex) => {
        if (previewMode === 'paged') {
            setActivePage(sheetIndex);
        } else {
            const el = document.getElementById(`sheet-target-${sheetIndex}`);
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }, [previewMode]);

    // Classes listed in "3. Class / Section Scope" whose OWN semester differs
    // from the Target Semester dropdown above. Their student_count badge
    // reflects their own semester's enrollment, not the Target Semester
    // cohort the roster below is actually scoped to — the two numbers can
    // legitimately differ (not every student in an old class row has
    // progressed to Target Semester yet), but look like a bug unless it's
    // explained. Only relevant while no explicit class is selected, since
    // that's when the roster query falls back to branch+batch+semester.
    const semesterMismatchClasses = useMemo(() => {
        if (dismissedMismatch) return [];
        return branchClasses.filter(c => Number(c.semester) !== Number(semester));
    }, [branchClasses, semester, dismissedMismatch]);

    // Pre-generation readiness check — surfaced near the action buttons so a
    // problem (missing exam date, duplicate subject code, no students) is
    // caught before a 20+ sheet print/PDF job is generated from it, rather
    // than found by manually inspecting the printed output.
    const readinessIssues = useMemo(() => {
        const issues = [];
        if (selectedStudentsList.length === 0) issues.push('No students selected.');
        if (timetable.length === 0) issues.push('No exam subjects added to the timetable.');
        timetable.forEach((row, idx) => {
            if (!row.date?.trim()) issues.push(`Row ${idx + 1}: missing exam date.`);
            if (!row.subjectCode?.trim()) issues.push(`Row ${idx + 1}: missing subject code.`);
        });
        const codeCounts = {};
        timetable.forEach(row => {
            const code = (row.subjectCode || '').trim().toUpperCase();
            if (!code) return;
            codeCounts[code] = (codeCounts[code] || 0) + 1;
        });
        Object.entries(codeCounts).filter(([, n]) => n > 1).forEach(([code]) => {
            issues.push(`Subject code ${code} appears more than once in the timetable.`);
        });
        if (!examTitle?.trim()) issues.push('Examination title is empty.');
        return issues;
    }, [selectedStudentsList.length, timetable, examTitle]);

    // Toggle single student
    const handleToggleStudent = (usn) => {
        const next = new Set(selectedUsns);
        if (next.has(usn)) next.delete(usn);
        else next.add(usn);
        setSelectedUsns(next);
    };

    // Toggle All students
    const handleToggleAll = () => {
        if (selectedUsns.size === filteredStudents.length) {
            setSelectedUsns(new Set());
        } else {
            setSelectedUsns(new Set(filteredStudents.map(s => s.usn)));
        }
    };

    // Filtered students in the checklist search
    const visibleStudentsInChecklist = useMemo(() => {
        return filterAndRankStudents(filteredStudents, studentSearch);
    }, [filteredStudents, studentSearch]);

    // When every visible row shares the same section/branch (the common case
    // once scope is narrowed to one class), repeating that on all 80+ rows is
    // pure noise — show it once above the list instead and drop the per-row
    // badges. If the list is mixed (e.g. "Entire Batch Cohort" with multiple
    // sections), keep the per-row badges since they're then informative.
    const rosterCommonContext = useMemo(() => {
        if (visibleStudentsInChecklist.length === 0) return null;
        const sections = new Set(visibleStudentsInChecklist.map(s => s.section || ''));
        const branches = new Set(visibleStudentsInChecklist.map(s => s.branch_code || s.branch || ''));
        if (sections.size > 1 || branches.size > 1) return null;
        const [section] = sections;
        const [branchCode] = branches;
        return { section: section || null, branchCode: branchCode || null };
    }, [visibleStudentsInChecklist]);

    // ── Direct Browser Print ──
    const handlePrint = () => {
        try {
            const count = selectedStudentsList.length;
            recordFacultyAction(null, 'HALL_TICKET_GENERATE', selectedStudentsList[0]?.usn || null, {
                module: 'Faculty Portal > Examination Operations > Hall Tickets (Print)',
                reason: `Physical examination hall tickets print dispatched for ${branch} Sem ${semester}`,
                details: `Dispatched browser print command for ${count} verified hall tickets (${branch} Semester ${semester}). Exam: "${examTitle}".`,
                data: {
                    branch,
                    semester,
                    studentCount: count,
                    examTitle,
                    action: 'PRINT',
                    classes: activeClasses.map(c => c.name || c.class_name).filter(Boolean),
                }
            });
        } catch { /* ignored */ }
        window.print();
    };

    // Helper to fetch the optimized AITM logo as Base64 data URL for jsPDF
    const getLogoDataUrl = async () => {
        try {
            const response = await fetch('/aitm-logo-opt.png');
            if (!response.ok) return null;
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch {
            return null;
        }
    };

    // ── Download PDF (Matching 29-page reference layout with exact signature spacing & logo) ──
    const handleDownloadPDF = async () => {
        if (selectedStudentsList.length === 0) return;

        const { jsPDF } = await getJsPDF();
        const logoData = await getLogoDataUrl();
        const DocClass = typeof jsPDF === 'function' ? jsPDF : (jsPDF?.jsPDF || jsPDF?.default || window?.jspdf?.jsPDF);
        const doc = new DocClass({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // A4 page dimensions: 210mm x 297mm
        const marginX = 14;
        const contentWidth = 182; // 210 - (14 * 2)
        const headerHeight = 19;
        const bannerHeight = 5.2;
        const row1Height = 5.2;
        const row2Height = 5.2;
        const thHeight = 5;
        const rowH = 4.8;
        const numSubjects = timetable.length;
        const tableHeight = thHeight + (numSubjects * rowH);
        
        // Dynamic snug cardBoxHeight: snaps cleanly immediately below the last subject row (no awkward empty gap)
        const cardBoxHeight = headerHeight + bannerHeight + row1Height + row2Height + tableHeight;
        
        const sigSpace = 10; // 10mm of clear white space for physical pen signatures
        const sigLabelHeight = 4; // height of "Signature of Class Advisor" text
        const cutGap = 3.5; // gap before and after cutline
        const ticketSlotHeight = cardBoxHeight + sigSpace + sigLabelHeight + (cutGap * 2);
        
        // Centered top margin so all 3 tickets are balanced on the A4 sheet
        const totalUsedHeight = (ticketSlotHeight * 3) - cutGap;
        const topMargin = Math.max(8, Math.round((297 - totalUsedHeight) / 2));

        sheets.forEach((sheetStudents, sheetIdx) => {
            if (sheetIdx > 0) doc.addPage();

            sheetStudents.forEach((student, cardIdx) => {
                const startY = topMargin + (cardIdx * ticketSlotHeight);

                // 1. Outer Box Border (snug to the exact height of the subjects)
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.35);
                doc.rect(marginX, startY, contentWidth, cardBoxHeight);

                // 2. Header Box (19mm)
                doc.line(marginX, startY + headerHeight, marginX + contentWidth, startY + headerHeight);

                // Logo Column Box (24mm wide)
                const logoWidth = 24;
                doc.line(marginX + logoWidth, startY, marginX + logoWidth, startY + headerHeight);

                // Embed Official AITM Crest Logo Image
                if (logoData) {
                    try {
                        doc.addImage(logoData, 'PNG', marginX + 2.5, startY + 1.2, 19, 16.5, 'AITM_LOGO', 'FAST');
                    } catch (err) {
                        console.warn('Logo image embed failed:', err);
                    }
                }

                // College Name & Details
                const headerCenterX = marginX + logoWidth + (contentWidth - logoWidth) / 2;
                doc.setFont('times', 'bold');
                doc.setFontSize(10.5);
                doc.text('ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT', headerCenterX, startY + 5.2, { align: 'center' });

                doc.setFont('times', 'normal');
                doc.setFontSize(8.2);
                doc.text('Anjumanabad, Bhatkal-582320', headerCenterX, startY + 9.2, { align: 'center' });

                doc.text(departmentName || 'Department of Computer Science & Engineering', headerCenterX, startY + 13.2, { align: 'center' });

                doc.setFont('times', 'bold');
                doc.setFontSize(9.5);
                doc.text('HALL TICKET', headerCenterX, startY + 17.5, { align: 'center' });

                // 3. Examination Banner (5.2mm)
                const bannerY = startY + headerHeight;
                doc.line(marginX, bannerY + bannerHeight, marginX + contentWidth, bannerY + bannerHeight);
                doc.setFont('times', 'bold');
                doc.setFontSize(8.5);
                doc.text(examTitle, marginX + contentWidth / 2, bannerY + 3.8, { align: 'center' });

                // 4. Student Details Row 1: Branch & USN (5.2mm)
                const row1Y = bannerY + bannerHeight;
                doc.line(marginX, row1Y + row1Height, marginX + contentWidth, row1Y + row1Height);

                doc.setFont('times', 'bold');
                doc.setFontSize(8.5);
                doc.text('Branch', marginX + 2, row1Y + 3.8);
                doc.line(marginX + 18, row1Y, marginX + 18, row1Y + row1Height);

                doc.setFont('times', 'normal');
                const branchLabel = canonicalBranchCode(student.branch_code)
                    || canonicalBranchCode(student.usn ? extractBranchFromUsn(student.usn) : null)
                    || canonicalBranchCode(student.branch)
                    || '—';
                doc.text(branchLabel, marginX + 20, row1Y + 3.8);

                const usnSplitX = marginX + 118;
                doc.line(usnSplitX, row1Y, usnSplitX, row1Y + row1Height);
                doc.setFont('times', 'bold');
                doc.text('USN', usnSplitX + 2.5, row1Y + 3.8);
                doc.line(usnSplitX + 15, row1Y, usnSplitX + 15, row1Y + row1Height);

                doc.setFont('courier', 'bold');
                doc.setFontSize(9.2);
                doc.text(student.usn, usnSplitX + 18, row1Y + 3.8);

                // 5. Student Details Row 2: Name & Class / Section (5.2mm)
                const row2Y = row1Y + row1Height;
                doc.line(marginX, row2Y + row2Height, marginX + contentWidth, row2Y + row2Height);

                doc.setFont('times', 'bold');
                doc.setFontSize(8.5);
                doc.text('Name', marginX + 2, row2Y + 3.8);
                doc.line(marginX + 18, row2Y, marginX + 18, row2Y + row2Height);

                doc.setFont('times', 'bold');
                doc.setFontSize(8.8);
                doc.text((student.name || '').toUpperCase(), marginX + 20, row2Y + 3.8);

                // Right side of Row 2: Class / Section (strictly aligned with USN box above)
                doc.line(usnSplitX, row2Y, usnSplitX, row2Y + row2Height);
                doc.setFont('times', 'bold');
                doc.setFontSize(8);
                doc.text('Class/Sec', usnSplitX + 1.5, row2Y + 3.8);
                doc.line(usnSplitX + 16, row2Y, usnSplitX + 16, row2Y + row2Height);

                doc.setFont('times', 'bold');
                doc.setFontSize(8.2);
                const classLabelPdf = student.section
                    ? (student.class_name ? `${student.class_name} (${student.section})` : `Sec ${student.section}`)
                    : (student.class_name || '—');
                doc.text(classLabelPdf, usnSplitX + 18, row2Y + 3.8);

                // 6. Timetable + Photo Grid (Snug Fit without empty gaps)
                const tableY = row2Y + row2Height;
                const photoBoxWidth = 32;
                const tableWidth = contentWidth - photoBoxWidth; // 150mm
                const colDateW = 26;
                const colTimeW = 44;
                const colCodeW = 28;
                const colNameW = tableWidth - (colDateW + colTimeW + colCodeW); // 52mm

                // Vertical Divider between Timetable and Photo box (ends exactly at table bottom)
                doc.line(marginX + tableWidth, tableY, marginX + tableWidth, startY + cardBoxHeight);

                // Timetable Header (5mm)
                doc.line(marginX, tableY + thHeight, marginX + tableWidth, tableY + thHeight);

                doc.setFont('times', 'bold');
                doc.setFontSize(8);
                doc.text('Date', marginX + colDateW / 2, tableY + 3.5, { align: 'center' });
                doc.line(marginX + colDateW, tableY, marginX + colDateW, startY + cardBoxHeight);

                doc.text('Time', marginX + colDateW + colTimeW / 2, tableY + 3.5, { align: 'center' });
                doc.line(marginX + colDateW + colTimeW, tableY, marginX + colDateW + colTimeW, startY + cardBoxHeight);

                doc.text('Subject Code', marginX + colDateW + colTimeW + colCodeW / 2, tableY + 3.5, { align: 'center' });
                doc.line(marginX + colDateW + colTimeW + colCodeW, tableY, marginX + colDateW + colTimeW + colCodeW, startY + cardBoxHeight);

                doc.text('Subject name', marginX + colDateW + colTimeW + colCodeW + colNameW / 2, tableY + 3.5, { align: 'center' });

                // Timetable Rows
                timetable.forEach((exam, rIdx) => {
                    const rowTop = tableY + thHeight + (rIdx * rowH);
                    doc.line(marginX, rowTop + rowH, marginX + tableWidth, rowTop + rowH);

                    doc.setFont('times', 'normal');
                    doc.setFontSize(7.5);
                    doc.text(exam.date, marginX + colDateW / 2, rowTop + 3.4, { align: 'center' });
                    doc.text(exam.time, marginX + colDateW + colTimeW / 2, rowTop + 3.4, { align: 'center' });

                    doc.setFont('courier', 'bold');
                    doc.text(exam.subjectCode, marginX + colDateW + colTimeW + colCodeW / 2, rowTop + 3.4, { align: 'center' });

                    doc.setFont('times', 'bold');
                    doc.text(exam.subjectName, marginX + colDateW + colTimeW + colCodeW + colNameW / 2, rowTop + 3.4, { align: 'center' });
                });

                // Photo Placeholder text inside photo box (vertically centered)
                doc.setFont('times', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('[ Photo ]', marginX + tableWidth + photoBoxWidth / 2, tableY + (tableHeight / 2) + 1.5, { align: 'center' });
                doc.setTextColor(0, 0, 0);

                // 7. Signature Footer with Clean Physical Signature Spacing
                const sigLabelY = startY + cardBoxHeight + sigSpace;
                doc.setFont('times', 'bold');
                doc.setFontSize(8.5);
                doc.text('Signature of Class Advisor', marginX, sigLabelY);
                doc.text('Signature of HoD', marginX + contentWidth, sigLabelY, { align: 'right' });

                // 8. Scissors cutting guide between tickets on the same page
                if (cardIdx < sheetStudents.length - 1) {
                    const cutY = sigLabelY + sigLabelHeight + cutGap;
                    doc.setFont('courier', 'bold');
                    doc.setFontSize(6.8);
                    doc.text('-----------------------------------------X------------------------------------------------X--------------------------------------', marginX + contentWidth / 2, cutY, { align: 'center' });
                }
            });
        });

        const filename = `AITM_Hall_Tickets_${branch}_Sem${semester}.pdf`;
        doc.save(filename);

        try {
            const count = selectedStudentsList.length;
            recordFacultyAction(null, 'HALL_TICKET_GENERATE', selectedStudentsList[0]?.usn || null, {
                module: 'Faculty Portal > Examination Operations > Hall Tickets',
                reason: `VTU SEE Hall Ticket Issuance & PDF Generation for ${branch} Sem ${semester}`,
                details: `Generated official VTU examination hall tickets PDF for ${count} students (${branch} Semester ${semester}). Exam: "${examTitle}". File: ${filename}.`,
                data: {
                    branch,
                    semester,
                    studentCount: count,
                    examTitle,
                    filename,
                    classes: activeClasses.map(c => c.name || c.class_name).filter(Boolean),
                    sampleUsns: selectedStudentsList.map(s => s.usn).slice(0, 15),
                }
            });
        } catch { /* ignored */ }
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1600px', margin: '0 auto' }} className="gf-fade-up">
            {/* Print Mode CSS */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 8mm 12mm;
                    }
                    html, body {
                        background: #FFFFFF !important;
                        color: #000000 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        min-height: 0 !important;
                        overflow: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    /* 1. Hide ALL non-print elements: shell topbar, sidebar, footer, toolbar buttons, controls */
                    header,
                    nav,
                    aside,
                    footer,
                    .gf-shell-topbar,
                    .gf-mobile-header,
                    .gf-sidebar,
                    .no-print,
                    .no-print *,
                    .aitm-header-toolbar,
                    .aitm-header-toolbar *,
                    .gf-page-header,
                    .config-panel,
                    .aitm-preview-controls,
                    .screen-only-page-number,
                    .aitm-screen-preview {
                        display: none !important;
                        visibility: hidden !important;
                        height: 0 !important;
                        min-height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        border: none !important;
                        overflow: hidden !important;
                    }

                    /* 2. Neutralize all outer page wrappers so no padding, margin, grid, or flex constrains print layout */
                    .app-layout,
                    .app-layout-authenticated,
                    .main-content,
                    .main-content-body,
                    #__next,
                    main,
                    .gf-fade-up,
                    .aitm-main-layout-grid,
                    .aitm-preview-panel {
                        display: block !important;
                        position: static !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        min-height: 0 !important;
                        height: auto !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: transparent !important;
                        overflow: visible !important;
                        gap: 0 !important;
                    }

                    /* 3. Reveal print sheets */
                    .aitm-print-all {
                        display: block !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        position: static !important;
                    }

                    /* 4. A4 Sheet Container: Exactly 278mm height (A4 297mm - 16mm margins = 281mm printable) guaranteeing 3 tickets per sheet with zero overflow */
                    .aitm-a4-sheet {
                        box-shadow: none !important;
                        border: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        height: 278mm !important;
                        max-height: 278mm !important;
                        min-height: 0 !important;
                        box-sizing: border-box !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justifyContent: space-between !important;
                        overflow: hidden !important;
                        background: #FFFFFF !important;
                    }

                    .aitm-a4-sheet:last-of-type {
                        page-break-after: auto !important;
                        break-after: auto !important;
                    }

                    /* 5. Slot container: exactly 1/3 of printable sheet, never overflow */
                    .aitm-ticket-slot {
                        flex: 1 1 0 !important;
                        max-height: 89mm !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justifyContent: center !important;
                        overflow: hidden !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    .aitm-hall-ticket-card {
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 auto !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        font-family: 'Times New Roman', Times, serif !important;
                    }

                    /* 6. Compact institutional card styles strictly synchronized with PDF */
                    .aitm-card-outer-box {
                        border: 1.2px solid #000000 !important;
                    }
                    .aitm-card-header-row {
                        grid-template-columns: 88px 1fr !important;
                        border-bottom: 1.2px solid #000000 !important;
                    }
                    .aitm-card-logo-box {
                        padding: 2px !important;
                        border-right: 1.2px solid #000000 !important;
                    }
                    .aitm-card-logo-img {
                        width: 58px !important;
                        height: 58px !important;
                    }
                    .aitm-card-college-name {
                        font-size: 11.5px !important;
                        line-height: 1.2 !important;
                    }
                    .aitm-card-college-address {
                        font-size: 9.5px !important;
                        margin-top: 1px !important;
                    }
                    .aitm-card-dept-name {
                        font-size: 10px !important;
                        margin-top: 1px !important;
                    }
                    .aitm-card-hall-ticket-label {
                        font-size: 11px !important;
                        margin-top: 2px !important;
                    }
                    .aitm-card-banner {
                        padding: 2px 6px !important;
                        font-size: 10px !important;
                        border-bottom: 1.2px solid #000000 !important;
                        background-color: #F3F4F6 !important;
                    }
                    .aitm-card-meta-row {
                        font-size: 10px !important;
                        border-bottom: 1.2px solid #000000 !important;
                    }
                    .aitm-card-meta-row div {
                        padding: 2px 5px !important;
                        border-right-color: #000000 !important;
                    }
                    .aitm-card-name-row {
                        font-size: 10.5px !important;
                        border-bottom: 1.2px solid #000000 !important;
                    }
                    .aitm-card-name-row div {
                        padding: 2px 5px !important;
                        border-right-color: #000000 !important;
                    }
                    .aitm-card-timetable-grid {
                        min-height: 68px !important;
                        grid-template-columns: 1fr 108px !important;
                    }
                    .aitm-card-timetable-grid table th,
                    .aitm-card-timetable-grid table td {
                        padding: 2px 3px !important;
                        font-size: 9.5px !important;
                        border-color: #000000 !important;
                    }
                    .aitm-card-photo-box {
                        border-left: 1.2px solid #000000 !important;
                        padding: 4px !important;
                    }
                    .aitm-card-signatures {
                        padding: 26px 4px 2px 4px !important;
                        font-size: 10px !important;
                    }
                    .aitm-cutting-line {
                        margin: 3px 0 !important;
                        font-size: 9.5px !important;
                        color: #000000 !important;
                    }
                }
            `}</style>

            {/* Header Toolbar */}
            <div className="no-print aitm-header-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Academic Operations & Examination</PageHeaderEyebrow>
                    <PageHeaderTitle>Hall Ticket Generator</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Institutional Hall Ticket generator formatted to the official Anjuman Institute (AITM) 3-per-page A4 print standard.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                        <Button onClick={handleDownloadPDF} variant="ghost" disabled={selectedStudentsList.length === 0}>
                            <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                            Download PDF ({selectedStudentsList.length})
                        </Button>
                        <Button onClick={handlePrint} variant="primary" disabled={selectedStudentsList.length === 0}>
                            <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>print</span>
                            Print Hall Tickets ({totalSheets} Sheets)
                        </Button>
                    </div>
                    {selectedStudentsList.length > 0 && (
                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>
                            {selectedStudentsList.length} ticket{selectedStudentsList.length === 1 ? '' : 's'} · {totalSheets} sheet{totalSheets === 1 ? '' : 's'} at 3 per page
                        </div>
                    )}
                    {readinessIssues.length === 0 ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: 'var(--green, #0d9f57)' }}>
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span>
                            Ready to generate
                        </div>
                    ) : (
                        <div style={{ maxWidth: '340px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: '#b45309', justifyContent: 'flex-end' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>warning</span>
                                {readinessIssues.length} thing{readinessIssues.length === 1 ? '' : 's'} to check before generating
                            </div>
                            <ul style={{ margin: '4px 0 0', padding: 0, listStyle: 'none', fontSize: '10.5px', color: 'var(--tx-muted)' }}>
                                {readinessIssues.slice(0, 4).map((issue, i) => <li key={i}>{issue}</li>)}
                                {readinessIssues.length > 4 && <li>+{readinessIssues.length - 4} more</li>}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* Main 2-Column Content */}
            <div className="aitm-main-layout-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '28px', alignItems: 'flex-start' }}>
                {/* ── LEFT PANEL: Configuration & Settings (Restored to exact spacious original layout) ── */}
                <div className="no-print config-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Scope Selector Card */}
                    <Card>
                        <CardHeader>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>tune</span>
                                    Class & Cohort Scope
                                </CardTitle>
                                {selectedClassIds.length > 0 && (
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: 'var(--primary)',
                                        background: 'rgba(59, 130, 246, 0.1)',
                                        padding: '3px 8px',
                                        borderRadius: '12px'
                                    }}>
                                        {selectedClassIds.length} {selectedClassIds.length === 1 ? 'Class' : 'Classes'} Selected
                                    </span>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Row 1: Department & Semester */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px' }}>
                                <div>
                                    <Select
                                        label="1. Department"
                                        value={branch}
                                        onChange={e => handleBranchChange(e.target.value)}
                                        options={branchOptions}
                                    />
                                </div>
                                <div>
                                    <Select
                                        label="2. Target Semester"
                                        value={semester}
                                        onChange={e => handleSemesterChange(e.target.value)}
                                        options={semesterOptions}
                                    />
                                </div>
                            </div>

                            {/* Row 2: Class Selection (Multi-select) */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexWrap: 'wrap', gap: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        3. Class / Section Scope (Select One or Multiple)
                                    </label>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                        {/* Only useful with 2+ classes to pick from — with just one,
                                            its own "+ Select" chip already does the same thing. */}
                                        {availableClasses.length > 1 && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={selectAllClasses}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--primary)',
                                                        fontWeight: 700,
                                                        fontSize: '11px',
                                                        cursor: 'pointer',
                                                        padding: '2px 4px'
                                                    }}
                                                >
                                                    Select All ({availableClasses.length})
                                                </button>
                                                <span style={{ color: 'var(--border)' }}>•</span>
                                            </>
                                        )}
                                        <button
                                            type="button"
                                            onClick={deselectAllClasses}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                color: selectedClassIds.length === 0 ? 'var(--primary)' : 'var(--tx-muted)',
                                                fontWeight: selectedClassIds.length === 0 ? 800 : 600,
                                                fontSize: '11px',
                                                cursor: 'pointer',
                                                padding: '2px 4px'
                                            }}
                                        >
                                            Entire Semester Cohort
                                        </button>
                                    </div>
                                </div>

                                {availableClasses.length === 0 ? (
                                    <div style={{
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        border: selectedClassIds.length === 0 ? '1.5px solid rgba(59, 130, 246, 0.4)' : '1px solid var(--border)',
                                        background: selectedClassIds.length === 0 ? 'rgba(59, 130, 246, 0.05)' : 'var(--surface-low)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: '10px'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '12px', color: 'var(--tx-main)' }}>
                                                Entire {branch} Semester {ROMAN_SEMESTERS[semester] || semester} Cohort
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>
                                                No specific class sections configured in the registry for {branch} Semester {semester}. Pulling all {filteredStudents.length} students enrolled in this cohort.
                                            </div>
                                        </div>
                                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}>
                                            Active Cohort
                                        </span>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {availableClasses.map(c => {
                                            const isSelected = selectedClassIds.includes(c.id);
                                            return (
                                                <div
                                                    key={c.id}
                                                    onClick={() => toggleClassSelection(c.id)}
                                                    style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        padding: '10px 14px',
                                                        borderRadius: '8px',
                                                        border: `1.5px solid ${isSelected ? 'var(--primary)' : 'var(--border)'}`,
                                                        background: isSelected ? 'rgba(59, 130, 246, 0.06)' : 'var(--surface-low)',
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => {}}
                                                            style={{ cursor: 'pointer', accentColor: 'var(--primary)' }}
                                                        />
                                                        <div>
                                                            <div style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span>{c.name}</span>
                                                                {c.section && (
                                                                    <span style={{
                                                                        fontSize: '10px',
                                                                        fontWeight: 800,
                                                                        color: '#1D4ED8',
                                                                        background: 'rgba(59, 130, 246, 0.15)',
                                                                        padding: '1px 6px',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        Sec {c.section}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                <span>Semester {c.semester}</span>
                                                                <span>•</span>
                                                                <span>{c.student_count ?? 0} students</span>
                                                                {c.scheme && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span>Scheme {c.scheme}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        color: isSelected ? 'var(--primary)' : 'var(--tx-dim)',
                                                        background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'transparent',
                                                        padding: '2px 8px',
                                                        borderRadius: '12px'
                                                    }}>
                                                        {isSelected ? '✓ Selected' : '+ Select'}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Scope Helper Summary — one short line, no filler. */}
                                <div style={{ marginTop: '8px', fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                    {selectedClassIds.length > 0 ? (
                                        <>Roster: <strong>{filteredStudents.length} students</strong> in {selectedClassIds.length} selected {selectedClassIds.length === 1 ? 'class' : 'classes'}.</>
                                    ) : (
                                        <>
                                            Roster: <strong>{filteredStudents.length} students</strong> in {branch} Semester {ROMAN_SEMESTERS[semester] || semester}.
                                        </>
                                    )}
                                </div>

                                {/* One-click fix instead of an explanation to read: a class's own
                                    semester (its student-count badge above) can differ from Target
                                    Semester, so the roster count differs too. Match one to the other
                                    right here instead of making the user go work it out. */}
                                {semesterMismatchClasses.length > 0 && (
                                    <div style={{
                                        marginTop: '8px', padding: '12px 14px', borderRadius: '8px',
                                        background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.25)',
                                        fontSize: '11.5px', color: 'var(--tx-main)'
                                    }}>
                                        <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <div>
                                                <strong>{semesterMismatchClasses[0].name}</strong> is registered under Semester {semesterMismatchClasses[0].semester} ({semesterMismatchClasses[0].student_count ?? 0} students) — while you are generating for <strong>Semester {semester}</strong>.
                                                {selectedClassIds.length === 0 ? (
                                                    <span> Only {filteredStudents.length} batch students who progressed to Semester {semester} are currently pulled.</span>
                                                ) : (
                                                    <span> All {filteredStudents.length} students from this class are selected for this Semester {semester} hall ticket generation.</span>
                                                )}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setDismissedMismatch(true)}
                                                title="Dismiss notice"
                                                style={{ background: 'transparent', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', padding: '0 2px' }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>close</span>
                                            </button>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const targetSem = Number(semesterMismatchClasses[0].semester);
                                                    handleSemesterChange(targetSem);
                                                    if (!selectedClassIds.includes(semesterMismatchClasses[0].id)) {
                                                        setSelectedClassIds([semesterMismatchClasses[0].id]);
                                                    }
                                                    setDismissedMismatch(true);
                                                }}
                                                style={{ background: '#d97706', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                Use Semester {semesterMismatchClasses[0].semester} instead
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (!selectedClassIds.includes(semesterMismatchClasses[0].id)) {
                                                        setSelectedClassIds([semesterMismatchClasses[0].id]);
                                                    }
                                                    setDismissedMismatch(true);
                                                }}
                                                style={{ background: 'var(--surface)', color: 'var(--tx-main)', border: '1px solid var(--border)', borderRadius: '6px', padding: '6px 12px', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                Keep Semester {semester} &amp; use full roster ({semesterMismatchClasses[0].student_count ?? 0})
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Examination Information Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '20px', color: '#6366F1' }}>event_note</span>
                                Examination Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <Select
                                        label="Exam Type"
                                        value={examType}
                                        onChange={e => setExamType(e.target.value)}
                                        options={[
                                            { value: 'IA-1', label: 'IA-1 (Internal Assessment 1)' },
                                            { value: 'IA-2', label: 'IA-2 (Internal Assessment 2)' },
                                            { value: 'IA-3', label: 'IA-3 (Internal Assessment 3)' },
                                            { value: 'Semester End', label: 'Semester End Examination' },
                                            { value: 'Lab Exam', label: 'Practical / Lab Examination' }
                                        ]}
                                    />
                                </div>
                                <div>
                                    <Input
                                        label="Month & Year"
                                        value={examMonthYear}
                                        onChange={e => setExamMonthYear(e.target.value)}
                                        placeholder="e.g. MARCH 2026"
                                    />
                                </div>
                            </div>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                        {examTitleManual ? 'Examination Title Header (edited manually)' : 'Examination Title Header (auto-generated)'}
                                    </label>
                                    {examTitleManual && (
                                        <button
                                            type="button"
                                            onClick={resetExamTitleToAuto}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 700, fontSize: '11px', cursor: 'pointer', padding: 0 }}
                                        >
                                            ↺ Reset to auto
                                        </button>
                                    )}
                                </div>
                                <Input
                                    value={examTitle}
                                    onChange={e => { setExamTitle(e.target.value); setExamTitleManual(true); }}
                                    placeholder="e.g. VI Semester IA-1 MARCH 2026 Examination"
                                />
                                {!examTitleManual && (
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                        Built from Exam Type + Month &amp; Year above. Edit it directly if you need something different — it'll stop auto-updating until you reset it.
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Timetable Editor Card */}
                    <Card>
                        <CardContent style={{ padding: '16px 20px' }}>
                            <TimetableEditor
                                timetable={timetable}
                                onChange={setTimetable}
                                onAutoFill={() => autoFillSyllabus(branch, semester)}
                                loading={timetableLoading}
                                catalogSubjects={catalogSubjects}
                            />
                        </CardContent>
                    </Card>

                    {/* Students Selection Card */}
                    <Card>
                        <CardHeader>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: '#10B981' }}>checklist</span>
                                    Student Roster ({selectedStudentsList.length} of {filteredStudents.length} Selected)
                                    {rosterRefreshing && (
                                        <span
                                            title="Refreshing from the database"
                                            style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 600, color: 'var(--tx-muted)' }}
                                        >
                                            • updating
                                        </span>
                                    )}
                                </CardTitle>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {studentSearch.trim() && visibleStudentsInChecklist.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedUsns(new Set(visibleStudentsInChecklist.map(s => s.usn)))}
                                            style={{
                                                background: 'rgba(59, 130, 246, 0.12)',
                                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                                color: 'var(--primary)',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                fontWeight: 700,
                                                fontSize: '11px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Select Only Filtered ({visibleStudentsInChecklist.length})
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleToggleAll}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--primary)',
                                            fontWeight: 800,
                                            fontSize: '12px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {selectedUsns.size === filteredStudents.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                                <div style={{ flex: 1 }}>
                                    <Input
                                        placeholder={selectedClassIds.length > 0 ? 'Search by USN or Name within selected classes...' : 'Search by USN or Name...'}
                                        value={studentSearch}
                                        onChange={e => setStudentSearch(e.target.value)}
                                    />
                                </div>
                                <Button
                                    variant="ghost"
                                    disabled={!studentSearch || visibleStudentsInChecklist.length === 0}
                                    onClick={() => setSelectedUsns(new Set(visibleStudentsInChecklist.map(s => s.usn)))}
                                    title={studentSearch ? 'Select only the students matching this search' : 'Type in the search box above to enable this'}
                                >
                                    Select only search results ({visibleStudentsInChecklist.length})
                                </Button>
                            </div>
                            {studentSearch && selectedClassIds.length > 0 && (
                                <div style={{ marginTop: '-4px', marginBottom: '10px', fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                    Searching within {selectedClassIds.length} selected class(es) only.
                                </div>
                            )}
                            {rosterCommonContext && (
                                <div style={{ marginBottom: '8px', fontSize: '11px', fontWeight: 700, color: 'var(--tx-muted)' }}>
                                    Showing: {rosterCommonContext.branchCode || branch}{rosterCommonContext.section ? ` · Sec ${rosterCommonContext.section}` : ''} · {visibleStudentsInChecklist.length} students
                                </div>
                            )}

                            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-low)', borderRadius: '8px' }}>
                                {visibleStudentsInChecklist.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '12px' }}>
                                        {loading
                                            ? 'Loading student roster...'
                                            : selectedClassIds.length > 0
                                                ? 'No students in the selected class(es) match your search.'
                                                : 'No students found in this branch/semester.'}
                                    </div>
                                ) : (
                                    visibleStudentsInChecklist.map((s) => {
                                        const isSelected = selectedUsns.has(s.usn);
                                        return (
                                            <div
                                                key={s.usn}
                                                onClick={() => handleToggleStudent(s.usn)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '8px 12px',
                                                    borderBottom: '1px solid var(--border-low)',
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                                                    transition: 'background 0.15s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => {}}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <div>
                                                        <div style={{ fontWeight: 800, fontSize: '12px', color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span>{s.name}</span>
                                                            {!rosterCommonContext && s.section && (
                                                                <span style={{
                                                                    fontSize: '9.5px',
                                                                    fontWeight: 800,
                                                                    color: 'var(--primary)',
                                                                    background: 'rgba(59, 130, 246, 0.12)',
                                                                    padding: '1px 5px',
                                                                    borderRadius: '6px'
                                                                }}>
                                                                    Sec {s.section}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-muted)' }}>
                                                            {s.usn} {s.class_name ? `· ${s.class_name}` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                {!rosterCommonContext && (
                                                    <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                                        {s.branch_code || s.branch}
                                                    </span>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ── RIGHT PANEL: Live Interactive Preview (A4 Sheet 3-per-page) ── */}
                <div className="aitm-preview-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Preview Controls Header */}
                    <div className="no-print aitm-preview-controls" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '12px 18px',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>visibility</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                A4 Print Preview ({sheets.length} Sheets • 3 Tickets/Page)
                            </span>
                        </div>

                        {/* Jump straight to one student's ticket instead of paging through
                            every sheet to spot-check it. */}
                        {selectedStudentsList.length > 3 && (
                            <div style={{ position: 'relative', minWidth: '200px' }}>
                                <Input
                                    hideLabel
                                    label="Jump to student"
                                    placeholder="Jump to USN or name…"
                                    value={previewJumpQuery}
                                    onChange={e => setPreviewJumpQuery(e.target.value)}
                                    density="compact"
                                />
                                {previewJumpQuery.trim() && (
                                    <div style={{
                                        position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 10, maxHeight: '220px', overflowY: 'auto'
                                    }}>
                                        {previewJumpMatches.length === 0 ? (
                                            <div style={{ padding: '10px 12px', fontSize: '11.5px', color: 'var(--tx-dim)' }}>No match among selected students.</div>
                                        ) : previewJumpMatches.map(s => (
                                            <button
                                                key={s.usn}
                                                type="button"
                                                onClick={() => { jumpToSheet(s.sheetIndex); setPreviewJumpQuery(''); }}
                                                style={{
                                                    display: 'flex', justifyContent: 'space-between', width: '100%',
                                                    padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border-low)',
                                                    cursor: 'pointer', textAlign: 'left', fontSize: '11.5px'
                                                }}
                                            >
                                                <span style={{ fontWeight: 700, color: 'var(--tx-main)' }}>{s.name} <span style={{ fontWeight: 500, color: 'var(--tx-muted)', fontFamily: 'monospace' }}>({s.usn})</span></span>
                                                <span style={{ color: 'var(--primary)', fontWeight: 700 }}>Sheet {s.sheetIndex}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {/* Mode Toggle */}
                            <div style={{ display: 'flex', background: 'var(--surface-low)', borderRadius: '6px', padding: '2px' }}>
                                <button
                                    onClick={() => setPreviewMode('paged')}
                                    style={{
                                        background: previewMode === 'paged' ? 'var(--surface)' : 'transparent',
                                        border: 'none',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: previewMode === 'paged' ? 'var(--tx-main)' : 'var(--tx-dim)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Paged
                                </button>
                                <button
                                    onClick={() => setPreviewMode('continuous')}
                                    style={{
                                        background: previewMode === 'continuous' ? 'var(--surface)' : 'transparent',
                                        border: 'none',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: previewMode === 'continuous' ? 'var(--tx-main)' : 'var(--tx-dim)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    All Sheets
                                </button>
                            </div>

                            {/* Paged Navigation */}
                            {previewMode === 'paged' && sheets.length > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        onClick={() => setActivePage(p => Math.max(1, p - 1))}
                                        disabled={activePage <= 1}
                                        style={{
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            cursor: activePage <= 1 ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>chevron_left</span>
                                    </button>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                        {activePage} / {sheets.length}
                                    </span>
                                    <button
                                        onClick={() => setActivePage(p => Math.min(sheets.length, p + 1))}
                                        disabled={activePage >= sheets.length}
                                        style={{
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            cursor: activePage >= sheets.length ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>chevron_right</span>
                                    </button>
                                </div>
                            )}

                            {/* Continuous Mode Quick Jump Selector */}
                            {previewMode === 'continuous' && sheets.length > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 700 }}>Jump:</span>
                                    <select
                                        onChange={(e) => {
                                            const el = document.getElementById(`sheet-target-${e.target.value}`);
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }}
                                        defaultValue="1"
                                        style={{
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '6px',
                                            padding: '3px 8px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            color: 'var(--tx-main)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {sheets.map((_, idx) => (
                                            <option key={idx} value={idx + 1}>
                                                Sheet {idx + 1} of {sheets.length}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/*
                      Print-only: every sheet, always in the DOM.
                      window.print() can only output what is rendered, and the
                      preview below renders a single sheet in Paged mode - which
                      is why printing produced one page while the PDF (built from
                      data, not the DOM) came out complete. Hidden on screen,
                      revealed by the @media print rules above.
                    */}
                    <div className="aitm-print-all" style={{ display: 'none' }} aria-hidden="true">
                        {sheets.map((sheetStudents, sheetIdx) => (
                            <HallTicketSheet
                                key={`print-${sheetIdx}`}
                                students={sheetStudents}
                                examMeta={{
                                    title: examTitle,
                                    department: departmentName,
                                    collegeName: 'ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT',
                                    collegeAddress: 'Anjumanabad, Bhatkal-582320'
                                }}
                                timetable={timetable}
                                pageNumber={sheetIdx + 1}
                                totalPages={sheets.length}
                            />
                        ))}
                    </div>

                    {/* Sheets Container: when in All Sheets mode, scroll internally so the page doesn't stretch and left panel stays unaffected */}
                    <div
                        className="aitm-sheets-scroll-container aitm-screen-preview"
                        style={{
                            width: '100%',
                            maxHeight: previewMode === 'continuous' ? '82vh' : 'none',
                            overflowY: previewMode === 'continuous' ? 'auto' : 'visible',
                            padding: previewMode === 'continuous' ? '8px 8px 24px 8px' : '0',
                            background: previewMode === 'continuous' ? 'rgba(0, 0, 0, 0.02)' : 'transparent',
                            borderRadius: previewMode === 'continuous' ? '12px' : '0',
                            border: previewMode === 'continuous' ? '1px solid var(--border)' : 'none',
                            boxSizing: 'border-box'
                        }}
                    >
                        {selectedStudentsList.length === 0 ? (
                            <div style={{
                                background: 'var(--surface)',
                                border: '1px dashed var(--border)',
                                borderRadius: '16px',
                                padding: '60px 20px',
                                textAlign: 'center',
                                color: 'var(--tx-dim)'
                            }}>
                                <span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--tx-dim)', marginBottom: '8px' }}>
                                    badge
                                </span>
                                <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)', marginBottom: '4px' }}>
                                    No Students Selected
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>
                                    Select students from the left panel to generate Anjuman Hall Tickets.
                                </div>
                            </div>
                        ) : previewMode === 'paged' ? (
                            <HallTicketSheet
                                key={activePage}
                                students={sheets[activePage - 1] || []}
                                examMeta={{
                                    title: examTitle,
                                    department: departmentName,
                                    collegeName: 'ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT',
                                    collegeAddress: 'Anjumanabad, Bhatkal-582320'
                                }}
                                timetable={timetable}
                                pageNumber={activePage}
                                totalPages={sheets.length}
                            />
                        ) : (
                            sheets.map((sheetStudents, sheetIdx) => (
                                <div key={sheetIdx} id={`sheet-target-${sheetIdx + 1}`}>
                                    <HallTicketSheet
                                        students={sheetStudents}
                                        examMeta={{
                                            title: examTitle,
                                            department: departmentName,
                                            collegeName: 'ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT',
                                            collegeAddress: 'Anjumanabad, Bhatkal-582320'
                                        }}
                                        timetable={timetable}
                                        pageNumber={sheetIdx + 1}
                                        totalPages={sheets.length}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
