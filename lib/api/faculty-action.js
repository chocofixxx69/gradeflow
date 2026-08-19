import { apiRequest } from './client';

export async function recordFacultyAction(faculty, action, usn = null) {
    if (!faculty?.id) return;
    try {
        await apiRequest('/api/faculty-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ facultyId: faculty.id, action, usn }),
        });
    } catch {
        // Activity logging is non-blocking for class-management operations.
    }
}
