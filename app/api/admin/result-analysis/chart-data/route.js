import { requireStaff } from '../../../../../lib/server-session';
import { getChartData } from '../../../../../lib/services/result-analysis/chartDataService';
import { ok, fail, parseFilters, getAdminClient } from '../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/** GET /api/admin/result-analysis/chart-data — pre-aggregated series (subject pass %, grade distribution). */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);

        const { data, error } = await getChartData(getAdminClient(), filters, { session });
        if (error) return fail(error.message, error.code, error.status);
        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/result-analysis/chart-data]', err);
        return fail('Failed to build chart data.', 'CHART_DATA_ERROR', 500, { error: String(err?.message || err) });
    }
}
