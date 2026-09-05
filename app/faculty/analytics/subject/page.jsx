'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AuthGuard from '../../../../components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import { matchesBranch, getCleanBranchOptions } from '@/lib/semester-utils';
import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

export default function SubjectAnalyticsPage() {
    return (
        <AuthGuard role="faculty">
            <SubjectAnalyticsContent />
        </AuthGuard>
    );
}

const GRADE_COLORS = {
    'O': '#10B981',
    'A+': '#10B981',
    'A': '#34D399',
    'B+': '#3B82F6',
    'B': '#60A5FA',
    'C': '#F59E0B',
    'P': '#FBBF24',
    'F': '#EF4444'
};

const MEDAL_STYLES = {
    1: { bg: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)', text: '#FFFFFF', icon: '🥇', label: 'Rank 1 • Gold' },
    2: { bg: 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)', text: '#FFFFFF', icon: '🥈', label: 'Rank 2 • Silver' },
    3: { bg: 'linear-gradient(135deg, #B45309 0%, #78350F 100%)', text: '#FFFFFF', icon: '🥉', label: 'Rank 3 • Bronze' }
};

function SubjectAnalyticsContent() {
    const initialSaved = getSavedFilters();
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8], subjects: [] });

    // Scope Filters
    const [branch, setBranch] = useState(() => initialSaved.branch || 'CS');
    const [semester, setSemester] = useState(() => Number(initialSaved.semester) || 1);
    const [subjectCode, setSubjectCode] = useState('');
    const [batch, setBatch] = useState(() => initialSaved.batch || '');
    
    // Roster Filtering & Search
    const [searchQuery, setSearchQuery] = useState('');
    const [rosterTab, setRosterTab] = useState('ALL'); // 'ALL' | 'FCD' | 'FC' | 'PASS' | 'FAIL'
    const [sortBy, setSortBy] = useState('rank'); // 'rank' | 'total' | 'see' | 'cie' | 'usn'
    const [sortAsc, setSortAsc] = useState(true);

    // Analytics Data State
    const [analytics, setAnalytics] = useState({
        subject: { code: '', name: '', credits: 3, semester: 1, scheme: '2022' },
        kpis: {
            appeared: 0, passed: 0, failed: 0, passRate: 0, avgMarks: 0, highestMarks: 0,
            lowestMarks: 0, medianMarks: 0, stdDev: 0, avgCIE: 0, avgSEE: 0, maxCIE: 0, maxSEE: 0,
            fcdCount: 0, fcdRate: 0, fcCount: 0, fcRate: 0, scCount: 0, scRate: 0, pCount: 0, pRate: 0
        },
        gradeDistribution: [],
        classDistribution: [],
        topPerformers: [],
        roster: [],
        batchesAvailable: [],
        branchesAvailable: [],
        totalMarksAcrossAllBatches: 0
    });

    // Sync saved filters
    useEffect(() => {
        saveFilters({ branch, semester, batch: batch || undefined });
    }, [branch, semester, batch]);

    // 1. Fetch metadata on mount
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta', { query: { fresh: '1', t: Date.now() } });
                if (res) {
                    setMeta(res);
                }
            } catch (err) {
                console.error('Meta loading failed:', err);
            }
        }
        loadMeta();
    }, []);

    // Filter available subjects based on selected branch and semester
    // Prioritize subjects that have real student data, and compute their scope count
    const availableSubjects = useMemo(() => {
        const filtered = (meta.subjects || []).filter(s => {
            const matchesSem = !semester || Number(s.semester) === Number(semester);
            if (!matchesSem) return false;

            if (!branch || branch === 'ALL' || branch === 'All Branches') return true;

            if (s.branches && Array.isArray(s.branches)) {
                return s.branches.some(b => matchesBranch(b, branch));
            }
            return matchesBranch(s.branch || s.code, branch);
        });

        // Sort: Active subjects in scope first, then by student count descending
        return filtered.map(s => {
            const batchCount = batch ? (s.batchCounts?.[batch] || 0) : (s.studentCount || 0);
            const totalCount = s.studentCount || 0;
            return {
                ...s,
                scopeCount: batchCount,
                totalCount: totalCount
            };
        }).sort((a, b) => {
            // First by presence in current selected batch
            if (a.scopeCount > 0 && b.scopeCount === 0) return -1;
            if (a.scopeCount === 0 && b.scopeCount > 0) return 1;
            if (a.scopeCount > 0 && b.scopeCount > 0) return b.scopeCount - a.scopeCount;

            // Then by total historical student marks
            if (a.totalCount > 0 && b.totalCount === 0) return -1;
            if (a.totalCount === 0 && b.totalCount > 0) return 1;
            if (a.totalCount > 0 && b.totalCount > 0) return b.totalCount - a.totalCount;

            return a.code.localeCompare(b.code);
        });
    }, [meta.subjects, branch, semester, batch]);

    // Update selected subject when available subjects change
    // Auto-select the subject with the highest number of active students in this scope
    useEffect(() => {
        if (availableSubjects.length > 0) {
            const currentValid = availableSubjects.find(s => s.code === subjectCode);
            // If no subject selected or current subject has 0 students while other subjects have data, auto-switch to top active subject
            if (!subjectCode || !currentValid || (currentValid.scopeCount === 0 && availableSubjects[0].scopeCount > 0)) {
                setSubjectCode(availableSubjects[0].code);
            }
        }
    }, [availableSubjects, subjectCode]);

    // 2. Fetch subject analytics
    const loadSubjectData = useCallback(async () => {
        if (!subjectCode) return;
        setLoading(true);
        try {
            const query = { subjectCode, branch, semester };
            if (batch) query.batch = batch;
            const res = await apiRequest('/api/faculty/analytics/subject', { query });
            if (res) {
                setAnalytics(res);
            }
        } catch (err) {
            console.error('Subject analytics error:', err);
        } finally {
            setLoading(false);
        }
    }, [subjectCode, branch, semester, batch]);

    useEffect(() => {
        if (subjectCode) {
            loadSubjectData();
        }
    }, [subjectCode, branch, semester, batch, loadSubjectData]);

    // Selected subject metadata in availableSubjects
    const selectedSubjectMeta = useMemo(() => {
        return availableSubjects.find(s => s.code === subjectCode) || (meta.subjects || []).find(s => s.code === subjectCode);
    }, [availableSubjects, meta.subjects, subjectCode]);

    // Detect batch mismatch: user selected a batch where this subject has 0 marks, but other batches have data
    const batchMismatchInfo = useMemo(() => {
        if (!batch || analytics.kpis.appeared > 0 || !analytics.batchesAvailable || analytics.batchesAvailable.length === 0) {
            return null;
        }
        const availableInOther = analytics.batchesAvailable.find(b => b.batch !== batch && b.count > 0);
        if (availableInOther) {
            return {
                currentBatch: batch,
                recommendedBatch: availableInOther.batch,
                recommendedCount: availableInOther.count,
                totalRecords: analytics.totalMarksAcrossAllBatches || availableInOther.count
            };
        }
        return null;
    }, [batch, analytics.kpis.appeared, analytics.batchesAvailable, analytics.totalMarksAcrossAllBatches]);

    // Filtered & Sorted Student Roster
    const filteredRoster = useMemo(() => {
        let list = analytics.roster || [];

        // Status Tabs Filter
        if (rosterTab === 'FCD') {
            list = list.filter(r => (Number(r.total) || 0) >= 70 && !r.isFail);
        } else if (rosterTab === 'FC') {
            list = list.filter(r => (Number(r.total) || 0) >= 60 && (Number(r.total) || 0) < 70 && !r.isFail);
        } else if (rosterTab === 'PASS') {
            list = list.filter(r => !r.isFail);
        } else if (rosterTab === 'FAIL') {
            list = list.filter(r => r.isFail);
        }

        // Search Query
        if (searchQuery) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter(s => s.usn.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
        }

        // Sorting
        const sorted = [...list].sort((a, b) => {
            let res = 0;
            if (sortBy === 'rank') res = (a.rank || 0) - (b.rank || 0);
            else if (sortBy === 'total') res = (Number(b.total) || 0) - (Number(a.total) || 0);
            else if (sortBy === 'see') res = (Number(b.external) || 0) - (Number(a.external) || 0);
            else if (sortBy === 'cie') res = (Number(b.internal) || 0) - (Number(a.internal) || 0);
            else if (sortBy === 'usn') res = (a.usn || '').localeCompare(b.usn || '');
            return sortAsc ? res : -res;
        });

        return sorted;
    }, [analytics.roster, rosterTab, searchQuery, sortBy, sortAsc]);

    // ── Excel Export ──
    const handleExportExcel = async () => {
        const XLSX = await getXLSX();
        const wb = XLSX.utils.book_new();

        // 1. Summary Sheet
        const summaryData = [
            ['GradeFlow - Subject Performance Report'],
            [`Subject: ${analytics.subject.code} - ${analytics.subject.name}`],
            [`Department: ${branch}`, `Semester: Sem ${semester}`, `Batch: ${batch || 'All Batches'}`],
            [`Generated on: ${new Date().toLocaleString()}`],
            [],
            ['EXECUTIVE PERFORMANCE METRICS'],
            ['Total Students Appeared', analytics.kpis.appeared],
            ['Passed', analytics.kpis.passed],
            ['Failed / Arrears', analytics.kpis.failed],
            ['Pass Percentage', `${analytics.kpis.passRate}%`],
            ['Average Marks', analytics.kpis.avgMarks],
            ['Highest Marks', analytics.kpis.highestMarks],
            ['Lowest Marks', analytics.kpis.lowestMarks],
            ['Median Marks', analytics.kpis.medianMarks],
            ['Standard Deviation', analytics.kpis.stdDev],
            ['CIE Average', analytics.kpis.avgCIE],
            ['SEE Average', analytics.kpis.avgSEE],
            [],
            ['ACADEMIC HONORS BREAKDOWN'],
            ['Distinction (≥70%)', analytics.kpis.fcdCount, `${analytics.kpis.fcdRate}%`],
            ['First Class (60-69%)', analytics.kpis.fcCount, `${analytics.kpis.fcRate}%`],
            ['Second Class (50-59%)', analytics.kpis.scCount, `${analytics.kpis.scRate}%`],
            ['Pass Class (40-49%)', analytics.kpis.pCount, `${analytics.kpis.pRate}%`],
            ['Failed (<40%)', analytics.kpis.failed, `${analytics.kpis.appeared > 0 ? ((analytics.kpis.failed / analytics.kpis.appeared) * 100).toFixed(1) : 0}%`],
            [],
            ['GRADE DISTRIBUTION'],
            ...analytics.gradeDistribution.map(g => [`Grade ${g.grade}`, g.count, `${g.percentage}%`])
        ];
        const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

        // 2. Top Performers Sheet
        const topHeaders = ['Rank', 'USN', 'Student Name', 'Internal (CIE)', 'External (SEE)', 'Total Marks', 'Grade'];
        const topRows = analytics.topPerformers.map(tp => [
            tp.rank, tp.usn, tp.name, tp.internal ?? '—', tp.external ?? '—', tp.total, tp.grade
        ]);
        const wsTop = XLSX.utils.aoa_to_sheet([topHeaders, ...topRows]);
        XLSX.utils.book_append_sheet(wb, wsTop, 'Top 10 Performers');

        // 3. Full Student Roster Sheet
        const rosterHeaders = ['Rank', 'USN', 'Student Name', 'Branch', 'Internal (CIE)', 'External (SEE)', 'Total', 'Grade', 'Result'];
        const rosterRows = (analytics.roster || []).map((r, idx) => [
            r.rank || idx + 1, r.usn, r.name, r.branch, r.internal ?? '—', r.external ?? '—', r.total ?? '—', r.grade, r.isFail ? 'FAIL' : 'PASS'
        ]);
        const wsRoster = XLSX.utils.aoa_to_sheet([rosterHeaders, ...rosterRows]);
        XLSX.utils.book_append_sheet(wb, wsRoster, 'Complete Roster');

        XLSX.writeFile(wb, `Subject_Performance_${analytics.subject.code}_${branch}.xlsx`);
    };

    // ── PDF Export ──
    const handleExportPDF = async () => {
        const { jsPDF, autoTable } = await getJsPDF();
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`GradeFlow - Subject Performance Report`, 14, 15);

        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`${analytics.subject.code} - ${analytics.subject.name} (${analytics.subject.credits} Credits • ${analytics.subject.scheme} Scheme)`, 14, 21);
        doc.text(`Department: ${branch} | Sem: ${semester} | Batch: ${batch || 'All'} | Appeared: ${analytics.kpis.appeared} | Pass Rate: ${analytics.kpis.passRate}% | Class Avg: ${analytics.kpis.avgMarks}`, 14, 26);

        // Top Performers Table
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Top Performers Leaderboard', 14, 34);

        const topHead = [['Rank', 'USN', 'Student Name', 'Internal', 'External', 'Total', 'Grade']];
        const topBody = analytics.topPerformers.map(tp => [
            `#${tp.rank}`, tp.usn, tp.name, tp.internal ?? '—', tp.external ?? '—', tp.total, tp.grade
        ]);

        autoTable(doc, {
            head: topHead,
            body: topBody,
            startY: 37,
            theme: 'grid',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        const lastY = doc.lastAutoTable?.finalY || 100;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Complete Student Scores Roster', 14, lastY + 10);

        const rosterHead = [['Rank', 'USN', 'Name', 'Int', 'Ext', 'Total', 'Grade', 'Result']];
        const rosterBody = (filteredRoster || []).map((r, i) => [
            `#${r.rank || i + 1}`, r.usn, r.name, r.internal ?? '—', r.external ?? '—', r.total ?? '—', r.grade, r.isFail ? 'FAIL' : 'PASS'
        ]);

        autoTable(doc, {
            head: rosterHead,
            body: rosterBody,
            startY: lastY + 13,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255] }
        });

        doc.save(`Subject_Performance_${analytics.subject.code}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Analytics</PageHeaderEyebrow>
                    <PageHeaderTitle>Subject Performance Analytics</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Comprehensive real-time single-subject performance metrics, grade spread distribution, and student leaderboard.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={analytics.kpis.appeared === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={analytics.kpis.appeared === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={loadSubjectData} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        Refresh Data
                    </Button>
                </div>
            </div>

            {/* Smart Filter Toolbar */}
            <Card style={{ marginBottom: '24px', boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.05)' }}>
                <CardContent style={{ padding: '18px 22px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', alignItems: 'flex-end' }}>
                        <div>
                            <Select
                                label="Branch / Department"
                                value={branch}
                                onChange={e => setBranch(e.target.value)}
                                options={getCleanBranchOptions(meta.branches)}
                            />
                        </div>
                        <div>
                            <Select
                                label="Semester"
                                value={semester}
                                onChange={e => setSemester(Number(e.target.value))}
                                options={meta.semesters.map(s => {
                                    const count = (meta.subjects || []).filter(sub => sub.semester === s && sub.hasRealData).length;
                                    return {
                                        value: s,
                                        label: `Semester ${s} ${count > 0 ? `(${count} Active Subjects)` : ''}`
                                    };
                                })}
                            />
                        </div>
                        <div>
                            <Select
                                label={`Subject (${availableSubjects.filter(s => s.scopeCount > 0).length} with Marks)`}
                                value={subjectCode}
                                onChange={e => setSubjectCode(e.target.value)}
                                options={availableSubjects.length > 0 
                                    ? availableSubjects.map(s => {
                                        let tag = '';
                                        if (s.scopeCount > 0) tag = `★ ${s.code} - ${s.name} (${s.scopeCount} students)`;
                                        else if (s.totalCount > 0) tag = `${s.code} - ${s.name} (${s.totalCount} in other batches)`;
                                        else tag = `${s.code} - ${s.name}`;
                                        return {
                                            value: s.code,
                                            label: tag
                                        };
                                    })
                                    : [{ value: subjectCode || '', label: subjectCode || 'No subjects found' }]
                                }
                            />
                        </div>
                        <div>
                            <Select
                                label="Batch Filter"
                                value={batch}
                                onChange={e => setBatch(e.target.value)}
                                options={[
                                    { value: '', label: `All Batches ${analytics.totalMarksAcrossAllBatches ? `(${analytics.totalMarksAcrossAllBatches} Marks)` : ''}` },
                                    ...meta.batches.map(b => {
                                        const count = selectedSubjectMeta?.batchCounts?.[b] || 0;
                                        return {
                                            value: b,
                                            label: `${b.slice(-2)} Batch (${b})${count > 0 ? ` • ${count} students` : ''}`
                                        };
                                    })
                                ]}
                            />
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Smart Batch Mismatch Banner */}
            {batchMismatchInfo && (
                <div style={{
                    background: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="material-icons-round" style={{ fontSize: '24px', color: '#F59E0B' }}>info</span>
                        <div>
                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                No marks found for {batchMismatchInfo.currentBatch.slice(-2)} Batch ({batchMismatchInfo.currentBatch}) in {subjectCode}.
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>
                                Found <strong>{batchMismatchInfo.recommendedCount} students</strong> recorded in <strong>{batchMismatchInfo.recommendedBatch} Batch</strong> ({batchMismatchInfo.totalRecords} marks across all batches).
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setBatch(batchMismatchInfo.recommendedBatch)}
                            style={{
                                background: '#F59E0B',
                                color: '#FFFFFF',
                                border: 'none',
                                padding: '6px 14px',
                                borderRadius: '6px',
                                fontWeight: 800,
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            Switch to {batchMismatchInfo.recommendedBatch.slice(-2)} Batch ({batchMismatchInfo.recommendedCount} students)
                        </button>
                        <button
                            onClick={() => setBatch('')}
                            style={{
                                background: 'var(--surface)',
                                color: 'var(--tx-main)',
                                border: '1px solid var(--border)',
                                padding: '6px 14px',
                                borderRadius: '6px',
                                fontWeight: 700,
                                fontSize: '12px',
                                cursor: 'pointer'
                            }}
                        >
                            View All Batches
                        </button>
                    </div>
                </div>
            )}

            {/* Subject Overview Glassmorphic Hero Banner */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.05) 0%, rgba(15, 23, 42, 0.02) 100%)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                padding: '24px 28px',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '20px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{
                            fontSize: '13px',
                            fontWeight: 900,
                            color: '#FFFFFF',
                            background: 'var(--primary)',
                            padding: '4px 12px',
                            borderRadius: '8px',
                            letterSpacing: '0.04em'
                        }}>
                            {analytics.subject.code || subjectCode}
                        </span>
                        <span style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: 'var(--surface-low)',
                            color: 'var(--tx-muted)',
                            border: '1px solid var(--border-low)'
                        }}>
                            Semester {analytics.subject.semester || semester}
                        </span>
                        <span style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: 'var(--surface-low)',
                            color: 'var(--tx-muted)',
                            border: '1px solid var(--border-low)'
                        }}>
                            {analytics.subject.credits || 3} Credits
                        </span>
                        <span style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            padding: '3px 10px',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.1)',
                            color: '#3B82F6',
                            border: '1px solid rgba(59, 130, 246, 0.2)'
                        }}>
                            {analytics.subject.scheme} Scheme
                        </span>
                        {analytics.kpis.appeared > 0 && (
                            <span style={{
                                fontSize: '12px',
                                fontWeight: 800,
                                padding: '3px 10px',
                                borderRadius: '6px',
                                background: 'rgba(16, 185, 129, 0.1)',
                                color: '#10B981',
                                border: '1px solid rgba(16, 185, 129, 0.2)'
                            }}>
                                Live Database Records
                            </span>
                        )}
                    </div>
                    <h2 style={{ fontSize: '24px', fontWeight: 900, margin: 0, color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>
                        {analytics.subject.name || selectedSubjectMeta?.name || 'Subject Analytics'}
                    </h2>
                </div>

                {/* Batch Quick Filter Chips */}
                {analytics.batchesAvailable && analytics.batchesAvailable.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>
                            Available Batches for this Subject
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button
                                onClick={() => setBatch('')}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '6px',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    background: batch === '' ? 'var(--primary)' : 'var(--surface)',
                                    color: batch === '' ? '#FFFFFF' : 'var(--tx-main)',
                                    border: '1px solid var(--border)'
                                }}
                            >
                                All ({analytics.totalMarksAcrossAllBatches})
                            </button>
                            {analytics.batchesAvailable.map(b => (
                                <button
                                    key={b.batch}
                                    onClick={() => setBatch(b.batch)}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        fontSize: '12px',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        background: batch === b.batch ? 'var(--primary)' : 'var(--surface)',
                                        color: batch === b.batch ? '#FFFFFF' : 'var(--tx-main)',
                                        border: '1px solid var(--border)'
                                    }}
                                >
                                    {b.batch.slice(-2)} Batch ({b.count})
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* 6 Executive KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: '16px', marginBottom: '28px' }}>
                {/* 1. Total Appeared */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px', position: 'relative', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Appeared</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--tx-dim)' }}>group</span>
                    </div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--tx-main)' }}>{analytics.kpis.appeared}</div>
                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                        {batch ? `${batch.slice(-2)} Batch Cohort` : 'Across All Batches'}
                    </div>
                </div>

                {/* 2. Pass Rate */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pass Rate</span>
                        <span className="material-icons-round" style={{
                            fontSize: '20px',
                            color: analytics.kpis.passRate >= 75 ? '#10B981' : analytics.kpis.passRate >= 50 ? '#F59E0B' : '#EF4444'
                        }}>verified</span>
                    </div>
                    <div style={{
                        fontSize: '30px',
                        fontWeight: 900,
                        color: analytics.kpis.passRate >= 75 ? '#10B981' : analytics.kpis.passRate >= 50 ? '#F59E0B' : '#EF4444'
                    }}>
                        {analytics.kpis.passRate}%
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                        {analytics.kpis.passed} Cleared • {analytics.kpis.failed} Arrears
                    </div>
                </div>

                {/* 3. Class Average Marks */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Class Average</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>analytics</span>
                    </div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: 'var(--primary)' }}>
                        {analytics.kpis.avgMarks}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                        Median: {analytics.kpis.medianMarks} • Std Dev: ±{analytics.kpis.stdDev}
                    </div>
                </div>

                {/* 4. Highest & Lowest Range */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Marks Spread</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: '#6366F1' }}>show_chart</span>
                    </div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: '#6366F1' }}>
                        {analytics.kpis.highestMarks} <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tx-dim)' }}>/ {analytics.kpis.lowestMarks}</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                        Range: {Math.max(0, analytics.kpis.highestMarks - analytics.kpis.lowestMarks)} Points
                    </div>
                </div>

                {/* 5. CIE vs SEE Parity */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>CIE / SEE Parity</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: '#EC4899' }}>balance</span>
                    </div>
                    <div style={{ fontSize: '26px', fontWeight: 900, color: 'var(--tx-main)' }}>
                        {analytics.kpis.avgCIE} <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tx-dim)' }}>vs</span> {analytics.kpis.avgSEE}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                        Avg CIE vs Avg SEE Theory
                    </div>
                </div>

                {/* 6. Distinction & First Class Rate */}
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Distinction (≥70%)</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: '#10B981' }}>military_tech</span>
                    </div>
                    <div style={{ fontSize: '30px', fontWeight: 900, color: '#10B981' }}>
                        {analytics.kpis.fcdCount} <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--tx-dim)' }}>({analytics.kpis.fcdRate}%)</span>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                        First Class: {analytics.kpis.fcCount} ({analytics.kpis.fcRate}%)
                    </div>
                </div>
            </div>

            {/* Performance Visual Analytics: 2 Columns */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 450px), 1fr))', gap: '24px', marginBottom: '28px' }}>
                {/* 1. Grade Distribution Bar Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>bar_chart</span>
                                VTU Grade Distribution
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-muted)' }}>
                                {analytics.kpis.appeared} Students Scored
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div style={{ width: '100%', height: '280px' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={analytics.gradeDistribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                                    <XAxis dataKey="grade" tick={{ fill: 'var(--tx-muted)', fontSize: 12, fontWeight: 700 }} />
                                    <YAxis allowDecimals={false} tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                    <Tooltip
                                        content={({ active, payload }) => {
                                            if (active && payload && payload.length) {
                                                const d = payload[0].payload;
                                                return (
                                                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
                                                        <div style={{ fontWeight: 900, marginBottom: '4px' }}>Grade {d.grade}</div>
                                                        <div style={{ color: GRADE_COLORS[d.grade] || 'var(--primary)', fontWeight: 800 }}>
                                                            {d.count} Students ({d.percentage}%)
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        }}
                                    />
                                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                        {analytics.gradeDistribution.map(entry => (
                                            <Cell key={`cell-${entry.grade}`} fill={GRADE_COLORS[entry.grade] || 'var(--primary)'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Class Performance Breakdown */}
                <Card>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: '#6366F1' }}>pie_chart</span>
                            Academic Honors Breakdown (VTU Classification)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingTop: '8px' }}>
                            {(analytics.classDistribution || []).map(cd => (
                                <div key={cd.category} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                        <span style={{ fontWeight: 700, color: 'var(--tx-main)' }}>{cd.category}</span>
                                        <span style={{ fontWeight: 800, color: cd.color }}>{cd.count} Students ({cd.percentage}%)</span>
                                    </div>
                                    <div style={{ width: '100%', height: '8px', background: 'var(--surface-low)', borderRadius: '4px', overflow: 'hidden' }}>
                                        <div style={{
                                            width: `${cd.percentage}%`,
                                            height: '100%',
                                            background: cd.color,
                                            borderRadius: '4px',
                                            transition: 'width 0.4s ease-in-out'
                                        }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Top 3 Performers Olympic Podium */}
            {analytics.topPerformers.length >= 3 && (
                <div style={{ marginBottom: '28px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: '#F59E0B' }}>emoji_events</span>
                        Top Performers Podium
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '16px' }}>
                        {analytics.topPerformers.slice(0, 3).map((tp, idx) => {
                            const medal = MEDAL_STYLES[idx + 1];
                            return (
                                <div
                                    key={tp.usn}
                                    style={{
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '16px',
                                        padding: '20px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '12px',
                                        position: 'relative',
                                        boxShadow: '0 4px 16px -2px rgba(0,0,0,0.04)'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 900,
                                            padding: '4px 12px',
                                            borderRadius: '20px',
                                            background: medal.bg,
                                            color: medal.text
                                        }}>
                                            {medal.icon} {medal.label}
                                        </span>
                                        <span style={{
                                            fontSize: '12px',
                                            fontWeight: 800,
                                            padding: '2px 8px',
                                            borderRadius: '4px',
                                            background: 'rgba(16, 185, 129, 0.15)',
                                            color: '#10B981'
                                        }}>
                                            Grade {tp.grade}
                                        </span>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '2px' }}>
                                            {tp.name}
                                        </div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--tx-muted)' }}>
                                            {tp.usn}
                                        </div>
                                    </div>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: 'repeat(3, 1fr)',
                                        background: 'var(--surface-low)',
                                        borderRadius: '10px',
                                        padding: '10px',
                                        textAlign: 'center',
                                        gap: '4px'
                                    }}>
                                        <div>
                                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)' }}>CIE</div>
                                            <div style={{ fontSize: '14px', fontWeight: 800 }}>{tp.internal ?? '—'}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)' }}>SEE</div>
                                            <div style={{ fontSize: '14px', fontWeight: 800 }}>{tp.external ?? '—'}</div>
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)' }}>TOTAL</div>
                                            <div style={{ fontSize: '16px', fontWeight: 900, color: 'var(--primary)' }}>{tp.total}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Top 10 Performers Leaderboard Table */}
            <Card style={{ marginBottom: '28px' }}>
                <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: '#F59E0B' }}>leaderboard</span>
                            Top 10 Performers Leaderboard
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-muted)' }}>
                            Dense Rank Order
                        </span>
                    </CardTitle>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '10px 14px', textAlign: 'center', width: '55px' }}>Rank</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>USN</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Student Name</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>CIE</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>SEE</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Total Marks</th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Grade</th>
                                </tr>
                            </thead>
                            <tbody>
                                {analytics.topPerformers.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Loading top performers...' : 'No marks recorded for this subject.'}
                                        </td>
                                    </tr>
                                ) : (
                                    analytics.topPerformers.map((tp, idx) => (
                                        <tr key={tp.usn} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                <span style={{
                                                    width: '24px', height: '24px', borderRadius: '50%',
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                    fontWeight: 900, fontSize: '11px',
                                                    background: idx === 0 ? '#F59E0B' : idx === 1 ? '#9CA3AF' : idx === 2 ? '#B45309' : 'var(--surface-low)',
                                                    color: idx < 3 ? '#FFFFFF' : 'var(--tx-dim)'
                                                }}>
                                                    {tp.rank}
                                                </span>
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{tp.usn}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 700 }}>{tp.name}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--tx-muted)' }}>{tp.internal ?? '—'}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--tx-muted)' }}>{tp.external ?? '—'}</td>
                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>{tp.total}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center' }}>
                                                <span style={{ padding: '2px 8px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', fontWeight: 800, fontSize: '11px' }}>
                                                    {tp.grade}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            {/* Complete Student Score Roster */}
            <Card>
                <CardHeader>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
                        <div>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>people</span>
                                Complete Student Score Roster ({filteredRoster.length} Students)
                            </CardTitle>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            {/* Roster Filter Tabs */}
                            <div style={{ display: 'flex', background: 'var(--surface-low)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
                                {[
                                    { id: 'ALL', label: `All (${analytics.roster.length})` },
                                    { id: 'FCD', label: `Distinction (${analytics.kpis.fcdCount})` },
                                    { id: 'FC', label: `First Class (${analytics.kpis.fcCount})` },
                                    { id: 'PASS', label: `Passed (${analytics.kpis.passed})` },
                                    { id: 'FAIL', label: `Failed (${analytics.kpis.failed})` },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setRosterTab(tab.id)}
                                        style={{
                                            background: rosterTab === tab.id ? 'var(--surface)' : 'transparent',
                                            color: rosterTab === tab.id ? 'var(--tx-main)' : 'var(--tx-muted)',
                                            border: 'none',
                                            padding: '5px 10px',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            fontWeight: rosterTab === tab.id ? 800 : 600,
                                            cursor: 'pointer',
                                            boxShadow: rosterTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none'
                                        }}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                            {/* Search Input */}
                            <div style={{ minWidth: '220px' }}>
                                <Input
                                    placeholder="Search by USN or Name..."
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th
                                        onClick={() => { setSortBy('rank'); setSortAsc(sortBy === 'rank' ? !sortAsc : true); }}
                                        style={{ padding: '10px 14px', width: '55px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Rank {sortBy === 'rank' ? (sortAsc ? '▲' : '▼') : ''}
                                    </th>
                                    <th
                                        onClick={() => { setSortBy('usn'); setSortAsc(sortBy === 'usn' ? !sortAsc : true); }}
                                        style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        USN {sortBy === 'usn' ? (sortAsc ? '▲' : '▼') : ''}
                                    </th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Student Name</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Branch</th>
                                    <th
                                        onClick={() => { setSortBy('cie'); setSortAsc(sortBy === 'cie' ? !sortAsc : false); }}
                                        style={{ padding: '10px 10px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        CIE (Internal) {sortBy === 'cie' ? (sortAsc ? '▲' : '▼') : ''}
                                    </th>
                                    <th
                                        onClick={() => { setSortBy('see'); setSortAsc(sortBy === 'see' ? !sortAsc : false); }}
                                        style={{ padding: '10px 10px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        SEE (External) {sortBy === 'see' ? (sortAsc ? '▲' : '▼') : ''}
                                    </th>
                                    <th
                                        onClick={() => { setSortBy('total'); setSortAsc(sortBy === 'total' ? !sortAsc : false); }}
                                        style={{ padding: '10px 10px', textAlign: 'center', cursor: 'pointer', userSelect: 'none' }}
                                    >
                                        Total Marks {sortBy === 'total' ? (sortAsc ? '▲' : '▼') : ''}
                                    </th>
                                    <th style={{ padding: '10px 10px', textAlign: 'center' }}>Grade</th>
                                    <th style={{ padding: '10px 14px', textAlign: 'center' }}>Result</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRoster.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            {loading ? 'Loading scores roster...' : 'No students found matching your filters.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRoster.map((r, idx) => (
                                        <tr key={r.usn} style={{ borderBottom: '1px solid var(--border-low)', background: r.isFail ? 'rgba(239, 68, 68, 0.02)' : 'transparent' }}>
                                            <td style={{ padding: '10px 14px', textAlign: 'center', fontWeight: 800, color: 'var(--tx-dim)' }}>
                                                #{r.rank || idx + 1}
                                            </td>
                                            <td style={{ padding: '10px 14px', fontWeight: 800, fontFamily: 'monospace' }}>{r.usn}</td>
                                            <td style={{ padding: '10px 14px', fontWeight: 700 }}>{r.name}</td>
                                            <td style={{ padding: '10px 14px', color: 'var(--tx-muted)' }}>{r.branch}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--tx-muted)' }}>{r.internal ?? '—'}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center', color: 'var(--tx-muted)' }}>{r.external ?? '—'}</td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 900, color: r.isFail ? '#EF4444' : 'var(--tx-main)' }}>
                                                {r.total ?? '—'}
                                            </td>
                                            <td style={{ padding: '10px 10px', textAlign: 'center', fontWeight: 800, color: r.isFail ? '#EF4444' : '#10B981' }}>
                                                {r.grade}
                                            </td>
                                            <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                                                <span style={{
                                                    padding: '2px 8px', borderRadius: '4px',
                                                    fontSize: '11px', fontWeight: 800,
                                                    background: r.isFail ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                    color: r.isFail ? '#EF4444' : '#10B981'
                                                }}>
                                                    {r.isFail ? 'FAIL' : 'PASS'}
                                                </span>
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
