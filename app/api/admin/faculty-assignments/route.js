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
    ) || [];

    _subjectsCache = subjects;
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
        const client = getAdminClient();

        // Auto-resolve facultyId if omitted or if caller is faculty
        if (!facultyId) {
            if (session?.sub) {
                const { data: bySub } = await client
                    .from('faculty_onboarding')
                    .select('id')
                    .eq('id', session.sub)
                    .maybeSingle();
                if (bySub) facultyId = bySub.id;
            }
            if (!facultyId && session?.email) {
                const { data: byEmail } = await client
                    .from('faculty_onboarding')
                    .select('id')
                    .eq('email', session.email.toLowerCase().trim())
                    .maybeSingle();
                if (byEmail) facultyId = byEmail.id;
            }
        }

        // If faculty user, ensure they can only assign to themselves (or their matched onboarding account)
        if (session?.role === 'faculty') {
            const myFacultyId = session?.sub || session?.user?.id;
            if (facultyId && facultyId !== myFacultyId) {
                const { data: myOnboarding } = await client
                    .from('faculty_onboarding')
                    .select('id')
                    .eq('email', session?.email?.toLowerCase()?.trim())
                    .maybeSingle();
                if (!myOnboarding || myOnboarding.id !== facultyId) {
                    return fail('Faculty members can only assign subjects to their own profile.', 'FORBIDDEN', 403);
                }
            } else if (!facultyId) {
                facultyId = myFacultyId;
            }
        }

        // Support both multi (subject_codes, class_ids) and single (subject_code, class_id)
        let subjectCodes = [];
        if (Array.isArray(body.subject_codes) && body.subject_codes.length > 0) {
            subjectCodes = body.subject_codes.map(s => String(s || '').trim().toUpperCase()).filter(Boolean);
        } else if (typeof body.subject_code === 'string' && body.subject_code.trim()) {
            subjectCodes = [body.subject_code.trim().toUpperCase()];
        }

        let classIds = [];
        if (Array.isArray(body.class_ids) && body.class_ids.length > 0) {
            classIds = body.class_ids.map(c => (c && String(c).trim()) ? String(c).trim() : null);
        } else if (body.class_id !== undefined) {
            classIds = [(body.class_id && String(body.class_id).trim()) ? String(body.class_id).trim() : null];
        } else {
            classIds = [null];
        }

        const isSingleRequest = !Array.isArray(body.subject_codes) && !Array.isArray(body.class_ids);

        const branch = typeof body.branch === 'string' && body.branch.trim() ? body.branch.trim() : null;
        const scheme = typeof body.scheme === 'string' && body.scheme.trim() ? body.scheme.trim() : null;

        let semester = null;
        if (body.semester !== undefined && body.semester !== null && body.semester !== '') {
            semester = parseInt(body.semester, 10);
            if (!Number.isFinite(semester)) {
                return fail('semester must be a number.', 'VALIDATION_ERROR', 400);
            }
        }

        if (!facultyId) return fail('faculty_id is required.', 'VALIDATION_ERROR', 400);
        if (subjectCodes.length === 0) return fail('subject_code or subject_codes is required.', 'VALIDATION_ERROR', 400);

        const { data: existingFaculty, error: facultyLookupError } = await client
            .from('faculty_onboarding')
            .select('id, full_name, email, department')
            .eq('id', facultyId)
            .maybeSingle();
        if (facultyLookupError) throw facultyLookupError;
        if (!existingFaculty) return fail('faculty_id does not reference an existing faculty record.', 'FACULTY_NOT_FOUND', 404);

        // Resolve class metadata from DB for multi-class and cross-branch assignments
        const nonNullClassIds = classIds.filter(Boolean);
        const classMap = new Map();
        if (nonNullClassIds.length > 0) {
            const { data: dbClasses } = await client
                .from('classes')
                .select('id, name, branch, semester, scheme, section, batch')
                .in('id', nonNullClassIds);
            (dbClasses || []).forEach(c => classMap.set(c.id, c));
        }

        // Fetch existing assignments for this faculty to skip duplicates gracefully
        const { data: existingAssignments, error: existingLookupError } = await client
            .from('faculty_subject_assignments')
            .select('id, subject_code, branch, semester, scheme, class_id')
            .eq('faculty_id', facultyId);
        if (existingLookupError) throw existingLookupError;

        const existingSigSet = new Set(
            (existingAssignments || []).map(a =>
                `${(a.subject_code || '').toUpperCase()}|${a.branch || ''}|${a.semester ?? ''}|${a.scheme || ''}|${a.class_id || ''}`
            )
        );

        const recordsToInsert = [];
        const skippedPairs = [];

        for (const sCode of subjectCodes) {
            for (const cId of classIds) {
                const classRecord = cId ? classMap.get(cId) : null;
                // If a specific class is assigned, use that class's true branch, semester, and scheme
                const itemBranch = classRecord?.branch || branch;
                const itemSemester = classRecord?.semester ? Number(classRecord.semester) : semester;
                const itemScheme = classRecord?.scheme || scheme;

                const sig = `${sCode}|${itemBranch || ''}|${itemSemester ?? ''}|${itemScheme || ''}|${cId || ''}`;
                if (existingSigSet.has(sig)) {
                    skippedPairs.push({ subject_code: sCode, class_id: cId });
                } else {
                    existingSigSet.add(sig);
                    recordsToInsert.push({
                        faculty_id: facultyId,
                        subject_code: sCode,
                        branch: itemBranch,
                        semester: itemSemester,
                        scheme: itemScheme,
                        class_id: cId
                    });
                }
            }
        }

        if (recordsToInsert.length === 0) {
            if (isSingleRequest) {
                return fail('This faculty is already assigned to this subject for the given scope.', 'DUPLICATE_ASSIGNMENT', 409);
            }
            return ok({
                success: true,
                assignments: [],
                totalCreated: 0,
                totalSkipped: skippedPairs.length,
                message: 'All selected subject and class assignments already exist for this faculty member.'
            });
        }

        const { data: insertedRows, error: insertError } = await client
            .from('faculty_subject_assignments')
            .insert(recordsToInsert)
            .select('id, faculty_id, subject_code, branch, semester, scheme, class_id, created_at');

        if (insertError) {
            if (insertError.code === '23505') {
                return fail('One or more assignments duplicate an existing record.', 'DUPLICATE_ASSIGNMENT', 409);
            }
            if (insertError.code === '23503') {
                return fail('faculty_id or class_id does not reference an existing row.', 'INVALID_REFERENCE', 400);
            }
            throw insertError;
        }

        // 1. Log in faculty_activity
        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
        const userAgent = req.headers.get('user-agent') || 'Interactive Web Client';
        const facultyName = existingFaculty?.full_name || session?.email || 'Faculty Member';

        try {
            await client.from('faculty_activity').insert({
                faculty_id: facultyId,
                faculty_name: facultyName,
                action_type: isSingleRequest ? 'ASSIGN_SUBJECT' : 'ASSIGN_SUBJECT_BATCH',
                sync_status: 'SUCCESS',
                context_module: 'Faculty Portal > Teaching Load > Subject Mapping',
                reason: 'Curricular course allocation and syllabus subject teaching load assignment for academic semester.',
                method: 'Interactive Web UI',
                details: isSingleRequest
                    ? `Assigned subject ${subjectCodes[0]}${branch ? ` (${branch})` : ''}${semester ? ` Sem ${semester}` : ''} to ${facultyName}`
                    : `Assigned ${insertedRows.length} subject-class mapping(s) (${subjectCodes.join(', ')}) to ${facultyName}`,
                metadata: {
                    subject_codes: subjectCodes,
                    branch,
                    semester,
                    scheme,
                    class_ids: classIds,
                    assignment_ids: insertedRows.map(r => r.id),
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
                action: isSingleRequest ? 'FACULTY_SUBJECT_ASSIGNED' : 'FACULTY_SUBJECTS_BATCH_ASSIGNED',
                actor: session?.email || existingFaculty?.email || facultyName,
                actorRole: session?.role || 'admin',
                severity: 'INFO',
                entityType: 'faculty',
                entityId: facultyId,
                description: isSingleRequest
                    ? `Assigned subject ${subjectCodes[0]} (${branch || 'All Branches'} · Sem ${semester || 'All'} · Scheme ${scheme || 'All'}) to faculty ${facultyName}`
                    : `Batch assigned ${insertedRows.length} subjects/classes (${subjectCodes.join(', ')}) to faculty ${facultyName}`,
                metadata: {
                    subject_codes: subjectCodes,
                    branch,
                    semester,
                    scheme,
                    class_ids: classIds,
                    assignment_ids: insertedRows.map(r => r.id),
                },
                ipAddress,
                userId: facultyId,
            });
        } catch (audErr) {
            console.warn('[POST /api/admin/faculty-assignments] Error inserting server audit:', audErr);
        }

        if (isSingleRequest) {
            return ok({ assignment: insertedRows[0], ...insertedRows[0] });
        }

        return ok({
            success: true,
            assignments: insertedRows,
            totalCreated: insertedRows.length,
            totalSkipped: skippedPairs.length,
            message: `Successfully created ${insertedRows.length} assignment(s)${skippedPairs.length > 0 ? ` (${skippedPairs.length} already existed)` : ''}.`
        });
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
