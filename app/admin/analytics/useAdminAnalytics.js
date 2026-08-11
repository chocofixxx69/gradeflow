'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchAdminAnalytics } from '../../../lib/api/analytics';

const INITIAL_STATE = {
    analytics: null,
    classes: [],
    error: '',
    loading: true,
    refreshing: false,
    studentsByClass: [],
};

function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
}

function formatInteger(value) {
    return new Intl.NumberFormat('en-IN').format(value);
}

function formatDecimal(value) {
    if (!Number.isFinite(value)) return '-';
    return value.toFixed(2);
}

function formatPercent(numerator, denominator) {
    if (!denominator) return '-';
    return `${Math.round((numerator / denominator) * 100)}%`;
}

function buildOverviewMetrics(analytics, classes, studentsByClass) {
    const kpis = analytics?.kpis;

    if (kpis) {
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

    const allStudents = studentsByClass.flatMap(entry => entry.students || []);
    const totalClasses = classes.length;
    const enrolledStudents = allStudents.length;
    const validCgpaStudents = allStudents.filter(student => isFiniteNumber(student.cgpa));
    const backlogStudents = allStudents.filter(student => Number(student.total_backlogs || 0) > 0).length;
    const emptyClasses = classes.filter(cls => Number(cls.student_count || 0) === 0).length;
    const cgpaTotal = validCgpaStudents.reduce((sum, student) => sum + Number(student.cgpa), 0);
    const averageCgpa = validCgpaStudents.length ? cgpaTotal / validCgpaStudents.length : null;

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
            value: averageCgpa === null ? '-' : formatDecimal(averageCgpa),
            meta: `${formatInteger(validCgpaStudents.length)} valid CGPA records`,
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
            value: formatPercent(validCgpaStudents.length, enrolledStudents),
            meta: `${formatInteger(validCgpaStudents.length)} of ${formatInteger(enrolledStudents)} records`,
        },
        {
            key: 'emptyClasses',
            label: 'Empty Classes',
            value: formatInteger(emptyClasses),
            meta: 'Roster required',
        },
    ];
}

export function useAdminAnalytics() {
    const [state, setState] = useState(INITIAL_STATE);
    const [filters, setFilters] = useState({ branch: 'all', semester: 'all', classId: 'all' });
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
                studentsByClass: [],
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

        return () => {
            abortRef.current?.abort();
        };
    }, [loadOverview]);

    const filterOptions = useMemo(() => {
        const branches = new Set();
        const semesters = new Set();
        const classOpts = [];

        state.classes.forEach(cls => {
            if (cls.branch && cls.branch !== '—') branches.add(cls.branch);
            if (cls.semester && cls.semester !== '—') semesters.add(String(cls.semester));
            classOpts.push({ label: cls.name || 'Unnamed Class', value: cls.id });
        });

        return {
            branch: [
                { label: 'All branches', value: 'all' },
                ...Array.from(branches).sort().map(b => ({ label: b, value: b }))
            ],
            semester: [
                { label: 'All semesters', value: 'all' },
                ...Array.from(semesters).sort().map(s => ({ label: `Semester ${s}`, value: s }))
            ],
            classId: [
                { label: 'All classes', value: 'all' },
                ...classOpts.sort((a,b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
            ],
        };
    }, [state.classes]);

    const filteredData = useMemo(() => {
        return { classes: state.classes, studentsByClass: state.studentsByClass };
    }, [state.classes, state.studentsByClass]);

    const metrics = useMemo(
        () => buildOverviewMetrics(state.analytics, filteredData.classes, filteredData.studentsByClass),
        [state.analytics, filteredData.classes, filteredData.studentsByClass]
    );

    const isEmpty = !state.loading && !state.error && filteredData.classes.length === 0;

    const setFilter = useCallback((key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
    }, []);

    const resetFilters = useCallback(() => {
        setFilters({ branch: 'all', semester: 'all', classId: 'all' });
    }, []);

    return {
        classes: filteredData.classes,
        analytics: state.analytics,
        error: state.error,
        filters,
        filterOptions,
        isEmpty,
        loading: state.loading,
        metrics,
        refresh: () => loadOverview({ refresh: true }),
        refreshing: state.refreshing,
        resetFilters,
        setFilter,
        studentsByClass: filteredData.studentsByClass,
    };
}
