import { apiRequest } from './client';

export function fetchAdminRiskAnalysis({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics/risk', {
        query: {
            branch: filters?.branch,
            semester: filters?.semester,
            classId: filters?.classId,
        },
        signal,
    });
}
