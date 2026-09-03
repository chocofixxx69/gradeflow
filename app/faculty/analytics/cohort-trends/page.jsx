'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Foundation';

export default function CohortTrendsPage() {
    return (
        <AuthGuard role="faculty">
            <CohortTrendsContent />
        </AuthGuard>
    );
}

function CohortTrendsContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], semesters: [1,2,3,4,5,6,7,8] });

    // Filters
    const [branch, setBranch] = useState('CS');
    const [semester, setSemester] = useState(3);

    // Data
    const [data, setData] = useState({
        branch: 'CS',
        semester: 3,
        batches: [],
        batchComparison: [],
        subjectTrends: []
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
                console.error('Failed to load meta:', err);
            }
        }
        loadMeta();
    }, []);

    // 2. Fetch cohort trends
    const loadTrends = useCallback(async () => {
        if (!branch) return;
        setLoading(true);
        try {
            const query = { branch, semester };
            const res = await apiRequest('/api/faculty/analytics/cohort-trends', { query });
            if (res) {
                setData(res);
            }
        } catch (err) {
            console.error('Failed to load cohort trends:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, semester]);

    useEffect(() => {
        loadTrends();
    }, [loadTrends]);

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Batch Summary Sheet
        const bHeaders = ['Batch', 'Enrolled', 'Appeared', 'Passed', 'Failed', 'Pass Rate (%)', 'Average Score'];
        const bRows = data.batchComparison.map(b => [
            b.batch, b.enrolled, b.appeared, b.passed, b.failed, `${b.passRate}%`, b.avgScore
        ]);
        const wsBatch = XLSX.utils.aoa_to_sheet([bHeaders, ...bRows]);
        XLSX.utils.book_append_sheet(wb, wsBatch, 'Batch Summary');

        // 2. Subject Trends Sheet
        const sHeaders = ['Subject Code', 'Subject Name', ...data.batches.map(b => `${b} Pass %`), 'Trajectory'];
        const sRows = data.subjectTrends.map(s => [
            s.code,
            s.name,
            ...data.batches.map(b => s.rates[b] !== null ? `${s.rates[b]}%` : '—'),
            s.trend
        ]);
        const wsSub = XLSX.utils.aoa_to_sheet([sHeaders, ...sRows]);
        XLSX.utils.book_append_sheet(wb, wsSub, 'Subject Trends');

        XLSX.writeFile(wb, `Cohort_Trends_${branch}_Sem${semester}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Batch-over-Batch Intake Trend (Department ${branch} - Semester ${semester})`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Comparing ${data.batches.length} Intake Batches | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['Batch', 'Enrolled', 'Appeared', 'Passed', 'Failed', 'Pass %', 'Avg Marks']];
        const tableBody = data.batchComparison.map(b => [
            b.batch, b.enrolled, b.appeared, b.passed, b.failed, `${b.passRate}%`, b.avgScore
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        const lastY = doc.lastAutoTable?.finalY || 80;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Subject-by-Subject Pass Rate Trajectory', 14, lastY + 10);

        const sHead = [['Code', 'Subject Name', ...data.batches.map(b => `${b} Batch`), 'Trend']];
        const sBody = data.subjectTrends.map(s => [
            s.code,
            s.name,
            ...data.batches.map(b => s.rates[b] !== null ? `${s.rates[b]}%` : '—'),
            s.trend
        ]);

        autoTable(doc, {
            head: sHead,
            body: sBody,
            startY: lastY + 13,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
        });

        doc.save(`Cohort_Trends_${branch}_Sem${semester}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Multi-Year Academic Analytics</PageHeaderEyebrow>
                    <PageHeaderTitle>Batch-over-Batch Intake Trend Analysis</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Comparative performance of the same semester across consecutive intake batches to evaluate curriculum difficulty and cohort trajectory.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={data.batchComparison.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={data.batchComparison.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadTrends} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filter Toolbar */}
            <Card style={{ marginBottom: '20px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                        <div>
                            <Select
                                label="Department / Branch"
                                value={branch}
                                onChange={e => setBranch(e.target.value)}
                                options={meta.branches.map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))}
                            />
                        </div>
                        <div>
                            <Select
                                label="Benchmark Semester"
                                value={semester}
                                onChange={e => setSemester(Number(e.target.value))}
                                options={meta.semesters.map(s => ({ value: s, label: `Semester ${s}` }))}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Recharts Comparative Bar Chart */}
            {data.batchComparison.length > 0 && (
                <Card style={{ marginBottom: '24px' }}>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>bar_chart</span>
                            Comparative Pass Percentage Across Intake Years (Semester {semester})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div style={{ width: '100%', height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.batchComparison} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                    <XAxis dataKey="batch" tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                    <YAxis domain={[0, 100]} tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="passRate" name="Pass Rate (%)" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                                    <Bar dataKey="avgScore" name="Average Score" fill="#10B981" radius={[6, 6, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Subject Trajectory Table */}
            <Card style={{ overflow: 'hidden' }}>
                <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>insights</span>
                        Subject Pass Rate Trajectory Grid ({data.subjectTrends.length} Courses)
                    </CardTitle>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '130px' }}>Course Code</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Course Name</th>
                                    {data.batches.map(b => (
                                        <th key={b} style={{ padding: '12px 12px', textAlign: 'center', width: '110px' }}>
                                            {b} Batch
                                        </th>
                                    ))}
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: '130px' }}>Cohort Trend</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.subjectTrends.length === 0 ? (
                                    <tr>
                                        <td colSpan={data.batches.length + 3} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Evaluating cohort pass rate trajectories...' : 'No marks on record for this semester.'}
                                        </td>
                                    </tr>
                                ) : (
                                    data.subjectTrends.map(s => {
                                        const trendColor = s.trend === 'improving' ? '#10B981' : s.trend === 'declining' ? '#EF4444' : 'var(--tx-muted)';
                                        return (
                                            <tr key={s.code} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                    {s.code}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.name}</td>
                                                {data.batches.map(b => {
                                                    const rate = s.rates[b];
                                                    return (
                                                        <td key={b} style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 700 }}>
                                                            {rate !== null ? (
                                                                <span style={{ color: rate >= 75 ? '#10B981' : rate >= 50 ? 'var(--primary)' : '#EF4444' }}>
                                                                    {rate}%
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: 'var(--tx-dim)' }}>—</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800,
                                                        background: s.trend === 'improving' ? 'rgba(16, 185, 129, 0.15)' : s.trend === 'declining' ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface-low)',
                                                        color: trendColor
                                                    }}>
                                                        {s.trend.toUpperCase()}
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
        </div>
    );
}
