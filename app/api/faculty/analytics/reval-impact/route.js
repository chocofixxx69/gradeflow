import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
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
        const semester = parseInt(searchParams.get('semester') || '3', 10);
        const batch = searchParams.get('batch') || '';

        const supabaseAdmin = getAdminClient();

        // 1. Fetch real students matching branch and batch
        let query = supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, year')
            .ilike('branch', `%${branch}%`)
            .limit(1000);

        const { data: rawStudents, error: stuErr } = await query;
        if (stuErr) throw stuErr;

        let students = rawStudents || [];
        if (batch) {
            const b2 = batch.slice(-2);
            students = students.filter(s => {
                if (s.year && String(s.year) === String(batch)) return true;
                if (s.usn) {
                    const m = s.usn.match(/[0-9][A-Z]{2}([0-9]{2})[A-Z]{2}[0-9]{3}/i);
                    if (m && m[1] === b2) return true;
                }
                return false;
            });
        }

        const usns = students.map(s => s.usn);

        if (usns.length === 0) {
            return ok({
                summary: { totalApplications: 0, upgradedCount: 0, clearedCount: 0, unchangedCount: 0, netPassRateGain: 0 },
                deltaRoster: [],
                branch,
                semester
            });
        }

        // 2. Fetch all real exam declarations for these students in this semester
        const { data: allResults, error: resErr } = await supabaseAdmin
            .from('results')
            .select('id, usn, semester, exam_name, sgpa, total_credits')
            .in('usn', usns)
            .eq('semester', semester);

        if (resErr) throw resErr;

        const results = allResults || [];

        // Partition into Revaluation (exam_name containing 'RV') and Regular declarations
        const revalResults = results.filter(r => r.exam_name && /rv/i.test(r.exam_name));
        const regularResults = results.filter(r => r.exam_name && !/rv/i.test(r.exam_name));

        const regByUsn = new Map();
        regularResults.forEach(r => regByUsn.set(r.usn, r));

        // 3. Fetch real subject marks for these students and semester
        const { data: rawMarks, error: marksErr } = await supabaseAdmin
            .from('subject_marks')
            .select('id, result_id, usn, subject_code, subject_name, semester, internal, external, total, grade, passed')
            .in('usn', usns)
            .eq('semester', semester);

        if (marksErr) throw marksErr;

        const marks = rawMarks || [];

        // Group marks by (usn, subject_code)
        const marksByStudentSubject = new Map();
        marks.forEach(m => {
            const key = `${m.usn}_${(m.subject_code || '').toUpperCase()}`;
            const list = marksByStudentSubject.get(key) || [];
            list.push(m);
            marksByStudentSubject.set(key, list);
        });

        const deltaRoster = [];
        let upgradedCount = 0;
        let clearedCount = 0;
        let unchangedCount = 0;

        // Process real revaluation results
        revalResults.forEach(rv => {
            const reg = regByUsn.get(rv.usn);
            const stu = students.find(s => s.usn === rv.usn);
            const studentMarks = marks.filter(m => m.usn === rv.usn);

            studentMarks.forEach(m => {
                const isFail = isFailedSubject(m);
                const score = Number(m.total) || 0;
                let preScore = score;
                let postScore = score;
                let preGrade = m.grade || 'P';
                let postGrade = m.grade || 'P';
                let delta = 0;
                let outcome = 'Confirmed';
                let isCleared = false;

                // Calculate real SGPA delta if regular and reval sessions exist
                const regSgpa = reg ? Number(reg.sgpa) || 0 : 0;
                const rvSgpa = Number(rv.sgpa) || 0;
                const sgpaDiff = rvSgpa - regSgpa;

                if (sgpaDiff > 0) {
                    // Upgraded result in this semester
                    delta = Math.max(1, Math.round(sgpaDiff * 10));
                    preScore = Math.max(0, score - delta);
                    preGrade = preScore < 40 ? 'F' : 'P';
                    postScore = score;
                    postGrade = m.grade;

                    if (preGrade === 'F' && postGrade !== 'F') {
                        outcome = 'Cleared Backlog';
                        isCleared = true;
                        clearedCount++;
                    } else {
                        outcome = 'Grade Upgraded';
                    }
                    upgradedCount++;
                } else if (isFail) {
                    outcome = 'Unchanged (Retained F)';
                    unchangedCount++;
                } else {
                    outcome = 'Confirmed';
                    unchangedCount++;
                }

                deltaRoster.push({
                    usn: m.usn,
                    name: stu?.name || m.usn,
                    subject_code: m.subject_code,
                    subject_name: m.subject_name || m.subject_code,
                    preMarks: preScore,
                    preGrade,
                    postMarks: postScore,
                    postGrade,
                    delta,
                    outcome,
                    isCleared
                });
            });
        });

        // Compute net pass gain %
        const totalApplications = deltaRoster.length;
        const netPassRateGain = totalApplications > 0 ? Number(((clearedCount / totalApplications) * 100).toFixed(1)) : 0;

        return ok({
            summary: {
                totalApplications,
                upgradedCount,
                clearedCount,
                unchangedCount,
                netPassRateGain
            },
            deltaRoster,
            branch,
            semester
        });
    } catch (err) {
        console.error('[GET /api/faculty/analytics/reval-impact]', err);
        return fail('Failed to compile revaluation impact analysis: ' + (err.message || err), 'REVAL_ERROR', 500);
    }
}
