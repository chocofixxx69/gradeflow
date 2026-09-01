import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/server-session';
import { getAdminClient } from '../../../../../lib/analytics-data';
import { generateFormulaPassword, hashStudentPassword } from '../../../../../lib/student-auth';
import bcrypt from 'bcryptjs';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const statusFilter = searchParams.get('status') || 'all';
        const userTypeFilter = searchParams.get('user_type') || 'all';
        const search = (searchParams.get('search') || '').toLowerCase().trim();

        let query = supabaseAdmin
            .from('support_tickets')
            .select('*')
            .order('created_at', { ascending: false });

        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        if (userTypeFilter !== 'all') {
            query = query.eq('user_type', userTypeFilter);
        }

        const { data: tickets, error } = await query;
        if (error) throw error;

        let filtered = tickets || [];
        if (search) {
            filtered = filtered.filter(t =>
                (t.ticket_number || '').toLowerCase().includes(search) ||
                (t.user_identifier || '').toLowerCase().includes(search) ||
                (t.user_name || '').toLowerCase().includes(search) ||
                (t.subject || '').toLowerCase().includes(search) ||
                (t.description || '').toLowerCase().includes(search)
            );
        }

        const stats = {
            total: (tickets || []).length,
            open: (tickets || []).filter(t => t.status === 'open').length,
            in_progress: (tickets || []).filter(t => t.status === 'in_progress').length,
            resolved: (tickets || []).filter(t => t.status === 'resolved').length,
            student_tickets: (tickets || []).filter(t => t.user_type === 'student').length,
            faculty_tickets: (tickets || []).filter(t => t.user_type === 'faculty').length,
        };

        return ok({ tickets: filtered, stats });
    } catch (err) {
        console.error('[GET /api/admin/support/tickets]', err);
        return fail('Failed to load support tickets.', 'ADMIN_TICKETS_ERROR', 500);
    }
}

export async function POST(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError) return authError;

        const body = await req.json().catch(() => ({}));
        const { ticket_id, action, admin_notes, custom_password } = body || {};

        if (!ticket_id) return fail('ticket_id is required.', 'MISSING_TICKET_ID');

        const { data: ticket, error: tErr } = await supabaseAdmin
            .from('support_tickets')
            .select('*')
            .eq('id', ticket_id)
            .single();

        if (tErr || !ticket) return fail('Ticket not found.', 'TICKET_NOT_FOUND', 404);

        const adminIdentifier = session?.email || 'Administrator';
        const now = new Date().toISOString();

        if (action === 'reset_password') {
            if (ticket.user_type === 'student') {
                const { data: student, error: sErr } = await supabaseAdmin
                    .from('students')
                    .select('id, usn, name')
                    .eq('usn', ticket.user_identifier)
                    .maybeSingle();

                if (sErr || !student) {
                    return fail(`Student with USN ${ticket.user_identifier} not found in directory.`, 'STUDENT_NOT_FOUND', 404);
                }

                const newPassword = custom_password || generateFormulaPassword(student.name, student.usn);
                const newHash = await hashStudentPassword(newPassword);

                await supabaseAdmin
                    .from('students')
                    .update({ password_hash: newHash, updated_at: now })
                    .eq('id', student.id);

                const resolutionNote = admin_notes
                    ? `${admin_notes}\n[System: Student password reset to institutional formula: ${newPassword}]`
                    : `Password has been reset to default institutional formula (${newPassword}). You can now log in case-insensitively.`;

                const { data: updatedTicket } = await supabaseAdmin
                    .from('support_tickets')
                    .update({
                        status: 'resolved',
                        admin_notes: resolutionNote,
                        resolved_by: adminIdentifier,
                        resolved_at: now,
                        updated_at: now,
                    })
                    .eq('id', ticket_id)
                    .select()
                    .single();

                return ok({
                    ticket: updatedTicket,
                    newPassword,
                    message: `✓ Password reset for student ${student.usn} to "${newPassword}". Ticket resolved.`
                });
            } else if (ticket.user_type === 'faculty') {
                const { data: faculty, error: fErr } = await supabaseAdmin
                    .from('faculty_onboarding')
                    .select('id, email, full_name')
                    .eq('email', ticket.user_identifier.toLowerCase())
                    .maybeSingle();

                if (fErr || !faculty) {
                    return fail(`Faculty account ${ticket.user_identifier} not found.`, 'FACULTY_NOT_FOUND', 404);
                }

                const newPassword = custom_password || `FAC-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                const hashedPassword = await bcrypt.hash(newPassword, 10);

                await supabaseAdmin
                    .from('faculty_onboarding')
                    .update({ password: hashedPassword, updated_at: now })
                    .eq('id', faculty.id);

                const resolutionNote = admin_notes
                    ? `${admin_notes}\n[System: Faculty password reset to temporary key: ${newPassword}]`
                    : `Faculty password has been reset to temporary access key: ${newPassword}.`;

                const { data: updatedTicket } = await supabaseAdmin
                    .from('support_tickets')
                    .update({
                        status: 'resolved',
                        admin_notes: resolutionNote,
                        resolved_by: adminIdentifier,
                        resolved_at: now,
                        updated_at: now,
                    })
                    .eq('id', ticket_id)
                    .select()
                    .single();

                return ok({
                    ticket: updatedTicket,
                    newPassword,
                    message: `✓ Password reset for faculty ${faculty.email} to "${newPassword}". Ticket resolved.`
                });
            }
        }

        if (action === 'resolve' || action === 'in_progress' || action === 'reject') {
            const newStatus = action === 'resolve' ? 'resolved' : action === 'reject' ? 'rejected' : 'in_progress';
            const { data: updatedTicket, error: uErr } = await supabaseAdmin
                .from('support_tickets')
                .update({
                    status: newStatus,
                    admin_notes: admin_notes || undefined,
                    resolved_by: newStatus === 'resolved' || newStatus === 'rejected' ? adminIdentifier : undefined,
                    resolved_at: newStatus === 'resolved' || newStatus === 'rejected' ? now : undefined,
                    updated_at: now,
                })
                .eq('id', ticket_id)
                .select()
                .single();

            if (uErr) throw uErr;

            return ok({
                ticket: updatedTicket,
                message: `Ticket #${ticket.ticket_number} marked as ${newStatus}.`
            });
        }

        return fail('Invalid ticket action.', 'INVALID_ACTION');
    } catch (err) {
        console.error('[POST /api/admin/support/tickets]', err);
        return fail(err.message || 'Failed to update ticket.', 'TICKET_UPDATE_ERROR', 500);
    }
}
