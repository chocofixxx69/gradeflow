import { requireStaff } from '../../../../../lib/server-session';
import { getResultSummary } from '../../../../../lib/services/result-analysis/resultSummaryService';
import { ok, fail, parseFilters, getAdminClient } from '../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/result-analysis/summary
 * Filters (all optional): academicYear, examSessionId, examName, branch, semester, classId, section.
 * Faculty sessions are automatically scoped to their own classes (classes.faculty_id).
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);

        const { data, error } = await getResultSummary(getAdminClient(), filters, { session });
        if (error) return fail(error.message, error.code, error.status);
        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/result-analysis/summary]', err);
        return fail('Failed to build result summary.', 'RESULT_SUMMARY_ERROR', 500, { error: String(err?.message || err) });
    }
}
