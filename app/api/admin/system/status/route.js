import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../../../../lib/supabase-utils';
import { requireAdmin } from '../../../../../lib/server-session';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/admin/system/status
 * Operational monitoring for the scraper pipeline + data freshness/coverage.
 * Auth: admin only (requireAdmin).
 */
export async function GET(req) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const [jobs, results, students] = await Promise.all([
            fetchAllPaginated('scraper_jobs', 'id, status, created_at, started_at, finished_at, error', supabaseAdmin, 'created_at', false),
            fetchAllPaginated('results', 'usn, scraped_at', supabaseAdmin),
            fetchAllPaginated('students', 'usn', supabaseAdmin),
        ]);

        const byStatus = {};
        for (const j of jobs) byStatus[j.status] = (byStatus[j.status] || 0) + 1;

        // ISO timestamps sort lexicographically, so string compare is safe.
        const finished = jobs.filter(j => j.status === 'finished' && j.finished_at)
            .sort((a, b) => (b.finished_at > a.finished_at ? 1 : -1));
        const failed = jobs.filter(j => j.status === 'error')
            .sort((a, b) => ((b.finished_at || b.created_at) > (a.finished_at || a.created_at) ? 1 : -1));

        const scrapedAts = results.map(r => r.scraped_at).filter(Boolean).sort();
        const dataFreshness = scrapedAts.length ? scrapedAts[scrapedAts.length - 1] : null;

        const usnsWithResults = new Set(results.map(r => r.usn));
        const totalStudents = students.length;
        const withResults = students.filter(s => usnsWithResults.has(s.usn)).length;

        return ok({
            queue: {
                queue_size: byStatus['queued'] || 0,
                running_jobs: byStatus['running'] || 0,
                finished_jobs: byStatus['finished'] || 0,
                failed_jobs: byStatus['error'] || 0,
                no_result_jobs: byStatus['no_result'] || 0,
                total_jobs: jobs.length,
            },
            last_successful_scrape: finished[0]?.finished_at || null,
            last_failed_scrape: failed[0]?.finished_at || failed[0]?.created_at || null,
            data_freshness: dataFreshness,
            coverage: {
                total_students: totalStudents,
                students_with_results: withResults,
                coverage_percentage: totalStudents ? Math.round((withResults / totalStudents) * 1000) / 10 : 0,
            },
        });
    } catch (err) {
        console.error('[GET /api/admin/system/status]', err);
        return fail('Failed to load system status.', 'SYSTEM_STATUS_ERROR', 500, { error: String(err?.message || err) });
    }
}
