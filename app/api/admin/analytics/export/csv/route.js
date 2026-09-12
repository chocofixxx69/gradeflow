import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../../lib/server-session';
import { getAdminClient, getStudentAnalytics, parseFiltersFromBody } from '../../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

/**
 * The analytics warehouse is a whole-table read (19k subject_marks rows and three
 * more tables) the first time a server instance answers. That lands around 3s warm
 * and can exceed Vercel's default 10s function ceiling on a cold start, which is
 * what turned a populated gazette into "No student records found" — the request was
 * killed, not empty. Raising the ceiling lets the first request finish and warm the
 * process caches for every request after it. The platform clamps this to the plan
 * maximum, so it is safe to ask for 60 everywhere.
 */
export const maxDuration = 60;

const COLUMNS = [
    'usn', 'name', 'branch', 'semester', 'class_name', 'section', 'batch', 'cgpa', 'sgpa',
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
 * Body (optional): { academicYear, examSession, branch, semester, classId, section }
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        let body = {};
        try { body = (await req.json()) || {}; } catch { body = {}; }
        const filters = parseFiltersFromBody(body);

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
