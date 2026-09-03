import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { extractBatchFromUsn, getStudentAcademicBatch } from '@/lib/semester-utils';
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
        const semester = parseInt(searchParams.get('semester') || '3', 10);

        const cacheKey = `cohort_trends:${branch}:${semester}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch all students in this department
        const { data: rawStudents, error: stuErr } = await supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, year, lateral_entry')
            .ilike('branch', `%${branch}%`)
            .limit(1000);

        if (stuErr) throw stuErr;

        const students = rawStudents || [];
        if (students.length === 0) {
            return ok({ branch, semester, batchComparison: [], subjectTrends: [] });
        }

        // Group students by academic cohort batch (accounting for lateral entry offset)
        const studentsByBatch = new Map();
        students.forEach(s => {
            const cohort = getStudentAcademicBatch(s.usn, s.lateral_entry);
            let bYear = cohort ? cohort.fullYear : (s.year ? String(s.year) : 'Unknown');
            const list = studentsByBatch.get(bYear) || [];
            list.push(s);
            studentsByBatch.set(bYear, list);
        });

        // 2. Fetch all subject marks for this department & semester
        const allUsns = students.map(s => s.usn);
        const { data: rawMarks } = await supabaseAdmin
            .from('subject_marks')
            .select('usn, subject_code, subject_name, internal, external, total, grade, passed')
            .in('usn', allUsns)
            .eq('semester', semester);

        const marks = rawMarks || [];

        const marksByUsn = new Map();
        marks.forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // 3. Compute metrics per batch for this semester
        const sortedBatches = Array.from(studentsByBatch.keys())
            .filter(b => b !== 'Unknown')
            .sort((a, b) => a.localeCompare(b));

        const batchComparison = [];
        const subjectBatchStats = new Map(); // subject_code -> Map(batch -> { appeared, passed })

        sortedBatches.forEach(bYear => {
            const bStudents = studentsByBatch.get(bYear) || [];
            let appearedCount = 0;
            let passedCount = 0;
            let failedCount = 0;
            let totalMarksSum = 0;
            let totalMarksSubjects = 0;

            bStudents.forEach(s => {
                const uMarks = marksByUsn.get(s.usn) || [];
                if (uMarks.length === 0) return;

                appearedCount++;
                const hasFail = uMarks.some(isFailedSubject);
                if (hasFail) {
                    failedCount++;
                } else {
                    passedCount++;
                }

                uMarks.forEach(m => {
                    const score = Number(m.total) || 0;
                    totalMarksSum += score;
                    totalMarksSubjects++;

                    const code = (m.subject_code || '').toUpperCase();
                    if (!subjectBatchStats.has(code)) {
                        subjectBatchStats.set(code, {
                            code,
                            name: m.subject_name || code,
                            batches: new Map()
                        });
                    }
                    const subObj = subjectBatchStats.get(code);
                    const bStat = subObj.batches.get(bYear) || { appeared: 0, passed: 0 };
                    bStat.appeared++;
                    if (!isFailedSubject(m)) bStat.passed++;
                    subObj.batches.set(bYear, bStat);
                });
            });

            if (appearedCount > 0) {
                batchComparison.push({
                    batch: `${bYear} Batch`,
                    batchYear: bYear,
                    enrolled: bStudents.length,
                    appeared: appearedCount,
                    passed: passedCount,
                    failed: failedCount,
                    passRate: pct(passedCount, appearedCount),
                    avgScore: totalMarksSubjects > 0 ? Number((totalMarksSum / totalMarksSubjects).toFixed(1)) : 0
                });
            }
        });

        // 4. Format subject-by-subject trends across batches
        const subjectTrends = Array.from(subjectBatchStats.values()).map(sub => {
            const ratesByBatch = {};
            let prevRate = null;
            let trend = 'stable';

            sortedBatches.forEach(bYear => {
                const stat = sub.batches.get(bYear);
                if (stat && stat.appeared > 0) {
                    const r = pct(stat.passed, stat.appeared);
                    ratesByBatch[bYear] = r;
                    if (prevRate !== null) {
                        if (r > prevRate + 3) trend = 'improving';
                        else if (r < prevRate - 3) trend = 'declining';
                    }
                    prevRate = r;
                } else {
                    ratesByBatch[bYear] = null;
                }
            });

            return {
                code: sub.code,
                name: sub.name,
                rates: ratesByBatch,
                trend
            };
        }).sort((a, b) => a.code.localeCompare(b.code));

        const payload = {
            branch,
            semester,
            batches: sortedBatches,
            batchComparison,
            subjectTrends
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/cohort-trends]', err);
        return fail('Failed to compile batch cohort trends: ' + (err.message || err), 'COHORT_TRENDS_ERROR', 500);
    }
}
