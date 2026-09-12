import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import {
    getAdminClient, loadResultAnalysisDataset, parseFilters,
    mode, average, findFacultyAssignment,
} from '../../../../../lib/analytics-data';
import { resolveCanonicalGrade } from '@/lib/vtuGrades';

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
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * GET /api/admin/analytics/subjects
 * Subject Analysis — per-subject-code aggregate: appeared/passed/failed/pass%,
 * internal/external/total averages, highest/lowest marks, grade distribution,
 * faculty attribution (via faculty_subject_assignments, "Unassigned" fallback).
 * Subject name/credits prefer the subjects catalog table (canonical) when a
 * matching code+branch+semester+scheme row exists there; otherwise they fall
 * back to whatever subject_marks recorded, since the catalog may be sparsely
 * populated for some scheme/branch/semester combinations.
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

        const scopedUsns = new Set(dataset.students.map(s => s.usn));
        const studentByUsn = {};
        for (const s of dataset.students) studentByUsn[s.usn] = s;

        const bySubject = {};
        for (const m of dataset.subjectMarks) {
            if (!scopedUsns.has(m.usn)) continue;
            (bySubject[m.subject_code] ||= []).push(m);
        }

        const subjects = Object.entries(bySubject).map(([code, marks]) => {
            const appeared = marks.length;
            const passed = marks.filter(m => m.passed).length;
            const failed = appeared - passed;

            const totals = marks.map(m => m.total).filter(v => v !== null && v !== undefined);
            const semester = mode(marks.map(m => m.semester));
            const branch = mode(marks.map(m => studentByUsn[m.usn]?.branch).filter(Boolean));
            const scheme = mode(marks.map(m => studentByUsn[m.usn]?.scheme).filter(Boolean)) || '2022';

            const gradeDistribution = {};
            for (const m of marks) {
                const g = resolveCanonicalGrade(m, scheme);
                gradeDistribution[g] = (gradeDistribution[g] || 0) + 1;
            }

            const assignment = findFacultyAssignment(dataset.facultyAssignments, { subjectCode: code, branch, semester, scheme, classId: filters.classId });
            const facultyName = assignment ? (dataset.facultyById[assignment.faculty_id]?.full_name || 'Unassigned') : 'Unassigned';

            const catalogEntry = dataset.lookupSubjectCatalog({ code, branch, semester, scheme });

            return {
                subject_code: code,
                subject_name: catalogEntry?.name || marks[0]?.subject_name || code,
                credits: catalogEntry?.credits ?? null,
                faculty: facultyName,
                branch: branch || null,
                semester: semester ?? null,
                appeared,
                passed,
                failed,
                pass_percentage: pct(passed, appeared),
                internal_average: average(marks.map(m => m.internal)),
                external_average: average(marks.map(m => m.external)),
                total_average: average(totals),
                highest_marks: totals.length ? Math.max(...totals) : null,
                lowest_marks: totals.length ? Math.min(...totals) : null,
                grade_distribution: gradeDistribution,
            };
        });

        subjects.sort((a, b) => a.subject_code.localeCompare(b.subject_code));

        return ok({ subjects, total: subjects.length, filters_applied: filters });
    } catch (err) {
        console.error('[GET /api/admin/analytics/subjects]', err);
        return fail('Failed to build subject analysis.', 'SUBJECT_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
