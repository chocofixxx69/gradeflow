'use client';

import { Fragment, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Button, EmptyState, ResponsiveGrid } from '../../../components/ui';
import adminStyles from './AdminAnalytics.module.css';
import styles from './AnalyticsTable.module.css';
import { SkeletonRows } from './AnalyticsShared';
import { InsightPanel, CustomTooltip } from './AcademicInsights';

function KpiStrip({ backlogs, loading }) {
    if (loading) {
        return (
            <ResponsiveGrid className={adminStyles.kpiGrid} size="sm">
                {['Total Backlogs', 'Students With Backlogs'].map(label => (
                    <article className={adminStyles.kpiCard} key={label}>
                        <div className={adminStyles.kpiLabel}>{label}</div>
                    </article>
                ))}
            </ResponsiveGrid>
        );
    }

    return (
        <ResponsiveGrid className={adminStyles.kpiGrid} size="sm">
            <article className={adminStyles.kpiCard}>
                <div className={adminStyles.kpiLabel}>Total Backlogs</div>
                <div className={adminStyles.kpiValue}>{backlogs?.total_backlogs ?? 0}</div>
                <div className={adminStyles.kpiMeta}>Across current filter scope</div>
            </article>
            <article className={adminStyles.kpiCard}>
                <div className={adminStyles.kpiLabel}>Students With Backlogs</div>
                <div className={adminStyles.kpiValue}>{backlogs?.students_with_backlogs ?? 0}</div>
                <div className={adminStyles.kpiMeta}>Needs attention</div>
            </article>
        </ResponsiveGrid>
    );
}

function BranchBacklogChart({ backlogs, loading, error, onRetry }) {
    const data = useMemo(() => {
        const dist = backlogs?.branch_backlogs;
        if (!dist) return [];
        return Object.entries(dist).map(([branch, count]) => ({ name: branch, Backlogs: Number(count || 0) })).filter(r => r.Backlogs > 0);
    }, [backlogs]);

    return (
        <InsightPanel
            label="Risk Analysis"
            title="Backlogs by Branch"
            description="Total backlog count aggregated by engineering branch."
            loading={loading}
            error={error}
            isEmpty={data.length === 0}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey="Backlogs" fill="var(--destructive)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </InsightPanel>
    );
}

function SemesterBacklogChart({ backlogs, loading, error, onRetry }) {
    const data = useMemo(() => {
        const dist = backlogs?.semester_backlogs;
        if (!dist) return [];
        return Object.entries(dist).map(([sem, count]) => ({ name: `Sem ${sem}`, Backlogs: Number(count || 0) })).filter(r => r.Backlogs > 0);
    }, [backlogs]);

    return (
        <InsightPanel
            label="Risk Analysis"
            title="Backlogs by Semester"
            description="Total backlog count aggregated by semester."
            loading={loading}
            error={error}
            isEmpty={data.length === 0}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey="Backlogs" fill="var(--secondary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </InsightPanel>
    );
}

