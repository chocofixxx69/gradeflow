import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

export async function POST(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError && process.env.NODE_ENV === 'production') {
            return authError;
        }

        const body = await req.json().catch(() => ({}));
        const { action, usn, usns, reason } = body || {};

        if (!action) {
            return NextResponse.json({ error: 'Action parameter is required.' }, { status: 400 });
        }

        // 1. Single Student Suspend / Ban
        if (action === 'suspend' || action === 'toggle_suspend') {
            if (!usn) return NextResponse.json({ error: 'Student USN is required.' }, { status: 400 });
            
            const cleanUsn = String(usn).toUpperCase().trim();
            const { data: student } = await supabaseAdmin
                .from('students')
                .select('id, usn, name, is_suspended')
                .eq('usn', cleanUsn)
                .maybeSingle();

            if (!student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 });

            const newSuspendedState = action === 'toggle_suspend' ? !student.is_suspended : true;

            const { error: updateErr } = await supabaseAdmin
                .from('students')
                .update({
                    is_suspended: newSuspendedState,
                    suspended_at: newSuspendedState ? new Date().toISOString() : null,
                    suspended_reason: newSuspendedState ? (reason || 'Access suspended by Institution Administrator.') : null
                })
                .eq('id', student.id);

            if (updateErr) throw updateErr;

            // Log action in faculty_activity for audit trail
            try {
                await supabaseAdmin.from('faculty_activity').insert({
                    faculty_id: session?.id || '00000000-0000-0000-0000-000000000000',
                    faculty_name: session?.email || 'Administrator',
                    target_usn: cleanUsn,
                    action_type: newSuspendedState ? 'STUDENT_SUSPENDED' : 'STUDENT_RESTORED',
                    details: newSuspendedState ? `Suspended student ${cleanUsn}: ${reason || 'Admin action'}` : `Restored student ${cleanUsn} access`,
                    sync_status: 'SUCCESS'
                });
            } catch (e) {
                // non-critical audit log
            }

            return NextResponse.json({
                success: true,
                is_suspended: newSuspendedState,
                message: newSuspendedState ? `Student ${cleanUsn} has been suspended.` : `Student ${cleanUsn} access restored.`
            });
        }

        // 2. Single Student Unban / Restore
        if (action === 'unban') {
            if (!usn) return NextResponse.json({ error: 'Student USN is required.' }, { status: 400 });
            const cleanUsn = String(usn).toUpperCase().trim();

            const { error: updateErr } = await supabaseAdmin
                .from('students')
                .update({
                    is_suspended: false,
                    suspended_at: null,
                    suspended_reason: null
                })
                .eq('usn', cleanUsn);

            if (updateErr) throw updateErr;

            return NextResponse.json({
                success: true,
                is_suspended: false,
                message: `Student ${cleanUsn} access restored.`
            });
        }

        // 3. Bulk Suspend / Ban
        if (action === 'bulk_suspend') {
            const targetUsns = Array.isArray(usns) ? usns.map(u => String(u).toUpperCase().trim()).filter(Boolean) : [];
            if (targetUsns.length === 0) {
                return NextResponse.json({ error: 'No USNs provided for bulk suspension.' }, { status: 400 });
            }

            const { error: updateErr } = await supabaseAdmin
                .from('students')
                .update({
                    is_suspended: true,
                    suspended_at: new Date().toISOString(),
                    suspended_reason: reason || 'Access suspended by Institution Administrator in batch.'
                })
                .in('usn', targetUsns);

            if (updateErr) throw updateErr;

            return NextResponse.json({
                success: true,
                count: targetUsns.length,
                message: `Successfully suspended ${targetUsns.length} student account(s).`
            });
        }

        // 4. Bulk Unban / Restore
        if (action === 'bulk_unban') {
            const targetUsns = Array.isArray(usns) ? usns.map(u => String(u).toUpperCase().trim()).filter(Boolean) : [];
            if (targetUsns.length === 0) {
                return NextResponse.json({ error: 'No USNs provided for bulk unban.' }, { status: 400 });
            }

            const { error: updateErr } = await supabaseAdmin
                .from('students')
                .update({
                    is_suspended: false,
                    suspended_at: null,
                    suspended_reason: null
                })
                .in('usn', targetUsns);

            if (updateErr) throw updateErr;

            return NextResponse.json({
                success: true,
                count: targetUsns.length,
                message: `Successfully restored ${targetUsns.length} student account(s).`
            });
        }

        // 5. Bulk Reset Credentials / PIN
        if (action === 'bulk_reset_pin') {
            const targetUsns = Array.isArray(usns) ? usns.map(u => String(u).toUpperCase().trim()).filter(Boolean) : [];
            if (targetUsns.length === 0) {
                return NextResponse.json({ error: 'No USNs provided for credential reset.' }, { status: 400 });
            }

            const { error: updateErr } = await supabaseAdmin
                .from('students')
                .update({
                    password_hash: null,
                    recovery_pin: null,
                    activated_at: null
                })
                .in('usn', targetUsns);

            if (updateErr) throw updateErr;

            return NextResponse.json({
                success: true,
                count: targetUsns.length,
                message: `Credentials & PIN reset for ${targetUsns.length} student(s). They can now re-activate.`
            });
        }

        // 6. Bulk Delete Students
        if (action === 'bulk_delete') {
            const targetUsns = Array.isArray(usns) ? usns.map(u => String(u).toUpperCase().trim()).filter(Boolean) : [];
            if (targetUsns.length === 0) {
                return NextResponse.json({ error: 'No USNs provided for deletion.' }, { status: 400 });
            }

            // Remove associated marks and class enrollments
            await Promise.all([
                supabaseAdmin.from('subject_marks').delete().in('usn', targetUsns),
                supabaseAdmin.from('marks').delete().in('usn', targetUsns),
                supabaseAdmin.from('class_students').delete().in('usn', targetUsns),
            ]);

            const { error: delErr } = await supabaseAdmin
                .from('students')
                .delete()
                .in('usn', targetUsns);

            if (delErr) throw delErr;

            return NextResponse.json({
                success: true,
                count: targetUsns.length,
                message: `Permanently deleted ${targetUsns.length} student(s) and all associated academic records.`
            });
        }

        return NextResponse.json({ error: 'Unknown action specified.' }, { status: 400 });
    } catch (err) {
        console.error('[POST /api/admin/student-action]', err);
        return NextResponse.json({ error: 'Failed to process student administrative action.' }, { status: 500 });
    }
}
