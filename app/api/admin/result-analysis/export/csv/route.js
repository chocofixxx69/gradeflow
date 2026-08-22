import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/server-session';
import { getReportForExport, toCSV } from '../../../../../../lib/services/result-analysis/exportService';
import { getAdminClient } from '../../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/result-analysis/export/csv
 * Body (optional): { academicYear, examSessionId, examName, branch, semester, classId, section }
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        let filters = {};
        try { filters = (await req.json()) || {}; } catch { filters = {}; }

        const report = await getReportForExport(getAdminClient(), filters, { session });
        const csv = toCSV(report);

        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="gradeflow-result-analysis.csv"',
            },
        });
    } catch (err) {
        console.error('[POST /api/admin/result-analysis/export/csv]', err);
        return NextResponse.json(
            { success: false, error: { code: 'EXPORT_CSV_ERROR', message: 'CSV export failed.', details: { error: String(err?.message || err) } } },
            { status: 500 }
        );
    }
}
