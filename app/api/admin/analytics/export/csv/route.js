import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/server-session';
import { getAdminClient, getStudentAnalytics } from '../../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

const COLUMNS = [
    'usn', 'name', 'branch', 'semester', 'section', 'batch', 'cgpa', 'sgpa',
    'total_credits', 'earned_credits', 'total_backlogs', 'classification',
    'result_status', 'has_results', 'lateral_entry',
];

function toCSV(rows) {
    const esc = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = COLUMNS.join(',');
    const body = rows.map(r => COLUMNS.map(c => esc(r[c])).join(',')).join('\n');
    return `${header}\n${body}`;
}

/**
 * POST /api/admin/analytics/export/csv
 * Exports the (role-scoped, optionally filtered) student analytics as a CSV download.
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

        const csv = toCSV(students);
        return new NextResponse(csv, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="gradeflow-analytics.csv"',
            },
        });
    } catch (err) {
        console.error('[POST /api/admin/analytics/export/csv]', err);
        return NextResponse.json(
            { success: false, error: { code: 'EXPORT_CSV_ERROR', message: 'CSV export failed.', details: { error: String(err?.message || err) } } },
            { status: 500 }
        );
    }
}
