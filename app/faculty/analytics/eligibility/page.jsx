'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest } from '@/lib/api/client';

export default function EligibilityRegisterPage() {
    return (
        <AuthGuard role="faculty">
            <EligibilityRegisterContent />
        </AuthGuard>
    );
}

function EligibilityRegisterContent() {
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [] });

    // Filters initialized instantly from active context
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [targetSemester, setTargetSemester] = useState(() => {
        const s = Number(initialSaved.semester);
        if (s === 3 || s === 5 || s === 7) return s;
        return 5;
    });
    const [activeTab, setActiveTab] = useState('detained'); // 'detained' | 'eligible'

    const initialData = getCachedApiData('/api/faculty/analytics/eligibility', {
        branch: initialSaved.branch || 'CS',
        ...(initialSaved.batch ? { batch: initialSaved.batch } : {}),
        targetSemester: 5
    });

    // Data
    const [report, setReport] = useState(() => initialData || {
        summary: { totalEvaluated: 0, eligibleCount: 0, detainedCount: 0, eligibilityRate: 0 },
        eligibleStudents: [],
        detainedStudents: [],
        targetSemester: 5
    });
    const [loading, setLoading] = useState(() => !initialData);

    // Save active filters
    useEffect(() => {
        saveFilters({ branch, batch, semester: targetSemester });
    }, [branch, batch, targetSemester]);

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

    // 2. Fetch eligibility report
    const loadEligibility = useCallback(async () => {
        if (!branch) return;
        const query = { branch, targetSemester };
        if (batch) query.batch = batch;

        const cached = getCachedApiData('/api/faculty/analytics/eligibility', query);
        if (cached) {
            setReport(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }

        try {
            const res = await apiRequest('/api/faculty/analytics/eligibility', { query });
            if (res) {
                setReport(res);
            }
        } catch (err) {
            console.error('Failed to load eligibility report:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, batch, targetSemester]);

    useEffect(() => {
        loadEligibility();
    }, [loadEligibility]);

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Detained Sheet
        const detainedHeaders = ['#', 'USN', 'Name', 'Department', 'Earned Cr', 'Backlogs', 'Detention Reasons', 'Uncleared Subjects'];
        const detainedRows = (report.detainedStudents || []).map((s, idx) => [
            idx + 1,
            s.usn,
            s.name,
            s.branch,
            s.totalEarnedCredits,
            s.activeBacklogsCount,
            s.detentionReasons.join('; '),
            s.unclearedSubjects.map(u => u.code).join(', ')
        ]);
        const wsDetained = XLSX.utils.aoa_to_sheet([detainedHeaders, ...detainedRows]);
        XLSX.utils.book_append_sheet(wb, wsDetained, 'Detained (Year-Back)');

        // 2. Eligible Sheet
        const eligibleHeaders = ['#', 'USN', 'Name', 'Department', 'Earned Cr', 'Backlogs', 'Progression Status'];
        const eligibleRows = (report.eligibleStudents || []).map((s, idx) => [
            idx + 1,
            s.usn,
            s.name,
            s.branch,
            s.totalEarnedCredits,
            s.activeBacklogsCount,
            'Eligible for Progression'
        ]);
        const wsEligible = XLSX.utils.aoa_to_sheet([eligibleHeaders, ...eligibleRows]);
        XLSX.utils.book_append_sheet(wb, wsEligible, 'Eligible Cohort');

        XLSX.writeFile(wb, `VTU_Eligibility_Register_${branch}_Sem${targetSemester}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`VTU Vertical Progression Register - Admission to Semester ${targetSemester}`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Branch: ${branch} | Batch: ${batch || 'All'} | Evaluated: ${report.summary.totalEvaluated} | Eligible: ${report.summary.eligibleCount} | Detained: ${report.summary.detainedCount} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        // Detained list
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`DETAINED STUDENTS (BARRED FROM ENROLLMENT IN SEMESTER ${targetSemester})`, 14, 28);

        const dHead = [['#', 'USN', 'Name', 'Branch', 'Backlogs', 'Reason for Detention']];
        const dBody = (report.detainedStudents || []).map((s, idx) => [
            idx + 1,
            s.usn,
            s.name,
            s.branch,
            s.activeBacklogsCount,
            s.detentionReasons.join(' | ')
        ]);

        autoTable(doc, {
            head: dHead,
            body: dBody,
            startY: 31,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255] }
        });

        doc.save(`Detention_Register_${branch}_Sem${targetSemester}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Compliance &amp; Regulations</PageHeaderEyebrow>
                    <PageHeaderTitle>Vertical Progression &amp; Eligibility Register</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Evaluates VTU vertical progression rules to compute eligible vs detained cohorts prior to semester enrollment.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadEligibility} variant="primary">
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
                                label="Branch / Department"
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
                                label="Target Semester for Admission"
                                value={targetSemester}
                                onChange={e => setTargetSemester(Number(e.target.value))}
                                options={[
                                    { value: 3, label: 'Admission to Semester 3 (Year 2)' },
                                    { value: 5, label: 'Admission to Semester 5 (Year 3)' },
                                    { value: 7, label: 'Admission to Semester 7 (Year 4)' },
                                ]}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* VTU Regulation Banner */}
            <div style={{ background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.25)', borderRadius: '12px', padding: '14px 18px', marginBottom: '20px', fontSize: '13px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '22px', marginTop: '1px' }}>policy</span>
                <div>
                    <div style={{ fontWeight: 800, color: 'var(--tx-main)', marginBottom: '2px' }}>
                        VTU Vertical Progression Regulation in effect for Semester {targetSemester}:
                    </div>
                    <div style={{ color: 'var(--tx-muted)', lineHeight: '1.4' }}>
                        {targetSemester === 3 && 'VTU Minimum 20 Credits Rule: Students must earn at least 20 credits in 1st Year (Semesters 1 & 2) and must not carry more than 4 backlogs to move to 2nd Year (Semester 3).'}
                        {targetSemester === 5 && 'VTU 3rd Year Progression: Students must not carry more than 4 backlogs from Semesters 1, 2, 3, and 4 combined to be admitted to 3rd Year (Semester 5).'}
                        {targetSemester === 7 && 'VTU ZERO 1ST-YEAR BACKLOGS RULE: Any student carrying uncleared backlogs from 1st Year (Semesters 1 & 2) CANNOT enter 7th Semester (all 1st-year subjects must be 100% cleared). In addition, students must not carry more than 4 backlogs from Semesters 3 to 6 combined.'}
                    </div>
                </div>
            </div>

            {/* KPI Summary Tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Cohort Evaluated', value: report.summary.totalEvaluated, color: 'var(--tx-main)' },
                    { label: 'Eligible for Admission', value: report.summary.eligibleCount, color: '#10B981' },
                    { label: 'Detained (Year-Back)', value: report.summary.detainedCount, color: report.summary.detainedCount > 0 ? '#EF4444' : 'var(--tx-muted)' },
                    { label: 'Eligibility Rate', value: `${report.summary.eligibilityRate}%`, color: report.summary.eligibilityRate >= 80 ? '#10B981' : '#F59E0B' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            {/* Tabs for Detained vs Eligible */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '16px' }}>
                <Button
                    variant={activeTab === 'detained' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('detained')}
                    style={activeTab === 'detained' ? { background: '#EF4444', borderColor: '#EF4444' } : {}}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>error</span>
                    Detained Students ({report.detainedStudents.length})
                </Button>
                <Button
                    variant={activeTab === 'eligible' ? 'primary' : 'secondary'}
                    onClick={() => setActiveTab('eligible')}
                    style={activeTab === 'eligible' ? { background: '#10B981', borderColor: '#10B981' } : {}}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>check_circle</span>
                    Eligible Students ({report.eligibleStudents.length})
                </Button>
            </div>

            {/* Active Table */}
            <Card style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    {activeTab === 'detained' ? (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '45px' }}>#</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px' }}>USN</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Student Name</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Backlogs</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Year 1 Cr</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Total Cr</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Detention Violation Reason</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '220px' }}>Uncleared Subjects</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.detainedStudents.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: '#10B981', fontWeight: 700 }}>
                                            {loading ? 'Evaluating progression rules...' : 'All students in this cohort are eligible for vertical progression! Zero detentions.'}
                                        </td>
                                    </tr>
                                ) : (
                                    report.detainedStudents.map((s, idx) => (
                                        <tr key={s.usn} style={{ borderBottom: '1px solid var(--border-low)', background: 'rgba(239, 68, 68, 0.03)' }}>
                                            <td style={{ padding: '12px 14px', color: 'var(--tx-dim)' }}>{idx + 1}</td>
                                            <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace' }}>
                                                <Link href={`/faculty/students/${s.usn}`} style={{ color: '#EF4444', textDecoration: 'none' }}>
                                                    {s.usn}
                                                </Link>
                                                {s.isLE && (
                                                    <span style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '9px', fontWeight: 800 }}>
                                                        LE
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.name}</td>
                                            <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontWeight: 800, fontSize: '12px' }}>
                                                    {s.activeBacklogsCount}
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 800, color: s.year1EarnedCredits < 20 && !s.isLE ? '#EF4444' : 'inherit' }}>
                                                {s.isLE ? 'N/A (LE)' : `${s.year1EarnedCredits ?? 0}/20`}
                                            </td>
                                            <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 700 }}>
                                                {s.totalEarnedCredits}
                                            </td>
                                            <td style={{ padding: '12px 16px', color: '#EF4444', fontWeight: 600, fontSize: '12.5px' }}>
                                                {s.detentionReasons.join(' • ')}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                    {s.unclearedSubjects.map(u => (
                                                        <span key={u.code} style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-low)', border: '1px solid var(--border)', fontSize: '10.5px', fontFamily: 'monospace', fontWeight: 700, color: 'var(--tx-muted)' }} title={u.name}>
                                                            {u.code} (Sem {u.semester})
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
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '45px' }}>#</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px' }}>USN</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Student Name</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '140px' }}>Department</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Earned Cr</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Backlogs</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: '160px' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.eligibleStudents.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Evaluating progression rules...' : 'No eligible students found.'}
                                        </td>
                                    </tr>
                                ) : (
                                    report.eligibleStudents.map((s, idx) => (
                                        <tr key={s.usn} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                            <td style={{ padding: '12px 14px', color: 'var(--tx-dim)' }}>{idx + 1}</td>
                                            <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace' }}>
                                                <Link href={`/faculty/students/${s.usn}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                                                    {s.usn}
                                                </Link>
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>{s.name}</td>
                                            <td style={{ padding: '12px 14px', color: 'var(--tx-muted)' }}>{s.branch}</td>
                                            <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 700 }}>
                                                {s.totalEarnedCredits}
                                            </td>
                                            <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                {s.activeBacklogsCount === 0 ? (
                                                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', fontWeight: 800, fontSize: '11px' }}>
                                                        Clear
                                                    </span>
                                                ) : (
                                                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', fontWeight: 800, fontSize: '11px' }}>
                                                        {s.activeBacklogsCount} (Allowed)
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <span style={{ padding: '3px 10px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', fontWeight: 800, fontSize: '11.5px' }}>
                                                    Eligible for Sem {targetSemester}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </Card>
        </div>
    );
}
