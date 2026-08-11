import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Server-side client using the SERVICE KEY — bypasses all RLS
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

export async function POST(request) {
    try {
        const body = await request.json();
        const { full_name, email, department, password } = body;

        // Basic validation
        if (!full_name || !email || !department || !password) {
            return NextResponse.json(
                { error: 'All fields are required.' },
                { status: 400 }
            );
        }

        // Domain restriction check
        if (!email.toLowerCase().endsWith('@anjuman.edu.in')) {
            return NextResponse.json(
                { error: 'Only institutional emails (@anjuman.edu.in) are permitted to register.' },
                { status: 403 }
            );
        }

        if (password.length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters.' },
                { status: 400 }
            );
        }

        // Check if email already exists
        const { data: existing } = await supabaseAdmin
            .from('faculty_onboarding')
            .select('id')
            .eq('email', email.toLowerCase())
            .maybeSingle();

        if (existing) {
            return NextResponse.json(
                { error: 'A request with this email is already on file.', code: 'DUPLICATE_EMAIL' },
                { status: 409 }
            );
        }

        // Insert the new faculty registration request
        const { data, error: insertErr } = await supabaseAdmin
            .from('faculty_onboarding')
            .insert({
                full_name: full_name.trim(),
                email: email.trim().toLowerCase(),
                department: department.trim(),
                password: password,
                status: 'pending',
            })
            .select('id, email, status')
            .single();

        if (insertErr) {
            console.error('[Faculty Register API] Insert error:', insertErr);
            return NextResponse.json(
                { error: insertErr.message || 'Database error. Please try again.' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            message: 'Registration request submitted successfully.',
            id: data.id,
        });

    } catch (err) {
        console.error('[Faculty Register API] Unexpected error:', err);
        return NextResponse.json(
            { error: 'An unexpected server error occurred. Please try again.' },
            { status: 500 }
        );
    }
}
