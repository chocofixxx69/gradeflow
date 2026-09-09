import { apiRequest } from './client';

export async function recordFacultyAction(faculty, action, usn = null, options = {}) {
    let facultyId = faculty?.id;
    let facultyName = faculty?.full_name || faculty?.name || faculty?.email;

    if (!facultyId && typeof window !== 'undefined') {
        try {
            const raw = localStorage.getItem('faculty_session') || localStorage.getItem('gradeflow_faculty') || localStorage.getItem('user_session');
            if (raw) {
                const parsed = JSON.parse(raw);
                facultyId = parsed.id || parsed.faculty_id || parsed.sub || parsed.user?.id;
                facultyName = facultyName || parsed.full_name || parsed.name || parsed.email;
            }
        } catch { /* ignored */ }
    }

    try {
        await apiRequest('/api/faculty-action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                facultyId,
                facultyName,
                action,
                usn,
                reason: options.reason || null,
                context_module: options.context_module || options.module || null,
                method: options.method || 'Interactive Web UI',
                details: options.details || null,
                metadata: options.metadata || options.data || {},
            }),
        });
    } catch {
        // Activity logging is non-blocking for operations.
    }
}

