'use client';

import { useEffect, useState } from 'react';
import {
    Button,
    EmptyState,
    Inline,
    ResponsiveGrid,
    Skeleton,
} from '../../../components/ui';
import styles from './AdminAnalytics.module.css';
import { ClassIntelligence } from './ClassIntelligence';
import { StudentIntelligence } from './StudentIntelligence';
import {
    CgpaDistributionChart,
    ReadinessSummaryChart,
    BacklogDistributionChart,
    BranchPerformanceChart
} from './AcademicInsights';
import { useAdminAnalytics } from './useAdminAnalytics';
import { useAdminRisk } from './useAdminRisk';
import { useAnalyticsFiltersContext } from './AnalyticsFiltersContext';
import { exportAdminAnalytics } from '../../../lib/api/analytics';

const EXPORT_FORMATS = [
    { format: 'csv', label: 'CSV', filename: 'gradeflow-analytics.csv' },
    { format: 'excel', label: 'Excel', filename: 'gradeflow-analytics.xlsx' },
    { format: 'pdf', label: 'PDF', filename: 'gradeflow-result-analysis.pdf' },
];

function PrintHeader({ filters }) {
    return (
        <div className={styles.printOnlyHeader}>
            <div className={styles.printLogo}>Institutional Intelligence Report</div>
            <div className={styles.printMeta}>Generated On: {new Date().toLocaleString()}</div>
            <div className={styles.printMeta}>
                Active Filters: Branch: {filters.branch}, Semester: {filters.semester}, Class: {filters.classId}
            </div>
            <hr className={styles.printDivider} />
        </div>
    );
}

function PageHeader({ onRefresh, refreshing, exportingFormat, onExport, onPrint }) {
    return (
        <header className={styles.header}>
            <div>
                <div className={styles.eyebrow}>Institutional Intelligence</div>
                <h1 className={styles.title}>Admin Analytics</h1>
                <p className={styles.subtitle}>
                    Academic performance, class readiness, student risk, and data quality consolidated here for administrative review.
                </p>
            </div>
            <Inline className={styles.headerActions} stackMobile aria-label="Analytics actions">
                <Button variant="secondary" iconStart="refresh" loading={refreshing} onClick={onRefresh}>
                    {refreshing ? 'Refreshing' : 'Refresh'}
                </Button>
                {EXPORT_FORMATS.map(({ format, label }) => (
                    <Button
                        key={format}
                        variant="ghost"
                        iconStart="download"
                        loading={exportingFormat === format}
                        onClick={() => onExport(format)}
                    >
                        {label}
                    </Button>
                ))}
                <Button variant="ghost" iconStart="print" onClick={onPrint}>Print Report</Button>
            </Inline>
        </header>
    );
}

function KpiLoadingGrid() {
    const placeholders = ['Total Classes', 'Enrolled Students', 'Average CGPA', 'Backlog Students', 'Data Coverage', 'Empty Classes'];

    return (
        <section aria-labelledby="analytics-kpi-title" aria-busy="true">
            <h2 id="analytics-kpi-title" className={styles.sectionLabel}>Overview KPIs</h2>
            <ResponsiveGrid className={styles.kpiGrid} size="sm">
                {placeholders.map(label => (
                    <article className={styles.kpiCard} key={label} aria-label={`${label}: loading`}>
                        <div className={styles.kpiLabel}>{label}</div>
                        <Skeleton width="56%" height="34px" />
                        <Skeleton width="72%" height="12px" />
                    </article>
                ))}
            </ResponsiveGrid>
        </section>
    );
}

function KpiEmptyState() {
    return (
        <section aria-labelledby="analytics-kpi-title">
            <h2 id="analytics-kpi-title" className={styles.sectionLabel}>Overview KPIs</h2>
            <EmptyState
                className={styles.kpiState}
                density="compact"
                icon="analytics"
                title="No analytics data yet"
                description="Create classes and add students to start populating administrative metrics."
            />
        </section>
    );
}

