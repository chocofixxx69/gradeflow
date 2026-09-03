'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Foundation';

export default function RevalImpactPage() {
    return (
        <AuthGuard role="faculty">
            <RevalImpactContent />
        </AuthGuard>
    );
}

function RevalImpactContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8] });

    // Scope Filters
    const [branch, setBranch] = useState('ALL');
    const [semester, setSemester] = useState('ALL'); // 'ALL' or '1', '2', etc.
    const [batch, setBatch] = useState('');

    // Search & View Controls
    const [searchQuery, setSearchQuery] = useState('');
    const [outcomeFilter, setOutcomeFilter] = useState('ALL');
    const [viewMode, setViewMode] = useState('roster'); // 'roster' | 'student'
    const [selectedStudent, setSelectedStudent] = useState(null); // for student dossier modal

    // Data
    const [report, setReport] = useState({
        summary: { totalApplications: 0, totalStudents: 0, upgradedCount: 0, clearedCount: 0, unchangedCount: 0, decreasedCount: 0, netPassRateGain: 0 },
        deltaRoster: [],
        studentRoster: [],
        branch: 'ALL',
        semester: 'ALL'
    });

    // 1. Fetch metadata
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) {
                    setMeta(res);
                }
            } catch (err) {
                console.error('Failed to load meta:', err);
            }
        }
        loadMeta();
    }, []);

    // 2. Fetch revaluation impact report
    const loadRevalReport = useCallback(async () => {
        if (!branch) return;
        setLoading(true);
        try {
            const query = { branch, semester, t: Date.now() };
            if (batch) query.batch = batch;

            const res = await apiRequest('/api/faculty/analytics/reval-impact', { query });
            if (res) {
                setReport(res);
            }
        } catch (err) {
            console.error('Failed to load revaluation impact report:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, semester, batch]);

    useEffect(() => {
        loadRevalReport();
    }, [loadRevalReport]);

    // 3. Filtered Data for Instant Searching
    const filteredRoster = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return (report.deltaRoster || []).filter(item => {
            const matchSearch = !query ||
                item.usn?.toLowerCase().includes(query) ||
                item.name?.toLowerCase().includes(query) ||
                item.subject_code?.toLowerCase().includes(query) ||
                item.subject_name?.toLowerCase().includes(query) ||
                item.revalExam?.toLowerCase().includes(query) ||
                item.revalExamLabel?.toLowerCase().includes(query);

            const matchOutcome = outcomeFilter === 'ALL' || item.outcome === outcomeFilter;
            return matchSearch && matchOutcome;
        });
    }, [report.deltaRoster, searchQuery, outcomeFilter]);

    const filteredStudents = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return (report.studentRoster || []).map(stu => {
            const matchingApps = stu.applications.filter(item => {
                const matchSearch = !query ||
                    item.usn?.toLowerCase().includes(query) ||
                    item.name?.toLowerCase().includes(query) ||
                    item.subject_code?.toLowerCase().includes(query) ||
                    item.subject_name?.toLowerCase().includes(query) ||
                    item.revalExam?.toLowerCase().includes(query) ||
                    item.revalExamLabel?.toLowerCase().includes(query);

                const matchOutcome = outcomeFilter === 'ALL' || item.outcome === outcomeFilter;
                return matchSearch && matchOutcome;
            });
            return { ...stu, filteredApps: matchingApps };
        }).filter(stu => stu.filteredApps.length > 0);
    }, [report.studentRoster, searchQuery, outcomeFilter]);

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Summary
        const summaryData = [
            ['GradeFlow - Revaluation Impact & Grade Delta Analysis'],
            [`Department: ${branch}`, `Semester: ${semester === 'ALL' ? 'All Semesters (Cumulative)' : `Sem ${semester}`}`, `Batch: ${batch || 'All'}`],
            [`Generated on: ${new Date().toLocaleString()}`],
            [],
            ['Total Students Applied', report.summary.totalStudents || report.studentRoster?.length || 0],
            ['Total Subjects Evaluated', report.summary.totalApplications],
            ['Total Grades Upgraded', report.summary.upgradedCount],
            ['Backlogs Cleared via Reval', report.summary.clearedCount],
            ['Confirmed / Unchanged', report.summary.unchangedCount || 0],
            ['Marks Decreased', report.summary.decreasedCount || 0],
            ['Net Pass Rate Gain', `${report.summary.netPassRateGain}%`],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // 2. Delta Roster
        const headers = ['#', 'Semester', 'USN', 'Student Name', 'Total Subjects Put By Student', 'Subject Code', 'Subject Name', 'Exam Cycle / Session', 'When Applied / Declared', 'Pre-Marks', 'Pre-Grade', 'Post-Marks', 'Post-Grade', 'Delta (+/-)', 'Outcome'];
        const rows = (filteredRoster || []).map((d, idx) => [
            idx + 1,
            `Sem ${d.semester}`,
            d.usn,
            d.name,
            d.totalStudentApplications || 1,
            d.subject_code,
            d.subject_name,
            d.revalExamLabel || d.revalExam,
            d.appliedDate,
            d.preMarks,
            d.preGrade,
            d.postMarks,
            d.postGrade,
            d.delta > 0 ? `+${d.delta}` : d.delta,
            d.outcome
        ]);

        const wsRoster = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, wsRoster, 'Reval Delta Roster');

        XLSX.writeFile(wb, `Reval_Impact_${branch}_Sem${semester}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text(`VTU Revaluation Impact & Grade Delta Report (${branch} - ${semester === 'ALL' ? 'All Semesters' : `Sem ${semester}`})`, 14, 14);

        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text(`Students: ${report.summary.totalStudents || report.studentRoster?.length || 0} | Subjects: ${report.summary.totalApplications} | Upgraded: ${report.summary.upgradedCount} | Cleared: ${report.summary.clearedCount} | Net Gain: ${report.summary.netPassRateGain}% | Date: ${new Date().toLocaleDateString()}`, 14, 20);

        const tableHead = [['#', 'Sem', 'USN', 'Name', 'Subject', 'Exam Session', 'When Declared', 'Pre', 'Post', 'Delta', 'Outcome']];
        const tableBody = (filteredRoster || []).map((d, idx) => [
            idx + 1,
            `S${d.semester}`,
            d.usn,
            d.name,
            `${d.subject_code}\n${d.subject_name}`,
            d.revalExamLabel || d.revalExam,
            d.appliedDate,
            `${d.preMarks} (${d.preGrade})`,
            `${d.postMarks} (${d.postGrade})`,
            d.delta > 0 ? `+${d.delta}` : `${d.delta}`,
            d.outcome
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 24,
            theme: 'striped',
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        doc.save(`Reval_Impact_${branch}_Sem${semester}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>University Examinations &bull; VTU Engine</PageHeaderEyebrow>
                    <PageHeaderTitle>Revaluation Impact &amp; Grade Delta Analysis</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Complete student-by-student ledger tracking all subjects put for revaluation, total subject counts, examination sessions, and real before-and-after mark changes.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={filteredRoster.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={filteredRoster.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadRevalReport} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Scope Filter Toolbar */}
            <Card style={{ marginBottom: '12px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                        <div>
                            <Select
                                label="Department / Branch"
                                value={branch}
                                onChange={e => setBranch(e.target.value)}
                                options={[{ value: 'ALL', label: 'ALL - All Branches / Departments' }, ...meta.branches.filter(b => b.code !== 'ALL').map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Semester"
                                value={semester}
                                onChange={e => setSemester(e.target.value)}
                                options={[
                                    { value: 'ALL', label: 'ALL - All Semesters (Degree Lifetime History)' },
                                    ...meta.semesters.map(s => ({ value: String(s), label: `Semester ${s}` }))
                                ]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Batch (Optional)"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={[{ value: '', label: 'All Batches' }, ...meta.batches.map(b => ({ value: b, label: `${b.slice(-2)} Batch (${b})` }))]}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => { setBranch('ALL'); setSemester('ALL'); setBatch(''); }}
                                style={{
                                    height: '38px', padding: '0 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                                    cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px',
                                    background: branch === 'ALL' && semester === 'ALL' && !batch
                                        ? 'var(--surface-alt)' : 'var(--accent)',
                                    color: branch === 'ALL' && semester === 'ALL' && !batch
                                        ? 'var(--tx-muted)' : '#fff',
                                    border: '1.5px solid ' + (branch === 'ALL' && semester === 'ALL' && !batch ? 'var(--border)' : 'var(--accent)'),
                                    transition: 'all 0.2s',
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>people</span>
                                Show All Students
                            </button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Active-filter notice */}
            {(branch !== 'ALL' || semester !== 'ALL' || batch) && (
                <div style={{
                    marginBottom: '16px', padding: '10px 16px', borderRadius: '8px',
                    background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
                    display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--tx-main)'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '18px', color: '#6366F1' }}>filter_list</span>
                    <span>
                        Showing filtered view — <strong>{branch !== 'ALL' ? branch : 'All Branches'}</strong>
                        {semester !== 'ALL' ? <>, Sem <strong>{semester}</strong></> : ', All Semesters'}
                        {batch ? <>, Batch <strong>{batch}</strong></> : null}.
                        &nbsp;Click <strong>Show All Students</strong> to see all {report.summary?.totalApplications || 0} records across the entire college.
                    </span>
                </div>
            )}

            {/* 7 Metric KPI Strip */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 155px), 1fr))', gap: '12px', marginBottom: '24px' }}>
                {[
                    { label: 'Students Applied', value: report.summary.totalStudents || report.studentRoster?.length || 0, color: 'var(--tx-main)', icon: 'people' },
                    { label: 'Subjects Revalued', value: report.summary.totalApplications, color: 'var(--tx-main)', icon: 'assignment' },
                    { label: 'Grades Upgraded', value: report.summary.upgradedCount, color: '#3B82F6', icon: 'trending_up' },
                    { label: 'Backlogs Cleared', value: report.summary.clearedCount, color: '#10B981', icon: 'verified' },
                    { label: 'Confirmed / Same', value: report.summary.unchangedCount ?? 0, color: 'var(--tx-muted)', icon: 'remove_done' },
                    { label: 'Marks Decreased', value: report.summary.decreasedCount ?? 0, color: '#EF4444', icon: 'trending_down' },
                    { label: 'Net Pass Rate Gain', value: `+${report.summary.netPassRateGain}%`, color: '#6366F1', icon: 'speed' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</span>
                            <span className="material-icons-round" style={{ fontSize: '16px', color: item.color, opacity: 0.8 }}>{item.icon}</span>
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            {/* Search, Filter & View Mode Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flex: 1, minWidth: '280px', maxWidth: '600px' }}>
                    <div style={{ position: 'relative', width: '100%' }}>
                        <span className="material-icons-round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-dim)', fontSize: '18px' }}>search</span>
                        <input
                            type="text"
                            placeholder="Search student name, USN, subject code/name, or exam session..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 14px 10px 38px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--tx-main)',
                                fontSize: '13px',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <select
                        value={outcomeFilter}
                        onChange={e => setOutcomeFilter(e.target.value)}
                        style={{
                            padding: '10px 14px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--tx-main)',
                            fontSize: '13px',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="ALL">All Outcomes</option>
                        <option value="Cleared Backlog">🟢 Cleared Backlog</option>
                        <option value="Grade Upgraded">🔵 Grade Upgraded</option>
                        <option value="Confirmed">⚪ Confirmed / Unchanged</option>
                        <option value="Marks Decreased">🔴 Marks Decreased</option>
                    </select>
                </div>

                {/* View Mode Toggle */}
                <div style={{ display: 'flex', background: 'var(--surface-low)', padding: '3px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <button
                        onClick={() => setViewMode('roster')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: 'none',
                            background: viewMode === 'roster' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'roster' ? '#FFF' : 'var(--tx-muted)',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>view_list</span>
                        Subject Ledger ({filteredRoster.length})
                    </button>
                    <button
                        onClick={() => setViewMode('student')}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            border: 'none',
                            background: viewMode === 'student' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'student' ? '#FFF' : 'var(--tx-muted)',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>groups</span>
                        Grouped by Student ({filteredStudents.length})
                    </button>
                </div>
            </div>

            {/* VIEW MODE 1: Detailed Subject Ledger */}
            {viewMode === 'roster' && (
                <Card style={{ overflow: 'hidden' }}>
                    <CardHeader style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '15px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>published_with_changes</span>
                            Subject Revaluation Delta Roster ({filteredRoster.length} Entries)
                        </CardTitle>
                    </CardHeader>
                    <CardContent style={{ padding: 0 }}>
                        <div style={{ overflowX: 'auto', maxHeight: '650px' }}>
                            <table style={{ width: '100%', minWidth: '980px', borderCollapse: 'collapse', fontSize: '13px' }}>
                                <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                    <tr>
                                        <th style={{ padding: '10px 10px', textAlign: 'center', width: '40px' }}>#</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '75px' }}>Sem</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '170px' }}>Student</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '200px' }}>Subject</th>
                                        <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '160px' }}>Exam Session</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '75px' }}>Pre-Score</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '75px' }}>Post-Score</th>
                                        <th style={{ padding: '10px 8px', textAlign: 'center', width: '65px' }}>Delta</th>
                                        <th style={{ padding: '10px 12px', textAlign: 'center', width: '125px' }}>Outcome</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRoster.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                                {loading ? 'Analyzing revaluation deltas...' : (
                                                    <>
                                                        <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--tx-dim)', marginBottom: '8px' }}>search_off</span>
                                                        <div>No revaluation records found matching your filters.</div>
                                                        <div style={{ fontSize: '11px', marginTop: '6px' }}>Try selecting "ALL - All Semesters" or clearing search filters.</div>
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRoster.map((d, idx) => {
                                            const isCleared = d.isCleared;
                                            const isUpgraded = d.delta > 0;
                                            const isDecreased = d.delta < 0;
                                            const studentObj = report.studentRoster?.find(s => s.usn === d.usn);

                                            return (
                                                <tr
                                                    key={`${d.usn}-${d.semester}-${d.subject_code}-${idx}`}
                                                    style={{
                                                        borderBottom: '1px solid var(--border-low)',
                                                        background: isCleared ? 'rgba(16, 185, 129, 0.04)' : isUpgraded ? 'rgba(59, 130, 246, 0.03)' : isDecreased ? 'rgba(239, 68, 68, 0.02)' : 'transparent'
                                                    }}
                                                >
                                                    <td style={{ padding: '10px', color: 'var(--tx-dim)', fontSize: '12px', textAlign: 'center' }}>{idx + 1}</td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        <span style={{ display: 'inline-block', whiteSpace: 'nowrap', fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '5px', background: 'var(--surface-low)', color: 'var(--tx-main)', border: '1px solid var(--border)' }}>
                                                            Sem {d.semester}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ fontWeight: 700, color: 'var(--tx-main)', fontSize: '13px', lineHeight: 1.2 }}>
                                                            {d.name}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
                                                            <button
                                                                onClick={() => setSelectedStudent(studentObj || { usn: d.usn, name: d.name, applications: [d], totalSubjectsPut: 1, semesters: [d.semester] })}
                                                                style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontFamily: 'monospace', fontWeight: 800, fontSize: '12px', padding: 0, textDecoration: 'underline' }}
                                                            >
                                                                {d.usn}
                                                            </button>
                                                            {d.totalStudentApplications > 1 && (
                                                                <span
                                                                    onClick={() => setSelectedStudent(studentObj)}
                                                                    style={{ fontSize: '10px', fontWeight: 800, padding: '1px 5px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.1)', color: '#6366F1', cursor: 'pointer', border: '1px solid rgba(99, 102, 241, 0.25)', whiteSpace: 'nowrap' }}
                                                                >
                                                                    {d.totalStudentApplications} subjects &rarr;
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontWeight: 800, fontFamily: 'monospace', color: 'var(--tx-main)', fontSize: '12.5px' }}>
                                                                {d.subject_code}
                                                            </span>
                                                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '4px', background: 'var(--surface-low)', color: 'var(--tx-dim)', border: '1px solid var(--border-low)' }}>
                                                                {d.credits} Cr
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px', lineHeight: 1.25, fontWeight: 500 }}>
                                                            {d.subject_name}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ display: 'inline-block', fontSize: '11px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.08)', color: '#6366F1', border: '1px solid rgba(99, 102, 241, 0.2)', whiteSpace: 'nowrap' }}>
                                                            {d.revalExamLabel || d.revalExam}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '12px' }}>calendar_today</span>
                                                            {d.appliedDate}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        <div style={{ fontWeight: 700, color: 'var(--tx-muted)', fontSize: '13px' }}>{d.preMarks}</div>
                                                        <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 800, background: d.preGrade === 'F' ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface-low)', color: d.preGrade === 'F' ? '#EF4444' : 'var(--tx-dim)' }}>
                                                            {d.preGrade}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        <div style={{ fontWeight: 800, color: isCleared ? '#10B981' : isUpgraded ? 'var(--primary)' : isDecreased ? '#EF4444' : 'inherit', fontSize: '13px' }}>{d.postMarks}</div>
                                                        <span style={{ display: 'inline-block', padding: '1px 5px', borderRadius: '3px', fontSize: '10px', fontWeight: 800, background: isCleared ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-low)', color: isCleared ? '#10B981' : 'var(--tx-main)' }}>
                                                            {d.postGrade}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                                                        {d.delta > 0 ? (
                                                            <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 900, background: 'rgba(16, 185, 129, 0.14)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                                                +{d.delta}
                                                            </span>
                                                        ) : d.delta < 0 ? (
                                                            <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 900, background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                                                                {d.delta}
                                                            </span>
                                                        ) : (
                                                            <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '5px', fontSize: '11.5px', fontWeight: 700, background: 'var(--surface-low)', color: 'var(--tx-muted)', border: '1px solid var(--border-low)' }}>
                                                                0
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            padding: '3px 8px', borderRadius: '5px',
                                                            fontSize: '10.5px', fontWeight: 800,
                                                            whiteSpace: 'nowrap',
                                                            background: isCleared ? 'rgba(16, 185, 129, 0.15)' : isUpgraded ? 'rgba(59, 130, 246, 0.15)' : isDecreased ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface-low)',
                                                            color: isCleared ? '#10B981' : isUpgraded ? '#3B82F6' : isDecreased ? '#EF4444' : 'var(--tx-muted)',
                                                            border: `1px solid ${isCleared ? 'rgba(16, 185, 129, 0.3)' : isUpgraded ? 'rgba(59, 130, 246, 0.3)' : isDecreased ? 'rgba(239, 68, 68, 0.25)' : 'var(--border)'}`
                                                        }}>
                                                            {isCleared ? '🟢 Cleared' : isUpgraded ? '🔵 Upgraded' : isDecreased ? '🔴 Decreased' : '⚪ Confirmed'}
                                                        </span>
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

            {/* VIEW MODE 2: Grouped by Student Cards */}
            {viewMode === 'student' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {filteredStudents.length === 0 ? (
                        <Card>
                            <CardContent style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                <span className="material-icons-round" style={{ fontSize: '36px', color: 'var(--tx-dim)', marginBottom: '8px' }}>person_off</span>
                                <div>No student revaluations matching your current query.</div>
                            </CardContent>
                        </Card>
                    ) : (
                        filteredStudents.map(stu => (
                            <Card key={stu.usn} style={{ overflow: 'hidden', border: '1px solid var(--border)' }}>
                                <CardHeader style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                        <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: 'var(--primary)', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '15px', flexShrink: 0 }}>
                                            {stu.name?.[0]?.toUpperCase() || 'S'}
                                        </div>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>{stu.name}</span>
                                                <Link href={`/faculty/students/${stu.usn}`} style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '13.5px', color: 'var(--primary)', textDecoration: 'none' }}>
                                                    {stu.usn}
                                                </Link>
                                                <span style={{ fontSize: '11px', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.12)', color: '#6366F1', border: '1px solid rgba(99, 102, 241, 0.25)' }}>
                                                    🎓 Put {stu.totalSubjectsPut} Subject(s) for Revaluation
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                                Semesters Applied: <strong>{stu.semesters.map(s => `Sem ${s}`).join(', ')}</strong>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        {stu.cleared > 0 && (
                                            <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                                                🟢 {stu.cleared} Backlog Cleared
                                            </span>
                                        )}
                                        {stu.upgraded > 0 && (
                                            <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                                                🔵 {stu.upgraded} Upgraded
                                            </span>
                                        )}
                                        {stu.decreased > 0 && (
                                            <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.25)' }}>
                                                🔴 {stu.decreased} Decreased
                                            </span>
                                        )}
                                        {stu.confirmed > 0 && (
                                            <span style={{ padding: '3px 10px', borderRadius: '6px', fontSize: '11.5px', fontWeight: 800, background: 'var(--surface)', color: 'var(--tx-muted)', border: '1px solid var(--border)' }}>
                                                ⚪ {stu.confirmed} Confirmed
                                            </span>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent style={{ padding: '16px 20px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', gap: '14px' }}>
                                        {stu.filteredApps.map(app => (
                                            <div
                                                key={`${app.subject_code}-${app.semester}`}
                                                style={{
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '10px',
                                                    padding: '14px',
                                                    background: app.isCleared ? 'rgba(16, 185, 129, 0.04)' : app.delta > 0 ? 'rgba(59, 130, 246, 0.03)' : 'var(--surface-low)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '10px'
                                                }}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{ fontSize: '10.5px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: 'var(--surface)', color: 'var(--tx-main)', border: '1px solid var(--border)' }}>
                                                                Sem {app.semester}
                                                            </span>
                                                            <span style={{ fontWeight: 800, fontSize: '13.5px', fontFamily: 'monospace', color: 'var(--tx-main)' }}>
                                                                {app.subject_code}
                                                            </span>
                                                            <span style={{ fontSize: '10.5px', color: 'var(--tx-dim)' }}>
                                                                ({app.credits} Cr)
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '3px', fontWeight: 600 }}>
                                                            {app.subject_name}
                                                        </div>
                                                    </div>
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: '5px',
                                                        fontSize: '11px', fontWeight: 800,
                                                        background: app.isCleared ? 'rgba(16, 185, 129, 0.15)' : app.delta > 0 ? 'rgba(59, 130, 246, 0.15)' : app.delta < 0 ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface)',
                                                        color: app.isCleared ? '#10B981' : app.delta > 0 ? '#3B82F6' : app.delta < 0 ? '#EF4444' : 'var(--tx-muted)',
                                                        border: `1px solid ${app.isCleared ? 'rgba(16, 185, 129, 0.3)' : app.delta > 0 ? 'rgba(59, 130, 246, 0.3)' : 'var(--border)'}`
                                                    }}>
                                                        {app.outcome}
                                                    </span>
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-low)', fontSize: '12.5px' }}>
                                                    <div>
                                                        <span style={{ color: 'var(--tx-dim)', fontSize: '10.5px', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Regular Exam</span>
                                                        <span style={{ fontWeight: 800, color: 'var(--tx-main)', fontSize: '14px' }}>{app.preMarks}</span> <span style={{ fontSize: '11.5px', fontWeight: 800, color: app.preGrade === 'F' ? '#EF4444' : 'var(--tx-dim)' }}>({app.preGrade})</span>
                                                    </div>
                                                    <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>arrow_forward</span>
                                                    <div>
                                                        <span style={{ color: 'var(--tx-dim)', fontSize: '10.5px', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Reval Result</span>
                                                        <span style={{ fontWeight: 900, color: app.isCleared ? '#10B981' : app.delta > 0 ? 'var(--primary)' : 'var(--tx-main)', fontSize: '14px' }}>{app.postMarks}</span> <span style={{ fontSize: '11.5px', fontWeight: 800, color: app.isCleared ? '#10B981' : 'var(--tx-main)' }}>({app.postGrade})</span>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: 'var(--tx-dim)', fontSize: '10.5px', textTransform: 'uppercase', display: 'block', fontWeight: 700 }}>Score Delta</span>
                                                        <span style={{ fontWeight: 900, fontSize: '14px', color: app.delta > 0 ? '#10B981' : app.delta < 0 ? '#EF4444' : 'var(--tx-dim)' }}>
                                                            {app.delta > 0 ? `+${app.delta}` : app.delta}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--tx-dim)', flexWrap: 'wrap', gap: '6px' }}>
                                                    <span><strong>Exam Session:</strong> {app.revalExamLabel || app.revalExam}</span>
                                                    <span><strong>Declared:</strong> {app.appliedDate}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            )}

            {/* Student Dossier Modal */}
            {selectedStudent && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 9999,
                    background: 'rgba(0, 0, 0, 0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px',
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '750px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.3)'
                    }}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-low)' }}>
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Student Revaluation Dossier</div>
                                <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)', marginTop: '2px' }}>
                                    {selectedStudent.name} <span style={{ fontFamily: 'monospace', color: 'var(--primary)', fontSize: '15px' }}>({selectedStudent.usn})</span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                    Submitted {selectedStudent.applications?.length || 1} subject(s) for university revaluation
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedStudent(null)}
                                style={{ background: 'var(--surface)', border: '1px solid var(--border)', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--tx-main)' }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                            </button>
                        </div>

                        <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {selectedStudent.applications?.map((app, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: '10px',
                                        padding: '14px',
                                        background: app.isCleared ? 'rgba(16, 185, 129, 0.05)' : app.delta > 0 ? 'rgba(59, 130, 246, 0.04)' : 'var(--surface-low)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '11px', fontWeight: 800, padding: '1px 6px', borderRadius: '4px', background: 'var(--surface)', color: 'var(--tx-main)', border: '1px solid var(--border)' }}>
                                                    Sem {app.semester}
                                                </span>
                                                <span style={{ fontWeight: 800, fontSize: '14px', fontFamily: 'monospace', color: 'var(--tx-main)' }}>
                                                    {app.subject_code}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '2px', fontWeight: 600 }}>
                                                {app.subject_name}
                                            </div>
                                        </div>
                                        <span style={{
                                            padding: '3px 8px', borderRadius: '4px',
                                            fontSize: '11px', fontWeight: 800,
                                            background: app.isCleared ? 'rgba(16, 185, 129, 0.15)' : app.delta > 0 ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface)',
                                            color: app.isCleared ? '#10B981' : app.delta > 0 ? '#3B82F6' : 'var(--tx-muted)'
                                        }}>
                                            {app.outcome}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-low)' }}>
                                        <div>
                                            <span style={{ fontSize: '10.5px', color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block' }}>Regular Exam</span>
                                            <span style={{ fontWeight: 800, fontSize: '14px' }}>{app.preMarks}</span> ({app.preGrade})
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>arrow_forward</span>
                                        <div>
                                            <span style={{ fontSize: '10.5px', color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block' }}>Reval Score</span>
                                            <span style={{ fontWeight: 900, fontSize: '14px', color: app.isCleared ? '#10B981' : app.delta > 0 ? 'var(--primary)' : 'inherit' }}>{app.postMarks}</span> ({app.postGrade})
                                        </div>
                                        <div>
                                            <span style={{ fontSize: '10.5px', color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block' }}>Delta</span>
                                            <span style={{ fontWeight: 900, fontSize: '14px', color: app.delta > 0 ? '#10B981' : app.delta < 0 ? '#EF4444' : 'var(--tx-dim)' }}>
                                                {app.delta > 0 ? `+${app.delta}` : app.delta}
                                            </span>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11.5px', color: 'var(--tx-dim)' }}>
                                        <span><strong>Exam Cycle:</strong> {app.revalExamLabel || app.revalExam}</span>
                                        <span><strong>Date Declared:</strong> {app.appliedDate}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', background: 'var(--surface-low)', display: 'flex', justifyContent: 'flex-end' }}>
                            <Button onClick={() => setSelectedStudent(null)} variant="secondary">
                                Close Dossier
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
