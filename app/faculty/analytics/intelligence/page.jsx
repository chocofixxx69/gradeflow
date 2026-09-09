'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
import { ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart, LineChart, ReferenceLine } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest, clearApiCache } from '@/lib/api/client';
import { getCleanBranchOptions } from '@/lib/semester-utils';
import { filterAndRankStudents, filterAndRank, matchesGeneric } from '@/lib/search-utils';

export default function InstitutionalIntelligencePage() {
    return (
        <AuthGuard role="faculty">
            <Suspense fallback={
                <div style={{ padding: '40px 24px', maxWidth: '1400px', margin: '0 auto', textAlign: 'center', color: 'var(--tx-muted)' }}>
                    Loading Institutional Intelligence...
                </div>
            }>
                <InstitutionalIntelligenceContent />
            </Suspense>
        </AuthGuard>
    );
}

// Professional Institutional Categorical Palette
// High contrast, colorblind-friendly, non-neon executive tones curated for academic data visualization.
// Benchmark reference lines use neutral slate guides to prevent color collision.
const PROFESSIONAL_PALETTE = [
    '#1D4ED8', // 1. Deep Royal Navy
    '#D97706', // 2. Warm Amber / Ochre
    '#0F766E', // 3. Deep Sea Teal
    '#7E22CE', // 4. Imperial Violet
    '#B91C1C', // 5. Crimson Burgundy
    '#0284C7', // 6. Steel Cerulean
    '#C2410C', // 7. Burnt Terracotta
    '#475569', // 8. Nordic Slate
    '#15803D', // 9. Forest Emerald
    '#A21CAF', // 10. Muted Plum
    '#4338CA', // 11. Midnight Indigo
    '#A16207', // 12. Antique Bronze
    '#0E7490', // 13. Deep Cyan Petrol
    '#6B21A8', // 14. Royal Iris
    '#4D7C0F', // 15. Olive Sage
    '#334155', // 16. Charcoal Steel
];

function getStudentColor(index) {
    if (index < PROFESSIONAL_PALETTE.length) {
        return PROFESSIONAL_PALETTE[index];
    }
    const hue = Math.round((index * 137.508) % 360);
    return `hsl(${hue}, 58%, 42%)`;
}


