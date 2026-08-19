'use client';

import AuthGuard from '../../../components/AuthGuard';
import { Button, Input, ResponsiveGrid, Select } from '../../../components/ui';
import styles from './AdminAnalytics.module.css';
import { AnalyticsTabs } from './AnalyticsTabs';
import { AnalyticsFiltersProvider, useAnalyticsFiltersContext } from './AnalyticsFiltersContext';

function FilterBar() {
    const { filters, filterOptions, setFilter, resetFilters } = useAnalyticsFiltersContext();

    return (
        <section className={styles.filterPanel} aria-labelledby="analytics-filter-title">
            <div className={styles.filterHeader}>
                <div>
                    <div className={styles.sectionLabel}>Global Filters</div>
                    <h2 id="analytics-filter-title" className={styles.sectionTitle}>Academic Scope</h2>
                    <p className={styles.sectionDescription}>
                        Applies across Overview, Subjects, Faculty, Rankings, and Backlogs.
                    </p>
                </div>
                <Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>
            </div>
            <ResponsiveGrid className={styles.filterGrid} size="sm">
                <Select
                    label="Branch"
                    value={filters.branch}
                    options={filterOptions.branch}
                    onChange={(e) => setFilter('branch', e.target.value)}
                />
                <Select
                    label="Semester"
                    value={filters.semester}
                    options={filterOptions.semester}
                    onChange={(e) => setFilter('semester', e.target.value)}
                />
                <Select
                    label="Class"
                    value={filters.classId}
                    options={filterOptions.classId}
                    onChange={(e) => setFilter('classId', e.target.value)}
                />
                <Select
                    label="Section"
                    value={filters.section}
                    options={filterOptions.section}
                    onChange={(e) => setFilter('section', e.target.value)}
                />
                <Input
                    label="Academic Year"
                    placeholder="e.g. 2025-26"
                    value={filters.academicYear === 'all' ? '' : filters.academicYear}
                    onChange={(e) => setFilter('academicYear', e.target.value || 'all')}
                />
                <Input
                    label="Exam Session"
                    placeholder="e.g. Jan 2026"
                    value={filters.examSession === 'all' ? '' : filters.examSession}
                    onChange={(e) => setFilter('examSession', e.target.value || 'all')}
                />
            </ResponsiveGrid>
        </section>
    );
}

function AnalyticsShell({ children }) {
    return (
        <main className={`${styles.page} gf-page gf-page-wide`}>
            <AnalyticsTabs />
            <FilterBar />
            {children}
        </main>
    );
}

export default function AnalyticsLayout({ children }) {
    return (
        <AuthGuard role="admin">
            <AnalyticsFiltersProvider>
                <AnalyticsShell>{children}</AnalyticsShell>
            </AnalyticsFiltersProvider>
        </AuthGuard>
    );
}
