'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { apiRequest, clearApiCache } from '../../../lib/api/client';
import { recordFacultyAction } from '../../../lib/api/faculty-action';
import AuthGuard from '../../../components/AuthGuard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from 'recharts';

// ── Activity Logger ─────────────────────────────────────────
async function logActivity(faculty, action_type, target = null) {
    await recordFacultyAction(faculty, action_type, target);
}

// ── Custom Tooltip for Grade Rechart ─────────────────────────
// Light card matching this app's actual surface/text tokens (--surface /
// --tx-main), not a generic dark dashboard-template card: this app has no
// --surface-high token, so the old `var(--surface-high, #1e293b)` background
// always fell through to that hardcoded dark navy fallback, while the value
// text stayed on `var(--tx-main)` (#0A181C, a near-black meant for THIS
// app's light surfaces) — near-black on dark navy is why the numbers were
// effectively unreadable.
function GradeCustomTooltip({ active, payload }) {
    if (!active || !payload || !payload.length) return null;
    const d = payload[0].payload;
    const accent = d.color || 'var(--primary)';
    return (
        <div style={{
            display: 'flex',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-4, 10px)',
            boxShadow: '0 10px 28px rgba(10, 24, 28, 0.14)',
            overflow: 'hidden',
            minWidth: '176px',
            fontSize: '12px'
        }}>
            <span style={{ width: '4px', flexShrink: 0, background: accent }} />
            <div style={{ padding: '10px 14px' }}>
                <div style={{ fontSize: '9.5px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>
                    {d.label || d.key}
                </div>
                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginBottom: '8px' }}>
                    {d.name || d.label || d.key}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px', paddingTop: '7px', borderTop: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--tx-dim)', fontWeight: 600 }}>Students</span>
                    <span style={{ fontWeight: 800, color: 'var(--tx-main)', fontVariantNumeric: 'tabular-nums' }}>{(d.count || 0).toLocaleString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px', marginTop: '3px' }}>
                    <span style={{ color: 'var(--tx-dim)', fontWeight: 600 }}>Share</span>
                    <span style={{ fontWeight: 800, color: accent, fontVariantNumeric: 'tabular-nums' }}>{d.percent}%</span>
                </div>
            </div>
        </div>
    );
}

