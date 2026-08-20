import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../lib/server-session';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

// Helper to provide a fallback list if none exists for the faculty
const FALLBACK_URLS = [];

// GET — List all VTU result URLs for a specific faculty
export async function GET(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const faculty_id = searchParams.get('faculty_id');

        if (!faculty_id) {
            return NextResponse.json({ error: 'Faculty ID required' }, { status: 400 });
        }

        // Fetch their specific URLs, oldest exam session first
        let { data, error } = await supabase
            .from('faculty_vtu_urls')
            .select('*')
            .eq('faculty_id', faculty_id)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        // Auto-seed if they have no URLs, from the canonical BE-only scheme
        // tables (ascending, oldest first) — falling back to the hardcoded
        // list only if the DB is completely unreachable.
        if (!data || data.length === 0) {
            let seedSource = [];
            const [s2022, s2025] = await Promise.all([
                supabase.from('vtu_urls_2022_scheme').select('url, exam_name, sort_order').order('sort_order', { ascending: true }),
                supabase.from('vtu_urls_2025_scheme').select('url, exam_name, sort_order').order('sort_order', { ascending: true }),
            ]);
            const combined = [...(s2022.data || []), ...(s2025.data || [])];
            const seen = new Set();
            seedSource = combined.filter(u => (seen.has(u.url) ? false : (seen.add(u.url), true)));

            if (!seedSource.length) {
                seedSource = FALLBACK_URLS.map((u, i) => ({ url: u.url, exam_name: u.exam_name, sort_order: i }));
            }

            const seedData = seedSource.map(u => ({
                faculty_id,
                url: u.url,
                exam_name: u.exam_name || 'Unknown Exam',
                sort_order: u.sort_order ?? 0,
                is_active: true // Enabled by default as requested
            }));

            const { data: seeded, error: seedError } = await supabase
                .from('faculty_vtu_urls')
                .insert(seedData)
                .select();

            if (!seedError) data = seeded?.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        }

        return NextResponse.json({ success: true, urls: data || [] });
    } catch (err) {
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}

// POST — Add a new VTU result URL or toggle its status
export async function POST(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { url, exam_name, faculty_id, is_active } = await req.json();

        if (!faculty_id) {
            return NextResponse.json({ error: 'Faculty ID required' }, { status: 400 });
        }

        if (url && !url.includes('vtu.ac.in')) {
            return NextResponse.json({ error: 'Invalid VTU URL' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('faculty_vtu_urls')
            .upsert({
                faculty_id,
                url,
                exam_name: exam_name || 'Unknown Exam',
                is_active: is_active !== undefined ? is_active : true
            }, { onConflict: 'faculty_id,url' })
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, url: data });
    } catch (err) {
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}

// PUT - Toggle all URLs (Turn off completely or turn on all)
export async function PUT(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { faculty_id, is_active } = await req.json();
        const { error } = await supabase
            .from('faculty_vtu_urls')
            .update({ is_active })
            .eq('faculty_id', faculty_id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}

// DELETE — Deactivate a URL
export async function DELETE(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { id, faculty_id } = await req.json();
        const { error } = await supabase
            .from('faculty_vtu_urls')
            .update({ is_active: false })
            .eq('id', id)
            .eq('faculty_id', faculty_id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}
