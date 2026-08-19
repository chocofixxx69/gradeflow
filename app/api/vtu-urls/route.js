import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../lib/server-session';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

// Helper to provide a fallback list if none exists for the faculty
const FALLBACK_URLS = [
    { exam_name: "Dec 25/Jan 26 Regular (NEP)", url: "https://results.vtu.ac.in/indexD5J6.php" },
    { exam_name: "Jun/Jul 25 Regular (NEP)", url: "https://results.vtu.ac.in/indexJJ25.php" },
    { exam_name: "Dec 24/Jan 25 Regular (NEP)", url: "https://results.vtu.ac.in/indexD4J5.php" },
    { exam_name: "Jun/Jul 24 Regular (NEP)", url: "https://results.vtu.ac.in/indexJJ24.php" },
    { exam_name: "Dec 23/Jan 24 Regular (NEP)", url: "https://results.vtu.ac.in/indexD3J4.php" },
    { exam_name: "Makeup 25", url: "https://results.vtu.ac.in/MAKEUPEcbcS25/index.php" },
    { exam_name: "Dec 25/Jan 26 Regular", url: "https://results.vtu.ac.in/D25J26Ecbcs/index.php" },
    { exam_name: "Jun/Jul 25 Regular", url: "https://results.vtu.ac.in/JJEcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 Reval", url: "https://results.vtu.ac.in/JJRVcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 MakeUp", url: "https://results.vtu.ac.in/MakeUpEcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 Summer", url: "https://results.vtu.ac.in/SEcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 Summer Reval", url: "https://results.vtu.ac.in/SERVcbcs25/index.php" },
    { exam_name: "Dec 24/Jan 25 Regular", url: "https://results.vtu.ac.in/DJcbcs25/index.php" },
    { exam_name: "Dec 24/Jan 25 Reval", url: "https://results.vtu.ac.in/DJRVcbcs25/index.php" },
    { exam_name: "Jun/Jul 24 Makeup", url: "https://results.vtu.ac.in/MakeUpEcbcs24/index.php" },
    { exam_name: "Jun/Jul 24 Regular", url: "https://results.vtu.ac.in/JJEcbcs24/index.php" },
    { exam_name: "Jun/Jul 24 Reval", url: "https://results.vtu.ac.in/JJRVcbcs24/index.php" },
    { exam_name: "Dec 23/Jan 24 Regular", url: "https://results.vtu.ac.in/DJcbcs24/index.php" },
    { exam_name: "Dec 23/Jan 24 Reval", url: "https://results.vtu.ac.in/DJRVcbcs24/index.php" },
    { exam_name: "Jun/Jul 23 Regular", url: "https://results.vtu.ac.in/JJEcbcs23/index.php" },
    { exam_name: "Jun/Jul 23 Reval", url: "https://results.vtu.ac.in/JJRVcbcs23/index.php" },
    { exam_name: "Jun/Jul 23 Makeup", url: "https://results.vtu.ac.in/MakeUpEcbcs23/index.php" },
    { exam_name: "Dec 22/Jan 23 Regular", url: "https://results.vtu.ac.in/JFEcbcs23/index.php" },
    { exam_name: "Dec 22/Jan 23 Reval", url: "https://results.vtu.ac.in/JFRVcbcs23/index.php" },
    { exam_name: "VTU ONLINE DEGREE PROGRAMS PROVISIONAL RESULTS", url: "https://results.vtu.ac.in/indexCDOE.php" },
    { exam_name: "May/June-2026 Examination", url: "https://results.vtu.ac.in/indexMJ26.php" },
    { exam_name: "Summer Semester Examination-2025", url: "https://results.vtu.ac.in/indexSUMU25.php" },
    { exam_name: "Silver Jubilee July 2025 Examination", url: "https://results.vtu.ac.in/indexSJSEJJ25.php" },
    { exam_name: "Ph.D./M.S(Research) Course-Work Reval Nov/Dec-2024", url: "https://results.vtu.ac.in/NDPhDRV24/index.php" },
    { exam_name: "January-2025 Special Examination", url: "https://results.vtu.ac.in/SplJcbcs25/index.php" },
    { exam_name: "Jan-2024 Special Exam [B.E] Revaluation", url: "https://results.vtu.ac.in/JanSplRVEnoncbcs24/index.php" },
    { exam_name: "January-2024 Special Exam [B.E & PG]", url: "https://results.vtu.ac.in/JanSplEnoncbcs24/index.php" },
];

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
