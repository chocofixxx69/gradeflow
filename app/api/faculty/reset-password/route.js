import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 10;

let supabaseAdmin = null;
function getAdminClient() {
    if (supabaseAdmin) return supabaseAdmin;
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('Supabase admin credentials are missing.');
    supabaseAdmin = createClient(url, key);
    return supabaseAdmin;
}

function fail(error, status = 400) {
    return NextResponse.json({ success: false, error }, { status });
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const rawEmail = String(body?.email || '').trim().toLowerCase();
        const password = String(body?.password || '');
        const confirmPassword = body?.confirmPassword !== undefined ? String(body.confirmPassword) : null;

        if (!rawEmail) return fail('Institutional email is required.');
        if (!password || password.length < 6) return fail('New password must be at least 6 characters.');
        if (confirmPassword !== null && password !== confirmPassword) {
            return fail('Passwords do not match.');
        }

        const supabase = getAdminClient();

        // 1. Fetch faculty record by email
        const { data: faculty, error: fetchErr } = await supabase
            .from('faculty_onboarding')
            .select('id, full_name, email, status, suspended_reason')
            .eq('email', rawEmail)
            .maybeSingle();

        if (fetchErr) {
            console.error('[Faculty Reset Password] Supabase query error:', fetchErr);
            return fail('Database query failed. Please try again.', 500);
        }

        if (!faculty) {
            return fail('No faculty account found with this email address.', 404);
        }

        if (faculty.status === 'suspended') {
            return fail(
                faculty.suspended_reason || 'This faculty account is suspended. Please contact the administrator.',
                403
            );
        }

        // 2. Hash new password with bcrypt
        const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        // 3. Update password in database
        const { error: updateErr } = await supabase
            .from('faculty_onboarding')
            .update({
                password: hashedPassword,
                password_hash: hashedPassword,
            })
            .eq('id', faculty.id);

        if (updateErr) {
            console.error('[Faculty Reset Password] Update error:', updateErr);
            return fail('Failed to update password. Please try again.', 500);
        }

        return NextResponse.json({
            success: true,
            message: 'Password reset successfully! You can now sign in with your new password.',
        });
    } catch (err) {
        console.error('[POST /api/faculty/reset-password] Unexpected error:', err);
        return fail(err.message || 'An unexpected error occurred. Please try again.', 500);
    }
}
