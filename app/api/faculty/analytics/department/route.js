import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs, weightedCGPA } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch } from '@/lib/semester-utils';
import { scoreToGradePoint, resolveSubjectCredits } from '@/lib/export-utils';
import { isFailedSubject } from '@/lib/vtuGrades';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branch = (searchParams.get('branch') || 'CS').toUpperCase().trim();
        const batch = searchParams.get('batch') || '';

        const cacheKey = `dept_overview:${branch}:${batch}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students in this department
        let stuQuery = supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, semester, year, lateral_entry')
            .ilike('branch', `%${branch}%`)
            .limit(1000);

        const { data: rawStudents, error: stuErr } = await stuQuery;
        if (stuErr) throw stuErr;

        let students = rawStudents || [];
        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        if (students.length === 0) {
            return ok({
                department: branch,
                batch: batch || 'All',
                summary: { totalStudents: 0, overallPassRate: 0, avgCGPA: 0, totalBacklogs: 0 },
                semesters: []
            });
        }

        const usns = students.map(s => s.usn);

        // 2. Fetch subject marks and remarks
        const [
            { data: rawMarks },
            { data: rawRemarks }
        ] = await Promise.all([
            supabaseAdmin
                .from('subject_marks')
                .select('usn, semester, subject_code, internal, external, total, grade, passed')
                .in('usn', usns),
            supabaseAdmin
                .from('academic_remarks')
                .select('student_usn, semester, sgpa')
                .in('student_usn', usns)
        ]);

        const marks = rawMarks || [];
        const remarks = rawRemarks || [];

        // Group marks by semester & student
        const semStudentMarks = {}; // sem -> usn -> [marks]
        for (let s = 1; s <= 8; s++) semStudentMarks[s] = new Map();

        marks.forEach(m => {
            const sem = m.semester || 1;
            if (semStudentMarks[sem]) {
                const list = semStudentMarks[sem].get(m.usn) || [];
                list.push(m);
                semStudentMarks[sem].set(m.usn, list);
            }
        });

        // 3. Compute per-semester performance
        const semesterRows = [];
        let grandAppeared = 0;
        let grandPassed = 0;
        let grandSgpaSum = 0;
        let grandSgpaCount = 0;
        const baselineEnrollment = students.length;

        for (let sem = 1; sem <= 8; sem++) {
            const studentMarksMap = semStudentMarks[sem];
            const appearedUsns = Array.from(studentMarksMap.keys());
            const appearedCount = appearedUsns.length;

            if (appearedCount === 0) continue;

            let semPassed = 0;
            let semFailed = 0;
            let sgpaSum = 0;
            let maxSgpa = 0;
            let minSgpa = 10;

            appearedUsns.forEach(u => {
                const uMarks = studentMarksMap.get(u) || [];
                const hasFail = uMarks.some(isFailedSubject);

                if (hasFail) {
                    semFailed++;
                } else {
                    semPassed++;
                }

                // Compute SGPA for this student in this semester
                let semRegCr = 0;
                let semCrP = 0;
                uMarks.forEach(m => {
                    const cr = resolveSubjectCredits(m);
                    const isF = isFailedSubject(m);
                    const gp = scoreToGradePoint(m.total, m.grade);
                    semRegCr += cr;
                    if (!isF) semCrP += (cr * gp);
                });

                const storedRemark = remarks.find(r => r.student_usn === u && Number(r.semester) === sem);
                const sgpa = semRegCr > 0 ? Number((semCrP / semRegCr).toFixed(2)) : (storedRemark?.sgpa ? Number(storedRemark.sgpa) : 0);

                if (sgpa > 0) {
                    sgpaSum += sgpa;
                    if (sgpa > maxSgpa) maxSgpa = sgpa;
                    if (sgpa < minSgpa) minSgpa = sgpa;
                }
            });

            const passRate = pct(semPassed, appearedCount);
            const avgSgpa = appearedCount > 0 && sgpaSum > 0 ? Number((sgpaSum / appearedCount).toFixed(2)) : 0;
            const attritionDelta = baselineEnrollment - appearedCount;

            grandAppeared += appearedCount;
            grandPassed += semPassed;
            if (avgSgpa > 0) {
                grandSgpaSum += (avgSgpa * appearedCount);
                grandSgpaCount += appearedCount;
            }

            semesterRows.push({
                semester: sem,
                enrolled: baselineEnrollment,
                appeared: appearedCount,
                passed: semPassed,
                failed: semFailed,
                passRate,
                avgSgpa,
                highestSgpa: maxSgpa > 0 ? maxSgpa : 0,
                lowestSgpa: minSgpa <= 10 && minSgpa > 0 ? minSgpa : 0,
                attritionDelta
            });
        }

        // Overall Backlogs for department
        const allBacklogs = computeBacklogs(marks);

        const payload = {
            department: branch,
            batch: batch || 'All Batches',
            summary: {
                totalStudents: baselineEnrollment,
                overallPassRate: pct(grandPassed, grandAppeared),
                avgCGPA: grandSgpaCount > 0 ? Number((grandSgpaSum / grandSgpaCount).toFixed(2)) : 0,
                totalBacklogs: allBacklogs.totalBacklogs
            },
            semesters: semesterRows
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/department]', err);
        return fail('Failed to fetch department overview: ' + (err.message || err), 'DEPT_OVERVIEW_ERROR', 500);
    }
}
