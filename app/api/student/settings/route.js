import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import { getStudentDefaultEmail } from '../../../../lib/semester-utils';

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

        const { data: student, error } = await supabaseAdmin
            .from('students')
            .select('id, usn, name, email, phone, branch, branch_code, scheme, semester, photo_url')
            .eq('usn', usn)
            .maybeSingle();

        if (error) throw error;

        if (student) {
            student.email = student.email || getStudentDefaultEmail(student.usn);
        }

        return ok({
            settings: {
                theme: 'system',
                notifications: true,
                profile: student || { usn, email: getStudentDefaultEmail(usn) }
            }
        });
    } catch (err) {
        console.error('[GET /api/student/settings]', err);
        return fail('Failed to fetch student settings.', 'STUDENT_SETTINGS_ERROR', 500);
    }
}

export async function PATCH(req) {
    try {
        const { session, error: authError } = requireStudent(req);
        if (authError) return authError;

        const { usn } = session;
        const body = await req.json();

        const { full_name, name, email, phone, branch, branch_code, photo_url } = body || {};
        const updateData = {};

        if (full_name !== undefined) updateData.name = full_name;
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (branch !== undefined) updateData.branch = branch;
        if (branch_code !== undefined) updateData.branch_code = branch_code;
        if (photo_url !== undefined) updateData.photo_url = photo_url;
        updateData.updated_at = new Date().toISOString();

        const { data: updated, error } = await supabaseAdmin
            .from('students')
            .update(updateData)
            .eq('usn', usn)
            .select()
            .single();

        if (error) throw error;

        if (updated) {
            updated.email = updated.email || getStudentDefaultEmail(updated.usn);
        }

        return ok({ settings: { profile: updated } });
    } catch (err) {
        console.error('[PATCH /api/student/settings]', err);
        return fail('Failed to update student settings.', 'STUDENT_SETTINGS_UPDATE_ERROR', 500);
    }
}

