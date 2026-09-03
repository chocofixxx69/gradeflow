'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AuthGuard from '../../../../components/AuthGuard';
import { apiRequest } from '../../../../lib/api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

export default function SubjectAnalyticsPage() {
    return (
        <AuthGuard role="faculty">
            <SubjectAnalyticsContent />
        </AuthGuard>
    );
}

const GRADE_COLORS = {
    'O': '#10B981',
    'A+': '#10B981',
    'A': '#34D399',
    'B+': '#3B82F6',
    'B': '#60A5FA',
    'C': '#F59E0B',
    'P': '#FBBF24',
    'F': '#EF4444'
};

function SubjectAnalyticsContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8], subjects: [] });

    // Filters
    const [branch, setBranch] = useState('CS');
    const [semester, setSemester] = useState(3);
    const [subjectCode, setSubjectCode] = useState('');
    const [batch, setBatch] = useState('');
    const [searchQuery, setSearchQuery] = useState('');

    // Data
    const [analytics, setAnalytics] = useState({
        subject: { code: '', name: '', credits: 3, semester: 3, scheme: '2022' },
        kpis: { appeared: 0, passed: 0, failed: 0, passRate: 0, avgMarks: 0, highestMarks: 0 },
        gradeDistribution: [],
        topPerformers: [],
        roster: []
    });

    // 1. Fetch metadata
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) {
                    setMeta(res);
                    if (res.branches?.length > 0) setBranch(res.branches[0].code);
                }
            } catch (err) {
                console.error('Meta loading failed:', err);
            }
        }
        loadMeta();
    }, []);

    // Filter available subjects based on selected branch and semester
    const availableSubjects = useMemo(() => {
        return (meta.subjects || []).filter(s => 
            (!branch || (s.branch || '').toUpperCase() === branch.toUpperCase()) &&
            (!semester || Number(s.semester) === Number(semester))
        );
    }, [meta.subjects, branch, semester]);

    // Update selected subject when available subjects change
    useEffect(() => {
        if (availableSubjects.length > 0 && (!subjectCode || !availableSubjects.some(s => s.code === subjectCode))) {
            setSubjectCode(availableSubjects[0].code);
        }
    }, [availableSubjects, subjectCode]);

    // 2. Fetch subject analytics
    const loadSubjectData = useCallback(async () => {
        if (!subjectCode) return;
        setLoading(true);
        try {
            const query = { subjectCode, branch, semester };
            if (batch) query.batch = batch;
            const res = await apiRequest('/api/faculty/analytics/subject', { query });
            if (res) {
                setAnalytics(res);
            }
        } catch (err) {
            console.error('Subject analytics error:', err);
        } finally {
            setLoading(false);
        }
    }, [subjectCode, branch, semester, batch]);

    useEffect(() => {
        if (subjectCode) {
            loadSubjectData();
        }
    }, [subjectCode, branch, semester, batch, loadSubjectData]);

    const filteredRoster = (analytics.roster || []).filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    });

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Summary Sheet
        const summaryData = [
            ['GradeFlow - Subject Performance Report'],
            [`Subject: ${analytics.subject.code} - ${analytics.subject.name}`],
            [`Department: ${branch}`, `Semester: Sem ${semester}`, `Batch: ${batch || 'All'}`],
            [`Generated on: ${new Date().toLocaleString()}`],
            [],
            ['PERFORMANCE METRICS'],
            ['Total Students Appeared', analytics.kpis.appeared],
            ['Passed', analytics.kpis.passed],
            ['Failed / Arrears', analytics.kpis.failed],
            ['Pass Percentage', `${analytics.kpis.passRate}%`],
            ['Average Marks', analytics.kpis.avgMarks],
            ['Highest Marks', analytics.kpis.highestMarks],
            [],
            ['GRADE DISTRIBUTION'],
            ...analytics.gradeDistribution.map(g => [`Grade ${g.grade}`, g.count, `${g.percentage}%`])
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // 2. Top Performers Sheet
        const topHeaders = ['Rank', 'USN', 'Student Name', 'Internal (CIE)', 'External (SEE)', 'Total Marks', 'Grade'];
        const topRows = analytics.topPerformers.map(tp => [
            tp.rank, tp.usn, tp.name, tp.internal ?? '—', tp.external ?? '—', tp.total, tp.grade
        ]);
        const wsTop = XLSX.utils.aoa_to_sheet([topHeaders, ...topRows]);
        XLSX.utils.book_append_sheet(wb, wsTop, 'Top 10 Performers');

        // 3. Full Student Roster Sheet
        const rosterHeaders = ['#', 'USN', 'Student Name', 'Branch', 'Internal', 'External', 'Total', 'Grade', 'Result'];
        const rosterRows = (analytics.roster || []).map((r, idx) => [
            idx + 1, r.usn, r.name, r.branch, r.internal ?? '—', r.external ?? '—', r.total ?? '—', r.grade, r.isFail ? 'FAIL' : 'PASS'
        ]);
        const wsRoster = XLSX.utils.aoa_to_sheet([rosterHeaders, ...rosterRows]);
        XLSX.utils.book_append_sheet(wb, wsRoster, 'Complete Roster');

        XLSX.writeFile(wb, `Subject_Analytics_${analytics.subject.code}_${branch}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Subject Performance Report`, 14, 15);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${analytics.subject.code} - ${analytics.subject.name} (${analytics.subject.credits} Credits)`, 14, 21);
        doc.text(`Department: ${branch} | Sem: ${semester} | Appeared: ${analytics.kpis.appeared} | Pass Rate: ${analytics.kpis.passRate}% | Avg Marks: ${analytics.kpis.avgMarks}`, 14, 26);

        // Top Performers Table
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Top Performers', 14, 34);

        const topHead = [['Rank', 'USN', 'Student Name', 'Internal', 'External', 'Total', 'Grade']];
        const topBody = analytics.topPerformers.map(tp => [
            `#${tp.rank}`, tp.usn, tp.name, tp.internal ?? '—', tp.external ?? '—', tp.total, tp.grade
        ]);

        autoTable(doc, {
            head: topHead,
            body: topBody,
            startY: 37,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        const lastY = doc.lastAutoTable?.finalY || 100;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Complete Student Scores Roster', 14, lastY + 10);

        const rosterHead = [['#', 'USN', 'Name', 'Int', 'Ext', 'Total', 'Grade', 'Result']];
        const rosterBody = (filteredRoster || []).map((r, i) => [
            i + 1, r.usn, r.name, r.internal ?? '—', r.external ?? '—', r.total ?? '—', r.grade, r.isFail ? 'FAIL' : 'PASS'
        ]);

        autoTable(doc, {
            head: rosterHead,
            body: rosterBody,
            startY: lastY + 13,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
        });

        doc.save(`Subject_Report_${analytics.subject.code}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Analytics</PageHeaderEyebrow>
                    <PageHeaderTitle>Subject Performance Analytics</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Single-subject performance metrics, grade spread distribution, and top performers leaderboard.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={analytics.kpis.appeared === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={analytics.kpis.appeared === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadSubjectData} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filter Toolbar */}
            <Card style={{ marginBottom: '24px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                        <div>
                            <Select
                                label="Branch / Department"
                                value={branch}
                                onChange={e => setBranch(e.target.value)}
                                options={meta.branches.map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))}
                            />
                        </div>
                        <div>
                            <Select
                                label="Semester"
                                value={semester}
                                onChange={e => setSemester(Number(e.target.value))}
                                options={meta.semesters.map(s => ({ value: s, label: `Semester ${s}` }))}
                            />
                        </div>
                        <div>
                            <Select
                                label="Select Subject"
                                value={subjectCode}
                                onChange={e => setSubjectCode(e.target.value)}
                                options={availableSubjects.length > 0 
                                    ? availableSubjects.map(s => ({ value: s.code, label: `${s.code} - ${s.name}` }))
                                    : [{ value: subjectCode || '', label: subjectCode || 'No subjects found' }]
                                }
                            />
                        </div>
                        <div>
                            <Select
                                label="Batch (Optional)"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={[{ value: '', label: 'All Batches' }, ...meta.batches.map(b => ({ value: b, label: `${b} Batch` }))]}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Subject Overview Banner */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px 24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 900, color: '#FFFFFF', background: 'var(--primary)', padding: '3px 10px', borderRadius: '6px', letterSpacing: '0.04em' }}>
                            {analytics.subject.code || subjectCode}
                        </span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-muted)' }}>
                            Semester {analytics.subject.semester || semester} • {analytics.subject.credits || 3} Credits
                        </span>
                    </div>
                    <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, color: 'var(--tx-main)' }}>
                        {analytics.subject.name || 'Subject Analytics'}
                    </h2>
                </div>
            </div>

            {/* 6 KPI Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '14px', marginBottom: '24px' }}>
                {[
                    { label: 'Total Appeared', value: analytics.kpis.appeared, color: 'var(--tx-main)' },
                    { label: 'Passed', value: analytics.kpis.passed, color: '#10B981' },
                    { label: 'Failed (Arrears)', value: analytics.kpis.failed, color: analytics.kpis.failed > 0 ? '#EF4444' : 'var(--tx-muted)' },
                    { label: 'Pass Rate', value: `${analytics.kpis.passRate}%`, color: analytics.kpis.passRate >= 75 ? '#10B981' : analytics.kpis.passRate >= 50 ? '#F59E0B' : '#EF4444' },
                    { label: 'Average Marks', value: analytics.kpis.avgMarks, color: 'var(--primary)' },
                    { label: 'Highest Marks', value: analytics.kpis.highestMarks, color: '#6366F1' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            {/* Two Column Grid: Grade Distribution Chart + Top Performers */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '24px', marginBottom: '28px' }}>
                {/* Grade Distribution Bar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>bar_chart</span>
                            Grade Distribution
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div style={{ width: '100%', height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.gradeDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                                    <XAxis dataKey="grade" tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                    <YAxis allowDecimals={false} tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                                        <div style={{ fontWeight: 800 }}>Grade {d.grade}</div>
                                                        <div style={{ color: 'var(--primary)', fontWeight: 700 }}>{d.count} Students ({d.percentage}%)</div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                        {analytics.gradeDistribution.map(entry => (
                                            <Cell key={`cell-${entry.grade}`} fill={GRADE_COLORS[entry.grade] || 'var(--primary)'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Top 10 Performers Leaderboard */}
                <Card>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: '#F59E0B' }}>emoji_events</span>
                            Top Performers Leaderboard
                        </CardTitle>
                    </CardHeader>
                    <CardContent style={{ padding: 0 }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                    <tr>
                                        <th style={{ padding: '8px 12px', textAlign: 'center', width: '45px' }}>Rank</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>USN</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'left' }}>Student Name</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'center' }}>CIE</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'center' }}>SEE</th>
                                        <th style={{ padding: '8px 12px', textAlign: 'center' }}>Total</th>
                                        <th style={{ padding: '8px 8px', textAlign: 'center' }}>Grade</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {analytics.topPerformers.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                                {loading ? 'Loading top performers...' : 'No marks recorded for this subject.'}
                                            </td>
                                        </tr>
                                    ) : (
                                        analytics.topPerformers.map((tp, idx) => (
                                            <tr key={tp.usn} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                    <span style={{
                                                        width: '24px', height: '24px', borderRadius: '50%',
                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 900, fontSize: '11px',
                                                        background: idx === 0 ? '#F59E0B' : idx === 1 ? '#9CA3AF' : idx === 2 ? '#B45309' : 'var(--surface-low)',
                                                        color: idx < 3 ? '#FFFFFF' : 'var(--tx-dim)'
                                                    }}>
                                                        {tp.rank}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 12px', fontWeight: 800, fontFamily: 'monospace' }}>{tp.usn}</td>
                                                <td style={{ padding: '8px 12px', fontWeight: 600 }}>{tp.name}</td>
                                                <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--tx-muted)' }}>{tp.internal ?? '—'}</td>
                                                <td style={{ padding: '8px 8px', textAlign: 'center', color: 'var(--tx-muted)' }}>{tp.external ?? '—'}</td>
                                                <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>{tp.total}</td>
                                                <td style={{ padding: '8px 8px', textAlign: 'center' }}>
                                                    <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', fontWeight: 800, fontSize: '11px' }}>
                                                        {tp.grade}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Complete Student Score Roster */}
            <Card>
                <CardHeader>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>people</span>
                            Complete Student Score Roster ({filteredRoster.length} Students)
                        </CardTitle>
                        <div style={{ maxWidth: '280px', width: '100%' }}>
                            <Input
                                placeholder="Search roster by USN or Name..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '10px 14px', width: '50px', textAlign: 'left' }}>#</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>USN</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Student Name</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Branch</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Internal (CIE)</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>External (SEE)</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Total Marks</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Grade</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRoster.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ padding: '36px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Loading scores roster...' : 'No students found.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRoster.map((r, idx) => (
                                        <tr key={r.usn} style={{ borderBottom: '1px solid var(--border-low)', background: r.isFail ? 'rgba(239, 68, 68, 0.02)' : 'transparent' }}>
                                            <td style={{ padding: '10px 14px', color: 'var(--tx-dim)' }}>{idx + 1}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{r.usn}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 600 }}>{r.name}</td>
                                            <td style={{ padding: '10px 14px', color: 'var(--tx-muted)' }}>{r.branch}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>{r.internal ?? '—'}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>{r.external ?? '—'}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 900, color: r.isFail ? '#EF4444' : 'var(--tx-main)' }}>
                                                {r.total ?? '—'}
                                            </td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 800, color: r.isFail ? '#EF4444' : '#10B981' }}>
                                                {r.grade}
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '4px',
                                                    fontSize: '11px', fontWeight: 800,
                                                    background: r.isFail ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                    color: r.isFail ? '#EF4444' : '#10B981'
                                                }}>
                                                    {r.isFail ? 'FAIL' : 'PASS'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
