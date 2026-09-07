'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
import { ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart, LineChart } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest, clearApiCache } from '@/lib/api/client';
import { getCleanBranchOptions } from '@/lib/semester-utils';

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

const LINE_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

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

    // Synchronize filters
    useEffect(() => {
        saveFilters({ branch, batch, semester });
    }, [branch, batch, semester]);

    // 1. Fetch metadata on mount
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta', { query: { fresh: '1', t: Date.now() } });
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
            const res = await apiRequest('/api/faculty/analytics/department', { query });
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
                semester: classSemester,
                fresh: '1',
                t: Date.now()
            };
            const res = await apiRequest('/api/faculty/analytics/classes-compare', { query });
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
            const query = { branch: targetBranch, batch, semester, sectionMode: 'auto', fresh: '1', t: Date.now() };
            const res = await apiRequest('/api/faculty/analytics/sections-compare', { query });
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
                query: { usns: usnList.join(','), t: Date.now() }
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
        const q = classSearch.toLowerCase().trim();
        return list.filter(c =>
            c.name.toLowerCase().includes(q) ||
            c.branch.toLowerCase().includes(q) ||
            c.facultyName.toLowerCase().includes(q) ||
            (c.section && c.section.toLowerCase().includes(q))
        );
    }, [classReport, classSearch]);

    // USN list management for comparator
    const handleAddUsn = (usnToAdd) => {
        const clean = (usnToAdd || usnInput).trim().toUpperCase();
        if (!clean) return;
        if (usnList.includes(clean)) return;
        if (usnList.length >= 6) return;
        setUsnList(prev => [...prev, clean]);
        setUsnInput('');
    };

    const handleRemoveUsn = (u) => setUsnList(prev => prev.filter(x => x !== u));

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
                const headers = ['Semester', ...usnList];
                const rows = tList.map(row => [
                    `Sem ${row.semester}`,
                    ...usnList.map(u => (typeof row[u] === 'number' ? row[u].toFixed(2) : (row[u] ?? '—')))
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, 'Student Comparison');
                XLSX.writeFile(wb, `Student_Comparison_${branch}.xlsx`);
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

                const tableHead = [['Semester', ...usnList]];
                const tableBody = tList.map(row => [
                    `Sem ${row.semester}`,
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

                doc.save(`Student_Comparison_${branch}.pdf`);
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
                    <Card style={{ marginBottom: '24px' }}>
                        <CardContent style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div style={{ flex: '1', minWidth: '240px' }}>
                                    <Input
                                        label="Add Student to Comparator"
                                        placeholder="Enter USN (e.g. 2AB23CS043)..."
                                        value={usnInput}
                                        onChange={e => setUsnInput(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddUsn()}
                                    />
                                </div>
                                <Button onClick={() => handleAddUsn()} variant="primary">
                                    Add USN
                                </Button>
                            </div>

                            {usnList.length > 0 && (
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                                    {usnList.map((u, i) => (
                                        <div key={u} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--surface-low)', border: `1px solid ${LINE_COLORS[i % LINE_COLORS.length]}`, borderRadius: '8px', padding: '6px 12px', fontSize: '13px', fontWeight: 700 }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: LINE_COLORS[i % LINE_COLORS.length] }} />
                                            <span>{u}</span>
                                            <span onClick={() => handleRemoveUsn(u)} style={{ cursor: 'pointer', marginLeft: '4px', opacity: 0.7 }}>&times;</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {usnList.length === 0 ? (
                        <Card>
                            <CardContent style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                <span className="material-icons-round" style={{ fontSize: '48px', opacity: 0.5, marginBottom: '12px' }}>compare_arrows</span>
                                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tx-main)', marginBottom: '4px' }}>No Students Selected for Comparison</div>
                                <div style={{ fontSize: '13px' }}>Add up to 6 USNs in the box above to generate head-to-head academic trajectories.</div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardHeader>
                                <CardTitle>Academic Trajectory Comparison (SGPA Progression)</CardTitle>
                            </CardHeader>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ height: '340px', width: '100%' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={comparatorData?.trajectory || []}>
                                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                            <XAxis dataKey="semester" tickFormatter={s => `Sem ${s}`} />
                                            <YAxis domain={[0, 10]} />
                                            <Tooltip />
                                            <Legend />
                                            {usnList.map((u, i) => (
                                                <Line
                                                    key={u}
                                                    type="monotone"
                                                    dataKey={u}
                                                    name={u}
                                                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                                    strokeWidth={3}
                                                    dot={{ r: 5 }}
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
}
