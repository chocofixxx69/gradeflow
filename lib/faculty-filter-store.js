import { preloadApi } from './api/client';

const FILTER_STORAGE_KEY = 'gf_faculty_active_filters';

const DEFAULT_FILTERS = {
    branch: 'CS',
    batch: '2023',
    semester: 3,
};

/**
 * Returns saved faculty filter state or defaults.
 * Synchronous and instant on client-side navigation.
 */
export function getSavedFilters(overrides = {}) {
    if (typeof window === 'undefined') return { ...DEFAULT_FILTERS, ...overrides };
    try {
        const raw = sessionStorage.getItem(FILTER_STORAGE_KEY);
        if (raw) {
            const parsed = JSON.parse(raw);
            return { ...DEFAULT_FILTERS, ...parsed, ...overrides };
        }
    } catch {}
    return { ...DEFAULT_FILTERS, ...overrides };
}

/**
 * Saves current active filters so all other pages open with the same context.
 */
export function saveFilters(partial = {}) {
    if (typeof window === 'undefined') return;
    try {
        const existing = getSavedFilters();
        const updated = { ...existing, ...partial };
        sessionStorage.setItem(FILTER_STORAGE_KEY, JSON.stringify(updated));
    } catch {}
}

/**
 * Pre-warms the API cache for a target page before the user even clicks the link!
 */
export function prewarmAnalyticsPage(href) {
    if (typeof window === 'undefined') return;
    const filters = getSavedFilters();
    
    // Always ensure meta is hot
    preloadApi('/api/faculty/analytics/meta');

    if (href.includes('/semester-analysis')) {
        preloadApi('/api/faculty/analytics/semester-analysis', {
            branch: filters.branch,
            semester: filters.semester,
            batch: filters.batch
        });
    } else if (href.includes('/batch-report')) {
        preloadApi('/api/faculty/analytics/batch-report', {
            branch: filters.branch,
            batch: filters.batch,
            upToSemester: filters.semester || 3
        });
    } else if (href.includes('/merit-list')) {
        preloadApi('/api/faculty/analytics/merit-list', {
            branch: filters.branch,
            batch: filters.batch,
            semester: filters.semester
        });
    } else if (href.includes('/department')) {
        preloadApi('/api/faculty/analytics/department', {
            branch: filters.branch,
            batch: filters.batch
        });
    } else if (href.includes('/backlogs')) {
        preloadApi('/api/faculty/analytics/backlogs', {
            branch: filters.branch,
            batch: filters.batch
        });
    } else if (href.includes('/eligibility')) {
        preloadApi('/api/faculty/analytics/eligibility', {
            branch: filters.branch,
            batch: filters.batch,
            targetSemester: filters.semester || 3
        });
    } else if (href.includes('/cohort-trends')) {
        preloadApi('/api/faculty/analytics/cohort-trends', {
            branch: filters.branch,
            semester: filters.semester
        });
    } else if (href.includes('/students')) {
        preloadApi('/api/faculty/students', {
            branch: filters.branch,
            batch: filters.batch,
            page: 1,
            limit: 25
        });
    }
}
