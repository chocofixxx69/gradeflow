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
import { fetchLeaderboard } from '@/lib/api/analytics';
import { getCleanBranchOptions } from '@/lib/semester-utils';

export default function RankingsAndMeritPage() {
    return (
        <AuthGuard role="faculty">
            <RankingsAndMeritContent />
        </AuthGuard>
    );
}

const MEDAL_COLORS = {
    1: { bg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', text: '#FFFFFF', icon: '🥇', title: 'Gold Medalist (Rank 1)' },
    2: { bg: 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)', text: '#FFFFFF', icon: '🥈', title: 'Silver Medalist (Rank 2)' },
    3: { bg: 'linear-gradient(135deg, #B45309 0%, #78350F 100%)', text: '#FFFFFF', icon: '🥉', title: 'Bronze Medalist (Rank 3)' }
};

const LEADERBOARD_TABS = [
    { id: 'overall', label: 'Overall (CGPA)', icon: 'military_tech' },
    { id: 'semester', label: 'Semester-Wise (SGPA)', icon: 'date_range' },
    { id: 'subject', label: 'Subject-Wise (Marks)', icon: 'menu_book' },
];

function RankingsAndMeritContent() {
    const searchParams = useSearchParams();
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    // Active View: 'merit' (Official Batch Merit Register) | 'leaderboard' (Class Standing & Toppers)
    const [viewTab, setViewTab] = useState(() => {
        const param = searchParams?.get('tab');
        return param === 'leaderboard' ? 'leaderboard' : 'merit';
    });

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [], semesters: [1, 2, 3, 4, 5, 6, 7, 8] });

    // Shared Filters
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [semester, setSemester] = useState(() => initialSaved.semester ? String(initialSaved.semester) : 'all');
    const [searchQuery, setSearchQuery] = useState('');

    // Leaderboard-Specific Filters
    const [section, setSection] = useState('');
    const [leaderboardScopeTab, setLeaderboardScopeTab] = useState('overall');
    const [viewSemester, setViewSemester] = useState(null);
    const [subjectCode, setSubjectCode] = useState(null);

    // Merit Data State
    const initialMeritData = getCachedApiData('/api/faculty/analytics/merit-list', {
        branch: initialSaved.branch || 'CS',
        batch: initialSaved.batch || '2023',
        ...(initialSaved.semester && initialSaved.semester !== 'all' ? { semester: initialSaved.semester } : {})
    });
    const [meritReport, setMeritReport] = useState(() => initialMeritData || {
        summary: { totalRanked: 0, highestScore: 0, avgScore: 0, department: 'CS', batch: 'All Batches', semester: 'Overall Cumulative' },
        podium: [],
        rankedStudents: []
    });
    const [meritLoading, setMeritLoading] = useState(() => !initialMeritData);

    // Leaderboard Data State
    const [leaderboardData, setLeaderboardData] = useState(null);
    const [leaderboardLoading, setLeaderboardLoading] = useState(false);
    const [leaderboardError, setLeaderboardError] = useState('');

    // Save active filters
    useEffect(() => {
        saveFilters({ branch, batch, semester: semester !== 'all' ? semester : undefined });
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

    // 2. Fetch Merit List
    const loadMeritList = useCallback(async () => {
        if (!branch) return;
        const query = { branch };
        if (batch) query.batch = batch;
        if (semester && semester !== 'all') query.semester = semester;

        const cached = getCachedApiData('/api/faculty/analytics/merit-list', query);
        if (cached) {
            setMeritReport(cached);
            setMeritLoading(false);
        } else {
            setMeritLoading(true);
        }

        try {
            const res = await apiRequest('/api/faculty/analytics/merit-list', { query });
            if (res) {
                setMeritReport(res);
            }
        } catch (err) {
            console.error('Failed to load merit list:', err);
        } finally {
            setMeritLoading(false);
        }
    }, [branch, batch, semester]);

    // 3. Fetch Leaderboard
    const loadLeaderboard = useCallback(async () => {
        if (!branch) return;
        setLeaderboardLoading(true);
        setLeaderboardError('');
        try {
            const res = await fetchLeaderboard({ filters: { branch, section: section || undefined }, viewSemester, subjectCode });
            setLeaderboardData(res);
            if (!viewSemester && res?.targetSemester) setViewSemester(res.targetSemester);
        } catch (err) {
            console.error('Failed to load leaderboard:', err);
            setLeaderboardError(err.message || 'Failed to load class leaderboard.');
        } finally {
            setLeaderboardLoading(false);
        }
    }, [branch, section, viewSemester, subjectCode]);

    useEffect(() => {
        if (viewTab === 'merit') {
            loadMeritList();
        } else {
            loadLeaderboard();
        }
    }, [viewTab, loadMeritList, loadLeaderboard]);

    useEffect(() => {
        setSection('');
    }, [branch]);

    // Filtered students for Merit List
    const filteredMeritStudents = useMemo(() => {
        return (meritReport.rankedStudents || []).filter(s => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
        });
    }, [meritReport.rankedStudents, searchQuery]);

    // Filtered rows for Leaderboard
    const leaderboardRows = useMemo(() => {
        const base = leaderboardScopeTab === 'overall'
            ? (leaderboardData?.overallLeaderboard || [])
            : leaderboardScopeTab === 'semester'
                ? (leaderboardData?.allSemestersLeaderboard?.[viewSemester || leaderboardData?.targetSemester] || [])
                : (leaderboardData?.subjectLeaderboard || []);
        if (!searchQuery) return base;
        const q = searchQuery.toLowerCase();
        return base.filter(r => r.name?.toLowerCase().includes(q) || r.usn?.toLowerCase().includes(q));
    }, [leaderboardData, leaderboardScopeTab, viewSemester, searchQuery]);

    const leaderboardTop3 = useMemo(() => {
        if (searchQuery) return [];
        return leaderboardRows.filter(r => typeof r.rank === 'number' && r.rank <= 3);
    }, [leaderboardRows, searchQuery]);

    const subjectOptions = (leaderboardData?.availableSubjects || [])
        .filter(s => !viewSemester || s.semester === viewSemester)
        .map(s => ({ value: s.subject_code, label: `${s.subject_code} - ${s.subject_name}` }));

    // ── Manual Refresh ──
    const [isRefreshing, setIsRefreshing] = useState(false);
    const handleRefresh = async () => {
        setIsRefreshing(true);
        clearApiCache();
        try {
            if (viewTab === 'merit') {
                await loadMeritList();
            } else {
                await loadLeaderboard();
            }
        } finally {
            setIsRefreshing(false);
        }
    };

    // ── Excel Export ──
    const handleExportExcel = () => {
        try {
            const wb = XLSX.utils.book_new();
            if (viewTab === 'merit') {
                const students = filteredMeritStudents.length > 0 ? filteredMeritStudents : (meritReport.rankedStudents || []);
                if (students.length === 0) {
                    alert('No merit list records available to export.');
                    return;
                }
                const headers = ['Rank', 'USN', 'Student Name', 'Branch', 'GPA / CGPA', 'Credits Earned', 'Total Marks', 'Honors / Standing'];
                const rows = students.map(s => [
                    s.rank,
                    s.usn,
                    s.name,
                    s.branch,
                    typeof s.gpa === 'number' ? s.gpa.toFixed(2) : (s.gpa ?? '—'),
                    s.creditsEarned ?? 0,
                    s.totalMarks ?? 0,
                    s.honors || 'Pass Class'
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, 'Official Merit List');
                XLSX.writeFile(wb, `Official_Merit_List_${branch}_${batch || 'All'}.xlsx`);
            } else {
                if (leaderboardRows.length === 0) {
                    alert('No leaderboard records available to export.');
                    return;
                }
                let headers, rows, sheetName, fileName;
                if (leaderboardScopeTab === 'overall') {
                    sheetName = 'Overall CGPA Toppers';
                    fileName = `Leaderboard_Overall_CGPA_${branch}.xlsx`;
                    headers = ['Rank', 'USN', 'Student Name', 'Branch', 'CGPA', 'Earned Credits', 'Total Backlogs'];
                    rows = leaderboardRows.map(r => [
                        r.rank,
                        r.usn,
                        r.name,
                        r.branch,
                        typeof r.cgpa === 'number' ? r.cgpa.toFixed(2) : (r.cgpa ?? '—'),
                        r.earnedCredits ?? 0,
                        r.totalBacklogs ?? 0
                    ]);
                } else if (leaderboardScopeTab === 'semester') {
                    const sem = viewSemester || leaderboardData?.targetSemester || 'Current';
                    sheetName = `Sem ${sem} SGPA Toppers`;
                    fileName = `Leaderboard_Sem_${sem}_SGPA_${branch}.xlsx`;
                    headers = ['Rank', 'USN', 'Student Name', 'Branch', 'SGPA', 'Credits', 'Status'];
                    rows = leaderboardRows.map(r => [
                        r.rank,
                        r.usn,
                        r.name,
                        r.branch,
                        typeof r.sgpa === 'number' ? r.sgpa.toFixed(2) : (r.sgpa ?? '—'),
                        r.credits ?? 0,
                        r.statusText || (r.hasAppeared ? 'Appeared' : 'Not Appeared')
                    ]);
                } else {
                    const subCode = subjectCode || leaderboardData?.currentSubject?.subject_code || 'Subject';
                    sheetName = `${subCode} Toppers`;
                    fileName = `Leaderboard_${subCode}_${branch}.xlsx`;
                    headers = ['Rank', 'USN', 'Student Name', 'CIE Marks', 'SEE Marks', 'Total Marks', 'Grade'];
                    rows = leaderboardRows.map(r => [
                        r.rank,
                        r.usn,
                        r.name,
                        r.internal ?? '—',
                        r.external ?? '—',
                        r.total ?? 0,
                        r.grade || '—'
                    ]);
                }
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, ws, sheetName);
                XLSX.writeFile(wb, fileName);
            }
        } catch (err) {
            console.error('Export Excel error:', err);
            alert('Failed to export Excel: ' + (err.message || 'Unknown error'));
        }
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        try {
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
            if (viewTab === 'merit') {
                const students = filteredMeritStudents.length > 0 ? filteredMeritStudents : (meritReport.rankedStudents || []);
                if (students.length === 0) {
                    alert('No merit list records available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text('GRADEFLOW INSTITUTIONAL MERIT & RANK REGISTER', 14, 15);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                const semText = meritReport?.summary?.semester || 'Overall Cumulative';
                const totalText = meritReport?.summary?.totalRanked ?? students.length;
                doc.text(`Department: ${branch} | Batch: ${batch || 'All Batches'} | Scope: ${semText} | Total Ranked: ${totalText} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['Rank', 'USN', 'Student Name', 'Branch', 'GPA', 'Credits', 'Total Marks', 'Honors']];
                const tableBody = students.map(s => [
                    `#${s.rank}`,
                    s.usn,
                    s.name,
                    s.branch,
                    typeof s.gpa === 'number' ? s.gpa.toFixed(2) : (s.gpa ?? '—'),
                    s.creditsEarned ?? 0,
                    s.totalMarks ?? 0,
                    s.honors || 'Pass Class'
                ]);

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'grid',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                doc.save(`Merit_List_${branch}.pdf`);
            } else {
                if (leaderboardRows.length === 0) {
                    alert('No leaderboard records available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                let title = 'CLASS LEADERBOARD & TOPPERS';
                let tableHead, tableBody, fileName;

                if (leaderboardScopeTab === 'overall') {
                    title = `CLASS LEADERBOARD - OVERALL CGPA (${branch})`;
                    fileName = `Leaderboard_Overall_${branch}.pdf`;
                    tableHead = [['Rank', 'USN', 'Student Name', 'Branch', 'CGPA', 'Credits', 'Backlogs']];
                    tableBody = leaderboardRows.map(r => [
                        `#${r.rank}`,
                        r.usn,
                        r.name,
                        r.branch,
                        typeof r.cgpa === 'number' ? r.cgpa.toFixed(2) : (r.cgpa ?? '—'),
                        r.earnedCredits ?? 0,
                        r.totalBacklogs ?? 0
                    ]);
                } else if (leaderboardScopeTab === 'semester') {
                    const sem = viewSemester || leaderboardData?.targetSemester || 'Current';
                    title = `SEMESTER ${sem} SGPA LEADERBOARD (${branch})`;
                    fileName = `Leaderboard_Sem_${sem}_${branch}.pdf`;
                    tableHead = [['Rank', 'USN', 'Student Name', 'Branch', 'SGPA', 'Credits', 'Status']];
                    tableBody = leaderboardRows.map(r => [
                        `#${r.rank}`,
                        r.usn,
                        r.name,
                        r.branch,
                        typeof r.sgpa === 'number' ? r.sgpa.toFixed(2) : (r.sgpa ?? '—'),
                        r.credits ?? 0,
                        r.statusText || (r.hasAppeared ? 'Appeared' : 'Not Appeared')
                    ]);
                } else {
                    const subCode = subjectCode || leaderboardData?.currentSubject?.subject_code || 'Subject';
                    title = `SUBJECT TOPPERS: ${subCode} (${branch})`;
                    fileName = `Leaderboard_${subCode}_${branch}.pdf`;
                    tableHead = [['Rank', 'USN', 'Student Name', 'CIE', 'SEE', 'Total Marks', 'Grade']];
                    tableBody = leaderboardRows.map(r => [
                        `#${r.rank}`,
                        r.usn,
                        r.name,
                        r.internal ?? '—',
                        r.external ?? '—',
                        r.total ?? 0,
                        r.grade || '—'
                    ]);
                }

                doc.text(title, 14, 15);
                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(`Department: ${branch} | Total Ranked: ${leaderboardRows.length} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                doc.save(fileName);
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
                    <PageHeaderEyebrow>Institutional Recognition</PageHeaderEyebrow>
                    <PageHeaderTitle>Rankings &amp; Merit Center</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Unified honor roll, official notice-board merit register, and interactive class leaderboards.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button onClick={handleRefresh} variant="secondary" disabled={isRefreshing || meritLoading || leaderboardLoading}>
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
                maxWidth: '100%'
            }}>
                <button
                    type="button"
                    onClick={() => setViewTab('merit')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'merit' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'merit' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>military_tech</span>
                    Official Batch Merit List &amp; Podium
                </button>
                <button
                    type="button"
                    onClick={() => setViewTab('leaderboard')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'leaderboard' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'leaderboard' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>emoji_events</span>
                    Class Leaderboard &amp; Toppers
                </button>
            </div>

            {/* Filters Bar */}
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

                        {viewTab === 'merit' ? (
                            <Select
                                label="Semester Scope"
                                value={semester}
                                onChange={e => setSemester(e.target.value)}
                                options={[
                                    { value: 'all', label: 'Overall Cumulative (CGPA)' },
                                    ...(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ value: String(s), label: `Semester ${s} (SGPA)` }))
                                ]}
                            />
                        ) : (
                            <>
                                <Select
                                    label="Section"
                                    value={section}
                                    onChange={e => setSection(e.target.value)}
                                    options={[
                                        { value: '', label: `All Sections (${(leaderboardData?.availableSections || []).length || 0})` },
                                        ...(leaderboardData?.availableSections || []).map(s => ({ value: s, label: `Section ${s}` })),
                                    ]}
                                />
                                {(leaderboardScopeTab === 'semester' || leaderboardScopeTab === 'subject') && (
                                    <Select
                                        label="Semester"
                                        value={viewSemester || leaderboardData?.targetSemester || ''}
                                        onChange={e => setViewSemester(Number(e.target.value))}
                                        options={(leaderboardData?.availableSemesters || []).map(s => ({ value: s, label: `Semester ${s}` }))}
                                    />
                                )}
                                {leaderboardScopeTab === 'subject' && (
                                    <Select
                                        label="Subject"
                                        value={subjectCode || leaderboardData?.currentSubject?.subject_code || ''}
                                        onChange={e => setSubjectCode(e.target.value)}
                                        options={subjectOptions}
                                    />
                                )}
                            </>
                        )}

                        <Input
                            label="Search Student"
                            placeholder="Find USN or Name..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    {viewTab === 'leaderboard' && (
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid var(--border)' }}>
                            {LEADERBOARD_TABS.map(t => (
                                <Button
                                    key={t.id}
                                    variant={leaderboardScopeTab === t.id ? 'primary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setLeaderboardScopeTab(t.id)}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '6px' }}>{t.icon}</span>
                                    {t.label}
                                </Button>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* TAB 1: OFFICIAL MERIT REGISTER VIEW */}
            {viewTab === 'merit' && (
                <>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total Ranked Students</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{meritReport.summary.totalRanked}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Active students in cohort</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Highest Benchmark Score</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{meritReport.summary.highestScore > 0 ? meritReport.summary.highestScore.toFixed(2) : '—'}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Rank 1 topper GPA</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Batch Average Score</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{meritReport.summary.avgScore > 0 ? meritReport.summary.avgScore.toFixed(2) : '—'}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Mean cumulative score</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Medalists Podium */}
                    {meritReport.podium?.length > 0 && !searchQuery && (
                        <div style={{ marginBottom: '28px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '14px' }}>
                                Department Honor Podium
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
                                {meritReport.podium.map(s => {
                                    const medal = MEDAL_COLORS[s.rank] || MEDAL_COLORS[3];
                                    return (
                                        <Card key={s.usn} style={{ borderTop: `4px solid ${s.rank === 1 ? '#F59E0B' : s.rank === 2 ? '#9CA3AF' : '#B45309'}` }}>
                                            <CardContent style={{ padding: '20px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <span style={{ fontSize: '24px' }}>{medal.icon}</span>
                                                    <span style={{ fontSize: '10px', fontWeight: 900, padding: '3px 8px', borderRadius: '6px', background: medal.bg, color: medal.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                        Rank #{s.rank}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '4px' }}>{s.name}</div>
                                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontFamily: 'monospace', fontWeight: 700, marginBottom: '16px' }}>{s.usn}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                                    <div>
                                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)' }}>SCORE / GPA</div>
                                                        <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>{s.gpa.toFixed(2)}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)' }}>HONORS</div>
                                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{s.honors || 'Distinction'}</div>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Ranked Student Register Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Deterministic Rank Register ({filteredMeritStudents.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>Rank</th>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Score / GPA</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Credits</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Marks</th>
                                            <th style={{ padding: '12px 16px' }}>Academic Honors</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {meritLoading ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading merit records...</td>
                                            </tr>
                                        ) : filteredMeritStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students match the selected merit criteria.</td>
                                            </tr>
                                        ) : (
                                            filteredMeritStudents.map(s => {
                                                const isTop3 = s.rank <= 3;
                                                return (
                                                    <tr key={s.usn} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '14px 16px', fontWeight: 900 }}>
                                                            {isTop3 ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                                    <span>{MEDAL_COLORS[s.rank]?.icon}</span>
                                                                    <span>#{s.rank}</span>
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: 'var(--tx-dim)' }}>#{s.rank}</span>
                                                            )}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                            {s.usn}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                            {s.name}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--tx-main)' }}>
                                                            {s.gpa.toFixed(2)}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                            {s.creditsEarned}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                            {s.totalMarks}
                                                        </td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                background: s.honors?.includes('Distinction') ? 'rgba(34, 197, 94, 0.12)' : 'var(--surface-low)',
                                                                color: s.honors?.includes('Distinction') ? '#16A34A' : 'var(--tx-muted)'
                                                            }}>
                                                                {s.honors || 'Passing'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                            <Link href={`/faculty/students/${s.usn}`} style={{ textDecoration: 'none' }}>
                                                                <Button size="sm" variant="ghost">Profile</Button>
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

            {/* TAB 2: CLASS LEADERBOARD & TOPPERS VIEW */}
            {viewTab === 'leaderboard' && (
                <>
                    {leaderboardError && (
                        <div style={{ padding: '14px 18px', background: 'var(--red-bg)', color: 'var(--red)', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', fontWeight: 600 }}>
                            {leaderboardError}
                        </div>
                    )}

                    {/* Top 3 Podium Cards for Leaderboard */}
                    {leaderboardTop3.length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                            {leaderboardTop3.map(r => {
                                const medal = MEDAL_COLORS[r.rank] || MEDAL_COLORS[3];
                                return (
                                    <Card key={r.usn || r.rank} style={{ borderTop: `4px solid ${r.rank === 1 ? '#F59E0B' : r.rank === 2 ? '#9CA3AF' : '#B45309'}` }}>
                                        <CardContent style={{ padding: '20px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                <span style={{ fontSize: '24px' }}>{medal.icon}</span>
                                                <span style={{ fontSize: '11px', fontWeight: 900, color: 'var(--tx-dim)' }}>Rank #{r.rank}</span>
                                            </div>
                                            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '4px' }}>{r.name}</div>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontFamily: 'monospace', fontWeight: 700, marginBottom: '16px' }}>{r.usn}</div>
                                            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Performance</span>
                                                <span style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>
                                                    {leaderboardScopeTab === 'overall' ? `CGPA ${r.cgpa?.toFixed(2) ?? '—'}` : leaderboardScopeTab === 'semester' ? `SGPA ${r.sgpa?.toFixed(2) ?? '—'}` : `${r.total}/100`}
                                                </span>
                                            </div>
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}

                    {/* Table View */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Class Rankings ({leaderboardRows.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>Rank</th>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Score / Grade</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {leaderboardLoading ? (
                                            <tr>
                                                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading leaderboard...</td>
                                            </tr>
                                        ) : leaderboardRows.length === 0 ? (
                                            <tr>
                                                <td colSpan={5} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No student records found.</td>
                                            </tr>
                                        ) : (
                                            leaderboardRows.map(r => (
                                                <tr key={r.usn || r.rank} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '14px 16px', fontWeight: 900 }}>
                                                        {r.rank <= 3 ? `${MEDAL_COLORS[r.rank]?.icon} #${r.rank}` : `#${r.rank}`}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                        {r.usn}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                        {r.name}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--tx-main)' }}>
                                                        {leaderboardScopeTab === 'overall' ? `CGPA ${r.cgpa?.toFixed(2) ?? '—'}` : leaderboardScopeTab === 'semester' ? `SGPA ${r.sgpa?.toFixed(2) ?? '—'}` : `${r.total}/100`}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                        <Link href={`/faculty/students/${r.usn}`} style={{ textDecoration: 'none' }}>
                                                            <Button size="sm" variant="ghost">Profile</Button>
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
        </div>
    );
}
