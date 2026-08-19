import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import { fetchAllPaginated } from '../../../../lib/supabase-utils';

export const dynamic = 'force-dynamic';

const ok = (data) => NextResponse.json({ success: true, data });
const fail = (message, code, status = 400) => NextResponse.json({ success: false, error: { code, message } }, { status });

function normalize(input) {
    const value = input || {};
    return {
        faculty_id: typeof value.faculty_id === 'string' ? value.faculty_id : '',
        subject_code: typeof value.subject_code === 'string' ? value.subject_code.trim() : '',
        branch: typeof value.branch === 'string' ? value.branch.trim() : '',
        semester: Number(value.semester),
        scheme: typeof value.scheme === 'string' ? value.scheme.trim() : '',
        class_id: value.class_id || null,
    };
}

export async function GET(req) {
    try {
        const { error } = requireStaff(req, ['admin']);
        if (error) return error;
        const client = getAdminClient();
        const [assignments, faculty, classes, subjects] = await Promise.all([
            fetchAllPaginated('faculty_subject_assignments', '*', client),
            fetchAllPaginated('faculty_onboarding', 'id, full_name, email, department', client, 'full_name', true),
            fetchAllPaginated('classes', 'id, name, branch, semester, scheme', client, 'name', true),
            fetchAllPaginated('subject_catalog', 'id, subject_code, subject_name, branch, semester, scheme', client, 'subject_code', true),
        ]);
        return ok({ assignments, faculty, classes, subjects });
    } catch (err) {
        console.error('[GET /api/admin/faculty-assignments]', err);
        return fail('Failed to load faculty assignments.', 'FACULTY_ASSIGNMENTS_LOAD_ERROR', 500);
    }
}

export async function POST(req) {
    try {
        const { error } = requireStaff(req, ['admin']);
        if (error) return error;
        const assignment = normalize(await req.json());
        if (!assignment.faculty_id || !assignment.subject_code || !assignment.branch || !Number.isInteger(assignment.semester) || !assignment.scheme) {
            return fail('Faculty, subject, branch, semester, and scheme are required.', 'VALIDATION_ERROR');
        }
        const { data, error: dbError } = await getAdminClient().from('faculty_subject_assignments').insert(assignment).select().single();
        if (dbError) throw dbError;
        return ok({ assignment: data });
    } catch (err) {
        console.error('[POST /api/admin/faculty-assignments]', err);
        return fail('Failed to create faculty assignment.', 'FACULTY_ASSIGNMENT_CREATE_ERROR', 500);
    }
}

export async function DELETE(req) {
    try {
        const { error } = requireStaff(req, ['admin']);
        if (error) return error;
        const { id } = await req.json();
        if (!id) return fail('Assignment ID is required.', 'VALIDATION_ERROR');
        const { error: dbError } = await getAdminClient().from('faculty_subject_assignments').delete().eq('id', id);
        if (dbError) throw dbError;
        return ok({ id });
    } catch (err) {
        console.error('[DELETE /api/admin/faculty-assignments]', err);
        return fail('Failed to delete faculty assignment.', 'FACULTY_ASSIGNMENT_DELETE_ERROR', 500);
    }
}