function ReportsContent() {
    const [faculty, setFaculty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [stats, setStats] = useState({
        uniqueStudents: 0,
        totalSubjects: 0,
        passCount: 0,
        failCount: 0,
        absentCount: 0,
        distinctionCount: 0,
        firstClassCount: 0,
        distinctionRate: 0,
        firstClassRate: 0,
        letterGradeData: [],
        outcomeData: [],
        topStudents: [],
        classStats: [],
        subjectPassRates: [],
        facultyWorkload: [],
    });
    const [activity, setActivity] = useState([]);

    // ── Grade Graph View Mode: 'grades' (Letter Grades O to F) vs 'outcomes' (Pass/Fail/Absent) ──
    const [chartMode, setChartMode] = useState('grades');

    // ── Faculty-Subject Filtering & Pagination State ──
    const [activeView, setActiveView] = useState('subjects'); // 'subjects' | 'faculty'
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'critical' (<60) | 'average' (60-79) | 'high' (>=80)
    const [semFilter, setSemFilter] = useState('all');
    const [sortBy, setSortBy] = useState('lowest_pass'); // 'lowest_pass' | 'highest_pass' | 'most_students' | 'code_asc'
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    useEffect(() => {
        const sessionStr = localStorage.getItem('faculty_session');
        if (!sessionStr) return;
        try {
            const f = JSON.parse(sessionStr);
            setFaculty(f);
            loadReportData();
        } catch { /* ignored */ }
    }, []);

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [reportSyncMsg, setReportSyncMsg] = useState('');

    const loadReportData = async (isManual = false) => {
        const prevStudents = stats.uniqueStudents;
        const prevSubjects = stats.totalSubjects;

        if (isManual) {
            setIsRefreshing(true);
            clearApiCache();
        } else {
            setLoading(true);
        }
        try {
            const data = await apiRequest(`/api/faculty/reports?_t=${Date.now()}`).catch(() => null);

            if (data) {
                setStats({
                    uniqueStudents: data.uniqueStudents || 0,
                    totalSubjects: data.totalSubjects || 0,
                    passCount: data.passCount || 0,
                    failCount: data.failCount || 0,
                    absentCount: data.absentCount || 0,
                    distinctionCount: data.distinctionCount || 0,
                    firstClassCount: data.firstClassCount || 0,
                    distinctionRate: data.distinctionRate || 0,
                    firstClassRate: data.firstClassRate || 0,
                    letterGradeData: data.letterGradeData || [],
                    outcomeData: data.outcomeData || [],
                    topStudents: data.topStudents || [],
                    classStats: data.classStats || [],
                    subjectPassRates: data.subjectPassRates || [],
                    facultyWorkload: data.facultyWorkload || [],
                });

                if (isManual) {
                    const newStudents = data.uniqueStudents || 0;
                    const diffStudents = newStudents - prevStudents;
                    const newSubjects = data.totalSubjects || 0;
                    const diffSubjects = newSubjects - prevSubjects;

                    if (diffStudents > 0 || diffSubjects > 0) {
                        const parts = [];
                        if (diffStudents > 0) parts.push(`+${diffStudents} students`);
                        if (diffSubjects > 0) parts.push(`+${diffSubjects} subjects`);
                        setReportSyncMsg(`✓ New examination data detected: ${parts.join(', ')} synced dynamically!`);
                    } else {
                        setReportSyncMsg(`✓ Verified live: All ${newStudents} students across ${newSubjects} courses are current.`);
                    }
                    setTimeout(() => setReportSyncMsg(''), 5000);
                }
            }
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Failed to load report data:', err);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    const handleViewStudent = async (usn) => {
        await logActivity(faculty, 'VIEW_REPORT_STUDENT', usn);
    };

    // ── Filter & Sort Subjects ──
    const { filteredSubjects, subjectCounts } = useMemo(() => {
        const raw = stats.subjectPassRates || [];
        let criticalCount = 0;
        let avgCount = 0;
        let highCount = 0;

        for (const s of raw) {
            const r = s.passRate ?? 0;
            if (r < 60) criticalCount++;
            else if (r < 80) avgCount++;
            else highCount++;
        }

        const counts = {
            all: raw.length,
            critical: criticalCount,
            average: avgCount,
            high: highCount,
        };

        const q = searchQuery.toLowerCase().trim();
        const filtered = raw.filter(sub => {
            // Search query match
            if (q) {
                const matchCode = sub.code?.toLowerCase().includes(q);
                const matchName = sub.name?.toLowerCase().includes(q);
                const matchFac = sub.facultyName?.toLowerCase().includes(q);
                if (!matchCode && !matchName && !matchFac) return false;
            }

            // Status filter
            const rate = sub.passRate ?? 0;
            if (statusFilter === 'critical' && rate >= 60) return false;
            if (statusFilter === 'average' && (rate < 60 || rate >= 80)) return false;
            if (statusFilter === 'high' && rate < 80) return false;

            // Semester filter
            if (semFilter !== 'all' && Number(sub.semester) !== Number(semFilter)) return false;

            return true;
        });

        // Sort
        filtered.sort((a, b) => {
            if (sortBy === 'lowest_pass') return (a.passRate ?? 0) - (b.passRate ?? 0);
            if (sortBy === 'highest_pass') return (b.passRate ?? 0) - (a.passRate ?? 0);
            if (sortBy === 'most_students') return (b.total ?? 0) - (a.total ?? 0);
            if (sortBy === 'code_asc') return (a.code || '').localeCompare(b.code || '');
            return 0;
        });

        return { filteredSubjects: filtered, subjectCounts: counts };
    }, [stats.subjectPassRates, searchQuery, statusFilter, semFilter, sortBy]);

    // ── Filter Faculty Workload ──
    const filteredFacultyWorkload = useMemo(() => {
        const q = searchQuery.toLowerCase().trim();
        const raw = stats.facultyWorkload || [];
        if (!q) return raw;
        return raw.filter(f =>
            f.facultyName?.toLowerCase().includes(q) ||
            f.department?.toLowerCase().includes(q) ||
            f.subjects?.some(s => s.code?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q))
        );
    }, [stats.facultyWorkload, searchQuery]);

    // Reset pagination when filter changes
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, statusFilter, semFilter, sortBy, pageSize]);

    // Paginated slice
    const totalPages = Math.ceil(filteredSubjects.length / (pageSize === 'all' ? filteredSubjects.length || 1 : pageSize));
    const paginatedSubjects = useMemo(() => {
        if (pageSize === 'all') return filteredSubjects;
        const start = (currentPage - 1) * pageSize;
        return filteredSubjects.slice(start, start + pageSize);
    }, [filteredSubjects, currentPage, pageSize]);

    // Distinct Semesters for filter dropdown
    const availableSemesters = useMemo(() => {
        const sems = new Set();
        (stats.subjectPassRates || []).forEach(s => {
            if (s.semester) sems.add(s.semester);
        });
        return Array.from(sems).sort((a, b) => a - b);
    }, [stats.subjectPassRates]);

    const c = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1240px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' },
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' },
        statVal: { fontSize: '30px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em' },
        emptyState: { padding: 'var(--space-11) var(--space-9)', textAlign: 'center', background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 'var(--radius-7)', color: 'var(--tx-dim)' },
        tabBtn: (active) => ({
            padding: '6px 14px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
            background: active ? 'var(--primary)' : 'var(--surface-low)',
            color: active ? '#ffffff' : 'var(--tx-main)',
            transition: 'all 0.15s ease',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
        }),
        filterPill: (active, tone = 'default') => {
            let activeBg = 'var(--primary)';
            let activeColor = '#ffffff';
            let activeBorder = 'var(--primary)';
            if (tone === 'danger') {
                activeBg = '#EF4444';
                activeBorder = '#EF4444';
            } else if (tone === 'warning') {
                activeBg = '#F59E0B';
                activeBorder = '#F59E0B';
            } else if (tone === 'success') {
                activeBg = '#10B981';
                activeBorder = '#10B981';
            }
            return {
                padding: '5px 12px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                border: `1px solid ${active ? activeBorder : 'var(--border)'}`,
                background: active ? activeBg : 'var(--surface-low)',
                color: active ? activeColor : 'var(--tx-main)',
                transition: 'all 0.15s ease',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px'
            };
        }
    };

    if (loading) return (
        <div style={c.page}>
            <PageHeader>
                <PageHeaderEyebrow>Analytics &amp; Insights</PageHeaderEyebrow>
                <PageHeaderTitle>Reports</PageHeaderTitle>
            </PageHeader>
            <div style={{ marginTop: 'var(--space-9)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: '80px', background: 'var(--surface)', borderRadius: 'var(--radius-6)', opacity: 0.5 }} className="gf-pulse" />)}
            </div>
        </div>
    );

    if (stats.uniqueStudents === 0) {
        return (
            <div style={c.page}>
                <PageHeader>
                    <PageHeaderEyebrow>Analytics &amp; Insights</PageHeaderEyebrow>
                    <PageHeaderTitle>Reports</PageHeaderTitle>
                </PageHeader>
                <div style={{ ...c.emptyState, marginTop: 'var(--space-8)' }}>
                    <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: 'var(--space-4)', opacity: 0.4, display: 'block' }}>analytics</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: 'var(--space-2)' }}>No Data Yet</div>
                    <p style={{ fontSize: '14px', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
                        Add students to a class or fetch VTU results to see reporting data here. It updates automatically.
                    </p>
                    <button
                        onClick={() => loadReportData(true)}
                        disabled={isRefreshing}
                        style={{
                            marginTop: '16px',
                            padding: '8px 18px',
                            background: 'var(--primary)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontWeight: 700,
                            cursor: isRefreshing ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '8px'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px', animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }}>refresh</span>
                        {isRefreshing ? 'Refreshing...' : 'Check Again'}
                    </button>
                </div>
            </div>
        );
    }

    const currentChartData = chartMode === 'grades' ? stats.letterGradeData : stats.outcomeData;

    return (
        <div style={c.page} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px', flexWrap: 'wrap', gap: '12px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Analytics &amp; Insights</PageHeaderEyebrow>
                    <PageHeaderTitle>Reports</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Live academic reporting across all department classes — updates automatically.
                        {lastUpdated && <span style={{ marginLeft: '8px', opacity: 0.6 }}>Last synced {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        onClick={() => loadReportData(true)}
                        disabled={isRefreshing || loading}
                        style={{
                            padding: '6px 14px',
                            background: 'var(--surface-low)',
                            border: '1px solid var(--border)',
                            borderRadius: '10px',
                            fontSize: '12px',
                            fontWeight: 700,
                            color: 'var(--tx-main)',
                            cursor: (isRefreshing || loading) ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                        }}
                        title="Refresh academic reports from database"
                    >
                        <span
                            className="material-icons-round"
                            style={{
                                fontSize: '16px',
                                color: 'var(--primary)',
                                animation: isRefreshing ? 'spin 1s linear infinite' : 'none'
                            }}
                        >
                            refresh
                        </span>
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--surface-low)', borderRadius: '10px', fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                        Live
                    </div>
                </div>
            </div>

            {reportSyncMsg && (
                <div
                    style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: 'var(--green)',
                        border: '1px solid var(--green)',
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '18px'
                    }}
                    className="gf-fade-in"
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>check_circle</span>
                    {reportSyncMsg}
                </div>
            )}

            {/* Top KPI Cards */}
            <div style={c.statGrid}>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Total Students</div>
                    <div style={c.statVal}>{stats.uniqueStudents.toLocaleString()}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Subject Records</div>
                    <div style={c.statVal}>{stats.totalSubjects.toLocaleString()}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Total Pass</div>
                    <div style={{ ...c.statVal, color: '#10B981' }}>{stats.passCount.toLocaleString()}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Backlogs (F)</div>
                    <div style={{ ...c.statVal, color: stats.failCount > 0 ? '#EF4444' : 'var(--tx-main)' }}>{stats.failCount.toLocaleString()}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Absents</div>
                    <div style={{ ...c.statVal, color: stats.absentCount > 0 ? '#F59E0B' : 'var(--tx-main)' }}>{stats.absentCount.toLocaleString()}</div>
                </div>
            </div>

            {/* ── Overhauled Grade Distribution Chart ─────────────────────────── */}
            <Card style={{ marginBottom: 'var(--space-6)' }}>
                <CardHeader style={{ paddingBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>bar_chart</span>
                            Grade &amp; Performance Distribution
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--tx-dim)', marginLeft: '8px' }}>
                                ({stats.totalSubjects.toLocaleString()} graded marks evaluated)
                            </span>
                        </CardTitle>
                        {/* Mode Switcher */}
                        <div style={{ display: 'flex', background: 'var(--surface-low)', padding: '3px', borderRadius: '10px', gap: '4px', border: '1px solid var(--border)' }}>
                            <button
                                onClick={() => setChartMode('grades')}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    border: 'none',
                                    background: chartMode === 'grades' ? 'var(--primary)' : 'transparent',
                                    color: chartMode === 'grades' ? '#ffffff' : 'var(--tx-muted)',
                                    transition: 'all 0.15s'
                                }}
                            >
                                Letter Grades (O to F)
                            </button>
                            <button
                                onClick={() => setChartMode('outcomes')}
                                style={{
                                    padding: '5px 12px',
                                    borderRadius: '8px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    border: 'none',
                                    background: chartMode === 'outcomes' ? 'var(--primary)' : 'transparent',
                                    color: chartMode === 'outcomes' ? '#ffffff' : 'var(--tx-muted)',
                                    transition: 'all 0.15s'
                                }}
                            >
                                Outcome Summary
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {/* Recharts Bar Chart */}
                    <div style={{ width: '100%', height: '240px', marginTop: '10px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={currentChartData}
                                margin={{ top: 20, right: 12, left: -14, bottom: 24 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" opacity={0.6} />
                                <XAxis
                                    dataKey="label"
                                    stroke="var(--tx-dim)"
                                    fontSize={11}
                                    fontWeight={700}
                                    tickLine={false}
                                    interval={0}
                                />
                                <YAxis
                                    stroke="var(--tx-dim)"
                                    fontSize={11}
                                    tickLine={false}
                                    tickFormatter={(val) => val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                                />
                                <Tooltip content={<GradeCustomTooltip />} cursor={{ fill: 'rgba(10, 24, 28, 0.045)' }} />
                                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                                    {currentChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color || '#3b82f6'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>

                    {/* Performance Distribution Summary Strip */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px',
                        marginTop: '16px',
                        paddingTop: '16px',
                        borderTop: '1px solid var(--border)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>emoji_events</span>
                            </div>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Distinction (O + A+)</div>
                                <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                    {stats.distinctionRate}% <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-dim)' }}>({stats.distinctionCount.toLocaleString()})</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>trending_up</span>
                            </div>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>First Class (A + B+)</div>
                                <div style={{ fontSize: '14px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                    {stats.firstClassRate}% <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-dim)' }}>({stats.firstClassCount.toLocaleString()})</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>warning_amber</span>
                            </div>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Backlog Rate (F)</div>
                                <div style={{ fontSize: '14px', fontWeight: 900, color: stats.failCount > 0 ? '#EF4444' : 'var(--tx-main)' }}>
                                    {stats.totalSubjects ? ((stats.failCount / stats.totalSubjects) * 100).toFixed(1) : 0}% <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-dim)' }}>({stats.failCount.toLocaleString()})</span>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>person_off</span>
                            </div>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Absent Rate</div>
                                <div style={{ fontSize: '14px', fontWeight: 900, color: stats.absentCount > 0 ? '#F59E0B' : 'var(--tx-main)' }}>
                                    {stats.totalSubjects ? ((stats.absentCount / stats.totalSubjects) * 100).toFixed(1) : 0}% <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-dim)' }}>({stats.absentCount.toLocaleString()})</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Top Students + Class Pass Rates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>
                {/* Top 5 Students */}
                {stats.topStudents.length > 0 && (
                    <Card style={{ marginBottom: 0 }}>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>emoji_events</span>
                                Top Students by CGPA
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.topStudents.map((s, i) => (
                                    <div key={s.usn} onClick={() => handleViewStudent(s.usn)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px', cursor: 'pointer', border: '1px solid var(--border)', transition: 'all 0.2s' }} className="gf-hover-lift">
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: i === 0 ? '#F59E0B' : i === 1 ? '#9CA3AF' : i === 2 ? '#B45309' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '12px', color: i < 3 ? 'white' : 'var(--tx-dim)', flexShrink: 0 }}>
                                            {i + 1}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{s.usn}</div>
                                        </div>
                                        <div style={{ fontWeight: 900, fontSize: '16px', color: s.cgpa >= 7.5 ? '#10B981' : s.cgpa >= 5 ? 'var(--tx-main)' : '#F59E0B' }}>{s.cgpa.toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Class pass rates */}
                {stats.classStats.length > 0 && (
                    <Card style={{ marginBottom: 0 }}>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>groups</span>
                                Class Pass Rates
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.classStats.map((cl, i) => (
                                    <div key={i} style={{ padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{cl.name}</div>
                                            <div style={{ fontSize: '12px', fontWeight: 700, color: cl.passRate >= 75 ? '#10B981' : cl.passRate != null ? '#F59E0B' : 'var(--tx-dim)' }}>
                                                {cl.passRate != null ? `${cl.passRate}%` : 'No data'}
                                            </div>
                                        </div>
                                        {cl.passRate != null && (
                                            <div style={{ height: '5px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${cl.passRate}%`, background: cl.passRate >= 75 ? '#10B981' : '#F59E0B', borderRadius: '4px', transition: 'width 1s ease' }} />
                                            </div>
                                        )}
                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '4px' }}>{cl.students} students</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* ── Overhauled Faculty-Subject Intelligence Section ─────────────── */}
            <Card style={{ marginBottom: 'var(--space-6)' }}>
                <CardHeader style={{ paddingBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
                        <div>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>school</span>
                                Faculty-Subject Performance Intelligence
                            </CardTitle>
                            <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                Real-time pass audit across courses, assigned instructors, and failure risk levels.
                            </div>
                        </div>

                        {/* Dual View Mode Buttons */}
                        <div style={{ display: 'flex', background: 'var(--surface-low)', padding: '3px', borderRadius: '10px', gap: '4px', border: '1px solid var(--border)' }}>
                            <button
                                onClick={() => setActiveView('subjects')}
                                style={c.tabBtn(activeView === 'subjects')}
                            >
                                <span className="material-icons-round" style={{ fontSize: '15px' }}>menu_book</span>
                                Subject View ({filteredSubjects.length})
                            </button>
                            <button
                                onClick={() => setActiveView('faculty')}
                                style={c.tabBtn(activeView === 'faculty')}
                            >
                                <span className="material-icons-round" style={{ fontSize: '15px' }}>badge</span>
                                Faculty View ({filteredFacultyWorkload.length})
                            </button>
                        </div>
                    </div>

                    {/* Search & Filter Toolbar */}
                    <div style={{
                        marginTop: '16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        background: 'var(--surface-low)',
                        padding: '14px',
                        borderRadius: '12px',
                        border: '1px solid var(--border)'
                    }}>
                        {/* Search Input + Dropdowns */}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                            <div style={{ flex: '1 1 260px', position: 'relative' }}>
                                <span className="material-icons-round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: 'var(--tx-dim)' }}>search</span>
                                <input
                                    type="text"
                                    placeholder="Search by code (e.g. BMATS101), subject name, or faculty..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px 9px 36px',
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        color: 'var(--tx-main)',
                                        outline: 'none'
                                    }}
                                />
                                {searchQuery && (
                                    <button
                                        onClick={() => setSearchQuery('')}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', color: 'var(--tx-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                                    </button>
                                )}
                            </div>

                            {/* Semester Dropdown */}
                            {availableSemesters.length > 0 && (
                                <div style={{ minWidth: '140px' }}>
                                    <select
                                        value={semFilter}
                                        onChange={(e) => setSemFilter(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '9px 12px',
                                            background: 'var(--surface)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: 'var(--tx-main)',
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="all">All Semesters</option>
                                        {availableSemesters.map(sem => (
                                            <option key={sem} value={sem}>Semester {sem}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Sort Order Dropdown */}
                            {activeView === 'subjects' && (
                                <div style={{ minWidth: '170px' }}>
                                    <select
                                        value={sortBy}
                                        onChange={(e) => setSortBy(e.target.value)}
                                        style={{
                                            width: '100%',
                                            padding: '9px 12px',
                                            background: 'var(--surface)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: 'var(--tx-main)',
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value="lowest_pass">Lowest Pass % (At-Risk First)</option>
                                        <option value="highest_pass">Highest Pass % First</option>
                                        <option value="most_students">Most Students First</option>
                                        <option value="code_asc">Subject Code (A–Z)</option>
                                    </select>
                                </div>
                            )}

                            {/* Page size dropdown */}
                            {activeView === 'subjects' && (
                                <div style={{ width: '105px' }}>
                                    <select
                                        value={pageSize}
                                        onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                                        style={{
                                            width: '100%',
                                            padding: '9px 10px',
                                            background: 'var(--surface)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            fontSize: '12px',
                                            fontWeight: 600,
                                            color: 'var(--tx-main)',
                                            outline: 'none',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <option value={10}>10 / page</option>
                                        <option value={25}>25 / page</option>
                                        <option value={50}>50 / page</option>
                                        <option value="all">Show All</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        {/* Performance Tier Pills (in Subject View) */}
                        {activeView === 'subjects' && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Filter By Health:</span>
                                <button
                                    onClick={() => setStatusFilter('all')}
                                    style={c.filterPill(statusFilter === 'all')}
                                >
                                    All Courses ({subjectCounts.all})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('critical')}
                                    style={c.filterPill(statusFilter === 'critical', 'danger')}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>error_outline</span>
                                    Critical &lt; 60% ({subjectCounts.critical})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('average')}
                                    style={c.filterPill(statusFilter === 'average', 'warning')}
                                >
                                    Average 60–79% ({subjectCounts.average})
                                </button>
                                <button
                                    onClick={() => setStatusFilter('high')}
                                    style={c.filterPill(statusFilter === 'high', 'success')}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>check_circle</span>
                                    High Performing &ge; 80% ({subjectCounts.high})
                                </button>
                            </div>
                        )}
                    </div>
                </CardHeader>

                <CardContent>
                    {/* ── SUBJECT VIEW: Modern Cards with Pagination ── */}
                    {activeView === 'subjects' && (
                        <div>
                            {filteredSubjects.length === 0 ? (
                                <div style={{ ...c.emptyState, padding: '36px 20px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.4, display: 'block' }}>search_off</span>
                                    <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>No matching subjects found</div>
                                    <p style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                        Try adjusting your search keywords or clearing active filters.
                                    </p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {paginatedSubjects.map((sub) => {
                                        const passRate = sub.passRate ?? 0;
                                        const isCritical = passRate < 60;
                                        const isAverage = passRate >= 60 && passRate < 80;
                                        const accentColor = isCritical ? '#EF4444' : isAverage ? '#F59E0B' : '#10B981';
                                        const statusLabel = isCritical ? 'Critical' : isAverage ? 'Moderate' : 'Strong';

                                        return (
                                            <div
                                                key={sub.code}
                                                style={{
                                                    padding: '14px 18px',
                                                    background: 'var(--surface)',
                                                    borderRadius: '12px',
                                                    border: `1px solid ${isCritical ? 'rgba(239, 68, 68, 0.25)' : 'var(--border)'}`,
                                                    transition: 'transform 0.15s ease, border-color 0.15s ease',
                                                    boxShadow: isCritical ? '0 2px 8px rgba(239, 68, 68, 0.05)' : 'none'
                                                }}
                                                className="gf-hover-lift"
                                            >
                                                {/* Card Header Row */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '14px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                                    <div style={{ flex: '1 1 320px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                            <span style={{
                                                                fontFamily: 'monospace',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                color: 'var(--tx-main)',
                                                                background: 'var(--surface-low)',
                                                                border: '1px solid var(--border)',
                                                                padding: '2px 7px',
                                                                borderRadius: '6px'
                                                            }}>
                                                                {sub.code}
                                                            </span>
                                                            {sub.semester && (
                                                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)', background: 'var(--surface-low)', padding: '2px 6px', borderRadius: '4px' }}>
                                                                    Sem {sub.semester}
                                                                </span>
                                                            )}
                                                            {sub.branch && (
                                                                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)', background: 'var(--surface-low)', padding: '2px 6px', borderRadius: '4px' }}>
                                                                    {sub.branch}
                                                                </span>
                                                            )}
                                                            {/* Faculty Attribution Chip */}
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                fontSize: '10px',
                                                                fontWeight: 700,
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                background: sub.facultyName !== 'Unassigned' ? 'rgba(99, 102, 241, 0.12)' : 'var(--surface-low)',
                                                                color: sub.facultyName !== 'Unassigned' ? '#6366F1' : 'var(--tx-dim)',
                                                                border: `1px solid ${sub.facultyName !== 'Unassigned' ? 'rgba(99, 102, 241, 0.3)' : 'var(--border)'}`
                                                            }}>
                                                                <span className="material-icons-round" style={{ fontSize: '12px' }}>
                                                                    {sub.facultyName !== 'Unassigned' ? 'person' : 'person_outline'}
                                                                </span>
                                                                {sub.facultyName}
                                                            </span>
                                                        </div>

                                                        {/* Subject Title */}
                                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', lineHeight: 1.4 }}>
                                                            {sub.name}
                                                        </div>
                                                    </div>

                                                    {/* Pass % Badge + Status */}
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <span style={{
                                                                fontSize: '10px',
                                                                fontWeight: 800,
                                                                textTransform: 'uppercase',
                                                                padding: '2px 6px',
                                                                borderRadius: '4px',
                                                                background: `${accentColor}15`,
                                                                color: accentColor
                                                            }}>
                                                                {statusLabel}
                                                            </span>
                                                            <span style={{ fontSize: '18px', fontWeight: 900, color: accentColor }}>
                                                                {passRate.toFixed(1)}%
                                                            </span>
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px', fontWeight: 600 }}>
                                                            {sub.passed} / {sub.total} students passed
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Progress Bar */}
                                                <div style={{ height: '6px', background: 'var(--surface-low)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                                    <div
                                                        style={{
                                                            height: '100%',
                                                            width: `${Math.min(100, Math.max(0, passRate))}%`,
                                                            background: accentColor,
                                                            borderRadius: '6px',
                                                            transition: 'width 0.8s ease'
                                                        }}
                                                    />
                                                </div>

                                                {/* Bottom Metric Pills */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px', fontSize: '11px', color: 'var(--tx-dim)' }}>
                                                    <span>Backlogs: <strong style={{ color: sub.failed > 0 ? '#EF4444' : 'inherit' }}>{sub.failed}</strong></span>
                                                    {sub.avgMarks != null && <span>Avg Marks: <strong style={{ color: 'var(--tx-main)' }}>{sub.avgMarks}/100</strong></span>}
                                                    {sub.highestMarks != null && <span>Highest: <strong style={{ color: '#10B981' }}>{sub.highestMarks}</strong></span>}
                                                    {sub.lowestMarks != null && <span>Lowest: <strong style={{ color: '#EF4444' }}>{sub.lowestMarks}</strong></span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Pagination Controls */}
                            {pageSize !== 'all' && totalPages > 1 && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', flexWrap: 'wrap', gap: '12px' }}>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                        Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filteredSubjects.length)} of {filteredSubjects.length} subjects
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <button
                                            disabled={currentPage === 1}
                                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                color: currentPage === 1 ? 'var(--tx-dim)' : 'var(--tx-main)',
                                                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '16px' }}>chevron_left</span>
                                            Prev
                                        </button>

                                        <div style={{ fontSize: '12px', fontWeight: 800, padding: '0 8px', color: 'var(--tx-main)' }}>
                                            {currentPage} / {totalPages}
                                        </div>

                                        <button
                                            disabled={currentPage === totalPages}
                                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                            style={{
                                                padding: '6px 12px',
                                                borderRadius: '8px',
                                                fontSize: '12px',
                                                fontWeight: 700,
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                color: currentPage === totalPages ? 'var(--tx-dim)' : 'var(--tx-main)',
                                                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px'
                                            }}
                                        >
                                            Next
                                            <span className="material-icons-round" style={{ fontSize: '16px' }}>chevron_right</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── FACULTY VIEW: Grouped by Instructor Workload ── */}
                    {activeView === 'faculty' && (
                        <div>
                            {filteredFacultyWorkload.length === 0 ? (
                                <div style={{ ...c.emptyState, padding: '36px 20px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '32px', marginBottom: '8px', opacity: 0.4, display: 'block' }}>badge</span>
                                    <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>No faculty workload records match your criteria</div>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                    {filteredFacultyWorkload.map((f, i) => {
                                        const isUnassigned = f.facultyName === 'Unassigned';
                                        const passRate = f.avgPassRate ?? 0;
                                        const rateColor = passRate >= 80 ? '#10B981' : passRate >= 60 ? '#F59E0B' : '#EF4444';

                                        return (
                                            <div
                                                key={f.facultyName}
                                                style={{
                                                    padding: '16px 20px',
                                                    background: 'var(--surface)',
                                                    borderRadius: '14px',
                                                    border: '1px solid var(--border)',
                                                }}
                                            >
                                                {/* Faculty Header Card */}
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{
                                                            width: '40px',
                                                            height: '40px',
                                                            borderRadius: '10px',
                                                            background: isUnassigned ? 'var(--surface-low)' : 'rgba(99, 102, 241, 0.15)',
                                                            color: isUnassigned ? 'var(--tx-dim)' : 'var(--primary)',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontWeight: 900,
                                                            fontSize: '16px'
                                                        }}>
                                                            {isUnassigned ? '?' : f.facultyName[0]}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 900, fontSize: '15px', color: 'var(--tx-main)' }}>
                                                                {f.facultyName}
                                                            </div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                                                {f.department ? `${f.department.toUpperCase()} • ` : ''}
                                                                {f.subjectCount} subject{f.subjectCount !== 1 ? 's' : ''} handled • {f.totalStudents} total student entries
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Aggregate Pass Rate */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--surface-low)', padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                                        <div style={{ textAlign: 'right' }}>
                                                            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Aggregate Pass</div>
                                                            <div style={{ fontSize: '16px', fontWeight: 900, color: rateColor }}>{passRate.toFixed(1)}%</div>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Nested Subjects list */}
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '10px' }}>
                                                    {f.subjects.map(s => {
                                                        const sp = s.passRate ?? 0;
                                                        const sColor = sp >= 80 ? '#10B981' : sp >= 60 ? '#F59E0B' : '#EF4444';
                                                        return (
                                                            <div
                                                                key={s.code}
                                                                style={{
                                                                    padding: '10px 12px',
                                                                    background: 'var(--surface-low)',
                                                                    borderRadius: '8px',
                                                                    border: '1px solid var(--border)',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                    <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)' }}>{s.code}</span>
                                                                    <span style={{ fontSize: '13px', fontWeight: 900, color: sColor }}>{sp}%</span>
                                                                </div>
                                                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {s.name}
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                                                    <span>{s.passed}/{s.total} passed</span>
                                                                    {s.avgMarks != null && <span>Avg: {s.avgMarks}</span>}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Recent Activity */}
            {activity.length > 0 && (
                <Card style={{ marginBottom: 0 }}>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>history</span>
                            Your Recent Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {activity.filter(a => a.target_usn).map((a, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>
                                            {a.action_type?.includes('FETCH') ? 'sync' : a.action_type?.includes('TRANSFER') ? 'swap_horiz' : a.action_type?.includes('REMOVE') ? 'remove_circle' : 'visibility'}
                                        </span>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{a.target_usn}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', background: 'var(--border)', padding: '2px 6px', borderRadius: '4px' }}>{a.action_type}</div>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                        {new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default function ReportsPage() {
    return (
        <AuthGuard role="faculty">
            <ReportsContent />
        </AuthGuard>
    );
}
