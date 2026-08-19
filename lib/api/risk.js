import { apiRequest } from './client';

export function fetchAdminRiskAnalysis({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics/risk', {
        query: {
            academicYear: filters?.academicYear,
            examSession: filters?.examSession,
            branch: filters?.branch,
            semester: filters?.semester,
            classId: filters?.classId,
            section: filters?.section,
        },
        signal,
    });
}
