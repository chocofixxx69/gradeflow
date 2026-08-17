import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, buildStudentRow, parseFilters } from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const avg = (nums) => nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;

/**
 * GET /api/admin/analytics/classes
 * Class Analysis — per-class rollup: appeared/passed/failed/pass%, avg SGPA/CGPA,
 * total backlogs, topper/lowest performer, section/batch.
 * (Distinct from the CRUD /api/classes route — this is analysis-only, read-only.)
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

        const rowByUsn = {};
        for (const s of dataset.students) rowByUsn[s.usn] = buildStudentRow(s, dataset);

        const classes = dataset.classes.map(c => {
            const usns = dataset.classStudents.filter(cs => cs.class_id === c.id).map(cs => cs.usn);
            const members = usns.map(u => rowByUsn[u]).filter(Boolean);

            const appeared = members.filter(m => m.has_results).length;
            const passed = members.filter(m => m.has_results && m.is_all_clear).length;
            const failed = appeared - passed;

            const cgpas = members.filter(m => m.cgpa > 0);
            const sgpas = members.filter(m => m.sgpa);

            let topper = null, lowest = null;
            for (const m of cgpas) {
                if (!topper || m.cgpa > topper.cgpa) topper = m;
                if (!lowest || m.cgpa < lowest.cgpa) lowest = m;
            }

            return {
                id: c.id,
                name: c.name,
                branch: c.branch,
                semester: c.semester,
                section: c.section || null,
                batch: c.batch || null,
                academic_year: c.academic_year || null,
                total_students: usns.length,
                appeared,
                passed,
                failed,
                pass_percentage: pct(passed, appeared),
                average_sgpa: avg(sgpas.map(m => m.sgpa)),
                average_cgpa: avg(cgpas.map(m => m.cgpa)),
                total_backlogs: members.reduce((a, m) => a + m.total_backlogs, 0),
                topper: topper ? { usn: topper.usn, name: topper.name, cgpa: topper.cgpa } : null,
                lowest_performer: lowest ? { usn: lowest.usn, name: lowest.name, cgpa: lowest.cgpa } : null,
            };
        });

        return ok({ classes, total: classes.length, filters_applied: filters });
    } catch (err) {
        console.error('[GET /api/admin/analytics/classes]', err);
        return fail('Failed to build class analysis.', 'CLASS_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
