import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, buildStudentRow, parseFilters } from '../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

// ── Standard response helpers ───────────────────────────────────────────────
function ok(data) {
    return NextResponse.json({ success: true, data });
}
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * GET /api/admin/analytics
 * Dashboard Summary — single aggregate endpoint (replaces the 1+N pattern).
 * Auth: staff session cookie. Admin → all data; Faculty → their assigned classes only.
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

        // ── Distributions + KPI accumulation ──
        const cgpaDist = { '9-10': 0, '8-9': 0, '7-8': 0, '6-7': 0, 'below6': 0 };
        const backlogDist = { clear: 0, '1-2': 0, '3-5': 0, '6plus': 0 };
        const branchDist = {}, semDist = {};
        let cgpaSum = 0, cgpaCount = 0, sgpaSum = 0, sgpaCount = 0;
        let withBacklogs = 0, withoutCgpa = 0, withResults = 0, allClear = 0;
        let appeared = 0, passed = 0, failed = 0;
        let highestCgpa = null, lowestCgpa = null, highestSgpa = null, lowestSgpa = null;

        const rowByUsn = {};
        for (const r of rows) {
            rowByUsn[r.usn] = r;
            if (r.has_results) { appeared++; withResults++; }
            if (r.has_results && r.is_all_clear) passed++;
            if (r.has_results && !r.is_all_clear) failed++;
            if (r.is_all_clear) allClear++;

            if (r.cgpa > 0) {
                cgpaSum += r.cgpa; cgpaCount++;
                highestCgpa = highestCgpa === null ? r.cgpa : Math.max(highestCgpa, r.cgpa);
                lowestCgpa = lowestCgpa === null ? r.cgpa : Math.min(lowestCgpa, r.cgpa);
            } else withoutCgpa++;

            if (r.sgpa) {
                sgpaSum += r.sgpa; sgpaCount++;
                highestSgpa = highestSgpa === null ? r.sgpa : Math.max(highestSgpa, r.sgpa);
                lowestSgpa = lowestSgpa === null ? r.sgpa : Math.min(lowestSgpa, r.sgpa);
            }

            if (r.total_backlogs > 0) withBacklogs++;

            if (r.cgpa >= 9) cgpaDist['9-10']++;
            else if (r.cgpa >= 8) cgpaDist['8-9']++;
            else if (r.cgpa >= 7) cgpaDist['7-8']++;
            else if (r.cgpa >= 6) cgpaDist['6-7']++;
            else if (r.cgpa > 0) cgpaDist['below6']++;

            if (r.total_backlogs === 0) backlogDist.clear++;
            else if (r.total_backlogs <= 2) backlogDist['1-2']++;
            else if (r.total_backlogs <= 5) backlogDist['3-5']++;
            else backlogDist['6plus']++;

            branchDist[r.branch || 'Unknown'] = (branchDist[r.branch || 'Unknown'] || 0) + 1;
            semDist[r.semester ?? 'Unknown'] = (semDist[r.semester ?? 'Unknown'] || 0) + 1;
        }

        // ── Class analytics (scoped by role + filters) ──
        const classAnalytics = dataset.classes.map(c => {
            const usns = dataset.classStudents.filter(cs => cs.class_id === c.id).map(cs => cs.usn);
            const members = usns.map(u => rowByUsn[u]).filter(Boolean);
            const withCg = members.filter(m => m.cgpa > 0);
            const avgCgpa = withCg.length ? Math.round((withCg.reduce((a, m) => a + m.cgpa, 0) / withCg.length) * 100) / 100 : 0;
            return {
                id: c.id, name: c.name, branch: c.branch, semester: c.semester,
                section: c.section || null, batch: c.batch || null,
                student_count: usns.length,
                average_cgpa: avgCgpa,
                total_backlogs: members.reduce((a, m) => a + m.total_backlogs, 0),
            };
        });
        const emptyClasses = dataset.classes.filter(c => !dataset.classStudents.some(cs => cs.class_id === c.id)).length;

        const totalStudents = rows.length;
        const data = {
            kpis: {
                total_students: totalStudents,
                appeared,
                passed,
                failed,
                overall_pass_percentage: pct(passed, appeared),
                total_classes: dataset.classes.length,
                average_sgpa: sgpaCount ? Math.round((sgpaSum / sgpaCount) * 100) / 100 : 0,
                average_cgpa: cgpaCount ? Math.round((cgpaSum / cgpaCount) * 100) / 100 : 0,
                highest_sgpa: highestSgpa,
                lowest_sgpa: lowestSgpa,
                highest_cgpa: highestCgpa,
                lowest_cgpa: lowestCgpa,
                total_backlogs: rows.reduce((a, r) => a + r.total_backlogs, 0),
                all_clear_students: allClear,
                students_with_backlogs: withBacklogs,
                students_without_cgpa: withoutCgpa,
                empty_classes: emptyClasses,
                coverage_percentage: pct(withResults, totalStudents),
            },
            branch_distribution: branchDist,
            semester_distribution: semDist,
            cgpa_distribution: cgpaDist,
            backlog_distribution: backlogDist,
            class_analytics: classAnalytics,
            data_coverage: {
                total_students: totalStudents,
                students_with_results: withResults,
                coverage_percentage: pct(withResults, totalStudents),
            },
            academic_health: {
                clear_students: backlogDist.clear,
                at_risk_students: backlogDist['3-5'] + backlogDist['6plus'],
                pass_rate: pct(backlogDist.clear, totalStudents),
            },
            generated_for_role: session.role,
            filters_applied: filters,
        };

        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/analytics]', err);
        return fail('Failed to build analytics.', 'ANALYTICS_ERROR', 500, { error: String(err?.message || err) });
    }
}
