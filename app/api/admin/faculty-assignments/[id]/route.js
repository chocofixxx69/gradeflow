import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient } from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * DELETE /api/admin/faculty-assignments/:id
 * Removes a faculty↔subject assignment.
 * Auth: admin or assigned faculty.
 */
export async function DELETE(req, { params }) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { id } = params;
        if (!id) return fail('id is required.', 'VALIDATION_ERROR', 400);

        const client = getAdminClient();

        // If faculty, verify ownership
        if (session?.role === 'faculty') {
            const { data: assignment, error: fetchErr } = await client
                .from('faculty_subject_assignments')
                .select('faculty_id')
                .eq('id', id)
                .maybeSingle();
            if (fetchErr) throw fetchErr;
            if (!assignment) return fail('Assignment not found.', 'NOT_FOUND', 404);
            const myFacultyId = session?.sub || session?.user?.id;
            if (assignment.faculty_id !== myFacultyId) {
                return fail('Faculty members can only remove their own subject assignments.', 'FORBIDDEN', 403);
            }
        }

        const { error } = await client.from('faculty_subject_assignments').delete().eq('id', id);
        if (error) throw error;

        return ok({ id });
    } catch (err) {
        console.error('[DELETE /api/admin/faculty-assignments/:id]', err);
        return fail('Failed to delete faculty assignment.', 'FACULTY_ASSIGNMENTS_ERROR', 500, { error: String(err?.message || err) });
    }
}
