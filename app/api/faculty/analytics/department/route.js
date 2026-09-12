import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, matchesBranch } from '@/lib/semester-utils';
import { loadStudentRecords } from '@/lib/student-record';

import { unstable_noStore as noStore } from 'next/cache';

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

export const fetchCache = 'force-no-store';
export const revalidate = 0;

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export async function GET(req) {
    noStore();
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branch = (searchParams.get('branch') || 'CS').toUpperCase().trim();
        const batch = searchParams.get('batch') || '';
        const fresh = searchParams.get('fresh') === '1';

        const cacheKey = `dept_overview:${branch}:${batch}`;
        if (!fresh) {
            const cached = getCached(cacheKey);
            if (cached) return ok(cached);
        }

        const supabaseAdmin = getAdminClient();

        // 1. Canonical per-student records from shared warehouse read
        const studentRecords = await loadStudentRecords(supabaseAdmin, { fresh });

        let records = [...studentRecords.values()];
        if (branch && branch !== 'ALL') {
            records = records.filter(r => matchesBranch(r.raw, branch));
        }
        if (batch && batch.toUpperCase() !== 'ALL') {
            records = records.filter(r => matchesBatch(r.raw, batch));
        }

        if (records.length === 0) {
            return ok({
                department: branch,
                batch: batch || 'All',
                summary: { totalStudents: 0, overallPassRate: 0, avgCGPA: 0, totalBacklogs: 0 },
                semesters: []
            });
        }

        let allBacklogsCount = 0;
        records.forEach(record => { allBacklogsCount += record.totalActiveBacklogs; });

        // 2. Compute per-semester performance from canonical semStats
        const semesterRows = [];
        let grandAppeared = 0;
        let grandPassed = 0;
        let grandSgpaSum = 0;
        let grandSgpaCount = 0;
        const baselineEnrollment = records.length;

        for (let sem = 1; sem <= 8; sem++) {
            let appearedCount = 0;
            let semPassed = 0;
            let semFailed = 0;
            let sgpaSum = 0;
            let maxSgpa = 0;
            let minSgpa = 10;

            records.forEach(record => {
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
