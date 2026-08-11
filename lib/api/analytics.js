import { apiRequest } from './client';

export function fetchAdminAnalytics({ filters, signal } = {}) {
    return apiRequest('/api/admin/analytics', {
        query: {
            branch: filters?.branch,
            semester: filters?.semester,
            classId: filters?.classId,
        },
        signal,
    });
}
