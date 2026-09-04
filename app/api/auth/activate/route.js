import { NextResponse } from 'next/server';
import { hashStudentPassword } from '../../../../lib/student-auth';
import { signStudentSession } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

function fail(error, status = 400) {
    return NextResponse.json({ success: false, error }, { status });
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

// Activates a student account: sets the initial password (bcrypt) and recovery
// PIN on an EXISTING student record. Returns a signed session the client stores
// exactly as it does after login.
//
// Activation never creates the profile. A student row is created in exactly one
// place — backend/scraper/engine.py, after VTU actually returns results for that
// USN — plus the explicit admin "add student" action. Creating one here meant a
// mistyped USN silently produced a real profile with the USN as its name, a
// guessed branch and a hardcoded 2022 scheme, which then had to be cleaned up by
// hand. A USN with no record is now reported as not-yet-fetched instead.
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

        // No record for this USN: do not invent one. Either the USN is mistyped,
        // or this student's results have not been fetched from VTU yet.
        return fail(
            `No results have been fetched for ${cleanUSN} yet. Check the USN is correct, ` +
            `and ask your faculty to fetch it from VTU before activating.`,
            404
        );
    } catch (err) {
        console.error('[POST /api/auth/activate]', err);
        return fail(err.message || 'Something went wrong during activation. Please try again.', 500);
    }
}