function KpiErrorState({ message, onRetry }) {
    return (
        <section aria-labelledby="analytics-kpi-title">
            <h2 id="analytics-kpi-title" className={styles.sectionLabel}>Overview KPIs</h2>
            <div className={styles.kpiState}>
                <div className={styles.errorState} role="alert">
                    <div className={styles.errorIcon} aria-hidden="true">
                        <span className="material-icons-round">warning</span>
                    </div>
                    <h2 className={styles.errorTitle}>Analytics metrics unavailable</h2>
                    <p className={styles.errorText}>{message}</p>
                    <div className={styles.stateActions}>
                        <Button variant="secondary" size="sm" iconStart="refresh" onClick={onRetry}>Retry</Button>
                    </div>
                </div>
            </div>
        </section>
    );
}

function KpiGrid({ error, isEmpty, loading, metrics, onRetry }) {
    if (loading) return <KpiLoadingGrid />;
    if (error) return <KpiErrorState message={error} onRetry={onRetry} />;
    if (isEmpty) return <KpiEmptyState />;

    return (
        <section aria-labelledby="analytics-kpi-title">
            <h2 id="analytics-kpi-title" className={styles.sectionLabel}>Overview KPIs</h2>
            <ResponsiveGrid className={styles.kpiGrid} size="sm">
                {metrics.map(({ key, label, value, meta }) => (
                    <article className={styles.kpiCard} key={key} aria-label={`${label}: ${value}`}>
                        <div className={styles.kpiLabel}>{label}</div>
                        <div className={styles.kpiValue}>{value}</div>
                        <div className={styles.kpiMeta}>{meta}</div>
                    </article>
                ))}
            </ResponsiveGrid>
        </section>
    );
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export default function AdminAnalyticsPage() {
    const { filters, registerClasses } = useAnalyticsFiltersContext();
    const analytics = useAdminAnalytics(filters);
    const risk = useAdminRisk(filters);
    const [exportingFormat, setExportingFormat] = useState(null);

    // Hand this tab's already-fetched class list to the filters context so it
    // doesn't need to issue its own duplicate unfiltered request on mount.
    useEffect(() => {
        if (!analytics.loading) registerClasses(analytics.classes);
    }, [analytics.loading, analytics.classes, registerClasses]);

    function handleRefresh() {
        analytics.refresh();
        risk.refresh();
    }

    async function handleExport(format) {
        const config = EXPORT_FORMATS.find(f => f.format === format);
        setExportingFormat(format);
        try {
            const blob = await exportAdminAnalytics({ format, filters });
            downloadBlob(blob, config.filename);
        } catch (error) {
            console.error('[AdminAnalytics] export failed', error);
        } finally {
            setExportingFormat(null);
        }
    }

    function handlePrint() {
        window.print();
    }

    return (
        <>
            <PrintHeader filters={filters} />
            <PageHeader
                onRefresh={handleRefresh}
                refreshing={analytics.refreshing || risk.refreshing}
                exportingFormat={exportingFormat}
                onExport={handleExport}
                onPrint={handlePrint}
            />
            <KpiGrid
                error={analytics.error}
                isEmpty={analytics.isEmpty}
                loading={analytics.loading}
                metrics={analytics.metrics}
                onRetry={analytics.refresh}
            />
            <div className={styles.mainGrid}>
                <CgpaDistributionChart
                    analytics={analytics.analytics}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
                <ReadinessSummaryChart
                    analytics={analytics.analytics}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
            </div>
            <div className={styles.wideGrid}>
                <BacklogDistributionChart
                    analytics={analytics.analytics}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
                <BranchPerformanceChart
                    analytics={analytics.analytics}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
            </div>
            <div className={styles.intelligenceGrid}>
                <ClassIntelligence
                    classes={analytics.classes}
                    studentsByClass={[]}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
                <StudentIntelligence
                    classes={analytics.classes}
                    loading={risk.loading}
                    error={risk.error}
                    isEmpty={risk.isEmpty}
                    onRetry={risk.refresh}
                    risk={risk.risk}
                />
            </div>
        </>
    );
}
