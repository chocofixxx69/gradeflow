import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import {
    getAdminClient, loadResultAnalysisDataset, buildStudentRow, rankBy,
} from '../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * GET /api/faculty/reports
 * Faculty-scoped reporting rollup (subject pass/fail/absent counts, grade
 * distribution, class pass rates, top students by CGPA, subject-wise pass
 * rates). Reuses the same dataset/helpers as /api/admin/analytics/* —
 * loadResultAnalysisDataset already scopes everything to the calling
 * faculty's own classes when role === 'faculty'.
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const dataset = await loadResultAnalysisDataset(getAdminClient(), {
            role: session.role,
            facultyId: session.sub,
        });

        const scopedUsns = new Set(dataset.students.map(s => s.usn));
        const scopedMarks = dataset.subjectMarks.filter(m => scopedUsns.has(m.usn));

        // ── Grade distribution + pass/fail/absent counts ──
        const gradeDist = {};
        for (const m of scopedMarks) {
            const g = (m.grade || '—').toUpperCase();
            gradeDist[g] = (gradeDist[g] || 0) + 1;
        }
        const passCount = scopedMarks.filter(m => m.passed).length;
        const failCount = gradeDist['F'] || 0;
        const absentCount = gradeDist['A'] || 0;

        // ── Subject-wise pass rates ──
        const bySubject = {};
        for (const m of scopedMarks) (bySubject[m.subject_code] ||= []).push(m);
        const subjectPassRates = Object.entries(bySubject)
            .map(([code, marks]) => {
                const passed = marks.filter(m => m.passed).length;
                return {
                    code,
                    name: marks[0]?.subject_name || code,
                    passed,
                    total: marks.length,
                    passRate: pct(passed, marks.length),
                };
            })
            .sort((a, b) => a.code.localeCompare(b.code));

        // ── Class pass rates ──
        const allStudentRows = dataset.students.map(s => buildStudentRow(s, dataset));
        const rowByUsn = {};
        for (const s of allStudentRows) rowByUsn[s.usn] = s;

        const classStats = dataset.classes.map(c => {
            const usns = dataset.classStudents.filter(cs => cs.class_id === c.id).map(cs => cs.usn);
            const members = usns.map(u => rowByUsn[u]).filter(Boolean);
            const appeared = members.filter(m => m.has_results).length;
            const passed = members.filter(m => m.has_results && m.is_all_clear).length;
            return {
                name: c.name || 'Class',
                students: usns.length,
                passRate: appeared ? pct(passed, appeared) : null,
            };
        });

        // ── Top students by CGPA ──
        const studentRows = allStudentRows.filter(s => s.cgpa > 0);
        const topStudents = rankBy(studentRows, s => s.cgpa, { tieBreakKey: s => s.usn })
            .slice(0, 5)
            .map(s => ({ usn: s.usn, name: s.name, cgpa: s.cgpa }));

        return NextResponse.json({
            success: true,
            data: {
                uniqueStudents: dataset.students.length,
                totalSubjects: scopedMarks.length,
                passCount,
                failCount,
                absentCount,
                gradeDist,
                topStudents,
                classStats,
                subjectPassRates,
            },
        });
    } catch (err) {
        console.error('[GET /api/faculty/reports]', err);
        return NextResponse.json({ success: false, error: 'Failed to build faculty report.' }, { status: 500 });
    }
}
