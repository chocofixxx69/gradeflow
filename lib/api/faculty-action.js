import { apiRequest } from './client';

export async function recordFacultyAction(faculty, action, usn = null, options = {}) {
    if (!faculty?.id) return;
    try {
        await apiRequest('/api/faculty-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                facultyId: faculty.id,
                action,
                usn,
                reason: options.reason || null,
                context_module: options.context_module || options.module || null,
                method: options.method || 'Web UI',
                details: options.details || null,
                metadata: options.metadata || options.data || {},
            }),
        });
    } catch {
        // Activity logging is non-blocking for class-management operations.
    }
}
