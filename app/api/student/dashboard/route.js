import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { weightedCGPA, computeBacklogs, getAdminClient } from '../../../../lib/analytics-data';
import { isFailedSubject } from '../../../../lib/vtuGrades';
import { normalizeSubjectResult } from '../../../../lib/vtuAcademicEngine';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStudent(req);
        if (authError) return authError;

        const { usn } = session;

        // Fetch student profile
        let { data: studentProfile, error: pErr } = await supabaseAdmin
            .from('students')
            .select('*')
            .eq('usn', usn)
            .maybeSingle();

        if (pErr) throw pErr;

        // Never auto-create the profile here. A student row is created in exactly
        // one place — backend/scraper/engine.py, once VTU has actually returned
        // results for the USN — plus the explicit admin "add student" action.
        // This branch used to invent a profile from the session alone, guessing
        // the branch and defaulting the scheme to 2022, so a mistyped USN became
        // a real student record.
        if (!studentProfile) {
            return fail(
                `No record found for ${usn}. Results for this USN have not been fetched from VTU yet.`,
                'PROFILE_NOT_FOUND',
                404
            );
        }

        const studentId = studentProfile?.id;

        // Fetch manual marks, subject marks, academic remarks, and results in parallel
        const [
            { data: studentMarks },
            { data: resultMarks },
            { data: remarks },
            { data: resultRows }
        ] = await Promise.all([
            studentId ? supabaseAdmin.from('marks').select('id, student_id, subject_code, subject_name, cie_marks, see_marks, total_marks, grade, credits, semester, sync_source, announced_date').eq('student_id', studentId) : { data: [] },
            supabaseAdmin.from('subject_marks').select('id, usn, subject_code, subject_name, internal, external, total, grade, credits, semester, passed, is_backlog, is_makeup, announced_date, results(exam_name)').eq('usn', usn),
            supabaseAdmin.from('academic_remarks').select('student_usn, semester, sgpa, backlog_count, is_all_clear').eq('student_usn', usn),
            supabaseAdmin.from('results').select('id, usn, semester, sgpa, total_credits').eq('usn', usn)
        ]);

        // Standardize & combine marks pool
        const pool = [];
        const formatExamAlias = text => {
            if (!text || text === 'Manual Entry' || text === 'Scraped Record') return text;
            return text.replace(/^DJ/i, 'Dec/Jan ').replace(/^JJ/i, 'June/July ')
                .replace(/cbcs/i, ' ').replace(/MakeUp/i, 'Makeup ')
                .replace(/RV|Reval/i, ' (Revaluation)').trim();
        };

        const scheme = studentProfile?.scheme || '2022';
        const branch = studentProfile?.branch || '';

        if (studentMarks) {
            studentMarks.forEach(m => {
                const norm = normalizeSubjectResult(m, scheme, branch, m.semester);
                pool.push({
                    id: m.id,
                    subject_code: norm.subjectCode,
                    subject_name: norm.subjectName,
                    cie_marks: norm.cie_marks,
                    see_marks: norm.see_marks,
                    total_marks: norm.total_marks,
                    grade: norm.grade,
                    credits: norm.credits,
                    semester: norm.semester,
                    announced_date: norm.announced_date,
                    exam_date: norm.announced_date || 'Manual Entry',
                    source: 'manual'
                });
            });
        }

        if (resultMarks) {
            resultMarks.forEach(m => {
                const norm = normalizeSubjectResult(m, scheme, branch, m.semester);
                pool.push({
                    id: m.id,
                    subject_code: norm.subjectCode,
                    subject_name: norm.subjectName,
                    cie_marks: norm.cie_marks,
                    see_marks: norm.see_marks,
                    total_marks: norm.total_marks,
                    grade: norm.grade,
                    credits: norm.credits,
                    semester: norm.semester,
                    announced_date: norm.announced_date,
                    exam_date: norm.announced_date || formatExamAlias(m.results?.exam_name || 'Scraped Record'),
                    source: 'scraper',
                    is_backlog: norm.isFailed,
                    external: norm.see_marks,
                    result: norm.isFailed ? 'F' : 'P',
                });
            });
        }

        // Calculate credits per semester
        const creditsMap = {};
        (resultRows || []).forEach(r => {
            const prev = creditsMap[r.semester] || 0;
            creditsMap[r.semester] = Math.max(prev, r.total_credits || 0);
        });

        // CGPA computation
        const cgpa = weightedCGPA(remarks || [], creditsMap);
        const backlogsInfo = computeBacklogs(pool);

        // Group by semester summary
        const semesterSummary = {};
        pool.forEach(m => {
            const sem = m.semester;
            if (!semesterSummary[sem]) {
                semesterSummary[sem] = { semester: sem, totalSubjects: 0, passedSubjects: 0, failedSubjects: 0, totalCredits: 0 };
            }
            semesterSummary[sem].totalSubjects++;
            if (isFailedSubject(m)) {
                semesterSummary[sem].failedSubjects++;
            } else {
                semesterSummary[sem].passedSubjects++;
                semesterSummary[sem].totalCredits += m.credits;
            }
        });

        // All results
        const recentResults = pool;

        return ok({
            profile: studentProfile || { usn },
            cgpa,
            totalBacklogs: backlogsInfo.totalBacklogs,
            backlogsList: backlogsInfo.backlogSubjects || [],
            remarks: remarks || [],
            semesterSummary: Object.values(semesterSummary),
            recentResults,
            totalSubjects: pool.length
        });
    } catch (err) {
        console.error('[GET /api/student/dashboard]', err);
        return fail('Failed to fetch student dashboard data.', 'STUDENT_DASHBOARD_ERROR', 500);
    }
}
