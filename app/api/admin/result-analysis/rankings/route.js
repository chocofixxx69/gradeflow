import { requireStaff } from '../../../../../lib/server-session';
import { getRankings } from '../../../../../lib/services/result-analysis/rankingService';
import { ok, fail, parseFilters, getAdminClient } from '../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/** GET /api/admin/result-analysis/rankings — top-N by total marks. Additional param: limit (default 10). */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);
        const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit')) || 10));

        const { data, error } = await getRankings(getAdminClient(), filters, { session, limit });
        if (error) return fail(error.message, error.code, error.status);
        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/result-analysis/rankings]', err);
        return fail('Failed to build rankings.', 'RANKING_ERROR', 500, { error: String(err?.message || err) });
    }
}
