'use client';

import { useState, useEffect, useCallback } from 'react';
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

const SECTION_ACCENTS = ['#6366F1', '#10B981', '#F59E0B', '#3B82F6', '#EC4899'];

function SectionsCompareContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], semesters: [1,2,3,4,5,6,7,8] });

    // Filters
    const [branch, setBranch] = useState('CS');
    const [semester, setSemester] = useState(3);

    // Data
    const [report, setReport] = useState({
        branch: 'CS',
        semester: 3,
        sections: [],
        sectionComparisons: [],
        subjectMatrix: []
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

    // 2. Fetch section comparison data
    const loadSectionsData = useCallback(async () => {
        if (!branch) return;
        setLoading(true);
        try {
            const query = { branch, semester };
            const res = await apiRequest('/api/faculty/analytics/sections-compare', { query });
            if (res) {
                setReport(res);
            }
        } catch (err) {
            console.error('Failed to load section comparison:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, semester]);

    useEffect(() => {
        loadSectionsData();
    }, [loadSectionsData]);

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Section Summary Sheet
        const sHeaders = ['Section', 'Assigned Faculty', 'Enrolled', 'Appeared', 'Passed', 'Failed', 'Pass Rate (%)', 'Avg Score', 'Section Topper'];
        const sRows = report.sectionComparisons.map(s => [
            s.section, s.facultyName, s.enrolled, s.appeared, s.passed, s.failed, `${s.passRate}%`, s.avgScore, s.topper
        ]);
        const wsSummary = XLSX.utils.aoa_to_sheet([sHeaders, ...sRows]);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Section Performance');

        // 2. Subject Matrix Sheet
        const subHeaders = ['Course Code', 'Course Name', ...report.sections.map(sec => `Section ${sec} Pass %`)];
        const subRows = report.subjectMatrix.map(sub => [
            sub.code,
            sub.name,
            ...report.sections.map(sec => sub.rates[sec] !== null ? `${sub.rates[sec]}%` : '—')
        ]);
        const wsSub = XLSX.utils.aoa_to_sheet([subHeaders, ...subRows]);
        XLSX.utils.book_append_sheet(wb, wsSub, 'Subject Pass Rates');

        XLSX.writeFile(wb, `Section_Comparison_${branch}_Sem${semester}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Multi-Section Direct Comparison (Department ${branch} - Sem ${semester})`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Sections Compared: ${report.sections.join(', ')} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

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

        const subHead = [['Code', 'Subject Name', ...report.sections.map(sec => `Sec ${sec}`)]];
        const subBody = report.subjectMatrix.map(sub => [
            sub.code,
            sub.name,
            ...report.sections.map(sec => sub.rates[sec] !== null ? `${sub.rates[sec]}%` : '—')
        ]);

        autoTable(doc, {
            head: subHead,
            body: subBody,
            startY: lastY + 13,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
        });

        doc.save(`Section_Comparison_${branch}_Sem${semester}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Class Operations &amp; Benchmarking</PageHeaderEyebrow>
                    <PageHeaderTitle>Multi-Section Direct Comparison</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Side-by-side performance evaluation across parallel class sections (Section A vs B vs C vs D).
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
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
                                onChange={e => setSemester(Number(e.target.value))}
                                options={meta.semesters.map(s => ({ value: s, label: `Semester ${s}` }))}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

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
                                    <div style={{ fontSize: '12px', padding: '8px 12px', background: 'var(--surface-low)', borderRadius: '6px', border: '1px solid var(--border-low)' }}>
                                        <span style={{ fontWeight: 800, color: 'var(--tx-dim)' }}>Section Topper: </span>
                                        <strong style={{ color: 'var(--tx-main)' }}>{sec.topper}</strong>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* Subject Pass Rate Comparison Matrix */}
            <Card style={{ overflow: 'hidden' }}>
                <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>grid_view</span>
                        Subject Pass Rate Matrix Across Sections ({report.subjectMatrix.length} Subjects)
                    </CardTitle>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px' }}>Subject Code</th>
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
                                </tr>
                            </thead>
                            <tbody>
                                {report.subjectMatrix.length === 0 ? (
                                    <tr>
                                        <td colSpan={report.sections.length + 2} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Evaluating section performance data...' : 'No subject results recorded for this semester.'}
                                        </td>
                                    </tr>
                                ) : (
                                    report.subjectMatrix.map(sub => (
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
                                                                padding: '2px 8px', borderRadius: '4px', fontSize: '11.5px',
                                                                background: rate >= 80 ? 'rgba(16, 185, 129, 0.12)' : rate >= 60 ? 'rgba(99, 102, 241, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                color: rate >= 80 ? '#10B981' : rate >= 60 ? 'var(--primary)' : '#EF4444'
                                                            }}>
                                                                {rate}%
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--tx-dim)' }}>—</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
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
