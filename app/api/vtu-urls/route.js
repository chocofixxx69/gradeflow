import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../lib/server-session';
import { getAdminClient } from '../../../lib/analytics-data';

const supabase = getAdminClient();

export const dynamic = 'force-dynamic';

// Canonical fallback lists for 2022 Scheme and 2025 Scheme
const FALLBACK_2022_URLS = [
    { exam_name: "Dec 25/Jan 26 Revaluation", url: "https://results.vtu.ac.in/D25J26RVcbcs/index.php" },
    { exam_name: "May/June 2026 Revaluation", url: "https://results.vtu.ac.in/MJ26rvcbcs/index.php" },
    { exam_name: "May/June 2026 Regular", url: "https://results.vtu.ac.in/MJ26cbcs/index.php" },
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
    { exam_name: "Dec 25/Jan 26 Regular (NEP)", url: "https://results.vtu.ac.in/indexD5J6.php" },
    { exam_name: "Jun/Jul 25 Regular (NEP)", url: "https://results.vtu.ac.in/indexJJ25.php" },
    { exam_name: "Dec 24/Jan 25 Regular (NEP)", url: "https://results.vtu.ac.in/indexD4J5.php" },
    { exam_name: "Jun/Jul 24 Regular (NEP)", url: "https://results.vtu.ac.in/indexJJ24.php" },
    { exam_name: "Dec 23/Jan 24 Regular (NEP)", url: "https://results.vtu.ac.in/indexD3J4.php" },
];

const FALLBACK_2025_URLS = [
    { exam_name: "Dec 25/Jan 26 Revaluation", url: "https://results.vtu.ac.in/D25J26RVcbcs/index.php" },
    { exam_name: "May/June 2026 Revaluation", url: "https://results.vtu.ac.in/MJ26rvcbcs/index.php" },
    { exam_name: "May/June 2026 Regular", url: "https://results.vtu.ac.in/MJ26cbcs/index.php" },
    { exam_name: "Dec 25/Jan 26 Regular", url: "https://results.vtu.ac.in/D25J26Ecbcs/index.php" },
    { exam_name: "Jun/Jul 25 Regular", url: "https://results.vtu.ac.in/JJEcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 Reval", url: "https://results.vtu.ac.in/JJRVcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 MakeUp Exam", url: "https://results.vtu.ac.in/MakeUpEcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 Summer Exam", url: "https://results.vtu.ac.in/SEcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 Summer Reval", url: "https://results.vtu.ac.in/SERVcbcs25/index.php" },
    { exam_name: "Dec 25/Jan 26 Regular (NEP)", url: "https://results.vtu.ac.in/indexD5J6.php" },
    { exam_name: "Jun/Jul 25 Regular (NEP)", url: "https://results.vtu.ac.in/indexJJ25.php" },
    { exam_name: "Dec 24/Jan 25 Regular", url: "https://results.vtu.ac.in/DJcbcs25/index.php" },
    { exam_name: "Dec 24/Jan 25 Reval", url: "https://results.vtu.ac.in/DJRVcbcs25/index.php" },
    { exam_name: "Jul 25 Special/Makeup Exam", url: "https://results.vtu.ac.in/SplJulcbcs25/index.php" },
    { exam_name: "Jul 25 Special/Makeup Reval", url: "https://results.vtu.ac.in/RVSplJulcbcs25/index.php" },
];

