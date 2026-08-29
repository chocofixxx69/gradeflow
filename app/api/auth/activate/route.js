import { NextResponse } from 'next/server';
import { hashStudentPassword } from '../../../../lib/student-auth';
import { signStudentSession } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

function fail(error, status = 400) {
    return NextResponse.json({ success: false, error }, { status });
}

function detectBranch(usn) {
    const branchMatch = usn.match(/^\d[A-Z]{2}\d{2}([A-Z]{2,4})\d{3}$/);
    let detected = branchMatch ? branchMatch[1] : '';
    if (detected === 'CS') detected = 'CSE';
    if (detected === 'IS') detected = 'ISE';
    if (detected === 'EC') detected = 'ECE';
    if (detected === 'ME') detected = 'MECH';
    return detected || null;
}

function buildSession(profile) {
    return {
        usn: profile.usn,
        name: profile.name,
        id: profile.id,
        branch: profile.branch,
        scheme: profile.scheme,
        role: 'student',
        signature: signStudentSession({ usn: profile.usn, id: profile.id }),
    };
}

// Activates a student account: sets the initial password (bcrypt) and
// recovery PIN, creating the student's profile row if it doesn't exist yet
// (e.g. no scraped/faculty-added record for this USN). Returns a signed
// session the client stores exactly as it does after login.
export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const rawInput = String(body?.usn || '').trim();
        const password = String(body?.password || '');

        const cleanUSN = (rawInput.includes('@') ? rawInput.split('@')[0] : rawInput).toUpperCase();
        if (!cleanUSN) return fail('Please enter a valid USN.');
        if (!password || password.length < 4) return fail('Password must be at least 4 characters.');

        const { data: existing, error: existErr } = await supabaseAdmin
            .from('students')
            .select('*')
            .eq('usn', cleanUSN)
            .maybeSingle();

        if (existErr) throw existErr;

        const passwordHash = await hashStudentPassword(password);
        const generatedPin = Math.floor(1000 + Math.random() * 9000).toString();

        if (existing) {
            if (existing.password_hash) {
                return fail('This USN is already activated. Please use "Sign In" instead.', 409);
            }

            const { data: updated, error: upErr } = await supabaseAdmin
                .from('students')
                .update({
                    password_hash: passwordHash,
                    recovery_pin: generatedPin,
                    activated_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq('usn', cleanUSN)
                .select()
                .single();

            if (upErr) throw upErr;

            return NextResponse.json({ success: true, session: buildSession(updated), pin: generatedPin });
        }

        const { data: created, error: insertErr } = await supabaseAdmin
            .from('students')
            .insert({
                usn: cleanUSN,
                name: cleanUSN,
                password_hash: passwordHash,
                recovery_pin: generatedPin,
                activated_at: new Date().toISOString(),
                scheme: '2022',
                branch: detectBranch(cleanUSN),
            })
            .select()
            .single();

        if (insertErr) throw insertErr;

        return NextResponse.json({ success: true, session: buildSession(created), pin: generatedPin });
    } catch (err) {
        console.error('[POST /api/auth/activate]', err);
        return fail(err.message || 'Something went wrong during activation. Please try again.', 500);
    }
}
