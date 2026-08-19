'use client';

import { useMemo } from 'react';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell
} from 'recharts';
import { Button, EmptyState, Skeleton } from '../../../components/ui';
import styles from './AdminAnalytics.module.css';

// ---------------------------------------------------------------------------
// Shell / Wrapper Component
// ---------------------------------------------------------------------------

export function ChartSkeleton() {
    const heights = ['44%', '68%', '52%', '82%', '62%', '38%'];
    return (
        <div className={styles.chartSkeleton} aria-hidden="true">
            {heights.map((height, index) => (
                <Skeleton key={height} height={height} radius="8px" aria-label={`Chart placeholder ${index + 1}`} />
            ))}
        </div>
    );
}

export function InsightPanel({ label, title, description, loading, error, isEmpty, onRetry, children }) {
    return (
        <section className={styles.panel} aria-labelledby={`${title.replaceAll(' ', '-').toLowerCase()}-title`}>
            <div className={styles.panelHeader}>
                <div>
                    <div className={styles.sectionLabel}>{label}</div>
                    <h2 id={`${title.replaceAll(' ', '-').toLowerCase()}-title`} className={styles.sectionTitle}>{title}</h2>
                    <p className={styles.sectionDescription}>{description}</p>
                </div>
            </div>
            <div className={styles.panelBody}>
                {loading ? (
                    <ChartSkeleton />
                ) : error ? (
                    <div className={styles.errorState} role="alert" style={{ minHeight: '188px' }}>
                        <div className={styles.errorIcon} aria-hidden="true" style={{ margin: '0 auto 16px' }}>
                            <span className="material-icons-round">warning</span>
                        </div>
                        <h3 className={styles.errorTitle} style={{ textAlign: 'center' }}>Data unavailable</h3>
                        <div className={styles.stateActions} style={{ justifyContent: 'center' }}>
                            <Button variant="secondary" size="sm" iconStart="refresh" onClick={onRetry}>Retry</Button>
                        </div>
                    </div>
                ) : isEmpty ? (
                    <EmptyState
                        variant="inline"
                        density="compact"
                        icon="bar_chart"
                        title="Not enough data"
                        description="Add students to see this chart."
                    />
                ) : (
                    <div style={{ width: '100%', height: 240, paddingTop: 16 }}>
                        {children}
                    </div>
                )}
            </div>
        </section>
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                padding: '8px 12px',
                borderRadius: '6px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                fontSize: '13px',
                color: 'var(--tx-main)',
                fontWeight: 600
            }}>
                <div style={{ color: 'var(--tx-muted)', marginBottom: '4px', fontSize: '11px', textTransform: 'uppercase' }}>{label}</div>
                {payload.map((entry, index) => (
                    <div key={index} style={{ color: entry.color }}>
                        {entry.name}: {entry.value}
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

// ---------------------------------------------------------------------------
// Charts — every dataset below is rendered exactly as returned by the
// backend; there is no client-side aggregation or fallback computation.
// ---------------------------------------------------------------------------

export function CgpaDistributionChart({ analytics, loading, error, isEmpty, onRetry }) {
    const data = useMemo(() => {
        const dist = analytics?.cgpa_distribution;
        if (!dist) return [];
        return [
            { name: '< 6', Students: Number(dist.below6 || 0) },
            { name: '6-7', Students: Number(dist['6-7'] || 0) },
            { name: '7-8', Students: Number(dist['7-8'] || 0) },
            { name: '8-9', Students: Number(dist['8-9'] || 0) },
            { name: '9+', Students: Number(dist['9-10'] || 0) },
        ].filter(row => row.Students > 0);
    }, [analytics]);

    return (
        <InsightPanel
            label="Academic Performance"
            title="CGPA Distribution"
            description="Histogram of valid CGPA records across all classes."
            loading={loading}
            error={error}
            isEmpty={isEmpty || data.length === 0}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey="Students" fill="var(--primary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </InsightPanel>
    );
}

export function ReadinessSummaryChart({ analytics, loading, error, isEmpty, onRetry }) {
    const data = useMemo(() => {
        const kpis = analytics?.kpis;
        if (!kpis) return [];

        const complete = Number(kpis.total_students || 0) - Number(kpis.students_without_cgpa || 0);
        const missingCgpa = Number(kpis.students_without_cgpa || 0);
        const emptyClasses = Number(kpis.empty_classes || 0);

        const results = [];
        if (complete > 0) results.push({ name: 'Complete Profile', value: complete, color: 'var(--success)' });
        if (missingCgpa > 0) results.push({ name: 'Missing CGPA', value: missingCgpa, color: 'var(--warm-highlight)' });
        if (emptyClasses > 0) results.push({ name: 'Empty Classes', value: emptyClasses, color: 'var(--destructive)' });

        return results;
    }, [analytics]);

    return (
        <InsightPanel
            label="Data Quality"
            title="Readiness Summary"
            description="Overview of missing records and empty classes."
            loading={loading}
            error={error}
            isEmpty={isEmpty || data.length === 0}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                    <Pie
                        data={data}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="value"
                        isAnimationActive={false}
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                </PieChart>
            </ResponsiveContainer>
        </InsightPanel>
    );
}

export function BacklogDistributionChart({ analytics, loading, error, isEmpty, onRetry }) {
    const data = useMemo(() => {
        const dist = analytics?.backlog_distribution;
        if (!dist) return [];
        return [
            { name: '0 Backlogs', Students: Number(dist.clear || 0) },
            { name: '1-2 Backlogs', Students: Number(dist['1-2'] || 0) },
            { name: '3-5 Backlogs', Students: Number(dist['3-5'] || 0) },
            { name: '6+ Backlogs', Students: Number(dist['6plus'] || 0) },
        ].filter(row => row.Students > 0);
    }, [analytics]);

    return (
        <InsightPanel
            label="Risk Analysis"
            title="Backlog Distribution"
            description="Cohort breakdown by number of active backlogs."
            loading={loading}
            error={error}
            isEmpty={isEmpty || data.length === 0}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey="Students" fill="var(--secondary)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </InsightPanel>
    );
}

export function BranchPerformanceChart({ analytics, loading, error, isEmpty, onRetry }) {
    const data = useMemo(() => {
        const dist = analytics?.branch_distribution;
        if (!dist) return [];
        return Object.entries(dist)
            .map(([branch, count]) => ({ name: branch, Students: Number(count || 0) }))
            .filter(row => row.Students > 0)
            .sort((a, b) => b.Students - a.Students);
    }, [analytics]);

    return (
        <InsightPanel
            label="Comparative Analysis"
            title="Branch Performance"
            description="Student count aggregated by engineering branch."
            loading={loading}
            error={error}
            isEmpty={isEmpty || data.length === 0}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} width={80} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey="Students" fill="var(--accent)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </InsightPanel>
    );
}
