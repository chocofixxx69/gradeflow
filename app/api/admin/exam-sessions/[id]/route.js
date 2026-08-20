import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/server-session';
import { getAdminClient } from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

const VALID_EXAM_TYPES = ['regular', 'supplementary', 'makeup'];

/**
 * PATCH /api/admin/exam-sessions/:id
 * Updates name/exam_type/academic_year on an existing exam session.
 * Auth: admin only.
 */
export async function PATCH(req, { params }) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { id } = params;
        if (!id) return fail('id is required.', 'VALIDATION_ERROR', 400);

        const body = await req.json().catch(() => ({}));
        const updates = {};

        if (body.name !== undefined) {
            const name = typeof body.name === 'string' ? body.name.trim() : '';
            if (!name) return fail('name cannot be empty.', 'VALIDATION_ERROR', 400);
            updates.name = name;
        }
        if (body.exam_type !== undefined) {
            const examType = typeof body.exam_type === 'string' ? body.exam_type.trim() : '';
            if (!VALID_EXAM_TYPES.includes(examType)) {
                return fail(`exam_type must be one of: ${VALID_EXAM_TYPES.join(', ')}.`, 'VALIDATION_ERROR', 400);
            }
            updates.exam_type = examType;
        }
        if (body.academic_year !== undefined) {
            updates.academic_year = typeof body.academic_year === 'string' && body.academic_year.trim() ? body.academic_year.trim() : null;
        }

        if (Object.keys(updates).length === 0) {
            return fail('Nothing to update.', 'VALIDATION_ERROR', 400);
        }

        const client = getAdminClient();
        const { data, error } = await client
            .from('exam_sessions')
            .update(updates)
            .eq('id', id)
            .select('id, name, exam_type, academic_year, created_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return fail('An exam session with this name already exists.', 'DUPLICATE_EXAM_SESSION', 409);
            }
            if (error.code === 'PGRST116') {
                return fail('Exam session not found.', 'NOT_FOUND', 404);
            }
            throw error;
        }

        return ok({ session: data });
    } catch (err) {
        console.error('[PATCH /api/admin/exam-sessions/:id]', err);
        return fail('Failed to update exam session.', 'EXAM_SESSIONS_ERROR', 500, { error: String(err?.message || err) });
    }
}

/**
 * DELETE /api/admin/exam-sessions/:id
 * Auth: admin only.
 */
export async function DELETE(req, { params }) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { id } = params;
        if (!id) return fail('id is required.', 'VALIDATION_ERROR', 400);

        const client = getAdminClient();
        const { error } = await client.from('exam_sessions').delete().eq('id', id);

        if (error) {
            if (error.code === '23503') {
                return fail('Cannot delete this exam session while results still reference it.', 'EXAM_SESSION_IN_USE', 409);
            }
            throw error;
        }

        return ok({ id });
    } catch (err) {
        console.error('[DELETE /api/admin/exam-sessions/:id]', err);
        return fail('Failed to delete exam session.', 'EXAM_SESSIONS_ERROR', 500, { error: String(err?.message || err) });
    }
}
