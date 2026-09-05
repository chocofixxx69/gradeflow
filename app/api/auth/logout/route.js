import { NextResponse } from 'next/server';
import {
    ADMIN_SESSION_COOKIE,
    FACULTY_SESSION_COOKIE,
    STAFF_SESSION_COOKIE,
} from '../../../../lib/server-session';

export async function POST() {
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
