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

function ChartSkeleton() {
    const heights = ['44%', '68%', '52%', '82%', '62%', '38%'];
    return (
        <div className={styles.chartSkeleton} aria-hidden="true">
            {heights.map((height, index) => (
                <Skeleton key={height} height={height} radius="8px" aria-label={`Chart placeholder ${index + 1}`} />
            ))}
        </div>
    );
}

function InsightPanel({ label, title, description, loading, error, isEmpty, onRetry, children }) {
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

function getAllStudents(studentsByClass) {
    return studentsByClass.flatMap(entry => entry.students || []);
}

const CustomTooltip = ({ active, payload, label }) => {
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
// Charts
// ---------------------------------------------------------------------------

export function CgpaDistributionChart({ analytics, classes, studentsByClass, loading, error, isEmpty, onRetry }) {
    const data = useMemo(() => {
        if (analytics?.cgpa_distribution) {
            const dist = analytics.cgpa_distribution;
            return [
                { name: '< 6', Students: Number(dist.below6 || 0) },
                { name: '6-7', Students: Number(dist['6-7'] || 0) },
                { name: '7-8', Students: Number(dist['7-8'] || 0) },
                { name: '8-9', Students: Number(dist['8-9'] || 0) },
                { name: '9+', Students: Number(dist['9-10'] || 0) },
            ].filter(row => row.Students > 0);
        }

        if (!studentsByClass.length) return [];
        const students = getAllStudents(studentsByClass);
        const bins = [
            { name: '< 5', Students: 0 },
            { name: '5-6', Students: 0 },
            { name: '6-7', Students: 0 },
            { name: '7-8', Students: 0 },
            { name: '8-9', Students: 0 },
            { name: '9+', Students: 0 },
        ];
        
        let hasData = false;
        students.forEach(s => {
            const cgpa = Number(s.cgpa);
            if (Number.isFinite(cgpa)) {
                hasData = true;
                if (cgpa < 5) bins[0].Students++;
                else if (cgpa < 6) bins[1].Students++;
                else if (cgpa < 7) bins[2].Students++;
                else if (cgpa < 8) bins[3].Students++;
                else if (cgpa < 9) bins[4].Students++;
                else bins[5].Students++;
            }
        });
        return hasData ? bins : [];
    }, [analytics, studentsByClass]);

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

export function ReadinessSummaryChart({ analytics, classes, studentsByClass, loading, error, isEmpty, onRetry }) {
    const data = useMemo(() => {
        if (analytics?.kpis) {
            const complete = Number(analytics.kpis.total_students || 0) - Number(analytics.kpis.students_without_cgpa || 0);
            const missingCgpa = Number(analytics.kpis.students_without_cgpa || 0);
            const emptyClasses = Number(analytics.kpis.empty_classes || 0);

            const results = [];
            if (complete > 0) results.push({ name: 'Complete Profile', value: complete, color: 'var(--success)' });
            if (missingCgpa > 0) results.push({ name: 'Missing CGPA', value: missingCgpa, color: 'var(--warm-highlight)' });
            if (emptyClasses > 0) results.push({ name: 'Empty Classes', value: emptyClasses, color: 'var(--destructive)' });

            return results;
        }

        if (!studentsByClass.length) return [];
        const students = getAllStudents(studentsByClass);
        if (students.length === 0) return [];
        
        let complete = 0;
        let missingCgpa = 0;
        
        students.forEach(s => {
            if (Number.isFinite(Number(s.cgpa))) complete++;
            else missingCgpa++;
        });

        // Compute empty classes
        const classCounts = new Map(studentsByClass.map(entry => [entry.classId, entry.students?.length || 0]));
        let emptyClasses = classes.filter(cls => {
            const count = classCounts.get(cls.id);
            return count === 0 || Number(cls.student_count || 0) === 0;
        }).length;

        const results = [];
        if (complete > 0) results.push({ name: 'Complete Profile', value: complete, color: 'var(--success)' });
        if (missingCgpa > 0) results.push({ name: 'Missing CGPA', value: missingCgpa, color: 'var(--warm-highlight)' });
        if (emptyClasses > 0) results.push({ name: 'Empty Classes', value: emptyClasses, color: 'var(--destructive)' });
        
        return results;
    }, [analytics, classes, studentsByClass]);

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

export function BacklogDistributionChart({ analytics, classes, studentsByClass, loading, error, isEmpty, onRetry }) {
    const data = useMemo(() => {
        if (analytics?.backlog_distribution) {
            const dist = analytics.backlog_distribution;
            return [
                { name: '0 Backlogs', Students: Number(dist.clear || 0) },
                { name: '1-2 Backlogs', Students: Number(dist['1-2'] || 0) },
                { name: '3-5 Backlogs', Students: Number(dist['3-5'] || 0) },
                { name: '6+ Backlogs', Students: Number(dist['6plus'] || 0) },
            ].filter(row => row.Students > 0);
        }

        if (!studentsByClass.length) return [];
        const students = getAllStudents(studentsByClass);
        const bins = [
            { name: '0 Backlogs', Students: 0 },
            { name: '1 Backlog', Students: 0 },
            { name: '2 Backlogs', Students: 0 },
            { name: '3+ Backlogs', Students: 0 },
        ];
        
        let hasData = false;
        students.forEach(s => {
            hasData = true;
            const b = Number(s.total_backlogs || 0);
            if (b === 0) bins[0].Students++;
            else if (b === 1) bins[1].Students++;
            else if (b === 2) bins[2].Students++;
            else bins[3].Students++;
        });
        return hasData ? bins : [];
    }, [analytics, studentsByClass]);

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

export function BranchPerformanceChart({ analytics, classes, studentsByClass, loading, error, isEmpty, onRetry }) {
    const data = useMemo(() => {
        if (analytics?.branch_distribution) {
            return Object.entries(analytics.branch_distribution)
                .map(([branch, count]) => ({ name: branch, Students: Number(count || 0) }))
                .filter(row => row.Students > 0)
                .sort((a, b) => b.Students - a.Students);
        }

        if (!studentsByClass.length) return [];
        const students = getAllStudents(studentsByClass);
        const branchMap = new Map();
        
        students.forEach(s => {
            const cgpa = Number(s.cgpa);
            if (Number.isFinite(cgpa) && s.branch && s.branch !== '—') {
                const b = s.branch;
                if (!branchMap.has(b)) branchMap.set(b, { sum: 0, count: 0 });
                branchMap.get(b).sum += cgpa;
                branchMap.get(b).count++;
            }
        });
        
        const results = Array.from(branchMap.entries()).map(([branch, stats]) => ({
            name: branch,
            'Avg CGPA': Number((stats.sum / stats.count).toFixed(2))
        }));

        return results.sort((a, b) => b['Avg CGPA'] - a['Avg CGPA']);
    }, [analytics, studentsByClass]);

    return (
        <InsightPanel
            label="Comparative Analysis"
            title="Branch Performance"
            description="Average CGPA aggregated by engineering branch."
            loading={loading}
            error={error}
            isEmpty={isEmpty || data.length === 0}
            onRetry={onRetry}
        >
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--border)" />
                    <XAxis type="number" domain={analytics?.branch_distribution ? undefined : [0, 10]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} />
                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'var(--tx-muted)' }} width={80} />
                    <RechartsTooltip content={<CustomTooltip />} cursor={{ fill: 'var(--surface-hover)' }} />
                    <Bar dataKey={analytics?.branch_distribution ? 'Students' : 'Avg CGPA'} fill="var(--accent)" radius={[0, 4, 4, 0]} isAnimationActive={false} />
                </BarChart>
            </ResponsiveContainer>
        </InsightPanel>
    );
}
