import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import {
    getAdminClient, loadResultAnalysisDataset, buildStudentRow, parseFilters,
    rankBy,
} from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * GET /api/admin/analytics/rankings
 * Rankings — top/bottom 10 students by CGPA, top/lowest subjects and classes
 * by pass %. Deterministic: ties are broken by USN/code/id ascending.
 * Filters: ?academicYear=&examSession=&branch=&semester=&classId=&section=
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);
        const limit = Math.min(parseInt(searchParams.get('limit')) || 10, 50);

        const dataset = await loadResultAnalysisDataset(getAdminClient(), {
            role: session.role, facultyId: session.sub, filters,
        });

        // ── Student rankings (by CGPA) ──
        const allStudentRows = dataset.students.map(s => buildStudentRow(s, dataset));
        const studentRows = allStudentRows.filter(s => s.cgpa > 0);
        const topStudents = rankBy(studentRows, s => s.cgpa, { tieBreakKey: s => s.usn }).slice(0, limit);
        const bottomStudents = rankBy(studentRows, s => s.cgpa, { ascending: true, tieBreakKey: s => s.usn }).slice(0, limit);

        // ── Subject rankings (by pass %) ──
        const scopedUsns = new Set(dataset.students.map(s => s.usn));
        const bySubject = {};
        for (const m of dataset.subjectMarks) {
            if (!scopedUsns.has(m.usn)) continue;
            (bySubject[m.subject_code] ||= []).push(m);
        }
        const subjectRows = Object.entries(bySubject).map(([code, marks]) => {
            const passed = marks.filter(m => m.passed).length;
            return {
                subject_code: code,
                subject_name: marks[0]?.subject_name || code,
                appeared: marks.length,
                passed,
                pass_percentage: pct(passed, marks.length),
            };
        });
        const topSubjects = rankBy(subjectRows, s => s.pass_percentage, { tieBreakKey: s => s.subject_code }).slice(0, limit);
        const lowestSubjects = rankBy(subjectRows, s => s.pass_percentage, { ascending: true, tieBreakKey: s => s.subject_code }).slice(0, limit);

        // ── Class rankings (by pass %) ──
        const rowByUsn = {};
        for (const s of allStudentRows) rowByUsn[s.usn] = s;

        const classRows = dataset.classes.map(c => {
            const usns = dataset.classStudents.filter(cs => cs.class_id === c.id).map(cs => cs.usn);
            const members = usns.map(u => rowByUsn[u]).filter(Boolean);
            const appeared = members.filter(m => m.has_results).length;
            const passed = members.filter(m => m.has_results && m.is_all_clear).length;
            return {
                id: c.id, name: c.name, branch: c.branch, semester: c.semester,
                appeared, passed, pass_percentage: pct(passed, appeared),
            };
        }).filter(c => c.appeared > 0);
        const topClasses = rankBy(classRows, c => c.pass_percentage, { tieBreakKey: c => c.id }).slice(0, limit);
        const lowestClasses = rankBy(classRows, c => c.pass_percentage, { ascending: true, tieBreakKey: c => c.id }).slice(0, limit);

        return ok({
            top_students: topStudents,
            bottom_students: bottomStudents,
            top_subjects: topSubjects,
            lowest_subjects: lowestSubjects,
            top_classes: topClasses,
            lowest_classes: lowestClasses,
            filters_applied: filters,
        });
    } catch (err) {
        console.error('[GET /api/admin/analytics/rankings]', err);
        return fail('Failed to build rankings.', 'RANKINGS_ERROR', 500, { error: String(err?.message || err) });
    }
}
