import { apiRequest } from './client';

function filterQuery(filters) {
    return {
        academicYear: filters?.academicYear,
        examSession: filters?.examSession,
        branch: filters?.branch,
        semester: filters?.semester,
        classId: filters?.classId,
        section: filters?.section,
    };
}

export function fetchAdminAnalytics({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics', {
        query: filterQuery(filters),
        signal,
    });
}

export function fetchAdminSubjects({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics/subjects', {
        query: filterQuery(filters),
        signal,
    });
}

export function fetchAdminFaculty({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics/faculty', {
        query: filterQuery(filters),
        signal,
    });
}

export function fetchAdminRankings({ filters, limit, signal } = {}) {
    return apiRequest('/api/admin/analytics/rankings', {
        query: { ...filterQuery(filters), limit },
        signal,
    });
}

// Cohort filters use the same 6-key contract as every other admin analytics
// route; viewSemester/subjectCode are leaderboard-only tab selectors, kept
// separate from `semester` so switching tabs never shrinks the cohort itself
// (see the route's doc comment for why).
export function fetchLeaderboard({ filters, viewSemester, subjectCode, signal } = {}) {
    const query = filterQuery(filters);
    delete query.semester;
    if (viewSemester) query.viewSemester = viewSemester;
    if (subjectCode) query.subjectCode = subjectCode;
    return apiRequest('/api/admin/analytics/leaderboard', { query, signal });
}

export function fetchAdminBacklogs({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics/backlogs', {
        query: filterQuery(filters),
        signal,
    });
}

export function fetchAdminStudents({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics/students', { query: filterQuery(filters), signal });
}

export function fetchAdminClasses({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics/classes', { query: filterQuery(filters), signal });
}

export function fetchAdminCharts({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics/charts', { query: filterQuery(filters), signal });
}

export function exportAdminAnalytics({ format, filters, signal } = {}) {
    return apiRequest(`/api/admin/analytics/export/${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(filterQuery(filters)),
        responseType: 'blob',
        signal,
    });
}
