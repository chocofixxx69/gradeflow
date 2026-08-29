import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/server-session';

const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

export async function POST(req) {
    const { error: authError } = requireAdmin(req);
    if (authError) return authError;

    try {
        const body = await req.json();
        const { id, action } = body;

        if (!id || !action) {
            return NextResponse.json({ error: 'Missing required parameters (id, action).' }, { status: 400 });
        }

        if (action === 'approve') {
            const accessKey = `GF-${Math.random().toString(36).substring(2, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
            const { data, error } = await supabaseAdmin
                .from('faculty_onboarding')
                .update({
                    status: 'approved',
                    generated_access_key: accessKey,
                    approved_at: new Date().toISOString()
                })
                .eq('id', id)
                .select('*')
                .single();

            if (error) {
                console.error('[Faculty Approval API] Error:', error);
                return NextResponse.json({ error: 'Failed to approve faculty request.' }, { status: 500 });
            }

            return NextResponse.json({ success: true, key: accessKey, data });
        } else if (action === 'reject') {
            const { data, error } = await supabaseAdmin
                .from('faculty_onboarding')
                .update({ status: 'rejected' })
                .eq('id', id)
                .select('*')
                .single();

            if (error) {
                console.error('[Faculty Rejection API] Error:', error);
                return NextResponse.json({ error: 'Failed to reject faculty request.' }, { status: 500 });
            }

            return NextResponse.json({ success: true, data });
        }

        return NextResponse.json({ error: 'Invalid action specified.' }, { status: 400 });
    } catch (err) {
        console.error('[Faculty Action API] Unexpected error:', err);
        return NextResponse.json({ error: 'An unexpected server error occurred.' }, { status: 500 });
    }
}
