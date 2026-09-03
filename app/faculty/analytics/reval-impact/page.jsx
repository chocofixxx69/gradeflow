'use client';

import { useState, useEffect, useCallback } from 'react';
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

    // Filters
    const [branch, setBranch] = useState('CS');
    const [semester, setSemester] = useState(3);
    const [batch, setBatch] = useState('');

    // Data
    const [report, setReport] = useState({
        summary: { totalApplications: 0, upgradedCount: 0, clearedCount: 0, unchangedCount: 0, netPassRateGain: 0 },
        deltaRoster: [],
        branch: 'CS',
        semester: 3
    });

    // 1. Fetch metadata
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) {
                    setMeta(res);
                    if (res.branches?.length > 0) setBranch(res.branches[0].code);
                    if (res.batches?.length > 0) setBatch(res.batches[0]);
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
            const query = { branch, semester };
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

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Summary
        const summaryData = [
            ['GradeFlow - Revaluation Impact & Grade Delta Analysis'],
            [`Department: ${branch}`, `Semester: Sem ${semester}`, `Batch: ${batch || 'All'}`],
            [`Generated on: ${new Date().toLocaleString()}`],
            [],
            ['Total Subjects Evaluated', report.summary.totalApplications],
            ['Total Grades Upgraded', report.summary.upgradedCount],
            ['Backlogs Cleared via Reval', report.summary.clearedCount],
            ['Net Pass Rate Gain', `${report.summary.netPassRateGain}%`],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // 2. Delta Roster
        const headers = ['#', 'USN', 'Name', 'Subject Code', 'Pre-Reval Marks', 'Pre-Grade', 'Post-Reval Marks', 'Post-Grade', 'Delta (+/-)', 'Outcome'];
        const rows = (report.deltaRoster || []).map((d, idx) => [
            idx + 1,
            d.usn,
            d.name,
            d.subject_code,
            d.preMarks,
            d.preGrade,
            d.postMarks,
            d.postGrade,
            d.delta > 0 ? `+${d.delta}` : d.delta,
            d.outcome
        ]);

        const wsRoster = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, wsRoster, 'Delta Roster');

        XLSX.writeFile(wb, `Reval_Impact_${branch}_Sem${semester}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`VTU Revaluation Impact & Grade Delta Report (${branch} - Sem ${semester})`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Evaluated: ${report.summary.totalApplications} | Upgraded: ${report.summary.upgradedCount} | Cleared Backlogs: ${report.summary.clearedCount} | Net Gain: ${report.summary.netPassRateGain}% | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['#', 'USN', 'Name', 'Subject Code', 'Pre-Marks', 'Pre-Grd', 'Post-Marks', 'Post-Grd', 'Delta', 'Outcome']];
        const tableBody = (report.deltaRoster || []).map((d, idx) => [
            idx + 1,
            d.usn,
            d.name,
            d.subject_code,
            d.preMarks,
            d.preGrade,
            d.postMarks,
            d.postGrade,
            d.delta > 0 ? `+${d.delta}` : '0',
            d.outcome
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 25,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        doc.save(`Reval_Impact_${branch}_Sem${semester}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>University Examinations</PageHeaderEyebrow>
                    <PageHeaderTitle>Revaluation Impact &amp; Grade Delta Analysis</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Before-and-after examination delta tracking marks gains, grade upgrades, and backlogs cleared via revaluation.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={report.deltaRoster.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={report.deltaRoster.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadRevalReport} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filter Toolbar */}
            <Card style={{ marginBottom: '20px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
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
                                label="Semester"
                                value={semester}
                                onChange={e => setSemester(Number(e.target.value))}
                                options={meta.semesters.map(s => ({ value: s, label: `Semester ${s}` }))}
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
                    </div>
                </CardContent>
            </Card>

            {/* 4 Impact Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', marginBottom: '24px' }}>
                {[
                    { label: 'Applications Evaluated', value: report.summary.totalApplications, color: 'var(--tx-main)' },
                    { label: 'Grades Upgraded', value: report.summary.upgradedCount, color: '#3B82F6' },
                    { label: 'Backlogs Cleared via Reval', value: report.summary.clearedCount, color: '#10B981' },
                    { label: 'Net Pass Rate Gain', value: `+${report.summary.netPassRateGain}%`, color: '#6366F1' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            {/* Detailed Delta Table */}
            <Card style={{ overflow: 'hidden' }}>
                <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>published_with_changes</span>
                        Subject Revaluation Delta Roster ({report.deltaRoster.length} Entries)
                    </CardTitle>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '45px' }}>#</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '130px' }}>USN</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Student Name</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '120px' }}>Subject Code</th>
                                    <th style={{ padding: '12px 10px', textAlign: 'center', width: '80px' }}>Pre-Score</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', width: '60px' }}>Pre-Grd</th>
                                    <th style={{ padding: '12px 10px', textAlign: 'center', width: '80px' }}>Post-Score</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', width: '60px' }}>Post-Grd</th>
                                    <th style={{ padding: '12px 10px', textAlign: 'center', width: '80px' }}>Delta</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: '150px' }}>Outcome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.deltaRoster.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Analyzing revaluation deltas...' : 'No revaluation entries found for selected semester.'}
                                        </td>
                                    </tr>
                                ) : (
                                    report.deltaRoster.map((d, idx) => {
                                        const isCleared = d.isCleared;
                                        const isUpgraded = d.delta > 0;
                                        return (
                                            <tr
                                                key={`${d.usn}-${d.subject_code}`}
                                                style={{
                                                    borderBottom: '1px solid var(--border-low)',
                                                    background: isCleared ? 'rgba(16, 185, 129, 0.04)' : isUpgraded ? 'rgba(59, 130, 246, 0.03)' : 'transparent'
                                                }}
                                            >
                                                <td style={{ padding: '12px 14px', color: 'var(--tx-dim)' }}>{idx + 1}</td>
                                                <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace' }}>
                                                    <Link href={`/faculty/students/${d.usn}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                                                        {d.usn}
                                                    </Link>
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{d.name}</td>
                                                <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--tx-main)' }}>
                                                    {d.subject_code}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                    {d.preMarks}
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                    <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '11px', fontWeight: 800, background: d.preGrade === 'F' ? 'rgba(239, 68, 68, 0.15)' : 'var(--surface-low)', color: d.preGrade === 'F' ? '#EF4444' : 'inherit' }}>
                                                        {d.preGrade}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: isCleared ? '#10B981' : isUpgraded ? 'var(--primary)' : 'inherit' }}>
                                                    {d.postMarks}
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                    <span style={{ padding: '1px 5px', borderRadius: '3px', fontSize: '11px', fontWeight: 800, background: isCleared ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-low)', color: isCleared ? '#10B981' : 'inherit' }}>
                                                        {d.postGrade}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 900 }}>
                                                    {d.delta > 0 ? (
                                                        <span style={{ color: '#10B981' }}>+{d.delta}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--tx-dim)' }}>0</span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: '6px',
                                                        fontSize: '11px', fontWeight: 800,
                                                        background: isCleared ? 'rgba(16, 185, 129, 0.15)' : isUpgraded ? 'rgba(59, 130, 246, 0.15)' : 'var(--surface-low)',
                                                        color: isCleared ? '#10B981' : isUpgraded ? '#3B82F6' : 'var(--tx-muted)'
                                                    }}>
                                                        {d.outcome}
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
