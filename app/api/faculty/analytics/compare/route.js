import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs, weightedCGPA } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
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
        const usnsParam = searchParams.get('usns') || '';
        const usnList = usnsParam
            .split(',')
            .map(u => u.trim().toUpperCase())
            .filter(Boolean)
            .slice(0, 6); // Max 6 students for comparison

        if (usnList.length === 0) {
            return ok({ students: [], trajectory: [], subjectComparison: [] });
        }

        const cacheKey = `compare:${usnList.sort().join(',')}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch profiles for these USNs
        const { data: rawStudents, error: stuErr } = await supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, semester, year, lateral_entry')
            .in('usn', usnList);

        if (stuErr) throw stuErr;

        // 2. Fetch marks and remarks
        const [
            { data: rawMarks },
            { data: rawRemarks }
        ] = await Promise.all([
            supabaseAdmin
                .from('subject_marks')
                .select('*')
                .in('usn', usnList)
                .order('semester', { ascending: true })
                .order('subject_code', { ascending: true }),
            supabaseAdmin
                .from('academic_remarks')
                .select('*')
                .in('student_usn', usnList)
        ]);

        const marksByUsn = new Map();
        (rawMarks || []).forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        const remarksByUsn = new Map();
        (rawRemarks || []).forEach(r => {
            const list = remarksByUsn.get(r.student_usn) || [];
            list.push(r);
            remarksByUsn.set(r.student_usn, list);
        });

        // 3. Process each student
        const processedStudents = [];
        const studentSemSgpas = new Map(); // usn -> Map(sem -> sgpa)
        const allSubjectCodes = new Map(); // code -> { code, name, credits }

        usnList.forEach(usn => {
            const studentObj = (rawStudents || []).find(s => s.usn === usn) || { usn, name: usn, branch: '—', semester: 1 };
            const uMarks = marksByUsn.get(usn) || [];
            const uRemarks = remarksByUsn.get(usn) || [];

            const backlogInfo = computeBacklogs(uMarks);
            const backlogCredits = backlogInfo.failedSubjects.reduce((sum, sub) => sum + (sub.credits || 3), 0);

            // Compute semester SGPAs
            const semMarksMap = new Map();
            uMarks.forEach(m => {
                const sem = m.semester || 1;
                const list = semMarksMap.get(sem) || [];
                list.push(m);
                semMarksMap.set(sem, list);

                // Collect subject for matrix
                const code = (m.subject_code || m.code || '').toUpperCase();
                if (code && !allSubjectCodes.has(code)) {
                    allSubjectCodes.set(code, {
                        code,
                        name: m.subject_name || code,
                        credits: resolveSubjectCredits(m)
                    });
                }
            });

            const semSgpas = new Map();
            let totalCredits = 0;
            let totalPoints = 0;

            for (let sem = 1; sem <= 8; sem++) {
                const sList = semMarksMap.get(sem) || [];
                const storedRemark = uRemarks.find(r => Number(r.semester) === sem);

                if (sList.length > 0) {
                    let semRegCr = 0;
                    let semEarnedCr = 0;
                    let semCrP = 0;
                    sList.forEach(m => {
                        const cr = resolveSubjectCredits(m);
                        const isFail = isFailedSubject(m);
                        const gp = scoreToGradePoint(m.total, m.grade);
                        semRegCr += cr;
                        if (!isFail) {
                            semEarnedCr += cr;
                            semCrP += (cr * gp);
                        }
                    });
                    const sgpa = semRegCr > 0 ? Number((semCrP / semRegCr).toFixed(2)) : 0;
                    semSgpas.set(sem, sgpa);
                    totalCredits += semEarnedCr;
                    totalPoints += semCrP;
                } else if (storedRemark?.sgpa) {
                    const sgpa = Number(Number(storedRemark.sgpa).toFixed(2));
                    semSgpas.set(sem, sgpa);
                    totalCredits += 20;
                    totalPoints += (sgpa * 20);
                }
            }

            studentSemSgpas.set(usn, semSgpas);

            const cgpa = totalCredits > 0 ? Number((totalPoints / totalCredits).toFixed(2)) : null;
            const appeared = uMarks.length;
            const failed = backlogInfo.totalBacklogs;
            const passed = Math.max(0, appeared - failed);
            const passRate = appeared > 0 ? Number(((passed / appeared) * 100).toFixed(1)) : 0;

            processedStudents.push({
                usn,
                name: studentObj.name || usn,
                branch: studentObj.branch || '—',
                semester: studentObj.semester || 1,
                cgpa,
                totalCredits,
                appeared,
                passed,
                failed,
                passRate,
                backlogCredits
            });
        });

        // 4. Build aligned multi-line trajectory for Recharts
        const trajectory = [];
        for (let sem = 1; sem <= 8; sem++) {
            const point = { semester: `Sem ${sem}`, semNum: sem };
            let hasAny = false;
            usnList.forEach(usn => {
                const sgpa = studentSemSgpas.get(usn)?.get(sem);
                if (sgpa !== undefined) {
                    point[usn] = sgpa;
                    hasAny = true;
                } else {
                    point[usn] = null;
                }
            });
            if (hasAny) trajectory.push(point);
        }

        // 5. Build subject-by-subject direct marks comparison
        const subjectComparison = Array.from(allSubjectCodes.values()).map(sub => {
            const marksPerStudent = {};
            usnList.forEach(usn => {
                const uMarks = marksByUsn.get(usn) || [];
                const m = uMarks.find(item => (item.subject_code || item.code || '').toUpperCase() === sub.code);
                if (m) {
                    marksPerStudent[usn] = {
                        internal: m.internal,
                        external: m.external,
                        total: m.total,
                        grade: m.grade || '—',
                        isFail: isFailedSubject(m)
                    };
                } else {
                    marksPerStudent[usn] = null;
                }
            });
            return {
                code: sub.code,
                name: sub.name,
                credits: sub.credits,
                students: marksPerStudent
            };
        }).sort((a, b) => a.code.localeCompare(b.code));

        const payload = {
            students: processedStudents,
            trajectory,
            subjectComparison
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/compare]', err);
        return fail('Failed to compare students: ' + (err.message || err), 'COMPARE_ERROR', 500);
    }
}
