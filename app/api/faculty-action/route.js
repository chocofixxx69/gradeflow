import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';
import { requireStaff } from '../../../lib/server-session';

export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const body = await req.json();
        const { action, usn, data } = body;

        // 1. Log action in Supabase 'faculty_activity' — attributed to the
        // authenticated session, never a client-supplied id.
        await supabase.from('faculty_activity').insert({
            faculty_id: session.sub,
            faculty_name: 'System Hook',
            target_usn: usn,
            action_type: action,
            sync_status: 'SUCCESS'
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