// Helper to seed URLs for a specific scheme
async function autoSeedScheme(faculty_id, targetScheme) {
    try {
        let seedSource = [];
        if (targetScheme === '2025') {
            const { data: db2025 } = await supabase
                .from('vtu_urls_2025_scheme')
                .select('url, exam_name, sort_order')
                .order('sort_order', { ascending: true });
            
            if (db2025 && db2025.length > 0) {
                // Keep only 2025+ sessions for 2025 scheme
                seedSource = db2025.filter(u => {
                    const name = (u.exam_name || '').toLowerCase();
                    return name.includes('25') || name.includes('26') || name.includes('2025') || name.includes('2026');
                });
            }
            if (!seedSource.length) seedSource = FALLBACK_2025_URLS;
        } else {
            const { data: db2022 } = await supabase
                .from('vtu_urls_2022_scheme')
                .select('url, exam_name, sort_order')
                .order('sort_order', { ascending: true });
            
            seedSource = db2022 && db2022.length > 0 ? db2022 : FALLBACK_2022_URLS;
        }

        const seedData = seedSource.map((u, i) => ({
            faculty_id,
            url: u.url,
            exam_name: u.exam_name || 'Unknown Exam',
            sort_order: u.sort_order ?? i,
            is_active: true,
            scheme: targetScheme,
        }));

        const { data: seeded, error: seedError } = await supabase
            .from('faculty_vtu_urls')
            .upsert(seedData, { onConflict: 'faculty_id,url,scheme' })
            .select();

        if (!seedError && seeded) {
            return seeded.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        }
    } catch (e) {
        console.error(`[autoSeedScheme] Error for ${targetScheme}:`, e);
    }
    return [];
}

// GET — List VTU result URLs for a faculty, optionally filtered by scheme
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const faculty_id = searchParams.get('faculty_id');
        const scheme = searchParams.get('scheme'); // '2022', '2025', or null

        if (!faculty_id) {
            return NextResponse.json({ error: 'Faculty ID required' }, { status: 400 });
        }

        if (session.role === 'faculty' && faculty_id !== session.sub) {
            return NextResponse.json({ error: 'You can only access your own VTU URL configuration.' }, { status: 403 });
        }

        let query = supabase
            .from('faculty_vtu_urls')
            .select('*')
            .eq('faculty_id', faculty_id);

        if (scheme) {
            query = query.eq('scheme', scheme);
        }

        let { data, error } = await query.order('sort_order', { ascending: true });
        if (error) throw error;

        // If 2022 scheme has fewer than the canonical 26 portals, auto-heal and seed any missing portals immediately
        if (scheme === '2022' && (!data || data.length < 26)) {
            data = await autoSeedScheme(faculty_id, '2022');
        } else if (scheme && (!data || data.length === 0)) {
            data = await autoSeedScheme(faculty_id, scheme);
        } else if (!scheme && (!data || data.length === 0)) {
            // Seed both schemes if completely empty
            const [s22, s25] = await Promise.all([
                autoSeedScheme(faculty_id, '2022'),
                autoSeedScheme(faculty_id, '2025')
            ]);
            data = [...s22, ...s25];
        }

        // Fetch counts for summary badges
        const { data: allFacUrls } = await supabase
            .from('faculty_vtu_urls')
            .select('scheme, is_active')
            .eq('faculty_id', faculty_id);

        const counts = {
            '2022': { total: 0, active: 0 },
            '2025': { total: 0, active: 0 }
        };

        (allFacUrls || []).forEach(r => {
            const sc = r.scheme || '2022';
            if (counts[sc]) {
                counts[sc].total++;
                if (r.is_active) counts[sc].active++;
            }
        });

        return NextResponse.json({
            success: true,
            urls: data || [],
            scheme: scheme || 'all',
            counts
        });
    } catch (err) {
        console.error('[API /api/vtu-urls GET error]', err);
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}

