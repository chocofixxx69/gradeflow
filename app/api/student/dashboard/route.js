import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { computeBacklogs, getAdminClient } from '../../../../lib/analytics-data';
import { getStudentRecord } from '../../../../lib/student-record';
import { isFailedSubject } from '../../../../lib/vtuGrades';
import { normalizeSubjectResult } from '../../../../lib/vtuAcademicEngine';
import { getStudentDefaultEmail } from '../../../../lib/semester-utils';

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

        studentProfile.email = studentProfile.email || getStudentDefaultEmail(studentProfile.usn);

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

        // CGPA comes from the canonical record, never from academic_remarks weighted
        // by results.total_credits. Both of those are derived tables the scraper does
        // not keep current - for 2AB23CS006 they claimed a semester-6 SGPA of 7.56
        // against marks that give 6.72 - so a student was shown a CGPA their own mark
        // sheet contradicted. See lib/student-record.js.
        const canonical = await getStudentRecord(supabaseAdmin, usn);
        const cgpa = canonical?.cgpa ?? 0;
        const backlogsInfo = computeBacklogs(pool);

        // Derive semester summary directly from authoritative canonical academic record
        const semStats = canonical?.semStats || {};
        const semSGPAs = canonical?.semSGPAs || {};
        const marksBySemester = canonical?.marksBySemester || {};

        const semesterSummary = Object.values(semStats).map(st => ({
            semester: st.semester,
            totalSubjects: st.subjectCount,
            passedSubjects: Math.max(0, st.subjectCount - (st.backlogs || 0)),
            failedSubjects: st.backlogs || 0,
            totalCredits: st.totalCredits || 0,
            earnedCredits: st.earnedCredits || 0,
            sgpa: st.sgpa || 0,
            gradePoints: st.gradePoints || 0
        }));

        // Flatten canonical marks with official resolved credits from catalog
        const canonicalSubjectsList = [];
        if (marksBySemester && Object.keys(marksBySemester).length > 0) {
            Object.values(marksBySemester).forEach(list => {
                if (Array.isArray(list)) canonicalSubjectsList.push(...list);
            });
        }
        const recentResults = canonicalSubjectsList.length > 0 ? canonicalSubjectsList : pool;

        return ok({
            profile: studentProfile || { usn },
            cgpa,
            semStats,
            semSGPAs,
            marksBySemester,
            totalBacklogs: canonical?.totalActiveBacklogs ?? backlogsInfo.totalBacklogs,
            backlogsList: canonical?.activeBacklogSubjects?.length ? canonical.activeBacklogSubjects : (backlogsInfo.failedSubjects || backlogsInfo.backlogSubjects || []),
            totalEarnedCredits: canonical?.totalEarnedCredits ?? 0,
            totalRegisteredCredits: canonical?.totalRegisteredCredits ?? 0,
            remarks: remarks || [],
            semesterSummary,
            recentResults,
            totalSubjects: canonical?.totalSubjects ?? pool.length
        });
    } catch (err) {
        console.error('[GET /api/student/dashboard]', err);
        return fail('Failed to fetch student dashboard data.', 'STUDENT_DASHBOARD_ERROR', 500);
    }
}
