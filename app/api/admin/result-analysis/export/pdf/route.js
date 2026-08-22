import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/server-session';
import { getReportForExport, toPdfBuffer } from '../../../../../../lib/services/result-analysis/exportService';
import { getAdminClient } from '../../../../../../lib/services/result-analysis/http';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/result-analysis/export/pdf
 * Body (optional): { academicYear, examSessionId, examName, branch, semester, classId, section }
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        let filters = {};
        try { filters = (await req.json()) || {}; } catch { filters = {}; }

        const report = await getReportForExport(getAdminClient(), filters, { session });
        const buffer = await toPdfBuffer(report);

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="gradeflow-result-analysis.pdf"',
            },
        });
    } catch (err) {
        console.error('[POST /api/admin/result-analysis/export/pdf]', err);
        return NextResponse.json(
            { success: false, error: { code: 'EXPORT_PDF_ERROR', message: 'PDF export failed.', details: { error: String(err?.message || err) } } },
            { status: 500 }
        );
    }
}
