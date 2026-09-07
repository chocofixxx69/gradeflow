import { NextResponse } from 'next/server';
import { requireStaff } from '../../../lib/server-session';
import { getAdminClient } from '../../../lib/analytics-data';

export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const { session } = requireStaff(req, ['faculty', 'admin']);

        const facultyId = session?.sub || body.facultyId || body.faculty_id || null;
        const facultyName = session?.name || session?.email || body.facultyName || body.faculty_name || 'Faculty Member';
        const { action, usn, data, reason, context_module, method, details, metadata } = body;

        // Extract client network and device fingerprint
        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
        const userAgent = req.headers.get('user-agent') || 'Interactive Web Client';

        const supabaseAdmin = getAdminClient();

        // 1. Log action in Supabase 'faculty_activity' with full 5W1H governance context
        const insertPayload = {
            faculty_id: facultyId,
            faculty_name: facultyName,
            target_usn: usn ? usn.trim().toUpperCase() : null,
            action_type: action || 'VIEW_RECORD',
            sync_status: 'SUCCESS',
            context_module: context_module || 'Faculty Portal',
            reason: reason || null,
            method: method || 'Interactive Web UI',
            details: details || null,
            metadata: metadata || data || {},
            ip_address: ipAddress,
            user_agent: userAgent,
        };

        const { data: logRecord, error: logError } = await supabaseAdmin
            .from('faculty_activity')
            .insert(insertPayload)
            .select()
            .single();

        if (logError) {
            console.error('[POST /api/faculty-action] Log error:', logError);
        }

        // 2. Real-time presence heartbeat: Update faculty_onboarding last_login_at
        if (facultyId) {
            try {
                await supabaseAdmin.from('faculty_onboarding').update({
                    last_login_at: new Date().toISOString(),
                    last_login_ip: ipAddress,
                }).eq('id', facultyId);
            } catch (presenceErr) {
                console.warn('[POST /api/faculty-action] Presence update notice:', presenceErr?.message);
            }
        }

        // 3. If action is 'sync_to_sheets', trigger n8n webhook
        if (action === 'sync_to_sheets') {
            const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL;
            if (N8N_WEBHOOK_URL) {
                const response = await fetch(N8N_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ usn, marks: data, source: 'VTUCalc Faculty Portal' })
                });

                if (!response.ok) throw new Error('n8n synchronization failed');
            }
        }

        return NextResponse.json({
            success: true,
            message: 'Action recorded successfully with 5W1H audit context.',
            record: logRecord
        });
    } catch (error) {
        console.error('Faculty API Error:', error);
        return NextResponse.json({ success: false, error: 'An internal error occurred: ' + (error.message || error) }, { status: 500 });
    }
}

