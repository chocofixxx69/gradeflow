import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

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

    if (!jobId) {
        return NextResponse.json(
            { success: false, error: { code: 'MISSING_JOB_ID', message: 'jobId is required.' } },
            { status: 400 }
        );
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
        // Treated as terminal by the caller: the job row is gone (cleared by an
        // admin, or the USN was deleted) so there is nothing left to wait for.
        return NextResponse.json({
            success: true,
            data: { id: jobId, status: 'missing', isTerminal: true },
        });
    }

    return NextResponse.json({
        success: true,
        data: {
            ...job,
            isTerminal: ['finished', 'no_result', 'error'].includes(job.status),
        },
    });
}
