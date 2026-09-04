'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart, LineChart } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest, clearApiCache } from '@/lib/api/client';

export default function InstitutionalIntelligencePage() {
    return (
        <AuthGuard role="faculty">
            <InstitutionalIntelligenceContent />
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
        if (param === 'sections') return 'sections';
        if (param === 'compare') return 'compare';
        return 'department';
    });

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [], semesters: [1, 2, 3, 4, 5, 6, 7, 8] });

    // Shared Filters
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [semester, setSemester] = useState(() => Number(initialSaved.semester) || 3);

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

    // Tab 2: Sections Comparison Data
    const [sectionReport, setSectionReport] = useState({
        sections: [],
        sectionComparisons: [],
        subjectMatrix: [],
        benchmarks: { bestSection: '—', totalEvaluated: 0, benchmarkAvg: 0, sectionSpread: 0 }
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
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) setMeta(res);
            } catch (err) {
                console.error('Failed to load meta:', err);
            }
        }
        loadMeta();
    }, []);

    // 2. Fetch Department Overview Data
    const loadDepartmentData = useCallback(async () => {
        if (!branch) return;
        setDeptLoading(true);
        try {
            const query = { branch };
            if (batch) query.batch = batch;
            const res = await apiRequest('/api/faculty/analytics/department', { query });
            if (res) setDeptReport(res);
        } catch (err) {
            console.error('Failed to load department report:', err);
        } finally {
            setDeptLoading(false);
        }
    }, [branch, batch]);

    // 3. Fetch Sections Comparison Data
    const loadSectionsData = useCallback(async () => {
        if (!branch) return;
        setSectionLoading(true);
        try {
            const query = { branch, batch, semester, sectionMode: 'auto' };
            const res = await apiRequest('/api/faculty/analytics/sections-compare', { query });
            if (res) setSectionReport(res);
        } catch (err) {
            console.error('Failed to load sections comparison:', err);
        } finally {
            setSectionLoading(false);
        }
    }, [branch, batch, semester]);

    // 4. Fetch Student Comparator Data
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
            loadSectionsData();
        } else {
            loadComparatorData();
        }
    }, [viewTab, loadDepartmentData, loadSectionsData, loadComparatorData]);

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
                await loadSectionsData();
            } else {
                await loadComparatorData();
            }
        } finally {
            setIsRefreshing(false);
        }
    };

    // ── Excel Export ──
    const handleExportExcel = () => {
        try {
            const wb = XLSX.utils.book_new();

            if (viewTab === 'department') {
                const sList = deptReport.semesters || [];
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
                    typeof s.passRate === 'number' ? s.passRate.toFixed(1) : (s.passRate ?? '—'),
                    typeof s.avgCGPA === 'number' ? s.avgCGPA.toFixed(2) : (s.avgCGPA ?? '—')
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, 'Department Trends');
                XLSX.writeFile(wb, `Department_Overview_${branch}.xlsx`);
            } else if (viewTab === 'sections') {
                const cList = sectionReport.sectionComparisons || [];
                if (cList.length === 0) {
                    alert('No section comparison data available to export.');
                    return;
                }
                const headers = ['Section', 'Total Students', 'Average SGPA', 'Pass Rate %', 'Distinction Count', 'Backlogs Count'];
                const rows = cList.map(s => [
                    s.section,
                    s.studentCount ?? 0,
                    typeof s.avgSGPA === 'number' ? s.avgSGPA.toFixed(2) : (s.avgSGPA ?? '—'),
                    typeof s.passRate === 'number' ? s.passRate.toFixed(1) : (s.passRate ?? '—'),
                    s.distinctionCount ?? 0,
                    s.backlogCount ?? 0
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, 'Section Benchmarks');
                XLSX.writeFile(wb, `Section_Comparison_${branch}_Sem${semester}.xlsx`);
            } else {
                const tList = comparatorData.trajectory || [];
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
    const handleExportPDF = () => {
        try {
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            if (viewTab === 'department') {
                const sList = deptReport.semesters || [];
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
                const cList = sectionReport.sectionComparisons || [];
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
                    `Section ${s.section}`,
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
            } else {
                const tList = comparatorData.trajectory || [];
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
                        Cross-sectional department trends, section-to-section benchmarking, and student head-to-head trajectory analysis.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button onClick={handleRefresh} variant="secondary" disabled={isRefreshing || deptLoading || sectionLoading || compLoading}>
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
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>view_column</span>
                    Section Benchmarking
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

            {/* Filters Bar */}
            {viewTab !== 'compare' ? (
                <Card style={{ marginBottom: '24px' }}>
                    <CardContent style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                            <Select
                                label="Branch / Department"
                                value={branch}
                                onChange={e => setBranch(e.target.value)}
                                options={(meta.branches || []).map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))}
                            />

                            <Select
                                label="Graduation Batch"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={(meta.batches || []).map(b => ({ value: b, label: `Batch ${b}` }))}
                            />

                            {viewTab === 'sections' && (
                                <Select
                                    label="Semester"
                                    value={semester}
                                    onChange={e => setSemester(Number(e.target.value))}
                                    options={(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ value: s, label: `Semester ${s}` }))}
                                />
                            )}
                        </div>
                    </CardContent>
                </Card>
            ) : (
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
            )}

            {/* TAB 1: DEPARTMENT OVERVIEW */}
            {viewTab === 'department' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total Active Cohort</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{deptReport.summary.totalStudents}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Department size</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Overall Department Pass Rate</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: deptReport.summary.overallPassRate >= 70 ? '#16A34A' : '#DC2626' }}>
                                    {deptReport.summary.overallPassRate.toFixed(1)}%
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Mean pass benchmark</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Department Avg CGPA</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{deptReport.summary.avgCGPA.toFixed(2)}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>GPA index</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Cumulative Backlogs</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626' }}>{deptReport.summary.totalBacklogs}</div>
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
                                    <ComposedChart data={deptReport.semesters || []}>
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

            {/* TAB 2: SECTIONS BENCHMARKING */}
            {viewTab === 'sections' && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Top Performing Section</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>Section {sectionReport.benchmarks.bestSection}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Benchmark leader</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Benchmark Mean SGPA</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{sectionReport.benchmarks.benchmarkAvg.toFixed(2)}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Cross-section baseline</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Section Variance / Spread</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{sectionReport.benchmarks.sectionSpread.toFixed(2)} pts</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Min-to-max disparity</div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
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
                                        ) : (sectionReport.sectionComparisons || []).length === 0 ? (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No section comparisons recorded for this semester.</td>
                                            </tr>
                                        ) : (
                                            sectionReport.sectionComparisons.map(s => (
                                                <tr key={s.section} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '14px 16px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                        Section {s.section}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {s.studentCount}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>
                                                        {s.avgSGPA.toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: s.passRate >= 70 ? '#16A34A' : '#DC2626' }}>
                                                        {s.passRate.toFixed(1)}%
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)' }}>
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
                </>
            )}

            {/* TAB 3: STUDENT HEAD-TO-HEAD COMPARATOR */}
            {viewTab === 'compare' && (
                <>
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
                                        <LineChart data={comparatorData.trajectory || []}>
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
