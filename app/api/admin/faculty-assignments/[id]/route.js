import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/server-session';
import { getAdminClient } from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * DELETE /api/admin/faculty-assignments/:id
 * Removes a faculty↔subject assignment.
 * Auth: admin only.
 */
export async function DELETE(req, { params }) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { id } = params;
        if (!id) return fail('id is required.', 'VALIDATION_ERROR', 400);

        const client = getAdminClient();
        const { error } = await client.from('faculty_subject_assignments').delete().eq('id', id);
        if (error) throw error;

        return ok({ id });
    } catch (err) {
        console.error('[DELETE /api/admin/faculty-assignments/:id]', err);
        return fail('Failed to delete faculty assignment.', 'FACULTY_ASSIGNMENTS_ERROR', 500, { error: String(err?.message || err) });
    }
}
