'use client';

import { useState, useEffect, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { ResponsiveContainer, BarChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest } from '@/lib/api/client';

export default function DepartmentOverviewPage() {
    return (
        <AuthGuard role="faculty">
            <DepartmentOverviewContent />
        </AuthGuard>
    );
}

function DepartmentOverviewContent() {
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [] });

    // Filters initialized instantly
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');

    const initialData = getCachedApiData('/api/faculty/analytics/department', {
        branch: initialSaved.branch || 'CS',
        batch: initialSaved.batch || '2023'
    });

    // Data
    const [report, setReport] = useState(() => initialData || {
        department: 'CS',
        batch: 'All Batches',
        summary: { totalStudents: 0, overallPassRate: 0, avgCGPA: 0, totalBacklogs: 0 },
        semesters: []
    });
    const [loading, setLoading] = useState(() => !initialData);

    // Save active filters
    useEffect(() => {
        saveFilters({ branch, batch });
    }, [branch, batch]);

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

    // 2. Fetch department analytics
    const loadDeptData = useCallback(async () => {
        if (!branch) return;
        const query = { branch };
        if (batch) query.batch = batch;

        const cached = getCachedApiData('/api/faculty/analytics/department', query);
        if (cached) {
            setReport(cached);
            setLoading(false);
        } else {
            setLoading(true);
        }

        try {
            const res = await apiRequest('/api/faculty/analytics/department', { query });
            if (res) {
                setReport(res);
            }
        } catch (err) {
            console.error('Failed to load department overview:', err);
        } finally {
            setLoading(false);
        }
    }, [branch, batch]);

    useEffect(() => {
        loadDeptData();
    }, [loadDeptData]);

    // Format chart data
    const chartData = (report.semesters || []).map(s => ({
        semester: `Sem ${s.semester}`,
        passRate: s.passRate,
        avgSgpa: s.avgSgpa * 10 // scale to 100 for dual-axis display
    }));

    // ── Excel Export ──
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Summary Sheet
        const summaryData = [
            ['GradeFlow - Department Performance & Attrition Overview'],
            [`Department / Branch: ${branch}`, `Batch: ${batch || 'All Batches'}`],
            [`Generated on: ${new Date().toLocaleString()}`],
            [],
            ['Total Students Tracked', report.summary.totalStudents],
            ['Overall Pass Rate', `${report.summary.overallPassRate}%`],
            ['Department Average CGPA', report.summary.avgCGPA],
            ['Active Backlogs in Cohort', report.summary.totalBacklogs]
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Department Summary');

        // 2. Semester Breakdown
        const semHeaders = ['Semester', 'Enrolled', 'Appeared', 'Passed', 'Failed', 'Pass Rate (%)', 'Avg SGPA', 'Highest SGPA', 'Lowest SGPA', 'Attrition Drop'];
        const semRows = (report.semesters || []).map(s => [
            `Semester ${s.semester}`,
            s.enrolled,
            s.appeared,
            s.passed,
            s.failed,
            `${s.passRate}%`,
            s.avgSgpa,
            s.highestSgpa,
            s.lowestSgpa,
            s.attritionDelta
        ]);
        const wsSem = XLSX.utils.aoa_to_sheet([semHeaders, ...semRows]);
        XLSX.utils.book_append_sheet(wb, wsSem, 'Semester Progression');

        XLSX.writeFile(wb, `Dept_Overview_${branch}_${batch || 'All'}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = () => {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Department Semester-over-Semester Overview (${branch})`, 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Enrolled: ${report.summary.totalStudents} | Overall Pass Rate: ${report.summary.overallPassRate}% | Dept Avg CGPA: ${report.summary.avgCGPA} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

        const tableHead = [['Semester', 'Enrolled', 'Appeared', 'Passed', 'Failed', 'Pass %', 'Avg SGPA', 'High SGPA', 'Low SGPA', 'Attrition']];
        const tableBody = (report.semesters || []).map(s => [
            `Sem ${s.semester}`,
            s.enrolled,
            s.appeared,
            s.passed,
            s.failed,
            `${s.passRate}%`,
            s.avgSgpa,
            s.highestSgpa,
            s.lowestSgpa,
            s.attritionDelta > 0 ? `-${s.attritionDelta}` : '0'
        ]);

        autoTable(doc, {
            head: tableHead,
            body: tableBody,
            startY: 25,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        doc.save(`Dept_Overview_${branch}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>HOD &amp; Academic Leadership Suite</PageHeaderEyebrow>
                    <PageHeaderTitle>Department Overview &amp; Semester Attrition</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Comprehensive semester-over-semester progression, pass percentage trends, and student retention diagnostics.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={report.semesters.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={report.semesters.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadDeptData} variant="primary">
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
                                options={meta.branches.map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))}
                            />
                        </div>
                        <div>
                            <Select
                                label="Intake Batch (Optional)"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={[{ value: '', label: 'All Batches' }, ...meta.batches.map(b => ({ value: b, label: `${b.slice(-2)} Batch (${b})` }))]}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* 4 Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', marginBottom: '24px' }}>
                {[
                    { label: 'Department Enrolled', value: report.summary.totalStudents, color: 'var(--tx-main)' },
                    { label: 'Overall Pass Rate', value: `${report.summary.overallPassRate}%`, color: report.summary.overallPassRate >= 75 ? '#10B981' : '#F59E0B' },
                    { label: 'Department Avg CGPA', value: report.summary.avgCGPA > 0 ? report.summary.avgCGPA.toFixed(2) : '—', color: 'var(--primary)' },
                    { label: 'Active Arrears', value: report.summary.totalBacklogs, color: report.summary.totalBacklogs > 0 ? '#EF4444' : 'var(--tx-muted)' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            {/* Recharts Pass Rate Trend Chart */}
            {chartData.length > 0 && (
                <Card style={{ marginBottom: '24px' }}>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>trending_up</span>
                            Semester-over-Semester Pass Rate Trend
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div style={{ width: '100%', height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                    <XAxis dataKey="semester" tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                    <YAxis domain={[0, 100]} tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="passRate" name="Pass Rate (%)" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                                    <Line type="monotone" dataKey="avgSgpa" name="Avg SGPA (x10)" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Semester-by-Semester Table */}
            <Card style={{ overflow: 'hidden' }}>
                <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>table_chart</span>
                        Progression &amp; Retention Matrix by Semester
                    </CardTitle>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'center' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '120px' }}>Semester</th>
                                    <th style={{ padding: '12px 10px' }}>Enrolled</th>
                                    <th style={{ padding: '12px 10px' }}>Appeared</th>
                                    <th style={{ padding: '12px 10px' }}>Passed</th>
                                    <th style={{ padding: '12px 10px' }}>Failed</th>
                                    <th style={{ padding: '12px 12px' }}>Pass Rate</th>
                                    <th style={{ padding: '12px 12px' }}>Avg SGPA</th>
                                    <th style={{ padding: '12px 10px' }}>Highest</th>
                                    <th style={{ padding: '12px 10px' }}>Lowest</th>
                                    <th style={{ padding: '12px 12px' }}>Retention Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {report.semesters.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Compiling department performance overview...' : 'No marks recorded for this department.'}
                                        </td>
                                    </tr>
                                ) : (
                                    report.semesters.map(s => {
                                        const passColor = s.passRate >= 80 ? '#10B981' : s.passRate >= 60 ? 'var(--primary)' : '#EF4444';
                                        return (
                                            <tr key={s.semester} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                                <td style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 800, color: 'var(--primary)' }}>
                                                    Semester {s.semester}
                                                </td>
                                                <td style={{ padding: '12px 10px', color: 'var(--tx-muted)' }}>{s.enrolled}</td>
                                                <td style={{ padding: '12px 10px', fontWeight: 700 }}>{s.appeared}</td>
                                                <td style={{ padding: '12px 10px', color: '#10B981', fontWeight: 800 }}>{s.passed}</td>
                                                <td style={{ padding: '12px 10px', color: s.failed > 0 ? '#EF4444' : 'var(--tx-muted)', fontWeight: 800 }}>
                                                    {s.failed}
                                                </td>
                                                <td style={{ padding: '12px 12px' }}>
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: '6px',
                                                        fontWeight: 900, fontSize: '12px',
                                                        background: s.passRate >= 80 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                        color: passColor
                                                    }}>
                                                        {s.passRate}%
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 12px', fontWeight: 800 }}>{s.avgSgpa.toFixed(2)}</td>
                                                <td style={{ padding: '12px 10px', color: '#10B981', fontWeight: 700 }}>{s.highestSgpa.toFixed(2)}</td>
                                                <td style={{ padding: '12px 10px', color: s.lowestSgpa < 5.0 ? '#EF4444' : 'inherit' }}>
                                                    {s.lowestSgpa.toFixed(2)}
                                                </td>
                                                <td style={{ padding: '12px 12px' }}>
                                                    {s.attritionDelta > 0 ? (
                                                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', fontSize: '11px', fontWeight: 800 }}>
                                                            -{s.attritionDelta} Students Drop
                                                        </span>
                                                    ) : (
                                                        <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', fontSize: '11px', fontWeight: 800 }}>
                                                            100% Retained
                                                        </span>
                                                    )}
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
