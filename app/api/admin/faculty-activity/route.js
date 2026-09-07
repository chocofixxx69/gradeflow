import { NextResponse } from 'next/server';
import { requireStaff, requireAdmin } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

export async function POST(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError) return authError;

        const body = await req.json();
        const {
            faculty_id,
            faculty_name,
            action_type,
            target_usn,
            reason,
            context_module,
            method,
            details,
            metadata,
            sync_status,
        } = body;

        if (!action_type) {
            return NextResponse.json({ error: 'action_type is required' }, { status: 400 });
        }

        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
        const userAgent = req.headers.get('user-agent') || 'Admin Terminal (Simulated Action)';

        let validFacultyId = null;
        if (faculty_id && typeof faculty_id === 'string') {
            const trimmed = faculty_id.trim();
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed)) {
                validFacultyId = trimmed;
            }
        }

        const supabaseAdmin = getAdminClient();
        const { data, error } = await supabaseAdmin.from('faculty_activity').insert({
            faculty_id: validFacultyId,
            faculty_name: faculty_name || session?.email || 'Institution Administrator',
            action_type,
            target_usn: target_usn ? target_usn.trim().toUpperCase() : null,
            reason: reason || 'Verified institutional pedagogical administration action.',
            context_module: context_module || 'Admin Terminal > Faculty Pedagogical Audit',
            method: method || 'Interactive Web UI (Admin Console)',
            details: details || `Administrator recorded action ${action_type} for ${target_usn || 'general cohort'}.`,
            metadata: metadata || {},
            sync_status: sync_status || 'SUCCESS',
            ip_address: ipAddress,
            user_agent: userAgent,
        }).select().single();

        if (error) {
            console.error('[POST /api/admin/faculty-activity] Insert error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            message: 'Pedagogical action record logged successfully with 5W1H context.',
            record: data,
        });
    } catch (err) {
        console.error('[POST /api/admin/faculty-activity] Exception:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['admin', 'faculty']);
        if (authError) return authError;


        const { searchParams } = new URL(req.url);
        const limit = Math.min(parseInt(searchParams.get('limit') || '300', 10), 1000);

        const supabaseAdmin = getAdminClient();
        const [
            { data: activity, error: aErr },
            { data: faculty, error: fErr }
        ] = await Promise.all([
            supabaseAdmin.from('faculty_activity').select('*').order('created_at', { ascending: false }).limit(limit),
            supabaseAdmin.from('faculty_onboarding').select('id, full_name, email, department, designation, employee_id, status, last_login_at, last_login_ip'),
        ]);

        if (aErr) throw aErr;

        return NextResponse.json({
            success: true,
            activity: activity || [],
            faculty: faculty || [],
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        console.error('[GET /api/admin/faculty-activity] Exception:', err);
        return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
    }
}
