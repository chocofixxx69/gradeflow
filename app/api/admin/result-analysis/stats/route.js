import { requireStaff } from '../../../../../lib/server-session';
import { getStatistics } from '../../../../../lib/services/result-analysis/statisticsService';
import { ok, fail, parseFilters, getAdminClient } from '../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/** GET /api/admin/result-analysis/stats — grade distribution, subject stats, total-marks quartiles. */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);

        const { data, error } = await getStatistics(getAdminClient(), filters, { session });
        if (error) return fail(error.message, error.code, error.status);
        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/result-analysis/stats]', err);
        return fail('Failed to build statistics.', 'STATISTICS_ERROR', 500, { error: String(err?.message || err) });
    }
}
