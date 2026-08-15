import { createHash, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createSessionCookie } from '../../../../lib/server-session';

const ADMIN_PASSWORD_SALT = 'vtu_calc_secure_2026';
const LOCAL_SESSION_SECRET = '_gradeflow_secret_v1_2026';

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

function hashLocalSessionSignature(value) {
    return createHash('sha256').update(`${value}${LOCAL_SESSION_SECRET}`).digest('hex');
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
    const gatekeeper = process.env.NEXT_PUBLIC_ADMIN_GATEKEEPER || 'GF-ADMIN-PROD';

    if (systemToken !== gatekeeper) {
        return failureResponse('Invalid System Access Token. Access Denied.', 403);
    }

    const supabase = getSupabaseAdmin();
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
        .eq('status', 'approved')
        .maybeSingle();

    if (error) throw error;

    if (!faculty) {
        return failureResponse('No approved faculty account found for this email.', 401);
    }

    if (faculty.password !== password) {
        return failureResponse('The password you entered is incorrect.', 401);
    }

    const localSession = {
        id: faculty.id,
        name: faculty.full_name,
        full_name: faculty.full_name,
        email: faculty.email,
        department: faculty.department,
        signature: hashLocalSessionSignature(faculty.email + faculty.id),
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

export async function POST(req) {
    try {
        const body = await req.json();

        if (body?.role === 'admin') {
            return await loginAdmin(body);
        }

        if (body?.role === 'faculty') {
            return await loginFaculty(body);
        }

        return failureResponse('Invalid login role.', 400);
    } catch (err) {
        console.error('[POST /api/auth/login]', err);
        return NextResponse.json(
            { success: false, error: err.message || 'Authentication service unavailable.' },
            { status: 500 }
        );
    }
}
