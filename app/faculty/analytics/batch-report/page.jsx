'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '../../../../components/AuthGuard';
import { apiRequest } from '../../../../lib/api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest } from '@/lib/api/client';

export default function BatchReportPage() {
    return (
        <AuthGuard role="faculty">
            <BatchReportContent />
        </AuthGuard>
    );
}

function BatchReportContent() {
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8] });

    // Filters initialized instantly from active context
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [upToSemester, setUpToSemester] = useState(() => Number(initialSaved.semester) || 6);
    const [searchQuery, setSearchQuery] = useState('');

    const initialData = getCachedApiData('/api/faculty/analytics/batch-report', {
        branch: initialSaved.branch || 'CS',
        batch: initialSaved.batch || '2023',
        upToSemester: Number(initialSaved.semester) || 6
    });

    // Data - renders immediately without loading spinner if cached
    const [reportData, setReportData] = useState(() => initialData || {
        students: [],
        upToSemester: 6,
        summary: { totalStudents: 0, avgCGPA: 0, withBacklogs: 0, distinctionCount: 0, lateralCount: 0 }
    });
    const [loading, setLoading] = useState(() => !initialData);

    // Save active filters
    useEffect(() => {
        saveFilters({ branch, batch, semester: upToSemester });
    }, [branch, batch, upToSemester]);

    // 1. Fetch metadata
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

    // 2. Fetch batch report
    const loadReport = useCallback(async () => {
        const cached = getCachedApiData('/api/faculty/analytics/batch-report', { branch, upToSemester, ...(batch ? { batch } : {}) });
        if (cached) {
            setReportData(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }

        try {
            const query = { branch, upToSemester };
            if (batch) query.batch = batch;
            const res = await apiRequest('/api/faculty/analytics/batch-report', { query });
            if (res) {
                setReportData(res);
            }
        } catch (err) {
            console.error('Batch report failed:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, batch, upToSemester]);

    useEffect(() => {
        if (branch) {
            loadReport();
        }
    }, [branch, batch, upToSemester, loadReport]);

    const semestersList = Array.from({ length: upToSemester }, (_, i) => i + 1);

    const filteredStudents = (reportData.students || []).filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    });

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Summary Sheet
        const summaryData = [
            ['GradeFlow - Consolidated Batch Progression Report'],
            [`Department / Branch: ${branch}`, `Batch: ${batch || 'All'}`, `Up-to Semester: Sem ${upToSemester}`],
            [`Generated on: ${new Date().toLocaleString()}`],
            [],
            ['Total Students Tracked', reportData.summary.totalStudents],
            ['Batch Average CGPA', reportData.summary.avgCGPA],
            ['Students with Active Backlogs', reportData.summary.withBacklogs],
            ['Distinction Holders (CGPA >= 8.0)', reportData.summary.distinctionCount],
            ['Lateral Entry (Diploma) Students', reportData.summary.lateralCount],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // 2. Progression Sheet
        const headers = ['Sl No', 'USN', 'Student Name', 'Entry Type'];
        semestersList.forEach(sem => {
            headers.push(`Sem ${sem} Ci`, `Sem ${sem} SGPA`);
        });
        headers.push('Total Cr Earned', 'Cumulative CGPA', 'Backlog Cr', 'Status');

        const rows = (reportData.students || []).map((s, idx) => {
            const row = [idx + 1, s.usn, s.name, s.isLE ? 'Lateral Entry (LE)' : 'Regular'];
            semestersList.forEach(sem => {
                const info = s.semesters[sem];
                if (!info) {
                    row.push('—', '—');
                } else if (info.isLE) {
                    row.push('LE', 'LE');
                } else if (!info.hasData) {
                    row.push('—', '—');
                } else {
                    row.push(info.credits ?? 0, info.sgpa ?? 0);
                }
            });
            row.push(
                s.cumulativeCredits,
                s.cgpa !== null ? s.cgpa.toFixed(2) : '—',
                s.backlogCredits,
                s.hasBacklogs ? `${s.totalBacklogs} Arrears` : 'All Clear'
            );
            return row;
        });

        const wsProgression = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, wsProgression, 'Batch Progression');

        XLSX.writeFile(wb, `Batch_Progression_${branch}_${batch || 'All'}_UpToSem${upToSemester}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Consolidated Batch Progression Report (${branch} - ${batch || 'All Batches'})`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Enrolled: ${reportData.summary.totalStudents} | Avg CGPA: ${reportData.summary.avgCGPA} | Backlogs: ${reportData.summary.withBacklogs} | Distinction: ${reportData.summary.distinctionCount} | Up-to Sem: ${upToSemester}`, 14, 21);

        const tableHead = [
            [
                '#', 'USN', 'Name', 'LE',
                ...semestersList.map(sem => `Sem ${sem}`),
                'Cr Earned', 'CGPA', 'Backlog Cr'
            ]
        ];

        const tableBody = (filteredStudents || []).map((s, idx) => {
            const semCells = semestersList.map(sem => {
                const info = s.semesters[sem];
                if (!info) return '—';
                if (info.isLE) return 'LE';
                if (!info.hasData) return '—';
                return `${info.sgpa?.toFixed(2) || '0.00'} (${info.credits})`;
            });

            return [
                idx + 1,
                s.usn,
                s.name,
                s.isLE ? 'LE' : '',
                ...semCells,
                s.cumulativeCredits,
                s.cgpa !== null ? s.cgpa.toFixed(2) : '—',
                s.backlogCredits > 0 ? `${s.backlogCredits} Cr` : 'Clear'
            ];
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

        doc.save(`Batch_Report_${branch}_${batch || 'All'}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Analytics</PageHeaderEyebrow>
                    <PageHeaderTitle>Consolidated Batch Report</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Complete multi-semester academic progression matrix from Semester I to chosen semester with Lateral Entry (LE) handling.
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
                    <Button onClick={loadReport} variant="primary">
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
                                label="Progression Up-to Semester"
                                value={upToSemester}
                                onChange={e => setUpToSemester(Number(e.target.value))}
                                options={meta.semesters.map(s => ({ value: s, label: `Up to Semester ${s}` }))}
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

            {/* KPI Summary Banner */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '14px', marginBottom: '20px' }}>
                {[
                    { label: 'Total Enrolled', value: reportData.summary.totalStudents, color: 'var(--tx-main)' },
                    { label: 'Batch Avg CGPA', value: reportData.summary.avgCGPA > 0 ? reportData.summary.avgCGPA.toFixed(2) : '—', color: 'var(--primary)' },
                    { label: 'Distinction (≥ 8.0)', value: reportData.summary.distinctionCount, color: '#10B981' },
                    { label: 'Carrying Arrears', value: reportData.summary.withBacklogs, color: reportData.summary.withBacklogs > 0 ? '#EF4444' : 'var(--tx-muted)' },
                    { label: 'Lateral Entry (LE)', value: reportData.summary.lateralCount, color: '#6366F1' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            {/* Legend Callout */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', padding: '10px 16px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '16px', fontSize: '12px' }}>
                <span style={{ fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Legend:</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(16, 185, 129, 0.2)', border: '1px solid #10B981' }}></span>
                    <strong style={{ color: '#10B981' }}>SGPA ≥ 8.0</strong> (Distinction)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(239, 68, 68, 0.2)', border: '1px solid #EF4444' }}></span>
                    <strong style={{ color: '#EF4444' }}>Backlog Carrier</strong>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', borderRadius: '3px', background: 'rgba(245, 158, 11, 0.2)', border: '1px solid #F59E0B' }}></span>
                    <strong style={{ color: '#F59E0B' }}>SGPA &lt; 5.0</strong> (Critical)
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontWeight: 800, fontSize: '10px' }}>LE</span>
                    Lateral Entry (Diploma)
                </span>
            </div>

            {/* Progression Table */}
            <Card style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto', maxHeight: '700px', WebkitOverflowScrolling: 'touch' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                        <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--surface-low)', borderBottom: '2px solid var(--border)' }}>
                            <tr>
                                <th rowSpan={2} style={{ padding: '10px', textAlign: 'left', minWidth: '40px', borderRight: '1px solid var(--border)' }}>#</th>
                                <th rowSpan={2} style={{ padding: '10px 14px', textAlign: 'left', minWidth: '110px', borderRight: '1px solid var(--border)' }}>USN</th>
                                <th rowSpan={2} style={{ padding: '10px 14px', textAlign: 'left', minWidth: '160px', borderRight: '2px solid var(--border)' }}>Student Name</th>
                                {semestersList.map(sem => (
                                    <th
                                        key={sem}
                                        colSpan={2}
                                        style={{ padding: '8px 10px', borderRight: '1px solid var(--border)', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}
                                    >
                                        <div style={{ fontWeight: 800, color: 'var(--primary)' }}>Semester {sem}</div>
                                    </th>
                                ))}
                                <th rowSpan={2} style={{ padding: '8px', minWidth: '80px', borderRight: '1px solid var(--border)' }}>Cr Earned</th>
                                <th rowSpan={2} style={{ padding: '8px', minWidth: '80px', borderRight: '1px solid var(--border)' }}>Cumulative CGPA</th>
                                <th rowSpan={2} style={{ padding: '8px', minWidth: '85px' }}>Backlog Cr</th>
                            </tr>
                            <tr style={{ fontSize: '10px', color: 'var(--tx-dim)', textTransform: 'uppercase' }}>
                                {semestersList.map(sem => (
                                    <span key={`sub-cols-${sem}`} style={{ display: 'contents' }}>
                                        <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border-low)' }}>Ci</th>
                                        <th style={{ padding: '6px 4px', borderRight: '1px solid var(--border)' }}>SGPA</th>
                                    </span>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {filteredStudents.length === 0 ? (
                                <tr>
                                    <td colSpan={semestersList.length * 2 + 7} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                        {loading ? 'Compiling batch progression matrix...' : 'No students found matching current filters.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredStudents.map((s, idx) => {
                                    const rowTint = s.hasBacklogs ? 'rgba(239, 68, 68, 0.02)' : s.isDistinction ? 'rgba(16, 185, 129, 0.02)' : 'transparent';
                                    return (
                                        <tr
                                            key={s.usn}
                                            style={{
                                                borderBottom: '1px solid var(--border-low)',
                                                background: rowTint,
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--tx-dim)', borderRight: '1px solid var(--border-low)' }}>{idx + 1}</td>
                                            <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 800, fontFamily: 'monospace', color: 'var(--tx-main)', borderRight: '1px solid var(--border-low)' }}>
                                                {s.usn}
                                                {s.isLE && (
                                                    <span style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '9px', fontWeight: 800 }}>
                                                        LE
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--tx-main)', borderRight: '2px solid var(--border)' }}>{s.name}</td>

                                            {semestersList.map(sem => {
                                                const info = s.semesters[sem];
                                                if (!info || !info.hasData) {
                                                    if (info?.isLE) {
                                                        return (
                                                            <span key={sem} style={{ display: 'contents' }}>
                                                                <td style={{ padding: '6px', color: 'var(--tx-dim)', fontStyle: 'italic', borderRight: '1px solid var(--border-low)' }}>LE</td>
                                                                <td style={{ padding: '6px', color: 'var(--tx-dim)', fontStyle: 'italic', borderRight: '1px solid var(--border)' }}>LE</td>
                                                            </span>
                                                        );
                                                    }
                                                    return (
                                                        <span key={sem} style={{ display: 'contents' }}>
                                                            <td style={{ padding: '6px', color: 'var(--tx-muted)', borderRight: '1px solid var(--border-low)' }}>—</td>
                                                            <td style={{ padding: '6px', color: 'var(--tx-muted)', borderRight: '1px solid var(--border)' }}>—</td>
                                                        </span>
                                                    );
                                                }

                                                const isSemFail = info.backlogs > 0;
                                                const isDist = info.sgpa >= 8.0;
                                                const isLow = info.sgpa < 5.0;

                                                const sgpaStyle = isSemFail ? { background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', fontWeight: 800 }
                                                    : isDist ? { background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', fontWeight: 800 }
                                                    : isLow ? { background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', fontWeight: 800 }
                                                    : { fontWeight: 700 };

                                                return (
                                                    <span key={sem} style={{ display: 'contents' }}>
                                                        <td style={{ padding: '6px', borderRight: '1px solid var(--border-low)' }}>{info.credits}</td>
                                                        <td style={{ padding: '6px', borderRight: '1px solid var(--border)', ...sgpaStyle }}>
                                                            {info.sgpa !== null ? info.sgpa.toFixed(2) : '—'}
                                                        </td>
                                                    </span>
                                                );
                                            })}

                                            <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)', fontWeight: 700 }}>
                                                {s.cumulativeCredits}
                                            </td>
                                            <td style={{ padding: '8px', borderRight: '1px solid var(--border-low)', fontWeight: 900, color: s.isDistinction ? '#10B981' : s.isLow ? '#EF4444' : 'var(--primary)' }}>
                                                {s.cgpa !== null ? s.cgpa.toFixed(2) : '—'}
                                            </td>
                                            <td style={{ padding: '8px', fontWeight: 800, color: s.backlogCredits > 0 ? '#EF4444' : '#10B981' }}>
                                                {s.backlogCredits > 0 ? `${s.backlogCredits} Cr` : 'Clear'}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
