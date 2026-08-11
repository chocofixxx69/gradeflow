'use client';

import AuthGuard from '../../../components/AuthGuard';
import {
    Button,
    EmptyState,
    Inline,
    ResponsiveGrid,
    Select,
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
import { downloadAnalyticsCsv } from './exportUtils';

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



function PageHeader({ onRefresh, refreshing, onExport, onPrint }) {
    return (
        <header className={styles.header}>
            <div>
                <div className={styles.eyebrow}>Institutional Intelligence</div>
                <h1 className={styles.title}>Admin Analytics</h1>
                <p className={styles.subtitle}>
                    Academic performance, class readiness, student risk, and data quality will be consolidated here for administrative review.
                </p>
            </div>
            <Inline className={styles.headerActions} stackMobile aria-label="Analytics actions">
                <Button variant="secondary" iconStart="refresh" loading={refreshing} onClick={onRefresh}>
                    {refreshing ? 'Refreshing' : 'Refresh'}
                </Button>
                <Button variant="ghost" iconStart="download" onClick={onExport}>Export CSV</Button>
                <Button variant="ghost" iconStart="print" onClick={onPrint}>Print Report</Button>
            </Inline>
        </header>
    );
}

function FilterBar({ filters, filterOptions, onFilterChange, onReset }) {
    return (
        <section className={styles.filterPanel} aria-labelledby="analytics-filter-title">
            <div className={styles.filterHeader}>
                <div>
                    <div className={styles.sectionLabel}>Global Filters</div>
                    <h2 id="analytics-filter-title" className={styles.sectionTitle}>Academic Scope</h2>
                    <p className={styles.sectionDescription}>
                        Foundation controls for branch, semester, and class.
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={onReset}>Reset filters</Button>
            </div>
            <ResponsiveGrid className={styles.filterGrid} size="sm">
                <Select
                    label="Branch"
                    value={filters.branch}
                    options={filterOptions.branch}
                    onChange={(e) => onFilterChange('branch', e.target.value)}
                />
                <Select
                    label="Semester"
                    value={filters.semester}
                    options={filterOptions.semester}
                    onChange={(e) => onFilterChange('semester', e.target.value)}
                />
                <Select
                    label="Class"
                    value={filters.classId}
                    options={filterOptions.classId}
                    onChange={(e) => onFilterChange('classId', e.target.value)}
                />
            </ResponsiveGrid>
        </section>
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




function AdminAnalyticsContent() {
    const analytics = useAdminAnalytics();
    const risk = useAdminRisk(analytics.filters);

    function handleRefresh() {
        analytics.refresh();
        risk.refresh();
    }

    function handleExportCsv() {
        downloadAnalyticsCsv(
            analytics.metrics,
            analytics.classes,
            analytics.studentsByClass,
            analytics.filters
        );
    }

    function handlePrint() {
        window.print();
    }

    return (
        <main className={`${styles.page} gf-page gf-page-wide`}>
            <PrintHeader filters={analytics.filters} />
            <PageHeader 
                onRefresh={handleRefresh} 
                refreshing={analytics.refreshing || risk.refreshing}
                onExport={handleExportCsv}
                onPrint={handlePrint}
            />
            <FilterBar
                filters={analytics.filters}
                filterOptions={analytics.filterOptions}
                onFilterChange={analytics.setFilter}
                onReset={analytics.resetFilters}
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
                    classes={analytics.classes}
                    studentsByClass={analytics.studentsByClass}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
                <ReadinessSummaryChart
                    analytics={analytics.analytics}
                    classes={analytics.classes}
                    studentsByClass={analytics.studentsByClass}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
            </div>
            <div className={styles.wideGrid}>
                <BacklogDistributionChart
                    analytics={analytics.analytics}
                    classes={analytics.classes}
                    studentsByClass={analytics.studentsByClass}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
                <BranchPerformanceChart
                    analytics={analytics.analytics}
                    classes={analytics.classes}
                    studentsByClass={analytics.studentsByClass}
                    loading={analytics.loading}
                    error={analytics.error}
                    isEmpty={analytics.isEmpty}
                    onRetry={analytics.refresh}
                />
            </div>
            <div className={styles.intelligenceGrid}>
                <ClassIntelligence
                    classes={analytics.classes}
                    studentsByClass={analytics.studentsByClass}
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
        </main>
    );
}

export default function AdminAnalyticsPage() {
    return (
        <AuthGuard role="admin">
            <AdminAnalyticsContent />
        </AuthGuard>
    );
}
