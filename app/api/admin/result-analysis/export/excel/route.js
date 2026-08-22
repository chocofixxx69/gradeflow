import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/server-session';
import { getReportForExport, toExcelBuffer } from '../../../../../../lib/services/result-analysis/exportService';
import { getAdminClient } from '../../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/result-analysis/export/excel
 * Body (optional): { academicYear, examSessionId, examName, branch, semester, classId, section }
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        let filters = {};
        try { filters = (await req.json()) || {}; } catch { filters = {}; }

        const report = await getReportForExport(getAdminClient(), filters, { session });
        const buffer = await toExcelBuffer(report);

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="gradeflow-result-analysis.xlsx"',
            },
        });
    } catch (err) {
        console.error('[POST /api/admin/result-analysis/export/excel]', err);
        return NextResponse.json(
            { success: false, error: { code: 'EXPORT_EXCEL_ERROR', message: 'Excel export failed.', details: { error: String(err?.message || err) } } },
            { status: 500 }
        );
    }
}
