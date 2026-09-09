import { NextResponse } from 'next/server';
import { requireAdmin, requireStaff } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import { logServerAudit } from '../../../../lib/server-audit';

import { fetchAllPaginated } from '../../../../lib/supabase-utils.js';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data }, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
        }
    });
}
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

// In-memory cache for subject catalog (static reference data, changes rarely)
let _subjectsCache = null;
let _subjectsCacheTime = 0;
const SUBJECTS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function getSubjectCatalog(client) {
    const now = Date.now();
    if (_subjectsCache && Array.isArray(_subjectsCache) && (now - _subjectsCacheTime) < SUBJECTS_CACHE_TTL) {
        return _subjectsCache;
    }
    const subjects = await fetchAllPaginated(
        'subject_catalog',
        'id, subject_code, subject_name, branch, semester, scheme, credits',
        client,
        'subject_code',
        true
    );
    _subjectsCache = subjects || [];
    _subjectsCacheTime = Date.now();
    return _subjectsCache;
}

/**
 * GET /api/admin/faculty-assignments
 * Lists faculty↔subject assignments, joined with faculty name and class info
 * for display. Optional filter: ?facultyId=<uuid>
 * Auth: staff (admin or faculty).
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const facultyId = searchParams.get('facultyId') || undefined;

        const client = getAdminClient();
        let query = client
            .from('faculty_subject_assignments')
            .select('id, faculty_id, subject_code, branch, semester, scheme, class_id, created_at, faculty_onboarding(id, full_name, email, department), classes(id, name, branch, semester, section, batch)')
            .order('created_at', { ascending: false });

        if (facultyId) query = query.eq('faculty_id', facultyId);

        const [
            { data: assignments, error: assignmentsError },
            { data: faculty, error: facultyError },
            { data: classes, error: classesError },
            subjects
        ] = await Promise.all([
            query,
            client.from('faculty_onboarding').select('id, full_name, email, department, designation, status').eq('status', 'approved').order('full_name', { ascending: true }),
            client.from('classes').select('id, name, branch, semester, section, batch').order('name', { ascending: true }),
            getSubjectCatalog(client)
        ]);

        if (assignmentsError) throw assignmentsError;
        if (facultyError) throw facultyError;
        if (classesError) throw classesError;

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
 * Auth: staff (admin can assign anyone, faculty can self-assign).
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const body = await req.json().catch(() => ({}));
        let facultyId = typeof body.faculty_id === 'string' ? body.faculty_id.trim() : '';

        // If faculty user, ensure they can only assign to themselves
        if (session?.role === 'faculty') {
            const myFacultyId = session?.sub || session?.user?.id;
            if (!facultyId) {
                facultyId = myFacultyId;
            } else if (facultyId !== myFacultyId) {
                return fail('Faculty members can only assign subjects to their own profile.', 'FORBIDDEN', 403);
            }
        }

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
            .select('id, full_name, email, department')
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

        // 1. Log in faculty_activity
        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
        const userAgent = req.headers.get('user-agent') || 'Interactive Web Client';
        const facultyName = existingFaculty?.full_name || session?.email || 'Faculty Member';

        try {
            await client.from('faculty_activity').insert({
                faculty_id: facultyId,
                faculty_name: facultyName,
                action_type: 'ASSIGN_SUBJECT',
                sync_status: 'SUCCESS',
                context_module: 'Faculty Portal > Teaching Load > Subject Mapping',
                reason: 'Curricular course allocation and syllabus subject teaching load assignment for academic semester.',
                method: 'Interactive Web UI',
                details: `Assigned subject ${subjectCode}${branch ? ` (${branch})` : ''}${semester ? ` Sem ${semester}` : ''} to ${facultyName}`,
                metadata: {
                    subject_code: subjectCode,
                    branch,
                    semester,
                    scheme,
                    class_id: classId,
                    assignment_id: data?.id,
                    assigned_by: session?.email || 'System',
                    assigned_by_role: session?.role || 'admin',
                },
                ip_address: ipAddress,
                user_agent: userAgent,
            });
        } catch (actErr) {
            console.warn('[POST /api/admin/faculty-assignments] Error inserting faculty_activity:', actErr);
        }

        // 2. Log in audit_logs (Institutional Admin Audit Trail)
        try {
            await logServerAudit({
                action: 'FACULTY_SUBJECT_ASSIGNED',
                actor: session?.email || existingFaculty?.email || facultyName,
                actorRole: session?.role || 'admin',
                severity: 'INFO',
                entityType: 'faculty',
                entityId: facultyId,
                description: `Assigned subject ${subjectCode} (${branch || 'All Branches'} · Sem ${semester || 'All'} · Scheme ${scheme || 'All'}) to faculty ${facultyName}`,
                metadata: {
                    subject_code: subjectCode,
                    branch,
                    semester,
                    scheme,
                    class_id: classId,
                    assignment_id: data?.id,
                },
                ipAddress,
                userId: facultyId,
            });
        } catch (audErr) {
            console.warn('[POST /api/admin/faculty-assignments] Error inserting server audit:', audErr);
        }

        return ok({ assignment: data });
    } catch (err) {
        console.error('[POST /api/admin/faculty-assignments]', err);
        return fail('Failed to create faculty assignment.', 'FACULTY_ASSIGNMENTS_ERROR', 500, { error: String(err?.message || err) });
    }
}

/**
 * DELETE /api/admin/faculty-assignments
 * Removes a faculty↔subject assignment. Body: { id }
 * Auth: admin can delete any row; faculty can only delete their own
 * (e.g. undoing a subject they self-assigned from their dashboard).
 */
