import { requireStaff } from '../../../../../lib/server-session';
import { getBacklogAnalysis } from '../../../../../lib/services/result-analysis/backlogAnalysisService';
import { ok, fail, parseFilters, getAdminClient } from '../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/** GET /api/admin/result-analysis/backlogs — students with arrears, plus per-subject backlog counts. */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);

        const { data, error } = await getBacklogAnalysis(getAdminClient(), filters, { session });
        if (error) return fail(error.message, error.code, error.status);
        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/result-analysis/backlogs]', err);
        return fail('Failed to build backlog analysis.', 'BACKLOG_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
