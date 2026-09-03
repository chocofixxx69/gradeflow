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

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branch = (searchParams.get('branch') || 'CS').toUpperCase().trim();
        const batch = searchParams.get('batch') || '';
        const semester = searchParams.get('semester') && searchParams.get('semester') !== 'all'
            ? parseInt(searchParams.get('semester'), 10)
            : null;

        const cacheKey = `merit_list:${branch}:${batch}:${semester || 'all'}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students for this branch
        let query = supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, semester, year, lateral_entry')
            .ilike('branch', `%${branch}%`)
            .limit(1000);

        const { data: rawStudents, error: stuErr } = await query;
        if (stuErr) throw stuErr;

        let students = rawStudents || [];
        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year));
        }

        if (students.length === 0) {
            return ok({
                summary: { totalRanked: 0, highestScore: 0, avgScore: 0 },
                podium: [],
                rankedStudents: []
            });
        }

        const usns = students.map(s => s.usn);

        // 2. Fetch marks and remarks
        let marksQuery = supabaseAdmin
            .from('subject_marks')
            .select('usn, semester, subject_code, internal, external, total, grade, passed')
            .in('usn', usns);

        if (semester) {
            marksQuery = marksQuery.eq('semester', semester);
        }

        const [
            { data: rawMarks },
            { data: rawRemarks }
        ] = await Promise.all([
            marksQuery,
            supabaseAdmin.from('academic_remarks').select('student_usn, semester, sgpa').in('student_usn', usns)
        ]);

        const marks = rawMarks || [];
        const remarks = rawRemarks || [];

        const marksByUsn = new Map();
        marks.forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // 3. Compute score & rank criteria per student
        const candidateList = [];

        students.forEach(s => {
            const uMarks = marksByUsn.get(s.usn) || [];
            if (uMarks.length === 0) return;

            const backlogInfo = computeBacklogs(uMarks);
            const hasBacklogs = backlogInfo.totalBacklogs > 0;

            let totalMarks = 0;
            let totalCredits = 0;
            let totalPoints = 0;

            uMarks.forEach(m => {
                const score = Number(m.total) || 0;
                const cr = resolveSubjectCredits(m);
                const gp = scoreToGradePoint(m.total, m.grade);
                const isFail = isFailedSubject(m);

                totalMarks += score;
                totalCredits += cr;
                if (!isFail) {
                    totalPoints += (cr * gp);
                }
            });

            // If a specific semester is requested, use semester SGPA; otherwise cumulative CGPA
            let finalGpa = 0;
            if (semester) {
                const remark = remarks.find(r => r.student_usn === s.usn && Number(r.semester) === semester);
                finalGpa = totalCredits > 0 ? Number((totalPoints / totalCredits).toFixed(2)) : (remark?.sgpa ? Number(remark.sgpa) : 0);
            } else {
                finalGpa = totalCredits > 0 ? Number((totalPoints / totalCredits).toFixed(2)) : 0;
            }

            candidateList.push({
                usn: s.usn,
                name: s.name || s.usn,
                branch: s.branch,
                isLE: Boolean(s.lateral_entry),
                gpa: finalGpa,
                totalMarks,
                creditsEarned: totalCredits,
                hasBacklogs,
                backlogCount: backlogInfo.totalBacklogs
            });
        });

        // 4. Sort with tie-breaking rules:
        // Priority 1: Clear students before backlog carriers
        // Priority 2: Highest GPA (CGPA or SGPA)
        // Priority 3: Highest Total Marks
        candidateList.sort((a, b) => {
            if (a.hasBacklogs !== b.hasBacklogs) {
                return a.hasBacklogs ? 1 : -1;
            }
            if (b.gpa !== a.gpa) {
                return b.gpa - a.gpa;
            }
            return b.totalMarks - a.totalMarks;
        });

        // Assign ranks and honors
        const total = candidateList.length;
        const rankedStudents = candidateList.map((c, index) => {
            const rank = index + 1;
            let honors = 'Pass Class';

            if (!c.hasBacklogs) {
                if (rank === 1) honors = 'Gold Medal (Rank 1)';
                else if (rank === 2) honors = 'Silver Medal (Rank 2)';
                else if (rank === 3) honors = 'Bronze Medal (Rank 3)';
                else if (rank <= Math.max(3, Math.ceil(total * 0.10))) honors = 'Distinction (Top 10%)';
                else if (rank <= Math.ceil(total * 0.25)) honors = 'First Class (Top 25%)';
                else honors = 'First Class';
            } else {
                honors = `Carrying ${c.backlogCount} Arrears`;
            }

            return {
                rank,
                ...c,
                honors
            };
        });

        const podium = rankedStudents.slice(0, 3);
        const highestScore = rankedStudents.length > 0 ? rankedStudents[0].gpa : 0;
        const avgScore = rankedStudents.length > 0
            ? Number((rankedStudents.reduce((acc, r) => acc + r.gpa, 0) / rankedStudents.length).toFixed(2))
            : 0;

        const payload = {
            summary: {
                totalRanked: rankedStudents.length,
                highestScore,
                avgScore,
                department: branch,
                batch: batch || 'All Batches',
                semester: semester ? `Semester ${semester}` : 'Overall Cumulative'
            },
            podium,
            rankedStudents
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/merit-list]', err);
        return fail('Failed to compile merit rank list: ' + (err.message || err), 'MERIT_LIST_ERROR', 500);
    }
}
