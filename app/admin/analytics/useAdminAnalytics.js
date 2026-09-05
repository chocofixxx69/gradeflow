'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAdminAnalytics } from '../../../lib/api/analytics';
import { LIVE } from '../../../lib/api/live';

const INITIAL_STATE = {
    analytics: null,
    classes: [],
    error: '',
    loading: true,
    refreshing: false,
};

function formatInteger(value) {
    return new Intl.NumberFormat('en-IN').format(value);
}

function formatDecimal(value) {
    if (!Number.isFinite(value)) return '-';
    return value.toFixed(2);
}

// The backend always returns `kpis` (built unconditionally in
// GET /api/admin/analytics) — there is no code path where it's absent once a
// request succeeds, so this only ever renders backend-provided numbers.
function buildOverviewMetrics(analytics) {
    const kpis = analytics?.kpis;
    if (!kpis) return [];

    const totalClasses = Number(kpis.total_classes || 0);
    const enrolledStudents = Number(kpis.total_students || 0);
    const averageCgpa = Number(kpis.average_cgpa || 0);
    const backlogStudents = Number(kpis.students_with_backlogs || 0);
    const coveragePercentage = Number(kpis.coverage_percentage || 0);
    const emptyClasses = Number(kpis.empty_classes || 0);

    return [
        {
            key: 'totalClasses',
            label: 'Total Classes',
            value: formatInteger(totalClasses),
            meta: totalClasses === 1 ? '1 class loaded' : `${formatInteger(totalClasses)} classes loaded`,
        },
        {
            key: 'enrolledStudents',
            label: 'Enrolled Students',
            value: formatInteger(enrolledStudents),
            meta: 'Class memberships',
        },
        {
            key: 'averageCgpa',
            label: 'Average CGPA',
            value: averageCgpa > 0 ? formatDecimal(averageCgpa) : '-',
            meta: `${formatInteger(enrolledStudents - Number(kpis.students_without_cgpa || 0))} valid CGPA records`,
        },
        {
            key: 'backlogStudents',
            label: 'Backlog Students',
            value: formatInteger(backlogStudents),
            meta: 'Needs attention',
        },
        {
            key: 'dataCoverage',
            label: 'Data Coverage',
            value: `${Math.round(coveragePercentage)}%`,
            meta: `${formatInteger(analytics?.data_coverage?.students_with_results || 0)} of ${formatInteger(enrolledStudents)} records`,
        },
        {
            key: 'emptyClasses',
            label: 'Empty Classes',
            value: formatInteger(emptyClasses),
            meta: 'Roster required',
        },
    ];
}

export function useAdminAnalytics(filters) {
    const [state, setState] = useState(INITIAL_STATE);
    const abortRef = useRef(null);
    const requestIdRef = useRef(0);

    const loadOverview = useCallback(async ({ refresh = false } = {}) => {
        abortRef.current?.abort();

        const controller = new AbortController();
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        abortRef.current = controller;

        setState(prev => ({
            ...prev,
            error: '',
            loading: refresh ? prev.loading : true,
            refreshing: refresh,
        }));

        try {
            const data = await fetchAdminAnalytics({ filters, signal: controller.signal });

            if (controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState({
                analytics: data,
                classes: Array.isArray(data?.class_analytics) ? data.class_analytics : [],
                error: '',
                loading: false,
                refreshing: false,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState(prev => ({
                ...prev,
                error: error?.message || 'Analytics data could not be loaded.',
                loading: false,
                refreshing: false,
            }));
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    }, [filters]);

    useEffect(() => {
        loadOverview();

        // Rollups only change when a scrape lands, so poll at LIVE.SLOW cadence
        // and also catch up immediately when the tab regains focus.
        const intervalId = setInterval(() => loadOverview({ refresh: true }), LIVE.SLOW);
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') loadOverview({ refresh: true });
        };
        document.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('focus', handleVisibility);

        return () => {
            abortRef.current?.abort();
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('focus', handleVisibility);
        };
    }, [loadOverview]);

    const metrics = useMemo(() => buildOverviewMetrics(state.analytics), [state.analytics]);

    const isEmpty = !state.loading && !state.error && state.classes.length === 0;

    return {
        classes: state.classes,
        analytics: state.analytics,
        error: state.error,
        isEmpty,
        loading: state.loading,
        metrics,
        refresh: () => loadOverview({ refresh: true }),
        refreshing: state.refreshing,
    };
}