function StudentBacklogTable({ rows, loading, error, onRetry }) {
    const [expanded, setExpanded] = useState(new Set());

    function toggle(usn) {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(usn)) next.delete(usn); else next.add(usn);
            return next;
        });
    }

    return (
        <section className={styles.section} aria-busy={loading}>
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Backlog Intelligence</div>
                    <h2 className={styles.sectionTitle}>Students With Backlogs</h2>
                    <p className={styles.sectionDesc}>Every student carrying at least one active backlog, with failed subjects on expand.</p>
                </div>
                {!loading && !error && rows.length > 0 && (
                    <div className={styles.headerMeta}><span className={styles.rowCount}>{rows.length} students</span></div>
                )}
            </div>
            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} role="status">
                        <table className={styles.table}>
                            <thead><tr className={styles.headerRow}>{['Student', 'Branch / Sem', 'Backlogs', 'Max/Sem', ''].map(h => <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>)}</tr></thead>
                            <tbody><SkeletonRows columns={['double', '50%', '30%', '30%', '20%']} count={5} /></tbody>
                        </table>
                    </div>
                )}
                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true"><span className="material-icons-round">warning</span></div>
                        <h3 className={styles.errorTitle}>Backlog data unavailable</h3>
                        <p className={styles.errorText}>{error}</p>
                        <div className={styles.errorActions}><Button variant="secondary" size="sm" iconStart="refresh" onClick={onRetry}>Retry</Button></div>
                    </div>
                )}
                {!loading && !error && rows.length === 0 && (
                    <EmptyState variant="inline" density="compact" icon="verified" title="No students with backlogs" description="Every student in the current filter scope is clear." />
                )}
                {!loading && !error && rows.length > 0 && (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead><tr className={styles.headerRow}>{['Student', 'Branch / Sem', 'Backlogs', 'Max/Sem', ''].map(h => <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>)}</tr></thead>
                            <tbody>
                                {rows.map(row => {
                                    const isExpanded = expanded.has(row.usn);
                                    return (
                                        <Fragment key={row.usn}>
                                            <tr className={styles.dataRow}>
                                                <td>
                                                    <span className={styles.studentName}>{row.name}</span>
                                                    <span className={styles.studentUsn}>{row.usn}</span>
                                                </td>
                                                <td><span className={styles.metaText}>{row.branch} / Sem {row.semester}</span></td>
                                                <td><span className={styles.backlogText}>{row.total_backlogs}</span></td>
                                                <td><span className={styles.countText}>{row.max_semester_backlogs}</span></td>
                                                <td>
                                                    {row.failed_subjects?.length > 0 && (
                                                        <button type="button" className={styles.sortBtn} onClick={() => toggle(row.usn)} aria-expanded={isExpanded}>
                                                            {isExpanded ? 'Hide' : 'Subjects'}
                                                            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: 14 }}>{isExpanded ? 'expand_less' : 'expand_more'}</span>
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                            {isExpanded && row.failed_subjects?.length > 0 && (
                                                <tr className={styles.dataRow}>
                                                    <td colSpan={5}>
                                                        <div className={styles.metaText}>
                                                            {row.failed_subjects.map(s => `${s.subject_code} (Sem ${s.semester}, ${s.grade || '—'})`).join(', ')}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

function SubjectBacklogTable({ rows, loading, error, onRetry }) {
    return (
        <section className={styles.section} aria-busy={loading}>
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Backlog Intelligence</div>
                    <h2 className={styles.sectionTitle}>Backlogs by Subject</h2>
                    <p className={styles.sectionDesc}>Subjects sorted by total backlog count in the current filter scope.</p>
                </div>
            </div>
            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} role="status">
                        <table className={styles.table}>
                            <thead><tr className={styles.headerRow}>{['Subject', 'Backlog Count'].map(h => <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>)}</tr></thead>
                            <tbody><SkeletonRows columns={['double', '30%']} count={5} /></tbody>
                        </table>
                    </div>
                )}
                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true"><span className="material-icons-round">warning</span></div>
                        <h3 className={styles.errorTitle}>Backlog data unavailable</h3>
                        <p className={styles.errorText}>{error}</p>
                        <div className={styles.errorActions}><Button variant="secondary" size="sm" iconStart="refresh" onClick={onRetry}>Retry</Button></div>
                    </div>
                )}
                {!loading && !error && rows.length === 0 && (
                    <EmptyState variant="inline" density="compact" icon="verified" title="No subject backlogs" description="No subjects carry backlogs in the current filter scope." />
                )}
                {!loading && !error && rows.length > 0 && (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead><tr className={styles.headerRow}>{['Subject', 'Backlog Count'].map(h => <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>)}</tr></thead>
                            <tbody>
                                {rows.map(row => (
                                    <tr key={row.subject_code} className={styles.dataRow}>
                                        <td>
                                            <span className={styles.className}>{row.subject_code}</span>
                                            <div className={styles.metaText}>{row.subject_name}</div>
                                        </td>
                                        <td><span className={styles.backlogText}>{row.backlog_count}</span></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

export function BacklogIntelligence({ backlogs, loading, error, isEmpty, onRetry }) {
    const studentRows = backlogs?.student_backlogs || [];
    const subjectRows = backlogs?.subject_backlogs || [];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <KpiStrip backlogs={backlogs} loading={loading} />
            <div className={adminStyles.wideGrid}>
                <BranchBacklogChart backlogs={backlogs} loading={loading} error={error} onRetry={onRetry} />
                <SemesterBacklogChart backlogs={backlogs} loading={loading} error={error} onRetry={onRetry} />
            </div>
            <StudentBacklogTable rows={studentRows} loading={loading} error={error} onRetry={onRetry} />
            <SubjectBacklogTable rows={subjectRows} loading={loading} error={error} onRetry={onRetry} />
        </div>
    );
}
