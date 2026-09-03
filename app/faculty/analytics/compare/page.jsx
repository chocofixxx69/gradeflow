'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Input } from '@/components/ui/Foundation';

export default function StudentComparatorPage() {
    return (
        <AuthGuard role="faculty">
            <StudentComparatorContent />
        </AuthGuard>
    );
}

const LINE_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#EC4899'];

function StudentComparatorContent() {
    const [usnInput, setUsnInput] = useState('');
    const [usnList, setUsnList] = useState([]);
    const [loading, setLoading] = useState(false);

    const [comparison, setComparison] = useState({
        students: [],
        trajectory: [],
        subjectComparison: []
    });

    // Handle adding USN
    const handleAddUsn = (usnToAdd) => {
        const clean = (usnToAdd || usnInput).trim().toUpperCase();
        if (!clean) return;
        if (usnList.includes(clean)) {
            alert('USN already added to comparator.');
            return;
        }
        if (usnList.length >= 6) {
            alert('Maximum 6 students can be compared simultaneously.');
            return;
        }
        setUsnList(prev => [...prev, clean]);
        setUsnInput('');
    };

    const handleRemoveUsn = (usnToRemove) => {
        setUsnList(prev => prev.filter(u => u !== usnToRemove));
    };

    const handleClearAll = () => {
        setUsnList([]);
        setComparison({ students: [], trajectory: [], subjectComparison: [] });
    };

    // Fetch comparison data when usnList changes
    const loadComparison = useCallback(async () => {
        if (usnList.length === 0) {
            setComparison({ students: [], trajectory: [], subjectComparison: [] });
            return;
        }
        setLoading(true);
        try {
            const res = await apiRequest('/api/faculty/analytics/compare', {
                query: { usns: usnList.join(',') }
            });
            if (res) {
                setComparison(res);
            }
        } catch (err) {
            console.error('Comparison fetch error:', err);
        } finally {
            setLoading(false);
        }
    }, [usnList]);

    useEffect(() => {
        loadComparison();
    }, [loadComparison]);

    // ── Excel Export ──
    const handleExportExcel = () => {
        if (comparison.students.length === 0) return;
        const wb = XLSX.utils.book_new();

        // Summary sheet
        const summaryHeaders = ['Metric', ...comparison.students.map(s => `${s.name} (${s.usn})`)];
        const summaryRows = [
            ['Department', ...comparison.students.map(s => s.branch)],
            ['Cumulative CGPA', ...comparison.students.map(s => s.cgpa !== null ? s.cgpa.toFixed(2) : '—')],
            ['Credits Earned', ...comparison.students.map(s => s.totalCredits)],
            ['Subjects Appeared', ...comparison.students.map(s => s.appeared)],
            ['Subjects Passed', ...comparison.students.map(s => s.passed)],
            ['Active Backlogs', ...comparison.students.map(s => s.failed)],
            ['Overall Pass Rate (%)', ...comparison.students.map(s => `${s.passRate}%`)],
            ['Backlog Credits', ...comparison.students.map(s => s.backlogCredits)],
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet([summaryHeaders, ...summaryRows]);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary Comparison');

        // Subject comparison sheet
        const subHeaders = ['Code', 'Subject Name', 'Cr', ...comparison.students.map(s => `${s.usn} Marks`), ...comparison.students.map(s => `${s.usn} Grade`)];
        const subRows = comparison.subjectComparison.map(sub => {
            const marksVals = comparison.students.map(s => sub.students[s.usn]?.total ?? '—');
            const gradeVals = comparison.students.map(s => sub.students[s.usn]?.grade ?? '—');
            return [sub.code, sub.name, sub.credits, ...marksVals, ...gradeVals];
        });
        const wsSubjects = XLSX.utils.aoa_to_sheet([subHeaders, ...subRows]);
        XLSX.utils.book_append_sheet(wb, wsSubjects, 'Subjects Comparison');

        XLSX.writeFile(wb, `Student_Comparison_${comparison.students.map(s => s.usn).join('_')}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        if (comparison.students.length === 0) return;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('GradeFlow - Side-by-Side Student Comparison', 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Comparing ${comparison.students.length} Students | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const summaryHead = [['USN', 'Name', 'Branch', 'CGPA', 'Credits Earned', 'Subjects Passed', 'Backlogs', 'Pass %']];
        const summaryBody = comparison.students.map(s => [
            s.usn, s.name, s.branch, s.cgpa !== null ? s.cgpa.toFixed(2) : '—', s.totalCredits, s.passed, s.failed, `${s.passRate}%`
        ]);

        autoTable(doc, {
            head: summaryHead,
            body: summaryBody,
            startY: 25,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        const lastY = doc.lastAutoTable?.finalY || 80;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Subject Marks Breakdown', 14, lastY + 10);

        const subHead = [['Code', 'Subject Name', ...comparison.students.map(s => s.usn)]];
        const subBody = comparison.subjectComparison.map(sub => [
            sub.code,
            sub.name,
            ...comparison.students.map(s => {
                const d = sub.students[s.usn];
                return d ? `${d.total} [${d.grade}]` : '—';
            })
        ]);

        autoTable(doc, {
            head: subHead,
            body: subBody,
            startY: lastY + 13,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
        });

        doc.save('Student_Comparison.pdf');
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Analytics</PageHeaderEyebrow>
                    <PageHeaderTitle>Multi-Student Comparator</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Compare 2 to 6 students side-by-side with metric comparisons, SGPA trajectory curves, and direct subject marks breakdown.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={comparison.students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={comparison.students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    {usnList.length > 0 && (
                        <Button onClick={handleClearAll} variant="ghost" style={{ color: '#EF4444' }}>
                            Clear All
                        </Button>
                    )}
                </div>
            </div>

            {/* USN Input & Tags Bar */}
            <Card style={{ marginBottom: '24px' }}>
                <CardContent style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                        <div style={{ flex: 1, minWidth: '240px' }}>
                            <Input
                                placeholder="Enter student USN (e.g. 1VA22CS001) and press Enter or Add..."
                                value={usnInput}
                                onChange={e => setUsnInput(e.target.value.toUpperCase())}
                                onKeyDown={e => e.key === 'Enter' && handleAddUsn()}
                            />
                        </div>
                        <Button onClick={() => handleAddUsn()} variant="primary" iconStart="add">
                            Add Student
                        </Button>
                    </div>

                    {/* Active USN Chips */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>
                            Comparing ({usnList.length}/6):
                        </span>
                        {usnList.length === 0 ? (
                            <span style={{ fontSize: '13px', color: 'var(--tx-muted)', fontStyle: 'italic' }}>
                                No students added yet. Type a USN above to begin comparison.
                            </span>
                        ) : (
                            usnList.map((u, i) => (
                                <span
                                    key={u}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '4px 10px',
                                        borderRadius: '8px',
                                        background: 'var(--surface-low)',
                                        border: `1px solid ${LINE_COLORS[i % LINE_COLORS.length]}`,
                                        fontSize: '12px',
                                        fontWeight: 800,
                                        fontFamily: 'monospace',
                                        color: LINE_COLORS[i % LINE_COLORS.length]
                                    }}
                                >
                                    {u}
                                    <button
                                        onClick={() => handleRemoveUsn(u)}
                                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', color: 'inherit' }}
                                        title="Remove"
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                                    </button>
                                </span>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>

            {comparison.students.length > 0 && (
                <>
                    {/* Side-by-Side Performance Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, 280px), 1fr))`, gap: '16px', marginBottom: '28px' }}>
                        {comparison.students.map((s, idx) => {
                            const color = LINE_COLORS[idx % LINE_COLORS.length];
                            return (
                                <Card key={s.usn} style={{ borderTop: `4px solid ${color}` }}>
                                    <CardContent style={{ padding: '20px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                            <div>
                                                <h3 style={{ fontSize: '17px', fontWeight: 800, margin: '0 0 2px 0', color: 'var(--tx-main)' }}>{s.name}</h3>
                                                <div style={{ fontFamily: 'monospace', fontSize: '12px', fontWeight: 800, color }}>{s.usn}</div>
                                            </div>
                                            <Link href={`/faculty/students/${s.usn}`}>
                                                <Button size="sm" variant="ghost" title="Open Full Record">
                                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>open_in_new</span>
                                                </Button>
                                            </Link>
                                        </div>

                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px' }}>
                                            <div style={{ background: 'var(--surface-low)', padding: '8px 12px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>CGPA</div>
                                                <div style={{ fontSize: '20px', fontWeight: 900, color: s.cgpa >= 8.0 ? '#10B981' : s.cgpa >= 5.0 ? 'var(--primary)' : '#EF4444' }}>
                                                    {s.cgpa !== null ? s.cgpa.toFixed(2) : '—'}
                                                </div>
                                            </div>
                                            <div style={{ background: 'var(--surface-low)', padding: '8px 12px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Credits</div>
                                                <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                                    {s.totalCredits}
                                                </div>
                                            </div>
                                            <div style={{ background: 'var(--surface-low)', padding: '8px 12px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Backlogs</div>
                                                <div style={{ fontSize: '20px', fontWeight: 900, color: s.failed > 0 ? '#EF4444' : '#10B981' }}>
                                                    {s.failed > 0 ? s.failed : 'Clear'}
                                                </div>
                                            </div>
                                            <div style={{ background: 'var(--surface-low)', padding: '8px 12px', borderRadius: '8px' }}>
                                                <div style={{ fontSize: '10.5px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase' }}>Pass Rate</div>
                                                <div style={{ fontSize: '20px', fontWeight: 900, color: s.passRate >= 75 ? '#10B981' : s.passRate >= 50 ? '#F59E0B' : '#EF4444' }}>
                                                    {s.passRate}%
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>

                    {/* Recharts Trajectory Overlay */}
                    {comparison.trajectory.length > 0 && (
                        <Card style={{ marginBottom: '28px' }}>
                            <CardHeader>
                                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>show_chart</span>
                                    SGPA Progression Trajectory Overlay
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div style={{ width: '100%', height: '300px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={comparison.trajectory} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                            <XAxis dataKey="semester" tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                            <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                            <Tooltip />
                                            <Legend />
                                            {comparison.students.map((s, idx) => (
                                                <Line
                                                    key={s.usn}
                                                    type="monotone"
                                                    dataKey={s.usn}
                                                    name={`${s.name} (${s.usn})`}
                                                    stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                                                    strokeWidth={3}
                                                    dot={{ r: 4 }}
                                                    activeDot={{ r: 6 }}
                                                />
                                            ))}
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Subject-by-Subject Direct Comparison Grid */}
                    <Card>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>table_rows</span>
                                Direct Subject Scores Comparison ({comparison.subjectComparison.length} Subjects)
                            </CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'center' }}>
                                    <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                        <tr>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '110px' }}>Code</th>
                                            <th style={{ padding: '10px 14px', textAlign: 'left', minWidth: '180px' }}>Subject Name</th>
                                            <th style={{ padding: '10px 8px', width: '55px' }}>Cr</th>
                                            {comparison.students.map((s, idx) => (
                                                <th
                                                    key={s.usn}
                                                    style={{
                                                        padding: '10px 12px',
                                                        borderLeft: '1px solid var(--border)',
                                                        color: LINE_COLORS[idx % LINE_COLORS.length],
                                                        fontWeight: 800
                                                    }}
                                                >
                                                    {s.name}
                                                    <div style={{ fontSize: '10px', opacity: 0.8, fontFamily: 'monospace' }}>{s.usn}</div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {comparison.subjectComparison.map(sub => (
                                            <tr key={sub.code} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                <td style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                                    {sub.code}
                                                </td>
                                                <td style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600 }}>
                                                    {sub.name}
                                                </td>
                                                <td style={{ padding: '10px 8px', color: 'var(--tx-dim)' }}>
                                                    {sub.credits}
                                                </td>
                                                {comparison.students.map(s => {
                                                    const d = sub.students[s.usn];
                                                    if (!d) {
                                                        return <td key={s.usn} style={{ padding: '10px 12px', color: 'var(--tx-muted)', borderLeft: '1px solid var(--border-low)' }}>—</td>;
                                                    }
                                                    const isF = d.isFail;
                                                    return (
                                                        <td
                                                            key={s.usn}
                                                            style={{
                                                                padding: '10px 12px',
                                                                borderLeft: '1px solid var(--border-low)',
                                                                background: isF ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
                                                                color: isF ? '#EF4444' : 'var(--tx-main)',
                                                                fontWeight: 700
                                                            }}
                                                        >
                                                            {d.total} <span style={{ opacity: 0.8 }}>[{d.grade}]</span>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
