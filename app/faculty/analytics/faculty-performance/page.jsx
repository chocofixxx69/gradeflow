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

export default function FacultyPerformancePage() {
    return (
        <AuthGuard role="faculty">
            <FacultyPerformanceContent />
        </AuthGuard>
    );
}

function FacultyPerformanceContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], semesters: [1,2,3,4,5,6,7,8] });

    // Filters
    const [branch, setBranch] = useState('');
    const [semester, setSemester] = useState('all');

    // Data
    const [facultyList, setFacultyList] = useState([]);
    const [expandedFacultyId, setExpandedFacultyId] = useState(null);

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

    // 2. Fetch faculty performance
    const loadPerformance = useCallback(async () => {
        setLoading(true);
        try {
            const query = {};
            if (branch) query.branch = branch;
            if (semester && semester !== 'all') query.semester = semester;

            const res = await apiRequest('/api/faculty/analytics/faculty-performance', { query });
            if (res) {
                setFacultyList(res.faculty || []);
            }
        } catch (err) {
            console.error('Failed to load faculty performance:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, semester]);

    useEffect(() => {
        loadPerformance();
    }, [loadPerformance]);

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        const headers = ['#', 'Faculty Name', 'Department', 'Assigned Subjects', 'Students Appeared', 'Passed', 'Failed', 'Pass %', 'Average Score'];
        const rows = facultyList.map((f, idx) => [
            idx + 1,
            f.faculty_name,
            f.department,
            f.subjects.map(s => s.subject_code).join(', ') || 'None',
            f.total_appeared,
            f.total_passed,
            f.total_failed,
            `${f.pass_rate}%`,
            f.avg_score
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'Teaching Performance');
        XLSX.writeFile(wb, `Faculty_Teaching_Performance_${branch || 'All'}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('GradeFlow - Faculty Teaching Performance & Attribution Report', 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Department: ${branch || 'All'} | Semester: ${semester} | Total Faculty: ${facultyList.length} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['#', 'Faculty Name', 'Department', 'Assigned Subjects', 'Appeared', 'Passed', 'Failed', 'Pass Rate', 'Avg Marks']];
        const tableBody = facultyList.map((f, idx) => [
            idx + 1,
            f.faculty_name,
            f.department,
            f.subjects.map(s => s.subject_code).join(', ') || '—',
            f.total_appeared,
            f.total_passed,
            f.total_failed,
            `${f.pass_rate}%`,
            f.avg_score
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        doc.save(`Faculty_Performance_${branch || 'All'}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Accreditation &amp; HOD Suite</PageHeaderEyebrow>
                    <PageHeaderTitle>Faculty Teaching Performance</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Attribution of student examination outcomes, pass percentages, and grade spread by teaching faculty.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={facultyList.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={facultyList.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadPerformance} variant="primary">
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
                                options={[{ value: '', label: 'All Departments' }, ...meta.branches.map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Semester Filter"
                                value={semester}
                                onChange={e => setSemester(e.target.value)}
                                options={[{ value: 'all', label: 'All Semesters' }, ...meta.semesters.map(s => ({ value: s, label: `Semester ${s}` }))]}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Performance Table */}
            <Card style={{ overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                            <tr>
                                <th style={{ padding: '12px 14px', textAlign: 'left', width: '50px' }}>#</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Faculty Name</th>
                                <th style={{ padding: '12px 14px', textAlign: 'left', width: '130px' }}>Department</th>
                                <th style={{ padding: '12px 14px', textAlign: 'left', width: '220px' }}>Assigned Subjects</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '85px' }}>Appeared</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '80px' }}>Passed</th>
                                <th style={{ padding: '12px 10px', textAlign: 'center', width: '80px' }}>Failed</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '100px' }}>Pass Rate</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Avg Marks</th>
                                <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {facultyList.length === 0 ? (
                                <tr>
                                    <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                        {loading ? 'Aggregating faculty teaching data...' : 'No faculty found for selected criteria.'}
                                    </td>
                                </tr>
                            ) : (
                                facultyList.map((f, idx) => {
                                    const isExpanded = expandedFacultyId === f.faculty_id;
                                    const passColor = f.pass_rate >= 85 ? '#10B981' : f.pass_rate >= 70 ? 'var(--primary)' : f.pass_rate > 0 ? '#EF4444' : 'var(--tx-dim)';
                                    return (
                                        <span key={f.faculty_id || idx} style={{ display: 'contents' }}>
                                            <tr style={{ borderBottom: '1px solid var(--border-low)', background: isExpanded ? 'var(--surface-low)' : 'transparent' }}>
                                                <td style={{ padding: '12px 14px', color: 'var(--tx-dim)' }}>{idx + 1}</td>
                                                <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                    {f.faculty_name}
                                                    {f.email && <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 400 }}>{f.email}</div>}
                                                </td>
                                                <td style={{ padding: '12px 14px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                    {f.department}
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {f.subjects.length === 0 ? (
                                                        <span style={{ color: 'var(--tx-dim)', fontStyle: 'italic', fontSize: '12px' }}>No subjects assigned</span>
                                                    ) : (
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                            {f.subjects.map(s => (
                                                                <span
                                                                    key={s.subject_code}
                                                                    style={{ padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-low)', border: '1px solid var(--border)', fontSize: '11px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}
                                                                    title={`${s.subject_name} (${s.appeared} students)`}
                                                                >
                                                                    {s.subject_code}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700 }}>
                                                    {f.total_appeared}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: '#10B981' }}>
                                                    {f.total_passed}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 800, color: f.total_failed > 0 ? '#EF4444' : 'var(--tx-muted)' }}>
                                                    {f.total_failed}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: '6px',
                                                        fontSize: '11.5px', fontWeight: 900,
                                                        background: f.pass_rate >= 85 ? 'rgba(16, 185, 129, 0.12)' : f.pass_rate >= 70 ? 'rgba(99, 102, 241, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                        color: passColor
                                                    }}>
                                                        {f.total_appeared > 0 ? `${f.pass_rate}%` : '—'}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 800 }}>
                                                    {f.avg_score > 0 ? f.avg_score : '—'}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                    {f.subjects.length > 0 && (
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => setExpandedFacultyId(isExpanded ? null : f.faculty_id)}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                                                {isExpanded ? 'expand_less' : 'expand_more'}
                                                            </span>
                                                        </Button>
                                                    )}
                                                </td>
                                            </tr>

                                            {/* Expanded Subject Breakdown */}
                                            {isExpanded && (
                                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                                    <td colSpan={10} style={{ padding: '16px 20px' }}>
                                                        <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--tx-dim)', marginBottom: '8px' }}>
                                                            Subject-wise Performance Breakdown for {f.faculty_name}
                                                        </div>
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                            <thead>
                                                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                                                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Subject Code</th>
                                                                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Subject Name</th>
                                                                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>Sem</th>
                                                                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>Appeared</th>
                                                                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>Passed</th>
                                                                    <th style={{ padding: '8px 8px', textAlign: 'center' }}>Failed</th>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Pass %</th>
                                                                    <th style={{ padding: '8px 10px', textAlign: 'center' }}>Avg Score</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {f.subjects.map(s => (
                                                                    <tr key={s.subject_code} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                                        <td style={{ padding: '8px 12px', fontWeight: 800, fontFamily: 'monospace', color: 'var(--primary)' }}>{s.subject_code}</td>
                                                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{s.subject_name}</td>
                                                                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>Sem {s.semester}</td>
                                                                        <td style={{ padding: '8px 8px', textAlign: 'center' }}>{s.appeared}</td>
                                                                        <td style={{ padding: '8px 8px', textAlign: 'center', color: '#10B981', fontWeight: 700 }}>{s.passed}</td>
                                                                        <td style={{ padding: '8px 8px', textAlign: 'center', color: s.failed > 0 ? '#EF4444' : 'inherit' }}>{s.failed}</td>
                                                                        <td style={{ padding: '8px 10px', textAlign: 'center', fontWeight: 800 }}>{s.pass_rate}%</td>
                                                                        <td style={{ padding: '8px 10px', textAlign: 'center' }}>{s.avg_score}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </td>
                                                </tr>
                                            )}
                                        </span>
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