export async function DELETE(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const body = await req.json().catch(() => ({}));
        const id = typeof body.id === 'string' ? body.id.trim() : '';
        if (!id) return fail('id is required.', 'VALIDATION_ERROR', 400);

        const client = getAdminClient();

        const { data: existing, error: lookupError } = await client
            .from('faculty_subject_assignments')
            .select('id, faculty_id, subject_code, branch, semester, scheme, class_id, faculty_onboarding(id, full_name, email)')
            .eq('id', id)
            .maybeSingle();
        if (lookupError) throw lookupError;
        if (!existing) return fail('Assignment not found.', 'NOT_FOUND', 404);

        if (session?.role === 'faculty') {
            const myFacultyId = session?.sub || session?.user?.id;
            if (existing.faculty_id !== myFacultyId) {
                return fail('Faculty members can only remove their own assignments.', 'FORBIDDEN', 403);
            }
        }

        const { error } = await client
            .from('faculty_subject_assignments')
            .delete()
            .eq('id', id);

        if (error) throw error;

        // 1. Audit Log in faculty_activity
        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
        const userAgent = req.headers.get('user-agent') || 'Interactive Web Client';
        const facultyName = existing?.faculty_onboarding?.full_name || session?.email || 'Faculty Member';

        try {
            await client.from('faculty_activity').insert({
                faculty_id: existing.faculty_id,
                faculty_name: facultyName,
                action_type: 'UNASSIGN_SUBJECT',
                sync_status: 'SUCCESS',
                context_module: 'Faculty Portal > Teaching Load > Subject Mapping',
                reason: 'Curricular reallocation or semester completion subject removal from faculty teaching roster.',
                method: 'Interactive Web UI',
                details: `Removed subject ${existing.subject_code} assignment from ${facultyName}`,
                metadata: {
                    assignment_id: id,
                    subject_code: existing.subject_code,
                    branch: existing.branch,
                    semester: existing.semester,
                    scheme: existing.scheme,
                    class_id: existing.class_id,
                    removed_by: session?.email || 'System',
                    removed_by_role: session?.role || 'admin',
                },
                ip_address: ipAddress,
                user_agent: userAgent,
            });
        } catch (actErr) {
            console.warn('[DELETE /api/admin/faculty-assignments] Error logging to faculty_activity:', actErr);
        }

        // 2. Audit Log in audit_logs
        try {
            await logServerAudit({
                action: 'FACULTY_SUBJECT_REMOVED',
                actor: session?.email || existing?.faculty_onboarding?.email || facultyName,
                actorRole: session?.role || 'admin',
                severity: 'INFO',
                entityType: 'faculty',
                entityId: existing.faculty_id,
                description: `Removed subject ${existing.subject_code} assignment from ${facultyName}`,
                metadata: {
                    assignment_id: id,
                    subject_code: existing.subject_code,
                    branch: existing.branch,
                    semester: existing.semester,
                    scheme: existing.scheme,
                    class_id: existing.class_id,
                },
                ipAddress,
                userId: existing.faculty_id,
            });
        } catch (audErr) {
            console.warn('[DELETE /api/admin/faculty-assignments] Error logging to audit_logs:', audErr);
        }

        return ok({ id });
    } catch (err) {
        console.error('[DELETE /api/admin/faculty-assignments]', err);
        return fail('Failed to delete faculty assignment.', 'FACULTY_ASSIGNMENTS_ERROR', 500, { error: String(err?.message || err) });
    }
}
