import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import {
    getAdminClient, loadResultAnalysisDataset, buildStudentRow, rankBy,
    mode, average, findFacultyAssignment,
} from '../../../../lib/analytics-data';
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

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

const GRADE_TIERS = [
    { key: 'O', label: 'O (90-100)', name: 'Outstanding', min: 90, max: 100, color: '#6366F1' },
    { key: 'A+', label: 'A+ (80-89)', name: 'Excellent', min: 80, max: 89, color: '#3B82F6' },
    { key: 'A', label: 'A (70-79)', name: 'Very Good', min: 70, max: 79, color: '#10B981' },
    { key: 'B+', label: 'B+ (60-69)', name: 'Good', min: 60, max: 69, color: '#14B8A6' },
    { key: 'B', label: 'B (55-59)', name: 'Above Average', min: 55, max: 59, color: '#84CC16' },
    { key: 'C', label: 'C (50-54)', name: 'Average', min: 50, max: 54, color: '#F59E0B' },
    { key: 'P', label: 'P (40-49)', name: 'Pass', min: 40, max: 49, color: '#F97316' },
    { key: 'F', label: 'F (<40)', name: 'Fail / Backlog', min: 0, max: 39, color: '#EF4444' },
    { key: 'Absent', label: 'Absent', name: 'Absent (A)', min: 0, max: 0, color: '#64748B' },
];

/**
 * GET /api/faculty/reports
 * Faculty-scoped reporting rollup (subject pass/fail/absent counts, grade
 * distribution, class pass rates, top students by CGPA, subject-wise pass
 * rates, and faculty workload).
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
        const totalMarksCount = scopedMarks.length;

        // ── Authentic Grade Distribution from Total Scores ──
        const letterGradeCounts = {
            'O': 0, 'A+': 0, 'A': 0, 'B+': 0, 'B': 0, 'C': 0, 'P': 0, 'F': 0, 'Absent': 0,
        };
        let passCount = 0;
        let failCount = 0;
        let absentCount = 0;

        for (const m of scopedMarks) {
            const canonicalG = resolveCanonicalGrade(m);
            if (canonicalG === 'AB') {
                letterGradeCounts['Absent']++;
                absentCount++;
            } else if (canonicalG === 'F' || !m.passed) {
                letterGradeCounts['F']++;
                failCount++;
            } else {
                passCount++;
                if (letterGradeCounts[canonicalG] !== undefined) {
                    letterGradeCounts[canonicalG]++;
                } else {
                    letterGradeCounts['P']++;
                }
            }
        }

        // Formatted letter grade distribution for charts
        const letterGradeData = GRADE_TIERS.map(t => {
            const count = letterGradeCounts[t.key] || 0;
            return {
                key: t.key,
                label: t.label,
                name: t.name,
                count,
                percent: pct(count, totalMarksCount),
                color: t.color,
            };
        });

        // High-level outcome summary. `label` is required — the chart's
        // XAxis reads dataKey="label" (same field letterGradeData already
        // provides), and without it every bar collapses onto one undefined
        // category and the chart renders empty.
        const outcomeData = [
            { key: 'Pass', label: 'Pass', name: 'Clear Pass', count: passCount, percent: pct(passCount, totalMarksCount), color: '#10B981' },
            { key: 'Fail', label: 'Fail', name: 'Backlogs (F)', count: failCount, percent: pct(failCount, totalMarksCount), color: '#EF4444' },
            { key: 'Absent', label: 'Absent', name: 'Absents (A)', count: absentCount, percent: pct(absentCount, totalMarksCount), color: '#F59E0B' },
        ];

        // Legacy map compatibility
        const gradeDist = {
            'P': passCount,
            'F': failCount,
            'A': absentCount,
            ...letterGradeCounts,
        };

        // Distinction / First class summary
        const distinctionCount = (letterGradeCounts['O'] || 0) + (letterGradeCounts['A+'] || 0);
        const firstClassCount = (letterGradeCounts['A'] || 0) + (letterGradeCounts['B+'] || 0);

        // ── Subject-wise pass rates with Faculty Attribution & Metrics ──
        const studentByUsn = {};
        for (const s of dataset.students) studentByUsn[s.usn] = s;

        const bySubject = {};
        for (const m of scopedMarks) (bySubject[m.subject_code] ||= []).push(m);

        const subjectPassRates = Object.entries(bySubject)
            .map(([code, marks]) => {
                const passed = marks.filter(m => m.passed).length;
                const failed = marks.length - passed;
                const totals = marks.map(m => m.total).filter(v => typeof v === 'number' && !isNaN(v));
                const semester = mode(marks.map(m => m.semester).filter(Boolean));
                const branch = mode(marks.map(m => studentByUsn[m.usn]?.branch).filter(Boolean));
                const scheme = mode(marks.map(m => studentByUsn[m.usn]?.scheme).filter(Boolean));

                const assignment = findFacultyAssignment(dataset.facultyAssignments, { subjectCode: code, branch, semester, scheme });
                const facultyObj = assignment ? dataset.facultyById[assignment.faculty_id] : null;
                const facultyName = facultyObj?.full_name || 'Unassigned';
                const facultyDept = facultyObj?.department || null;

                const catalogEntry = dataset.lookupSubjectCatalog({ code, branch, semester, scheme });

                return {
                    code,
                    name: catalogEntry?.name || marks[0]?.subject_name || code,
                    semester: semester || null,
                    branch: branch || null,
                    passed,
                    failed,
                    total: marks.length,
                    passRate: pct(passed, marks.length),
                    facultyName,
                    facultyDept,
                    avgMarks: totals.length ? Math.round(average(totals) * 10) / 10 : null,
                    highestMarks: totals.length ? Math.max(...totals) : null,
                    lowestMarks: totals.length ? Math.min(...totals) : null,
                };
            })
            .sort((a, b) => a.code.localeCompare(b.code));

        // ── Faculty Workload Rollup ──
        const facultyMap = {};
        for (const sub of subjectPassRates) {
            const facKey = sub.facultyName;
            if (!facultyMap[facKey]) {
                facultyMap[facKey] = {
                    facultyName: facKey,
                    department: sub.facultyDept,
                    subjects: [],
                    totalStudents: 0,
                    totalPassed: 0,
                };
            }
            facultyMap[facKey].subjects.push(sub);
            facultyMap[facKey].totalStudents += sub.total;
            facultyMap[facKey].totalPassed += sub.passed;
        }

        const facultyWorkload = Object.values(facultyMap).map(f => ({
            facultyName: f.facultyName,
            department: f.department,
            subjectCount: f.subjects.length,
            subjects: f.subjects,
            totalStudents: f.totalStudents,
            totalPassed: f.totalPassed,
            avgPassRate: pct(f.totalPassed, f.totalStudents),
        })).sort((a, b) => b.totalStudents - a.totalStudents);

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
                totalSubjects: totalMarksCount,
                passCount,
                failCount,
                absentCount,
                distinctionCount,
                firstClassCount,
                distinctionRate: pct(distinctionCount, totalMarksCount),
                firstClassRate: pct(firstClassCount, totalMarksCount),
                gradeDist,
                letterGradeData,
                outcomeData,
                topStudents,
                classStats,
                subjectPassRates,
                facultyWorkload,
            },
        });
    } catch (err) {
        console.error('[GET /api/faculty/reports]', err);
        return NextResponse.json({ success: false, error: 'Failed to build faculty report.' }, { status: 500 });
    }
}
