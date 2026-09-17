'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
import { ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart, LineChart, ReferenceLine, LabelList, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest, clearApiCache } from '@/lib/api/client';
import { getCleanBranchOptions } from '@/lib/semester-utils';
import { filterAndRankStudents, filterAndRank, matchesGeneric } from '@/lib/search-utils';
import { writeWorkbook } from '@/lib/workbook-export';
import { fmtNum } from '@/lib/format';

export default function InstitutionalIntelligencePage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    return (
        <AuthGuard role="faculty">
            {!mounted ? (
                <div style={{ padding: '60px 24px', maxWidth: '1400px', margin: '0 auto', textAlign: 'center', color: 'var(--tx-muted)' }}>
                    <div className="gf-spin" style={{ display: 'inline-block', marginBottom: '12px' }}>
                        <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)' }}>sync</span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>Loading Performance Comparison...</div>
                </div>
            ) : (
                <Suspense fallback={
                    <div style={{ padding: '40px 24px', maxWidth: '1400px', margin: '0 auto', textAlign: 'center', color: 'var(--tx-muted)' }}>
                        Loading Institutional Intelligence...
                    </div>
                }>
                    <InstitutionalIntelligenceContent />
                </Suspense>
            )}
        </AuthGuard>
    );
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

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

function CustomBenchmarkTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;
    return (
        <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            fontSize: '12px',
            minWidth: '200px'
        }}>
            <div style={{ fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                {data.name || label}
                {data.sectionLetter && data.sectionLetter !== '—' && ` • Sec ${data.sectionLetter}`}
                {data.batch && data.batch !== '—' && ` • Batch ${data.batch}`}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#6366F1', fontWeight: 800, margin: '4px 0' }}>
                <span>Pass Rate:</span>
                <span>{data.passRate}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: '#10B981', fontWeight: 800, margin: '4px 0' }}>
                <span>Mean SGPA:</span>
                <span>{data.avgSGPA}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: 'var(--tx-muted)', margin: '4px 0' }}>
                <span>Cohort Appeared:</span>
                <span style={{ color: 'var(--tx-main)', fontWeight: 700 }}>{data.appeared}</span>
            </div>
            {data.topper && (
                <div style={{ marginTop: '8px', paddingTop: '6px', borderTop: '1px dashed var(--border)', fontSize: '11px', color: 'var(--tx-muted)' }}>
                    Topper: <strong style={{ color: 'var(--tx-main)' }}>{data.topper.name}</strong> ({data.topper.cgpa ? `${data.topper.cgpa} CGPA` : `${data.topper.sgpa} SGPA`})
                </div>
            )}
        </div>
    );
}

function CustomHistogramTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    return (
        <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            fontSize: '12px',
            minWidth: '220px'
        }}>
            <div style={{ fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                Grade: {label}
            </div>
            {payload.map(p => (
                <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: p.color, fontWeight: 700, margin: '4px 0' }}>
                    <span>{p.name || p.dataKey}:</span>
                    <span style={{ fontWeight: 800 }}>{p.value} student{p.value === 1 ? '' : 's'}</span>
                </div>
            ))}
        </div>
    );
}

function CustomClassificationTooltip({ active, payload, label }) {
    if (!active || !payload || !payload.length) return null;
    const total = payload.reduce((acc, p) => acc + (Number(p.value) || 0), 0);
    return (
        <div style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            fontSize: '12px',
            minWidth: '240px'
        }}>
            <div style={{ fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
                {label} (Total: {total})
            </div>
            {payload.map(p => (
                <div key={p.dataKey} style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', color: p.color, fontWeight: 600, margin: '4px 0' }}>
                    <span>{p.name}:</span>
                    <span style={{ fontWeight: 800 }}>{p.value} ({total > 0 ? `${((p.value / total) * 100).toFixed(1)}%` : '0%'})</span>
                </div>
            ))}
        </div>
    );
}

