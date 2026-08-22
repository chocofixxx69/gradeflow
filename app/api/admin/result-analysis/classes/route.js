import { requireStaff } from '../../../../../lib/server-session';
import { getClassAnalysis } from '../../../../../lib/services/result-analysis/classAnalysisService';
import { ok, fail, parseFilters, getAdminClient } from '../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/** GET /api/admin/result-analysis/classes — per-class breakdown for the given filters. */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);

        const { data, error } = await getClassAnalysis(getAdminClient(), filters, { session });
        if (error) return fail(error.message, error.code, error.status);
        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/result-analysis/classes]', err);
        return fail('Failed to build class analysis.', 'CLASS_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
