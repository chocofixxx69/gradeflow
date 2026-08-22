import { requireStaff } from '../../../../../lib/server-session';
import { getFacultyAnalysis } from '../../../../../lib/services/result-analysis/facultyAnalysisService';
import { ok, fail, parseFilters, getAdminClient } from '../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/result-analysis/faculty — per-faculty subject pass rates.
 * Requires faculty_subject_assignments (migration 001) to be populated; returns
 * an explicit `unavailable_reason` rather than fabricated data if it isn't.
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);

        const { data, error } = await getFacultyAnalysis(getAdminClient(), filters, { session });
        if (error) return fail(error.message, error.code, error.status);
        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/result-analysis/faculty]', err);
        return fail('Failed to build faculty analysis.', 'FACULTY_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
