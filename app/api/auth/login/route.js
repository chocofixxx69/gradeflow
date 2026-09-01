import { createHash, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSessionCookie, signStudentSession } from '../../../../lib/server-session';
import { verifyStudentPassword } from '../../../../lib/student-auth';
import { checkRateLimit, getClientIp } from '../../../../lib/rate-limit';

const ADMIN_PASSWORD_SALT = 'vtu_calc_secure_2026';

let supabaseAdmin = null;

function getSupabaseAdmin() {
    if (supabaseAdmin) return supabaseAdmin;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase admin credentials are not configured.');
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    return supabaseAdmin;
}

function hashAdminPassword(password) {
    return createHash('sha256').update(`${password}${ADMIN_PASSWORD_SALT}`).digest('hex');
}

function safeCompareHex(a, b) {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
}

function successResponse(body, sessionPayload) {
    const response = NextResponse.json(body);
    response.cookies.set(createSessionCookie(sessionPayload));
    return response;
}

function failureResponse(error, status = 401) {
    return NextResponse.json({ success: false, error }, { status });
}

async function loginAdmin({ email, password, systemToken }) {
    const trimmedEmail = String(email || '').trim().toLowerCase();
    const trimmedPassword = String(password || '').trim();
    const cleanToken = String(systemToken || '').trim();
    const fallbackGatekeeper = process.env.NEXT_PUBLIC_ADMIN_GATEKEEPER || 'GF-ADMIN-PROD';

    const supabase = getSupabaseAdmin();

    let activeToken = fallbackGatekeeper;
    try {
        const { data: secSetting } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'security_auth')
            .maybeSingle();
        if (secSetting?.value?.system_access_token) {
            activeToken = secSetting.value.system_access_token;
        }
    } catch (e) {
        // Fallback to env
    }

    if (cleanToken !== activeToken && cleanToken !== fallbackGatekeeper) {
        return failureResponse('Invalid System Access Token. Access Denied.', 403);
    }

    const { data: admin, error } = await supabase
        .from('admin_users')
        .select('id, email, password_hash')
        .eq('email', trimmedEmail)
        .maybeSingle();

    if (error) throw error;

    const hashedInput = hashAdminPassword(trimmedPassword);
    if (!admin?.password_hash || !safeCompareHex(hashedInput, admin.password_hash)) {
        return failureResponse('Those credentials are not recognised.', 401);
    }

    const localSession = {
        id: admin.id,
        email: admin.email,
        role: 'superadmin',
        token: systemToken,
    };

    return successResponse(
        { success: true, role: 'admin', session: localSession },
        { sub: admin.id, email: admin.email, role: 'admin' }
    );
}

async function loginFaculty({ email, password }) {
    const normalizedEmail = String(email || '').toLowerCase();

    const supabase = getSupabaseAdmin();
    const { data: faculty, error } = await supabase
        .from('faculty_onboarding')
        .select('*')
        .eq('email', normalizedEmail)
        .maybeSingle();

    if (error) throw error;

    if (!faculty) {
        return failureResponse('No faculty account found for this institutional email.', 401);
    }

    if (faculty.status === 'suspended') {
        return failureResponse(
            faculty.suspended_reason || 'Your faculty account access has been suspended by the Institution Administrator. Please contact the Admin Office.',
            403
        );
    }

    if (faculty.status !== 'approved') {
        return failureResponse(`Your faculty account is currently pending verification (${faculty.status}).`, 401);
    }

    const passwordMatches = await bcrypt.compare(password, faculty.password || '');
    if (!passwordMatches) {
        return failureResponse('The password you entered is incorrect.', 401);
    }

    const localSession = {
        id: faculty.id,
        name: faculty.full_name,
        full_name: faculty.full_name,
        email: faculty.email,
        department: faculty.department,
    };

    return successResponse(
        { success: true, role: 'faculty', session: localSession },
        {
            sub: faculty.id,
            email: faculty.email,
            role: 'faculty',
            name: faculty.full_name,
        }
    );
}

async function loginStudent({ usn, email, password }) {
    const rawInput = String(email || usn || '').trim();
    const cleanUSN = (rawInput.includes('@') ? rawInput.split('@')[0] : rawInput).toUpperCase();

    if (!cleanUSN) return failureResponse('USN or email is required.', 400);
    if (!password) return failureResponse('Password is required.', 400);

    const supabase = getSupabaseAdmin();
    const { data: student, error } = await supabase
        .from('students')
        .select('id, usn, name, branch, scheme, password_hash, is_suspended, suspended_reason')
        .eq('usn', cleanUSN)
        .maybeSingle();

    if (error) throw error;
    if (!student) return failureResponse('USN not found in student directory. Please contact your department.', 404);

    if (student.is_suspended) {
        return failureResponse(
            student.suspended_reason || 'This student account has been suspended by the Institution Administrator. Please contact the Admin Office.',
            403
        );
    }

    const passwordMatches = await verifyStudentPassword(password, student.password_hash, student.name, student.usn);
    if (!passwordMatches) {
        return failureResponse('Incorrect password. Please try again or use your default institutional password.', 401);
    }

    // If password_hash was not set yet, save the bcrypt hash now
    if (!student.password_hash) {
        const newHash = await hashStudentPassword(password);
        await supabase
            .from('students')
            .update({ password_hash: newHash, updated_at: new Date().toISOString() })
            .eq('id', student.id);
    }

    // Students don't get the httpOnly staff cookie — their session is the
    // returned JSON, stored client-side and replayed via x-student-* headers.
    const session = {
        usn: student.usn,
        id: student.id,
        name: student.name,
        branch: student.branch,
        scheme: student.scheme,
        role: 'student',
        signature: signStudentSession({ usn: student.usn, id: student.id }),
    };

    return NextResponse.json({ success: true, role: 'student', session });
}

export async function POST(req) {
    try {
        const ip = getClientIp(req);
        const { allowed, retryAfterSeconds } = checkRateLimit(`login:${ip}`, { limit: 10, windowMs: 60_000 });
        if (!allowed) {
            return NextResponse.json(
                { success: false, error: 'Too many login attempts. Please try again shortly.' },
                { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
            );
        }

        const body = await req.json();

        if (body?.role === 'admin') {
            return await loginAdmin(body);
        }

        if (body?.role === 'faculty') {
            return await loginFaculty(body);
        }

        if (body?.role === 'student' || body?.usn) {
            return await loginStudent(body);
        }

        return failureResponse('Invalid login role.', 400);
    } catch (err) {
        console.error('[POST /api/auth/login]', err);
        return NextResponse.json(
            { success: false, error: 'Authentication service unavailable. Please try again.' },
            { status: 500 }
        );
    }
}
