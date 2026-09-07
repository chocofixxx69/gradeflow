import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { requireStaff } from '../../../lib/server-session';

export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const body = await req.json();
        const { action, usn, data, reason, context_module, method, details, metadata } = body;

        // Extract client network and device fingerprint
        const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || '127.0.0.1';
        const userAgent = req.headers.get('user-agent') || 'Interactive Web Client';

        // 1. Log action in Supabase 'faculty_activity' with full 5W1H governance context
        await supabase.from('faculty_activity').insert({
            faculty_id: session.sub,
            faculty_name: session.name || session.email || 'Unknown',
            target_usn: usn || null,
            action_type: action || 'VIEW_RECORD',
            sync_status: 'SUCCESS',
            context_module: context_module || 'Faculty Portal',
            reason: reason || null,
            method: method || 'Web UI',
            details: details || null,
            metadata: metadata || data || {},
            ip_address: ipAddress,
            user_agent: userAgent,
        });

        // 2. If action is 'sync_to_sheets', trigger n8n webhook
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

        // 3. Update faculty stats in Supabase
        // await supabase.rpc('increment_faculty_stats', { f_id: facultyId });

        return NextResponse.json({ success: true, message: 'Action processed and synced to Google Sheets.' });
    } catch (error) {
        console.error('Faculty API Error:', error);
        return NextResponse.json({ success: false, error: 'An internal error occurred. Please try again later.' }, { status: 500 });
    }
}
