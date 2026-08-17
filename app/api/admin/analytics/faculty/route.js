import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, parseFilters, average } from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * GET /api/admin/analytics/faculty
 * Faculty Analysis — faculty -> assigned subjects -> classes -> pass%/subject
 * average, via faculty_subject_assignments. Subject marks attributed to a
 * faculty member when their assignment's subject_code/branch/semester match;
 * anything unattributed rolls up under "Unassigned" (per spec).
 * Filters: ?academicYear=&examSession=&branch=&semester=&classId=&section=
 * Note: admin-only in practice (faculty role is already scoped to their own
 * classes upstream in loadResultAnalysisDataset, same as every other endpoint).
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

        const scopedUsns = new Set(dataset.students.map(s => s.usn));
        const studentByUsn = {};
        for (const s of dataset.students) studentByUsn[s.usn] = s;

        // Group scoped subject_marks by subject_code (+branch+semester) so each
        // mark can be matched against an assignment row.
        const marksByKey = {};
        for (const m of dataset.subjectMarks) {
            if (!scopedUsns.has(m.usn)) continue;
            const student = studentByUsn[m.usn];
            const key = `${m.subject_code}::${student?.branch || ''}::${m.semester}`;
            (marksByKey[key] ||= []).push(m);
        }

        // "Unassigned" bucket collects every mark with no matching assignment.
        const byFaculty = {}; // facultyId -> { subjects: Map<subjectCode, marks[]>, classIds: Set }
        const unassigned = [];

        for (const [key, marks] of Object.entries(marksByKey)) {
            const [subjectCode, branch, semester] = key.split('::');
            const assignment = dataset.facultyAssignments.find(a =>
                a.subject_code === subjectCode &&
                (!branch || a.branch === branch) &&
                String(a.semester) === String(semester)
            );
            if (!assignment) { unassigned.push(...marks); continue; }
            const bucket = (byFaculty[assignment.faculty_id] ||= { subjectMarks: {}, classIds: new Set() });
            (bucket.subjectMarks[subjectCode] ||= []).push(...marks);
            if (assignment.class_id) bucket.classIds.add(assignment.class_id);
        }

        const facultyRows = Object.entries(byFaculty).map(([facultyId, bucket]) => {
            const allMarks = Object.values(bucket.subjectMarks).flat();
            const appeared = allMarks.length;
            const passed = allMarks.filter(m => m.passed).length;
            const failed = appeared - passed;

            const subjectSummaries = Object.entries(bucket.subjectMarks).map(([code, marks]) => ({
                subject_code: code,
                subject_name: marks[0]?.subject_name || code,
                appeared: marks.length,
                passed: marks.filter(m => m.passed).length,
                pass_percentage: pct(marks.filter(m => m.passed).length, marks.length),
                subject_average: average(marks.map(m => m.total)),
            }));

            return {
                faculty_id: facultyId,
                faculty_name: dataset.facultyById[facultyId]?.full_name || 'Unassigned',
                department: dataset.facultyById[facultyId]?.department || null,
                subjects: subjectSummaries,
                classes: bucket.classIds.size,
                students_appeared: appeared,
                passed,
                failed,
                pass_percentage: pct(passed, appeared),
                subject_average: average(allMarks.map(m => m.total)),
            };
        });

        if (unassigned.length) {
            const passed = unassigned.filter(m => m.passed).length;
            facultyRows.push({
                faculty_id: null,
                faculty_name: 'Unassigned',
                department: null,
                subjects: [],
                classes: 0,
                students_appeared: unassigned.length,
                passed,
                failed: unassigned.length - passed,
                pass_percentage: pct(passed, unassigned.length),
                subject_average: average(unassigned.map(m => m.total)),
            });
        }

        facultyRows.sort((a, b) => (a.faculty_name || '').localeCompare(b.faculty_name || ''));

        return ok({ faculty: facultyRows, total: facultyRows.length, filters_applied: filters });
    } catch (err) {
        console.error('[GET /api/admin/analytics/faculty]', err);
        return fail('Failed to build faculty analysis.', 'FACULTY_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