// POST — Add a new VTU result URL or toggle its status for specified scheme(s)
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { url, exam_name, faculty_id, is_active, scheme, id } = await req.json();

        if (!faculty_id) {
            return NextResponse.json({ error: 'Faculty ID required' }, { status: 400 });
        }

        if (session.role === 'faculty' && faculty_id !== session.sub) {
            return NextResponse.json({ error: 'You can only modify your own VTU URL configuration.' }, { status: 403 });
        }

        // If an explicit ID is passed (e.g. toggling an existing entry by ID)
        if (id && is_active !== undefined) {
            const { data: updated, error: updateErr } = await supabase
                .from('faculty_vtu_urls')
                .update({ is_active })
                .eq('id', id)
                .eq('faculty_id', faculty_id)
                .select()
                .single();

            if (updateErr) throw updateErr;
            return NextResponse.json({ success: true, url: updated });
        }

        if (url && !url.includes('vtu.ac.in')) {
            return NextResponse.json({ error: 'Invalid VTU URL' }, { status: 400 });
        }

        const targetSchemes = scheme === 'both' ? ['2022', '2025'] : [scheme || '2022'];
        const records = targetSchemes.map(s => ({
            faculty_id,
            url,
            exam_name: exam_name || 'Unknown Exam',
            scheme: s,
            is_active: is_active !== undefined ? is_active : true
        }));

        const { data, error } = await supabase
            .from('faculty_vtu_urls')
            .upsert(records, { onConflict: 'faculty_id,url,scheme' })
            .select();

        if (error) throw error;
        return NextResponse.json({ success: true, urls: data });
    } catch (err) {
        console.error('[API /api/vtu-urls POST error]', err);
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}

// PUT - Toggle all URLs scoped to a specific scheme, or restore defaults
export async function PUT(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { faculty_id, is_active, scheme, action } = await req.json();

        if (!faculty_id) {
            return NextResponse.json({ error: 'Faculty ID required' }, { status: 400 });
        }

        if (session.role === 'faculty' && faculty_id !== session.sub) {
            return NextResponse.json({ error: 'You can only modify your own VTU URL configuration.' }, { status: 403 });
        }

        // Action: Restore canonical defaults
        if (action === 'restore_defaults' || action === 'restore') {
            const targetScheme = scheme || '2022';
            await autoSeedScheme(faculty_id, targetScheme);
            await supabase
                .from('faculty_vtu_urls')
                .update({ is_active: true })
                .eq('faculty_id', faculty_id)
                .eq('scheme', targetScheme);
            return NextResponse.json({ success: true, message: `All ${targetScheme} Scheme default portals restored and enabled.` });
        }

        let query = supabase
            .from('faculty_vtu_urls')
            .update({ is_active })
            .eq('faculty_id', faculty_id);

        if (scheme && scheme !== 'all') {
            query = query.eq('scheme', scheme);
        }

        const { error } = await query;
        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[API /api/vtu-urls PUT error]', err);
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}

// DELETE — Delete a URL (with Core 2022 URL protection: soft-disables instead of removing from DB)
export async function DELETE(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { id, faculty_id } = await req.json();

        if (session.role === 'faculty' && faculty_id !== session.sub) {
            return NextResponse.json({ error: 'You can only modify your own VTU URL configuration.' }, { status: 403 });
        }

        // Check if this is one of the 26 canonical 2022 portals
        const { data: target } = await supabase
            .from('faculty_vtu_urls')
            .select('url, scheme')
            .eq('id', id)
            .eq('faculty_id', faculty_id)
            .maybeSingle();

        const CANONICAL_2022_SET = new Set(FALLBACK_2022_URLS.map(u => u.url.toLowerCase()));
        if (target && target.scheme === '2022' && CANONICAL_2022_SET.has((target.url || '').toLowerCase())) {
            // Core 2022 portal protection: never delete the 26 canonical URLs from the database. Soft-disable instead!
            const { error } = await supabase
                .from('faculty_vtu_urls')
                .update({ is_active: false })
                .eq('id', id)
                .eq('faculty_id', faculty_id);
            if (error) throw error;
            return NextResponse.json({ success: true, message: 'Core 2022 portal disabled (preserved in database).' });
        }

        const { error } = await supabase
            .from('faculty_vtu_urls')
            .delete()
            .eq('id', id)
            .eq('faculty_id', faculty_id);

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[API /api/vtu-urls DELETE error]', err);
        return NextResponse.json({ error: 'An internal error occurred.' }, { status: 500 });
    }
}
