import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents, fetchDynamicMarks } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch } from '@/lib/semester-utils';
import { calculateAcademicRecord } from '@/lib/vtuAcademicEngine';
import { fetchCatalogIndex } from '@/lib/subjectCreditResolver';

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

        // 1. Fetch students in this department dynamically without limits
        const rawStudents = await fetchDynamicStudents(supabaseAdmin, {
            branch,
            select: 'id, usn, name, branch, semester, year, lateral_entry, scheme'
        });

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

        // 2. Fetch subject marks dynamically
        const marks = await fetchDynamicMarks(supabaseAdmin, { usns, select: 'usn, semester, subject_code, subject_name, internal, external, total, grade, credits, passed' });

        const marksByUsn = new Map();
        marks.forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // 3. Compute each student's canonical academic record once — same engine
        // (lib/vtuAcademicEngine.js) as the Student Lookup dashboard — then derive
        // the department rollup from it below, so SGPA/backlogs here never drift
        // from what faculty see on that page for the same student. This used to
        // hand-roll its own per-semester SGPA using a credit resolver that trusted
        // the (sometimes stale) subject_marks.credits column.
        const catalogIndex = await fetchCatalogIndex(supabaseAdmin);
        const recordsByUsn = new Map();
        await Promise.all(students.map(async s => {
            const uMarks = marksByUsn.get(s.usn) || [];
            if (uMarks.length === 0) return;
            const record = await calculateAcademicRecord(uMarks, { usn: s.usn, branch: s.branch, scheme: s.scheme }, { catalogIndex });
            recordsByUsn.set(s.usn, record);
        }));

        let allBacklogsCount = 0;
        recordsByUsn.forEach(record => { allBacklogsCount += record.totalActiveBacklogs; });

        // 4. Compute per-semester performance
        const semesterRows = [];
        let grandAppeared = 0;
        let grandPassed = 0;
        let grandSgpaSum = 0;
        let grandSgpaCount = 0;
        const baselineEnrollment = students.length;

        for (let sem = 1; sem <= 8; sem++) {
            let appearedCount = 0;
            let semPassed = 0;
            let semFailed = 0;
            let sgpaSum = 0;
            let maxSgpa = 0;
            let minSgpa = 10;

            recordsByUsn.forEach(record => {
                const stat = record.semStats[sem];
                if (!stat) return;
                appearedCount++;

                if (stat.backlogs > 0) {
                    semFailed++;
                } else {
                    semPassed++;
                }

                if (stat.sgpa > 0) {
                    sgpaSum += stat.sgpa;
                    if (stat.sgpa > maxSgpa) maxSgpa = stat.sgpa;
                    if (stat.sgpa < minSgpa) minSgpa = stat.sgpa;
                }
            });

            if (appearedCount === 0) continue;

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

        const payload = {
            department: branch,
            batch: batch || 'All Batches',
            summary: {
                totalStudents: baselineEnrollment,
                overallPassRate: pct(grandPassed, grandAppeared),
                avgCGPA: grandSgpaCount > 0 ? Number((grandSgpaSum / grandSgpaCount).toFixed(2)) : 0,
                totalBacklogs: allBacklogsCount
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
