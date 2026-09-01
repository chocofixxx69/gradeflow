import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

function generateTicketNumber() {
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    const rand = Math.floor(1000 + Math.random() * 9000);
    return `GF-${dateStr}-${rand}`;
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const {
            user_type, // 'student' | 'faculty'
            user_identifier, // USN or Email
            user_name,
            user_email,
            issue_type, // 'password_reset' | 'login_issue' | 'marks_dispute' | 'profile_correction' | 'other'
            subject,
            description
        } = body || {};

        if (!user_type || !['student', 'faculty'].includes(user_type)) {
            return fail('Invalid user type. Must be student or faculty.', 'INVALID_USER_TYPE');
        }

        const cleanId = String(user_identifier || '').trim().toUpperCase();
        if (!cleanId) {
            return fail(user_type === 'student' ? 'USN is required.' : 'Institutional Email is required.', 'MISSING_IDENTIFIER');
        }

        if (!subject || subject.trim().length < 3) {
            return fail('Please provide a brief subject for your issue (min 3 characters).', 'MISSING_SUBJECT');
        }

        if (!description || description.trim().length < 5) {
            return fail('Please provide a description of the problem (min 5 characters).', 'MISSING_DESCRIPTION');
        }

        // Verify if student or faculty exists to enrich ticket details
        let resolvedName = user_name || '';
        let resolvedEmail = user_email || '';

        if (user_type === 'student') {
            const { data: student } = await supabaseAdmin
                .from('students')
                .select('name, branch')
                .eq('usn', cleanId)
                .maybeSingle();

            if (student?.name) resolvedName = resolvedName || student.name;
        } else if (user_type === 'faculty') {
            const { data: faculty } = await supabaseAdmin
                .from('faculty_onboarding')
                .select('full_name, email, department')
                .eq('email', cleanId.toLowerCase())
                .maybeSingle();

            if (faculty?.full_name) resolvedName = resolvedName || faculty.full_name;
            if (faculty?.email) resolvedEmail = resolvedEmail || faculty.email;
        }

        const ticketNumber = generateTicketNumber();

        const { data: ticket, error } = await supabaseAdmin
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
                status: 'open',
            })
            .select()
            .single();

        if (error) throw error;

        return ok({
            ticketNumber: ticket.ticket_number,
            ticket,
            message: `Your issue ticket (#${ticket.ticket_number}) has been submitted to the Administrator.`
        });
    } catch (err) {
        console.error('[POST /api/support/tickets]', err);
        return fail(err.message || 'Failed to submit issue ticket.', 'TICKET_SUBMISSION_ERROR', 500);
    }
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const identifier = (searchParams.get('user_identifier') || '').trim().toUpperCase();

        if (!identifier) {
            return fail('user_identifier query param is required.', 'MISSING_IDENTIFIER');
        }

        const { data: tickets, error } = await supabaseAdmin
            .from('support_tickets')
            .select('*')
            .or(`user_identifier.eq.${identifier},user_email.eq.${identifier.toLowerCase()}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return ok({ tickets: tickets || [] });
    } catch (err) {
        console.error('[GET /api/support/tickets]', err);
        return fail('Failed to fetch tickets.', 'TICKET_FETCH_ERROR', 500);
    }
}
