import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireStaff } from '../../../../../../lib/server-session';
import { getAdminClient, getStudentAnalytics } from '../../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/analytics/export/excel
 * Exports the (role-scoped, optionally filtered) student analytics as an .xlsx download.
 * Body (optional): { "branch": "CSE", "semester": 6, "classId": "<uuid>" }
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        let filters = {};
        try { filters = (await req.json()) || {}; } catch { filters = {}; }

        const { students } = await getStudentAnalytics(getAdminClient(), {
            role: session.role, facultyId: session.sub, filters,
        });

        const sheetRows = students.map(s => ({
            USN: s.usn,
            Name: s.name,
            Branch: s.branch,
            Semester: s.semester,
            CGPA: s.cgpa,
            'Total Backlogs': s.total_backlogs,
            'Has Results': s.has_results ? 'Yes' : 'No',
            'Lateral Entry': s.lateral_entry ? 'Yes' : 'No',
        }));

        const ws = XLSX.utils.json_to_sheet(sheetRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Student Analytics');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="gradeflow-analytics.xlsx"',
            },
        });
    } catch (err) {
        console.error('[POST /api/admin/analytics/export/excel]', err);
        return NextResponse.json(
            { success: false, error: { code: 'EXPORT_EXCEL_ERROR', message: 'Excel export failed.', details: { error: String(err?.message || err) } } },
            { status: 500 }
        );
    }
}