function HighlightMatch({ text, query }) {
    if (!text) return null;
    const str = String(text);
    if (!query || !query.trim()) return <span>{str}</span>;
    const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${q})`, 'gi');
    const parts = str.split(regex);
    return (
        <span>
            {parts.map((part, i) =>
                part.toLowerCase() === query.trim().toLowerCase() ? (
                    <mark
                        key={i}
                        style={{
                            background: 'rgba(99, 102, 241, 0.18)',
                            color: 'var(--primary)',
                            fontWeight: 800,
                            borderRadius: '3px',
                            padding: '0 2px'
                        }}
                    >
                        {part}
                    </mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    );
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

    // Sub-mode inside Comparison tab: 'classes' | 'batches' | 'sections'
    const [compareMode, setCompareMode] = useState(() => {
        const modeParam = searchParams?.get('mode');
        if (modeParam === 'batches') return 'batches';
        if (modeParam === 'sections') return 'sections';
        return 'classes'; // Default to Class Comparison
    });

    // Interactive Selection & Chart Type State for Class Comparison
    const [selectedClassIds, setSelectedClassIds] = useState([]);
    const [classChartType, setClassChartType] = useState('benchmark'); // 'benchmark' | 'histogram' | 'classification'

    // Interactive Selection & Chart Type State for Batch Comparison
    const [selectedBatchesForCompare, setSelectedBatchesForCompare] = useState([]);
    const [batchChartType, setBatchChartType] = useState('benchmark'); // 'benchmark' | 'histogram' | 'classification'

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
    const [sectionMode, setSectionMode] = useState('auto'); // 'auto' | 'split'

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
    const [activeSearchIndex, setActiveSearchIndex] = useState(-1);
    const [checkedUsns, setCheckedUsns] = useState(new Set());
    const [subjectSearch, setSubjectSearch] = useState('');
    const [subjectFilterMode, setSubjectFilterMode] = useState('all'); // 'all' | 'delta' | 'fails'
    const [classPickerOpen, setClassPickerOpen] = useState(false);
    const [selectedPickerClassId, setSelectedPickerClassId] = useState('');
    const [availableClasses, setAvailableClasses] = useState([]);
    const [isLoadingClasses, setIsLoadingClasses] = useState(false);
    const [classRosterStudents, setClassRosterStudents] = useState([]);
    const [rosterSearch, setRosterSearch] = useState('');
    const [isLoadingRoster, setIsLoadingRoster] = useState(false);
    const [rosterCheckedUsns, setRosterCheckedUsns] = useState(new Set());
    const [rosterFilterMode, setRosterFilterMode] = useState('all'); // 'all' | 'unadded' | 'added'
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
            const query = { branch: targetBranch, batch, semester, sectionMode };
            const res = await apiRequest('/api/faculty/analytics/sections-compare', { query, cacheTtl: 30_000 });
            if (res) setSectionReport(res);
        } catch (err) {
            console.error('Failed to load sections comparison:', err);
        } finally {
            setSectionLoading(false);
        }
    }, [branch, batch, semester, sectionMode]);

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

    // Active classes count per semester
    const activeClassesPerSemester = useMemo(() => {
        const counts = {};
        (classReport?.classes || meta.classes || []).forEach(c => {
            const sem = Number(c.semester);
            if (!isNaN(sem) && sem > 0) {
                counts[sem] = (counts[sem] || 0) + 1;
            }
        });
        return counts;
    }, [classReport?.classes, meta.classes]);

    // Class selection handlers
    const toggleClassSelection = (classId) => {
        setSelectedClassIds(prev =>
            prev.includes(classId) ? prev.filter(id => id !== classId) : [...prev, classId]
        );
    };

    const selectAllFilteredClasses = () => {
        setSelectedClassIds(filteredClassesList.map(c => c.id));
    };

    const clearClassSelection = () => {
        setSelectedClassIds([]);
    };

    const classesToCompare = useMemo(() => {
        const list = filteredClassesList;
        if (!selectedClassIds || selectedClassIds.length === 0) return list;
        const selected = list.filter(c => selectedClassIds.includes(c.id));
        return selected.length > 0 ? selected : list;
    }, [filteredClassesList, selectedClassIds]);

    const comparisonBenchmarks = useMemo(() => {
        const list = classesToCompare;
        if (list.length === 0) {
            return {
                bestClass: null,
                totalClasses: 0,
                totalEnrolled: 0,
                totalAppeared: 0,
                overallPassRate: 0,
                benchmarkAvgSGPA: 0,
                passRateSpread: 0,
                sgpaSpread: 0
            };
        }
        const sortedByPass = [...list].filter(c => c.appeared > 0).sort((a, b) => b.passRate - a.passRate || b.avgSGPA - a.avgSGPA);
        const bestClass = sortedByPass[0] || null;
        const totalEnrolled = list.reduce((acc, c) => acc + (c.enrolledCount || 0), 0);
        const totalAppeared = list.reduce((acc, c) => acc + (c.appeared || 0), 0);
        const totalPassed = list.reduce((acc, c) => acc + (c.passed || 0), 0);
        const overallPassRate = totalAppeared > 0 ? Number(((totalPassed / totalAppeared) * 100).toFixed(1)) : 0;
        const validSgpas = list.filter(c => c.appeared > 0 && c.avgSGPA > 0).map(c => c.avgSGPA);
        const benchmarkAvgSGPA = validSgpas.length > 0 ? Number((validSgpas.reduce((a, b) => a + b, 0) / validSgpas.length).toFixed(2)) : 0;
        const validPassRates = list.filter(c => c.appeared > 0).map(c => c.passRate);
        const passRateSpread = validPassRates.length > 1 ? Number((Math.max(...validPassRates) - Math.min(...validPassRates)).toFixed(1)) : 0;
        const sgpaSpread = validSgpas.length > 1 ? Number((Math.max(...validSgpas) - Math.min(...validSgpas)).toFixed(2)) : 0;
        return {
            bestClass,
            totalClasses: list.length,
            totalEnrolled,
            totalAppeared,
            overallPassRate,
            benchmarkAvgSGPA,
            passRateSpread,
            sgpaSpread
        };
    }, [classesToCompare]);

    const classGradeHistogramData = useMemo(() => {
        const gradesDef = [
            { key: 'O', label: 'O (90-100)', name: 'Outstanding' },
            { key: 'APlus', label: 'A+ (80-89)', name: 'Excellent' },
            { key: 'A', label: 'A (70-79)', name: 'Very Good' },
            { key: 'BPlus', label: 'B+ (60-69)', name: 'Good' },
            { key: 'B', label: 'B (55-59)', name: 'Above Avg' },
            { key: 'C', label: 'C (50-54)', name: 'Average' },
            { key: 'P', label: 'P (40-49)', name: 'Pass' },
            { key: 'F', label: 'F (<40)', name: 'Backlog (Fail)' }
        ];

        return gradesDef.map(g => {
            const row = { grade: g.label, desc: g.name };
            classesToCompare.forEach(c => {
                const label = c.shortName || c.name;
                row[label] = c.grades?.[g.key] || 0;
            });
            return row;
        });
    }, [classesToCompare]);

    // Batch-to-Batch comparison memos
    const batchesList = useMemo(() => {
        return classReport?.batchesComparison || [];
    }, [classReport?.batchesComparison]);

    const toggleBatchSelection = (batchYear) => {
        setSelectedBatchesForCompare(prev =>
            prev.includes(batchYear) ? prev.filter(y => y !== batchYear) : [...prev, batchYear]
        );
    };

    const selectAllBatches = () => {
        setSelectedBatchesForCompare(batchesList.map(b => b.batch));
    };

    const clearBatchSelection = () => {
        setSelectedBatchesForCompare([]);
    };

    const batchesToCompare = useMemo(() => {
        if (!selectedBatchesForCompare || selectedBatchesForCompare.length === 0) return batchesList;
        const filtered = batchesList.filter(b => selectedBatchesForCompare.includes(b.batch));
        return filtered.length > 0 ? filtered : batchesList;
    }, [batchesList, selectedBatchesForCompare]);

    const batchComparisonBenchmarks = useMemo(() => {
        const list = batchesToCompare;
        if (list.length === 0) {
            return {
                bestBatch: null,
                totalBatches: 0,
                totalEnrolled: 0,
                totalAppeared: 0,
                overallPassRate: 0,
                benchmarkAvgSGPA: 0,
                passRateSpread: 0
            };
        }
        const sorted = [...list].filter(b => b.appeared > 0).sort((a, b) => b.passRate - a.passRate || b.avgSGPA - a.avgSGPA);
        const bestBatch = sorted[0] || null;
        const totalEnrolled = list.reduce((acc, b) => acc + (b.enrolledCount || 0), 0);
        const totalAppeared = list.reduce((acc, b) => acc + (b.appeared || 0), 0);
        const totalPassed = list.reduce((acc, b) => acc + (b.passed || 0), 0);
        const overallPassRate = totalAppeared > 0 ? Number(((totalPassed / totalAppeared) * 100).toFixed(1)) : 0;
        const validSgpas = list.filter(b => b.appeared > 0 && b.avgSGPA > 0).map(b => b.avgSGPA);
        const benchmarkAvgSGPA = validSgpas.length > 0 ? Number((validSgpas.reduce((a, b) => a + b, 0) / validSgpas.length).toFixed(2)) : 0;
        const validPassRates = list.filter(b => b.appeared > 0).map(b => b.passRate);
        const passRateSpread = validPassRates.length > 1 ? Number((Math.max(...validPassRates) - Math.min(...validPassRates)).toFixed(1)) : 0;

        return {
            bestBatch,
            totalBatches: list.length,
            totalEnrolled,
            totalAppeared,
            overallPassRate,
            benchmarkAvgSGPA,
            passRateSpread
        };
    }, [batchesToCompare]);

    const batchGradeHistogramData = useMemo(() => {
        const gradesDef = [
            { key: 'O', label: 'O (90-100)', name: 'Outstanding' },
            { key: 'APlus', label: 'A+ (80-89)', name: 'Excellent' },
            { key: 'A', label: 'A (70-79)', name: 'Very Good' },
            { key: 'BPlus', label: 'B+ (60-69)', name: 'Good' },
            { key: 'B', label: 'B (55-59)', name: 'Above Avg' },
            { key: 'C', label: 'C (50-54)', name: 'Average' },
            { key: 'P', label: 'P (40-49)', name: 'Pass' },
            { key: 'F', label: 'F (<40)', name: 'Backlog (Fail)' }
        ];

        return gradesDef.map(g => {
            const row = { grade: g.label, desc: g.name };
            batchesToCompare.forEach(b => {
                row[`Batch ${b.batch}`] = b.grades?.[g.key] || 0;
            });
            return row;
        });
    }, [batchesToCompare]);

    // USN list management for comparator
    const handleAddUsn = (usnToAdd) => {
        let clean = (usnToAdd || usnInput).trim();
        if (!clean) return;

        // If user typed a search query that matches dropdown results and isn't a 10-char USN, use the active or first match
        if (!usnToAdd && studentSearchResults.length > 0 && clean.length >= 2 && !/^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/i.test(clean)) {
            const target = activeSearchIndex >= 0 && studentSearchResults[activeSearchIndex]
                ? studentSearchResults[activeSearchIndex]
                : studentSearchResults[0];
            clean = target.usn;
        }

        clean = clean.toUpperCase();
        if (usnList.includes(clean)) {
            setUsnInput('');
            setSearchDropdownOpen(false);
            setActiveSearchIndex(-1);
            setCheckedUsns(new Set());
            return;
        }
        setUsnList(prev => [...prev, clean]);
        setUsnInput('');
        setSearchDropdownOpen(false);
        setActiveSearchIndex(-1);
        setCheckedUsns(new Set());
    };

    // Add a single student without closing dropdown if closeDropdown is false (allows chaining multiple adds)
    const handleAddSingleStudent = (stu, closeDropdown = false) => {
        if (!stu || !stu.usn) return;
        const clean = stu.usn.toUpperCase();
        if (!usnList.includes(clean)) {
            setUsnList(prev => [...prev, clean]);
        }
        setCheckedUsns(prev => {
            if (!prev.has(clean)) return prev;
            const next = new Set(prev);
            next.delete(clean);
            return next;
        });
        if (closeDropdown) {
            setUsnInput('');
            setSearchDropdownOpen(false);
            setActiveSearchIndex(-1);
        }
    };

    const handleSelectStudent = (stu) => {
        if (!stu || !stu.usn) return;
        handleAddSingleStudent(stu, false);
    };

    // Multi-select checkbox toggle for search results
    const handleToggleCheckStudent = (usn) => {
        const clean = usn.toUpperCase();
        setCheckedUsns(prev => {
            const next = new Set(prev);
            if (next.has(clean)) {
                next.delete(clean);
            } else {
                next.add(clean);
            }
            return next;
        });
    };

    // Add all currently checked students to comparator
    const handleAddCheckedStudents = () => {
        if (checkedUsns.size === 0) return;
        const toAdd = Array.from(checkedUsns).filter(u => !usnList.includes(u));
        if (toAdd.length > 0) {
            setUsnList(prev => [...prev, ...toAdd]);
        }
        setCheckedUsns(new Set());
        setSearchDropdownOpen(false);
        setUsnInput('');
        setActiveSearchIndex(-1);
    };

    // Add all students in search results that are not yet added
    const handleAddAllSearchResults = () => {
        const toAdd = studentSearchResults
            .map(s => s.usn.toUpperCase())
            .filter(u => !usnList.includes(u));
        if (toAdd.length > 0) {
            setUsnList(prev => [...prev, ...toAdd]);
        }
        setCheckedUsns(new Set());
        setSearchDropdownOpen(false);
        setUsnInput('');
        setActiveSearchIndex(-1);
    };

    // Select or deselect all unadded students in current search results
    const handleToggleSelectAll = () => {
        const unadded = studentSearchResults.filter(s => !usnList.includes(s.usn.toUpperCase()));
        const allChecked = unadded.length > 0 && unadded.every(s => checkedUsns.has(s.usn.toUpperCase()));
        if (allChecked) {
            setCheckedUsns(new Set());
        } else {
            setCheckedUsns(new Set(unadded.map(s => s.usn.toUpperCase())));
        }
    };

    const handleRemoveUsn = (u) => setUsnList(prev => prev.filter(x => x !== u));

    // Click outside search dropdown listener
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchContainerRef.current && !searchContainerRef.current.contains(e.target)) {
                setSearchDropdownOpen(false);
                setActiveSearchIndex(-1);
                setCheckedUsns(new Set());
            }
        };
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setClassPickerOpen(false);
                setSearchDropdownOpen(false);
                setActiveSearchIndex(-1);
                setCheckedUsns(new Set());
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, []);

    // Toggle checking a student in the class roster picker
    const handleToggleCheckRosterStudent = useCallback((usn) => {
        if (!usn) return;
        const clean = usn.toUpperCase();
        setRosterCheckedUsns(prev => {
            const next = new Set(prev);
            if (next.has(clean)) {
                next.delete(clean);
            } else {
                next.add(clean);
            }
            return next;
        });
    }, []);

    // Toggle select all unadded students in current class roster view
    const handleToggleSelectAllRoster = useCallback((studentsInView) => {
        const unadded = (studentsInView || []).filter(s => !usnList.some(u => u.toUpperCase() === (s.usn || '').toUpperCase()));
        const allChecked = unadded.length > 0 && unadded.every(s => rosterCheckedUsns.has(s.usn.toUpperCase()));
        if (allChecked) {
            setRosterCheckedUsns(new Set());
        } else {
            setRosterCheckedUsns(new Set(unadded.map(s => s.usn.toUpperCase())));
        }
    }, [usnList, rosterCheckedUsns]);

    // Add all checked roster students to the comparator cohort
    const handleAddCheckedRosterStudents = useCallback(() => {
        if (rosterCheckedUsns.size === 0) return;
        const toAdd = Array.from(rosterCheckedUsns);
        setUsnList(prev => {
            const set = new Set(prev);
            toAdd.forEach(u => set.add(u.toUpperCase()));
            return Array.from(set);
        });
        setRosterCheckedUsns(new Set());
    }, [rosterCheckedUsns]);

    // Add entire class to the comparator cohort
    const handleAddAllClassStudents = useCallback((students = classRosterStudents) => {
        if (!students || students.length === 0) return;
        const toAdd = students.map(s => s.usn.toUpperCase());
        setUsnList(prev => {
            const set = new Set(prev);
            toAdd.forEach(u => set.add(u));
            return Array.from(set);
        });
        setRosterCheckedUsns(new Set());
    }, [classRosterStudents]);

    // Add top N rankers from this class section
    const handleAddTopRankersClass = useCallback((count = 5) => {
        if (!classRosterStudents || classRosterStudents.length === 0) return;
        const sorted = [...classRosterStudents].sort((a, b) => (b.cgpa || 0) - (a.cgpa || 0));
        const top = sorted.slice(0, count).map(s => s.usn.toUpperCase());
        setUsnList(prev => {
            const set = new Set(prev);
            top.forEach(u => set.add(u));
            return Array.from(set);
        });
        setRosterCheckedUsns(new Set());
    }, [classRosterStudents]);

    // Add remedial / at-risk students with backlogs from this class section
    const handleAddRemedialClass = useCallback(() => {
        if (!classRosterStudents || classRosterStudents.length === 0) return;
        const withBacklogs = classRosterStudents.filter(s => (s.total_backlogs || 0) > 0);
        const target = withBacklogs.length > 0 ? withBacklogs : [...classRosterStudents].sort((a, b) => (a.cgpa || 0) - (b.cgpa || 0)).slice(0, 5);
        const usns = target.map(s => s.usn.toUpperCase());
        setUsnList(prev => {
            const set = new Set(prev);
            usns.forEach(u => set.add(u));
            return Array.from(set);
        });
        setRosterCheckedUsns(new Set());
    }, [classRosterStudents]);

    // Fetch complete classes list from /api/classes
    const loadAllClasses = useCallback(async () => {
        setIsLoadingClasses(true);
        try {
            const res = await apiRequest('/api/classes', { cacheTtl: 30_000 });
            if (res?.classes && Array.isArray(res.classes) && res.classes.length > 0) {
                setAvailableClasses(res.classes);
                return res.classes;
            }
        } catch (err) {
            console.warn('Failed to fetch /api/classes, falling back to meta:', err);
        } finally {
            setIsLoadingClasses(false);
        }
        if (meta?.classes && meta.classes.length > 0) {
            setAvailableClasses(meta.classes);
            return meta.classes;
        }
        return [];
    }, [meta?.classes]);

    // Preload classes on mount
    useEffect(() => {
        loadAllClasses();
    }, [loadAllClasses]);

    // Complete deduplicated list of all institutional classes from /api/classes, meta, or classReport
    const allClassesList = useMemo(() => {
        const pool = [
            ...(availableClasses || []),
            ...(meta?.classes || []),
            ...(classReport?.classes || [])
        ];
        const seen = new Set();
        const list = [];
        for (const c of pool) {
            if (c && c.id && !seen.has(c.id)) {
                seen.add(c.id);
                list.push(c);
            }
        }
        return list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [availableClasses, meta?.classes, classReport?.classes]);

    // Load roster when class is picked in Class Picker
    const loadClassRoster = useCallback(async (cId) => {
        if (!cId) return;
        setIsLoadingRoster(true);
        setRosterCheckedUsns(new Set());
        try {
            const res = await apiRequest('/api/faculty/students', {
                query: { classId: cId, limit: 200, fresh: '1' }
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

    // Filtered roster students according to search query and filter mode
    const filteredRosterStudents = useMemo(() => {
        let list = filterAndRankStudents(classRosterStudents, rosterSearch);
        if (rosterFilterMode === 'unadded') {
            list = list.filter(s => !usnList.some(u => u.toUpperCase() === (s.usn || '').toUpperCase()));
        } else if (rosterFilterMode === 'added') {
            list = list.filter(s => usnList.some(u => u.toUpperCase() === (s.usn || '').toUpperCase()));
        }
        return list;
    }, [classRosterStudents, rosterSearch, rosterFilterMode, usnList]);

    const unaddedStudentsInView = useMemo(() => {
        return (filteredRosterStudents || []).filter(s => !usnList.some(u => u.toUpperCase() === (s.usn || '').toUpperCase()));
    }, [filteredRosterStudents, usnList]);

    const allEligibleChecked = unaddedStudentsInView.length > 0 && unaddedStudentsInView.every(s => rosterCheckedUsns.has(s.usn.toUpperCase()));

    // Synchronize selected class and load student roster when class picker opens or classes load
    useEffect(() => {
        if (classPickerOpen) {
            if (allClassesList.length === 0) {
                loadAllClasses();
            } else {
                const currentValid = selectedPickerClassId && allClassesList.some(c => c.id === selectedPickerClassId);
                const targetId = currentValid ? selectedPickerClassId : allClassesList[0].id;
                if (targetId !== selectedPickerClassId) {
                    setSelectedPickerClassId(targetId);
                }
                loadClassRoster(targetId);
            }
        }
    }, [classPickerOpen, allClassesList, selectedPickerClassId, loadClassRoster, loadAllClasses]);

    // Debounced live student search by name or USN
    useEffect(() => {
        const q = usnInput.trim();
        if (!q || q.length < 2) {
            setStudentSearchResults([]);
            setSearchDropdownOpen(false);
            setActiveSearchIndex(-1);
            return;
        }
        let active = true;
        const timer = setTimeout(async () => {
            setIsSearchingStudents(true);
            try {
                const res = await apiRequest('/api/faculty/students', {
                    query: { search: q, limit: 8 }
                });
                if (active) {
                    setStudentSearchResults(res?.students || []);
                    setSearchDropdownOpen(true);
                    setActiveSearchIndex(-1);
                }
            } catch (err) {
                console.error('Failed to search students for comparator:', err);
            } finally {
                if (active) setIsSearchingStudents(false);
            }
        }, 200);
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
                writeWorkbook(XLSX, wb, `Department_Overview_${branch}.xlsx`);
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
                        c.topper ? `${c.topper.name} (${c.topper.usn} - ${c.topper.cgpa ? `CGPA ${c.topper.cgpa}` : `SGPA ${c.topper.sgpa}`})` : '—'
                    ]);
                    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    XLSX.utils.book_append_sheet(wb, ws, 'Class Comparisons');
                    writeWorkbook(XLSX, wb, `Class_Comparison_Report.xlsx`);
                } else if (compareMode === 'batches') {
                    const bList = classReport?.batchesComparison || [];
                    if (bList.length === 0) {
                        alert('No batch comparison data available to export.');
                        return;
                    }
                    const headers = ['Graduation Batch', 'Class Count', 'Total Enrolled', 'Cohort Appeared', 'Passed', 'Failed', 'Pass Rate %', 'Mean SGPA', 'Distinctions', 'Backlogs', 'Cohort Topper'];
                    const rows = bList.map(b => [
                        `Batch ${b.batch}`,
                        b.classCount,
                        b.enrolledCount,
                        b.appeared,
                        b.passed,
                        b.failed,
                        `${b.passRate}%`,
                        b.avgSGPA,
                        b.distinctionCount,
                        b.backlogCount,
                        b.topper ? (b.topper.label || `${b.topper.name} (${b.topper.cgpa || b.topper.sgpa})`) : '—'
                    ]);
                    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                    XLSX.utils.book_append_sheet(wb, ws, 'Batch Cohorts');
                    writeWorkbook(XLSX, wb, `Batch_Cohort_Comparison.xlsx`);
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
                    writeWorkbook(XLSX, wb, `Section_Comparison_${branch}_Sem${semester}.xlsx`);
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

                writeWorkbook(XLSX, wb, `Student_Comparison_Report.xlsx`);
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
                        c.topper ? `${c.topper.name} (${c.topper.cgpa ? `${c.topper.cgpa} CGPA` : `${c.topper.sgpa} SGPA`})` : '—'
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
                } else if (compareMode === 'batches') {
                    const bList = classReport?.batchesComparison || [];
                    if (bList.length === 0) {
                        alert('No batch comparison data available to download.');
                        return;
                    }
                    doc.setFontSize(14);
                    doc.setFont('helvetica', 'bold');
                    doc.text(`Institutional Batch Cohort Benchmarking Report`, 14, 15);

                    doc.setFontSize(9);
                    doc.setFont('helvetica', 'normal');
                    doc.text(`Generated: ${new Date().toLocaleDateString()} | Cohorts Evaluated: ${bList.length}`, 14, 21);

                    const tableHead = [['Graduation Batch', 'Classes', 'Enrolled', 'Appeared', 'Passed', 'Pass Rate %', 'Mean SGPA', 'Distinctions', 'Backlogs', 'Cohort Topper']];
                    const tableBody = bList.map(b => [
                        `Batch ${b.batch}`,
                        b.classCount,
                        b.enrolledCount,
                        b.appeared,
                        b.passed,
                        `${b.passRate}%`,
                        b.avgSGPA,
                        b.distinctionCount,
                        b.backlogCount,
                        b.topper ? (b.topper.label || `${b.topper.name} (${b.topper.cgpa || b.topper.sgpa})`) : '—'
                    ]);

                    autoTable(doc, {
                        head: tableHead,
                        body: tableBody,
                        startY: 25,
                        theme: 'striped',
                        styles: { fontSize: 8, cellPadding: 2 },
                        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                    });

                    doc.save(`Batch_Cohort_Comparison.pdf`);
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
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up" suppressHydrationWarning>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Comparative Analytics</PageHeaderEyebrow>
                    <PageHeaderTitle>Performance Comparison</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Department trends, class benchmarks, section comparisons, and student trajectory analysis.
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

            {/* Unified Intelligence Navigation Bar */}
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
                flexWrap: 'wrap',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                {[
                    { id: 'classes', label: 'Class-to-Class Comparison', icon: 'groups', tab: 'sections', mode: 'classes' },
                    { id: 'batches', label: 'Batch Cohorts', icon: 'school', tab: 'sections', mode: 'batches' },
                    { id: 'sections', label: 'Section Benchmarking', icon: 'view_column', tab: 'sections', mode: 'sections' },
                    { id: 'department', label: 'Department Trends', icon: 'domain', tab: 'department', mode: null },
                    { id: 'compare', label: 'Student Comparator', icon: 'compare_arrows', tab: 'compare', mode: null }
                ].map(item => {
                    const isActive = viewTab === 'sections'
                        ? (compareMode === item.mode)
                        : (viewTab === item.tab);
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => {
                                setViewTab(item.tab);
                                if (item.mode) setCompareMode(item.mode);
                            }}
                            style={{
                                padding: '10px 18px',
                                borderRadius: '9px',
                                border: 'none',
                                background: isActive ? 'var(--primary)' : 'transparent',
                                color: isActive ? '#FFFFFF' : 'var(--tx-muted)',
                                fontWeight: 700,
                                fontSize: '13px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>{item.icon}</span>
                            {item.label}
                        </button>
                    );
                })}
            </div>

            {/* TAB: CLASS & SECTION COMPARISON (viewTab === 'sections') */}
            {viewTab === 'sections' && (
                <>

                    {/* SUB-VIEW 1: CLASS-TO-CLASS COMPARISON */}
                    {compareMode === 'classes' && (
                        <>
                            {/* Class Filters Bar */}
                            <Card style={{ marginBottom: '20px' }}>
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
                                                { value: 'ALL', label: 'All Batches (Cross-Batch)' },
                                                ...(meta.batches || []).map(b => ({ value: b, label: `Batch ${b}` }))
                                            ]}
                                        />

                                        <Select
                                            label="Semester"
                                            value={classSemester}
                                            onChange={e => setClassSemester(e.target.value)}
                                            options={[
                                                { value: 'ALL', label: 'All Semesters (Compare All Classes)' },
                                                ...(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => {
                                                    const count = activeClassesPerSemester[s];
                                                    return {
                                                        value: String(s),
                                                        label: count ? `Semester ${s} (${count} Class${count > 1 ? 'es' : ''} Active)` : `Semester ${s}`
                                                    };
                                                })
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

                            {/* Interactive Class Comparison Selector Strip */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '10px',
                                marginBottom: '20px',
                                padding: '12px 18px',
                                background: 'var(--surface-low)',
                                borderRadius: '10px',
                                border: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>checklist</span>
                                        Comparing {selectedClassIds.length > 0 ? `${selectedClassIds.length} Selected Classes` : `All ${filteredClassesList.length} Filtered Classes`}:
                                    </span>
                                    {selectedClassIds.length > 0 ? (
                                        selectedClassIds.map(id => {
                                            const cls = (classReport?.classes || []).find(c => c.id === id);
                                            if (!cls) return null;
                                            return (
                                                <span key={id} style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    background: 'rgba(99, 102, 241, 0.1)',
                                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                                    color: 'var(--primary)',
                                                    fontSize: '11px',
                                                    fontWeight: 800
                                                }}>
                                                    {cls.name} {cls.sectionLetter && cls.sectionLetter !== '—' ? `(${cls.sectionLetter})` : ''}
                                                    <button
                                                        type="button"
                                                        onClick={() => toggleClassSelection(id)}
                                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex', alignItems: 'center' }}
                                                        title="Remove from comparison"
                                                    >
                                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                                                    </button>
                                                </span>
                                            );
                                        })
                                    ) : (
                                        <span style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>
                                            (Tip: Check individual classes in the matrix table below to compare specific classes side-by-side)
                                        </span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {filteredClassesList.length > 0 && selectedClassIds.length < filteredClassesList.length && (
                                        <button
                                            type="button"
                                            onClick={selectAllFilteredClasses}
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                cursor: 'pointer',
                                                color: 'var(--tx-main)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>select_all</span>
                                            Select All ({filteredClassesList.length})
                                        </button>
                                    )}
                                    {selectedClassIds.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={clearClassSelection}
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                                background: 'rgba(239, 68, 68, 0.08)',
                                                cursor: 'pointer',
                                                color: '#DC2626',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>restart_alt</span>
                                            Reset to All
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Class KPIs */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Top Performing Class</div>
                                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#16A34A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {comparisonBenchmarks.bestClass ? comparisonBenchmarks.bestClass.name : '—'}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            {comparisonBenchmarks.bestClass ? `${comparisonBenchmarks.bestClass.passRate}% Pass • SGPA ${comparisonBenchmarks.bestClass.avgSGPA}` : 'No evaluated class'}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Benchmark Mean SGPA</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>
                                            {comparisonBenchmarks.benchmarkAvgSGPA.toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Compared cohort baseline</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Class Disparity / Variance</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            {comparisonBenchmarks.passRateSpread.toFixed(1)}%
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            SGPA spread: {comparisonBenchmarks.sgpaSpread.toFixed(2)} pts
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Classes Evaluated</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            {classesToCompare.length}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            {selectedClassIds.length > 0 ? `${selectedClassIds.length} of ${filteredClassesList.length} classes chosen` : `${comparisonBenchmarks.totalEnrolled} total enrolled students`}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Accurate, High-Fidelity Performance Visualizer & Histograms */}
                            {classesToCompare.length > 0 && (
                                <Card style={{ marginBottom: '24px' }}>
                                    <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                        <div>
                                            <CardTitle>Comparative Class Performance &amp; Grade Spread</CardTitle>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                {classChartType === 'benchmark' && 'Cross-class Mean SGPA & Pass Rate comparison with exact value metrics'}
                                                {classChartType === 'histogram' && 'VTU NEP Grade Distribution Histogram (O to F Backlogs) across compared classes'}
                                                {classChartType === 'classification' && 'Institutional Academic Standing spread (Distinction, 1st Class, 2nd Class, Pass, Backlogs)'}
                                            </div>
                                        </div>

                                        {/* Chart Type Switcher */}
                                        <div style={{
                                            display: 'flex',
                                            flexWrap: 'wrap',
                                            gap: '4px',
                                            background: 'var(--surface-low)',
                                            padding: '4px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)'
                                        }}>
                                            <button
                                                type="button"
                                                onClick={() => setClassChartType('benchmark')}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: classChartType === 'benchmark' ? 'var(--primary)' : 'transparent',
                                                    color: classChartType === 'benchmark' ? '#FFFFFF' : 'var(--tx-muted)',
                                                    fontWeight: 800,
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>bar_chart</span>
                                                Benchmark
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setClassChartType('histogram')}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: classChartType === 'histogram' ? 'var(--primary)' : 'transparent',
                                                    color: classChartType === 'histogram' ? '#FFFFFF' : 'var(--tx-muted)',
                                                    fontWeight: 800,
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>leaderboard</span>
                                                Grade Histogram
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setClassChartType('classification')}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: classChartType === 'classification' ? 'var(--primary)' : 'transparent',
                                                    color: classChartType === 'classification' ? '#FFFFFF' : 'var(--tx-muted)',
                                                    fontWeight: 800,
                                                    fontSize: '11px',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>pie_chart</span>
                                                Classification
                                            </button>
                                        </div>
                                    </CardHeader>
                                    <CardContent style={{ padding: '20px' }}>
                                        {classChartType === 'benchmark' && (
                                            <div style={{ height: '360px', width: '100%' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <ComposedChart data={classesToCompare} margin={{ top: 35, right: 35, left: 10, bottom: 65 }}>
                                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                        <XAxis dataKey="shortName" interval={0} angle={-15} textAnchor="end" height={60} tick={{ fontSize: 11, fill: 'var(--tx-main)', fontWeight: 600 }} />
                                                        <YAxis yAxisId="left" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                                                        <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fontSize: 11 }} />
                                                        <Tooltip content={<CustomBenchmarkTooltip />} />
                                                        <Legend verticalAlign="top" align="right" height={36} wrapperStyle={{ paddingBottom: '12px' }} />
                                                        <Bar yAxisId="left" dataKey="passRate" name="Pass Rate (%)" fill="#6366F1" radius={[4, 4, 0, 0]}>
                                                            <LabelList dataKey="passRate" position="insideTop" offset={10} formatter={v => typeof v === 'number' ? `${v}%` : ''} fill="#FFFFFF" fontSize={11} fontWeight={800} />
                                                        </Bar>
                                                        <Line yAxisId="right" type="monotone" dataKey="avgSGPA" name="Mean SGPA" stroke="#10B981" strokeWidth={3} dot={{ r: 6, fill: '#10B981' }}>
                                                            <LabelList dataKey="avgSGPA" position="top" offset={12} formatter={v => typeof v === 'number' && v > 0 ? `${v}` : ''} fill="#10B981" fontSize={11} fontWeight={800} />
                                                        </Line>
                                                    </ComposedChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}

                                        {classChartType === 'histogram' && (
                                            <div style={{ height: '360px', width: '100%' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={classGradeHistogramData} margin={{ top: 35, right: 35, left: 10, bottom: 40 }}>
                                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                        <XAxis dataKey="grade" tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--tx-main)' }} />
                                                        <YAxis tick={{ fontSize: 11 }} />
                                                        <Tooltip content={<CustomHistogramTooltip />} />
                                                        <Legend verticalAlign="top" align="right" height={36} wrapperStyle={{ paddingBottom: '12px' }} />
                                                        {classesToCompare.map((c, idx) => (
                                                            <Bar key={c.id} dataKey={c.shortName || c.name} fill={getStudentColor(idx)} radius={[4, 4, 0, 0]}>
                                                                {classesToCompare.length <= 4 && (
                                                                    <LabelList dataKey={c.shortName || c.name} position="top" formatter={v => v > 0 ? v : ''} fill="var(--tx-main)" fontSize={10} fontWeight={700} />
                                                                )}
                                                            </Bar>
                                                        ))}
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}

                                        {classChartType === 'classification' && (
                                            <div style={{ height: '360px', width: '100%' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={classesToCompare} margin={{ top: 25, right: 35, left: 10, bottom: 65 }}>
                                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                        <XAxis dataKey="shortName" interval={0} angle={-15} textAnchor="end" height={60} tick={{ fontSize: 11, fill: 'var(--tx-main)', fontWeight: 600 }} />
                                                        <YAxis tick={{ fontSize: 11 }} />
                                                        <Tooltip content={<CustomClassificationTooltip />} />
                                                        <Legend verticalAlign="top" height={36} />
                                                        <Bar dataKey="distinctionCount" name="Distinction (≥7.75)" stackId="a" fill="#10B981" />
                                                        <Bar dataKey="firstClassCount" name="First Class (6.75-7.74)" stackId="a" fill="#3B82F6" />
                                                        <Bar dataKey="secondClassCount" name="Second Class (5.0-6.74)" stackId="a" fill="#F59E0B" />
                                                        <Bar dataKey="passClassCount" name="Pass Class (4.0-4.99)" stackId="a" fill="#64748B" />
                                                        <Bar dataKey="backlogCount" name="Backlogs / Arrears (<4.0)" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Class Performance Matrix */}
                            <Card style={{ marginBottom: '24px' }}>
                                <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    <div>
                                        <CardTitle>Institutional Class Performance Matrix</CardTitle>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                            Select classes using the checkboxes or '+ Compare' button to benchmark specific cohorts side-by-side.
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        {selectedClassIds.length > 0 ? (
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', background: 'rgba(99, 102, 241, 0.1)', padding: '4px 10px', borderRadius: '6px' }}>
                                                {selectedClassIds.length} of {filteredClassesList.length} Active in Comparison
                                            </span>
                                        ) : (
                                            <span style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>
                                                All {filteredClassesList.length} Active in Comparison
                                            </span>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent style={{ padding: 0 }}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                                    <th style={{ padding: '12px 14px', width: '38px', textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={filteredClassesList.length > 0 && selectedClassIds.length === filteredClassesList.length}
                                                            onChange={e => e.target.checked ? selectAllFilteredClasses() : clearClassSelection()}
                                                            title="Select all classes for comparison"
                                                            style={{ cursor: 'pointer' }}
                                                        />
                                                    </th>
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
                                                        <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                            Analyzing institutional classes data...
                                                        </td>
                                                    </tr>
                                                ) : filteredClassesList.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={12} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                                            No classes match the selected filter criteria.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    filteredClassesList.map(c => {
                                                        const isExpanded = expandedClassId === c.id;
                                                        const isSelected = selectedClassIds.includes(c.id);
                                                        return (
                                                            <tr key={c.id} style={{
                                                                borderBottom: '1px solid var(--border)',
                                                                background: isSelected ? 'rgba(99, 102, 241, 0.03)' : 'transparent',
                                                                transition: 'background 0.15s ease'
                                                            }}>
                                                                <td style={{ padding: '14px 14px', textAlign: 'center' }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isSelected}
                                                                        onChange={() => toggleClassSelection(c.id)}
                                                                        style={{ cursor: 'pointer' }}
                                                                    />
                                                                </td>
                                                                <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span>{c.name}</span>
                                                                        {c.sectionLetter && c.sectionLetter !== '—' && (
                                                                            <span style={{ fontSize: '10px', background: 'var(--primary-low)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                                                Sec {c.sectionLetter}
                                                                            </span>
                                                                        )}
                                                                        {isSelected && (
                                                                            <span style={{ fontSize: '10px', background: 'var(--primary)', color: '#FFFFFF', padding: '1px 5px', borderRadius: '3px', fontWeight: 800 }}>
                                                                                COMPARING
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
                                                                            <span style={{ marginLeft: '4px', color: 'var(--primary)', fontWeight: 800 }}>
                                                                                ({c.topper.cgpa ? `${c.topper.cgpa} CGPA` : `${c.topper.sgpa} SGPA`})
                                                                            </span>
                                                                        </div>
                                                                    ) : '—'}
                                                                </td>
                                                                <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => toggleClassSelection(c.id)}
                                                                            style={{
                                                                                padding: '4px 10px',
                                                                                borderRadius: '6px',
                                                                                border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                                                background: isSelected ? 'var(--primary)' : 'var(--surface-low)',
                                                                                color: isSelected ? '#FFFFFF' : 'var(--primary)',
                                                                                fontSize: '11px',
                                                                                fontWeight: 800,
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            {isSelected ? '✓ In Compare' : '+ Compare'}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setExpandedClassId(isExpanded ? null : c.id)}
                                                                            style={{
                                                                                padding: '4px 10px',
                                                                                borderRadius: '6px',
                                                                                border: '1px solid var(--border)',
                                                                                background: 'var(--surface-low)',
                                                                                color: 'var(--tx-muted)',
                                                                                fontSize: '11px',
                                                                                fontWeight: 700,
                                                                                cursor: 'pointer'
                                                                            }}
                                                                        >
                                                                            {isExpanded ? 'Hide' : 'Details'}
                                                                        </button>
                                                                    </div>
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
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(180px, 100%), 1fr))', gap: '16px', marginBottom: '20px' }}>
                                                <div style={{ background: 'var(--surface-low)', padding: '12px 16px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', fontWeight: 800 }}>Faculty In Charge</div>
                                                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', marginTop: '4px' }}>{expClass.facultyName}</div>
                                                    {expClass.facultyEmail && <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{expClass.facultyEmail}</div>}
                                                </div>
                                                <div style={{ background: 'var(--surface-low)', padding: '12px 16px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', fontWeight: 800 }}>Distinctions (≥7.75)</div>
                                                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#16A34A', marginTop: '4px' }}>{expClass.distinctionCount}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{pct(expClass.distinctionCount, expClass.appeared)}% of evaluated</div>
                                                </div>
                                                <div style={{ background: 'var(--surface-low)', padding: '12px 16px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', fontWeight: 800 }}>First Class (6.75 - 7.74)</div>
                                                    <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--primary)', marginTop: '4px' }}>{expClass.firstClassCount}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{pct(expClass.firstClassCount, expClass.appeared)}% of evaluated</div>
                                                </div>
                                                <div style={{ background: 'var(--surface-low)', padding: '12px 16px', borderRadius: '8px' }}>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', fontWeight: 800 }}>Backlog Arrears</div>
                                                    <div style={{ fontSize: '20px', fontWeight: 900, color: '#DC2626', marginTop: '4px' }}>{expClass.backlogCount}</div>
                                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{pct(expClass.backlogCount, expClass.appeared)}% of evaluated</div>
                                                </div>
                                            </div>

                                            {/* Subject Performance breakdown inside class */}
                                            {(expClass.subjectSummary || []).length > 0 && (
                                                <div>
                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '10px' }}>
                                                        Subject Breakdown for {expClass.name}
                                                    </div>
                                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '10px' }}>
                                                        {expClass.subjectSummary.map(sub => (
                                                            <div key={sub.code} style={{ background: 'var(--surface-low)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontWeight: 800, fontSize: '12px', color: 'var(--tx-main)' }}>{sub.code}</span>
                                                                    <span style={{ fontWeight: 800, fontSize: '12px', color: sub.passRate >= 70 ? '#16A34A' : '#DC2626' }}>{sub.passRate}% Pass</span>
                                                                </div>
                                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {sub.name}
                                                                </div>
                                                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                                                                    <span>Appeared: {sub.appeared}</span>
                                                                    <span>Avg Marks: {sub.avgMarks}</span>
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

                    {/* SUB-VIEW 2: BATCH COHORT COMPARISON */}
                    {compareMode === 'batches' && (
                        <>
                            {/* Batch Selection Strip */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '10px',
                                marginBottom: '20px',
                                padding: '12px 18px',
                                background: 'var(--surface-low)',
                                borderRadius: '10px',
                                border: '1px solid var(--border)'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>history_edu</span>
                                        Comparing Graduation Cohorts ({batchesToCompare.length} Batches Active):
                                    </span>
                                    {batchesList.map(b => {
                                        const isSelected = selectedBatchesForCompare.length === 0 || selectedBatchesForCompare.includes(b.batch);
                                        return (
                                            <button
                                                key={b.batch}
                                                type="button"
                                                onClick={() => toggleBatchSelection(b.batch)}
                                                style={{
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                    background: isSelected ? 'var(--primary)' : 'var(--surface)',
                                                    color: isSelected ? '#FFFFFF' : 'var(--tx-muted)',
                                                    fontSize: '11px',
                                                    fontWeight: 800,
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}
                                            >
                                                Batch {b.batch}
                                                <span style={{ opacity: 0.8, fontSize: '10px' }}>({b.appeared} stu)</span>
                                            </button>
                                        );
                                    })}
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {selectedBatchesForCompare.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={clearBatchSelection}
                                            style={{
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                cursor: 'pointer',
                                                color: 'var(--tx-main)'
                                            }}
                                        >
                                            Compare All Batches
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Batch KPIs */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Top Performing Batch</div>
                                        <div style={{ fontSize: '24px', fontWeight: 900, color: '#16A34A' }}>
                                            {batchComparisonBenchmarks.bestBatch ? `Batch ${batchComparisonBenchmarks.bestBatch.batch}` : '—'}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            {batchComparisonBenchmarks.bestBatch ? `${batchComparisonBenchmarks.bestBatch.passRate}% Pass • SGPA ${batchComparisonBenchmarks.bestBatch.avgSGPA}` : 'No cohort data'}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Institutional Benchmark SGPA</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>
                                            {batchComparisonBenchmarks.benchmarkAvgSGPA.toFixed(2)}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Cross-cohort baseline</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Cohort Pass Spread</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            {batchComparisonBenchmarks.passRateSpread.toFixed(1)}%
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Min-to-max pass disparity</div>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Batches Evaluated</div>
                                        <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            {batchesToCompare.length}
                                        </div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            {batchComparisonBenchmarks.totalAppeared} total students evaluated
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Batch Visual Comparison Chart */}
                            {batchesToCompare.length > 0 && (
                                <Card style={{ marginBottom: '24px' }}>
                                    <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                        <div>
                                            <CardTitle>Batch Cohort Benchmarks &amp; Grade Curves</CardTitle>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                {batchChartType === 'benchmark' && 'Cross-batch Pass Rate and Mean SGPA progression over academic years'}
                                                {batchChartType === 'histogram' && 'VTU NEP Grade Distribution Histogram across graduation cohorts'}
                                                {batchChartType === 'classification' && 'Academic standing category distribution across cohorts'}
                                            </div>
                                        </div>
                                        <div style={{
                                            display: 'flex',
                                            gap: '4px',
                                            background: 'var(--surface-low)',
                                            padding: '4px',
                                            borderRadius: '8px',
                                            border: '1px solid var(--border)'
                                        }}>
                                            <button
                                                type="button"
                                                onClick={() => setBatchChartType('benchmark')}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: batchChartType === 'benchmark' ? 'var(--primary)' : 'transparent',
                                                    color: batchChartType === 'benchmark' ? '#FFFFFF' : 'var(--tx-muted)',
                                                    fontWeight: 800,
                                                    fontSize: '11px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Benchmark
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setBatchChartType('histogram')}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: batchChartType === 'histogram' ? 'var(--primary)' : 'transparent',
                                                    color: batchChartType === 'histogram' ? '#FFFFFF' : 'var(--tx-muted)',
                                                    fontWeight: 800,
                                                    fontSize: '11px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Grade Histogram
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setBatchChartType('classification')}
                                                style={{
                                                    padding: '6px 12px',
                                                    borderRadius: '6px',
                                                    border: 'none',
                                                    background: batchChartType === 'classification' ? 'var(--primary)' : 'transparent',
                                                    color: batchChartType === 'classification' ? '#FFFFFF' : 'var(--tx-muted)',
                                                    fontWeight: 800,
                                                    fontSize: '11px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Classification
                                            </button>
                                        </div>
                                    </CardHeader>
                                    <CardContent style={{ padding: '20px' }}>
                                        {batchChartType === 'benchmark' && (
                                            <div style={{ height: '340px', width: '100%' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <ComposedChart data={batchesToCompare} margin={{ top: 35, right: 35, left: 10, bottom: 40 }}>
                                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                        <XAxis dataKey="batch" tickFormatter={b => `Batch ${b}`} tick={{ fontSize: 12, fontWeight: 800, fill: 'var(--tx-main)' }} />
                                                        <YAxis yAxisId="left" domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} />
                                                        <YAxis yAxisId="right" orientation="right" domain={[0, 10]} tick={{ fontSize: 11 }} />
                                                        <Tooltip content={<CustomBenchmarkTooltip />} />
                                                        <Legend verticalAlign="top" align="right" height={36} wrapperStyle={{ paddingBottom: '12px' }} />
                                                        <Bar yAxisId="left" dataKey="passRate" name="Pass Rate (%)" fill="#6366F1" radius={[4, 4, 0, 0]}>
                                                            <LabelList dataKey="passRate" position="insideTop" offset={10} formatter={v => `${v}%`} fill="#FFFFFF" fontSize={11} fontWeight={800} />
                                                        </Bar>
                                                        <Line yAxisId="right" type="monotone" dataKey="avgSGPA" name="Mean SGPA" stroke="#10B981" strokeWidth={3} dot={{ r: 6, fill: '#10B981' }}>
                                                            <LabelList dataKey="avgSGPA" position="top" offset={12} formatter={v => `${v}`} fill="#10B981" fontSize={11} fontWeight={800} />
                                                        </Line>
                                                    </ComposedChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}

                                        {batchChartType === 'histogram' && (
                                            <div style={{ height: '340px', width: '100%' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={batchGradeHistogramData} margin={{ top: 35, right: 35, left: 10, bottom: 40 }}>
                                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                        <XAxis dataKey="grade" tick={{ fontSize: 11, fontWeight: 700, fill: 'var(--tx-main)' }} />
                                                        <YAxis tick={{ fontSize: 11 }} />
                                                        <Tooltip content={<CustomHistogramTooltip />} />
                                                        <Legend verticalAlign="top" align="right" height={36} wrapperStyle={{ paddingBottom: '12px' }} />
                                                        {batchesToCompare.map((b, idx) => (
                                                            <Bar key={b.batch} dataKey={`Batch ${b.batch}`} fill={getStudentColor(idx)} radius={[4, 4, 0, 0]}>
                                                                <LabelList dataKey={`Batch ${b.batch}`} position="top" formatter={v => v > 0 ? v : ''} fill="var(--tx-main)" fontSize={10} fontWeight={700} />
                                                            </Bar>
                                                        ))}
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}

                                        {batchChartType === 'classification' && (
                                            <div style={{ height: '340px', width: '100%' }}>
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart data={batchesToCompare} margin={{ top: 25, right: 35, left: 10, bottom: 40 }}>
                                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                        <XAxis dataKey="batch" tickFormatter={b => `Batch ${b}`} tick={{ fontSize: 12, fontWeight: 800, fill: 'var(--tx-main)' }} />
                                                        <YAxis tick={{ fontSize: 11 }} />
                                                        <Tooltip content={<CustomClassificationTooltip />} />
                                                        <Legend verticalAlign="top" height={36} />
                                                        <Bar dataKey="distinctionCount" name="Distinction (≥7.75)" stackId="a" fill="#10B981" />
                                                        <Bar dataKey="firstClassCount" name="First Class (6.75-7.74)" stackId="a" fill="#3B82F6" />
                                                        <Bar dataKey="secondClassCount" name="Second Class (5.0-6.74)" stackId="a" fill="#F59E0B" />
                                                        <Bar dataKey="passClassCount" name="Pass Class (4.0-4.99)" stackId="a" fill="#64748B" />
                                                        <Bar dataKey="backlogCount" name="Backlogs (<4.0)" stackId="a" fill="#EF4444" radius={[4, 4, 0, 0]} />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            )}

                            {/* Batch Cohort Performance Matrix */}
                            <Card style={{ marginBottom: '24px' }}>
                                <CardHeader>
                                    <CardTitle>Institutional Batch Cohort Performance Matrix</CardTitle>
                                </CardHeader>
                                <CardContent style={{ padding: 0 }}>
                                    <div style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                            <thead>
                                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                                    <th style={{ padding: '12px 16px' }}>Graduation Batch</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Class Count</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Total Enrolled</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Cohort Appeared</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Mean SGPA</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Pass Rate %</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Distinctions</th>
                                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Backlogs</th>
                                                    <th style={{ padding: '12px 16px' }}>Cohort Topper</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {batchesToCompare.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                                            No cohort records available for comparison.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    batchesToCompare.map(b => (
                                                        <tr key={b.batch} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '14px 16px', fontWeight: 900, color: 'var(--tx-main)', fontSize: '14px' }}>
                                                                Batch {b.batch}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                                {b.classCount}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                                {b.enrolledCount}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                                {b.appeared}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>
                                                                {b.avgSGPA.toFixed(2)}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: b.passRate >= 70 ? '#16A34A' : '#DC2626' }}>
                                                                {b.passRate.toFixed(1)}%
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                                {b.distinctionCount}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: b.backlogCount > 0 ? '#DC2626' : '#16A34A' }}>
                                                                {b.backlogCount}
                                                            </td>
                                                            <td style={{ padding: '14px 16px', fontSize: '12px' }}>
                                                                {b.topper ? (
                                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                            <span style={{ fontSize: '13px' }}>🏆</span>
                                                                            <span style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{b.topper.name}</span>
                                                                            <span style={{
                                                                                fontSize: '10px',
                                                                                fontWeight: 800,
                                                                                padding: '2px 6px',
                                                                                borderRadius: '4px',
                                                                                background: 'rgba(16, 185, 129, 0.12)',
                                                                                color: '#059669',
                                                                                border: '1px solid rgba(16, 185, 129, 0.25)'
                                                                            }}>
                                                                                {b.topper.cgpa ? `${b.topper.cgpa} CGPA` : `${b.topper.sgpa} SGPA`}
                                                                            </span>
                                                                        </div>
                                                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>
                                                                            {b.topper.usn} • Cumulative Rank 1
                                                                            {b.semesterLeader && b.semesterLeader.usn !== b.topper.usn && (
                                                                                <span style={{ marginLeft: '6px', color: 'var(--tx-muted)' }} title={`Semester Peak: ${b.semesterLeader.name} (${b.semesterLeader.sgpa} SGPA · Sem ${b.semesterLeader.semester})`}>
                                                                                    (Peak Sem: {b.semesterLeader.sgpa})
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ) : '—'}
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </CardContent>
                            </Card>
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
                                            {sectionReport?.message || `No evaluation records for ${branch} in Semester ${semester}`}
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>
                                            {sectionReport?.sections?.length === 1 
                                                ? `Only Section ${sectionReport.sections[0]} is registered for this cohort. Benchmarking against Department Baseline is active.`
                                                : sectionReport?.sections?.length === 0 
                                                    ? 'No evaluation records found for this cohort in this semester.'
                                                    : `Active evaluated data is available in Semester 6.`}
                                        </div>
                                    </div>
                                    {semester !== 6 && (
                                        <Button
                                            variant="primary"
                                            onClick={() => setSemester(6)}
                                            style={{ fontSize: '12px', padding: '8px 14px' }}
                                        >
                                            Switch to Semester 6
                                        </Button>
                                    )}
                                </div>
                            )}

                            {/* Single Section Context & Mode Switcher */}
                            {sectionReport?.isSingleSection && (
                                <div style={{
                                    background: 'var(--surface-low)',
                                    border: '1px solid var(--border)',
                                    borderLeft: '4px solid var(--primary)',
                                    borderRadius: '8px',
                                    padding: '16px 20px',
                                    marginBottom: '20px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '14px'
                                }}>
                                    <div>
                                        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span>🏛️ Active Class: {sectionReport?.classes?.[0]?.name || `Section ${sectionReport?.singleSectionName}`}</span>
                                            <span style={{ fontSize: '11px', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                                                Section {sectionReport?.singleSectionName} ({sectionReport?.sectionComparisons?.[0]?.enrolled || 86} Students)
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '13px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                            {sectionMode === 'split' 
                                                ? 'Displaying Smart Cohort Split: Cohort partitioned into Section A and Section B by roll number order.' 
                                                : `Currently benchmarked against Department Cohort Baseline. To create a dedicated Section B, add a class in Class Management or toggle Smart Split.`}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-dim)' }}>View Mode:</span>
                                        <div style={{ display: 'inline-flex', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px' }}>
                                            <button
                                                onClick={() => setSectionMode('auto')}
                                                style={{
                                                    padding: '6px 12px',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    background: sectionMode !== 'split' ? 'var(--primary)' : 'transparent',
                                                    color: sectionMode !== 'split' ? '#fff' : 'var(--tx-muted)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                🏛️ Section vs Baseline
                                            </button>
                                            <button
                                                onClick={() => setSectionMode('split')}
                                                style={{
                                                    padding: '6px 12px',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    border: 'none',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    background: sectionMode === 'split' ? 'var(--primary)' : 'transparent',
                                                    color: sectionMode === 'split' ? '#fff' : 'var(--tx-muted)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                🔀 Smart Split (Sec A & B)
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Semester Advice for Ongoing Semester 7 */}
                            {semester === 7 && (
                                <div style={{
                                    background: 'rgba(59, 130, 246, 0.08)',
                                    border: '1px solid rgba(59, 130, 246, 0.25)',
                                    borderLeft: '4px solid #3B82F6',
                                    borderRadius: '8px',
                                    padding: '12px 18px',
                                    marginBottom: '20px',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    flexWrap: 'wrap',
                                    gap: '12px'
                                }}>
                                    <div style={{ fontSize: '13px', color: 'var(--tx-main)' }}>
                                        <strong>💡 Semester 7 is currently ongoing:</strong> Full evaluated examination results with complete subject performance for this cohort are in <strong>Semester 6 (85 Students Evaluated)</strong>.
                                    </div>
                                    <Button
                                        variant="primary"
                                        onClick={() => setSemester(6)}
                                        style={{ fontSize: '12px', padding: '6px 14px', background: '#3B82F6' }}
                                    >
                                        👉 View Semester 6 Full Records (85 Students)
                                    </Button>
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
                                                <ComposedChart data={sectionReport?.sectionComparisons || []} margin={{ top: 25, right: 30, left: 10, bottom: 20 }}>
                                                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                                    <XAxis dataKey="sectionName" />
                                                    <YAxis yAxisId="left" domain={[0, 100]} unit="%" />
                                                    <YAxis yAxisId="right" orientation="right" domain={[0, 10]} />
                                                    <Tooltip />
                                                    <Legend verticalAlign="top" align="right" height={36} wrapperStyle={{ paddingBottom: '12px' }} />
                                                    <Bar yAxisId="left" dataKey="passRate" name="Pass Rate (%)" fill="#6366F1" radius={[4, 4, 0, 0]}>
                                                        <LabelList dataKey="passRate" position="insideTop" offset={10} formatter={(val) => typeof val === 'number' && val > 0 ? `${val}%` : ''} fill="#FFFFFF" fontSize={11} fontWeight={700} />
                                                    </Bar>
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
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                    <span>{s.sectionName || `Section ${s.section}`}</span>
                                                                    {s.isBaseline && (
                                                                        <span style={{ fontSize: '10px', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '10px', fontWeight: 800 }}>
                                                                            BASELINE
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {s.className && !s.isBaseline && (
                                                                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 500, marginTop: '2px' }}>
                                                                        {s.className}
                                                                    </div>
                                                                )}
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
                    <Card style={{ marginBottom: '24px', position: 'relative', overflow: 'visible', zIndex: 30 }}>
                        <CardContent style={{ padding: '20px', overflow: 'visible' }}>
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
                                            if (allClassesList.length === 0) loadAllClasses();
                                            setClassPickerOpen(prev => !prev);
                                        }}
                                        style={{
                                            background: classPickerOpen ? 'var(--primary)' : 'rgba(99, 102, 241, 0.1)',
                                            color: classPickerOpen ? '#FFFFFF' : 'var(--primary)',
                                            border: '1px solid rgba(99, 102, 241, 0.3)',
                                            borderRadius: '8px',
                                            padding: '6px 12px',
                                            fontSize: '12px',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '5px',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>
                                            {classPickerOpen ? 'expand_less' : 'groups'}
                                        </span>
                                        {classPickerOpen ? 'Hide Class Roster' : 'Pick from Class Roster'}
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

                            {/* Inline Class Roster Drawer (Eliminating Black Screen Overlay) */}
                            {classPickerOpen && (
                                <div style={{
                                    marginBottom: '20px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    overflow: 'hidden',
                                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
                                    transition: 'all 0.2s ease'
                                }}>
                                    {/* Panel Header */}
                                    <div style={{
                                        padding: '14px 20px',
                                        borderBottom: '1px solid var(--border)',
                                        background: 'var(--surface-low)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '12px',
                                        flexWrap: 'wrap'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <div style={{
                                                width: '34px',
                                                height: '34px',
                                                borderRadius: '8px',
                                                background: 'rgba(99, 102, 241, 0.12)',
                                                color: 'var(--primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                flexShrink: 0
                                            }}>
                                                <span className="material-icons-round" style={{ fontSize: '20px' }}>groups</span>
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    Pick Students from Class Roster
                                                    <span style={{
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        padding: '1px 8px',
                                                        borderRadius: '12px',
                                                        background: usnList.length > 0 ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                                                        color: usnList.length > 0 ? '#16A34A' : 'var(--tx-muted)',
                                                        border: '1px solid var(--border)'
                                                    }}>
                                                        {usnList.length} in comparator
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '11.5px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                    Select a class section, use multi-select checkboxes or presets, and add students side-by-side.
                                                </div>
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setClassPickerOpen(false)}
                                            style={{
                                                background: 'var(--surface)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '6px',
                                                padding: '5px 12px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                color: 'var(--tx-muted)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>close</span>
                                            Close
                                        </button>
                                    </div>

                                    {/* Reassuring Data Safety Notice: Zero Data Loss Guarantee */}
                                    <div style={{
                                        padding: '7px 20px',
                                        background: 'rgba(59, 130, 246, 0.05)',
                                        borderBottom: '1px solid rgba(59, 130, 246, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '11.5px',
                                        color: 'var(--tx-muted)'
                                    }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: '#3B82F6', flexShrink: 0 }}>verified_user</span>
                                        <span>
                                            <strong style={{ color: 'var(--tx-main)', fontWeight: 700 }}>Safe & Non-Destructive:</strong> Adding or removing students here only affects your temporary comparison view. Student marks, grades, and database records are <em>never modified or deleted</em>.
                                        </span>
                                    </div>

                                    {/* Controls: Target Class Section & Search */}
                                    <div style={{
                                        padding: '12px 20px',
                                        borderBottom: '1px solid var(--border)',
                                        background: 'var(--surface)',
                                        display: 'flex',
                                        gap: '14px',
                                        flexWrap: 'wrap',
                                        alignItems: 'flex-end'
                                    }}>
                                        <div style={{ flex: '1 1 280px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                <label style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Target Class Section
                                                </label>
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-muted)' }}>
                                                    {isLoadingRoster ? 'Loading students...' : `${classRosterStudents.length} enrolled`}
                                                </span>
                                            </div>
                                            <select
                                                value={selectedPickerClassId}
                                                onChange={e => {
                                                    const newId = e.target.value;
                                                    setSelectedPickerClassId(newId);
                                                    loadClassRoster(newId);
                                                }}
                                                disabled={allClassesList.length === 0}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--surface-low)',
                                                    color: 'var(--tx-main)',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    outline: 'none',
                                                    cursor: allClassesList.length === 0 ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                {allClassesList.length === 0 ? (
                                                    <option value="">{isLoadingClasses ? 'Loading classes...' : 'No classes available'}</option>
                                                ) : (
                                                    allClassesList.map(c => {
                                                        const rawSec = (c.section || '').toString().trim();
                                                        const secClean = rawSec.replace(/^(sec|section)\s*/i, '');
                                                        return (
                                                            <option key={c.id} value={c.id}>
                                                                {c.name} {secClean ? `• Sec ${secClean}` : ''} • Sem {c.semester} • Batch {c.batch}
                                                            </option>
                                                        );
                                                    })
                                                )}
                                            </select>
                                        </div>
                                        <div style={{ flex: '1 1 240px' }}>
                                            <label style={{ display: 'block', fontSize: '10.5px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.05em' }}>
                                                Search Students in Class
                                            </label>
                                            <div style={{ position: 'relative' }}>
                                                <span className="material-icons-round" style={{
                                                    position: 'absolute',
                                                    left: '10px',
                                                    top: '50%',
                                                    transform: 'translateY(-50%)',
                                                    fontSize: '16px',
                                                    color: 'var(--tx-dim)',
                                                    pointerEvents: 'none'
                                                }}>
                                                    search
                                                </span>
                                                <input
                                                    type="text"
                                                    placeholder="Filter by name or USN..."
                                                    value={rosterSearch}
                                                    onChange={e => setRosterSearch(e.target.value)}
                                                    style={{
                                                        width: '100%',
                                                        padding: '8px 30px 8px 32px',
                                                        borderRadius: '8px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--surface-low)',
                                                        color: 'var(--tx-main)',
                                                        fontSize: '12px',
                                                        outline: 'none'
                                                    }}
                                                />
                                                {rosterSearch && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setRosterSearch('')}
                                                        style={{
                                                            position: 'absolute',
                                                            right: '8px',
                                                            top: '50%',
                                                            transform: 'translateY(-50%)',
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: 'var(--tx-muted)',
                                                            cursor: 'pointer',
                                                            padding: '2px',
                                                            display: 'flex',
                                                            alignItems: 'center'
                                                        }}
                                                    >
                                                        <span className="material-icons-round" style={{ fontSize: '15px' }}>cancel</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Quick Batch Presets & Filter Pills */}
                                    <div style={{
                                        padding: '10px 20px',
                                        background: 'var(--surface-low)',
                                        borderBottom: '1px solid var(--border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        flexWrap: 'wrap',
                                        gap: '10px'
                                    }}>
                                        {/* 1-Click Quick Batch Actions */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                            <span style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                Quick Batch:
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => handleAddAllClassStudents(classRosterStudents)}
                                                disabled={classRosterStudents.length === 0}
                                                style={{
                                                    background: 'rgba(99, 102, 241, 0.1)',
                                                    color: 'var(--primary)',
                                                    border: '1px solid rgba(99, 102, 241, 0.3)',
                                                    borderRadius: '6px',
                                                    padding: '4px 10px',
                                                    fontSize: '11.5px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title="Add all students in this class to comparator"
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>group_add</span>
                                                Add Entire Class ({classRosterStudents.length})
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleAddTopRankersClass(5)}
                                                disabled={classRosterStudents.length === 0}
                                                style={{
                                                    background: 'rgba(16, 185, 129, 0.1)',
                                                    color: '#16A34A',
                                                    border: '1px solid rgba(16, 185, 129, 0.3)',
                                                    borderRadius: '6px',
                                                    padding: '4px 10px',
                                                    fontSize: '11.5px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title="Add top 5 CGPA students from this class"
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>military_tech</span>
                                                Top 5 Rankers
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => handleAddRemedialClass()}
                                                disabled={classRosterStudents.length === 0 || classRosterStudents.filter(s => s.total_backlogs > 0).length === 0}
                                                style={{
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    color: '#DC2626',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '6px',
                                                    padding: '4px 10px',
                                                    fontSize: '11.5px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                                title="Add all students with backlogs from this class"
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '14px' }}>warning_amber</span>
                                                Backlogs ({classRosterStudents.filter(s => s.total_backlogs > 0).length})
                                            </button>
                                        </div>

                                        {/* View Filter Pills */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {[
                                                { id: 'all', label: `All (${classRosterStudents.length})` },
                                                { id: 'unadded', label: `Not Added (${classRosterStudents.filter(s => !usnList.some(u => u.toUpperCase() === (s.usn || '').toUpperCase())).length})` },
                                                { id: 'added', label: `In Comparator (${classRosterStudents.filter(s => usnList.some(u => u.toUpperCase() === (s.usn || '').toUpperCase())).length})` }
                                            ].map(tab => (
                                                <button
                                                    key={tab.id}
                                                    type="button"
                                                    onClick={() => setRosterFilterMode(tab.id)}
                                                    style={{
                                                        background: rosterFilterMode === tab.id ? 'var(--primary)' : 'var(--surface)',
                                                        color: rosterFilterMode === tab.id ? '#FFFFFF' : 'var(--tx-muted)',
                                                        border: '1px solid',
                                                        borderColor: rosterFilterMode === tab.id ? 'var(--primary)' : 'var(--border)',
                                                        borderRadius: '6px',
                                                        padding: '3px 9px',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    {tab.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Master Select All Toolbar */}
                                    <div style={{
                                        padding: '8px 20px',
                                        background: 'var(--surface)',
                                        borderBottom: '1px solid var(--border)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        fontSize: '11.5px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: unaddedStudentsInView.length === 0 ? 'default' : 'pointer', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={allEligibleChecked}
                                                    onChange={() => handleToggleSelectAllRoster(filteredRosterStudents)}
                                                    disabled={unaddedStudentsInView.length === 0}
                                                    style={{ width: '15px', height: '15px', cursor: unaddedStudentsInView.length === 0 ? 'default' : 'pointer', accentColor: 'var(--primary)' }}
                                                />
                                                <span>
                                                    {rosterCheckedUsns.size > 0
                                                        ? `${rosterCheckedUsns.size} selected`
                                                        : `Select All (${unaddedStudentsInView.length} eligible)`}
                                                </span>
                                            </label>
                                            {rosterCheckedUsns.size > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setRosterCheckedUsns(new Set())}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--tx-muted)',
                                                        textDecoration: 'underline',
                                                        cursor: 'pointer',
                                                        fontSize: '11px',
                                                        padding: '0 4px'
                                                    }}
                                                >
                                                    Deselect
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ color: 'var(--tx-muted)', fontSize: '11px' }}>
                                            Showing {filteredRosterStudents.length} of {classRosterStudents.length} students
                                        </div>
                                    </div>

                                    {/* Student Roster List */}
                                    <div style={{
                                        padding: '12px 20px',
                                        maxHeight: '360px',
                                        overflowY: 'auto',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}>
                                        {isLoadingRoster ? (
                                            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                <span className="material-icons-round gf-spin" style={{ fontSize: '26px', color: 'var(--primary)', marginBottom: '8px' }}>sync</span>
                                                <div style={{ fontSize: '12px', fontWeight: 700 }}>Loading class roster...</div>
                                            </div>
                                        ) : classRosterStudents.length === 0 ? (
                                            <div style={{ padding: '36px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>No students found in this class</div>
                                                <div style={{ fontSize: '11.5px', marginTop: '4px' }}>Try selecting another class section above.</div>
                                            </div>
                                        ) : filteredRosterStudents.length === 0 ? (
                                            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--tx-main)' }}>No students match your filter or search</div>
                                                <div style={{ fontSize: '11px', marginTop: '3px' }}>Clear the search query or toggle filter tabs above.</div>
                                            </div>
                                        ) : (
                                            filteredRosterStudents.map(stu => {
                                                const stuUsn = (stu.usn || '').toUpperCase();
                                                const isAdded = usnList.some(u => u.toUpperCase() === stuUsn);
                                                const isChecked = rosterCheckedUsns.has(stuUsn);

                                                return (
                                                    <div
                                                        key={stu.usn}
                                                        onClick={() => {
                                                            if (!isAdded) {
                                                                handleToggleCheckRosterStudent(stuUsn);
                                                            }
                                                        }}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            padding: '9px 12px',
                                                            borderRadius: '8px',
                                                            border: `1px solid ${
                                                                isAdded
                                                                    ? 'rgba(16, 185, 129, 0.4)'
                                                                    : isChecked
                                                                        ? 'var(--primary)'
                                                                        : 'var(--border)'
                                                            }`,
                                                            background: isAdded
                                                                ? 'rgba(16, 185, 129, 0.04)'
                                                                : isChecked
                                                                    ? 'rgba(99, 102, 241, 0.05)'
                                                                    : 'var(--surface-low)',
                                                            cursor: isAdded ? 'default' : 'pointer',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                    >
                                                        {/* Left Side: Checkbox + Avatar + Name + USN */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isAdded || isChecked}
                                                                    disabled={isAdded}
                                                                    onChange={() => handleToggleCheckRosterStudent(stuUsn)}
                                                                    style={{
                                                                        width: '16px',
                                                                        height: '16px',
                                                                        cursor: isAdded ? 'default' : 'pointer',
                                                                        accentColor: isAdded ? '#10B981' : 'var(--primary)'
                                                                    }}
                                                                    title={isAdded ? "Already in comparison cohort" : "Select student"}
                                                                />
                                                            </div>
                                                            <div style={{
                                                                width: '32px',
                                                                height: '32px',
                                                                borderRadius: '50%',
                                                                background: isAdded ? 'rgba(16, 185, 129, 0.15)' : 'var(--border)',
                                                                color: isAdded ? '#16A34A' : 'var(--tx-muted)',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontWeight: 800,
                                                                fontSize: '11px',
                                                                flexShrink: 0
                                                            }}>
                                                                {(stu.name || stu.usn).slice(0, 2).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 800, fontSize: '12.5px', color: 'var(--tx-main)' }}>
                                                                    <HighlightMatch text={stu.name || stu.usn} query={rosterSearch} />
                                                                </div>
                                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <HighlightMatch text={stu.usn} query={rosterSearch} />
                                                                    {stu.section && (
                                                                        <span style={{
                                                                            fontSize: '10px',
                                                                            fontWeight: 700,
                                                                            padding: '1px 5px',
                                                                            borderRadius: '4px',
                                                                            background: 'var(--surface)',
                                                                            border: '1px solid var(--border)'
                                                                        }}>
                                                                            Sec {stu.section.replace(/^(sec|section)\s*/i, '')}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Right Side: CGPA + Backlogs + Action Button */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={e => e.stopPropagation()}>
                                                            {typeof stu.cgpa === 'number' && stu.cgpa > 0 && (
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    fontWeight: 800,
                                                                    padding: '2px 7px',
                                                                    borderRadius: '5px',
                                                                    background: stu.cgpa >= 7.75 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                                                                    color: stu.cgpa >= 7.75 ? '#16A34A' : 'var(--primary)'
                                                                }}>
                                                                    {fmtNum(stu.cgpa)} CGPA
                                                                </span>
                                                            )}
                                                            {stu.total_backlogs > 0 && (
                                                                <span style={{
                                                                    fontSize: '11px',
                                                                    fontWeight: 800,
                                                                    padding: '2px 7px',
                                                                    borderRadius: '5px',
                                                                    background: 'rgba(239, 68, 68, 0.12)',
                                                                    color: '#DC2626'
                                                                }}>
                                                                    {stu.total_backlogs} Backlog{stu.total_backlogs > 1 ? 's' : ''}
                                                                </span>
                                                            )}

                                                            {isAdded ? (
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <span style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '3px',
                                                                        fontSize: '11px',
                                                                        fontWeight: 700,
                                                                        color: '#16A34A',
                                                                        background: 'rgba(16, 185, 129, 0.12)',
                                                                        border: '1px solid rgba(16, 185, 129, 0.25)',
                                                                        padding: '4px 8px',
                                                                        borderRadius: '6px'
                                                                    }}>
                                                                        <span className="material-icons-round" style={{ fontSize: '13px' }}>check_circle</span>
                                                                        Added
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleRemoveUsn(stu.usn)}
                                                                        title="Remove from comparison view (safe: does not delete student data)"
                                                                        style={{
                                                                            padding: '4px 8px',
                                                                            borderRadius: '6px',
                                                                            border: '1px solid var(--border)',
                                                                            fontSize: '11px',
                                                                            fontWeight: 700,
                                                                            cursor: 'pointer',
                                                                            background: 'var(--surface)',
                                                                            color: 'var(--tx-muted)',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '2px',
                                                                            transition: 'all 0.15s ease'
                                                                        }}
                                                                    >
                                                                        <span className="material-icons-round" style={{ fontSize: '13px', color: '#DC2626' }}>close</span>
                                                                        Remove
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAddSingleStudent(stu, false)}
                                                                    style={{
                                                                        padding: '5px 12px',
                                                                        borderRadius: '6px',
                                                                        border: 'none',
                                                                        fontSize: '11px',
                                                                        fontWeight: 800,
                                                                        cursor: 'pointer',
                                                                        background: 'var(--primary)',
                                                                        color: '#FFFFFF',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>add</span>
                                                                    Add
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>

                                    {/* Sticky Batch Selection Bar when Checkboxes are Selected */}
                                    {rosterCheckedUsns.size > 0 && (
                                        <div style={{
                                            padding: '10px 20px',
                                            background: 'rgba(99, 102, 241, 0.08)',
                                            borderTop: '2px solid var(--primary)',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            flexWrap: 'wrap',
                                            gap: '10px'
                                        }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>check_box</span>
                                                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                    {rosterCheckedUsns.size} student{rosterCheckedUsns.size > 1 ? 's' : ''} selected
                                                </span>
                                                <span style={{ fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                                    (ready to add)
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <button
                                                    type="button"
                                                    onClick={() => setRosterCheckedUsns(new Set())}
                                                    style={{
                                                        background: 'var(--surface)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '6px',
                                                        padding: '5px 12px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 700,
                                                        color: 'var(--tx-muted)',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    Cancel Selection
                                                </button>
                                                <Button
                                                    size="sm"
                                                    variant="primary"
                                                    onClick={handleAddCheckedRosterStudents}
                                                    style={{
                                                        padding: '6px 16px',
                                                        fontWeight: 800,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '6px',
                                                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)'
                                                    }}
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>group_add</span>
                                                    Add Selected ({rosterCheckedUsns.size}) to Comparison
                                                </Button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Panel Footer */}
                                    <div style={{
                                        padding: '12px 20px',
                                        borderTop: '1px solid var(--border)',
                                        background: 'var(--surface-low)',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '11.5px', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                                {usnList.length} student{usnList.length === 1 ? '' : 's'} in comparison cohort
                                            </span>
                                            {usnList.length > 0 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setUsnList([])}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: '#DC2626',
                                                        cursor: 'pointer',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        textDecoration: 'underline',
                                                        padding: '0 4px'
                                                    }}
                                                    title="Clear comparison view (safe: does not delete any student marks or records)"
                                                >
                                                    Clear Cohort
                                                </button>
                                            )}
                                        </div>
                                        <Button size="sm" variant="primary" onClick={() => setClassPickerOpen(false)}>
                                            Done
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Live Search Input with Suggestions Dropdown */}
                            <div ref={searchContainerRef} style={{ position: 'relative' }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                    <div style={{ position: 'relative', flex: 1 }}>
                                        <span className="material-icons-round" style={{
                                            position: 'absolute',
                                            left: '12px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            color: searchDropdownOpen ? 'var(--primary)' : 'var(--tx-muted)',
                                            fontSize: '18px',
                                            pointerEvents: 'none',
                                            transition: 'color 0.15s ease'
                                        }}>
                                            person_search
                                        </span>
                                        <input
                                            type="text"
                                            placeholder="Type Student Name or USN (e.g. Rawahah, Ainan, 2AB23CS063)..."
                                            value={usnInput}
                                            onChange={e => {
                                                setUsnInput(e.target.value);
                                                if (e.target.value.trim().length >= 2) {
                                                    setSearchDropdownOpen(true);
                                                }
                                            }}
                                            onKeyDown={e => {
                                                if (e.key === 'ArrowDown') {
                                                    if (searchDropdownOpen && studentSearchResults.length > 0) {
                                                        e.preventDefault();
                                                        setActiveSearchIndex(prev => (prev < studentSearchResults.length - 1 ? prev + 1 : 0));
                                                    }
                                                } else if (e.key === 'ArrowUp') {
                                                    if (searchDropdownOpen && studentSearchResults.length > 0) {
                                                        e.preventDefault();
                                                        setActiveSearchIndex(prev => (prev > 0 ? prev - 1 : studentSearchResults.length - 1));
                                                    }
                                                } else if (e.key === ' ') {
                                                    // Space key toggles check on highlighted student in results
                                                    if (searchDropdownOpen && activeSearchIndex >= 0 && studentSearchResults[activeSearchIndex]) {
                                                        e.preventDefault();
                                                        const target = studentSearchResults[activeSearchIndex];
                                                        if (!usnList.includes(target.usn.toUpperCase())) {
                                                            handleToggleCheckStudent(target.usn);
                                                        }
                                                    }
                                                } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    if (checkedUsns.size > 0) {
                                                        handleAddCheckedStudents();
                                                    } else if (searchDropdownOpen && activeSearchIndex >= 0 && studentSearchResults[activeSearchIndex]) {
                                                        handleAddSingleStudent(studentSearchResults[activeSearchIndex], true);
                                                    } else {
                                                        handleAddUsn();
                                                    }
                                                } else if (e.key === 'Escape') {
                                                    setSearchDropdownOpen(false);
                                                    setActiveSearchIndex(-1);
                                                    setCheckedUsns(new Set());
                                                }
                                            }}
                                            onFocus={() => {
                                                if (usnInput.trim().length >= 2) setSearchDropdownOpen(true);
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: '11px 40px 11px 38px',
                                                borderRadius: '8px',
                                                border: searchDropdownOpen ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                background: 'var(--surface-low)',
                                                color: 'var(--tx-main)',
                                                fontSize: '13px',
                                                outline: 'none',
                                                boxShadow: searchDropdownOpen ? '0 0 0 3px rgba(99, 102, 241, 0.15)' : 'none',
                                                transition: 'all 0.15s ease'
                                            }}
                                        />

                                        {/* Actions inside input: Spinner & Clear button */}
                                        <div style={{
                                            position: 'absolute',
                                            right: '12px',
                                            top: '50%',
                                            transform: 'translateY(-50%)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}>
                                            {isSearchingStudents && (
                                                <span className="material-icons-round gf-spin" style={{
                                                    color: 'var(--primary)',
                                                    fontSize: '18px'
                                                }}>
                                                    sync
                                                </span>
                                            )}
                                            {usnInput && (
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setUsnInput('');
                                                        setStudentSearchResults([]);
                                                        setSearchDropdownOpen(false);
                                                        setActiveSearchIndex(-1);
                                                        setCheckedUsns(new Set());
                                                    }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        cursor: 'pointer',
                                                        color: 'var(--tx-muted)',
                                                        fontSize: '18px',
                                                        padding: 0,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        lineHeight: 1
                                                    }}
                                                    title="Clear search"
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                                                </button>
                                            )}
                                        </div>

                                        {/* Floating Autocomplete Popover Anchored to Input */}
                                        {searchDropdownOpen && usnInput.trim().length >= 2 && (() => {
                                            const unaddedStudents = studentSearchResults.filter(s => !usnList.includes(s.usn.toUpperCase()));
                                            const unaddedCount = unaddedStudents.length;
                                            const isAllUnaddedChecked = unaddedCount > 0 && unaddedStudents.every(s => checkedUsns.has(s.usn.toUpperCase()));

                                            return (
                                                <div style={{
                                                    position: 'absolute',
                                                    top: 'calc(100% + 6px)',
                                                    left: 0,
                                                    right: 0,
                                                    background: 'var(--surface)',
                                                    border: '1px solid var(--border)',
                                                    boxShadow: '0 16px 36px -4px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.05)',
                                                    borderRadius: '10px',
                                                    zIndex: 1000,
                                                    overflow: 'hidden'
                                                }}>
                                                    {/* Popover Header with Multi-Select Controls */}
                                                    <div style={{
                                                        padding: '9px 14px',
                                                        background: 'var(--surface-low)',
                                                        borderBottom: '1px solid var(--border)',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        flexWrap: 'wrap',
                                                        gap: '8px'
                                                    }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary)' }}>
                                                                    groups
                                                                </span>
                                                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                                                    Matching Students {studentSearchResults.length > 0 ? `(${studentSearchResults.length})` : ''}
                                                                </span>
                                                            </div>

                                                            {/* Select All Checkbox */}
                                                            {unaddedCount > 0 && (
                                                                <label style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px',
                                                                    cursor: 'pointer',
                                                                    fontSize: '11px',
                                                                    fontWeight: 700,
                                                                    color: isAllUnaddedChecked ? 'var(--primary)' : 'var(--tx-muted)',
                                                                    background: isAllUnaddedChecked ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                                                    padding: '2px 7px',
                                                                    borderRadius: '5px',
                                                                    border: isAllUnaddedChecked ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                                                                    transition: 'all 0.15s ease'
                                                                }}>
                                                                    <input
                                                                        type="checkbox"
                                                                        checked={isAllUnaddedChecked}
                                                                        onChange={handleToggleSelectAll}
                                                                        style={{ cursor: 'pointer', accentColor: 'var(--primary)', width: '13px', height: '13px' }}
                                                                    />
                                                                    <span>Select All ({unaddedCount})</span>
                                                                </label>
                                                            )}

                                                            {/* Quick Add All Button */}
                                                            {unaddedCount > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={handleAddAllSearchResults}
                                                                    style={{
                                                                        padding: '2px 8px',
                                                                        borderRadius: '5px',
                                                                        border: '1px solid rgba(99, 102, 241, 0.3)',
                                                                        background: 'rgba(99, 102, 241, 0.1)',
                                                                        color: 'var(--primary)',
                                                                        fontSize: '11px',
                                                                        fontWeight: 800,
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                    title="Add all matching unadded students in one click"
                                                                >
                                                                    <span className="material-icons-round" style={{ fontSize: '13px' }}>playlist_add</span>
                                                                    Add All ({unaddedCount})
                                                                </button>
                                                            )}
                                                        </div>

                                                        <div style={{ fontSize: '10px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                            <span style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 4px', marginRight: '3px' }}>↑↓</span> navigate
                                                            <span style={{ margin: '0 4px' }}>•</span>
                                                            <span style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 4px', marginRight: '3px' }}>Space</span> check
                                                            <span style={{ margin: '0 4px' }}>•</span>
                                                            <span style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '3px', padding: '1px 4px', marginRight: '3px' }}>↵</span> add
                                                        </div>
                                                    </div>

                                                    {/* Popover Content */}
                                                    {studentSearchResults.length > 0 ? (
                                                        <div style={{ maxHeight: '310px', overflowY: 'auto', padding: '5px' }}>
                                                            {studentSearchResults.map((stu, idx) => {
                                                                const isSelected = usnList.includes(stu.usn.toUpperCase());
                                                                const isChecked = checkedUsns.has(stu.usn.toUpperCase());
                                                                const isActive = activeSearchIndex === idx;
                                                                const initials = (stu.name || stu.usn).trim().slice(0, 2).toUpperCase();

                                                                return (
                                                                    <div
                                                                        key={stu.usn}
                                                                        onMouseDown={(e) => {
                                                                            e.preventDefault();
                                                                            if (!isSelected) {
                                                                                handleToggleCheckStudent(stu.usn);
                                                                            }
                                                                        }}
                                                                        onMouseEnter={() => setActiveSearchIndex(idx)}
                                                                        style={{
                                                                            padding: '9px 12px',
                                                                            borderRadius: '8px',
                                                                            margin: '2px 0',
                                                                            display: 'flex',
                                                                            justifyContent: 'space-between',
                                                                            alignItems: 'center',
                                                                            cursor: isSelected ? 'default' : 'pointer',
                                                                            background: isChecked
                                                                                ? 'rgba(99, 102, 241, 0.12)'
                                                                                : isActive
                                                                                    ? 'rgba(99, 102, 241, 0.07)'
                                                                                    : isSelected
                                                                                        ? 'var(--surface-low)'
                                                                                        : 'transparent',
                                                                            border: isChecked
                                                                                ? '1px solid rgba(99, 102, 241, 0.4)'
                                                                                : isActive
                                                                                    ? '1px solid rgba(99, 102, 241, 0.25)'
                                                                                    : '1px solid transparent',
                                                                            opacity: isSelected ? 0.7 : 1,
                                                                            transition: 'all 0.12s ease'
                                                                        }}
                                                                    >
                                                                        {/* Checkbox + Student Identity */}
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                                                            {/* Checkbox */}
                                                                            <div
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (!isSelected) handleToggleCheckStudent(stu.usn);
                                                                                }}
                                                                                style={{
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    justifyContent: 'center',
                                                                                    width: '20px',
                                                                                    height: '20px',
                                                                                    cursor: isSelected ? 'default' : 'pointer',
                                                                                    flexShrink: 0
                                                                                }}
                                                                            >
                                                                                {isSelected ? (
                                                                                    <span className="material-icons-round" style={{ fontSize: '18px', color: '#16A34A' }}>
                                                                                        check_circle
                                                                                    </span>
                                                                                ) : (
                                                                                    <input
                                                                                        type="checkbox"
                                                                                        checked={isChecked}
                                                                                        onChange={() => handleToggleCheckStudent(stu.usn)}
                                                                                        style={{
                                                                                            width: '15px',
                                                                                            height: '15px',
                                                                                            cursor: 'pointer',
                                                                                            accentColor: 'var(--primary)'
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                            </div>

                                                                            {/* Avatar */}
                                                                            <div style={{
                                                                                width: '32px',
                                                                                height: '32px',
                                                                                borderRadius: '50%',
                                                                                background: isChecked
                                                                                    ? 'var(--primary)'
                                                                                    : 'linear-gradient(135deg, rgba(99, 102, 241, 0.18), rgba(16, 185, 129, 0.18))',
                                                                                color: isChecked ? '#FFFFFF' : 'var(--primary)',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                fontWeight: 900,
                                                                                fontSize: '12px',
                                                                                flexShrink: 0,
                                                                                border: `1px solid ${isChecked ? 'var(--primary)' : 'rgba(99, 102, 241, 0.2)'}`,
                                                                                transition: 'all 0.15s ease'
                                                                            }}>
                                                                                {initials}
                                                                            </div>

                                                                            {/* Details */}
                                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                                <div style={{
                                                                                    fontWeight: 800,
                                                                                    fontSize: '13px',
                                                                                    color: 'var(--tx-main)',
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '6px',
                                                                                    overflow: 'hidden',
                                                                                    textOverflow: 'ellipsis',
                                                                                    whiteSpace: 'nowrap'
                                                                                }}>
                                                                                    <HighlightMatch text={stu.name || stu.usn} query={usnInput} />
                                                                                    {isSelected && (
                                                                                        <span style={{
                                                                                            fontSize: '9px',
                                                                                            fontWeight: 800,
                                                                                            color: 'var(--tx-muted)',
                                                                                            background: 'var(--surface-low)',
                                                                                            border: '1px solid var(--border)',
                                                                                            padding: '1px 5px',
                                                                                            borderRadius: '4px'
                                                                                        }}>
                                                                                            Added
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div style={{
                                                                                    fontSize: '11px',
                                                                                    color: 'var(--tx-muted)',
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '6px',
                                                                                    marginTop: '1px'
                                                                                }}>
                                                                                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                                                        <HighlightMatch text={stu.usn} query={usnInput} />
                                                                                    </span>
                                                                                    <span>•</span>
                                                                                    <span>{stu.branch || 'CSE'}</span>
                                                                                    {stu.section && (
                                                                                        <>
                                                                                            <span>•</span>
                                                                                            <span>Sec {stu.section}</span>
                                                                                        </>
                                                                                    )}
                                                                                    <span>•</span>
                                                                                    <span>Sem {stu.semester || '6'}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        {/* Student Stats & Action */}
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '10px' }}>
                                                                            {typeof stu.cgpa === 'number' && stu.cgpa > 0 && (
                                                                                <span style={{
                                                                                    fontSize: '11px',
                                                                                    fontWeight: 800,
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '6px',
                                                                                    background: stu.cgpa >= 7.75 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                                                                                    color: stu.cgpa >= 7.75 ? '#16A34A' : 'var(--primary)',
                                                                                    border: `1px solid ${stu.cgpa >= 7.75 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(99, 102, 241, 0.25)'}`
                                                                                }}>
                                                                                    {fmtNum(stu.cgpa)} CGPA
                                                                                </span>
                                                                            )}
                                                                            {stu.total_backlogs > 0 && (
                                                                                <span style={{
                                                                                    fontSize: '11px',
                                                                                    fontWeight: 800,
                                                                                    padding: '2px 7px',
                                                                                    borderRadius: '6px',
                                                                                    background: 'rgba(239, 68, 68, 0.12)',
                                                                                    color: '#DC2626',
                                                                                    border: '1px solid rgba(239, 68, 68, 0.25)'
                                                                                }}>
                                                                                    {stu.total_backlogs} Backlog{stu.total_backlogs > 1 ? 's' : ''}
                                                                                </span>
                                                                            )}
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (!isSelected) handleAddSingleStudent(stu, false);
                                                                                }}
                                                                                disabled={isSelected}
                                                                                style={{
                                                                                    padding: '4px 10px',
                                                                                    borderRadius: '6px',
                                                                                    border: 'none',
                                                                                    fontSize: '11px',
                                                                                    fontWeight: 800,
                                                                                    cursor: isSelected ? 'default' : 'pointer',
                                                                                    background: isSelected ? 'var(--surface-low)' : 'var(--primary)',
                                                                                    color: isSelected ? 'var(--tx-muted)' : '#FFFFFF',
                                                                                    display: 'flex',
                                                                                    alignItems: 'center',
                                                                                    gap: '4px',
                                                                                    boxShadow: isSelected ? 'none' : '0 2px 5px rgba(99, 102, 241, 0.25)',
                                                                                    transition: 'all 0.15s ease'
                                                                                }}
                                                                            >
                                                                                <span className="material-icons-round" style={{ fontSize: '13px' }}>
                                                                                    {isSelected ? 'check' : 'add'}
                                                                                </span>
                                                                                {isSelected ? 'Added' : 'Add'}
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : isSearchingStudents ? (
                                                        <div style={{
                                                            padding: '24px 20px',
                                                            textAlign: 'center',
                                                            color: 'var(--tx-muted)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '8px',
                                                            fontSize: '12px',
                                                            fontWeight: 700
                                                        }}>
                                                            <span className="material-icons-round gf-spin" style={{ fontSize: '18px', color: 'var(--primary)' }}>sync</span>
                                                            Searching students...
                                                        </div>
                                                    ) : (
                                                        <div style={{
                                                            padding: '24px 20px',
                                                            textAlign: 'center',
                                                            color: 'var(--tx-muted)'
                                                        }}>
                                                            <span className="material-icons-round" style={{ fontSize: '28px', color: 'var(--tx-dim)', marginBottom: '4px', display: 'inline-block' }}>
                                                                person_off
                                                            </span>
                                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginBottom: '2px' }}>
                                                                No students found matching &ldquo;{usnInput}&rdquo;
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>
                                                                Search by student name or full/partial USN.
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Sticky Multi-Select Action Bar Footer */}
                                                    {checkedUsns.size > 0 && (
                                                        <div style={{
                                                            padding: '10px 14px',
                                                            background: 'var(--surface-low)',
                                                            borderTop: '1px solid var(--border)',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            boxShadow: '0 -4px 12px rgba(0, 0, 0, 0.05)'
                                                        }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>
                                                                    check_circle
                                                                </span>
                                                                <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                                    {checkedUsns.size} student{checkedUsns.size === 1 ? '' : 's'} selected
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setCheckedUsns(new Set())}
                                                                    style={{
                                                                        background: 'transparent',
                                                                        border: 'none',
                                                                        color: 'var(--tx-muted)',
                                                                        fontSize: '11px',
                                                                        cursor: 'pointer',
                                                                        textDecoration: 'underline',
                                                                        padding: '0 4px'
                                                                    }}
                                                                >
                                                                    Clear
                                                                </button>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                                <Button
                                                                    size="sm"
                                                                    variant="primary"
                                                                    onClick={handleAddCheckedStudents}
                                                                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: 800 }}
                                                                >
                                                                    <span className="material-icons-round" style={{ fontSize: '15px', marginRight: '4px' }}>
                                                                        person_add
                                                                    </span>
                                                                    Add Selected ({checkedUsns.size})
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <Button onClick={() => handleAddUsn()} variant="primary" style={{ padding: '10px 18px', whiteSpace: 'nowrap' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '6px' }}>add</span>
                                        Add USN
                                    </Button>
                                </div>
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
                                                            {fmtNum(stu.cgpa)}
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
                                        if (allClassesList.length === 0) loadAllClasses();
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
                                                                    {fmtNum(cgpa)}
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
                </>
            )}
        </div>
    );
}
