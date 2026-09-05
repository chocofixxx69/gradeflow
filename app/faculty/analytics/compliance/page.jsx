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
import { getCleanBranchOptions } from '@/lib/semester-utils';

export default function AcademicCompliancePage() {
    return (
        <AuthGuard role="faculty">
            <AcademicComplianceContent />
        </AuthGuard>
    );
}

function AcademicComplianceContent() {
    const searchParams = useSearchParams();
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    // Active View Tab: 'eligibility' | 'backlogs'
    const [viewTab, setViewTab] = useState(() => {
        const param = searchParams?.get('tab');
        return param === 'backlogs' ? 'backlogs' : 'eligibility';
    });

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [] });

    // Shared Filters
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [searchQuery, setSearchQuery] = useState('');

    // Eligibility-specific Filters & State
    const [targetSemester, setTargetSemester] = useState(() => {
        const s = Number(initialSaved.semester);
        if (s === 3 || s === 7) return s;
        if ((initialSaved.batch || '2023').includes('24')) return 3;
        return 7;
    });
    const [eligibilityFilterTab, setEligibilityFilterTab] = useState('all'); // 'all' | 'detained' | 'eligible'

    const initialEligibilityData = getCachedApiData('/api/faculty/analytics/eligibility', {
        branch: initialSaved.branch || 'CS',
        ...(initialSaved.batch ? { batch: initialSaved.batch } : {}),
        targetSemester: (initialSaved.batch || '2023').includes('24') ? 3 : 7
    });
    const [eligibilityReport, setEligibilityReport] = useState(() => initialEligibilityData || {
        summary: { totalEvaluated: 0, eligibleCount: 0, detainedCount: 0, eligibilityRate: 0 },
        allStudents: [],
        eligibleStudents: [],
        detainedStudents: [],
        targetSemester: 7
    });
    const [eligibilityLoading, setEligibilityLoading] = useState(() => !initialEligibilityData);

    // Backlog-specific Filters & State
    const [backlogThreshold, setBacklogThreshold] = useState(1);
    const [backlogSubTab, setBacklogSubTab] = useState('ledger'); // 'ledger' | 'heatmap'

    const initialBacklogData = getCachedApiData('/api/faculty/analytics/backlogs', {
        branch: initialSaved.branch || 'CS',
        batch: initialSaved.batch || '2023',
        threshold: 1
    });
    const [backlogReport, setBacklogReport] = useState(() => initialBacklogData || {
        summary: { totalCarriers: 0, totalArrearsSubjects: 0, totalArrearsCredits: 0, criticalCarriers: 0 },
        ledger: [],
        subjectConcentration: []
    });
    const [backlogLoading, setBacklogLoading] = useState(() => !initialBacklogData);

    // Synchronize active filters
    useEffect(() => {
        saveFilters({ branch, batch, semester: targetSemester });
    }, [branch, batch, targetSemester]);

    // 1. Fetch metadata
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

    // 2. Fetch Eligibility Data
    const loadEligibility = useCallback(async () => {
        if (!branch) return;
        const query = { branch, targetSemester };
        if (batch) query.batch = batch;

        const cached = getCachedApiData('/api/faculty/analytics/eligibility', query);
        if (cached) {
            setEligibilityReport(cached);
            setEligibilityLoading(false);
        } else {
            setEligibilityLoading(true);
        }

        try {
            const res = await apiRequest('/api/faculty/analytics/eligibility', { query });
            if (res) setEligibilityReport(res);
        } catch (err) {
            console.error('Failed to load eligibility report:', err);
        } finally {
            setEligibilityLoading(false);
        }
    }, [branch, batch, targetSemester]);

    // 3. Fetch Backlog Data
    const loadBacklogs = useCallback(async () => {
        if (!branch) return;
        const query = { branch, threshold: backlogThreshold };
        if (batch) query.batch = batch;
        if (searchQuery) query.search = searchQuery;

        const cached = getCachedApiData('/api/faculty/analytics/backlogs', query);
        if (cached) {
            setBacklogReport(cached);
            setBacklogLoading(false);
        } else {
            setBacklogLoading(true);
        }

        try {
            const res = await apiRequest('/api/faculty/analytics/backlogs', { query });
            if (res) setBacklogReport(res);
        } catch (err) {
            console.error('Failed to load backlogs register:', err);
        } finally {
            setBacklogLoading(false);
        }
    }, [branch, batch, backlogThreshold, searchQuery]);

    useEffect(() => {
        if (viewTab === 'eligibility') {
            loadEligibility();
        } else {
            loadBacklogs();
        }
    }, [viewTab, loadEligibility, loadBacklogs]);

    // Filtered students for Eligibility
    const filteredEligibilityStudents = useMemo(() => {
        const pool = eligibilityFilterTab === 'detained'
            ? (eligibilityReport.detainedStudents || [])
            : eligibilityFilterTab === 'eligible'
                ? (eligibilityReport.eligibleStudents || [])
                : (eligibilityReport.allStudents || []);

        if (!searchQuery) return pool;
        const q = searchQuery.toLowerCase();
        return pool.filter(s => s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
    }, [eligibilityReport, eligibilityFilterTab, searchQuery]);

    // Filtered ledger for Backlogs
    const filteredBacklogLedger = useMemo(() => {
        return (backlogReport.ledger || []).filter(s => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
        });
    }, [backlogReport.ledger, searchQuery]);

    // ── Manual Refresh ──
    const [isRefreshing, setIsRefreshing] = useState(false);
    const handleRefresh = async () => {
        setIsRefreshing(true);
        clearApiCache();
        try {
            if (viewTab === 'eligibility') {
                await loadEligibility();
            } else {
                await loadBacklogs();
            }
        } finally {
            setIsRefreshing(false);
        }
    };

    // ── Excel Export ──
    const handleExportExcel = () => {
        try {
            const wb = XLSX.utils.book_new();

            if (viewTab === 'eligibility') {
                const detainedList = eligibilityReport.detainedStudents || [];
                const eligibleList = eligibilityReport.eligibleStudents || [];
                if (detainedList.length === 0 && eligibleList.length === 0) {
                    alert('No progression evaluation records available to export.');
                    return;
                }

                const wsDisclaimer = XLSX.utils.aoa_to_sheet([
                    ['UNVERIFIED THRESHOLDS — DO NOT ACT ON THIS WITHOUT CONFIRMATION'],
                    ['The credit/backlog limits used to produce this register (20 credits for Sem 3, 4-backlog caps, the Sem-7 first-year-clearance rule) have not been confirmed against an official VTU regulation document for the applicable scheme/regulation year.'],
                    ['Verify against the official VTU circular before treating any student as detained.'],
                ]);
                XLSX.utils.book_append_sheet(wb, wsDisclaimer, 'READ FIRST');

                const detainedHeaders = ['#', 'USN', 'Name', 'Department', 'Earned Cr', 'Backlogs', 'Detention Reasons', 'Uncleared Subjects'];
                const detainedRows = detainedList.map((s, idx) => [
                    idx + 1,
                    s.usn,
                    s.name,
                    s.branch,
                    s.totalEarnedCredits ?? 0,
                    s.activeBacklogsCount ?? 0,
                    Array.isArray(s.detentionReasons) ? s.detentionReasons.join('; ') : (s.detentionReasons || '—'),
                    Array.isArray(s.unclearedSubjects) ? s.unclearedSubjects.map(u => u?.code || u).join(', ') : '—'
                ]);
                const wsDetained = XLSX.utils.aoa_to_sheet([detainedHeaders, ...detainedRows]);
                XLSX.utils.book_append_sheet(wb, wsDetained, 'Detained (Year-Back)');

                const eligibleHeaders = ['#', 'USN', 'Name', 'Department', 'Earned Cr', 'Backlogs', 'Progression Status'];
                const eligibleRows = eligibleList.map((s, idx) => [
                    idx + 1,
                    s.usn,
                    s.name,
                    s.branch,
                    s.totalEarnedCredits ?? 0,
                    s.activeBacklogsCount ?? 0,
                    'Eligible for Progression'
                ]);
                const wsEligible = XLSX.utils.aoa_to_sheet([eligibleHeaders, ...eligibleRows]);
                XLSX.utils.book_append_sheet(wb, wsEligible, 'Eligible Cohort');

                XLSX.writeFile(wb, `VTU_Eligibility_Register_${branch}_Sem${targetSemester}.xlsx`);
            } else {
                const ledgerList = backlogReport.ledger || [];
                if (ledgerList.length === 0) {
                    alert('No standing backlog records available to export.');
                    return;
                }

                const headers = ['#', 'USN', 'Student Name', 'Branch', 'Sem', 'Total Backlogs', 'Backlog Credits', 'Risk Status', 'Failed Subjects'];
                const rows = ledgerList.map((s, idx) => [
                    idx + 1,
                    s.usn,
                    s.name,
                    s.branch,
                    `Sem ${s.semester}`,
                    s.totalBacklogs ?? 0,
                    s.backlogCredits ?? 0,
                    s.isCritical ? 'Critical (>4 Arrears)' : 'Active Backlog',
                    Array.isArray(s.failedSubjects) ? s.failedSubjects.map(f => `${f?.code || f} (Sem ${f?.semester || '—'})`).join(', ') : '—'
                ]);
                const wsLedger = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                XLSX.utils.book_append_sheet(wb, wsLedger, 'Student Arrears Ledger');

                const subHeaders = ['#', 'Subject Code', 'Subject Name', 'Semester', 'Credits', 'Failed Students Count'];
                const subRows = (backlogReport.subjectConcentration || []).map((sub, idx) => [
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

            if (viewTab === 'eligibility') {
                const detainedList = eligibilityReport.detainedStudents || [];
                if (detainedList.length === 0 && (eligibilityReport.eligibleStudents || []).length === 0) {
                    alert('No progression evaluation records available to download.');
                    return;
                }

                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`VTU Vertical Progression Register - Admission to Semester ${targetSemester}`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                const evalCount = eligibilityReport?.summary?.totalEvaluated ?? 0;
                const eligCount = eligibilityReport?.summary?.eligibleCount ?? 0;
                const detCount = eligibilityReport?.summary?.detainedCount ?? 0;
                doc.text(`Branch: ${branch} | Batch: ${batch || 'All'} | Evaluated: ${evalCount} | Eligible: ${eligCount} | Detained: ${detCount} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const dHead = [['#', 'USN', 'Name', 'Branch', 'Backlogs', 'Reason for Detention']];
                const dBody = detainedList.map((s, idx) => [
                    idx + 1,
                    s.usn,
                    s.name,
                    s.branch,
                    s.activeBacklogsCount ?? 0,
                    Array.isArray(s.detentionReasons) ? s.detentionReasons.join(' | ') : (s.detentionReasons || 'Detained')
                ]);

                autoTable(doc, {
                    head: dHead,
                    body: dBody.length > 0 ? dBody : [['—', '—', 'No students detained in this cohort', '—', '—', '—']],
                    startY: 26,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [185, 28, 28], textColor: [255, 255, 255] }
                });

                doc.save(`Detention_Register_${branch}_Sem${targetSemester}.pdf`);
            } else {
                const ledgerList = backlogReport.ledger || [];
                if (ledgerList.length === 0) {
                    alert('No standing backlog records available to download.');
                    return;
                }

                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`GradeFlow - Standing Backlogs Register (${branch})`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                const carriers = backlogReport?.summary?.totalCarriers ?? ledgerList.length;
                const subjects = backlogReport?.summary?.totalArrearsSubjects ?? 0;
                const credits = backlogReport?.summary?.totalArrearsCredits ?? 0;
                doc.text(`Carrying Students: ${carriers} | Total Uncleared Subjects: ${subjects} | Credits at Risk: ${credits} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['#', 'USN', 'Student Name', 'Branch', 'Sem', 'Backlogs', 'Credits', 'Failed Course Codes']];
                const tableBody = ledgerList.map((s, idx) => [
                    idx + 1,
                    s.usn,
                    s.name,
                    s.branch,
                    s.semester,
                    s.totalBacklogs ?? 0,
                    s.backlogCredits ?? 0,
                    Array.isArray(s.failedSubjects) ? s.failedSubjects.map(f => f?.code || f).join(', ') : '—'
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
                    <PageHeaderEyebrow>Institutional Compliance</PageHeaderEyebrow>
                    <PageHeaderTitle>Academic Risk &amp; Progression Center</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Deterministic audit for VTU Vertical Progression, credit carryover limits, and standing arrears.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button onClick={handleRefresh} variant="secondary" disabled={isRefreshing || eligibilityLoading || backlogLoading}>
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
                    onClick={() => setViewTab('eligibility')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'eligibility' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'eligibility' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>fact_check</span>
                    Vertical Progression &amp; Detention Register
                </button>
                <button
                    type="button"
                    onClick={() => setViewTab('backlogs')}
                    style={{
                        padding: '10px 20px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'backlogs' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'backlogs' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>warning</span>
                    Standing Arrears &amp; Backlog Ledger
                </button>
            </div>

            {/* Shared Filters */}
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

                        {viewTab === 'eligibility' ? (
                            <Select
                                label="Target Semester Gate"
                                value={targetSemester}
                                onChange={e => setTargetSemester(Number(e.target.value))}
                                options={[
                                    { value: 3, label: 'Semester 3 (1st -> 2nd Year Gate)' },
                                    { value: 7, label: 'Semester 7 (Vertical Clearance Gate)' }
                                ]}
                            />
                        ) : (
                            <Select
                                label="Backlog Risk Threshold"
                                value={backlogThreshold}
                                onChange={e => setBacklogThreshold(Number(e.target.value))}
                                options={[
                                    { value: 1, label: '≥ 1 Uncleared Subject (All Carriers)' },
                                    { value: 2, label: '≥ 2 Uncleared Subjects' },
                                    { value: 4, label: '≥ 4 Subjects (Critical Arrears)' },
                                ]}
                            />
                        )}

                        <Input
                            label="Search Student"
                            placeholder="Find USN or Name..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* TAB 1: ELIGIBILITY & VERTICAL PROGRESSION */}
            {viewTab === 'eligibility' && (
                <>
                    {/* Metrics Overview */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total Evaluated</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{eligibilityReport.summary.totalEvaluated}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Active students screened</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Eligible to Progress</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>{eligibilityReport.summary.eligibleCount}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Cleared for Sem {targetSemester}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Year-Back / Detained</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626' }}>{eligibilityReport.summary.detainedCount}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Barred from promotion</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Progression Clearance Rate</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{eligibilityReport.summary.eligibilityRate.toFixed(1)}%</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Department compliance index</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Filter Pills */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <Button
                            variant={eligibilityFilterTab === 'all' ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => setEligibilityFilterTab('all')}
                        >
                            All Screened ({eligibilityReport.allStudents?.length || 0})
                        </Button>
                        <Button
                            variant={eligibilityFilterTab === 'detained' ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => setEligibilityFilterTab('detained')}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '4px', color: '#DC2626' }}>warning</span>
                            Detained Only ({eligibilityReport.detainedStudents?.length || 0})
                        </Button>
                        <Button
                            variant={eligibilityFilterTab === 'eligible' ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => setEligibilityFilterTab('eligible')}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '4px', color: '#16A34A' }}>check_circle</span>
                            Eligible Only ({eligibilityReport.eligibleStudents?.length || 0})
                        </Button>
                    </div>

                    {/* Table View */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Screening Roster ({filteredEligibilityStudents.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Earned Credits</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Active Backlogs</th>
                                            <th style={{ padding: '12px 16px' }}>Status</th>
                                            <th style={{ padding: '12px 16px' }}>Compliance Remarks</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {eligibilityLoading ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Screening cohort records...</td>
                                            </tr>
                                        ) : filteredEligibilityStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students match the selected compliance criteria.</td>
                                            </tr>
                                        ) : (
                                            filteredEligibilityStudents.map(s => {
                                                const isDetained = s.isDetained ?? (!s.isEligible || s.status === 'Detained');
                                                return (
                                                    <tr key={s.usn} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                            {s.usn}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                            {s.name}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                            {s.totalEarnedCredits}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: s.activeBacklogsCount > 0 ? '#DC2626' : '#16A34A' }}>
                                                            {s.activeBacklogsCount}
                                                        </td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                background: isDetained ? 'rgba(220, 38, 38, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                                                                color: isDetained ? '#DC2626' : '#16A34A'
                                                            }}>
                                                                {isDetained ? 'DETAINED' : 'ELIGIBLE'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', color: isDetained ? '#DC2626' : 'var(--tx-muted)', fontSize: '12px' }}>
                                                            {isDetained ? (Array.isArray(s.detentionReasons) && s.detentionReasons.length > 0 ? s.detentionReasons.join('; ') : 'Barred from Vertical Progression') : 'Cleared for Vertical Progression'}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                            <Link href={`/faculty/students/${s.usn}`} style={{ textDecoration: 'none' }}>
                                                                <Button size="sm" variant="ghost">Audit Dossier</Button>
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

            {/* TAB 2: STANDING BACKLOGS & BOTTLE-NECKS */}
            {viewTab === 'backlogs' && (
                <>
                    {/* Summary Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Carrying Students</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626' }}>{backlogReport.summary.totalCarriers}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Students with uncleared credits</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total Arrears Incurred</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{backlogReport.summary.totalArrearsSubjects}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Total subject backlog instances</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Credits at Risk</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{backlogReport.summary.totalArrearsCredits}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Cumulative uncleared credits</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Critical Carriers (&gt;4)</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#B91C1C' }}>{backlogReport.summary.criticalCarriers}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Severe detention hazard</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Sub-view switcher */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <Button
                            variant={backlogSubTab === 'ledger' ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => setBacklogSubTab('ledger')}
                        >
                            Student Arrears Ledger ({filteredBacklogLedger.length})
                        </Button>
                        <Button
                            variant={backlogSubTab === 'heatmap' ? 'primary' : 'ghost'}
                            size="sm"
                            onClick={() => setBacklogSubTab('heatmap')}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '4px' }}>bubble_chart</span>
                            Subject Bottleneck Density ({backlogReport.subjectConcentration?.length || 0})
                        </Button>
                    </div>

                    {/* Table View */}
                    {backlogSubTab === 'ledger' ? (
                        <Card>
                            <CardHeader>
                                <CardTitle>Student Arrears Ledger ({filteredBacklogLedger.length})</CardTitle>
                            </CardHeader>
                            <CardContent style={{ padding: 0 }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                                <th style={{ padding: '12px 16px' }}>USN</th>
                                                <th style={{ padding: '12px 16px' }}>Student Name</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Active Sem</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Total Backlogs</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Arrears Credits</th>
                                                <th style={{ padding: '12px 16px' }}>Risk Status</th>
                                                <th style={{ padding: '12px 16px' }}>Uncleared Subjects</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {backlogLoading ? (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading arrears records...</td>
                                                </tr>
                                            ) : filteredBacklogLedger.length === 0 ? (
                                                <tr>
                                                    <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students match the active arrears threshold.</td>
                                                </tr>
                                            ) : (
                                                filteredBacklogLedger.map(s => (
                                                    <tr key={s.usn} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                            {s.usn}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                            {s.name}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                            Sem {s.semester}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: s.totalBacklogs >= 4 ? '#B91C1C' : '#DC2626' }}>
                                                            {s.totalBacklogs}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                            {s.backlogCredits} Cr
                                                        </td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                background: s.isCritical ? 'rgba(185, 28, 28, 0.15)' : 'rgba(220, 38, 38, 0.1)',
                                                                color: s.isCritical ? '#B91C1C' : '#DC2626'
                                                            }}>
                                                                {s.isCritical ? 'CRITICAL (>4)' : 'ACTIVE ARREARS'}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                                            {s.failedSubjects.map(f => `${f.code} (S${f.semester})`).join(', ')}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                            <Link href={`/faculty/students/${s.usn}`} style={{ textDecoration: 'none' }}>
                                                                <Button size="sm" variant="ghost">Audit</Button>
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
                    ) : (
                        <Card>
                            <CardHeader>
                                <CardTitle>Subject Failure Density &amp; Bottlenecks ({backlogReport.subjectConcentration?.length || 0})</CardTitle>
                            </CardHeader>
                            <CardContent style={{ padding: 0 }}>
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                                <th style={{ padding: '12px 16px' }}>Course Code</th>
                                                <th style={{ padding: '12px 16px' }}>Subject Name</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Curriculum Sem</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Credits</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'center' }}>Uncleared Students</th>
                                                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {backlogReport.subjectConcentration?.map(sub => (
                                                <tr key={sub.code} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                        {sub.code}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                        {sub.name}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        Sem {sub.semester}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {sub.credits}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: '#DC2626' }}>
                                                        {sub.count}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                        <Link href={`/faculty/analytics/subject?code=${sub.code}`} style={{ textDecoration: 'none' }}>
                                                            <Button size="sm" variant="ghost">Subject Analytics</Button>
                                                        </Link>
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
        </div>
    );
}
