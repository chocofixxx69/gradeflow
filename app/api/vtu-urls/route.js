import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '../../../lib/server-session';
import { getAdminClient } from '../../../lib/analytics-data';
import { FALLBACK_2022_URLS, autoSeedScheme as seedSchemeUrls } from '../../../lib/vtu-portals';

const supabase = getAdminClient();

export const dynamic = 'force-dynamic';

// The portal catalog and its seeding logic live in lib/vtu-portals.js so the
// class-level "Fetch Results" picker reads exactly the same list this manager
// writes. Bound to the service-role client here.
const autoSeedScheme = (faculty_id, targetScheme) => seedSchemeUrls(supabase, faculty_id, targetScheme);

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
            '2025': { total: 0, active: 0 },
            'mba': { total: 0, active: 0 },
            'mca': { total: 0, active: 0 }
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

        // Normalize URL for duplicate comparison
        const cleanIncoming = String(url || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();

        // Check if this URL is already registered for this faculty under target scheme(s)
        const { data: existingRecords } = await supabase
            .from('faculty_vtu_urls')
            .select('id, url, exam_name, scheme')
            .eq('faculty_id', faculty_id)
            .in('scheme', targetSchemes);

        const duplicate = (existingRecords || []).find(r => {
            const cleanExisting = String(r.url || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
            return cleanExisting === cleanIncoming;
        });

        if (duplicate) {
            return NextResponse.json({
                error: `This URL is already registered as "${duplicate.exam_name}" for ${duplicate.scheme} Scheme. Duplicate URLs are not allowed.`
            }, { status: 409 });
        }

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

        // Action: Sync institutional master portals to all approved faculty accounts
        if (action === 'sync_all_faculty') {
            if (session.role !== 'admin') {
                return NextResponse.json({ error: 'Only administrators can synchronize institutional portals.' }, { status: 403 });
            }
            const { data: allFac } = await supabase.from('faculty_onboarding').select('id');
            const { data: sourceUrls } = await supabase.from('faculty_vtu_urls').select('url, exam_name, sort_order, is_active, scheme').eq('faculty_id', faculty_id);

            if (allFac && allFac.length > 0 && sourceUrls && sourceUrls.length > 0) {
                for (const f of allFac) {
                    if (f.id === faculty_id) continue;
                    const cloned = sourceUrls.map(u => ({ ...u, faculty_id: f.id }));
                    await supabase.from('faculty_vtu_urls').upsert(cloned, { onConflict: 'faculty_id,url,scheme' });
                }
            }
            return NextResponse.json({
                success: true,
                message: `Successfully synchronized VTU portals across all ${allFac?.length || 0} faculty accounts in the institution.`
            });
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
