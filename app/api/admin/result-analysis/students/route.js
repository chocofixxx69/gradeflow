import { requireStaff } from '../../../../../lib/server-session';
import { getStudentAnalysis } from '../../../../../lib/services/result-analysis/studentAnalysisService';
import { ok, fail, parseFilters, getAdminClient } from '../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/result-analysis/students — paginated student-wise marks/status.
 * Additional params: page (default 1), pageSize (default 50, max 200).
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);
        const page = Math.max(1, Number(searchParams.get('page')) || 1);
        const pageSize = Math.min(200, Math.max(1, Number(searchParams.get('pageSize')) || 50));

        const { data, error } = await getStudentAnalysis(getAdminClient(), filters, { session, page, pageSize });
        if (error) return fail(error.message, error.code, error.status);
        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/result-analysis/students]', err);
        return fail('Failed to build student analysis.', 'STUDENT_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
