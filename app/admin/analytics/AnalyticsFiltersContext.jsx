'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { fetchAdminAnalytics } from '../../../lib/api/analytics';

// The Overview tab's own hook (useAdminAnalytics) fetches this exact endpoint
// with default ("all") filters, which serializes to the same unfiltered
// request as the one below. To avoid firing both on first load of
// /admin/analytics, this provider skips its own fetch while the Overview tab
// is active and instead waits for it to hand over the class list via
// `registerClasses` once its fetch resolves.
const OVERVIEW_PATH = '/admin/analytics';

// Shared filter contract across every Result Analysis view — mirrors the
// backend's parseFilters() in lib/analytics-data.js exactly.
const DEFAULT_FILTERS = {
    academicYear: 'all',
    examSession: 'all',
    branch: 'all',
    semester: 'all',
    classId: 'all',
    section: 'all',
};

const AnalyticsFiltersContext = createContext(null);

export function AnalyticsFiltersProvider({ children }) {
    const pathname = usePathname();
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [classes, setClasses] = useState([]);
    const [classesHydrated, setClassesHydrated] = useState(false);

    // Fetched once, unfiltered, purely to populate branch/semester/class/section
    // option lists for the filter bar — independent of whichever page is active.
    // Skipped on the Overview tab, since its own hook already fetches the
    // identical unfiltered payload and hands it over via `registerClasses`.
    useEffect(() => {
        if (pathname === OVERVIEW_PATH || classesHydrated) return;
        let cancelled = false;
        fetchAdminAnalytics({ filters: {} })
            .then(data => {
                if (!cancelled) setClasses(Array.isArray(data?.class_analytics) ? data.class_analytics : []);
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [pathname, classesHydrated]);

    // Called by the Overview tab once its own fetch resolves, so this context
    // can reuse that data instead of issuing a duplicate request.
    const registerClasses = useCallback((nextClasses) => {
        setClassesHydrated(true);
        setClasses(Array.isArray(nextClasses) ? nextClasses : []);
    }, []);

    const filterOptions = useMemo(() => {
        const branches = new Set();
        const semesters = new Set();
        const sections = new Set();
        const classOpts = [];

        classes.forEach(cls => {
            if (cls.branch && cls.branch !== '—') branches.add(cls.branch);
            if (cls.semester && cls.semester !== '—') semesters.add(String(cls.semester));
            if (cls.section) sections.add(cls.section);
            classOpts.push({ label: cls.name || 'Unnamed Class', value: cls.id });
        });

        return {
            branch: [
                { label: 'All branches', value: 'all' },
                ...Array.from(branches).sort().map(b => ({ label: b, value: b })),
            ],
            semester: [
                { label: 'All semesters', value: 'all' },
                ...Array.from(semesters).sort().map(s => ({ label: `Semester ${s}`, value: s })),
            ],
            classId: [
                { label: 'All classes', value: 'all' },
                ...classOpts.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true })),
            ],
            section: [
                { label: 'All sections', value: 'all' },
                ...Array.from(sections).sort().map(s => ({ label: s, value: s })),
            ],
        };
    }, [classes]);

    const setFilter = useCallback((key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters(DEFAULT_FILTERS);
    }, []);

    const value = useMemo(
        () => ({ filters, filterOptions, setFilter, resetFilters, registerClasses }),
        [filters, filterOptions, setFilter, resetFilters, registerClasses]
    );

    return (
        <AnalyticsFiltersContext.Provider value={value}>
            {children}
        </AnalyticsFiltersContext.Provider>
    );
}

export function useAnalyticsFiltersContext() {
    const ctx = useContext(AnalyticsFiltersContext);
    if (!ctx) throw new Error('useAnalyticsFiltersContext must be used within AnalyticsFiltersProvider');
    return ctx;
}
