'use client';

import { useState, useEffect, useCallback, Fragment } from 'react';
import Link from 'next/link';
import AuthGuard from '../../../../components/AuthGuard';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest, clearApiCache } from '@/lib/api/client';

export default function SemesterAnalysisPage() {
    return (
        <AuthGuard role="faculty">
            <SemesterAnalysisContent />
        </AuthGuard>
    );
}

function SemesterAnalysisContent() {
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8], classes: [] });
    
    // Filter states initialized instantly from cached context
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [semester, setSemester] = useState(() => Number(initialSaved.semester) || 3);
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [classId, setClassId] = useState('');
    const [viewMode, setViewMode] = useState('credits'); // 'credits' | 'marks'
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'passed' | 'failed'
    const [searchQuery, setSearchQuery] = useState('');

    const initialData = getCachedApiData('/api/faculty/analytics/semester-analysis', {
        branch: initialSaved.branch || 'CS',
        semester: Number(initialSaved.semester) || 3,
        batch: initialSaved.batch || '2023'
    });

    // Data states - if pre-warmed, renders immediately with 0ms delay!
    const [data, setData] = useState(() => initialData || {
        students: [],
        subjects: [],
        summary: { totalAppeared: 0, totalPassed: 0, totalFailed: 0, passPercentage: 0, classCounts: { FCD: 0, FC: 0, SC: 0, P: 0, F: 0 } },
        subjectTallies: [],
        backlogRoster: []
    });
    const [loading, setLoading] = useState(() => !initialData);

    // Synchronize filters
    useEffect(() => {
        saveFilters({ branch, semester, batch });
    }, [branch, semester, batch]);

    // 1. Fetch metadata on mount
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) {
                    setMeta(res);
                }
            } catch (err) {
                console.error('Meta loading failed:', err);
            }
        }
        loadMeta();
    }, []);

    // 2. Fetch analysis data when filters change
    const loadAnalysis = useCallback(async () => {
        const cached = getCachedApiData('/api/faculty/analytics/semester-analysis', { branch, semester, batch, ...(classId ? { classId } : {}) });
        if (cached) {
            setData(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }

        try {
            const query = { branch, semester, batch };
            if (classId) query.classId = classId;
            const res = await apiRequest('/api/faculty/analytics/semester-analysis', { query });
            if (res) {
                setData(res);
            }
        } catch (err) {
            console.error('Semester analysis failed:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, semester, batch, classId]);

    useEffect(() => {
        if (branch && semester) {
            loadAnalysis();
        }
    }, [branch, semester, batch, classId, loadAnalysis]);

    // Filter students by status and search
    const filteredStudents = (data.students || []).filter(s => {
        if (statusFilter === 'passed' && (s.arrearsCount > 0 || !s.hasData)) return false;
        if (statusFilter === 'failed' && (s.arrearsCount === 0 || !s.hasData)) return false;
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase().trim();
        return (s.usn || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
    });

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Summary Sheet
        const summaryData = [
            ['GradeFlow - Semester Result Analysis'],
            [`Department / Branch: ${branch}`, `Semester: ${semester}`, `Batch: ${batch || 'All'}`],
            [`Generated on: ${new Date().toLocaleString()}`],
            [],
            ['SUMMARY METRICS'],
            ['Total Students Appeared', data.summary.totalAppeared],
            ['Total Students Passed', data.summary.totalPassed],
            ['Total Students with Backlogs', data.summary.totalFailed],
            ['Overall Pass Percentage', `${data.summary.passPercentage}%`],
            [],
            ['VTU CLASS DISTRIBUTION'],
            ['First Class with Distinction (FCD)', data.summary.classCounts.FCD],
            ['First Class (FC)', data.summary.classCounts.FC],
            ['Second Class (SC)', data.summary.classCounts.SC],
            ['Pass Class (P)', data.summary.classCounts.P],
            ['Fail (Arrears)', data.summary.classCounts.F],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // 2. Credits View Sheet
        const credHeaders = ['Sl No', 'USN', 'Student Name'];
        data.subjects.forEach(sub => {
            credHeaders.push(`${sub.code} Cr`, `${sub.code} Ci`, `${sub.code} G`, `${sub.code} Gi`, `${sub.code} CrP`);
        });
        credHeaders.push('Total Cr', 'Earned Ci', 'Total CrP', 'SGPA', 'Percentage (%)', 'Class', 'Backlogs');

        const credRows = (data.students || []).map((s, idx) => {
            const row = [idx + 1, s.usn, s.name];
            data.subjects.forEach(sub => {
                const d = s.subjectDetails[sub.code];
                if (d) {
                    row.push(d.cr, d.ci, d.g, d.gi, d.crp);
                } else {
                    row.push('—', '—', '—', '—', '—');
                }
            });
            row.push(s.totalRegisteredCr, s.totalEarnedCi, s.totalCrP, s.sgpa, s.percentage, s.vtuClass, s.arrearsCount);
            return row;
        });

        const wsCredits = XLSX.utils.aoa_to_sheet([credHeaders, ...credRows]);
        XLSX.utils.book_append_sheet(wb, wsCredits, 'Credits View');

        // 3. Marks View Sheet
        const marksHeaders = ['Sl No', 'USN', 'Student Name'];
        data.subjects.forEach(sub => {
            marksHeaders.push(`${sub.code} Int`, `${sub.code} Ext`, `${sub.code} Tot`, `${sub.code} Grd`);
        });
        marksHeaders.push('SGPA', 'Percentage (%)', 'Backlog Count');

        const marksRows = (data.students || []).map((s, idx) => {
            const row = [idx + 1, s.usn, s.name];
            data.subjects.forEach(sub => {
                const d = s.subjectDetails[sub.code];
                if (d) {
                    row.push(d.internal ?? '—', d.external ?? '—', d.total ?? '—', d.g);
                } else {
                    row.push('—', '—', '—', '—');
                }
            });
            row.push(s.sgpa, s.percentage, s.arrearsCount);
            return row;
        });

        const wsMarks = XLSX.utils.aoa_to_sheet([marksHeaders, ...marksRows]);
        XLSX.utils.book_append_sheet(wb, wsMarks, 'Marks View');

        // 4. Subject Tallies Sheet
        const tallyHeaders = ['Subject Code', 'Subject Name', 'Credits', 'Appeared', 'Passed', 'Failed', 'Pass %', 'O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F', 'Absent'];
        const tallyRows = (data.subjectTallies || []).map(st => [
            st.code,
            st.name,
            st.credits,
            st.appeared,
            st.passed,
            st.failed,
            `${st.passRate}%`,
            st.grades['O'] || 0,
            st.grades['A+'] || 0,
            st.grades['A'] || 0,
            st.grades['B+'] || 0,
            st.grades['B'] || 0,
            st.grades['C'] || 0,
            st.grades['P'] || 0,
            st.grades['F'] || 0,
            st.grades['Ab'] || 0
        ]);
        const wsTallies = XLSX.utils.aoa_to_sheet([tallyHeaders, ...tallyRows]);
        XLSX.utils.book_append_sheet(wb, wsTallies, 'Subject Tallies');

        // 5. Backlog Roster Sheet
        const backlogHeaders = ['Rank', 'USN', 'Student Name', 'Backlogs Count', 'Failed Subjects List'];
        const backlogRows = (data.backlogRoster || []).map((b, idx) => [
            idx + 1,
            b.usn,
            b.name,
            b.arrearsCount,
            b.failedSubjects.map(f => `${f.code} (${f.grade})`).join(', ')
        ]);
        const wsBacklogs = XLSX.utils.aoa_to_sheet([backlogHeaders, ...backlogRows]);
        XLSX.utils.book_append_sheet(wb, wsBacklogs, 'Backlog Roster');

        XLSX.writeFile(wb, `Semester_Analysis_${branch}_Sem${semester}_${batch || 'All'}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Semester ${semester} Result Analysis (${branch})`, 14, 15);
        
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Batch: ${batch || 'All'} | Appeared: ${data.summary.totalAppeared} | Passed: ${data.summary.totalPassed} | Pass %: ${data.summary.passPercentage}% | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['#', 'USN', 'Name', ...data.subjects.map(s => s.code), 'SGPA', '%', 'Class', 'Backlogs']];
        const tableBody = (filteredStudents || []).map((s, idx) => {
            const subVals = data.subjects.map(sub => {
                const d = s.subjectDetails[sub.code];
                if (!d) return '—';
                return viewMode === 'credits' ? `${d.g} (${d.ci})` : `${d.total || 0} [${d.g}]`;
            });
            return [idx + 1, s.usn, s.name, ...subVals, s.sgpa, `${s.percentage}%`, s.vtuClass, s.arrearsCount];
        });

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.5, halign: 'center' },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 8 },
                1: { cellWidth: 26, halign: 'left', fontStyle: 'bold' },
                2: { cellWidth: 38, halign: 'left' }
            }
        });

        doc.save(`Semester_Analysis_${branch}_Sem${semester}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Analytics</PageHeaderEyebrow>
                    <PageHeaderTitle>Semester Analysis</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Complete VTU Result Sheet with switchable Credits & Marks views, class awards, grade tallies, and arrears roster.
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
                    <Button onClick={() => { clearApiCache(); loadAnalysis(); }} variant="primary">
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
                                onChange={e => {
                                    setBranch(e.target.value);
                                    setClassId('');
                                }}
                                options={[
                                    { value: 'ALL', label: 'All Branches / Departments' },
                                    ...meta.branches.map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))
                                ]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Class / Section"
                                value={classId}
                                onChange={e => {
                                    const nextClassId = e.target.value;
                                    setClassId(nextClassId);
                                    if (nextClassId) {
                                        const c = (meta.classes || []).find(cls => String(cls.id) === String(nextClassId));
                                        if (c) {
                                            if (c.semester) setSemester(Number(c.semester));
                                            if (c.branch && branch !== c.branch) setBranch(c.branch);
                                        }
                                    }
                                }}
                                options={[
                                    { value: '', label: 'All Classes (Entire Cohort)' },
                                    ...(meta.classes || [])
                                        .filter(c => !branch || branch === 'ALL' || (c.branch && c.branch.toUpperCase().includes(branch.toUpperCase())))
                                        .map(c => ({ value: c.id, label: `${c.name} (${c.branch} - Sem ${c.semester}${c.section ? ` Sec ${c.section}` : ''})` }))
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
                                label="Intake Batch"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={[{ value: '', label: 'All Batches' }, ...meta.batches.map(b => ({ value: b, label: `${b.slice(-2)} Batch (${b})` }))]}
                            />
                        </div>
                        <div>
                            <Input
                                label="Search Student"
                                placeholder="Search by USN or Name..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* View Mode Switcher + KPI Badges */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '6px', background: 'var(--surface)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <button
                        onClick={() => setViewMode('compact')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: viewMode === 'compact' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'compact' ? '#FFFFFF' : 'var(--tx-muted)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Compact View (Tot &amp; Grd)
                    </button>
                    <button
                        onClick={() => setViewMode('credits')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: viewMode === 'credits' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'credits' ? '#FFFFFF' : 'var(--tx-muted)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Credits View (Cr, Ci, G, Gi, CrP)
                    </button>
                    <button
                        onClick={() => setViewMode('marks')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '12.5px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: viewMode === 'marks' ? 'var(--primary)' : 'transparent',
                            color: viewMode === 'marks' ? '#FFFFFF' : 'var(--tx-muted)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Marks View (Int, Ext, Total, Grade)
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setStatusFilter('all')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: statusFilter === 'all' ? 'var(--primary)' : 'var(--surface)',
                            color: statusFilter === 'all' ? '#FFFFFF' : 'var(--tx-main)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Appeared: <strong>{data.summary.totalAppeared}</strong>
                    </button>
                    <button
                        onClick={() => setStatusFilter(statusFilter === 'passed' ? 'all' : 'passed')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: '1px solid #10B981',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: statusFilter === 'passed' ? '#10B981' : 'rgba(16, 185, 129, 0.1)',
                            color: statusFilter === 'passed' ? '#FFFFFF' : '#10B981',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Passed: <strong>{data.summary.totalPassed}</strong> ({data.summary.passPercentage}%)
                    </button>
                    <button
                        onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')}
                        style={{
                            padding: '6px 14px',
                            borderRadius: '8px',
                            border: `1px solid ${data.summary.totalFailed > 0 ? '#EF4444' : 'var(--border)'}`,
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            background: statusFilter === 'failed' ? '#EF4444' : data.summary.totalFailed > 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--surface)',
                            color: statusFilter === 'failed' ? '#FFFFFF' : data.summary.totalFailed > 0 ? '#EF4444' : 'var(--tx-muted)',
                            transition: 'all 0.2s ease'
                        }}
                    >
                        Arrears: <strong>{data.summary.totalFailed}</strong>
                    </button>
                </div>
            </div>

            {/* Matrix Table */}
            <Card style={{ marginBottom: '28px', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', maxHeight: '650px', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-low)', borderBottom: '2px solid var(--border)' }}>
                            {/* Primary Header */}
                            <tr>
                                <th rowSpan={2} style={{ position: 'sticky', left: 0, zIndex: 15, background: 'var(--surface)', padding: '10px 12px', textAlign: 'left', width: '44px', minWidth: '44px', borderRight: '1px solid var(--border)' }}>#</th>
                                <th rowSpan={2} style={{ position: 'sticky', left: '44px', zIndex: 15, background: 'var(--surface)', padding: '10px 14px', textAlign: 'left', width: '135px', minWidth: '135px', borderRight: '1px solid var(--border)' }}>USN</th>
                                <th rowSpan={2} style={{ position: 'sticky', left: '179px', zIndex: 15, background: 'var(--surface)', padding: '10px 14px', textAlign: 'left', minWidth: '180px', maxWidth: '220px', borderRight: '2px solid var(--border)', boxShadow: '4px 0 8px -2px rgba(0,0,0,0.08)' }}>Student Name</th>
                                {data.subjects.map(sub => (
                                    <th
                                        key={sub.code}
                                        colSpan={viewMode === 'compact' ? 1 : viewMode === 'credits' ? 5 : 4}
                                        style={{ padding: '8px 10px', borderRight: '1px solid var(--border)', background: 'var(--surface)', borderBottom: '1px solid var(--border)', minWidth: viewMode === 'compact' ? '95px' : 'auto' }}
                                    >
                                        <div style={{ fontWeight: 800, color: 'var(--primary)' }}>{sub.code}</div>
                                        <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--tx-dim)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: viewMode === 'compact' ? '90px' : '140px', margin: '0 auto' }}>
                                            {sub.name} ({sub.credits} Cr)
                                        </div>
                                    </th>
                                ))}
                                {viewMode === 'credits' ? (
                                    <>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '55px', borderRight: '1px solid var(--border)' }}>ΣCr</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '55px', borderRight: '1px solid var(--border)' }}>ΣCi</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '55px', borderRight: '1px solid var(--border)' }}>ΣCrP</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '60px', borderRight: '1px solid var(--border)' }}>SGPA</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '55px', borderRight: '1px solid var(--border)' }}>%</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '65px', borderRight: '1px solid var(--border)' }}>Class</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '60px' }}>Backlog Cr</th>
                                    </>
                                ) : (
                                    <>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '60px', borderRight: '1px solid var(--border)' }}>SGPA</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '55px', borderRight: '1px solid var(--border)' }}>%</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '65px', borderRight: '1px solid var(--border)' }}>Class</th>
                                        <th rowSpan={2} style={{ padding: '8px', minWidth: '60px' }}>Backlogs</th>
                                    </>
                                )}
                            </tr>

                            {/* Sub-Header Columns */}
                            <tr style={{ fontSize: '10px', color: 'var(--tx-dim)', textTransform: 'uppercase' }}>
                                {data.subjects.map(sub => (
                                    viewMode === 'compact' ? (
                                        <th key={`compact-cols-${sub.code}`} style={{ padding: '6px 4px', borderRight: '1px solid var(--border)' }}>Tot [Grd]</th>
                                    ) : viewMode === 'credits' ? (
                                        <Fragment key={`cred-cols-${sub.code}`}>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>Cr</th>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>Ci</th>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>G</th>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>Gi</th>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border)' }}>CrP</th>
                                        </Fragment>
                                    ) : (
                                        <Fragment key={`mark-cols-${sub.code}`}>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>Int</th>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>Ext</th>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>Tot</th>
                                            <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border)' }}>Grd</th>
                                        </Fragment>
                                    )
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={data.subjects.length * (viewMode === 'compact' ? 1 : viewMode === 'credits' ? 5 : 4) + 10} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                        {loading ? 'Calculating semester results from live database...' : 'No students found matching current filters.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredStudents.map((s, idx) => {
                                    const rowFail = s.arrearsCount > 0;
                                    return (
                                        <tr
                                            key={s.usn}
                                            style={{
                                                borderBottom: '1px solid var(--border-low)',
                                                background: rowFail ? 'rgba(239, 68, 68, 0.03)' : idx % 2 === 0 ? 'transparent' : 'var(--surface-low)',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ position: 'sticky', left: 0, zIndex: 4, background: 'var(--surface)', padding: '8px 10px', textAlign: 'left', color: 'var(--tx-dim)', borderRight: '1px solid var(--border-low)' }}>{idx + 1}</td>
                                            <td style={{ position: 'sticky', left: '44px', zIndex: 4, background: 'var(--surface)', padding: '8px 12px', textAlign: 'left', fontWeight: 800, fontFamily: 'monospace', borderRight: '1px solid var(--border-low)', whiteSpace: 'nowrap' }}>
                                                <Link href={`/faculty/students/${s.usn}`} style={{ color: rowFail ? '#EF4444' : 'var(--primary)', textDecoration: 'none' }}>
                                                    {s.usn}
                                                </Link>
                                                {s.isLE && (
                                                    <span style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '9px', fontWeight: 800 }}>
                                                        LE
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ position: 'sticky', left: '179px', zIndex: 4, background: 'var(--surface)', padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--tx-main)', borderRight: '2px solid var(--border)', boxShadow: '4px 0 8px -2px rgba(0,0,0,0.08)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</td>

                                            {data.subjects.map(sub => {
                                                const d = s.subjectDetails[sub.code];
                                                if (!d) {
                                                    return (
                                                        <td key={sub.code} colSpan={viewMode === 'compact' ? 1 : viewMode === 'credits' ? 5 : 4} style={{ padding: '6px', color: 'var(--tx-muted)', borderRight: '1px solid var(--border)' }}>
                                                            —
                                                        </td>
                                                    );
                                                }

                                                const isF = d.isFail;
                                                const failStyle = isF ? { background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', fontWeight: 800 } : {};

                                                if (viewMode === 'compact') {
                                                    return (
                                                        <td key={sub.code} style={{
                                                            padding: '6px 8px',
                                                            borderRight: '1px solid var(--border)',
                                                            background: isF ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                                            whiteSpace: 'nowrap'
                                                        }}>
                                                            <span style={{ fontWeight: 800, color: isF ? '#EF4444' : 'var(--tx-main)' }}>
                                                                {d.total ?? '—'}
                                                            </span>
                                                            <span style={{
                                                                marginLeft: '5px',
                                                                padding: '1px 5px',
                                                                borderRadius: '4px',
                                                                fontSize: '10px',
                                                                fontWeight: 900,
                                                                background: isF ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                                                                color: isF ? '#EF4444' : '#10B981'
                                                            }}>
                                                                {d.g}
                                                            </span>
                                                        </td>
                                                    );
                                                } else if (viewMode === 'credits') {
                                                    return (
                                                        <Fragment key={sub.code}>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>{d.cr}</td>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)', ...failStyle }}>{d.ci}</td>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)', ...failStyle }}>{d.g}</td>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>{d.gi}</td>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border)', fontWeight: 700 }}>{d.crp}</td>
                                                        </Fragment>
                                                    );
                                                } else {
                                                    return (
                                                        <Fragment key={sub.code}>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>{d.internal ?? '—'}</td>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>{d.external ?? '—'}</td>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)', ...failStyle }}>{d.total ?? '—'}</td>
                                                            <td style={{ padding: '6px 4px', borderRight: '1px solid var(--border)', ...failStyle }}>{d.g}</td>
                                                        </Fragment>
                                                    );
                                                }
                                            })}

                                            {viewMode === 'credits' ? (
                                                <>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)' }}>{s.totalRegisteredCr}</td>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)', fontWeight: 700 }}>{s.totalEarnedCi}</td>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)', fontWeight: 700 }}>{s.totalCrP}</td>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)', fontWeight: 900, color: s.sgpa >= 8.0 ? '#10B981' : s.sgpa >= 5.0 ? 'var(--primary)' : '#EF4444' }}>
                                                        {s.sgpa > 0 ? s.sgpa.toFixed(2) : '—'}
                                                    </td>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)' }}>{s.percentage > 0 ? `${s.percentage}%` : '—'}</td>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            background: s.vtuClass === 'FCD' ? 'rgba(99, 102, 241, 0.15)' : s.vtuClass === 'FC' ? 'rgba(16, 185, 129, 0.15)' : s.vtuClass === 'SC' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                            color: s.vtuClass === 'FCD' ? '#6366F1' : s.vtuClass === 'FC' ? '#10B981' : s.vtuClass === 'SC' ? '#3B82F6' : '#EF4444'
                                                        }}>
                                                            {s.vtuClass}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px', fontWeight: 800, color: s.backlogCredits > 0 ? '#EF4444' : '#10B981' }}>
                                                        {s.backlogCredits > 0 ? s.backlogCredits : 'Clear'}
                                                    </td>
                                                </>
                                            ) : (
                                                <>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)', fontWeight: 900, color: s.sgpa >= 8.0 ? '#10B981' : s.sgpa >= 5.0 ? 'var(--primary)' : '#EF4444' }}>
                                                        {s.sgpa > 0 ? s.sgpa.toFixed(2) : '—'}
                                                    </td>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)' }}>{s.percentage > 0 ? `${s.percentage}%` : '—'}</td>
                                                    <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '4px',
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            background: s.vtuClass === 'FCD' ? 'rgba(99, 102, 241, 0.15)' : s.vtuClass === 'FC' ? 'rgba(16, 185, 129, 0.15)' : s.vtuClass === 'SC' ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                                                            color: s.vtuClass === 'FCD' ? '#6366F1' : s.vtuClass === 'FC' ? '#10B981' : s.vtuClass === 'SC' ? '#3B82F6' : '#EF4444'
                                                        }}>
                                                            {s.vtuClass}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '8px', fontWeight: 800, color: s.arrearsCount > 0 ? '#EF4444' : '#10B981' }}>
                                                        {s.arrearsCount > 0 ? `${s.arrearsCount} Sub` : 'Clear'}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Footer 1: Class Classification Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', marginBottom: '28px' }}>
                {[
                    { label: 'First Class with Distinction (FCD)', count: data.summary.classCounts.FCD, color: '#6366F1', bg: 'rgba(99, 102, 241, 0.1)' },
                    { label: 'First Class (FC)', count: data.summary.classCounts.FC, color: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
                    { label: 'Second Class (SC)', count: data.summary.classCounts.SC, color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.1)' },
                    { label: 'Pass Class (P)', count: data.summary.classCounts.P, color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)' },
                    { label: 'Fail / Arrears', count: data.summary.classCounts.F, color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: item.color }}>{item.count}</div>
                    </div>
                ))}
            </div>

            {/* Footer 2: Per-Subject Grade Tally & Pass % */}
            <Card style={{ marginBottom: '28px' }}>
                <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '20px' }}>assessment</span>
                        Subject Performance &amp; Grade Tallies
                    </CardTitle>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Subject Code</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Subject Name</th>
                                    <th style={{ padding: '10px 8px' }}>Cr</th>
                                    <th style={{ padding: '10px 8px' }}>Appeared</th>
                                    <th style={{ padding: '10px 8px' }}>Passed</th>
                                    <th style={{ padding: '10px 8px' }}>Failed</th>
                                    <th style={{ padding: '10px 8px' }}>Pass %</th>
                                    <th style={{ padding: '10px 6px', color: '#10B981' }}>O</th>
                                    <th style={{ padding: '10px 6px', color: '#10B981' }}>A+</th>
                                    <th style={{ padding: '10px 6px', color: '#10B981' }}>A</th>
                                    <th style={{ padding: '10px 6px', color: '#3B82F6' }}>B+</th>
                                    <th style={{ padding: '10px 6px', color: '#3B82F6' }}>B</th>
                                    <th style={{ padding: '10px 6px', color: '#F59E0B' }}>C</th>
                                    <th style={{ padding: '10px 6px', color: '#F59E0B' }}>P</th>
                                    <th style={{ padding: '10px 6px', color: '#EF4444' }}>F</th>
                                    <th style={{ padding: '10px 6px', color: 'var(--tx-muted)' }}>Ab</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.subjectTallies.map(st => (
                                    <tr key={st.code} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                        <td style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--primary)' }}>{st.code}</td>
                                        <td style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>{st.name}</td>
                                        <td style={{ padding: '10px 8px' }}>{st.credits}</td>
                                        <td style={{ padding: '10px 8px', fontWeight: 700 }}>{st.appeared}</td>
                                        <td style={{ padding: '10px 8px', color: '#10B981', fontWeight: 700 }}>{st.passed}</td>
                                        <td style={{ padding: '10px 8px', color: st.failed > 0 ? '#EF4444' : 'var(--tx-dim)', fontWeight: 700 }}>{st.failed}</td>
                                        <td style={{ padding: '10px 8px', fontWeight: 900, color: st.passRate >= 75 ? '#10B981' : st.passRate >= 50 ? '#F59E0B' : '#EF4444' }}>
                                            {st.passRate}%
                                        </td>
                                        <td style={{ padding: '10px 6px' }}>{st.grades['O'] || 0}</td>
                                        <td style={{ padding: '10px 6px' }}>{st.grades['A+'] || 0}</td>
                                        <td style={{ padding: '10px 6px' }}>{st.grades['A'] || 0}</td>
                                        <td style={{ padding: '10px 6px' }}>{st.grades['B+'] || 0}</td>
                                        <td style={{ padding: '10px 6px' }}>{st.grades['B'] || 0}</td>
                                        <td style={{ padding: '10px 6px' }}>{st.grades['C'] || 0}</td>
                                        <td style={{ padding: '10px 6px' }}>{st.grades['P'] || 0}</td>
                                        <td style={{ padding: '10px 6px', fontWeight: 800, color: st.grades['F'] > 0 ? '#EF4444' : 'var(--tx-dim)' }}>{st.grades['F'] || 0}</td>
                                        <td style={{ padding: '10px 6px', color: st.grades['Ab'] > 0 ? '#EF4444' : 'var(--tx-muted)' }}>{st.grades['Ab'] || 0}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Footer 3: Arrears (Backlog) Analysis Roster */}
            {data.backlogRoster.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#EF4444' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>error_outline</span>
                            Backlog (Arrears) Analysis — {data.backlogRoster.length} Students Carrying Backlogs
                        </CardTitle>
                    </CardHeader>
                    <CardContent style={{ padding: 0 }}>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                                <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                    <tr>
                                        <th style={{ padding: '12px 14px', width: '50px', textAlign: 'left' }}>#</th>
                                        <th style={{ padding: '12px 14px', width: '140px', textAlign: 'left' }}>USN</th>
                                        <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: '180px' }}>Student Name</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'center', minWidth: '180px', whiteSpace: 'nowrap' }}>Arrears &amp; Backlog Cr</th>
                                        <th style={{ padding: '12px 16px', textAlign: 'left' }}>Failed Subjects List</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.backlogRoster.map((st, idx) => (
                                        <tr key={st.usn} style={{ borderBottom: '1px solid var(--border-low)', transition: 'background 0.15s ease' }}>
                                            <td style={{ padding: '12px 14px', color: 'var(--tx-dim)' }}>{idx + 1}</td>
                                            <td style={{ padding: '12px 14px', fontWeight: 800, fontFamily: 'monospace' }}>
                                                <Link href={`/faculty/students/${st.usn}`} style={{ color: '#EF4444', textDecoration: 'none' }}>
                                                    {st.usn}
                                                </Link>
                                                {st.isLE && (
                                                    <span style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '9px', fontWeight: 800 }}>
                                                        LE
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 14px', fontWeight: 600 }}>{st.name}</td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    padding: '5px 14px',
                                                    borderRadius: '20px',
                                                    background: 'rgba(239, 68, 68, 0.12)',
                                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                                    color: '#EF4444',
                                                    fontWeight: 800,
                                                    fontSize: '12px',
                                                    whiteSpace: 'nowrap',
                                                    lineHeight: 1
                                                }}>
                                                    {st.arrearsCount} {st.arrearsCount === 1 ? 'Subject' : 'Subjects'} ({st.backlogCredits} Cr)
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                                    {st.failedSubjects.map((f, i) => {
                                                        const isAbsent = f.grade === 'A' || f.grade === 'AB' || f.grade === 'ABSENT';
                                                        return (
                                                            <span
                                                                key={i}
                                                                title={`${f.name} (Int: ${f.internal ?? '—'}, Ext: ${f.external ?? '—'}, Tot: ${f.total ?? '—'})`}
                                                                style={{
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '6px',
                                                                    padding: '4px 10px',
                                                                    borderRadius: '6px',
                                                                    background: isAbsent ? 'rgba(245, 158, 11, 0.1)' : 'rgba(239, 68, 68, 0.08)',
                                                                    border: `1px solid ${isAbsent ? 'rgba(245, 158, 11, 0.3)' : 'rgba(239, 68, 68, 0.25)'}`,
                                                                    fontSize: '11.5px',
                                                                    fontWeight: 700,
                                                                    color: isAbsent ? '#D97706' : '#DC2626',
                                                                    whiteSpace: 'nowrap'
                                                                }}
                                                            >
                                                                <span style={{ fontFamily: 'monospace' }}>{f.code}</span>
                                                                <span style={{
                                                                    padding: '1px 5px',
                                                                    borderRadius: '3px',
                                                                    fontSize: '9.5px',
                                                                    fontWeight: 900,
                                                                    background: isAbsent ? 'rgba(245, 158, 11, 0.2)' : 'rgba(239, 68, 68, 0.18)',
                                                                    color: isAbsent ? '#B45309' : '#B91C1C'
                                                                }}>
                                                                    {isAbsent ? 'ABSENT' : `FAIL (${f.grade || 'F'})`}
                                                                </span>
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
