import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, buildStudentRow, parseFilters } from '../../../../../lib/analytics-data';

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

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/admin/analytics/students
 * Student Analysis — full per-student row: USN, Name, Branch, Semester, Section,
 * Batch, SGPA, CGPA, Credits, Earned Credits, Backlog Count, Failed Subjects,
 * Result Status, Classification, All-Clear.
 * Filters: ?academicYear=&examSession=&branch=&semester=&classId=&section=
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);

        const dataset = await loadResultAnalysisDataset(getAdminClient(), {
            role: session.role, facultyId: session.sub, filters,
        });

        const students = dataset.students.map(s => buildStudentRow(s, dataset));

        return ok({ students, total: students.length, filters_applied: filters });
    } catch (err) {
        console.error('[GET /api/admin/analytics/students]', err);
        return fail('Failed to build student analysis.', 'STUDENT_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
