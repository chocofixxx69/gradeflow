'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest, clearApiCache } from '@/lib/api/client';

export default function ExamResultsHubPage() {
    return (
        <AuthGuard role="faculty">
            <ExamResultsHubContent />
        </AuthGuard>
    );
}

function ExamResultsHubContent() {
    const searchParams = useSearchParams();
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    // Tab Switcher: 'semester' (Semester Gazette) | 'batch' (Batch Trajectory) | 'reval' (Revaluation Delta)
    const [viewTab, setViewTab] = useState(() => {
        const param = searchParams?.get('tab');
        if (param === 'batch') return 'batch';
        if (param === 'reval') return 'reval';
        return 'semester';
    });

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [], semesters: [1, 2, 3, 4, 5, 6, 7, 8] });

    // Shared Scope Filters
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [semester, setSemester] = useState(() => Number(initialSaved.semester) || 3);
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [section, setSection] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Dynamically derive available sections from live classes metadata
    const availableSections = useMemo(() => {
        const classes = meta.classes || [];
        const norm = (b) => {
            if (!b) return '';
            const s = String(b).toUpperCase().trim();
            if (s === 'AI' || s === 'AIML' || s === 'CI') return 'AI';
            if (s === 'CD' || s === 'CSD' || s === 'DS') return 'CD';
            if (s === 'CS' || s === 'CSE') return 'CS';
            if (s === 'EC' || s === 'ECE') return 'EC';
            if (s === 'EE' || s === 'EEE') return 'EE';
            if (s === 'CV' || s === 'CIVIL') return 'CV';
            if (s === 'ME' || s === 'MECH') return 'ME';
            if (s === 'RI' || s === 'ROBOTICS') return 'RI';
            return s;
        };

        const relevantClasses = classes.filter(c => {
            if (branch && branch !== 'ALL' && norm(c.branch) !== norm(branch)) return false;
            if (viewTab !== 'batch' && semester && c.semester && Number(c.semester) !== Number(semester)) return false;
            return true;
        });
        const sectionSet = new Set(relevantClasses.map(c => (c.section || '').trim().toUpperCase()).filter(Boolean));
        if (sectionSet.size === 0 && classes.length > 0) {
            classes.forEach(c => {
                if (c.section) sectionSet.add(c.section.trim().toUpperCase());
            });
        }
        return Array.from(sectionSet).sort();
    }, [meta.classes, branch, semester, viewTab]);

    // Tab 1: Semester Analysis States
    const [viewMode, setViewMode] = useState('credits'); // 'credits' | 'marks'
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'passed' | 'failed'

    const initialSemData = getCachedApiData('/api/faculty/analytics/semester-analysis', {
        branch: initialSaved.branch || 'CS',
        semester: Number(initialSaved.semester) || 3,
        batch: initialSaved.batch || '2023'
    });
    const [semData, setSemData] = useState(() => initialSemData || {
        students: [],
        subjects: [],
        summary: { totalAppeared: 0, totalPassed: 0, totalFailed: 0, passPercentage: 0, classCounts: { FCD: 0, FC: 0, SC: 0, P: 0, F: 0 } },
        subjectTallies: [],
        backlogRoster: []
    });
    const [semLoading, setSemLoading] = useState(() => !initialSemData);

    // Tab 2: Batch Trajectory States
    const [upToSemester, setUpToSemester] = useState(() => Number(initialSaved.semester) || 6);
    const initialBatchData = getCachedApiData('/api/faculty/analytics/batch-report', {
        branch: initialSaved.branch || 'CS',
        batch: initialSaved.batch || '2023',
        upToSemester: Number(initialSaved.semester) || 6
    });
    const [batchData, setBatchData] = useState(() => initialBatchData || {
        students: [],
        upToSemester: 6,
        summary: { totalStudents: 0, avgCGPA: 0, withBacklogs: 0, distinctionCount: 0, lateralCount: 0 }
    });
    const [batchLoading, setBatchLoading] = useState(() => !initialBatchData);

    // Tab 3: Reval Impact States
    const [outcomeFilter, setOutcomeFilter] = useState('ALL');
    const [revalViewMode, setRevalViewMode] = useState('roster'); // 'roster' | 'student'
    const [revalData, setRevalData] = useState({
        summary: { totalApplications: 0, totalStudents: 0, upgradedCount: 0, clearedCount: 0, unchangedCount: 0, decreasedCount: 0, awaitingOriginalCount: 0, netPassRateGain: 0 },
        deltaRoster: [],
        studentRoster: [],
        branch: 'ALL',
        semester: 'ALL'
    });
    const [revalLoading, setRevalLoading] = useState(false);

    // Synchronize filters
    useEffect(() => {
        saveFilters({ branch, semester, batch });
    }, [branch, semester, batch]);

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

    // 2. Fetch Semester Analysis Data
    const loadSemesterData = useCallback(async () => {
        if (!branch || !semester || !batch) return;
        setSemLoading(true);
        try {
            const query = { branch, semester, batch, section: section !== 'ALL' ? section : undefined, t: Date.now() };
            const res = await apiRequest('/api/faculty/analytics/semester-analysis', { query });
            if (res) setSemData(res);
        } catch (err) {
            console.error('Failed to load semester data:', err);
        } finally {
            setSemLoading(false);
        }
    }, [branch, semester, batch, section]);

    // 3. Fetch Batch Trajectory Data
    const loadBatchTrajectory = useCallback(async () => {
        if (!branch || !batch) return;
        setBatchLoading(true);
        try {
            const query = { branch, batch, upToSemester, section: section !== 'ALL' ? section : undefined, t: Date.now() };
            const res = await apiRequest('/api/faculty/analytics/batch-report', { query });
            if (res) setBatchData(res);
        } catch (err) {
            console.error('Failed to load batch report:', err);
        } finally {
            setBatchLoading(false);
        }
    }, [branch, batch, upToSemester, section]);

    // 4. Fetch Reval Impact Data
    const loadRevalData = useCallback(async () => {
        if (!branch) return;
        setRevalLoading(true);
        try {
            const query = { branch, semester, batch, section: section !== 'ALL' ? section : undefined, t: Date.now() };
            const res = await apiRequest('/api/faculty/analytics/reval-impact', { query });
            if (res) setRevalData(res);
        } catch (err) {
            console.error('Failed to load reval data:', err);
        } finally {
            setRevalLoading(false);
        }
    }, [branch, semester, batch, section]);

    useEffect(() => {
        if (viewTab === 'semester') {
            if (semester === 'ALL') {
                setSemester(3);
                return;
            }
            loadSemesterData();
        } else if (viewTab === 'batch') {
            loadBatchTrajectory();
        } else {
            loadRevalData();
        }
    }, [viewTab, semester, loadSemesterData, loadBatchTrajectory, loadRevalData]);

    // Filtered lists
    const filteredSemesterStudents = useMemo(() => {
        return (semData.students || []).filter(s => {
            if (statusFilter === 'passed' && !s.isPassed) return false;
            if (statusFilter === 'failed' && s.isPassed) return false;
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
        });
    }, [semData.students, statusFilter, searchQuery]);

    const filteredBatchStudents = useMemo(() => {
        return (batchData.students || []).filter(s => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
        });
    }, [batchData.students, searchQuery]);

    const filteredRevalRoster = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return (revalData.deltaRoster || []).filter(item => {
            const matchSearch = !query ||
                item.usn?.toLowerCase().includes(query) ||
                item.name?.toLowerCase().includes(query) ||
                item.subject_code?.toLowerCase().includes(query) ||
                item.subject_name?.toLowerCase().includes(query);

            const matchOutcome = outcomeFilter === 'ALL' || item.outcome === outcomeFilter;
            return matchSearch && matchOutcome;
        });
    }, [revalData.deltaRoster, searchQuery, outcomeFilter]);

    // ── Manual Refresh ──
    const [isRefreshing, setIsRefreshing] = useState(false);
    const handleRefresh = async () => {
        setIsRefreshing(true);
        clearApiCache();
        try {
            // Reload metadata with fresh=1 to dynamically discover any newly scraped semesters, batches, or classes
            try {
                const freshMeta = await apiRequest('/api/faculty/analytics/meta', { query: { fresh: '1', t: Date.now() } });
                if (freshMeta) setMeta(freshMeta);
            } catch (err) {
                console.warn('Metadata refresh notice:', err);
            }

            if (viewTab === 'semester') {
                await loadSemesterData();
            } else if (viewTab === 'batch') {
                await loadBatchTrajectory();
            } else {
                await loadRevalData();
            }
        } finally {
            setIsRefreshing(false);
        }
    };

    // ── Excel Export ──
    const handleExportExcel = () => {
        try {
            const wb = XLSX.utils.book_new();

            if (viewTab === 'semester') {
                if (filteredSemesterStudents.length === 0) {
                    alert('No semester gazette records available to export.');
                    return;
                }
                const headers = ['USN', 'Student Name', 'Total Marks', 'SGPA', 'Status', 'Class', 'Backlogs Count'];
                const rows = filteredSemesterStudents.map(s => [
                    s.usn,
                    s.name,
                    s.totalMarks ?? 0,
                    typeof s.sgpa === 'number' ? s.sgpa.toFixed(2) : (s.sgpa ?? '—'),
                    s.isPassed ? 'PASS' : 'FAIL',
                    s.awardClass || '—',
                    s.backlogCount ?? 0
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, `Sem ${semester} Gazette`);
                XLSX.writeFile(wb, `Semester_${semester}_Gazette_${branch}.xlsx`);
            } else if (viewTab === 'batch') {
                if (filteredBatchStudents.length === 0) {
                    alert('No batch trajectory records available to export.');
                    return;
                }
                const headers = ['USN', 'Student Name', 'Branch', 'CGPA', 'Active Backlogs', ...Array.from({ length: upToSemester }, (_, i) => `S${i + 1} SGPA`)];
                const rows = filteredBatchStudents.map(s => [
                    s.usn,
                    s.name,
                    s.branch,
                    typeof s.cgpa === 'number' ? s.cgpa.toFixed(2) : (s.cgpa ?? '—'),
                    s.backlogsCount ?? 0,
                    ...Array.from({ length: upToSemester }, (_, i) => {
                        const semSgpa = s.semesters?.[i + 1]?.sgpa;
                        return typeof semSgpa === 'number' ? semSgpa.toFixed(2) : '—';
                    })
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, 'Batch Trajectory');
                XLSX.writeFile(wb, `Batch_${batch}_Trajectory_${branch}.xlsx`);
            } else {
                if (filteredRevalRoster.length === 0) {
                    alert('No revaluation records available to export.');
                    return;
                }
                const headers = ['USN', 'Name', 'Subject', 'Original SEE', 'Reval SEE', 'Delta', 'Outcome'];
                const rows = filteredRevalRoster.map(r => {
                    const deltaVal = r.deltaMarks ?? r.delta;
                    return [
                        r.usn,
                        r.name,
                        r.subject_code,
                        r.originalExternal !== null && r.originalExternal !== undefined ? r.originalExternal : (r.preMarks ?? '—'),
                        r.revalExternal !== null && r.revalExternal !== undefined ? r.revalExternal : (r.postMarks ?? '—'),
                        deltaVal !== null && deltaVal !== undefined ? (deltaVal > 0 ? `+${deltaVal}` : deltaVal) : '—',
                        r.outcome || 'No Change'
                    ];
                });
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, 'Revaluation Delta');
                XLSX.writeFile(wb, `Revaluation_Delta_${branch}_Sem${semester}.xlsx`);
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

            if (viewTab === 'semester') {
                if (filteredSemesterStudents.length === 0) {
                    alert('No semester gazette records available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`Semester ${semester} Academic Gazette - ${branch} (${batch})`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                const appeared = semData?.summary?.totalAppeared ?? filteredSemesterStudents.length;
                const passed = semData?.summary?.totalPassed ?? 0;
                const passRate = typeof semData?.summary?.passPercentage === 'number' ? `${semData.summary.passPercentage.toFixed(1)}%` : '—';
                doc.text(`Appeared: ${appeared} | Passed: ${passed} | Pass Rate: ${passRate} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['USN', 'Student Name', 'Marks', 'SGPA', 'Result', 'Award Class', 'Backlogs']];
                const tableBody = filteredSemesterStudents.map(s => [
                    s.usn,
                    s.name,
                    s.totalMarks ?? 0,
                    typeof s.sgpa === 'number' ? s.sgpa.toFixed(2) : (s.sgpa ?? '—'),
                    s.isPassed ? 'PASS' : 'FAIL',
                    s.awardClass || '—',
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

                doc.save(`Semester_${semester}_Gazette_${branch}.pdf`);
            } else if (viewTab === 'batch') {
                if (filteredBatchStudents.length === 0) {
                    alert('No batch trajectory records available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`Cumulative Batch Progression Report - ${branch} (${batch})`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(`Total Students: ${filteredBatchStudents.length} | Tracked Semesters: 1..${upToSemester} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['USN', 'Student Name', 'CGPA', 'Backlogs', ...Array.from({ length: upToSemester }, (_, i) => `S${i + 1}`)]];
                const tableBody = filteredBatchStudents.map(s => [
                    s.usn,
                    s.name,
                    typeof s.cgpa === 'number' ? s.cgpa.toFixed(2) : (s.cgpa ?? '—'),
                    s.backlogsCount ?? 0,
                    ...Array.from({ length: upToSemester }, (_, i) => {
                        const semSgpa = s.semesters?.[i + 1]?.sgpa;
                        return typeof semSgpa === 'number' ? semSgpa.toFixed(2) : '—';
                    })
                ]);

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                doc.save(`Batch_${batch}_Report_${branch}.pdf`);
            } else {
                if (filteredRevalRoster.length === 0) {
                    alert('No revaluation records available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`Revaluation Impact & Delta Audit - ${branch} (Sem ${semester})`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(`Evaluated Applications: ${filteredRevalRoster.length} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['USN', 'Name', 'Subject', 'Original SEE', 'Reval SEE', 'Delta', 'Outcome']];
                const tableBody = filteredRevalRoster.map(r => {
                    const deltaVal = r.deltaMarks ?? r.delta;
                    return [
                        r.usn,
                        r.name,
                        r.subject_code,
                        r.originalExternal !== null && r.originalExternal !== undefined ? String(r.originalExternal) : (r.preMarks !== null && r.preMarks !== undefined ? String(r.preMarks) : '—'),
                        r.revalExternal !== null && r.revalExternal !== undefined ? String(r.revalExternal) : (r.postMarks !== null && r.postMarks !== undefined ? String(r.postMarks) : '—'),
                        deltaVal !== null && deltaVal !== undefined ? (deltaVal > 0 ? `+${deltaVal}` : String(deltaVal)) : '—',
                        r.outcome || 'No Change'
                    ];
                });

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                doc.save(`Reval_Delta_${branch}_Sem${semester}.pdf`);
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
                    <PageHeaderEyebrow>Institutional Examination Services</PageHeaderEyebrow>
                    <PageHeaderTitle>Exam &amp; Result Sheets Hub</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Unified exam-cycle operations: Single-semester gazette, cumulative multi-semester trajectories, and revaluation impact.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button onClick={handleRefresh} variant="secondary" disabled={isRefreshing || semLoading || batchLoading || revalLoading}>
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
                    onClick={() => setViewTab('semester')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'semester' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'semester' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>table_chart</span>
                    Semester Analysis Gazette
                </button>
                <button
                    type="button"
                    onClick={() => setViewTab('batch')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'batch' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'batch' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>view_timeline</span>
                    Multi-Semester Batch Trajectory
                </button>
                <button
                    type="button"
                    onClick={() => setViewTab('reval')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'reval' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'reval' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>published_with_changes</span>
                    Revaluation Impact Delta
                </button>
            </div>

            {/* Scope Filter Card */}
            <Card style={{ marginBottom: '24px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                        <Select
                            label="Branch / Department"
                            value={branch}
                            onChange={e => setBranch(e.target.value)}
                            options={[
                                { value: 'ALL', label: 'All Branches (College-Wide)' },
                                ...(meta.branches || []).map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))
                            ]}
                        />

                        <Select
                            label="Graduation Batch"
                            value={batch}
                            onChange={e => setBatch(e.target.value)}
                            options={[
                                { value: 'ALL', label: 'All Batches (All Cohorts)' },
                                ...(meta.batches || []).map(b => ({ value: b, label: `Batch ${b}` }))
                            ]}
                        />

                        {viewTab !== 'batch' ? (
                            <Select
                                label="Semester"
                                value={semester}
                                onChange={e => setSemester(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                                options={viewTab === 'reval' ? [
                                    { value: 'ALL', label: 'All Semesters (Cumulative Course)' },
                                    ...(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ value: s, label: `Semester ${s}` }))
                                ] : (meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ value: s, label: `Semester ${s}` }))}
                            />
                        ) : (
                            <Select
                                label="Progress Up To"
                                value={upToSemester}
                                onChange={e => setUpToSemester(Number(e.target.value))}
                                options={(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ value: s, label: `Up to Semester ${s}` }))}
                            />
                        )}

                        <Select
                            label="Section"
                            value={section}
                            onChange={e => setSection(e.target.value)}
                            options={[
                                { value: 'ALL', label: availableSections.length > 0 ? `All Sections (${availableSections.join(', ')})` : 'All Sections (Whole Cohort)' },
                                ...availableSections.map(s => ({ value: s, label: `Section ${s}` }))
                            ]}
                        />

                        {viewTab === 'reval' && (
                            <Select
                                label="Outcome Filter"
                                value={outcomeFilter}
                                onChange={e => setOutcomeFilter(e.target.value)}
                                options={[
                                    { value: 'ALL', label: 'All Outcomes' },
                                    { value: 'Cleared Backlog', label: 'Cleared Backlog' },
                                    { value: 'Grade Upgraded', label: 'Grade Upgraded' },
                                    { value: 'Confirmed', label: 'Confirmed (No Change)' },
                                    { value: 'Marks Decreased', label: 'Marks Decreased' },
                                    { value: 'Awaiting Original Mark', label: 'Awaiting Original Mark' },
                                ]}
                            />
                        )}

                        <Input
                            label="Search Roster"
                            placeholder="Find USN or Name..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* TAB 1: SEMESTER ANALYSIS GAZETTE */}
            {viewTab === 'semester' && (
                <>
                    {/* Summary Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total Appeared</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{semData.summary.totalAppeared}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Students with marks</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Semester Pass Rate</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: semData.summary.passPercentage >= 70 ? '#16A34A' : '#DC2626' }}>
                                    {semData.summary.passPercentage.toFixed(1)}%
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>{semData.summary.totalPassed} passed, {semData.summary.totalFailed} failed</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>First Class Distinction</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{semData.summary.classCounts?.FCD || 0}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>FCD honors tier</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Active Backlogs</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626' }}>{semData.backlogRoster?.length || 0}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Students requiring re-exam</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Table View */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Semester {semester} Student Gazette ({filteredSemesterStudents.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Total Marks</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>SGPA</th>
                                            <th style={{ padding: '12px 16px' }}>Result</th>
                                            <th style={{ padding: '12px 16px' }}>Standing Class</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {semLoading ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading semester records...</td>
                                            </tr>
                                        ) : filteredSemesterStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No student records found.</td>
                                            </tr>
                                        ) : (
                                            filteredSemesterStudents.map(s => (
                                                <tr key={s.usn} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                        {s.usn}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                        <div>{s.name}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 500, marginTop: '2px' }}>
                                                            {s.branch || (s.usn.length >= 7 ? s.usn.substring(5, 7).toUpperCase() : '—')}{s.section && s.section !== '—' ? ` • Sec ${s.section}` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                        {s.totalMarks}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>
                                                        {s.sgpa.toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        <span style={{
                                                            padding: '4px 10px',
                                                            borderRadius: '20px',
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            background: s.isPassed ? 'rgba(34, 197, 94, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                                                            color: s.isPassed ? '#16A34A' : '#DC2626'
                                                        }}>
                                                            {s.isPassed ? 'PASSED' : 'FAILED'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', color: 'var(--tx-muted)', fontSize: '12px' }}>
                                                        {s.awardClass || 'Passing'}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                        <Link href={`/faculty/students/${s.usn}`} style={{ textDecoration: 'none' }}>
                                                            <Button size="sm" variant="ghost">Report</Button>
                                                        </Link>
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

            {/* TAB 2: MULTI-SEMESTER BATCH TRAJECTORY */}
            {viewTab === 'batch' && (
                <>
                    {/* Summary Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Cohort Size</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{batchData.summary.totalStudents}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Tracked students</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Mean Batch CGPA</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{batchData.summary.avgCGPA?.toFixed(2) || '0.00'}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Cumulative grade index</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>With Active Backlogs</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626' }}>{batchData.summary.withBacklogs}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Students with arrears</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Distinction Students</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>{batchData.summary.distinctionCount}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>CGPA &ge; 7.75</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Table View */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Multi-Semester Progression Ledger ({filteredBatchStudents.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>CGPA</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Backlogs</th>
                                            {Array.from({ length: upToSemester }, (_, i) => (
                                                <th key={i} style={{ padding: '12px 16px', textAlign: 'center' }}>Sem {i + 1}</th>
                                            ))}
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batchLoading ? (
                                            <tr>
                                                <td colSpan={5 + upToSemester} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading batch records...</td>
                                            </tr>
                                        ) : filteredBatchStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan={5 + upToSemester} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students match the criteria.</td>
                                            </tr>
                                        ) : (
                                            filteredBatchStudents.map(s => (
                                                <tr key={s.usn} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                        {s.usn}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                        <div>{s.name}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 500, marginTop: '2px' }}>
                                                            {s.branch || (s.usn.length >= 7 ? s.usn.substring(5, 7).toUpperCase() : '—')}{s.section && s.section !== '—' ? ` • Sec ${s.section}` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>
                                                        {s.cgpa.toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: s.backlogsCount > 0 ? '#DC2626' : '#16A34A' }}>
                                                        {s.backlogsCount}
                                                    </td>
                                                    {Array.from({ length: upToSemester }, (_, i) => {
                                                        const sem = s.semesters?.[i + 1];
                                                        return (
                                                            <td key={i} style={{ padding: '14px 16px', textAlign: 'center', color: sem ? 'var(--tx-main)' : 'var(--tx-dim)' }}>
                                                                {sem?.sgpa ? sem.sgpa.toFixed(2) : '—'}
                                                            </td>
                                                        );
                                                    })}
                                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                        <Link href={`/faculty/students/${s.usn}`} style={{ textDecoration: 'none' }}>
                                                            <Button size="sm" variant="ghost">Transcript</Button>
                                                        </Link>
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

            {/* TAB 3: REVALUATION IMPACT DELTA */}
            {viewTab === 'reval' && (
                <>
                    {/* Summary Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Reval Applications</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{revalData.summary.totalApplications}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Total challenge evaluations</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Marks Upgraded</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>{revalData.summary.upgradedCount}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Benefited from reval</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Backlogs Cleared</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{revalData.summary.clearedCount}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Converted from Fail &rarr; Pass</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Net Pass Rate Gain</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>+{revalData.summary.netPassRateGain.toFixed(1)}%</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Post-revaluation lift</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Table View */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Revaluation Delta Roster ({filteredRevalRoster.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px' }}>Subject</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Original SEE</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Reval SEE</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Delta</th>
                                            <th style={{ padding: '12px 16px' }}>Outcome</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {revalLoading ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading reval delta records...</td>
                                            </tr>
                                        ) : filteredRevalRoster.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No revaluation records match criteria.</td>
                                            </tr>
                                        ) : (
                                            filteredRevalRoster.map((r, idx) => {
                                                const deltaVal = r.deltaMarks !== null && r.deltaMarks !== undefined ? r.deltaMarks : (r.delta !== null && r.delta !== undefined ? r.delta : null);
                                                const isGain = typeof deltaVal === 'number' && deltaVal > 0;
                                                const isLoss = typeof deltaVal === 'number' && deltaVal < 0;
                                                const origVal = r.originalExternal !== null && r.originalExternal !== undefined ? r.originalExternal : (r.preMarks !== null && r.preMarks !== undefined ? r.preMarks : '—');
                                                const revalVal = r.revalExternal !== null && r.revalExternal !== undefined ? r.revalExternal : (r.postMarks !== null && r.postMarks !== undefined ? r.postMarks : '—');

                                                return (
                                                    <tr key={`${r.usn}-${r.subject_code}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                            {r.usn}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                            <div>{r.name}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 500, marginTop: '2px' }}>
                                                                {r.branch || '—'}{r.section && r.section !== '—' ? ` • Sec ${r.section}` : ''}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontFamily: 'monospace' }}>
                                                            {r.subject_code}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                            {origVal}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                            {revalVal}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: isGain ? '#16A34A' : (isLoss ? '#DC2626' : 'var(--tx-dim)') }}>
                                                            {deltaVal !== null && deltaVal !== undefined ? (isGain ? `+${deltaVal}` : deltaVal) : '—'}
                                                        </td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                background: (r.outcome === 'Cleared Backlog' || r.outcome === 'UPGRADED_PASS')
                                                                    ? 'rgba(34, 197, 94, 0.12)'
                                                                    : (r.outcome === 'Grade Upgraded' || r.outcome === 'UPGRADED')
                                                                    ? 'rgba(59, 130, 246, 0.12)'
                                                                    : (r.outcome === 'Marks Decreased' || r.outcome === 'DECREASED')
                                                                    ? 'rgba(239, 68, 68, 0.12)'
                                                                    : (r.outcome === 'Awaiting Original Mark')
                                                                    ? 'rgba(245, 158, 11, 0.12)'
                                                                    : 'var(--surface-low)',
                                                                color: (r.outcome === 'Cleared Backlog' || r.outcome === 'UPGRADED_PASS')
                                                                    ? '#16A34A'
                                                                    : (r.outcome === 'Grade Upgraded' || r.outcome === 'UPGRADED')
                                                                    ? '#2563EB'
                                                                    : (r.outcome === 'Marks Decreased' || r.outcome === 'DECREASED')
                                                                    ? '#DC2626'
                                                                    : (r.outcome === 'Awaiting Original Mark')
                                                                    ? '#D97706'
                                                                    : 'var(--tx-muted)'
                                                            }}>
                                                                {r.outcome}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                            <Link href={`/faculty/students/${r.usn}`} style={{ textDecoration: 'none' }}>
                                                                <Button size="sm" variant="ghost">Audit</Button>
                                                            </Link>
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
                </>
            )}
        </div>
    );
}
