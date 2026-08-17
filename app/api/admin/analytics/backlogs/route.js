import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, buildStudentRow, parseFilters } from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/admin/analytics/backlogs
 * Backlog Analysis — student/subject/branch/semester/class breakdowns + failed
 * subjects, derived from subject_marks.is_backlog (the single source of truth).
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

        const rows = dataset.students.map(s => buildStudentRow(s, dataset));
        const studentBacklogs = rows
            .filter(r => r.total_backlogs > 0)
            .map(r => ({
                usn: r.usn, name: r.name, branch: r.branch, semester: r.semester,
                total_backlogs: r.total_backlogs, max_semester_backlogs: r.max_semester_backlogs,
                failed_subjects: r.failed_subjects,
            }));

        const scopedUsns = new Set(dataset.students.map(s => s.usn));
        const rowByUsn = {};
        for (const r of rows) rowByUsn[r.usn] = r;

        // ── Subject-level backlog counts ──
        const subjectBacklogs = {};
        for (const m of dataset.subjectMarks) {
            if (!scopedUsns.has(m.usn) || !m.is_backlog) continue;
            const key = m.subject_code;
            subjectBacklogs[key] ||= { subject_code: key, subject_name: m.subject_name, backlog_count: 0 };
            subjectBacklogs[key].backlog_count++;
        }

        // ── Branch / Semester / Class level totals ──
        const branchBacklogs = {}, semesterBacklogs = {};
        for (const r of rows) {
            branchBacklogs[r.branch || 'Unknown'] = (branchBacklogs[r.branch || 'Unknown'] || 0) + r.total_backlogs;
            semesterBacklogs[r.semester ?? 'Unknown'] = (semesterBacklogs[r.semester ?? 'Unknown'] || 0) + r.total_backlogs;
        }

        const classBacklogs = dataset.classes.map(c => {
            const usns = dataset.classStudents.filter(cs => cs.class_id === c.id).map(cs => cs.usn);
            const members = usns.map(u => rowByUsn[u]).filter(Boolean);
            return {
                id: c.id, name: c.name, branch: c.branch, semester: c.semester,
                total_backlogs: members.reduce((a, m) => a + m.total_backlogs, 0),
                students_with_backlogs: members.filter(m => m.total_backlogs > 0).length,
            };
        });

        return ok({
            student_backlogs: studentBacklogs,
            subject_backlogs: Object.values(subjectBacklogs).sort((a, b) => b.backlog_count - a.backlog_count),
            branch_backlogs: branchBacklogs,
            semester_backlogs: semesterBacklogs,
            class_backlogs: classBacklogs,
            total_backlogs: rows.reduce((a, r) => a + r.total_backlogs, 0),
            students_with_backlogs: studentBacklogs.length,
            filters_applied: filters,
        });
    } catch (err) {
        console.error('[GET /api/admin/analytics/backlogs]', err);
        return fail('Failed to build backlog analysis.', 'BACKLOG_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
