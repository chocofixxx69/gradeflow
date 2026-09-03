import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs } from '@/lib/analytics-data';
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

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branch = (searchParams.get('branch') || 'CS').toUpperCase().trim();
        const batch = searchParams.get('batch') || '';
        const upToSemester = Math.min(8, Math.max(1, parseInt(searchParams.get('upToSemester') || '6', 10)));

        const cacheKey = `batch_report:${branch}:${batch}:${upToSemester}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students for this branch & batch
        let query = supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, semester, year, lateral_entry')
            .ilike('branch', `%${branch}%`)
            .limit(500);

        const { data: stData } = await query;
        let students = stData || [];

        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        if (students.length === 0) {
            return ok({
                students: [],
                upToSemester,
                summary: {
                    totalStudents: 0,
                    avgCGPA: 0,
                    withBacklogs: 0,
                    distinctionCount: 0,
                    lateralCount: 0
                }
            });
        }

        const usns = students.map(s => s.usn);

        // 2. Fetch all subject marks & remarks for these students up to target semester
        const [
            { data: marksData },
            { data: remarksData }
        ] = await Promise.all([
            supabaseAdmin
                .from('subject_marks')
                .select('*')
                .in('usn', usns)
                .lte('semester', upToSemester),
            supabaseAdmin
                .from('academic_remarks')
                .select('student_usn, semester, sgpa')
                .in('student_usn', usns)
                .lte('semester', upToSemester)
        ]);

        // Group remarks and marks by USN
        const remarksByUsn = new Map();
        (remarksData || []).forEach(r => {
            const list = remarksByUsn.get(r.student_usn) || [];
            list.push(r);
            remarksByUsn.set(r.student_usn, list);
        });

        const marksByUsn = new Map();
        (marksData || []).forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // 3. Process progression for each student
        const processedStudents = [];
        let totalCgpaSum = 0;
        let cgpaCount = 0;
        let withBacklogsCount = 0;
        let distinctionCount = 0;
        let lateralCount = 0;

        students.forEach(student => {
            const uMarks = marksByUsn.get(student.usn) || [];
            const uRemarks = remarksByUsn.get(student.usn) || [];

            // Detect Lateral Entry (LE)
            // Diplomas entering in 2nd year (3rd sem): either flagged or USN sequence 400+ or no sem 1/2
            const isLE = Boolean(
                student.lateral_entry ||
                (student.usn && /[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}4[0-9]{2}/i.test(student.usn))
            );
            if (isLE) lateralCount++;

            // Calculate per-semester stats
            const semesters = {};
            let cumulativeCredits = 0;
            let cumulativeWeightedPoints = 0;

            for (let sem = 1; sem <= upToSemester; sem++) {
                if (isLE && (sem === 1 || sem === 2)) {
                    semesters[sem] = { isLE: true, sgpa: null, credits: null, backlogs: 0 };
                    continue;
                }

                const semMarks = uMarks.filter(m => Number(m.semester) === sem);
                const storedRemark = uRemarks.find(r => Number(r.semester) === sem);

                if (semMarks.length === 0 && !storedRemark) {
                    semesters[sem] = { hasData: false, sgpa: null, credits: null, backlogs: 0 };
                    continue;
                }

                let semRegCredits = 0;
                let semEarnedCredits = 0;
                let semPoints = 0;
                let semBacklogs = 0;

                semMarks.forEach(m => {
                    const cr = resolveSubjectCredits(m);
                    const isFail = isFailedSubject(m);
                    const gp = scoreToGradePoint(m.total ?? m.total_marks, m.grade);

                    semRegCredits += cr;
                    if (isFail) {
                        semBacklogs++;
                    } else {
                        semEarnedCredits += cr;
                        semPoints += (cr * gp);
                    }
                });

                let sgpa = null;
                if (semRegCredits > 0) {
                    sgpa = Number((semPoints / semRegCredits).toFixed(2));
                } else if (storedRemark?.sgpa) {
                    sgpa = Number(Number(storedRemark.sgpa).toFixed(2));
                    semEarnedCredits = 20; // standard default
                    semRegCredits = 20;
                }

                if (sgpa !== null) {
                    cumulativeCredits += semEarnedCredits;
                    cumulativeWeightedPoints += (sgpa * semRegCredits);
                }

                semesters[sem] = {
                    hasData: true,
                    sgpa,
                    credits: semEarnedCredits,
                    regCredits: semRegCredits,
                    backlogs: semBacklogs
                };
            }

            // Calculate Backlog Credits using canonical computeBacklogs
            const backlogInfo = computeBacklogs(uMarks);
            const totalBacklogCredits = backlogInfo.failedSubjects.reduce((sum, sub) => sum + (sub.credits || 3), 0);

            // Cumulative CGPA
            let totalTrackedCredits = 0;
            let weightedSum = 0;
            for (let s = 1; s <= upToSemester; s++) {
                const info = semesters[s];
                if (info && info.hasData && info.sgpa !== null) {
                    const cr = info.regCredits || info.credits || 20;
                    totalTrackedCredits += cr;
                    weightedSum += (info.sgpa * cr);
                }
            }

            const cgpa = totalTrackedCredits > 0 ? Number((weightedSum / totalTrackedCredits).toFixed(2)) : null;

            if (cgpa !== null) {
                totalCgpaSum += cgpa;
                cgpaCount++;
                if (cgpa >= 8.0) distinctionCount++;
            }
            if (backlogInfo.totalBacklogs > 0) withBacklogsCount++;

            processedStudents.push({
                usn: student.usn,
                name: student.name || student.usn,
                branch: student.branch,
                isLE,
                semesters,
                cumulativeCredits,
                cgpa,
                totalBacklogs: backlogInfo.totalBacklogs,
                backlogCredits: totalBacklogCredits,
                isDistinction: cgpa !== null && cgpa >= 8.0,
                isLow: cgpa !== null && cgpa < 5.0,
                hasBacklogs: backlogInfo.totalBacklogs > 0
            });
        });

        // Sort by USN
        processedStudents.sort((a, b) => a.usn.localeCompare(b.usn));

        const avgCGPA = cgpaCount > 0 ? Number((totalCgpaSum / cgpaCount).toFixed(2)) : 0;

        const payload = {
            students: processedStudents,
            upToSemester,
            summary: {
                totalStudents: processedStudents.length,
                avgCGPA,
                withBacklogs: withBacklogsCount,
                distinctionCount,
                lateralCount
            },
            filtersApplied: { branch, batch, upToSemester }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/batch-report]', err);
        return fail('Failed to generate batch report: ' + (err.message || err), 'BATCH_REPORT_ERROR', 500);
    }
}
