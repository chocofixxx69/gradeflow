import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient, getStudentAnalytics, parseFilters } from '../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

// VTU rule of thumb: >4 backlogs in a single semester blocks promotion to N+2.
function classifyRisk(s) {
    if (s.max_semester_backlogs > 4 || s.total_backlogs >= 6) return 'CRITICAL';
    if (s.total_backlogs >= 3) return 'HIGH';
    if (s.total_backlogs >= 1) return 'MODERATE';
    return 'SAFE';
}

/**
 * GET /api/admin/analytics/risk
 * Advanced analytics — student risk analysis based on backlog load.
 * Auth: staff (admin = all, faculty = own classes).
 * Filters: ?academicYear=&examSession=&branch=&semester=&classId=&section=
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);

        const { students } = await getStudentAnalytics(getAdminClient(), {
            role: session.role, facultyId: session.sub, filters,
        });

        const summary = { CRITICAL: 0, HIGH: 0, MODERATE: 0, SAFE: 0 };
        const atRisk = [];
        for (const s of students) {
            const level = classifyRisk(s);
            summary[level]++;
            if (level !== 'SAFE') {
                atRisk.push({
                    usn: s.usn, name: s.name, branch: s.branch, semester: s.semester,
                    class_name: s.class_name, section: s.section,
                    cgpa: s.cgpa, total_backlogs: s.total_backlogs,
                    max_semester_backlogs: s.max_semester_backlogs, risk_level: level,
                });
            }
        }
        // worst first
        const order = { CRITICAL: 0, HIGH: 1, MODERATE: 2 };
        atRisk.sort((a, b) => (order[a.risk_level] - order[b.risk_level]) || (b.total_backlogs - a.total_backlogs));

        const total = students.length;
        return ok({
            summary,
            total_students: total,
            at_risk_count: atRisk.length,
            at_risk_percentage: total ? Math.round((atRisk.length / total) * 1000) / 10 : 0,
            students: atRisk,
            filters_applied: filters,
        });
    } catch (err) {
        console.error('[GET /api/admin/analytics/risk]', err);
        return fail('Failed to compute risk analysis.', 'RISK_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
