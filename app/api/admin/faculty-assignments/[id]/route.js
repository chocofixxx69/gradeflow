import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient } from '../../../../../lib/analytics-data';
import { logServerAudit } from '../../../../../lib/server-audit';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * DELETE /api/admin/faculty-assignments/:id
 * Removes a faculty↔subject assignment.
 * Auth: admin or assigned faculty.
 */
export async function DELETE(req, { params }) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { id } = params;
        if (!id) return fail('id is required.', 'VALIDATION_ERROR', 400);

        const client = getAdminClient();

        const { data: existing, error: fetchErr } = await client
            .from('faculty_subject_assignments')
            .select('id, faculty_id, subject_code, branch, semester, scheme, class_id, faculty_onboarding(id, full_name, email)')
            .eq('id', id)
            .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!existing) return fail('Assignment not found.', 'NOT_FOUND', 404);

        // If faculty, verify ownership
        if (session?.role === 'faculty') {
            const myFacultyId = session?.sub || session?.user?.id;
            if (existing.faculty_id !== myFacultyId) {
                return fail('Faculty members can only remove their own subject assignments.', 'FORBIDDEN', 403);
            }
        }

        const { error } = await client.from('faculty_subject_assignments').delete().eq('id', id);
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
            console.warn('[DELETE /api/admin/faculty-assignments/:id] Error logging to faculty_activity:', actErr);
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
            console.warn('[DELETE /api/admin/faculty-assignments/:id] Error logging to audit_logs:', audErr);
        }

        return ok({ id });
    } catch (err) {
        console.error('[DELETE /api/admin/faculty-assignments/:id]', err);
        return fail('Failed to delete faculty assignment.', 'FACULTY_ASSIGNMENTS_ERROR', 500, { error: String(err?.message || err) });
    }
}
