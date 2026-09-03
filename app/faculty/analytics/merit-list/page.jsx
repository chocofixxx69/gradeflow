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

export default function MeritListPage() {
    return (
        <AuthGuard role="faculty">
            <MeritListContent />
        </AuthGuard>
    );
}

const MEDAL_COLORS = {
    1: { bg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', text: '#FFFFFF', title: 'Gold Medalist (Rank 1)' },
    2: { bg: 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)', text: '#FFFFFF', title: 'Silver Medalist (Rank 2)' },
    3: { bg: 'linear-gradient(135deg, #B45309 0%, #78350F 100%)', text: '#FFFFFF', title: 'Bronze Medalist (Rank 3)' }
};

function MeritListContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8] });

    // Filters
    const [branch, setBranch] = useState('CS');
    const [batch, setBatch] = useState('');
    const [semester, setSemester] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Data
    const [report, setReport] = useState({
        summary: { totalRanked: 0, highestScore: 0, avgScore: 0, department: 'CS', batch: 'All Batches', semester: 'Overall Cumulative' },
        podium: [],
        rankedStudents: []
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

    // 2. Fetch merit list
    const loadMeritList = useCallback(async () => {
        if (!branch) return;
        setLoading(true);
        try {
            const query = { branch };
            if (batch) query.batch = batch;
            if (semester && semester !== 'all') query.semester = semester;

            const res = await apiRequest('/api/faculty/analytics/merit-list', { query });
            if (res) {
                setReport(res);
            }
        } catch (err) {
            console.error('Failed to load merit list:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, batch, semester]);

    useEffect(() => {
        loadMeritList();
    }, [loadMeritList]);

    const filteredStudents = (report.rankedStudents || []).filter(s => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
    });

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        const headers = ['Rank', 'USN', 'Student Name', 'Branch', 'GPA / CGPA', 'Credits Earned', 'Total Marks', 'Honors / Standing'];
        const rows = (report.rankedStudents || []).map(s => [
            s.rank,
            s.usn,
            s.name,
            s.branch,
            s.gpa.toFixed(2),
            s.creditsEarned,
            s.totalMarks,
            s.honors
        ]);

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'Official Merit List');
        XLSX.writeFile(wb, `Official_Merit_List_${branch}_${batch || 'All'}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        doc.setFontSize(15);
        doc.setFont('helvetica', 'bold');
        doc.text('GRADEFLOW INSTITUTIONAL MERIT & RANK REGISTER', 14, 16);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Department: ${branch} | Batch: ${batch || 'All Batches'} | Scope: ${report.summary.semester} | Total Ranked: ${report.summary.totalRanked} | Date: ${new Date().toLocaleDateString()}`, 14, 22);

        const tableHead = [['Rank', 'USN', 'Student Name', 'Branch', 'GPA', 'Credits', 'Total Marks', 'Honors']];
        const tableBody = (filteredStudents || []).map(s => [
            `#${s.rank}`,
            s.usn,
            s.name,
            s.branch,
            s.gpa.toFixed(2),
            s.creditsEarned,
            s.totalMarks,
            s.honors
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 26,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        doc.save(`Merit_List_${branch}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Honors</PageHeaderEyebrow>
                    <PageHeaderTitle>Official Batch Rank &amp; Merit List</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Deterministic merit ranking with tie-breaking algorithms, medals podium, and honors classification.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={report.rankedStudents.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={report.rankedStudents.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadMeritList} variant="primary">
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
                                options={meta.branches.map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))}
                            />
                        </div>
                        <div>
                            <Select
                                label="Intake Batch"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={[{ value: '', label: 'All Batches' }, ...meta.batches.map(b => ({ value: b, label: `${b} Batch` }))]}
                            />
                        </div>
                        <div>
                            <Select
                                label="Ranking Scope"
                                value={semester}
                                onChange={e => setSemester(e.target.value)}
                                options={[
                                    { value: 'all', label: 'Overall Cumulative (CGPA)' },
                                    ...meta.semesters.map(s => ({ value: s, label: `Semester ${s} (SGPA)` }))
                                ]}
                            />
                        </div>
                        <div>
                            <Input
                                label="Find Student"
                                placeholder="Search by USN or Name..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Top 3 Podium Cards */}
            {report.podium.length > 0 && !searchQuery && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px', marginBottom: '28px' }}>
                    {report.podium.map((p, i) => {
                        const medal = MEDAL_COLORS[p.rank] || MEDAL_COLORS[1];
                        return (
                            <div
                                key={p.usn}
                                style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '16px',
                                    padding: '24px',
                                    position: 'relative',
                                    overflow: 'hidden',
                                    boxShadow: '0 4px 20px -2px rgba(0,0,0,0.05)'
                                }}
                            >
                                <div style={{
                                    position: 'absolute', top: 0, left: 0, right: 0, height: '6px',
                                    background: medal.bg
                                }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                    <span style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '4px 10px', borderRadius: '8px',
                                        background: medal.bg, color: medal.text,
                                        fontWeight: 900, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.04em'
                                    }}>
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>military_tech</span>
                                        {medal.title}
                                    </span>
                                    <span style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-dim)' }}>
                                        #{p.rank}
                                    </span>
                                </div>

                                <h3 style={{ fontSize: '20px', fontWeight: 900, margin: '0 0 4px 0', color: 'var(--tx-main)' }}>
                                    {p.name}
                                </h3>
                                <div style={{ fontFamily: 'monospace', fontSize: '13px', fontWeight: 800, color: 'var(--primary)', marginBottom: '16px' }}>
                                    {p.usn}
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: 'var(--surface-low)', borderRadius: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>GPA</div>
                                        <div style={{ fontSize: '22px', fontWeight: 900, color: '#10B981' }}>{p.gpa.toFixed(2)}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Total Marks</div>
                                        <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)' }}>{p.totalMarks}</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Credits</div>
                                        <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--primary)' }}>{p.creditsEarned}</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Complete Merit Rank Table */}
            <Card style={{ overflow: 'hidden' }}>
                <CardHeader>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>format_list_numbered</span>
                            Official Merit Standings ({filteredStudents.length} Students)
                        </CardTitle>
                    </div>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto', maxHeight: '650px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', textAlign: 'center', width: '60px' }}>Rank</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px' }}>USN</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Student Name</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '90px' }}>GPA</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '100px' }}>Credits</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '110px' }}>Total Marks</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', width: '220px' }}>Honors &amp; Standing</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'center', width: '100px' }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredStudents.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Compiling institutional merit standings...' : 'No students found.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredStudents.map(s => {
                                        const isTop3 = s.rank <= 3;
                                        return (
                                            <tr
                                                key={s.usn}
                                                style={{
                                                    borderBottom: '1px solid var(--border-low)',
                                                    background: isTop3 ? 'rgba(245, 158, 11, 0.03)' : 'transparent'
                                                }}
                                            >
                                                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                    <span style={{
                                                        width: '28px', height: '28px', borderRadius: '50%',
                                                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                        fontWeight: 900, fontSize: '12px',
                                                        background: s.rank === 1 ? '#F59E0B' : s.rank === 2 ? '#9CA3AF' : s.rank === 3 ? '#B45309' : 'var(--surface-low)',
                                                        color: isTop3 ? '#FFFFFF' : 'var(--tx-dim)'
                                                    }}>
                                                        {s.rank}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace' }}>
                                                    <Link href={`/faculty/students/${s.usn}`} style={{ color: 'var(--primary)', textDecoration: 'none' }}>
                                                        {s.usn}
                                                    </Link>
                                                </td>
                                                <td style={{ padding: '12px 16px', fontWeight: 700 }}>
                                                    {s.name}
                                                    {s.isLE && (
                                                        <span style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '9px', fontWeight: 800 }}>
                                                            LE
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 900, color: s.gpa >= 8.0 ? '#10B981' : 'var(--primary)' }}>
                                                    {s.gpa.toFixed(2)}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 700 }}>
                                                    {s.creditsEarned}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 800 }}>
                                                    {s.totalMarks}
                                                </td>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <span style={{
                                                        padding: '3px 9px', borderRadius: '6px',
                                                        fontSize: '11px', fontWeight: 800,
                                                        background: s.hasBacklogs ? 'rgba(239, 68, 68, 0.12)' : isTop3 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.12)',
                                                        color: s.hasBacklogs ? '#EF4444' : isTop3 ? '#D97706' : '#10B981'
                                                    }}>
                                                        {s.honors}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                                                    <Link href={`/faculty/students/${s.usn}`}>
                                                        <Button size="sm" variant="ghost">
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
                </CardContent>
            </Card>
        </div>
    );
}