function InstitutionalIntelligenceContent() {
    const searchParams = useSearchParams();
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    // Tab Switcher: 'department' | 'sections' | 'compare'
    const [viewTab, setViewTab] = useState(() => {
        const param = searchParams?.get('tab');
        if (param === 'sections' || param === 'classes') return 'sections';
        if (param === 'compare') return 'compare';
        return 'sections'; // Default to Class & Section Comparison as primary view
    });

    // Sub-mode inside Comparison tab: 'classes' | 'sections'
    const [compareMode, setCompareMode] = useState(() => {
        const modeParam = searchParams?.get('mode');
        if (modeParam === 'sections') return 'sections';
        return 'classes'; // Default to Class Comparison
    });

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [], semesters: [1, 2, 3, 4, 5, 6, 7, 8] });

    // Shared Filters
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'ALL');
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [semester, setSemester] = useState(() => Number(initialSaved.semester) || 6);

    // Filter overrides for Class Comparison
    const [classBranch, setClassBranch] = useState('ALL');
    const [classBatch, setClassBatch] = useState('2023');
    const [classSemester, setClassSemester] = useState('6');
    const [classSearch, setClassSearch] = useState('');
    const [expandedClassId, setExpandedClassId] = useState(null);

    // Tab 1: Department Overview Data
    const initialDeptData = getCachedApiData('/api/faculty/analytics/department', {
        branch: initialSaved.branch || 'CS',
        batch: initialSaved.batch || '2023'
    });
    const [deptReport, setDeptReport] = useState(() => initialDeptData || {
        department: 'CS',
        batch: 'All Batches',
        summary: { totalStudents: 0, overallPassRate: 0, avgCGPA: 0, totalBacklogs: 0 },
        semesters: []
    });
    const [deptLoading, setDeptLoading] = useState(() => !initialDeptData);

    // Tab 2A: Class Comparison Data
    const [classReport, setClassReport] = useState({
        classes: [],
        benchmarks: { bestClass: null, totalClasses: 0, totalEnrolled: 0, totalAppeared: 0, overallPassRate: 0, benchmarkAvgSGPA: 0, passRateSpread: 0, sgpaSpread: 0 },
        filters: {}
    });
    const [classLoading, setClassLoading] = useState(false);

    // Tab 2B: Sections Comparison Data
    const [sectionReport, setSectionReport] = useState({
        sections: [],
        sectionComparisons: [],
        subjectMatrix: [],
        benchmarks: { bestSection: '—', bestSectionLabel: '—', totalEvaluated: 0, benchmarkAvg: 0, sectionSpread: 0 }
    });
    const [sectionLoading, setSectionLoading] = useState(false);

    // Tab 3: Student Comparator Data
    const [usnInput, setUsnInput] = useState('');
    const [usnList, setUsnList] = useState([]);
    const [comparatorLoading, setComparatorLoading] = useState(false);
    const [comparatorData, setComparatorData] = useState({
        students: [],
        trajectory: [],
        subjectComparison: []
    });
    const [studentSearchResults, setStudentSearchResults] = useState([]);
    const [isSearchingStudents, setIsSearchingStudents] = useState(false);
    const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
    const [subjectSearch, setSubjectSearch] = useState('');
    const [subjectFilterMode, setSubjectFilterMode] = useState('all'); // 'all' | 'delta' | 'fails'
    const [classPickerOpen, setClassPickerOpen] = useState(false);
    const [selectedPickerClassId, setSelectedPickerClassId] = useState('');
    const [classRosterStudents, setClassRosterStudents] = useState([]);
    const [rosterSearch, setRosterSearch] = useState('');
    const [isLoadingRoster, setIsLoadingRoster] = useState(false);
    const [trajectoryScale, setTrajectoryScale] = useState('focus'); // 'focus' | 'full'
    const searchContainerRef = useRef(null);

    // Dynamic scale for academic trajectory chart to prevent squashing and collision
    const { trajectoryDomain, trajectoryTicks } = useMemo(() => {
        if (trajectoryScale === 'full') {
            return { trajectoryDomain: [0, 10], trajectoryTicks: [0, 2, 4, 6, 8, 10] };
        }

        const values = [];
        (comparatorData?.trajectory || []).forEach(row => {
            (usnList || []).forEach(u => {
                const val = Number(row[u]);
                if (!isNaN(val) && val > 0) values.push(val);
            });
        });

        if (values.length === 0) {
            return { trajectoryDomain: [0, 10], trajectoryTicks: [0, 2, 4, 6, 8, 10] };
        }

        const minVal = Math.min(...values);
        const floorBound = Math.min(minVal, 6.75);
        const yMin = Math.max(0, Math.floor(floorBound - 0.75));
        const yMax = 10;

        const ticks = [];
        const step = (yMax - yMin) <= 5 ? 1 : 2;
        for (let t = yMin; t <= yMax; t += step) {
            ticks.push(t);
        }
        if (!ticks.includes(10)) ticks.push(10);

        return { trajectoryDomain: [yMin, yMax], trajectoryTicks: ticks };
    }, [comparatorData?.trajectory, usnList, trajectoryScale]);

    // Synchronize filters
    useEffect(() => {
        saveFilters({ branch, batch, semester });
    }, [branch, batch, semester]);

    // 1. Fetch metadata on mount
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta', { cacheTtl: 60_000 });
                if (res) setMeta(res);
            } catch (err) {
                console.error('Failed to load meta:', err);
            }
        }
        loadMeta();
    }, []);

    // 2. Fetch Department Overview Data
    const loadDepartmentData = useCallback(async () => {
        const deptBranch = branch === 'ALL' ? 'CS' : branch;
        setDeptLoading(true);
        try {
            const query = { branch: deptBranch };
            if (batch && batch !== 'ALL') query.batch = batch;
            const res = await apiRequest('/api/faculty/analytics/department', { query, cacheTtl: 30_000 });
            if (res) setDeptReport(res);
        } catch (err) {
            console.error('Failed to load department report:', err);
        } finally {
            setDeptLoading(false);
        }
    }, [branch, batch]);

    // 3. Fetch Class Comparison Data
    const loadClassesData = useCallback(async () => {
        setClassLoading(true);
        try {
            const query = {
                branch: classBranch,
                batch: classBatch,
                semester: classSemester
            };
            const res = await apiRequest('/api/faculty/analytics/classes-compare', { query, cacheTtl: 30_000 });
            if (res) setClassReport(res);
        } catch (err) {
            console.error('Failed to load classes comparison:', err);
        } finally {
            setClassLoading(false);
        }
    }, [classBranch, classBatch, classSemester]);

    // 4. Fetch Sections Comparison Data
    const loadSectionsData = useCallback(async () => {
        const targetBranch = branch === 'ALL' ? 'AI' : branch;
        setSectionLoading(true);
        try {
            const query = { branch: targetBranch, batch, semester, sectionMode: 'auto' };
            const res = await apiRequest('/api/faculty/analytics/sections-compare', { query, cacheTtl: 30_000 });
            if (res) setSectionReport(res);
        } catch (err) {
            console.error('Failed to load sections comparison:', err);
        } finally {
            setSectionLoading(false);
        }
    }, [branch, batch, semester]);

    // 5. Fetch Student Comparator Data
    const loadComparatorData = useCallback(async () => {
        if (!usnList.length) {
            setComparatorData({ students: [], trajectory: [], subjectComparison: [] });
            return;
        }
        setComparatorLoading(true);
        try {
            const res = await apiRequest('/api/faculty/analytics/compare', {
                query: { usns: usnList.join(',') },
                cacheTtl: 30_000
            });
            if (res) setComparatorData(res);
        } catch (err) {
            console.error('Failed to load comparator:', err);
        } finally {
            setComparatorLoading(false);
        }
    }, [usnList]);

    useEffect(() => {
        if (viewTab === 'department') {
            loadDepartmentData();
        } else if (viewTab === 'sections') {
            if (compareMode === 'classes') {
                loadClassesData();
            } else {
                loadSectionsData();
            }
        } else {
            loadComparatorData();
        }
    }, [viewTab, compareMode, loadDepartmentData, loadClassesData, loadSectionsData, loadComparatorData]);

    // Derived active semesters for current branch & batch
    const activeEvaluatedSemesters = useMemo(() => {
        const list = (deptReport?.semesters || []).map(s => s.semester);
        if (list.length > 0) return list;
        return [1, 2, 3, 4, 5, 6];
    }, [deptReport]);

    // Filtered classes for search
    const filteredClassesList = useMemo(() => {
        const list = classReport?.classes || [];
        if (!classSearch.trim()) return list;
        return filterAndRank(list, classSearch, ['name', 'branch', 'facultyName', 'section', 'academicYear', 'scheme']);
    }, [classReport, classSearch]);

    // USN list management for comparator
    const handleAddUsn = (usnToAdd) => {
        let clean = (usnToAdd || usnInput).trim();
        if (!clean) return;

        // If user typed a search query that matches dropdown results and isn't a 10-char USN, use the first match
        if (!usnToAdd && studentSearchResults.length > 0 && clean.length >= 2 && !/^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/i.test(clean)) {
            clean = studentSearchResults[0].usn;
        }

        clean = clean.toUpperCase();
        if (usnList.includes(clean)) {
            setUsnInput('');
            setSearchDropdownOpen(false);
            return;
        }
        setUsnList(prev => [...prev, clean]);
        setUsnInput('');
        setSearchDropdownOpen(false);
    };

    const handleSelectStudent = (stu) => {
        if (!stu || !stu.usn) return;
        handleAddUsn(stu.usn);
    };

    const handleRemoveUsn = (u) => setUsnList(prev => prev.filter(x => x !== u));

    // Click outside search dropdown listener
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
                setSearchDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Load roster when class is picked in Class Picker
    const loadClassRoster = useCallback(async (cId) => {
        if (!cId) return;
        setIsLoadingRoster(true);
        try {
            const res = await apiRequest('/api/faculty/students', {
                query: { classId: cId, limit: 100, fresh: '1' }
            });
            if (res?.students) {
                setClassRosterStudents(res.students);
            }
        } catch (err) {
            console.error('Failed to load class roster:', err);
        } finally {
            setIsLoadingRoster(false);
        }
    }, []);

    useEffect(() => {
        if (classPickerOpen) {
            const defaultClassId = selectedPickerClassId || classReport?.classes?.[0]?.id || '';
            if (defaultClassId && defaultClassId !== selectedPickerClassId) {
                setSelectedPickerClassId(defaultClassId);
            }
            if (defaultClassId) {
                loadClassRoster(defaultClassId);
            }
        }
    }, [classPickerOpen, selectedPickerClassId, classReport?.classes, loadClassRoster]);

    // Debounced live student search by name or USN
    useEffect(() => {
        const q = usnInput.trim();
        if (!q || q.length < 2) {
            setStudentSearchResults([]);
            setSearchDropdownOpen(false);
            return;
        }
        let active = true;
        const timer = setTimeout(async () => {
            setIsSearchingStudents(true);
            try {
                const res = await apiRequest('/api/faculty/students', {
                    query: { search: q, limit: 6 }
                });
                if (active && res?.students) {
                    setStudentSearchResults(res.students);
                    setSearchDropdownOpen(true);
                }
            } catch (err) {
                console.error('Failed to search students for comparator:', err);
            } finally {
                if (active) setIsSearchingStudents(false);
            }
        }, 250);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [usnInput]);

    // Quick cohort presets (Top 3 Rankers vs Remedial At-Risk)
    const handleLoadPreset = async (type) => {
        setComparatorLoading(true);
        try {
            const query = {
                branch: branch === 'ALL' ? '' : branch,
                batch: batch === 'ALL' ? '' : batch,
                page: 1,
                limit: 50
            };
            if (type === 'top3') {
                query.backlogsFilter = 'clear';
            } else if (type === 'remedial') {
                query.backlogsFilter = 'backlogs';
            }
            const res = await apiRequest('/api/faculty/students', { query });
            if (res?.students?.length > 0) {
                let candidates = [...res.students];
                if (type === 'top3') {
                    // Sort descending by CGPA to get real top rankers
                    candidates.sort((a, b) => (b.cgpa || 0) - (a.cgpa || 0));
                } else if (type === 'remedial') {
                    // Sort by highest backlogs first, then lowest CGPA
                    candidates.sort((a, b) => (b.total_backlogs || 0) - (a.total_backlogs || 0) || (a.cgpa || 0) - (b.cgpa || 0));
                }
                const top3 = candidates.slice(0, 3).map(s => s.usn);
                setUsnList(top3);
            }
        } catch (err) {
            console.error('Failed to load preset students:', err);
        } finally {
            setComparatorLoading(false);
        }
    };

    // Quick map of student metadata
    const studentMap = useMemo(() => {
        const map = new Map();
        (comparatorData?.students || []).forEach(s => {
            map.set(s.usn, s);
        });
        return map;
    }, [comparatorData?.students]);

    // Student performance details (trajectory trend, best sem, deltas)
    const studentStats = useMemo(() => {
        const stats = {};
        const trajectory = comparatorData?.trajectory || [];
        usnList.forEach(usn => {
            const stu = studentMap.get(usn) || {};
            const points = trajectory.filter(p => typeof p[usn] === 'number' && p[usn] > 0);
            let trend = 'steady';
            let delta = 0;
            let bestSem = '—';
            let bestSGPA = 0;
            if (points.length >= 2) {
                const last = points[points.length - 1][usn];
                const prev = points[points.length - 2][usn];
                delta = Number((last - prev).toFixed(2));
                if (delta > 0.05) trend = 'rising';
                else if (delta < -0.05) trend = 'declining';
            }
            points.forEach(p => {
                if (p[usn] > bestSGPA) {
                    bestSGPA = p[usn];
                    bestSem = typeof p.semester === 'string' ? p.semester : `Sem ${p.semester}`;
                }
            });

            stats[usn] = {
                ...stu,
                trend,
                delta,
                bestSem,
                bestSGPA: Number(bestSGPA.toFixed(2)),
                evalCount: points.length
            };
        });
        return stats;
    }, [usnList, comparatorData?.trajectory, studentMap]);

    // Executive comparative synthesis / AI insights
    const comparativeInsights = useMemo(() => {
        const students = comparatorData?.students || [];
        if (students.length === 0) return null;

        const validStudents = students.filter(s => typeof s.cgpa === 'number' && s.cgpa > 0);
        if (validStudents.length === 0) return null;

        const sortedByCGPA = [...validStudents].sort((a, b) => (b.cgpa || 0) - (a.cgpa || 0));
        const leader = sortedByCGPA[0];

        // Trajectory Improver
        let bestImprover = null;
        let maxJump = -999;
        const trajectory = comparatorData?.trajectory || [];
        usnList.forEach(usn => {
            const points = trajectory.filter(p => typeof p[usn] === 'number' && p[usn] > 0);
            if (points.length >= 2) {
                const jump = points[points.length - 1][usn] - points[0][usn];
                if (jump > maxJump) {
                    maxJump = jump;
                    bestImprover = { student: studentMap.get(usn), jump: Number(jump.toFixed(2)) };
                }
            }
        });

        // Hardest subject
        const subjects = comparatorData?.subjectComparison || [];
        let lowestAvgSub = null;
        let lowestAvg = 999;
        subjects.forEach(sub => {
            const marks = Object.values(sub.students || {}).filter(m => m && typeof m.total === 'number');
            if (marks.length >= 2) {
                const avg = marks.reduce((sum, m) => sum + m.total, 0) / marks.length;
                if (avg < lowestAvg) {
                    lowestAvg = avg;
                    lowestAvgSub = { ...sub, avg: Number(avg.toFixed(1)) };
                }
            }
        });

        const studentsWithBacklogs = students.filter(s => (s.failed || 0) > 0);

        return {
            leader,
            improver: maxJump > 0 ? bestImprover : null,
            bottleneckSubject: lowestAvgSub,
            backlogCount: studentsWithBacklogs.length,
            backlogStudents: studentsWithBacklogs
        };
    }, [comparatorData, usnList, studentMap]);

    // Filtered subjects for table
    const filteredSubjectComparison = useMemo(() => {
        let list = comparatorData?.subjectComparison || [];
        if (subjectFilterMode === 'delta') {
            list = list.filter(sub => {
                const totals = Object.values(sub.students || {})
                    .filter(m => m && typeof m.total === 'number')
                    .map(m => m.total);
                if (totals.length < 2) return false;
                const gap = Math.max(...totals) - Math.min(...totals);
                return gap >= 15;
            });
        } else if (subjectFilterMode === 'fails') {
            list = list.filter(sub => Object.values(sub.students || {}).some(m => m && m.isFail));
        }

        if (subjectSearch.trim()) {
            list = filterAndRank(list, subjectSearch, ['code', 'name']);
        }
        return list;
    }, [comparatorData?.subjectComparison, subjectSearch, subjectFilterMode]);

    // ── Manual Refresh ──
    const [isRefreshing, setIsRefreshing] = useState(false);
    const handleRefresh = async () => {
        setIsRefreshing(true);
        clearApiCache();
        try {
            if (viewTab === 'department') {
                await loadDepartmentData();
            } else if (viewTab === 'sections') {
                if (compareMode === 'classes') {
                    await loadClassesData();
                } else {
                    await loadSectionsData();
                }
            } else {
                await loadComparatorData();
            }
        } finally {
            setIsRefreshing(false);
        }
    };

    // ── Excel Export ──
    const handleExportExcel = async () => {
        try {
            const XLSX = await getXLSX();
            const wb = XLSX.utils.book_new();

            if (viewTab === 'department') {
                const sList = deptReport?.semesters || [];
                if (sList.length === 0) {
                    alert('No department trends data available to export.');
                    return;
                }
                const headers = ['Semester', 'Total Appeared', 'Passed', 'Failed', 'Pass Rate %', 'Average CGPA'];
                const rows = sList.map(s => [
                    `Sem ${s.semester}`,
                    s.appeared ?? 0,
                    s.passed ?? 0,
                    s.failed ?? 0,
                    typeof s.passRate === 'number' ? `${s.passRate.toFixed(1)}%` : (s.passRate ?? '—'),
                    typeof s.avgCGPA === 'number' ? s.avgCGPA.toFixed(2) : (s.avgCGPA ?? '—')
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, 'Department Trends');
                XLSX.writeFile(wb, `Department_Overview_${branch}.xlsx`);
            } else if (viewTab === 'sections') {
                if (compareMode === 'classes') {
                    const cList = classReport?.classes || [];
                    if (cList.length === 0) {
                        alert('No class comparison data available to export.');
                        return;
                    }
                    const headers = ['Class Name', 'Section', 'Branch', 'Semester', 'Batch', 'Faculty in Charge', 'Enrolled', 'Appeared', 'Passed', 'Failed', 'Pass Rate %', 'Mean SGPA', 'Distinctions', 'Backlogs', 'Top Performer'];
                    const rows = cList.map(c => [
                        c.name,
                        c.sectionLetter || c.section || '—',
                        c.branch,
                        `Sem ${c.semester}`,
                        c.batch,
                        c.facultyName,
                        c.enrolledCount,
                        c.appeared,
                        c.passed,
                        c.failed,
                        `${c.passRate}%`,
                        c.avgSGPA,
                        c.distinctionCount,
                        c.backlogCount,
                        c.topper ? `${c.topper.name} (${c.topper.usn} - SGPA ${c.topper.sgpa})` : '—'
                    ]);
                    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    XLSX.utils.book_append_sheet(wb, ws, 'Class Comparisons');
                    XLSX.writeFile(wb, `Class_Comparison_Report.xlsx`);
                } else {
                    const cList = sectionReport?.sectionComparisons || [];
                    if (cList.length === 0) {
                        alert('No section comparison data available to export.');
                        return;
                    }
                    const headers = ['Section', 'Total Students', 'Average SGPA', 'Pass Rate %', 'Distinction Count', 'Backlogs Count'];
                    const rows = cList.map(s => [
                        s.sectionName || `Section ${s.section}`,
                        s.studentCount ?? 0,
                        typeof s.avgSGPA === 'number' ? s.avgSGPA.toFixed(2) : (s.avgSGPA ?? '—'),
                        typeof s.passRate === 'number' ? `${s.passRate.toFixed(1)}%` : (s.passRate ?? '—'),
                        s.distinctionCount ?? 0,
                        s.backlogCount ?? 0
                    ]);
                    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    XLSX.utils.book_append_sheet(wb, ws, 'Section Benchmarks');
                    XLSX.writeFile(wb, `Section_Comparison_${branch}_Sem${semester}.xlsx`);
                }
            } else {
                const tList = comparatorData?.trajectory || [];
                if (tList.length === 0) {
                    alert('No student comparison data available to export.');
                    return;
                }
                const headers = ['Semester', ...usnList.map(u => (studentMap.get(u)?.name ? `${studentMap.get(u).name} (${u})` : u))];
                const rows = tList.map(row => [
                    typeof row.semester === 'string' && row.semester.startsWith('Sem') ? row.semester : `Sem ${row.semester}`,
                    ...usnList.map(u => (typeof row[u] === 'number' ? row[u].toFixed(2) : (row[u] ?? '—')))
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, 'Trajectory Benchmarks');

                // Subject-by-Subject Sheet
                if ((comparatorData?.subjectComparison || []).length > 0) {
                    const subHeaders = ['Subject Code', 'Subject Title', 'Credits', ...usnList.map(u => `${studentMap.get(u)?.name || u} (Grade/Total)`)];
                    const subRows = (comparatorData.subjectComparison || []).map(sub => [
                        sub.code,
                        sub.name,
                        sub.credits,
                        ...usnList.map(u => {
                            const m = sub.students?.[u];
                            return m ? `${m.grade} (${m.total}/100)` : '—';
                        })
                    ]);
                    const wsSub = XLSX.utils.aoa_to_sheet([subHeaders, ...subRows]);
                    XLSX.utils.book_append_sheet(wb, wsSub, 'Subject Breakdown');
                }

                XLSX.writeFile(wb, `Student_Comparison_Report.xlsx`);
            }
        } catch (err) {
            console.error('Export Excel error:', err);
            alert('Failed to export Excel: ' + (err.message || 'Unknown error'));
        }
    };

    // ── PDF Export ──
    const handleExportPDF = async () => {
        try {
            const { jsPDF, autoTable } = await getJsPDF();
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            if (viewTab === 'department') {
                const sList = deptReport?.semesters || [];
                if (sList.length === 0) {
                    alert('No department trends data available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`Department & Cohort Trends - Department of ${branch}`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(`Generated: ${new Date().toLocaleDateString()} | Active Semesters Evaluated: ${sList.length}`, 14, 21);

                const tableHead = [['Semester', 'Total Appeared', 'Passed', 'Failed', 'Pass Rate %', 'Average CGPA']];
                const tableBody = sList.map(s => [
                    `Sem ${s.semester}`,
                    s.appeared ?? 0,
                    s.passed ?? 0,
                    s.failed ?? 0,
                    typeof s.passRate === 'number' ? `${s.passRate.toFixed(1)}%` : '—',
                    typeof s.avgCGPA === 'number' ? s.avgCGPA.toFixed(2) : '—'
                ]);

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                doc.save(`Department_Overview_${branch}.pdf`);
            } else if (viewTab === 'sections') {
                if (compareMode === 'classes') {
                    const cList = classReport?.classes || [];
                    if (cList.length === 0) {
                        alert('No class comparison data available to download.');
                        return;
                    }
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`Institutional Class Comparison & Benchmarking Report`, 14, 15);

                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`Generated: ${new Date().toLocaleDateString()} | Classes Compared: ${cList.length} | Benchmark Mean SGPA: ${classReport?.benchmarks?.benchmarkAvgSGPA || '—'}`, 14, 21);

                    const tableHead = [['Class Name', 'Branch', 'Sem', 'Faculty', 'Enrolled', 'Pass %', 'Mean SGPA', 'Distinctions', 'Backlogs', 'Topper']];
                    const tableBody = cList.map(c => [
                        c.name,
                        c.branch,
                        `Sem ${c.semester}`,
                        c.facultyName,
                        c.enrolledCount,
                        `${c.passRate}%`,
                        c.avgSGPA,
                        c.distinctionCount,
                        c.backlogCount,
                        c.topper ? `${c.topper.name} (${c.topper.sgpa})` : '—'
                    ]);

                    autoTable(doc, {
                        head: tableHead,
                        body: tableBody,
                        startY: 25,
                        theme: 'striped',
                        styles: { fontSize: 8, cellPadding: 2 },
                        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                    });

                    doc.save(`Class_Comparison_Report.pdf`);
                } else {
                    const cList = sectionReport?.sectionComparisons || [];
                    if (cList.length === 0) {
                        alert('No section comparison data available to download.');
                        return;
                    }
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`Section Benchmarking Report - ${branch} (Semester ${semester})`, 14, 15);

                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`Generated: ${new Date().toLocaleDateString()} | Sections Compared: ${cList.length}`, 14, 21);

                    const tableHead = [['Section', 'Total Students', 'Average SGPA', 'Pass Rate %', 'Distinctions', 'Backlogs']];
                    const tableBody = cList.map(s => [
                        s.sectionName || `Section ${s.section}`,
                        s.studentCount ?? 0,
                        typeof s.avgSGPA === 'number' ? s.avgSGPA.toFixed(2) : '—',
                        typeof s.passRate === 'number' ? `${s.passRate.toFixed(1)}%` : '—',
                        s.distinctionCount ?? 0,
                        s.backlogCount ?? 0
                    ]);

                    autoTable(doc, {
                        head: tableHead,
                        body: tableBody,
                        startY: 25,
                        theme: 'striped',
                        styles: { fontSize: 8, cellPadding: 2 },
                        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                    });

                    doc.save(`Section_Comparison_${branch}_Sem${semester}.pdf`);
                }
            } else {
                const tList = comparatorData?.trajectory || [];
                if (tList.length === 0) {
                    alert('No student comparison data available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`Student Trajectory Head-to-Head Comparison`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(`Comparing: ${usnList.join(', ')} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['Semester', ...usnList.map(u => (studentMap.get(u)?.name ? `${studentMap.get(u).name} (${u})` : u))]];
                const tableBody = tList.map(row => [
                    typeof row.semester === 'string' && row.semester.startsWith('Sem') ? row.semester : `Sem ${row.semester}`,
                    ...usnList.map(u => (typeof row[u] === 'number' ? row[u].toFixed(2) : (row[u] ?? '—')))
                ]);

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                doc.save(`Student_Comparison_Report.pdf`);
            }
        } catch (err) {
            console.error('Export PDF error:', err);
            alert('Failed to generate PDF: ' + (err.message || 'Unknown error'));
        }
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Analytics</PageHeaderEyebrow>
                    <PageHeaderTitle>Comparative Intelligence Suite</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Cross-sectional department trends, dynamic class-to-class benchmarking, section comparisons, and student trajectory analysis.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button onClick={handleRefresh} variant="secondary" disabled={isRefreshing || deptLoading || classLoading || sectionLoading || comparatorLoading}>
                        <span className={`material-icons-round ${isRefreshing ? 'gf-spin' : ''}`} style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Button onClick={handleExportExcel} variant="secondary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>table_view</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Download PDF
                    </Button>
                </div>
            </div>

            {/* Mode Switcher Tabs */}
            <div style={{
                display: 'flex',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '4px',
                gap: '4px',
                marginBottom: '20px',
                width: 'fit-content',
                maxWidth: '100%',
                flexWrap: 'wrap'
            }}>
                <button
                    type="button"
                    onClick={() => setViewTab('sections')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'sections' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'sections' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>school</span>
                    Class &amp; Section Comparison
                </button>
                <button
                    type="button"
                    onClick={() => setViewTab('department')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'department' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'department' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>domain</span>
                    Department &amp; Cohort Trends
                </button>
                <button
                    type="button"
                    onClick={() => setViewTab('compare')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'compare' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'compare' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>compare_arrows</span>
                    Student Head-to-Head Comparator
                </button>
            </div>

            {/* TAB: CLASS & SECTION COMPARISON (viewTab === 'sections') */}
            {viewTab === 'sections' && (
                <>
                    {/* Sub-Switch: Class Comparison vs Section Benchmarking */}
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        marginBottom: '18px',
                        background: 'var(--surface-low)',
                        padding: '6px',
                        borderRadius: '10px',
                        width: 'fit-content',
                        border: '1px solid var(--border)'
                    }}>
                        <button
                            type="button"
                            onClick={() => setCompareMode('classes')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                background: compareMode === 'classes' ? 'var(--primary)' : 'transparent',
                                color: compareMode === 'classes' ? '#FFFFFF' : 'var(--tx-muted)',
                                fontWeight: 800,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>groups</span>
                            Class-to-Class Comparison
                        </button>
                        <button
                            type="button"
                            onClick={() => setCompareMode('sections')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                background: compareMode === 'sections' ? 'var(--primary)' : 'transparent',
                                color: compareMode === 'sections' ? '#FFFFFF' : 'var(--tx-muted)',
                                fontWeight: 800,
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>view_column</span>
                            Section Benchmarking
                        </button>
                    </div>

                    {/* SUB-VIEW 1: CLASS-TO-CLASS COMPARISON */}
                    {compareMode === 'classes' && (
                        <>
                            {/* Class Filters Bar */}
                            <Card style={{ marginBottom: '24px' }}>
                                <CardContent style={{ padding: '16px 20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                                        <Select
                                            label="Branch / Department"
                                            value={classBranch}
                                            onChange={e => setClassBranch(e.target.value)}
                                            options={[
                                                { value: 'ALL', label: 'All Departments / Classes' },
                                                ...getCleanBranchOptions(meta.branches).filter(b => b.value !== 'ALL')
                                            ]}
                                        />

                                        <Select
                                            label="Graduation Batch"
                                            value={classBatch}
                                            onChange={e => setClassBatch(e.target.value)}
                                            options={[
                                                { value: 'ALL', label: 'All Batches (Overall)' },
                                                ...(meta.batches || []).map(b => ({ value: b, label: `Batch ${b}` }))
                                            ]}
                                        />

                                        <Select
                                            label="Semester"
                                            value={classSemester}
                                            onChange={e => setClassSemester(e.target.value)}
                                            options={[
                                                { value: 'ALL', label: 'All Semesters (Compare All Classes)' },
                                                ...(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({
                                                    value: String(s),
                                                    label: s === 6 ? `Semester ${s} (3 Classes Active)` : `Semester ${s}`
                                                }))
                                            ]}
                                        />

                                        <Input
                                            label="Search Classes"
                                            placeholder="Search by class name, branch or teacher..."
                                            value={classSearch}
                                            onChange={e => setClassSearch(e.target.value)}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Class KPIs */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Top Performing Class</div>
                                        <div style={{ fontSize: '22px', fontWeight: 900, color: '#16A34A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {classReport?.benchmarks?.bestClass ? classReport.benchmarks.bestClass.name : '—'}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            {classReport?.benchmarks?.bestClass ? `${classReport.benchmarks.bestClass.passRate}% Pass • SGPA ${classReport.benchmarks.bestClass.avgSGPA}` : 'No evaluated class'}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Benchmark Mean SGPA</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>
                                            {(classReport?.benchmarks?.benchmarkAvgSGPA ?? 0).toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Cross-class baseline</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Class Disparity / Variance</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            {(classReport?.benchmarks?.passRateSpread ?? 0).toFixed(1)}%
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            SGPA spread: {(classReport?.benchmarks?.sgpaSpread ?? 0).toFixed(2)} pts
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Classes Evaluated</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            {filteredClassesList.length}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            {classReport?.benchmarks?.totalEnrolled ?? 0} total enrolled students
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Visual Class Comparison Chart */}
                            {filteredClassesList.length > 0 && (
                                <Card style={{ marginBottom: '24px' }}>
                                    <CardHeader>
                                        <CardTitle>Comparative Class Performance (Mean SGPA &amp; Pass Rate)</CardTitle>
                                    </CardHeader>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ height: '320px', width: '100%' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={filteredClassesList}>
                                                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                                                    <YAxis yAxisId="left" domain={[0, 100]} unit="%" />
                                                    <YAxis yAxisId="right" orientation="right" domain={[0, 10]} />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Bar yAxisId="left" dataKey="passRate" name="Pass Rate (%)" fill="#6366F1" radius={[4, 4, 0, 0]} />
                                                    <Line yAxisId="right" type="monotone" dataKey="avgSGPA" name="Mean SGPA" stroke="#10B981" strokeWidth={3} dot={{ r: 5 }} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Class Performance Matrix */}
                            <Card style={{ marginBottom: '24px' }}>
                                <CardHeader>
                                    <CardTitle>Institutional Class Performance Matrix</CardTitle>
                                </CardHeader>
                                <CardContent style={{ padding: 0 }}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                                    <th style={{ padding: '12px 16px' }}>Class Name &amp; Section</th>
                                                    <th style={{ padding: '12px 16px' }}>Department</th>
                                                    <th style={{ padding: '12px 16px' }}>Sem &amp; Batch</th>
                                                    <th style={{ padding: '12px 16px' }}>Faculty In Charge</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Cohort Size</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Mean SGPA</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Pass Rate %</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Distinctions</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Backlogs</th>
                                                    <th style={{ padding: '12px 16px' }}>Class Topper</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {classLoading ? (
                                                    <tr>
                                                        <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                            Analyzing institutional classes data...
                                                        </td>
                                                    </tr>
                                                ) : filteredClassesList.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                                            No classes match the selected filter criteria.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredClassesList.map(c => {
                                                        const isExpanded = expandedClassId === c.id;
                                                        return (
                                                            <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                                                <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span>{c.name}</span>
                                                                        {c.sectionLetter && c.sectionLetter !== '—' && (
                                                                            <span style={{ fontSize: '10px', background: 'var(--primary-low)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                                                Sec {c.sectionLetter}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </td>
                                                                <td style={{ padding: '14px 16px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                                    {c.branch}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                                    Sem {c.semester} • Batch {c.batch}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', color: 'var(--tx-main)', fontWeight: 600 }}>
                                                                    {c.facultyName}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                                    {c.appeared} <span style={{ fontSize: '11px', opacity: 0.7 }}>/ {c.enrolledCount}</span>
                                                                </td>
                                                                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>
                                                                    {typeof c.avgSGPA === 'number' && c.avgSGPA > 0 ? c.avgSGPA.toFixed(2) : (c.avgSGPA || '—')}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: (c.passRate ?? 0) >= 70 ? '#16A34A' : '#DC2626' }}>
                                                                    {typeof c.passRate === 'number' ? `${c.passRate.toFixed(1)}%` : (c.passRate ?? '—')}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                                    {c.distinctionCount}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: c.backlogCount > 0 ? '#DC2626' : '#16A34A' }}>
                                                                    {c.backlogCount}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', fontSize: '12px' }}>
                                                                    {c.topper ? (
                                                                        <div>
                                                                            <span style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{c.topper.name}</span>
                                                                            <span style={{ marginLeft: '4px', color: 'var(--primary)', fontWeight: 800 }}>({c.topper.sgpa})</span>
                                                                        </div>
                                                                    ) : '—'}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setExpandedClassId(isExpanded ? null : c.id)}
                                                                        style={{
                                                                            padding: '4px 10px',
                                                                            borderRadius: '6px',
                                                                            border: '1px solid var(--border)',
                                                                            background: isExpanded ? 'var(--primary)' : 'var(--surface-low)',
                                                                            color: isExpanded ? '#FFFFFF' : 'var(--tx-main)',
                                                                            fontSize: '11px',
                                                                            fontWeight: 700,
                                                                            cursor: 'pointer'
                                                                        }}
                                                                    >
                                                                        {isExpanded ? 'Hide' : 'Details'}
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Detailed Class View if a class is expanded */}
                            {expandedClassId && (() => {
                                const expClass = filteredClassesList.find(c => c.id === expandedClassId);
                                if (!expClass) return null;
                                return (
                                    <Card style={{ marginBottom: '24px', border: '1px solid var(--primary-low)' }}>
                                        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <CardTitle>Class Details: {expClass.name} (Semester {expClass.semester})</CardTitle>
                                            <button
                                                type="button"
                                                onClick={() => setExpandedClassId(null)}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', fontSize: '18px' }}
                                            >
                                                &times;
                                            </button>
                                        </CardHeader>
                                        <CardContent style={{ padding: '20px' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '20px' }}>
                                                <div style={{ background: 'var(--surface-low)', padding: '12px 16px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)' }}>Highest SGPA</div>
                                                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#16A34A', marginTop: '2px' }}>{expClass.highestSGPA}</div>
                                                </div>
                                                <div style={{ background: 'var(--surface-low)', padding: '12px 16px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)' }}>Lowest SGPA</div>
                                                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#DC2626', marginTop: '2px' }}>{expClass.lowestSGPA}</div>
                                                </div>
                                                <div style={{ background: 'var(--surface-low)', padding: '12px 16px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)' }}>First Class with Distinction</div>
                                                    <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--primary)', marginTop: '2px' }}>{expClass.distinctionCount}</div>
                                                </div>
                                                <div style={{ background: 'var(--surface-low)', padding: '12px 16px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)' }}>First Class (6.75 - 7.74)</div>
                                                    <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{expClass.firstClassCount}</div>
                                                </div>
                                            </div>

                                            {/* Subject Breakdown in this class */}
                                            {expClass.subjectSummary?.length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '10px' }}>
                                                        Subject-wise Performance in this Class
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px' }}>
                                                        {expClass.subjectSummary.map(sub => (
                                                            <div key={sub.code} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div>
                                                                    <div style={{ fontWeight: 800, fontSize: '12px', color: 'var(--tx-main)' }}>{sub.code}</div>
                                                                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>{sub.name}</div>
                                                                </div>
                                                                <div style={{ textAlign: 'right' }}>
                                                                    <div style={{ fontWeight: 800, fontSize: '13px', color: sub.passRate >= 70 ? '#16A34A' : '#DC2626' }}>{sub.passRate}%</div>
                                                                    <div style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>{sub.passed}/{sub.appeared} passed</div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                );
                            })()}
                        </>
                    )}

                    {/* SUB-VIEW 2: SECTION BENCHMARKING */}
                    {compareMode === 'sections' && (
                        <>
                            {/* Section Filters Bar */}
                            <Card style={{ marginBottom: '24px' }}>
                                <CardContent style={{ padding: '16px 20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                                        <Select
                                            label="Branch / Department"
                                            value={branch}
                                            onChange={e => setBranch(e.target.value)}
                                            options={getCleanBranchOptions(meta.branches)}
                                        />

                                        <Select
                                            label="Graduation Batch"
                                            value={batch}
                                            onChange={e => setBatch(e.target.value)}
                                            options={(meta.batches || []).map(b => ({ value: b, label: `Batch ${b}` }))}
                                        />

                                        <Select
                                            label="Semester"
                                            value={semester}
                                            onChange={e => setSemester(Number(e.target.value))}
                                            options={(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => {
                                                const hasData = activeEvaluatedSemesters.includes(s);
                                                return {
                                                    value: s,
                                                    label: hasData ? `Semester ${s} (Active Data)` : `Semester ${s}`
                                                };
                                            })}
                                        />
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Alert if semester has no evaluated records */}
                            {(!sectionLoading && (sectionReport?.sectionComparisons || []).length === 0) && (
                                <div style={{
                                    background: 'var(--surface-low)',
                                    border: '1px solid var(--border)',
                                    borderLeft: '4px solid #F59E0B',
                                    borderRadius: '8px',
                                    padding: '16px 20px',
                                    marginBottom: '24px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)', marginBottom: '4px' }}>
                                            No evaluation records for {branch} in Semester {semester}
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>
                                            Active evaluated data is available in Semester {activeEvaluatedSemesters.slice(-1)[0] || 6}.
                                        </div>
                                    </div>
                                    {activeEvaluatedSemesters.length > 0 && activeEvaluatedSemesters[activeEvaluatedSemesters.length - 1] !== semester && (
                                        <Button
                                            variant="primary"
                                            onClick={() => setSemester(activeEvaluatedSemesters[activeEvaluatedSemesters.length - 1])}
                                            style={{ fontSize: '12px', padding: '8px 14px' }}
                                        >
                                            Switch to Semester {activeEvaluatedSemesters[activeEvaluatedSemesters.length - 1]}
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Section KPIs */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Top Performing Section</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>
                                            {sectionReport?.benchmarks?.bestSection && sectionReport.benchmarks.bestSection !== '—'
                                                ? `Section ${sectionReport.benchmarks.bestSection}`
                                                : '—'}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            {sectionReport?.benchmarks?.bestSectionLabel || 'Benchmark leader'}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Benchmark Mean SGPA</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>
                                            {(sectionReport?.benchmarks?.benchmarkAvg ?? 0).toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Cross-section baseline</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Section Variance / Spread</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            {(sectionReport?.benchmarks?.sectionSpread ?? 0).toFixed(1)}%
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Min-to-max pass disparity</div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Visual Section Comparison Chart */}
                            {(sectionReport?.sectionComparisons || []).length > 0 && (
                                <Card style={{ marginBottom: '24px' }}>
                                    <CardHeader>
                                        <CardTitle>Section Comparison (Semester {semester})</CardTitle>
                                    </CardHeader>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ height: '300px', width: '100%' }}>
                                            <ResponsiveContainer width="100%" height="100%">
                                                <ComposedChart data={sectionReport?.sectionComparisons || []}>
                                                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                    <XAxis dataKey="sectionName" />
                                                    <YAxis yAxisId="left" domain={[0, 100]} unit="%" />
                                                    <YAxis yAxisId="right" orientation="right" domain={[0, 10]} />
                                                    <Tooltip />
                                                    <Legend />
                                                    <Bar yAxisId="left" dataKey="passRate" name="Pass Rate (%)" fill="#6366F1" radius={[4, 4, 0, 0]} />
                                                    <Line yAxisId="right" type="monotone" dataKey="avgSGPA" name="Mean SGPA" stroke="#10B981" strokeWidth={3} dot={{ r: 6 }} />
                                                </ComposedChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Section Performance Matrix */}
                            <Card style={{ marginBottom: '24px' }}>
                                <CardHeader>
                                    <CardTitle>Section Performance Matrix (Semester {semester})</CardTitle>
                                </CardHeader>
                                <CardContent style={{ padding: 0 }}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                                    <th style={{ padding: '12px 16px' }}>Section</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Cohort Size</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Mean SGPA</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Pass Rate %</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Distinctions</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Backlogs</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {sectionLoading ? (
                                                    <tr>
                                                        <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Analyzing sections data...</td>
                                                    </tr>
                                                ) : (sectionReport?.sectionComparisons || []).length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No section comparisons recorded for this semester.</td>
                                                    </tr>
                                                ) : (
                                                    (sectionReport?.sectionComparisons || []).map(s => (
                                                        <tr key={s.section} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                                {s.sectionName || `Section ${s.section}`}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                                {s.studentCount}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>
                                                                {typeof s.avgSGPA === 'number' && s.avgSGPA > 0 ? s.avgSGPA.toFixed(2) : (s.avgSGPA ?? '—')}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: (s.passRate ?? 0) >= 70 ? '#16A34A' : '#DC2626' }}>
                                                                {typeof s.passRate === 'number' ? `${s.passRate.toFixed(1)}%` : (s.passRate ?? '—')}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                                {s.distinctionCount}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: s.backlogCount > 0 ? '#DC2626' : '#16A34A' }}>
                                                                {s.backlogCount}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Cross-Section Subject Matrix */}
                            {(sectionReport?.subjectMatrix || []).length > 0 && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Subject Performance Matrix Across Sections</CardTitle>
                                    </CardHeader>
                                    <CardContent style={{ padding: 0 }}>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                                        <th style={{ padding: '12px 16px' }}>Subject Code &amp; Title</th>
                                                        {(sectionReport?.sections || []).map(sec => (
                                                            <th key={sec} style={{ padding: '12px 16px', textAlign: 'center' }}>Section {sec} Pass %</th>
                                                        ))}
                                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>Best Section</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'center' }}>Delta Gap</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {sectionReport.subjectMatrix.map(sub => (
                                                        <tr key={sub.code} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '14px 16px' }}>
                                                                <div style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{sub.code}</div>
                                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{sub.name}</div>
                                                            </td>
                                                            {(sectionReport?.sections || []).map(sec => (
                                                                <td key={sec} style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 700 }}>
                                                                    {sub.rates?.[sec] !== null && sub.rates?.[sec] !== undefined ? `${sub.rates[sec]}%` : '—'}
                                                                </td>
                                                            ))}
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: '#16A34A' }}>
                                                                {sub.bestSection ? `Section ${sub.bestSection}` : '—'}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                                {sub.gap > 0 ? `${sub.gap}%` : '0%'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                </>
            )}

            {/* TAB 1: DEPARTMENT OVERVIEW */}
            {viewTab === 'department' && (
                <>
                    {/* Department Filters Bar */}
                    <Card style={{ marginBottom: '24px' }}>
                        <CardContent style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                                <Select
                                    label="Branch / Department"
                                    value={branch}
                                    onChange={e => setBranch(e.target.value)}
                                    options={getCleanBranchOptions(meta.branches).filter(b => b.value !== 'ALL')}
                                />

                                <Select
                                    label="Graduation Batch"
                                    value={batch}
                                    onChange={e => setBatch(e.target.value)}
                                    options={[
                                        { value: 'ALL', label: 'All Batches (Overall)' },
                                        ...(meta.batches || []).map(b => ({ value: b, label: `Batch ${b}` }))
                                    ]}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total Active Cohort</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{deptReport?.summary?.totalStudents ?? 0}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Department size</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Overall Department Pass Rate</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: (deptReport?.summary?.overallPassRate ?? 0) >= 70 ? '#16A34A' : '#DC2626' }}>
                                    {typeof deptReport?.summary?.overallPassRate === 'number' ? `${deptReport.summary.overallPassRate.toFixed(1)}%` : '—'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Mean pass benchmark</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Department Avg CGPA</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>
                                    {typeof deptReport?.summary?.avgCGPA === 'number' ? deptReport.summary.avgCGPA.toFixed(2) : '—'}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>GPA index</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Cumulative Backlogs</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626' }}>{deptReport?.summary?.totalBacklogs ?? 0}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Arrears recorded</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card style={{ marginBottom: '24px' }}>
                        <CardHeader>
                            <CardTitle>Semester Performance Trajectory</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: '20px' }}>
                            <div style={{ height: '320px', width: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={deptReport?.semesters || []}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                        <XAxis dataKey="semester" tickFormatter={s => `Sem ${s}`} />
                                        <YAxis yAxisId="left" domain={[0, 100]} unit="%" />
                                        <YAxis yAxisId="right" orientation="right" domain={[0, 10]} />
                                        <Tooltip />
                                        <Legend />
                                        <Bar yAxisId="left" dataKey="passRate" name="Pass Rate (%)" fill="#6366F1" radius={[4, 4, 0, 0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="avgCGPA" name="Average CGPA" stroke="#10B981" strokeWidth={3} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* TAB 3: STUDENT HEAD-TO-HEAD COMPARATOR */}
            {viewTab === 'compare' && (
                <>
                    {/* Search & Selector Card */}
                    <Card style={{ marginBottom: '24px', position: 'relative' }}>
                        <CardContent style={{ padding: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '15px', color: 'var(--tx-main)' }}>
                                        Student Head-to-Head Comparison Roster
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                        Search students by Name or USN, or load benchmark cohorts with one click. Compare any number of students without restriction.
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (!classReport?.classes?.length) loadClassesData();
                                            setClassPickerOpen(true);
                                        }}
                                        style={{
                                            background: 'rgba(99, 102, 241, 0.1)',
                                            color: 'var(--primary)',
                                            border: '1px solid rgba(99, 102, 241, 0.3)',
                                            borderRadius: '8px',
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '15px' }}>groups</span>
                                        📋 Pick from Class Roster
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleLoadPreset('top3')}
                                        disabled={comparatorLoading}
                                        style={{
                                            background: 'rgba(16, 185, 129, 0.1)',
                                            color: '#16A34A',
                                            border: '1px solid rgba(16, 185, 129, 0.3)',
                                            borderRadius: '8px',
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '15px' }}>military_tech</span>
                                        ⭐ Top 3 Rankers
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleLoadPreset('remedial')}
                                        disabled={comparatorLoading}
                                        style={{
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            color: '#DC2626',
                                            border: '1px solid rgba(239, 68, 68, 0.3)',
                                            borderRadius: '8px',
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '15px' }}>warning_amber</span>
                                        ⚠️ Remedial / At-Risk
                                    </button>
                                    {usnList.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setUsnList([])}
                                            style={{
                                                background: 'var(--surface-low)',
                                                color: 'var(--tx-muted)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px',
                                                padding: '6px 12px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>clear_all</span>
                                            Clear All
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Live Search Input with Suggestions Dropdown */}
                            <div ref={searchContainerRef} style={{ position: 'relative' }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <span className="material-icons-round" style={{
                                            position: 'absolute',
                                            left: '12px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: 'var(--tx-muted)',
                                            fontSize: '18px',
                                            pointerEvents: 'none'
                                        }}>
                                            person_search
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Type Student Name or USN (e.g. Ainan, 2AB23CS061)..."
                                            value={usnInput}
                                            onChange={e => setUsnInput(e.target.value)}
                                            onKeyDown={e => {
                                                if (e.key === 'Enter') {
                                                    handleAddUsn();
                                                }
                                            }}
                                            onFocus={() => {
                                                if (studentSearchResults.length > 0) setSearchDropdownOpen(true);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '11px 14px 11px 38px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface-low)',
                                                color: 'var(--tx-main)',
                                                fontSize: '13px',
                                                outline: 'none',
                                                transition: 'border-color 0.15s ease'
                                            }}
                                        />
                                        {isSearchingStudents && (
                                            <span className="material-icons-round gf-spin" style={{
                                                position: 'absolute',
                                                right: '12px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                color: 'var(--primary)',
                                                fontSize: '18px'
                                            }}>
                                                sync
                                            </span>
                                        )}
                                    </div>
                                    <Button onClick={() => handleAddUsn()} variant="primary" style={{ padding: '10px 18px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '6px' }}>add</span>
                                        Add USN
                                    </Button>
                                </div>

                                {/* Floating Autocomplete Dropdown */}
                                {searchDropdownOpen && studentSearchResults.length > 0 && (
                                    <div style={{
                                        position: 'absolute',
                                        top: 'calc(100% + 6px)',
                                        left: 0,
                                        right: 0,
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        boxShadow: '0 12px 30px rgba(0,0,0,0.18)',
                                        borderRadius: '10px',
                                        zIndex: 50,
                                        maxHeight: '280px',
                                        overflowY: 'auto',
                                        padding: '6px'
                                    }}>
                                        <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                            Matching Students
                                        </div>
                                        {studentSearchResults.map(stu => {
                                            const isSelected = usnList.includes(stu.usn);
                                            return (
                                                <div
                                                    key={stu.usn}
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        if (!isSelected) handleSelectStudent(stu);
                                                    }}
                                                    style={{
                                                        padding: '10px 12px',
                                                        borderRadius: '8px',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        cursor: isSelected ? 'default' : 'pointer',
                                                        background: isSelected ? 'var(--surface-low)' : 'transparent',
                                                        opacity: isSelected ? 0.6 : 1,
                                                        transition: 'background 0.15s ease'
                                                    }}
                                                    onMouseEnter={e => {
                                                        if (!isSelected) e.currentTarget.style.background = 'var(--surface-low)';
                                                    }}
                                                    onMouseLeave={e => {
                                                        if (!isSelected) e.currentTarget.style.background = 'transparent';
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{
                                                            width: '32px',
                                                            height: '32px',
                                                            borderRadius: '50%',
                                                            background: 'var(--primary-low)',
                                                            color: 'var(--primary)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: 800,
                                                            fontSize: '12px'
                                                        }}>
                                                            {(stu.name || stu.usn).slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                                                {stu.name || stu.usn}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>
                                                                {stu.usn} • {stu.branch || 'CSE'} {stu.section ? `(Sec ${stu.section})` : ''} • Sem {stu.semester || '6'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        {typeof stu.cgpa === 'number' && stu.cgpa > 0 && (
                                                            <span style={{
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                background: stu.cgpa >= 7.75 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(99, 102, 241, 0.1)',
                                                                color: stu.cgpa >= 7.75 ? '#16A34A' : 'var(--primary)'
                                                            }}>
                                                                {stu.cgpa.toFixed(2)} CGPA
                                                            </span>
                                                        )}
                                                        {stu.total_backlogs > 0 && (
                                                            <span style={{
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                padding: '3px 8px',
                                                                borderRadius: '6px',
                                                                background: 'rgba(239, 68, 68, 0.1)',
                                                                color: '#DC2626'
                                                            }}>
                                                                {stu.total_backlogs} Backlog{stu.total_backlogs > 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                        <span style={{
                                                            fontSize: '12px',
                                                            fontWeight: 700,
                                                            color: isSelected ? 'var(--tx-dim)' : 'var(--primary)'
                                                        }}>
                                                            {isSelected ? 'Added ✓' : '+ Add'}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            {/* Active Student Ribbon Chips */}
                            {usnList.length > 0 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {usnList.map((u, i) => {
                                            const stu = studentMap.get(u);
                                            const color = getStudentColor(i);
                                            const hasRealName = stu?.name && stu.name.trim().toUpperCase() !== u.toUpperCase();
                                            return (
                                                <div
                                                    key={u}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '8px',
                                                        background: 'var(--surface-low)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '8px',
                                                        padding: '6px 12px',
                                                        fontSize: '12px',
                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                                                    }}
                                                >
                                                    <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                                                    <span style={{ fontWeight: 800, color: 'var(--tx-main)' }}>
                                                        {hasRealName ? stu.name : u}
                                                    </span>
                                                    {hasRealName && (
                                                        <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontFamily: 'monospace' }}>
                                                            ({u})
                                                        </span>
                                                    )}
                                                    {stu?.cgpa && (
                                                        <span style={{
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            color: color,
                                                            background: `${color}14`,
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            marginLeft: '2px'
                                                        }}>
                                                            {stu.cgpa.toFixed(2)}
                                                        </span>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleRemoveUsn(u)}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            cursor: 'pointer',
                                                            color: 'var(--tx-muted)',
                                                            fontSize: '16px',
                                                            lineHeight: 1,
                                                            padding: 0,
                                                            marginLeft: '4px',
                                                            transition: 'color 0.15s ease'
                                                        }}
                                                        title="Remove student"
                                                    >
                                                        &times;
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)' }}>
                                        {usnList.length} student{usnList.length === 1 ? '' : 's'} selected for comparison
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Zero State if No Students Added */}
                    {usnList.length === 0 ? (
                        <Card>
                            <CardContent style={{ padding: '60px 24px', textAlign: 'center' }}>
                                <div style={{
                                    width: '64px',
                                    height: '64px',
                                    borderRadius: '50%',
                                    background: 'var(--surface-low)',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: '16px'
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)' }}>
                                        compare_arrows
                                    </span>
                                </div>
                                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '6px' }}>
                                    No Students Selected for Head-to-Head Comparison
                                </div>
                                <div style={{ fontSize: '13px', color: 'var(--tx-muted)', maxWidth: '520px', margin: '0 auto 24px auto', lineHeight: 1.6 }}>
                                    Compare individual academic trajectories, SGPA momentum, credit progression, and subject-level performance matrices side-by-side.
                                </div>
                                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                    <Button onClick={() => handleLoadPreset('top3')} variant="primary">
                                        <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '6px' }}>military_tech</span>
                                        Compare Top 3 Rankers
                                    </Button>
                                    <Button onClick={() => handleLoadPreset('remedial')} variant="secondary">
                                        <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '6px' }}>warning_amber</span>
                                        Diagnose Remedial Students
                                    </Button>
                                    <Button onClick={() => {
                                        if (!classReport?.classes?.length) loadClassesData();
                                        setClassPickerOpen(true);
                                    }} variant="secondary">
                                        <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '6px' }}>groups</span>
                                        Browse Class Sections
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <>
                            {/* Loading Indicator when comparator is fetching */}
                            {comparatorLoading && (
                                <div style={{
                                    background: 'rgba(99, 102, 241, 0.08)',
                                    border: '1px solid rgba(99, 102, 241, 0.25)',
                                    borderRadius: '10px',
                                    padding: '12px 18px',
                                    marginBottom: '20px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '10px',
                                    color: 'var(--primary)'
                                }}>
                                    <span className="material-icons-round gf-spin" style={{ fontSize: '20px' }}>sync</span>
                                    <span style={{ fontWeight: 800, fontSize: '13px' }}>
                                        Crunching comparative trajectories & subject grade matrices...
                                    </span>
                                </div>
                            )}

                            {/* Executive Head-to-Head Scorecards Grid */}
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
                                    Head-to-Head Scorecards
                                </div>
                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 260px), 1fr))`,
                                    gap: '16px'
                                }}>
                                    {usnList.map((u, i) => {
                                        const stu = studentMap.get(u);
                                        const stats = studentStats[u] || {};
                                        const color = getStudentColor(i);
                                        const cgpa = typeof stu?.cgpa === 'number' ? stu.cgpa : null;
                                        const hasRealName = stu?.name && stu.name.trim().toUpperCase() !== u.toUpperCase();
                                        const displayName = hasRealName ? stu.name : u;

                                        let classTag = { label: 'Not Graded', color: 'var(--tx-muted)', bg: 'var(--surface-low)' };
                                        if (cgpa !== null) {
                                            if (cgpa >= 7.75) classTag = { label: 'Distinction (≥7.75)', color: '#16A34A', bg: 'rgba(22, 163, 74, 0.1)' };
                                            else if (cgpa >= 6.75) classTag = { label: 'First Class', color: 'var(--primary)', bg: 'rgba(99, 102, 241, 0.1)' };
                                            else if (cgpa >= 5.00) classTag = { label: 'Second Class', color: '#D97706', bg: 'rgba(217, 119, 6, 0.1)' };
                                            else classTag = { label: 'At-Risk (<5.00)', color: '#DC2626', bg: 'rgba(220, 38, 38, 0.1)' };
                                        }

                                        return (
                                            <Card key={u} style={{
                                                position: 'relative',
                                                overflow: 'hidden',
                                                border: `1.5px solid ${color}30`,
                                                boxShadow: '0 4px 14px rgba(0,0,0,0.04)'
                                            }}>
                                                {/* Top Accent Strip */}
                                                <div style={{ height: '4px', background: color, width: '100%' }} />

                                                <CardContent style={{ padding: '18px' }}>
                                                    {/* Header: Avatar, Name, USN */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
                                                        <div style={{
                                                            width: '40px',
                                                            height: '40px',
                                                            borderRadius: '50%',
                                                            background: `${color}18`,
                                                            color: color,
                                                            border: `2px solid ${color}`,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: 900,
                                                            fontSize: '14px',
                                                            flexShrink: 0
                                                        }}>
                                                            {displayName.slice(0, 2).toUpperCase()}
                                                        </div>
                                                        <div style={{ overflow: 'hidden' }}>
                                                            <div style={{ fontWeight: 900, fontSize: '14px', color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                {displayName}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontFamily: 'monospace' }}>
                                                                {hasRealName ? `${u} • ${stu?.branch || 'CSE'}` : (stu?.branch || 'CSE')}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* CGPA Primary Metric */}
                                                    <div style={{
                                                        background: 'var(--surface-low)',
                                                        borderRadius: '10px',
                                                        padding: '12px',
                                                        marginBottom: '14px',
                                                        border: '1px solid var(--border)'
                                                    }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                            <div>
                                                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                                    Cumulative CGPA
                                                                </div>
                                                                <div style={{ fontSize: '26px', fontWeight: 900, color: color, lineHeight: 1.1, marginTop: '2px' }}>
                                                                    {cgpa !== null ? cgpa.toFixed(2) : '—'}
                                                                </div>
                                                            </div>
                                                            {/* Trend Pill */}
                                                            {stats.trend && (
                                                                <div style={{
                                                                    fontSize: '11px',
                                                                    fontWeight: 800,
                                                                    padding: '4px 8px',
                                                                    borderRadius: '6px',
                                                                    background: stats.trend === 'rising' ? 'rgba(16, 185, 129, 0.12)' : stats.trend === 'declining' ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface)',
                                                                    color: stats.trend === 'rising' ? '#16A34A' : stats.trend === 'declining' ? '#DC2626' : 'var(--tx-muted)',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    gap: '3px'
                                                                }}>
                                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>
                                                                        {stats.trend === 'rising' ? 'trending_up' : stats.trend === 'declining' ? 'trending_down' : 'trending_flat'}
                                                                    </span>
                                                                    {stats.delta > 0 ? `+${stats.delta}` : stats.delta < 0 ? `${stats.delta}` : 'Steady'}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{
                                                            marginTop: '6px',
                                                            fontSize: '11px',
                                                            fontWeight: 700,
                                                            color: classTag.color
                                                        }}>
                                                            {classTag.label}
                                                        </div>
                                                    </div>

                                                    {/* Key Stat Rows */}
                                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px' }}>
                                                        <div style={{ background: 'var(--surface-low)', padding: '8px 10px', borderRadius: '6px' }}>
                                                            <div style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Pass Rate</div>
                                                            <div style={{ fontWeight: 800, fontSize: '13px', color: (stu?.passRate ?? 0) >= 70 ? '#16A34A' : '#DC2626', marginTop: '2px' }}>
                                                                {typeof stu?.passRate === 'number' ? `${stu.passRate}%` : '—'}
                                                            </div>
                                                        </div>
                                                        <div style={{ background: 'var(--surface-low)', padding: '8px 10px', borderRadius: '6px' }}>
                                                            <div style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Active Backlogs</div>
                                                            <div style={{ fontWeight: 800, fontSize: '13px', color: (stu?.failed || 0) > 0 ? '#DC2626' : '#16A34A', marginTop: '2px' }}>
                                                                {(stu?.failed || 0) > 0 ? `${stu.failed} Backlogs` : '0 (Clear)'}
                                                            </div>
                                                        </div>
                                                        <div style={{ background: 'var(--surface-low)', padding: '8px 10px', borderRadius: '6px' }}>
                                                            <div style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Total Credits</div>
                                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginTop: '2px' }}>
                                                                {stu?.totalCredits ?? '—'} cr
                                                            </div>
                                                        </div>
                                                        <div style={{ background: 'var(--surface-low)', padding: '8px 10px', borderRadius: '6px' }}>
                                                            <div style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Peak SGPA</div>
                                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--primary)', marginTop: '2px' }}>
                                                                {stats.bestSGPA > 0 ? `${stats.bestSGPA} (${stats.bestSem})` : '—'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </CardContent>
                                            </Card>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Comparative Insights AI Banner */}
                            {comparativeInsights && (
                                <Card style={{ marginBottom: '24px', background: 'linear-gradient(135deg, var(--surface) 0%, var(--surface-low) 100%)', border: '1px solid var(--border)' }}>
                                    <CardContent style={{ padding: '18px 20px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>insights</span>
                                            <span style={{ fontWeight: 900, fontSize: '14px', color: 'var(--tx-main)' }}>
                                                Comparative Intelligence Takeaways
                                            </span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px' }}>
                                            <div style={{ borderLeft: '3px solid #16A34A', paddingLeft: '10px' }}>
                                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Cohort Academic Leader</div>
                                                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginTop: '2px' }}>
                                                    {comparativeInsights.leader?.name || '—'}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#16A34A', fontWeight: 700 }}>
                                                    {comparativeInsights.leader?.cgpa?.toFixed(2)} CGPA • {comparativeInsights.leader?.passRate}% Pass
                                                </div>
                                            </div>

                                            {comparativeInsights.improver && (
                                                <div style={{ borderLeft: '3px solid #6366F1', paddingLeft: '10px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Steepest Momentum</div>
                                                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginTop: '2px' }}>
                                                        {comparativeInsights.improver.student?.name || '—'}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>
                                                        +{comparativeInsights.improver.jump} SGPA gain across evaluated semesters
                                                    </div>
                                                </div>
                                            )}

                                            {comparativeInsights.bottleneckSubject && (
                                                <div style={{ borderLeft: '3px solid #F59E0B', paddingLeft: '10px' }}>
                                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Shared Bottleneck Course</div>
                                                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginTop: '2px' }}>
                                                        {comparativeInsights.bottleneckSubject.code}
                                                    </div>
                                                    <div style={{ fontSize: '11px', color: '#D97706', fontWeight: 700 }}>
                                                        Lowest cohort mean: {comparativeInsights.bottleneckSubject.avg}/100
                                                    </div>
                                                </div>
                                            )}

                                            <div style={{ borderLeft: `3px solid ${comparativeInsights.backlogCount > 0 ? '#DC2626' : '#16A34A'}`, paddingLeft: '10px' }}>
                                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Remedial Priority</div>
                                                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginTop: '2px' }}>
                                                    {comparativeInsights.backlogCount > 0
                                                        ? `${comparativeInsights.backlogCount} student${comparativeInsights.backlogCount > 1 ? 's' : ''} with backlogs`
                                                        : '100% All Clear'
                                                    }
                                                </div>
                                                <div style={{ fontSize: '11px', color: comparativeInsights.backlogCount > 0 ? '#DC2626' : '#16A34A', fontWeight: 700 }}>
                                                    {comparativeInsights.backlogCount > 0
                                                        ? 'Schedule special coaching on failed subjects'
                                                        : 'Cohort in good academic standing'
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {/* Academic Trajectory Comparison Chart (Cleaned & Enhanced) */}
                            <Card style={{ marginBottom: '24px' }}>
                                <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                    <div>
                                        <CardTitle>Academic Trajectory Comparison (SGPA Progression)</CardTitle>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                            Semester-over-semester progression benchmarked against VTU Distinction (7.75) and First Class (6.75) thresholds.
                                        </div>
                                    </div>
                                    {/* Benchmark Chips + Scale Switcher */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            background: 'var(--surface-low)',
                                            color: 'var(--tx-muted)',
                                            border: '1px solid var(--border)'
                                        }}>
                                            <span style={{ width: '12px', height: '0px', borderTop: '2px dashed #64748B', display: 'inline-block' }} />
                                            Distinction (≥ 7.75)
                                        </span>
                                        <span style={{
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            background: 'var(--surface-low)',
                                            color: 'var(--tx-muted)',
                                            border: '1px solid var(--border)'
                                        }}>
                                            <span style={{ width: '12px', height: '0px', borderTop: '2px dotted #94A3B8', display: 'inline-block' }} />
                                            First Class (≥ 6.75)
                                        </span>
                                        <div style={{ display: 'flex', background: 'var(--surface-low)', padding: '2px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                            <button
                                                onClick={() => setTrajectoryScale('focus')}
                                                title="Focus SGPA range to clearly inspect trends"
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: trajectoryScale === 'focus' ? 'var(--primary)' : 'transparent',
                                                    color: trajectoryScale === 'focus' ? '#fff' : 'var(--tx-muted)',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                Focus Scale
                                            </button>
                                            <button
                                                onClick={() => setTrajectoryScale('full')}
                                                title="Display standard 0–10 scale"
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 700,
                                                    border: 'none',
                                                    cursor: 'pointer',
                                                    background: trajectoryScale === 'full' ? 'var(--primary)' : 'transparent',
                                                    color: trajectoryScale === 'full' ? '#fff' : 'var(--tx-muted)',
                                                    transition: 'all 0.15s'
                                                }}
                                            >
                                                0–10 Scale
                                            </button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent style={{ padding: '20px' }}>
                                    <div style={{ height: '360px', width: '100%' }}>
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart
                                                data={comparatorData?.trajectory || []}
                                                margin={{ top: 16, right: 36, left: 10, bottom: 8 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                <XAxis
                                                    dataKey="semester"
                                                    tickFormatter={s => (typeof s === 'string' && s.startsWith('Sem') ? s : `Sem ${s}`)}
                                                    tick={{ fontSize: 12, fill: 'var(--tx-muted)', fontWeight: 600 }}
                                                    padding={{ left: 24, right: 36 }}
                                                />
                                                <YAxis
                                                    domain={trajectoryDomain}
                                                    ticks={trajectoryTicks}
                                                    tick={{ fontSize: 11, fill: 'var(--tx-muted)' }}
                                                />
                                                <Tooltip
                                                    content={({ active, payload, label }) => {
                                                        if (!active || !payload || !payload.length) return null;
                                                        const sorted = [...payload].sort((a, b) => (b.value || 0) - (a.value || 0));
                                                        return (
                                                            <div style={{
                                                                background: 'var(--surface)',
                                                                border: '1px solid var(--border)',
                                                                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                                                borderRadius: '10px',
                                                                padding: '12px 16px',
                                                                minWidth: '220px'
                                                            }}>
                                                                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
                                                                    {label} SGPA Benchmark
                                                                </div>
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                    {sorted.map((item, idx) => {
                                                                        const stu = studentMap.get(item.dataKey);
                                                                        const isTop = idx === 0 && sorted.length > 1 && item.value > 0;
                                                                        const hasRealName = stu?.name && stu.name.trim().toUpperCase() !== item.dataKey.toUpperCase();
                                                                        const displayName = hasRealName ? stu.name : item.dataKey;
                                                                        return (
                                                                            <div key={item.dataKey} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', gap: '12px' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                                                                                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                                                                                    <span style={{ fontWeight: 700, color: 'var(--tx-main)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '140px' }}>
                                                                                        {displayName}
                                                                                    </span>
                                                                                    {isTop && <span title="Highest this semester" style={{ fontSize: '11px' }}>⭐</span>}
                                                                                </div>
                                                                                <span style={{ fontWeight: 900, color: item.color, fontFamily: 'monospace', fontSize: '13px' }}>
                                                                                    {typeof item.value === 'number' ? item.value.toFixed(2) : '—'}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        );
                                                    }}
                                                />
                                                <Legend
                                                    verticalAlign="bottom"
                                                    wrapperStyle={{ paddingTop: '20px' }}
                                                    formatter={(value) => {
                                                        const stu = studentMap.get(value);
                                                        const hasRealName = stu?.name && stu.name.trim().toUpperCase() !== value.toUpperCase();
                                                        return (
                                                            <span style={{ color: 'var(--tx-main)', fontSize: '12px', fontWeight: 600, marginRight: '14px' }}>
                                                                {hasRealName ? `${stu.name} (${value})` : value}
                                                            </span>
                                                        );
                                                    }}
                                                />

                                                {/* Milestone Reference Lines — Neutral structural guidelines to never clash with student series */}
                                                <ReferenceLine
                                                    y={7.75}
                                                    stroke="#64748B"
                                                    strokeDasharray="6 6"
                                                    strokeWidth={1.5}
                                                    label={{
                                                        value: 'Distinction (7.75)',
                                                        position: 'insideTopRight',
                                                        fill: 'var(--tx-muted)',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        offset: 6
                                                    }}
                                                />
                                                <ReferenceLine
                                                    y={6.75}
                                                    stroke="#94A3B8"
                                                    strokeDasharray="3 3"
                                                    strokeWidth={1.5}
                                                    label={{
                                                        value: 'First Class (6.75)',
                                                        position: 'insideBottomRight',
                                                        fill: 'var(--tx-dim)',
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        offset: 6
                                                    }}
                                                />

                                                {usnList.map((u, i) => {
                                                    const strokeColor = getStudentColor(i);
                                                    return (
                                                        <Line
                                                            key={u}
                                                            type="monotone"
                                                            dataKey={u}
                                                            name={u}
                                                            stroke={strokeColor}
                                                            strokeWidth={2.5}
                                                            connectNulls={true}
                                                            dot={{ r: 4, fill: strokeColor, strokeWidth: 1.5, stroke: 'var(--surface)' }}
                                                            activeDot={{ r: 6, stroke: strokeColor, strokeWidth: 2 }}
                                                        />
                                                    );
                                                })}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Subject-by-Subject Head-to-Head Comparison Matrix */}
                            {(comparatorData?.subjectComparison || []).length > 0 && (
                                <Card style={{ marginBottom: '24px' }}>
                                    <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                        <div>
                                            <CardTitle>Subject-by-Subject Head-to-Head Matrix</CardTitle>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                Granular evaluation comparing scores, letter grades, and internal vs external splits across all completed courses.
                                            </div>
                                        </div>

                                        {/* Filters for Subjects */}
                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                            <input
                                                type="text"
                                                placeholder="Filter by subject code or title..."
                                                value={subjectSearch}
                                                onChange={e => setSubjectSearch(e.target.value)}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: '6px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--surface-low)',
                                                    color: 'var(--tx-main)',
                                                    fontSize: '12px',
                                                    outline: 'none',
                                                    width: '200px'
                                                }}
                                            />
                                            <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-low)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setSubjectFilterMode('all')}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        background: subjectFilterMode === 'all' ? 'var(--primary)' : 'transparent',
                                                        color: subjectFilterMode === 'all' ? '#FFFFFF' : 'var(--tx-muted)'
                                                    }}
                                                >
                                                    All ({comparatorData.subjectComparison.length})
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSubjectFilterMode('delta')}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        background: subjectFilterMode === 'delta' ? 'var(--primary)' : 'transparent',
                                                        color: subjectFilterMode === 'delta' ? '#FFFFFF' : 'var(--tx-muted)'
                                                    }}
                                                >
                                                    High Spread (Δ ≥ 15)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSubjectFilterMode('fails')}
                                                    style={{
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: 'none',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        background: subjectFilterMode === 'fails' ? '#DC2626' : 'transparent',
                                                        color: subjectFilterMode === 'fails' ? '#FFFFFF' : 'var(--tx-muted)'
                                                    }}
                                                >
                                                    Arrears / Fails
                                                </button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent style={{ padding: 0 }}>
                                        <div style={{ overflowX: 'auto' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                                        <th style={{ padding: '12px 16px', minWidth: '220px' }}>Course Code &amp; Title</th>
                                                        {usnList.map((u, i) => {
                                                            const color = getStudentColor(i);
                                                            const stu = studentMap.get(u);
                                                            const hasRealName = stu?.name && stu.name.trim().toUpperCase() !== u.toUpperCase();
                                                            return (
                                                                <th key={u} style={{ padding: '12px 16px', textAlign: 'center', minWidth: '140px' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
                                                                        <span style={{ color: 'var(--tx-main)', fontWeight: 800 }}>{hasRealName ? stu.name : u}</span>
                                                                    </div>
                                                                    {hasRealName && (
                                                                        <div style={{ fontSize: '10px', color: 'var(--tx-muted)', textTransform: 'none', fontFamily: 'monospace' }}>
                                                                            {u}
                                                                        </div>
                                                                    )}
                                                                </th>
                                                            );
                                                        })}
                                                        <th style={{ padding: '12px 16px', textAlign: 'center', minWidth: '130px' }}>Top Performer</th>
                                                        <th style={{ padding: '12px 16px', textAlign: 'center', minWidth: '90px' }}>Score Spread</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {filteredSubjectComparison.length === 0 ? (
                                                        <tr>
                                                            <td colSpan={usnList.length + 3} style={{ padding: '36px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                                No subjects match the selected filter.
                                                            </td>
                                                        </tr>
                                                    ) : (
                                                        filteredSubjectComparison.map(sub => {
                                                            // Calculate highest score in this subject
                                                            let topScore = -1;
                                                            let topUsn = null;
                                                            let lowestScore = 999;
                                                            const validScores = [];

                                                            usnList.forEach(u => {
                                                                const m = sub.students?.[u];
                                                                if (m && typeof m.total === 'number') {
                                                                    validScores.push(m.total);
                                                                    if (m.total > topScore) {
                                                                        topScore = m.total;
                                                                        topUsn = u;
                                                                    }
                                                                    if (m.total < lowestScore) {
                                                                        lowestScore = m.total;
                                                                    }
                                                                }
                                                            });

                                                            const deltaGap = validScores.length >= 2 ? (topScore - lowestScore) : null;
                                                            const topStudent = topUsn ? studentMap.get(topUsn) : null;

                                                            return (
                                                                <tr key={sub.code} style={{ borderBottom: '1px solid var(--border)' }}>
                                                                    <td style={{ padding: '14px 16px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <span style={{ fontWeight: 800, color: 'var(--tx-main)', fontSize: '13px' }}>{sub.code}</span>
                                                                            <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-low)', color: 'var(--tx-dim)' }}>
                                                                                {sub.credits} Cr
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                                            {sub.name}
                                                                        </div>
                                                                    </td>

                                                                    {usnList.map((u, i) => {
                                                                        const m = sub.students?.[u];
                                                                        if (!m) {
                                                                            return (
                                                                                <td key={u} style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                                                                    —
                                                                                </td>
                                                                            );
                                                                        }

                                                                        const isTop = m.total === topScore && topScore > 0 && validScores.length > 1;
                                                                        const g = (m.grade || '').toUpperCase();
                                                                        let badgeBg = 'rgba(99, 102, 241, 0.1)';
                                                                        let badgeColor = 'var(--primary)';

                                                                        if (m.isFail || g === 'F') {
                                                                            badgeBg = 'rgba(239, 68, 68, 0.15)';
                                                                            badgeColor = '#DC2626';
                                                                        } else if (['O', 'S', 'A+'].includes(g)) {
                                                                            badgeBg = 'rgba(16, 185, 129, 0.15)';
                                                                            badgeColor = '#16A34A';
                                                                        } else if (['B', 'C'].includes(g)) {
                                                                            badgeBg = 'rgba(245, 158, 11, 0.15)';
                                                                            badgeColor = '#D97706';
                                                                        }

                                                                        return (
                                                                            <td key={u} style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                                                                                    <span style={{
                                                                                        fontWeight: 900,
                                                                                        fontSize: '11px',
                                                                                        padding: '2px 7px',
                                                                                        borderRadius: '5px',
                                                                                        background: badgeBg,
                                                                                        color: badgeColor
                                                                                    }}>
                                                                                        {g || '—'}
                                                                                    </span>
                                                                                    <span style={{ fontWeight: 800, fontSize: '13px', color: m.isFail ? '#DC2626' : 'var(--tx-main)' }}>
                                                                                        {m.total}
                                                                                    </span>
                                                                                    {isTop && <span title="Highest in subject" style={{ fontSize: '12px' }}>👑</span>}
                                                                                </div>
                                                                                <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                                                                    IA: {m.internal ?? '—'} • EA: {m.external ?? '—'}
                                                                                </div>
                                                                            </td>
                                                                        );
                                                                    })}

                                                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                                        {topStudent ? (
                                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 800, color: '#16A34A' }}>
                                                                                <span>{topStudent.name || topUsn}</span>
                                                                                <span style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>({topScore})</span>
                                                                            </div>
                                                                        ) : '—'}
                                                                    </td>

                                                                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                                        {deltaGap !== null ? (
                                                                            <span style={{
                                                                                fontSize: '12px',
                                                                                fontWeight: 800,
                                                                                color: deltaGap >= 15 ? '#DC2626' : 'var(--tx-muted)'
                                                                            }}>
                                                                                Δ {deltaGap} pts
                                                                            </span>
                                                                        ) : '—'}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}
                        </>
                    )}
                    {/* Class Roster Picker Modal */}
                    {classPickerOpen && (
                        <div style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0, 0, 0, 0.65)',
                            backdropFilter: 'blur(4px)',
                            zIndex: 1000,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '20px'
                        }}>
                            <div style={{
                                background: 'var(--surface)',
                                border: '1px solid var(--border)',
                                borderRadius: '16px',
                                width: '100%',
                                maxWidth: '680px',
                                maxHeight: '85vh',
                                display: 'flex',
                                flexDirection: 'column',
                                boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
                                overflow: 'hidden'
                            }}>
                                {/* Modal Header */}
                                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontWeight: 900, fontSize: '16px', color: 'var(--tx-main)' }}>
                                            Pick Students from Class Roster
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                            Select a class section and click students to compare. ({usnList.length} student{usnList.length === 1 ? '' : 's'} selected)
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setClassPickerOpen(false)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', fontSize: '22px', lineHeight: 1 }}
                                    >
                                        &times;
                                    </button>
                                </div>

                                {/* Modal Controls: Class Selector & Search */}
                                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface-low)', display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                                    <div style={{ flex: '1', minWidth: '220px' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            Target Class Section
                                        </label>
                                        <select
                                            value={selectedPickerClassId}
                                            onChange={e => {
                                                setSelectedPickerClassId(e.target.value);
                                                loadClassRoster(e.target.value);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '9px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '13px',
                                                fontWeight: 700,
                                                outline: 'none'
                                            }}
                                        >
                                            {(classReport?.classes || []).map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} {c.section ? `(Sec ${c.section})` : ''} • Sem {c.semester} • Batch {c.batch}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div style={{ flex: '1', minWidth: '200px' }}>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                            Search Students
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Filter by name or USN..."
                                            value={rosterSearch}
                                            onChange={e => setRosterSearch(e.target.value)}
                                            style={{
                                                width: '100%',
                                                padding: '9px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--tx-main)',
                                                fontSize: '13px',
                                                outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Modal Body: Roster Grid */}
                                <div style={{ padding: '16px 24px', overflowY: 'auto', flex: '1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {isLoadingRoster ? (
                                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                            <span className="material-icons-round gf-spin" style={{ fontSize: '28px', color: 'var(--primary)', marginBottom: '8px' }}>sync</span>
                                            <div style={{ fontSize: '13px', fontWeight: 700 }}>Loading class roster...</div>
                                        </div>
                                    ) : classRosterStudents.length === 0 ? (
                                        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-main)' }}>No students found in this class</div>
                                            <div style={{ fontSize: '12px' }}>Try selecting another class section above.</div>
                                        </div>
                                    ) : (
                                        filterAndRankStudents(classRosterStudents, rosterSearch)
                                            .map(stu => {
                                                const isAdded = usnList.includes(stu.usn);
                                                return (
                                                    <div
                                                        key={stu.usn}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '10px 14px',
                                                            borderRadius: '8px',
                                                            border: `1px solid ${isAdded ? 'var(--primary)' : 'var(--border)'}`,
                                                            background: isAdded ? 'rgba(99, 102, 241, 0.06)' : 'var(--surface-low)',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div style={{
                                                                width: '34px',
                                                                height: '34px',
                                                                borderRadius: '50%',
                                                                background: isAdded ? 'var(--primary)' : 'var(--border)',
                                                                color: isAdded ? '#FFFFFF' : 'var(--tx-muted)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: 800,
                                                                fontSize: '12px'
                                                            }}>
                                                                {(stu.name || stu.usn).slice(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                                                    {stu.name || stu.usn}
                                                                </div>
                                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontFamily: 'monospace' }}>
                                                                    {stu.usn} {stu.section ? `• Sec ${stu.section}` : ''}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                            {typeof stu.cgpa === 'number' && stu.cgpa > 0 && (
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    fontWeight: 800,
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    background: stu.cgpa >= 7.75 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                                                                    color: stu.cgpa >= 7.75 ? '#16A34A' : 'var(--primary)'
                                                                }}>
                                                                    {stu.cgpa.toFixed(2)} CGPA
                                                                </span>
                                                            )}
                                                            {stu.total_backlogs > 0 && (
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    fontWeight: 800,
                                                                    padding: '3px 8px',
                                                                    borderRadius: '6px',
                                                                    background: 'rgba(239, 68, 68, 0.12)',
                                                                    color: '#DC2626'
                                                                }}>
                                                                    {stu.total_backlogs} Backlog{stu.total_backlogs > 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (isAdded) {
                                                                        handleRemoveUsn(stu.usn);
                                                                    } else {
                                                                        handleAddUsn(stu.usn);
                                                                    }
                                                                }}
                                                                style={{
                                                                    padding: '6px 12px',
                                                                    borderRadius: '6px',
                                                                    border: 'none',
                                                                    fontSize: '11px',
                                                                    fontWeight: 800,
                                                                    cursor: 'pointer',
                                                                    background: isAdded ? 'rgba(239, 68, 68, 0.1)' : 'var(--primary)',
                                                                    color: isAdded ? '#DC2626' : '#FFFFFF',
                                                                    transition: 'all 0.15s ease'
                                                                }}
                                                            >
                                                                {isAdded ? 'Remove' : '+ Compare'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>

                                {/* Modal Footer */}
                                <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-low)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                        {usnList.length} student{usnList.length === 1 ? '' : 's'} in comparison cohort
                                    </span>
                                    <Button variant="primary" onClick={() => setClassPickerOpen(false)}>
                                        Done
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
