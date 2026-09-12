import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getClientIp } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function ok(message, data = {}) {
    return NextResponse.json({ success: true, message, ...data });
}

function fail(message, status = 400, code = 'PASSWORD_ERROR') {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(req) {
    try {
        const { searchParams } = new URL(req.url);
        const queryEmail = searchParams.get('email')?.toLowerCase()?.trim();
        const queryId = searchParams.get('faculty_id')?.trim();
        const headerEmail = req.headers?.get?.('x-faculty-email')?.toLowerCase()?.trim();
        const headerId = req.headers?.get?.('x-faculty-id')?.trim();

        const { session, error: authError } = requireStaff(req, ['faculty', 'admin'], 'faculty');
        if (authError) return authError;

        const body = await req.json().catch(() => ({}));
        const currentPassword = String(body.currentPassword || '');
        const newPassword = String(body.newPassword || '');
        const confirmPassword = String(body.confirmPassword || '');

        if (!currentPassword) {
            return fail('Current password is required.');
        }
        if (!newPassword || newPassword.length < 6) {
            return fail('New password must be at least 6 characters.');
        }
        if (newPassword !== confirmPassword) {
            return fail('New password and confirmation do not match.');
        }

        const supabase = getAdminClient();
        // A faculty may only change their OWN password — identity is taken from
        // the verified session, never from client-supplied id/email. Only an
        // admin may target another account (id/email override).
        const isAdmin = session?.role === 'admin';
        const facultyId = isAdmin ? (queryId || headerId || session?.sub || session?.id) : (session?.sub || session?.id);
        const facultyEmail = isAdmin
            ? (queryEmail || headerEmail || session?.email?.toLowerCase()?.trim())
            : session?.email?.toLowerCase()?.trim();

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facultyId || '');
        let query = supabase.from('faculty_onboarding').select('id, full_name, email, password_hash, generated_access_key');
        if (isUuid) {
            query = query.eq('id', facultyId);
        } else if (facultyEmail && facultyEmail !== 'admin@anjuman.com') {
            query = query.ilike('email', facultyEmail);
        }

        let { data: faculty, error: fetchErr } = await query.maybeSingle();
        if (!faculty && facultyEmail && facultyEmail !== 'admin@anjuman.com') {
            const { data: byEmail } = await supabase
                .from('faculty_onboarding')
                .select('id, full_name, email, password_hash, generated_access_key')
                .ilike('email', facultyEmail)
                .maybeSingle();
            if (byEmail) faculty = byEmail;
        }

        if (fetchErr || !faculty) {
            return fail('Faculty account not found.', 404, 'NOT_FOUND');
        }

        // Verify current password
        let matches = false;
        if (faculty.password_hash) {
            matches = await bcrypt.compare(currentPassword, faculty.password_hash).catch(() => false);
        }
        // Also allow admin-issued Access Key fallback
        if (!matches && faculty.generated_access_key) {
            const cleanInput = currentPassword.trim().toUpperCase().replace(/\s+/g, '');
            const cleanKey = String(faculty.generated_access_key).trim().toUpperCase().replace(/\s+/g, '');
            if (cleanInput && cleanKey && cleanInput === cleanKey) {
                matches = true;
            }
        }

        if (!matches) {
            return fail('The current password you entered is incorrect. Please try again.', 401, 'INVALID_CREDENTIALS');
        }

        // Hash new password
        const hashed = await bcrypt.hash(newPassword, 10);

        // Update database
        const { error: updateErr } = await supabase
            .from('faculty_onboarding')
            .update({
                password_hash: hashed,
                password: hashed
            })
            .eq('id', faculty.id);

        if (updateErr) {
            console.error('[change-password] DB update error:', updateErr);
            return fail('Failed to update password. Please try again.', 500, 'DATABASE_ERROR');
        }

        // Log audit trail
        try {
            const clientIp = req ? getClientIp(req) : '127.0.0.1';
            const clientUa = req?.headers?.get ? (req.headers.get('user-agent') || 'Browser Client') : 'Browser Client';
            await supabase.from('faculty_activity').insert({
                faculty_id: faculty.id,
                faculty_name: faculty.full_name,
                action_type: 'FACULTY_PASSWORD_CHANGE',
                sync_status: 'SUCCESS',
                context_module: 'Faculty Portal > Security Settings',
                reason: 'Faculty member successfully changed institutional credentials.',
                method: 'Web Portal Self-Service',
                details: `${faculty.full_name} changed their password.`,
                ip_address: clientIp,
                user_agent: clientUa,
                metadata: {
                    changed_at: new Date().toISOString()
                }
            });
        } catch (auditErr) {
            console.warn('[change-password] Audit record notice:', auditErr?.message);
        }

        return ok('Password changed successfully! Please use your new password next time you sign in.');
    } catch (err) {
        console.error('[POST /api/faculty/settings/change-password]', err);
        return fail('Internal server error while changing password: ' + (err.message || err), 500, 'INTERNAL_ERROR');
    }
}
