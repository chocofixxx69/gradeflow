import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import {
    autoSeedScheme,
    fallbackPortalsFor,
    normalizePortalScheme,
} from '../../../../lib/vtu-portals';

const supabase = getAdminClient();

export const dynamic = 'force-dynamic';

/**
 * Portal list for the "Fetch Results" picker, resolved from the session.
 *
 * /api/vtu-urls needs the caller to supply a faculty_id and refuses any id
 * other than the caller's own. That is correct for the URL *manager*, where a
 * faculty member is editing their own list, but it makes the picker fragile
 * everywhere else: the classes screen is shared between the faculty and admin
 * portals, an admin session has no faculty id of its own, and a class row's
 * faculty_id is frequently the string 'all' (institution-wide class). Guessing
 * an id client-side would produce a silently empty dropdown for admins.
 *
 * So the owner is resolved here instead:
 *   faculty session -> that faculty member
 *   admin session   -> ?faculty_id= if given and real, else the class's
 *                      assigned faculty, else the first approved faculty
 *   no faculty at all -> the canonical catalog, unsaved
 *
 * The picker therefore always has portals to show, which is the point: a scrape
 * that cannot be aimed is a scrape that cannot be run.
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const scheme = normalizePortalScheme(searchParams.get('scheme'));
        const requestedFacultyId = searchParams.get('faculty_id');
        const classId = searchParams.get('class_id');

        let ownerId = null;

        if (session.role === 'faculty') {
            // A faculty member always reads their own list, whatever was asked for.
            ownerId = session.sub;
        } else {
            const candidates = [];
            if (requestedFacultyId && requestedFacultyId !== 'all') candidates.push(requestedFacultyId);

            if (classId) {
                const { data: cls } = await supabase
                    .from('classes')
                    .select('faculty_id')
                    .eq('id', classId)
                    .maybeSingle();
                if (cls?.faculty_id && cls.faculty_id !== 'all') candidates.push(cls.faculty_id);
            }

            for (const candidate of candidates) {
                const { data: fac } = await supabase
                    .from('faculty_onboarding')
                    .select('id')
                    .eq('id', candidate)
                    .maybeSingle();
                if (fac?.id) { ownerId = fac.id; break; }
            }

            if (!ownerId) {
                const { data: anyFac } = await supabase
                    .from('faculty_onboarding')
                    .select('id')
                    .order('created_at', { ascending: true })
                    .limit(1);
                ownerId = anyFac?.[0]?.id || null;
            }
        }

        if (!ownerId) {
            // No faculty row exists to hang a portal list off — hand back the
            // canonical catalog so the picker still works.
            return NextResponse.json({
                success: true,
                data: {
                    scheme,
                    source: 'canonical',
                    faculty_id: null,
                    portals: fallbackPortalsFor(scheme).map((u, i) => ({
                        id: `canonical-${i}`,
                        url: u.url,
                        exam_name: u.exam_name,
                        is_active: true,
                        sort_order: i,
                        scheme,
                    })),
                },
            });
        }

        let { data, error } = await supabase
            .from('faculty_vtu_urls')
            .select('id, url, exam_name, is_active, sort_order, scheme')
            .eq('faculty_id', ownerId)
            .eq('scheme', scheme)
            .order('sort_order', { ascending: true });

        if (error) throw error;

        // Same auto-heal the manager does: an empty (or truncated 2022) list is
        // seeded from the institutional catalog rather than shown as empty.
        const needsSeed = !data || data.length === 0 || (scheme === '2022' && data.length < 26);
        if (needsSeed) {
            const seeded = await autoSeedScheme(supabase, ownerId, scheme);
            if (seeded.length > 0) data = seeded;
        }

        const portals = (data || [])
            .filter(u => u.is_active !== false)
            .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

        // Last line of defence: if the table write failed for any reason, still
        // return something aimable rather than an empty dropdown.
        if (portals.length === 0) {
            return NextResponse.json({
                success: true,
                data: {
                    scheme,
                    source: 'canonical',
                    faculty_id: ownerId,
                    portals: fallbackPortalsFor(scheme).map((u, i) => ({
                        id: `canonical-${i}`,
                        url: u.url,
                        exam_name: u.exam_name,
                        is_active: true,
                        sort_order: i,
                        scheme,
                    })),
                },
            });
        }

        return NextResponse.json({
            success: true,
            data: {
                scheme,
                source: 'faculty',
                faculty_id: ownerId,
                portals,
            },
        });
    } catch (err) {
        console.error('[GET /api/scrape/portals]', err);
        return NextResponse.json(
            { success: false, error: { code: 'PORTALS_FAILED', message: 'Could not load VTU portals.' } },
            { status: 500 }
        );
    }
}
