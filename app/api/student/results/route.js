import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { computeBacklogs, getAdminClient } from '../../../../lib/analytics-data';
import { fetchCatalogIndex, resolveSubjectCredit } from '../../../../lib/subjectCreditResolver';
import { isAuditCourse, normalizeBranch } from '../../../../lib/vtuAcademicEngine';

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

        // Fetch student profile ID and scheme if available
        const { data: student } = await supabaseAdmin
            .from('students')
            .select('id, scheme, branch')
            .eq('usn', usn)
            .maybeSingle();

        const studentScheme = student?.scheme || '2022';
        const studentBranch = normalizeBranch(student?.branch, usn);
        const catalogIndex = await fetchCatalogIndex(supabaseAdmin);

        function resolveCredits(code, semester) {
            if (isAuditCourse(code)) return { credits: 0, source: 'audit' };
            return resolveSubjectCredit(catalogIndex, { scheme: studentScheme, branch: studentBranch, semester, subject_code: code });
        }

        const [
            { data: studentMarks },
            { data: subjectMarks },
            { data: remarks },
            { data: results }
        ] = await Promise.all([
            student?.id ? supabaseAdmin.from('marks').select('*').eq('student_id', student.id) : { data: [] },
            supabaseAdmin.from('subject_marks').select('*, results(exam_name)').eq('usn', usn),
            supabaseAdmin.from('academic_remarks').select('*').eq('student_usn', usn),
            supabaseAdmin.from('results').select('*').eq('usn', usn)
        ]);

        const allMarks = [];

        if (studentMarks) {
            studentMarks.forEach(m => {
                const code = (m.subject_code || m.code || '').trim().toUpperCase();
                const semester = Number(m.semester) || 1;
                const resolved = resolveCredits(code, semester);
                allMarks.push({
                    id: m.id,
                    subject_code: code,
                    subject_name: (m.subject_name || m.name || '').trim(),
                    cie_marks: m.cie_marks ?? m.internal ?? 0,
                    see_marks: m.see_marks ?? m.external ?? 0,
                    total_marks: m.total_marks ?? m.total ?? 0,
                    grade: (m.grade || '').trim().toUpperCase(),
                    credits: resolved.credits,
                    credit_source: resolved.source,
                    semester,
                    source: 'manual'
                });
            });
        }

        if (subjectMarks) {
            subjectMarks.forEach(m => {
                const code = (m.subject_code || m.code || '').trim().toUpperCase();
                const semester = Number(m.semester) || 1;
                // Credit is always resolved fresh from subject_catalog — the stored
                // subject_marks.credits value (written once at scrape time) is never
                // trusted; see lib/subjectCreditResolver.js for why.
                const resolved = resolveCredits(code, semester);
                allMarks.push({
                    id: m.id,
                    subject_code: code,
                    subject_name: (m.subject_name || m.name || '').trim(),
                    cie_marks: m.cie_marks ?? m.internal ?? 0,
                    see_marks: m.see_marks ?? m.external ?? 0,
                    total_marks: m.total_marks ?? m.total ?? 0,
                    grade: (m.grade || '').trim().toUpperCase(),
                    credits: resolved.credits,
                    credit_source: resolved.source,
                    semester,
                    announced_date: m.announced_date || null,
                    exam_date: m.announced_date || m.results?.exam_name || 'N/A',
                    exam_name: m.announced_date || m.results?.exam_name || 'Scraped Record',
                    source: 'scraper',
                    is_backlog: m.is_backlog || false
                });
            });
        }

        // Group by semester
        const semesterResults = {};
        allMarks.forEach(m => {
            const sem = m.semester || 1;
            if (!semesterResults[sem]) {
                semesterResults[sem] = { semester: sem, subjects: [] };
            }
            semesterResults[sem].subjects.push(m);
        });

        const backlogs = computeBacklogs(allMarks);

        return ok({
            semesterResults: Object.values(semesterResults),
            subjectMarks: allMarks,
            academicRemarks: remarks || [],
            examResults: results || [],
            backlogData: backlogs
        });
    } catch (err) {
        console.error('[GET /api/student/results]', err);
        return fail('Failed to fetch student results.', 'STUDENT_RESULTS_ERROR', 500);
    }
}
