import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

const VALID_EXAM_TYPES = ['regular', 'supplementary', 'makeup'];

/**
 * GET /api/admin/exam-sessions
 * Lists exam sessions (used by Result Analysis's examSession filter and by
 * result-entry flows to tag results with an exam_session_id).
 * Auth: admin only.
 */
export async function GET(req) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const client = getAdminClient();
        const { data, error } = await client
            .from('exam_sessions')
            .select('id, name, exam_type, academic_year, created_at')
            .order('academic_year', { ascending: false })
            .order('name', { ascending: true });

        if (error) throw error;
        return ok({ sessions: data || [] });
    } catch (err) {
        console.error('[GET /api/admin/exam-sessions]', err);
        return fail('Failed to load exam sessions.', 'EXAM_SESSIONS_ERROR', 500, { error: String(err?.message || err) });
    }
}

/**
 * POST /api/admin/exam-sessions
 * Creates a new exam session. Body: { name, exam_type?, academic_year? }
 * Auth: admin only.
 */
export async function POST(req) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const body = await req.json().catch(() => ({}));
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        const examType = typeof body.exam_type === 'string' && body.exam_type.trim() ? body.exam_type.trim() : 'regular';
        const academicYear = typeof body.academic_year === 'string' && body.academic_year.trim() ? body.academic_year.trim() : null;

        if (!name) {
            return fail('name is required.', 'VALIDATION_ERROR', 400);
        }
        if (!VALID_EXAM_TYPES.includes(examType)) {
            return fail(`exam_type must be one of: ${VALID_EXAM_TYPES.join(', ')}.`, 'VALIDATION_ERROR', 400);
        }

        const client = getAdminClient();
        const { data, error } = await client
            .from('exam_sessions')
            .insert({ name, exam_type: examType, academic_year: academicYear })
            .select('id, name, exam_type, academic_year, created_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return fail('An exam session with this name already exists.', 'DUPLICATE_EXAM_SESSION', 409);
            }
            throw error;
        }

        return ok({ session: data });
    } catch (err) {
        console.error('[POST /api/admin/exam-sessions]', err);
        return fail('Failed to create exam session.', 'EXAM_SESSIONS_ERROR', 500, { error: String(err?.message || err) });
    }
}
