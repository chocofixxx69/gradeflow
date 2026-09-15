/**
 * Canonical VTU result-portal catalog.
 *
 * These lists used to live inside app/api/vtu-urls/route.js, which made them
 * unreachable from anywhere else. Both the URL manager and the class-level
 * "Fetch Results" portal picker need the same catalog and the same seeding
 * behaviour, so a second copy would eventually drift out of sync with the
 * first. Single source of truth here; both routes import it.
 */

// Canonical fallback lists for 2022 Scheme and 2025 Scheme
export const FALLBACK_2022_URLS = [
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

export const FALLBACK_2025_URLS = [
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

// MBA / MCA fallback portals. VTU's exam-session landing pages route every
// program's "click here" button — B.E, M.Tech, PG[DIS], B.Sc, B.Arch, BBA/BCA,
// etc. — to this exact same set of USN+captcha lookup forms; there is no
// separate MBA-specific or MCA-specific portal. So both lists intentionally
// mirror the 2025 Scheme URLs, just tagged under their own scheme so MBA and
// MCA portals can be enabled/disabled independently of each other. NOT YET
// CONFIRMED end-to-end with a real MBA/MCA USN — treat results from these as
// provisional until verified against one.
const FALLBACK_PG_SHARED_URLS = [
    { exam_name: "Dec 25/Jan 26 Regular", url: "https://results.vtu.ac.in/D25J26Ecbcs/index.php" },
    { exam_name: "Dec 25/Jan 26 Revaluation", url: "https://results.vtu.ac.in/D25J26RVcbcs/index.php" },
    { exam_name: "May/June 2026 Regular", url: "https://results.vtu.ac.in/MJ26cbcs/index.php" },
    { exam_name: "May/June 2026 Revaluation", url: "https://results.vtu.ac.in/MJ26rvcbcs/index.php" },
    { exam_name: "Jun/Jul 25 Regular", url: "https://results.vtu.ac.in/JJEcbcs25/index.php" },
    { exam_name: "Jun/Jul 25 Reval", url: "https://results.vtu.ac.in/JJRVcbcs25/index.php" },
    { exam_name: "Dec 24/Jan 25 Regular", url: "https://results.vtu.ac.in/DJcbcs25/index.php" },
    { exam_name: "Dec 24/Jan 25 Reval", url: "https://results.vtu.ac.in/DJRVcbcs25/index.php" },
];

export const FALLBACK_MBA_URLS = FALLBACK_PG_SHARED_URLS.map(u => ({ ...u, exam_name: `${u.exam_name} (MBA)` }));
export const FALLBACK_MCA_URLS = FALLBACK_PG_SHARED_URLS.map(u => ({ ...u, exam_name: `${u.exam_name} (MCA)` }));

/** Schemes that have a portal catalog of their own. */
export const PORTAL_SCHEMES = ['2022', '2025', 'mba', 'mca'];

/** The canonical (un-seeded) portal list for a scheme. Never returns null. */
export function fallbackPortalsFor(scheme) {
    if (scheme === '2025') return FALLBACK_2025_URLS;
    if (scheme === 'mba') return FALLBACK_MBA_URLS;
    if (scheme === 'mca') return FALLBACK_MCA_URLS;
    return FALLBACK_2022_URLS;
}

/**
 * Normalize any stored scheme value onto one of PORTAL_SCHEMES.
 * A class row can carry '2021', 'MBA', 'pg' or nothing at all; every one of
 * those still needs to resolve to a portal list rather than an empty picker.
 */
export function normalizePortalScheme(scheme) {
    const s = String(scheme || '').trim().toLowerCase();
    if (s === 'mba') return 'mba';
    if (s === 'mca' || s === 'pg') return 'mca';
    if (s === '2025' || s === '2026') return '2025';
    return '2022';
}

/**
 * Seed a faculty member's portal list for one scheme from the institutional
 * catalog, preferring the admin-managed vtu_urls_*_scheme tables and falling
 * back to the canonical lists above. Returns the seeded rows (sorted), or []
 * when the seed could not be written.
 */
export async function autoSeedScheme(supabase, faculty_id, targetScheme) {
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
        } else if (targetScheme === 'mba') {
            // No dedicated vtu_urls_mba_scheme table — these portals are the
            // same shared forms as 2025 Scheme (see FALLBACK_PG_SHARED_URLS comment).
            seedSource = FALLBACK_MBA_URLS;
        } else if (targetScheme === 'mca') {
            seedSource = FALLBACK_MCA_URLS;
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
