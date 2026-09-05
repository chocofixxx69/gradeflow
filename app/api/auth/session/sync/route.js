import { NextResponse } from 'next/server';
import {
    signSession,
    createSessionCookie,
    getStaffSession,
    ADMIN_SESSION_COOKIE,
    FACULTY_SESSION_COOKIE,
    STAFF_SESSION_COOKIE,
} from '../../../../../lib/server-session';
import { createClient } from '@supabase/supabase-js';

let supabaseAdmin = null;

function getSupabaseAdmin() {
    if (supabaseAdmin) return supabaseAdmin;
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) return null;
    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    return supabaseAdmin;
}

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const { role, token, email } = body || {};

        if (role === 'admin') {
            const cleanToken = String(token || '').trim();
            const fallbackGatekeeper = process.env.NEXT_PUBLIC_ADMIN_GATEKEEPER || 'GF-ADMIN-PROD';

            let activeToken = fallbackGatekeeper;
            const supabase = getSupabaseAdmin();
            if (supabase) {
                try {
                    const { data: secSetting } = await supabase
                        .from('system_settings')
                        .select('value')
                        .eq('key', 'security_auth')
                        .maybeSingle();
                    if (secSetting?.value?.system_access_token) {
                        activeToken = secSetting.value.system_access_token;
                    }
                } catch {}
            }

            if (cleanToken !== activeToken && cleanToken !== fallbackGatekeeper) {
                return NextResponse.json({ success: false, error: 'Invalid admin token' }, { status: 403 });
            }

            const adminEmail = String(email || 'admin@anjuman.com').trim().toLowerCase();
            const sessionPayload = {
                sub: 'admin-session',
                email: adminEmail,
                role: 'admin',
            };

            const sessionToken = signSession(sessionPayload);
            const res = NextResponse.json({
                success: true,
                role: 'admin',
                sessionToken,
                session: {
                    email: adminEmail,
                    role: 'superadmin',
                    token: cleanToken,
                    sessionToken,
                },
            });

            res.cookies.set(createSessionCookie(sessionPayload, ADMIN_SESSION_COOKIE));
            res.cookies.set(createSessionCookie(sessionPayload, STAFF_SESSION_COOKIE));
            return res;
        }

        return NextResponse.json({ success: false, error: 'Unsupported role for sync' }, { status: 400 });
    } catch (err) {
        console.error('[POST /api/auth/session/sync]', err);
        return NextResponse.json({ success: false, error: 'Failed to sync session' }, { status: 500 });
    }
}

export async function GET(req) {
    const adminSession = getStaffSession(req, 'admin');
    if (adminSession) {
        return NextResponse.json({ success: true, authenticated: true, role: 'admin', session: adminSession });
    }

    const staffSession = getStaffSession(req);
    if (staffSession) {
        return NextResponse.json({ success: true, authenticated: true, role: staffSession.role, session: staffSession });
    }

    return NextResponse.json({ success: false, authenticated: false }, { status: 401 });
}
