import { NextResponse } from 'next/server';
import {
    ADMIN_SESSION_COOKIE,
    FACULTY_SESSION_COOKIE,
    STAFF_SESSION_COOKIE,
    getStaffSession,
} from '../../../../lib/server-session';
import { logFacultyActivityServer } from '../../../../lib/server-audit';

export async function POST(req) {
    try {
        const body = await req?.json?.().catch(() => ({})) || {};
        const staffSession = req ? (getStaffSession(req, 'faculty') || getStaffSession(req, 'admin') || getStaffSession(req)) : null;

        if (staffSession?.role === 'faculty' || body.faculty_id || body.faculty_name) {
            await logFacultyActivityServer(req, {
                faculty_id: body.faculty_id || staffSession?.sub || null,
                faculty_name: body.faculty_name || staffSession?.name || null,
                action_type: 'FACULTY_LOGOUT',
                context_module: 'Faculty Portal > Session Management',
                reason: 'Instructor completed academic surveillance session and safely logged out.',
                details: `${body.faculty_name || staffSession?.name || 'Faculty Member'} logged out of the portal (check-out).`,
                metadata: {
                    terminated_at: new Date().toISOString(),
                    role: staffSession?.role || 'faculty',
                },
            });
        }
    } catch (err) {
        console.warn('[POST /api/auth/logout] audit logging notice:', err?.message || err);
    }

    const res = NextResponse.json({ success: true, message: 'Logged out successfully.' });
    const clearCookie = (name) => ({
        name,
        value: '',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
    });

    res.cookies.set(clearCookie(ADMIN_SESSION_COOKIE));
    res.cookies.set(clearCookie(FACULTY_SESSION_COOKIE));
    res.cookies.set(clearCookie(STAFF_SESSION_COOKIE));
    return res;
}
