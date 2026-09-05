'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

export default function FacultyStudentsDirectoryPage() {
    return (
        <AuthGuard role="faculty">
            <StudentsDirectoryContent />
        </AuthGuard>
    );
}

function StudentsDirectoryContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8] });

    // Filters
    const [branch, setBranch] = useState('');
    const [semester, setSemester] = useState('all');
    const [batch, setBatch] = useState('');
    const [status, setStatus] = useState('all');
    const [backlogsFilter, setBacklogsFilter] = useState('all');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const limit = 25;

    // Data
    const [students, setStudents] = useState([]);
    const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });

    // 1. Fetch metadata on mount
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

    // 2. Fetch paginated students
    const loadStudents = useCallback(async () => {
        setLoading(true);
        try {
            const query = { page, limit };
            if (branch) query.branch = branch;
            if (semester && semester !== 'all') query.semester = semester;
            if (batch) query.batch = batch;
            if (status !== 'all') query.status = status;
            if (backlogsFilter !== 'all') query.backlogsFilter = backlogsFilter;
            if (search) query.search = search;

            const res = await apiRequest('/api/faculty/students', { query });
            if (res) {
                setStudents(res.students || []);
                setPagination(res.pagination || { total: 0, page: 1, limit: 25, totalPages: 1 });
            }
        } catch (err) {
            console.error('Failed to load students:', err);
        } finally {
            setLoading(false);
        }
    }, [page, limit, branch, semester, batch, status, backlogsFilter, search]);

    useEffect(() => {
        loadStudents();
    }, [loadStudents]);

    // Reset page on filter change
    const handleFilterChange = (setter, val) => {
        setter(val);
        setPage(1);
    };

    // ── Excel Export ──
    const handleExportExcel = async () => {
        const XLSX = await getXLSX();
        const wb = XLSX.utils.book_new();
        const headers = ['#', 'USN', 'Name', 'Department', 'Semester', 'Batch', 'CGPA', 'Backlogs Count', 'Backlog Credits', 'Status'];
        const rows = (students || []).map((s, idx) => [
            (page - 1) * limit + idx + 1,
            s.usn,
            s.name,
            s.branch,
            s.semester,
            s.year || '—',
            s.cgpa !== null ? s.cgpa.toFixed(2) : '—',
            s.total_backlogs,
            s.backlog_credits,
            s.total_backlogs > 0 ? `${s.total_backlogs} Subjects (${s.backlog_credits} Cr)` : 'Clear'
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        XLSX.writeFile(wb, `Students_Directory_${branch || 'All'}_Page${page}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = async () => {
        const { jsPDF, autoTable } = await getJsPDF();
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Students Directory`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Total: ${pagination.total} Students | Department: ${branch || 'All'} | Semester: ${semester} | Batch: ${batch || 'All'} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['#', 'USN', 'Student Name', 'Branch', 'Sem', 'CGPA', 'Backlog Status']];
        const tableBody = (students || []).map((s, idx) => [
            (page - 1) * limit + idx + 1,
            s.usn,
            s.name,
            s.branch,
            s.semester,
            s.cgpa !== null ? s.cgpa.toFixed(2) : '—',
            s.total_backlogs > 0 ? `${s.total_backlogs} Sub (${s.backlog_credits} Cr)` : 'Clear'
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 25,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        doc.save(`Students_Directory_${branch || 'All'}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institution</PageHeaderEyebrow>
                    <PageHeaderTitle>Students Directory</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Browse, filter, and inspect student records with live CGPA and backlog statuses across all departments.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadStudents} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Filter Toolbar */}
            <Card style={{ marginBottom: '20px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                        <div>
                            <Select
                                label="Department"
                                value={branch}
                                onChange={e => handleFilterChange(setBranch, e.target.value)}
                                options={[{ value: '', label: 'All Departments' }, ...meta.branches.filter(b => b.code !== 'ALL').map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Semester"
                                value={semester}
                                onChange={e => handleFilterChange(setSemester, e.target.value)}
                                options={[{ value: 'all', label: 'All Semesters' }, ...meta.semesters.map(s => ({ value: s, label: `Semester ${s}` }))]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Batch"
                                value={batch}
                                onChange={e => handleFilterChange(setBatch, e.target.value)}
                                options={[{ value: '', label: 'All Batches' }, ...meta.batches.map(b => ({ value: b, label: `${b.slice(-2)} Batch (${b})` }))]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Backlogs Status"
                                value={backlogsFilter}
                                onChange={e => handleFilterChange(setBacklogsFilter, e.target.value)}
                                options={[
                                    { value: 'all', label: 'All Students' },
                                    { value: 'clear', label: 'All Clear (0 Arrears)' },
                                    { value: 'backlogs', label: 'Carrying Backlogs' },
                                ]}
                            />
                        </div>
                        <div>
                            <Input
                                label="Search"
                                placeholder="USN, Name or Email..."
                                value={search}
                                onChange={e => handleFilterChange(setSearch, e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Student Count / Status Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                    Found <strong>{pagination.total}</strong> students matching filters
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button
                        size="sm"
                        variant={status === 'all' ? 'primary' : 'ghost'}
                        onClick={() => handleFilterChange(setStatus, 'all')}
                    >
                        All
                    </Button>
                    <Button
                        size="sm"
                        variant={status === 'active' ? 'primary' : 'ghost'}
                        onClick={() => handleFilterChange(setStatus, 'active')}
                    >
                        Active
                    </Button>
                    <Button
                        size="sm"
                        variant={status === 'inactive' ? 'primary' : 'ghost'}
                        onClick={() => handleFilterChange(setStatus, 'inactive')}
                    >
                        Inactive
                    </Button>
                </div>
            </div>

            {/* Students Table */}
            <Card style={{ overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                            <tr>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: '50px' }}>#</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px' }}>USN</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Student Name</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px' }}>Department</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', width: '90px' }}>Semester</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', width: '90px' }}>CGPA</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: '180px' }}>Backlogs</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', width: '110px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {students.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                        {loading ? 'Loading student directory...' : 'No students found matching current filters.'}
                                    </td>
                                </tr>
                            ) : (
                                students.map((s, idx) => {
                                    const hasBacklogs = s.total_backlogs > 0;
                                    return (
                                        <tr
                                            key={s.usn}
                                            style={{
                                                borderBottom: '1px solid var(--border-low)',
                                                background: s.is_inactive ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '12px 16px', color: 'var(--tx-dim)' }}>
                                                {(page - 1) * limit + idx + 1}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace' }}>
                                                <Link
                                                    href={`/faculty/students/${s.usn}`}
                                                    style={{ color: 'var(--primary)', textDecoration: 'none' }}
                                                    className="gf-hover-underline"
                                                >
                                                    {s.usn}
                                                </Link>
                                                {s.lateral_entry && (
                                                    <span style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '9px', fontWeight: 800 }}>
                                                        LE
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                                                <Link
                                                    href={`/faculty/students/${s.usn}`}
                                                    style={{ color: 'inherit', textDecoration: 'none' }}
                                                >
                                                    {s.name}
                                                </Link>
                                                {s.is_inactive && (
                                                    <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-low)', border: '1px solid var(--border)', fontSize: '10px', color: 'var(--tx-muted)' }}>
                                                        Inactive
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                {s.branch}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 700 }}>
                                                Sem {s.semester}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 900, color: s.cgpa >= 8.0 ? '#10B981' : s.cgpa >= 5.0 ? 'var(--primary)' : s.cgpa > 0 ? '#EF4444' : 'var(--tx-dim)' }}>
                                                {s.cgpa !== null && s.cgpa > 0 ? s.cgpa.toFixed(2) : '—'}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                {hasBacklogs ? (
                                                    <span style={{
                                                        padding: '3px 9px', borderRadius: '6px',
                                                        background: 'rgba(239, 68, 68, 0.12)',
                                                        color: '#EF4444', fontWeight: 800, fontSize: '11px'
                                                    }}>
                                                        {s.total_backlogs} Subjects ({s.backlog_credits} Cr)
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        padding: '3px 9px', borderRadius: '6px',
                                                        background: 'rgba(16, 185, 129, 0.12)',
                                                        color: '#10B981', fontWeight: 800, fontSize: '11px'
                                                    }}>
                                                        Clear
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <Link href={`/faculty/students/${s.usn}`}>
                                                    <Button size="sm" variant="ghost" iconStart="visibility">
                                                        View
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Pagination Controls */}
            {pagination.totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>
                        Showing <strong>{(page - 1) * limit + 1}</strong> to <strong>{Math.min(page * limit, pagination.total)}</strong> of <strong>{pagination.total}</strong> students
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage(prev => Math.max(1, prev - 1))}
                            iconStart="chevron_left"
                        >
                            Previous
                        </Button>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', fontSize: '13px', fontWeight: 700 }}>
                            Page {page} of {pagination.totalPages}
                        </span>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={page >= pagination.totalPages || loading}
                            onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                            iconEnd="chevron_right"
                        >
                            Next
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
