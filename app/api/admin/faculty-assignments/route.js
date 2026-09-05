import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/admin/faculty-assignments
 * Lists faculty↔subject assignments, joined with faculty name and class info
 * for display. Optional filter: ?facultyId=<uuid>
 * Auth: admin only.
 */
export async function GET(req) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const facultyId = searchParams.get('facultyId') || undefined;

        const client = getAdminClient();
        let query = client
            .from('faculty_subject_assignments')
            .select('id, faculty_id, subject_code, branch, semester, scheme, class_id, created_at, faculty_onboarding(id, full_name, email, department), classes(id, name, branch, semester, section)')
            .order('created_at', { ascending: false });

        if (facultyId) query = query.eq('faculty_id', facultyId);

        const [
            { data: assignments, error: assignmentsError },
            { data: faculty, error: facultyError },
            { data: classes, error: classesError },
            { data: subjects, error: subjectsError }
        ] = await Promise.all([
            query,
            client.from('faculty_onboarding').select('id, full_name, email, department, designation, status').eq('status', 'approved').order('full_name', { ascending: true }),
            client.from('classes').select('id, name, branch, semester, section').order('name', { ascending: true }),
            client.from('subject_catalog').select('id, subject_code, subject_name, branch, semester, scheme, credits').order('subject_code', { ascending: true })
        ]);

        if (assignmentsError) throw assignmentsError;
        if (facultyError) throw facultyError;
        if (classesError) throw classesError;
        if (subjectsError) throw subjectsError;

        return ok({
            assignments: assignments || [],
            faculty: faculty || [],
            classes: classes || [],
            subjects: subjects || []
        });
    } catch (err) {
        console.error('[GET /api/admin/faculty-assignments]', err);
        return fail('Failed to load faculty assignments.', 'FACULTY_ASSIGNMENTS_ERROR', 500, { error: String(err?.message || err) });
    }
}

/**
 * POST /api/admin/faculty-assignments
 * Assigns a faculty member to a subject (optionally scoped to branch/semester/
 * scheme/class). Body: { faculty_id, subject_code, branch?, semester?, scheme?, class_id? }
 * Duplicate prevention: a pre-check plus a DB-level unique index
 * (idx_fsa_unique_assignment, see supabase/migrations) both reject the same
 * faculty+subject+branch+semester+scheme+class combination being assigned twice.
 * Auth: admin only.
 */
export async function POST(req) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const body = await req.json().catch(() => ({}));
        const facultyId = typeof body.faculty_id === 'string' ? body.faculty_id.trim() : '';
        const subjectCode = typeof body.subject_code === 'string' ? body.subject_code.trim() : '';
        const branch = typeof body.branch === 'string' && body.branch.trim() ? body.branch.trim() : null;
        const scheme = typeof body.scheme === 'string' && body.scheme.trim() ? body.scheme.trim() : null;
        const classId = typeof body.class_id === 'string' && body.class_id.trim() ? body.class_id.trim() : null;

        let semester = null;
        if (body.semester !== undefined && body.semester !== null && body.semester !== '') {
            semester = parseInt(body.semester, 10);
            if (!Number.isFinite(semester)) {
                return fail('semester must be a number.', 'VALIDATION_ERROR', 400);
            }
        }

        if (!facultyId) return fail('faculty_id is required.', 'VALIDATION_ERROR', 400);
        if (!subjectCode) return fail('subject_code is required.', 'VALIDATION_ERROR', 400);

        const client = getAdminClient();

        const { data: existingFaculty, error: facultyLookupError } = await client
            .from('faculty_onboarding')
            .select('id')
            .eq('id', facultyId)
            .maybeSingle();
        if (facultyLookupError) throw facultyLookupError;
        if (!existingFaculty) return fail('faculty_id does not reference an existing faculty record.', 'FACULTY_NOT_FOUND', 404);

        let existingDuplicateQuery = client
            .from('faculty_subject_assignments')
            .select('id')
            .eq('faculty_id', facultyId)
            .eq('subject_code', subjectCode);
        existingDuplicateQuery = branch ? existingDuplicateQuery.eq('branch', branch) : existingDuplicateQuery.is('branch', null);
        existingDuplicateQuery = semester !== null ? existingDuplicateQuery.eq('semester', semester) : existingDuplicateQuery.is('semester', null);
        existingDuplicateQuery = scheme ? existingDuplicateQuery.eq('scheme', scheme) : existingDuplicateQuery.is('scheme', null);
        existingDuplicateQuery = classId ? existingDuplicateQuery.eq('class_id', classId) : existingDuplicateQuery.is('class_id', null);

        const { data: duplicate, error: duplicateLookupError } = await existingDuplicateQuery.maybeSingle();
        if (duplicateLookupError) throw duplicateLookupError;
        if (duplicate) {
            return fail('This faculty is already assigned to this subject for the given scope.', 'DUPLICATE_ASSIGNMENT', 409);
        }

        const { data, error } = await client
            .from('faculty_subject_assignments')
            .insert({ faculty_id: facultyId, subject_code: subjectCode, branch, semester, scheme, class_id: classId })
            .select('id, faculty_id, subject_code, branch, semester, scheme, class_id, created_at')
            .single();

        if (error) {
            if (error.code === '23505') {
                return fail('This faculty is already assigned to this subject for the given scope.', 'DUPLICATE_ASSIGNMENT', 409);
            }
            if (error.code === '23503') {
                return fail('faculty_id or class_id does not reference an existing row.', 'INVALID_REFERENCE', 400);
            }
            throw error;
        }

        return ok({ assignment: data });
    } catch (err) {
        console.error('[POST /api/admin/faculty-assignments]', err);
        return fail('Failed to create faculty assignment.', 'FACULTY_ASSIGNMENTS_ERROR', 500, { error: String(err?.message || err) });
    }
}
