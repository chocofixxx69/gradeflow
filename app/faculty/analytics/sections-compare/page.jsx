'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Foundation';

export default function SectionsComparePage() {
    return (
        <AuthGuard role="faculty">
            <SectionsCompareContent />
        </AuthGuard>
    );
}

const SECTION_ACCENTS = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899', '#8B5CF6'];

function SectionsCompareContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8] });

    // Filters
    const [branch, setBranch] = useState('ALL');
    const [batch, setBatch] = useState('ALL');
    const [semester, setSemester] = useState(3);
    const [sectionMode, setSectionMode] = useState('auto');
    const [subjectSearch, setSubjectSearch] = useState('');

    // Data
    const [report, setReport] = useState({
        branch: 'ALL',
        batch: 'ALL',
        semester: 3,
        sectionMode: 'auto',
        sections: [],
        sectionComparisons: [],
        subjectMatrix: [],
        unassignedCount: 0,
        noRealSections: false,
        benchmarks: {
            bestSection: '—',
            totalEvaluated: 0,
            benchmarkAvg: 0,
            sectionSpread: 0,
            subjectCount: 0
        }
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

    // 2. Fetch section comparison data
    const loadSectionsData = useCallback(async () => {
        setLoading(true);
        try {
            const query = { branch, batch, semester, sectionMode };
            const res = await apiRequest('/api/faculty/analytics/sections-compare', { query });
            if (res) {
                setReport(res);
            }
        } catch (err) {
            console.error('Failed to load section comparison:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, batch, semester, sectionMode]);

    useEffect(() => {
        loadSectionsData();
    }, [loadSectionsData]);

    // Filtered subject matrix for search
    const filteredSubjectMatrix = useMemo(() => {
        const q = (subjectSearch || '').trim().toLowerCase();
        if (!q) return report.subjectMatrix || [];
        return (report.subjectMatrix || []).filter(s => 
            (s.code || '').toLowerCase().includes(q) || 
            (s.name || '').toLowerCase().includes(q)
        );
    }, [report.subjectMatrix, subjectSearch]);

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Section Summary Sheet
        const sHeaders = ['Section', 'Assigned Faculty', 'Enrolled', 'Appeared', 'Passed (All Clear)', 'Failed (Arrears)', 'Pass Rate (%)', 'Avg Score', 'Section Topper'];
        const sRows = report.sectionComparisons.map(s => [
            s.section, s.facultyName, s.enrolled, s.appeared, s.passed, s.failed, `${s.passRate}%`, s.avgScore, s.topper
        ]);
        const wsSummary = XLSX.utils.aoa_to_sheet([sHeaders, ...sRows]);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Section Performance');

        // 2. Subject Matrix Sheet
        const subHeaders = ['Course Code', 'Course Name', ...report.sections.map(sec => `Section ${sec} Pass %`), 'Best Section', 'Inter-Section Gap (%)'];
        const subRows = report.subjectMatrix.map(sub => [
            sub.code,
            sub.name,
            ...report.sections.map(sec => sub.rates[sec] !== null ? `${sub.rates[sec]}%` : '—'),
            sub.bestSection ? `Section ${sub.bestSection}` : '—',
            sub.gap !== undefined ? `${sub.gap}%` : '—'
        ]);
        const wsSub = XLSX.utils.aoa_to_sheet([subHeaders, ...subRows]);
        XLSX.utils.book_append_sheet(wb, wsSub, 'Subject Pass Rates');

        XLSX.writeFile(wb, `Section_Comparison_${branch}_Batch_${batch}_Sem${semester}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Multi-Section Direct Comparison (${branch} - Batch ${batch} - Sem ${semester})`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Sections Compared: ${report.sections.join(', ')} | Mode: ${sectionMode.toUpperCase()} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['Section', 'Faculty', 'Enrolled', 'Appeared', 'Passed', 'Failed', 'Pass %', 'Avg Score', 'Highest Total']];
        const tableBody = report.sectionComparisons.map(s => [
            s.section, s.facultyName, s.enrolled, s.appeared, s.passed, s.failed, `${s.passRate}%`, s.avgScore, s.highestScore
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
        doc.text('Subject Pass Rate Comparison across Sections', 14, lastY + 10);

        const subHead = [['Code', 'Subject Name', ...report.sections.map(sec => `Sec ${sec}`), 'Best Sec', 'Gap']];
        const subBody = report.subjectMatrix.map(sub => [
            sub.code,
            sub.name,
            ...report.sections.map(sec => sub.rates[sec] !== null ? `${sub.rates[sec]}%` : '—'),
            sub.bestSection ? `Sec ${sub.bestSection}` : '—',
            sub.gap !== undefined ? `${sub.gap}%` : '—'
        ]);

        autoTable(doc, {
            head: subHead,
            body: subBody,
            startY: lastY + 13,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
        });

        doc.save(`Section_Comparison_${branch}_Batch_${batch}_Sem${semester}.pdf`);
    };

    const b = report.benchmarks || {};

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Class Operations &amp; Benchmarking</PageHeaderEyebrow>
                    <PageHeaderTitle>Multi-Section Direct Comparison</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Side-by-side performance evaluation across real class sections you've created in Classes &amp; Sections — never invented groupings.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={report.sectionComparisons.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={report.sectionComparisons.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadSectionsData} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filter Toolbar */}
            <Card style={{ marginBottom: '24px' }}>
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
                                label="Intake Batch"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={[
                                    { value: 'ALL', label: 'ALL - All Cohorts' },
                                    ...(meta.batches || ['2025', '2024', '2023', '2022']).map(yr => ({ value: yr, label: `${yr} Batch` }))
                                ]}
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
                                label="Section Division Mode"
                                value={sectionMode}
                                onChange={e => setSectionMode(e.target.value)}
                                options={[
                                    { value: 'auto', label: 'All Real Sections' },
                                    { value: '2', label: 'Limit to First 2 Real Sections' },
                                    { value: '3', label: 'Limit to First 3 Real Sections' },
                                    { value: '4', label: 'Limit to First 4 Real Sections' }
                                ]}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {report.noRealSections && (
                <Card style={{ marginBottom: '24px', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.06)' }}>
                    <CardContent style={{ padding: '16px 20px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: '#EF4444', flexShrink: 0 }}>info</span>
                        <div style={{ fontSize: '13px', color: 'var(--tx-main)' }}>
                            <strong>No real sections exist for this branch/semester.</strong> {report.unassignedCount > 0 ? `${report.unassignedCount} student(s) matched your filters, but none of them belong to a class with a section assigned in ` : 'Create a class with a section in '}
                            <a href="/faculty/classes" style={{ color: 'var(--primary)', fontWeight: 700 }}>Classes &amp; Sections</a> and roster students into it to compare here — this report never invents section groupings.
                        </div>
                    </CardContent>
                </Card>
            )}

            {!report.noRealSections && report.unassignedCount > 0 && (
                <Card style={{ marginBottom: '24px', border: '1px solid var(--border)', background: 'var(--surface-low)' }}>
                    <CardContent style={{ padding: '14px 20px', fontSize: '12.5px', color: 'var(--tx-muted)' }}>
                        <strong>{report.unassignedCount}</strong> student(s) matching your filters have no real section assignment and are excluded from the comparison below — they are never guessed into a section.
                    </CardContent>
                </Card>
            )}

            {/* Institutional Benchmark Strip */}
            {report.sectionComparisons.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '14px', marginBottom: '24px' }}>
                    <Card style={{ background: 'var(--surface)' }}>
                        <CardContent style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>emoji_events</span>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Top Section</div>
                                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{b.bestSection || '—'}</div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card style={{ background: 'var(--surface)' }}>
                        <CardContent style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>trending_up</span>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Cohort Avg Score</div>
                                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)', marginTop: '2px' }}>{b.benchmarkAvg || 0} / 100</div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card style={{ background: 'var(--surface)' }}>
                        <CardContent style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(245, 158, 11, 0.12)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>swap_horiz</span>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Section Gap / Delta</div>
                                <div style={{ fontSize: '18px', fontWeight: 900, color: '#F59E0B', marginTop: '2px' }}>{b.sectionSpread || 0}%</div>
                            </div>
                        </CardContent>
                    </Card>

                    <Card style={{ background: 'var(--surface)' }}>
                        <CardContent style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'rgba(59, 130, 246, 0.12)', color: '#3B82F6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>groups</span>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Evaluated Students</div>
                                <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{b.totalEvaluated || 0} Total</div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Side-by-Side Section Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`, gap: '16px', marginBottom: '28px' }}>
                {report.sectionComparisons.map((sec, idx) => {
                    const color = SECTION_ACCENTS[idx % SECTION_ACCENTS.length];
                    const passColor = sec.passRate >= 80 ? '#10B981' : sec.passRate >= 60 ? 'var(--primary)' : '#EF4444';
                    return (
                        <Card key={sec.sectionKey} style={{ borderTop: `4px solid ${color}` }}>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                    <h3 style={{ fontSize: '20px', fontWeight: 900, margin: 0, color: 'var(--tx-main)' }}>
                                        {sec.section}
                                    </h3>
                                    <span style={{
                                        padding: '4px 10px', borderRadius: '8px',
                                        fontSize: '12px', fontWeight: 900,
                                        background: `${passColor}20`, color: passColor
                                    }}>
                                        {sec.passRate}% Pass
                                    </span>
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>person</span>
                                    {sec.facultyName}
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                    <div style={{ background: 'var(--surface-low)', padding: '10px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Appeared</div>
                                        <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)' }}>{sec.appeared} / {sec.enrolled}</div>
                                    </div>
                                    <div style={{ background: 'var(--surface-low)', padding: '10px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Passed</div>
                                        <div style={{ fontSize: '20px', fontWeight: 900, color: '#10B981' }}>{sec.passed}</div>
                                    </div>
                                    <div style={{ background: 'var(--surface-low)', padding: '10px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Failed</div>
                                        <div style={{ fontSize: '20px', fontWeight: 900, color: sec.failed > 0 ? '#EF4444' : 'var(--tx-muted)' }}>{sec.failed}</div>
                                    </div>
                                    <div style={{ background: 'var(--surface-low)', padding: '10px', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Avg Score</div>
                                        <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--primary)' }}>{sec.avgScore}</div>
                                    </div>
                                </div>

                                {sec.topper !== '—' && (
                                    <div style={{ fontSize: '12px', padding: '8px 12px', background: 'var(--surface-low)', borderRadius: '6px', border: '1px solid var(--border-low)', marginBottom: '12px' }}>
                                        <div style={{ fontWeight: 800, color: 'var(--tx-dim)', fontSize: '10.5px', textTransform: 'uppercase', marginBottom: '2px' }}>Section Topper</div>
                                        <strong style={{ color: 'var(--tx-main)' }}>{sec.topper}</strong>
                                    </div>
                                )}

                                {/* Grade Tally Mini Bar */}
                                {sec.grades && (
                                    <div style={{ borderTop: '1px solid var(--border-low)', paddingTop: '10px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>Grade Tally</div>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px', fontWeight: 700 }}>
                                            <span style={{ padding: '2px 6px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', borderRadius: '4px' }}>O: {sec.grades.O || 0}</span>
                                            <span style={{ padding: '2px 6px', background: 'rgba(59, 130, 246, 0.15)', color: '#3B82F6', borderRadius: '4px' }}>A+: {sec.grades.APlus || 0}</span>
                                            <span style={{ padding: '2px 6px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary)', borderRadius: '4px' }}>A: {sec.grades.A || 0}</span>
                                            <span style={{ padding: '2px 6px', background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', borderRadius: '4px' }}>B+: {sec.grades.BPlus || 0}</span>
                                            <span style={{ padding: '2px 6px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', borderRadius: '4px' }}>F: {sec.grades.F || 0}</span>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Subject Pass Rate Comparison Matrix */}
            <Card style={{ overflow: 'hidden' }}>
                <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>grid_view</span>
                        Subject Pass Rate Matrix Across Sections ({filteredSubjectMatrix.length} of {report.subjectMatrix.length} Subjects)
                    </CardTitle>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ position: 'relative' }}>
                            <span className="material-icons-round" style={{ position: 'absolute', left: '10px', top: '8px', fontSize: '18px', color: 'var(--tx-dim)' }}>search</span>
                            <input
                                type="text"
                                placeholder="Filter subjects..."
                                value={subjectSearch}
                                onChange={e => setSubjectSearch(e.target.value)}
                                style={{
                                    padding: '6px 12px 6px 34px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-low)',
                                    color: 'var(--tx-main)',
                                    fontSize: '12.5px',
                                    outline: 'none',
                                    width: '200px'
                                }}
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '130px' }}>Subject Code</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Subject Name</th>
                                    {report.sections.map((sec, idx) => (
                                        <th
                                            key={sec}
                                            style={{
                                                padding: '12px 16px', textAlign: 'center', width: '130px',
                                                color: SECTION_ACCENTS[idx % SECTION_ACCENTS.length],
                                                fontWeight: 800
                                            }}
                                        >
                                            Section {sec} Pass %
                                        </th>
                                    ))}
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: '100px', fontWeight: 800 }}>Best Sec</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: '100px', fontWeight: 800 }}>Delta Gap</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSubjectMatrix.length === 0 ? (
                                    <tr>
                                        <td colSpan={report.sections.length + 4} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Evaluating section performance data...' : 'No subject results match the current filters.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredSubjectMatrix.map(sub => (
                                        <tr key={sub.code} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                            <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                {sub.code}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>{sub.name}</td>
                                            {report.sections.map(sec => {
                                                const rate = sub.rates[sec];
                                                return (
                                                    <td key={sec} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800 }}>
                                                        {rate !== null ? (
                                                            <span style={{
                                                                padding: '3px 9px', borderRadius: '6px', fontSize: '11.5px',
                                                                background: rate >= 85 ? 'rgba(16, 185, 129, 0.12)' : rate >= 70 ? 'rgba(99, 102, 241, 0.12)' : rate >= 50 ? 'rgba(245, 158, 11, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                color: rate >= 85 ? '#10B981' : rate >= 70 ? 'var(--primary)' : rate >= 50 ? '#F59E0B' : '#EF4444'
                                                            }}>
                                                                {rate}%
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--tx-dim)' }}>—</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800 }}>
                                                {sub.bestSection ? (
                                                    <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'var(--surface-low)', border: '1px solid var(--border)', fontSize: '11px', color: 'var(--tx-main)' }}>
                                                        Sec {sub.bestSection}
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 800, fontSize: '12px', color: sub.gap > 20 ? '#EF4444' : sub.gap > 10 ? '#F59E0B' : 'var(--tx-dim)' }}>
                                                {sub.gap !== undefined && sub.gap > 0 ? `+${sub.gap}%` : '0%'}
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
