import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import { fetchAllPaginated } from '../../../../lib/supabase-utils';

export const dynamic = 'force-dynamic';

const ok = (data) => NextResponse.json({ success: true, data });
const fail = (message, code, status = 400, details = {}) =>
    NextResponse.json({ success: false, error: { code, message, details } }, { status });

function validName(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

export async function GET(req) {
    try {
        const { error } = requireStaff(req, ['admin']);
        if (error) return error;
        return ok({ sessions: await fetchAllPaginated('exam_sessions', '*', getAdminClient(), 'name', true) });
    } catch (err) {
        console.error('[GET /api/admin/exam-sessions]', err);
        return fail('Failed to load exam sessions.', 'EXAM_SESSIONS_LOAD_ERROR', 500);
    }
}

export async function POST(req) {
    try {
        const { error } = requireStaff(req, ['admin']);
        if (error) return error;
        const { name } = await req.json();
        if (!validName(name)) return fail('A session name is required.', 'VALIDATION_ERROR');
        const { data, error: dbError } = await getAdminClient().from('exam_sessions').insert({ name: name.trim() }).select().single();
        if (dbError) throw dbError;
        return ok({ session: data });
    } catch (err) {
        console.error('[POST /api/admin/exam-sessions]', err);
        return fail('Failed to create exam session.', 'EXAM_SESSION_CREATE_ERROR', 500);
    }
}

export async function PUT(req) {
    try {
        const { error } = requireStaff(req, ['admin']);
        if (error) return error;
        const { id, name } = await req.json();
        if (!id || !validName(name)) return fail('Session ID and name are required.', 'VALIDATION_ERROR');
        const { data, error: dbError } = await getAdminClient().from('exam_sessions').update({ name: name.trim() }).eq('id', id).select().single();
        if (dbError) throw dbError;
        return ok({ session: data });
    } catch (err) {
        console.error('[PUT /api/admin/exam-sessions]', err);
        return fail('Failed to update exam session.', 'EXAM_SESSION_UPDATE_ERROR', 500);
    }
}

export async function DELETE(req) {
    try {
        const { error } = requireStaff(req, ['admin']);
        if (error) return error;
        const { id } = await req.json();
        if (!id) return fail('Session ID is required.', 'VALIDATION_ERROR');
        const { error: dbError } = await getAdminClient().from('exam_sessions').delete().eq('id', id);
        if (dbError) throw dbError;
        return ok({ id });
    } catch (err) {
        console.error('[DELETE /api/admin/exam-sessions]', err);
        return fail('Failed to delete exam session.', 'EXAM_SESSION_DELETE_ERROR', 500);
    }
}
