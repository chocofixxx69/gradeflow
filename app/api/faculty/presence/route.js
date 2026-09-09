import { NextResponse } from 'next/server';
import { getStaffSession } from '../../../../lib/server-session';
import {
    recordFacultyHeartbeat,
    recordFacultyOffline,
    getAllFacultyPresence,
} from '../../../../lib/presence-tracker';

export async function POST(req) {
    try {
        let body = {};
        const contentType = req.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            body = await req.json().catch(() => ({}));
        } else {
            // navigator.sendBeacon sends text/plain or blob
            const text = await req.text().catch(() => '');
            if (text) {
                try {
                    body = JSON.parse(text);
                } catch {
                    body = {};
                }
            }
        }

        const staffSession = getStaffSession(req, 'faculty') || getStaffSession(req);
        const facultyId = body.faculty_id || staffSession?.sub || staffSession?.id || null;
        const facultyName = body.faculty_name || staffSession?.name || staffSession?.full_name || staffSession?.email || 'Faculty Member';
        const action = (body.action || 'heartbeat').toLowerCase().trim();
        const page = body.page || null;

        if (!facultyId) {
            return NextResponse.json({ ok: false, error: 'No faculty identifier identified' }, { status: 400 });
        }

        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
        const userAgent = req.headers.get('user-agent') || 'Faculty Web Client';

        if (action === 'offline' || action === 'leave' || action === 'disconnect') {
            const pres = await recordFacultyOffline({
                faculty_id: facultyId,
                faculty_name: facultyName,
                ip_address: ipAddress,
                user_agent: userAgent,
                reason: body.reason || 'Browser tab closed or navigated away',
            });
            return NextResponse.json({ ok: true, action: 'offline', presence: pres });
        }

        // Default: heartbeat
        const pres = await recordFacultyHeartbeat({
            faculty_id: facultyId,
            faculty_name: facultyName,
            ip_address: ipAddress,
            user_agent: userAgent,
            page,
        });

        return NextResponse.json({ ok: true, action: 'heartbeat', presence: pres });
    } catch (err) {
        console.warn('[POST /api/faculty/presence] error:', err?.message || err);
        return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
    }
}

export async function GET() {
    try {
        const presence = getAllFacultyPresence();
        return NextResponse.json({
            ok: true,
            presence,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        return NextResponse.json({ ok: false, error: err?.message || 'Server error' }, { status: 500 });
    }
}
