import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, buildStudentRow, parseFilters } from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * GET /api/admin/analytics/charts
 * Charts/Statistics — pre-aggregated datasets so the frontend never computes
 * chart data itself: grade distribution, pass-vs-fail, SGPA distribution,
 * subject/branch/semester/class pass %, backlog distribution.
 * (CGPA distribution + backlog distribution buckets already exist on the
 * dashboard route — not duplicated here beyond a plain reference.)
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
        const scopedUsns = new Set(dataset.students.map(s => s.usn));

        // ── Grade distribution + pass-vs-fail (from subject_marks) ──
        const gradeDistribution = {};
        let subjectPassed = 0, subjectFailed = 0;
        for (const m of dataset.subjectMarks) {
            if (!scopedUsns.has(m.usn)) continue;
            const g = m.grade || '—';
            gradeDistribution[g] = (gradeDistribution[g] || 0) + 1;
            if (m.passed) subjectPassed++; else subjectFailed++;
        }

        // ── SGPA distribution (bucketed) ──
        const sgpaDistribution = { '9-10': 0, '8-9': 0, '7-8': 0, '6-7': 0, 'below6': 0 };
        for (const r of rows) {
            if (!r.sgpa) continue;
            if (r.sgpa >= 9) sgpaDistribution['9-10']++;
            else if (r.sgpa >= 8) sgpaDistribution['8-9']++;
            else if (r.sgpa >= 7) sgpaDistribution['7-8']++;
            else if (r.sgpa >= 6) sgpaDistribution['6-7']++;
            else sgpaDistribution['below6']++;
        }

        // ── Pass % by subject ──
        const bySubject = {};
        for (const m of dataset.subjectMarks) {
            if (!scopedUsns.has(m.usn)) continue;
            (bySubject[m.subject_code] ||= []).push(m);
        }
        const subjectPassPercentage = Object.entries(bySubject).map(([code, marks]) => ({
            subject_code: code,
            pass_percentage: pct(marks.filter(m => m.passed).length, marks.length),
        }));

        // ── Pass % by branch / semester ──
        const branchGroups = {}, semesterGroups = {};
        for (const r of rows) {
            (branchGroups[r.branch || 'Unknown'] ||= []).push(r);
            (semesterGroups[r.semester ?? 'Unknown'] ||= []).push(r);
        }
        const passPercentageByGroup = (groups) => Object.entries(groups).map(([key, members]) => {
            const appeared = members.filter(m => m.has_results).length;
            const passed = members.filter(m => m.has_results && m.is_all_clear).length;
            return { key, appeared, passed, pass_percentage: pct(passed, appeared) };
        });
        const branchPassPercentage = passPercentageByGroup(branchGroups);
        const semesterPassPercentage = passPercentageByGroup(semesterGroups);

        // ── Pass % by class ──
        const rowByUsn = {};
        for (const r of rows) rowByUsn[r.usn] = r;
        const classPassPercentage = dataset.classes.map(c => {
            const usns = dataset.classStudents.filter(cs => cs.class_id === c.id).map(cs => cs.usn);
            const members = usns.map(u => rowByUsn[u]).filter(Boolean);
            const appeared = members.filter(m => m.has_results).length;
            const passed = members.filter(m => m.has_results && m.is_all_clear).length;
            return { id: c.id, name: c.name, appeared, passed, pass_percentage: pct(passed, appeared) };
        });

        // ── Backlog distribution (buckets) ──
        const backlogDistribution = { clear: 0, '1-2': 0, '3-5': 0, '6plus': 0 };
        for (const r of rows) {
            if (r.total_backlogs === 0) backlogDistribution.clear++;
            else if (r.total_backlogs <= 2) backlogDistribution['1-2']++;
            else if (r.total_backlogs <= 5) backlogDistribution['3-5']++;
            else backlogDistribution['6plus']++;
        }

        return ok({
            grade_distribution: gradeDistribution,
            pass_vs_fail: { passed: subjectPassed, failed: subjectFailed },
            sgpa_distribution: sgpaDistribution,
            subject_pass_percentage: subjectPassPercentage,
            branch_pass_percentage: branchPassPercentage,
            semester_pass_percentage: semesterPassPercentage,
            class_pass_percentage: classPassPercentage,
            backlog_distribution: backlogDistribution,
            filters_applied: filters,
        });
    } catch (err) {
        console.error('[GET /api/admin/analytics/charts]', err);
        return fail('Failed to build chart data.', 'CHARTS_ERROR', 500, { error: String(err?.message || err) });
    }
}
