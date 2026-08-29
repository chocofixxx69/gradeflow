import { NextResponse } from 'next/server';
import { hashStudentPassword } from '../../../../lib/student-auth';
import { getAdminClient } from '../../../../lib/analytics-data';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';

const supabaseAdmin = getAdminClient();

function fail(error, status = 400) {
    return NextResponse.json({ success: false, error }, { status });
}

// Resets a student's password using their Recovery PIN. Does not return a
// session — the flow sends the user back to the login screen afterward.
// Rate limited more tightly than login — a 4-digit PIN is only 10,000
// combinations, so this endpoint is a direct brute-force target.
export async function POST(req) {
    try {
        const ip = getClientIp(req);
        const { allowed, retryAfterSeconds } = checkRateLimit(`reset-password:${ip}`, { limit: 5, windowMs: 5 * 60_000 });
        if (!allowed) {
            return NextResponse.json(
                { success: false, error: 'Too many attempts. Please try again shortly.' },
                { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
            );
        }

        const body = await req.json().catch(() => ({}));
        const rawInput = String(body?.usn || '').trim();
        const pin = String(body?.pin || '').trim();
        const password = String(body?.password || '');

        const cleanUSN = (rawInput.includes('@') ? rawInput.split('@')[0] : rawInput).toUpperCase();
        if (!cleanUSN) return fail('Please enter a valid USN.');
        if (!pin || pin.length !== 4) return fail('Please enter your 4-digit Recovery PIN.');
        if (!password || password.length < 4) return fail('Password must be at least 4 characters.');

        const { data: student, error: fetchErr } = await supabaseAdmin
            .from('students')
            .select('id, recovery_pin')
            .eq('usn', cleanUSN)
            .maybeSingle();

        if (fetchErr) throw fetchErr;
        if (!student) return fail('USN is not registered.', 404);
        if (!student.recovery_pin) return fail('This account does not have a Recovery PIN set. Please click "Activate" to setup your account.');
        if (String(student.recovery_pin).trim() !== pin) return fail('Incorrect Recovery PIN.', 401);

        const newHash = await hashStudentPassword(password);
        const { error: upErr } = await supabaseAdmin
            .from('students')
            .update({ password_hash: newHash, updated_at: new Date().toISOString() })
            .eq('usn', cleanUSN);

        if (upErr) throw upErr;

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[POST /api/auth/reset-password]', err);
        return fail(err.message || 'Something went wrong. Please try again.', 500);
    }
}
