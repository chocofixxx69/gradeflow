import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStudent(req);
        if (authError) return authError;

        const { usn } = session;

        const { data: profile, error } = await supabaseAdmin
            .from('students')
            .select('*')
            .eq('usn', usn)
            .maybeSingle();

        if (error) throw error;
        if (!profile) return fail('Student profile not found.', 'NOT_FOUND', 404);

        return ok({ profile });
    } catch (err) {
        console.error('[GET /api/student/profile]', err);
        return fail('Failed to fetch student profile.', 'STUDENT_PROFILE_ERROR', 500);
    }
}

export async function PATCH(req) {
    try {
        const { session, error: authError } = requireStudent(req);
        if (authError) return authError;

        const { usn } = session;
        const updates = await req.json();

        // Allowed update fields
        const allowed = ['name', 'branch', 'scheme', 'semester', 'email', 'phone', 'photo_url'];
        const sanitized = {};

        Object.keys(updates || {}).forEach(key => {
            if (allowed.includes(key) && updates[key] !== undefined) {
                sanitized[key] = updates[key];
            }
        });

        sanitized.updated_at = new Date().toISOString();

        const { data: updatedProfile, error } = await supabaseAdmin
            .from('students')
            .update(sanitized)
            .eq('usn', usn)
            .select()
            .single();

        if (error) throw error;

        return ok({ profile: updatedProfile });
    } catch (err) {
        console.error('[PATCH /api/student/profile]', err);
        return fail('Failed to update student profile.', 'STUDENT_PROFILE_UPDATE_ERROR', 500);
    }
}
