import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import { getAdminClient, invalidateAnalyticsCache } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

/**
 * Live status for a single scrape job.
 *
 * The faculty dashboard used to read scraper_jobs straight from the browser with
 * the Supabase client, which had two problems: `supabase` was never imported in
 * that file (so every poll threw a ReferenceError into a silent catch, and the
 * scan never resolved), and the anon key no longer has any access to
 * scraper_jobs after the RLS lockdown.
 *
 * Job status is read here instead - staff session validated, service-role query.
 *
 * status: queued -> running -> finished | no_result | error
 */
export async function GET(req) {
    const { error: authError } = requireStaff(req, ['faculty', 'admin']);
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const jobId = searchParams.get('jobId');
    const jobIdsParam = searchParams.get('jobIds');

    if (!jobId && !jobIdsParam) {
        return NextResponse.json(
            { success: false, error: { code: 'MISSING_JOB_ID', message: 'jobId or jobIds is required.' } },
            { status: 400 }
        );
    }

    // Batch status check
    if (jobIdsParam) {
        const idList = jobIdsParam.split(',').map(id => id.trim()).filter(Boolean);
        if (idList.length === 0) {
            return NextResponse.json({ success: true, data: { jobs: [], allTerminal: true, completedCount: 0, totalCount: 0 } });
        }

        const { data: jobs, error } = await supabaseAdmin
            .from('scraper_jobs')
            .select('id, usn, status, error, created_at, started_at, finished_at')
            .in('id', idList);

        if (error) {
            console.error('[GET /api/scrape/status batch]', error);
            return NextResponse.json(
                { success: false, error: { code: 'QUERY_FAILED', message: 'Could not read jobs status.' } },
                { status: 500 }
            );
        }

        const jobsMap = new Map((jobs || []).map(j => [j.id, j]));
        const enriched = idList.map(id => {
            const j = jobsMap.get(id);
            if (!j) return { id, status: 'missing', isTerminal: true };
            const isTerminal = ['finished', 'no_result', 'error'].includes(j.status);
            return { ...j, isTerminal };
        });

        const allTerminal = enriched.every(j => j.isTerminal);
        const completedCount = enriched.filter(j => j.isTerminal).length;

        if (enriched.some(j => j.status === 'finished')) {
            invalidateAnalyticsCache();
        }

        return NextResponse.json({
            success: true,
            data: {
                jobs: enriched,
                allTerminal,
                completedCount,
                totalCount: enriched.length
            }
        });
    }

    const { data: job, error } = await supabaseAdmin
        .from('scraper_jobs')
        .select('id, usn, status, error, created_at, started_at, finished_at')
        .eq('id', jobId)
        .maybeSingle();

    if (error) {
        console.error('[GET /api/scrape/status]', error);
        return NextResponse.json(
            { success: false, error: { code: 'QUERY_FAILED', message: 'Could not read job status.' } },
            { status: 500 }
        );
    }

    if (!job) {
        return NextResponse.json({
            success: true,
            data: { id: jobId, status: 'missing', isTerminal: true },
        });
    }

    const isTerminal = ['finished', 'no_result', 'error'].includes(job.status);

    if (job.status === 'finished') {
        invalidateAnalyticsCache();
    }

    return NextResponse.json({
        success: true,
        data: { ...job, isTerminal },
    });
}
