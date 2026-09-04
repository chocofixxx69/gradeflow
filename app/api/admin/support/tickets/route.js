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
        const categoryFilter = searchParams.get('category') || 'all';
        const sort = searchParams.get('sort') || 'created_at_desc';
        const search = (searchParams.get('search') || '').toLowerCase().trim();

        let query = supabaseAdmin
            .from('support_tickets')
            .select('*');

        if (sort === 'created_at_asc') {
            query = query.order('created_at', { ascending: true });
        } else if (sort === 'status') {
            query = query.order('status', { ascending: true }).order('created_at', { ascending: false });
        } else {
            query = query.order('created_at', { ascending: false });
        }

        if (statusFilter !== 'all') {
            query = query.eq('status', statusFilter);
        }

        if (userTypeFilter !== 'all') {
            query = query.eq('user_type', userTypeFilter);
        }

        if (categoryFilter !== 'all') {
            query = query.eq('issue_type', categoryFilter);
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
                (t.description || '').toLowerCase().includes(search) ||
                (t.admin_notes || '').toLowerCase().includes(search)
            );
        }

        // Fetch all tickets summary for stats
        const { data: allTickets } = await supabaseAdmin
            .from('support_tickets')
            .select('status, user_type');

        const rawList = allTickets || tickets || [];
        const stats = {
            total: rawList.length,
            open: rawList.filter(t => t.status === 'open').length,
            in_progress: rawList.filter(t => t.status === 'in_progress').length,
            resolved: rawList.filter(t => t.status === 'resolved').length,
            rejected: rawList.filter(t => t.status === 'rejected').length,
            student_tickets: rawList.filter(t => t.user_type === 'student').length,
            faculty_tickets: rawList.filter(t => t.user_type === 'faculty').length,
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
        const { ticket_id, ticket_ids, action, admin_notes, custom_password } = body || {};

        const adminIdentifier = session?.email || 'Administrator';
        const now = new Date().toISOString();

        // ── 1. Create Manual Ticket by Admin ──
        if (action === 'create_ticket') {
            const {
                user_type,
                user_identifier,
                user_name,
                user_email,
                issue_type,
                subject,
                description,
                initial_status
            } = body;

            if (!user_type || !['student', 'faculty'].includes(user_type)) {
                return fail('User type must be student or faculty.', 'INVALID_USER_TYPE');
            }
            const cleanId = String(user_identifier || '').trim().toUpperCase();
            if (!cleanId) return fail('USN or Faculty Email is required.', 'MISSING_IDENTIFIER');
            if (!subject?.trim()) return fail('Subject is required.', 'MISSING_SUBJECT');
            if (!description?.trim()) return fail('Description is required.', 'MISSING_DESCRIPTION');

            // Auto-enrich user name if student or faculty exists in DB
            let resolvedName = user_name?.trim() || '';
            let resolvedEmail = user_email?.trim() || '';
            if (user_type === 'student') {
                const { data: st } = await supabaseAdmin.from('students').select('name').eq('usn', cleanId).maybeSingle();
                if (st?.name && !resolvedName) resolvedName = st.name;
            } else if (user_type === 'faculty') {
                const { data: fc } = await supabaseAdmin.from('faculty_onboarding').select('full_name, email').eq('email', cleanId.toLowerCase()).maybeSingle();
                if (fc?.full_name && !resolvedName) resolvedName = fc.full_name;
                if (fc?.email && !resolvedEmail) resolvedEmail = fc.email;
            }

            const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
            const rand = Math.floor(1000 + Math.random() * 9000);
            const ticketNumber = `GF-${dateStr}-${rand}`;

            const { data: newTicket, error: cErr } = await supabaseAdmin
                .from('support_tickets')
                .insert({
                    ticket_number: ticketNumber,
                    user_type,
                    user_identifier: cleanId,
                    user_name: resolvedName || cleanId,
                    user_email: resolvedEmail || (user_type === 'faculty' ? cleanId.toLowerCase() : null),
                    issue_type: issue_type || 'other',
                    subject: subject.trim(),
                    description: description.trim(),
                    status: initial_status || 'open',
                    admin_notes: admin_notes?.trim() || null,
                    resolved_by: initial_status === 'resolved' ? adminIdentifier : null,
                    resolved_at: initial_status === 'resolved' ? now : null,
                })
                .select()
                .single();

            if (cErr) throw cErr;
            return ok({ ticket: newTicket, message: `Created support ticket #${newTicket.ticket_number}.` });
        }

        // ── 2. Bulk Delete ──
        if (action === 'bulk_delete') {
            const idsToDelete = ticket_ids || (ticket_id ? [ticket_id] : []);
            if (!idsToDelete.length) return fail('No ticket IDs provided for deletion.', 'MISSING_TICKET_IDS');

            const { error: dErr } = await supabaseAdmin
                .from('support_tickets')
                .delete()
                .in('id', idsToDelete);

            if (dErr) throw dErr;
            return ok({ deletedCount: idsToDelete.length, message: `Permanently deleted ${idsToDelete.length} ticket(s).` });
        }

        // ── 3. Bulk Resolve ──
        if (action === 'bulk_resolve') {
            const ids = ticket_ids || (ticket_id ? [ticket_id] : []);
            if (!ids.length) return fail('No ticket IDs provided.', 'MISSING_TICKET_IDS');

            const { error: uErr } = await supabaseAdmin
                .from('support_tickets')
                .update({
                    status: 'resolved',
                    resolved_by: adminIdentifier,
                    resolved_at: now,
                    admin_notes: admin_notes || 'Bulk resolved by Administrator.',
                    updated_at: now
                })
                .in('id', ids);

            if (uErr) throw uErr;
            return ok({ updatedCount: ids.length, message: `Marked ${ids.length} ticket(s) as resolved.` });
        }

        // ── 4. Bulk In-Progress ──
        if (action === 'bulk_in_progress') {
            const ids = ticket_ids || (ticket_id ? [ticket_id] : []);
            if (!ids.length) return fail('No ticket IDs provided.', 'MISSING_TICKET_IDS');

            const { error: uErr } = await supabaseAdmin
                .from('support_tickets')
                .update({
                    status: 'in_progress',
                    updated_at: now
                })
                .in('id', ids);

            if (uErr) throw uErr;
            return ok({ updatedCount: ids.length, message: `Marked ${ids.length} ticket(s) as in progress.` });
        }

        // Single ticket operations require ticket_id
        if (!ticket_id) return fail('ticket_id is required.', 'MISSING_TICKET_ID');

        const { data: ticket, error: tErr } = await supabaseAdmin
            .from('support_tickets')
            .select('*')
            .eq('id', ticket_id)
            .single();

        if (tErr || !ticket) return fail('Ticket not found.', 'TICKET_NOT_FOUND', 404);

        // ── 5. Single Delete ──
        if (action === 'delete') {
            const { error: delErr } = await supabaseAdmin
                .from('support_tickets')
                .delete()
                .eq('id', ticket_id);

            if (delErr) throw delErr;
            return ok({ message: `Ticket #${ticket.ticket_number} deleted permanently.` });
        }

        // ── 6. Save Admin Notes Only ──
        if (action === 'save_notes') {
            const { data: updatedTicket, error: noteErr } = await supabaseAdmin
                .from('support_tickets')
                .update({
                    admin_notes: admin_notes || '',
                    updated_at: now
                })
                .eq('id', ticket_id)
                .select()
                .single();

            if (noteErr) throw noteErr;
            return ok({ ticket: updatedTicket, message: `Admin note saved for ticket #${ticket.ticket_number}.` });
        }

        // ── 7. Re-open Ticket ──
        if (action === 'reopen') {
            const reopenedNotes = admin_notes
                ? `${ticket.admin_notes ? ticket.admin_notes + '\n' : ''}[Re-opened by ${adminIdentifier}]: ${admin_notes}`
                : ticket.admin_notes;

            const { data: updatedTicket, error: rErr } = await supabaseAdmin
                .from('support_tickets')
                .update({
                    status: 'open',
                    admin_notes: reopenedNotes,
                    resolved_by: null,
                    resolved_at: null,
                    updated_at: now
                })
                .eq('id', ticket_id)
                .select()
                .single();

            if (rErr) throw rErr;
            return ok({ ticket: updatedTicket, message: `Ticket #${ticket.ticket_number} re-opened to active status.` });
        }

        // ── 8. 1-Click Formula Password Reset ──
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

        // ── 9. Status Updates (resolve, in_progress, reject) ──
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

export async function DELETE(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const body = await req.json().catch(() => ({}));
        const ticketIds = body?.ticket_ids || (id ? [id] : []);

        if (!ticketIds.length) {
            return fail('ticket_id or ticket_ids is required for deletion.', 'MISSING_TICKET_ID');
        }

        const { error } = await supabaseAdmin
            .from('support_tickets')
            .delete()
            .in('id', ticketIds);

        if (error) throw error;

        return ok({
            deletedCount: ticketIds.length,
            message: `Permanently deleted ${ticketIds.length} support ticket(s).`
        });
    } catch (err) {
        console.error('[DELETE /api/admin/support/tickets]', err);
        return fail(err.message || 'Failed to delete tickets.', 'TICKET_DELETE_ERROR', 500);
    }
}
