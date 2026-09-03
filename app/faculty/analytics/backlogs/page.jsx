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
import { Button, Select, Input } from '@/components/ui/Foundation';

export default function BacklogsRegisterPage() {
    return (
        <AuthGuard role="faculty">
            <BacklogsRegisterContent />
        </AuthGuard>
    );
}

function BacklogsRegisterContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], batches: [] });

    // Filters
    const [branch, setBranch] = useState('CS');
    const [batch, setBatch] = useState('');
    const [threshold, setThreshold] = useState(1);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState('ledger'); // 'ledger' | 'heatmap'

    // Data
    const [report, setReport] = useState({
        summary: { totalCarriers: 0, totalArrearsSubjects: 0, totalArrearsCredits: 0, criticalCarriers: 0 },
        ledger: [],
        subjectConcentration: []
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

    // 2. Fetch backlog ledger
    const loadBacklogs = useCallback(async () => {
        if (!branch) return;
        setLoading(true);
        try {
            const query = { branch, threshold };
            if (batch) query.batch = batch;
            if (searchQuery) query.search = searchQuery;

            const res = await apiRequest('/api/faculty/analytics/backlogs', { query });
            if (res) {
                setReport(res);
            }
        } catch (err) {
            console.error('Failed to load backlogs register:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, batch, threshold, searchQuery]);

    useEffect(() => {
        loadBacklogs();
    }, [loadBacklogs]);

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Student Ledger Sheet
        const headers = ['#', 'USN', 'Student Name', 'Branch', 'Sem', 'Total Backlogs', 'Backlog Credits', 'Risk Status', 'Failed Subjects'];
        const rows = (report.ledger || []).map((s, idx) => [
            idx + 1,
            s.usn,
            s.name,
            s.branch,
            `Sem ${s.semester}`,
            s.totalBacklogs,
            s.backlogCredits,
            s.isCritical ? 'Critical (>4 Arrears)' : 'Active Backlog',
            s.failedSubjects.map(f => `${f.code} (Sem ${f.semester})`).join(', ')
        ]);
        const wsLedger = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, wsLedger, 'Student Arrears Ledger');

        // 2. Subject Failure Heatmap Sheet
        const subHeaders = ['#', 'Subject Code', 'Subject Name', 'Semester', 'Credits', 'Failed Students Count'];
        const subRows = (report.subjectConcentration || []).map((sub, idx) => [
            idx + 1,
            sub.code,
            sub.name,
            `Sem ${sub.semester}`,
            sub.credits,
            sub.count
        ]);
        const wsSub = XLSX.utils.aoa_to_sheet([subHeaders, ...subRows]);
        XLSX.utils.book_append_sheet(wb, wsSub, 'Subject Bottlenecks');

        XLSX.writeFile(wb, `Standing_Backlogs_Register_${branch}_${batch || 'All'}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Standing Backlogs Register (${branch})`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Carrying Students: ${report.summary.totalCarriers} | Total Uncleared Subjects: ${report.summary.totalArrearsSubjects} | Credits at Risk: ${report.summary.totalArrearsCredits} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['#', 'USN', 'Student Name', 'Branch', 'Sem', 'Backlogs', 'Credits', 'Failed Course Codes']];
        const tableBody = (report.ledger || []).map((s, idx) => [
            idx + 1,
            s.usn,
            s.name,
            s.branch,
            s.semester,
            s.totalBacklogs,
            s.backlogCredits,
            s.failedSubjects.map(f => f.code).join(', ')
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 25,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255] }
        });

        doc.save(`Backlogs_Register_${branch}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Compliance</PageHeaderEyebrow>
                    <PageHeaderTitle>Standing College-Wide Backlogs Register</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Cumulative arrears ledger across Semesters I through VIII, highlighting bottleneck subjects and at-risk students.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={report.ledger.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={report.ledger.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadBacklogs} variant="primary">
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
                                label="Intake Batch"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={[{ value: '', label: 'All Batches' }, ...meta.batches.map(b => ({ value: b, label: `${b.slice(-2)} Batch (${b})` }))]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Arrears Severity"
                                value={threshold}
                                onChange={e => setThreshold(Number(e.target.value))}
                                options={[
                                    { value: 1, label: 'All Carrying Students (≥ 1 Arrear)' },
                                    { value: 3, label: 'High Arrears (≥ 3 Backlogs)' },
                                    { value: 5, label: 'Critical / Detention Risk (> 4 Backlogs)' }
                                ]}
                            />
                        </div>
                        <div>
                            <Input
                                label="Search Student"
                                placeholder="USN or Name..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 4 Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', marginBottom: '24px' }}>
                {[
                    { label: 'Backlog Carrying Students', value: report.summary.totalCarriers, color: report.summary.totalCarriers > 0 ? '#EF4444' : 'var(--tx-main)' },
                    { label: 'Total Arrears Subjects', value: report.summary.totalArrearsSubjects, color: '#F59E0B' },
                    { label: 'Credits at Risk', value: report.summary.totalArrearsCredits, color: 'var(--primary)' },
                    { label: 'Critical Carriers (>4)', value: report.summary.criticalCarriers, color: report.summary.criticalCarriers > 0 ? '#DC2626' : '#10B981' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            {/* View Mode Switcher */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <Button
                    variant={activeTab === 'ledger' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('ledger')}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>people</span>
                    Student Arrears Ledger ({report.ledger.length})
                </Button>
                <Button
                    variant={activeTab === 'heatmap' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('heatmap')}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>warning_amber</span>
                    Subject Failure Concentration ({report.subjectConcentration.length})
                </Button>
            </div>

            {/* Active Table */}
            <Card style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    {activeTab === 'ledger' ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '45px' }}>#</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '130px' }}>USN</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Student Name</th>
                                    <th style={{ padding: '12px 10px', textAlign: 'center', width: '80px' }}>Sem</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Backlogs</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Arrears Cr</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Uncleared Courses</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.ledger.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#10B981', fontWeight: 700 }}>
                                            {loading ? 'Compiling standing backlogs ledger...' : 'All clear! No students matching the selected arrears filter.'}
                                        </td>
                                    </tr>
                                ) : (
                                    report.ledger.map((s, idx) => (
                                        <tr key={s.usn} style={{ borderBottom: '1px solid var(--border-low)', background: s.isCritical ? 'rgba(239, 68, 68, 0.03)' : 'transparent' }}>
                                            <td style={{ padding: '12px 14px', color: 'var(--tx-dim)' }}>{idx + 1}</td>
                                            <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace' }}>
                                                <Link href={`/faculty/students/${s.usn}`} style={{ color: s.isCritical ? '#EF4444' : 'var(--primary)', textDecoration: 'none' }}>
                                                    {s.usn}
                                                </Link>
                                                {s.isLE && (
                                                    <span style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '9px', fontWeight: 800 }}>
                                                        LE
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.name}</td>
                                            <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700 }}>Sem {s.semester}</td>
                                            <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '4px',
                                                    fontSize: '11.5px', fontWeight: 900,
                                                    background: s.isCritical ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                                                    color: s.isCritical ? '#EF4444' : '#F59E0B'
                                                }}>
                                                    {s.totalBacklogs} Arrears
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 800 }}>
                                                {s.backlogCredits} Cr
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {s.failedSubjects.map(f => (
                                                        <span
                                                            key={f.code}
                                                            style={{
                                                                padding: '2px 6px', borderRadius: '4px',
                                                                background: 'var(--surface-low)', border: '1px solid var(--border)',
                                                                fontSize: '11px', fontWeight: 800, fontFamily: 'monospace',
                                                                color: '#EF4444'
                                                            }}
                                                            title={`${f.name} (Semester ${f.semester}, ${f.credits} Credits)`}
                                                        >
                                                            {f.code} (S{f.semester})
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '50px' }}>Rank</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px' }}>Subject Code</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Subject Name</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Semester</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '80px' }}>Credits</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: '140px' }}>Failing Students Count</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '180px' }}>Institutional Severity</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.subjectConcentration.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: '#10B981', fontWeight: 700 }}>
                                            No failing subjects recorded for this department!
                                        </td>
                                    </tr>
                                ) : (
                                    report.subjectConcentration.map((sub, idx) => {
                                        const isSevere = sub.count >= 15;
                                        const isModerate = sub.count >= 5;
                                        return (
                                            <tr key={sub.code} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                <td style={{ padding: '12px 14px', color: 'var(--tx-dim)', fontWeight: 800 }}>#{idx + 1}</td>
                                                <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                    {sub.code}
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{sub.name}</td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center' }}>Sem {sub.semester}</td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 700 }}>{sub.credits}</td>
                                                <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 900, color: isSevere ? '#EF4444' : isModerate ? '#F59E0B' : 'inherit' }}>
                                                    {sub.count} Students
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 800,
                                                        background: isSevere ? 'rgba(239, 68, 68, 0.15)' : isModerate ? 'rgba(245, 158, 11, 0.15)' : 'var(--surface-low)',
                                                        color: isSevere ? '#EF4444' : isModerate ? '#F59E0B' : 'var(--tx-muted)'
                                                    }}>
                                                        {isSevere ? 'Critical Bottleneck Course' : isModerate ? 'Moderate Arrears' : 'Standard'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>
        </div>
    );
}
