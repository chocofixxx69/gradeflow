import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStudent } from '../../../../lib/server-session';
import { weightedCGPA, computeBacklogs } from '../../../../lib/analytics-data';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
            .ilike('usn', usn)
            .maybeSingle();

        if (pErr) throw pErr;

        if (!studentProfile) {
            // Auto-create student profile if absent
            const branchMatch = usn.match(/^\d[A-Z]{2}\d{2}([A-Z]{2,3})\d{3}$/);
            const detectedBranch = branchMatch ? branchMatch[1] : '';
            const normalizedBranch = detectedBranch === 'CS' ? 'CSE' : detectedBranch;

            const { data: newProfile, error: insertErr } = await supabaseAdmin
                .from('students')
                .insert({
                    usn: usn.toUpperCase().trim(),
                    name: session.name || usn,
                    scheme: session.scheme || '2022',
                    branch: session.branch || normalizedBranch || 'CSE',
                })
                .select()
                .single();

            if (!insertErr) {
                studentProfile = newProfile;
            }
        }

        const studentId = studentProfile?.id;

        // Fetch manual marks, subject marks, academic remarks, and results in parallel
        const [
            { data: studentMarks },
            { data: resultMarks },
            { data: remarks },
            { data: resultRows }
        ] = await Promise.all([
            studentId ? supabaseAdmin.from('marks').select('*').eq('student_id', studentId) : { data: [] },
            supabaseAdmin.from('subject_marks').select('*, results(exam_name)').ilike('usn', usn),
            supabaseAdmin.from('academic_remarks').select('*').ilike('student_usn', usn),
            supabaseAdmin.from('results').select('*').ilike('usn', usn)
        ]);

        // Standardize & combine marks pool
        const pool = [];
        const formatExamAlias = text => {
            if (!text || text === 'Manual Entry' || text === 'Scraped Record') return text;
            return text.replace(/^DJ/i, 'Dec/Jan ').replace(/^JJ/i, 'June/July ')
                .replace(/cbcs/i, ' ').replace(/MakeUp/i, 'Makeup ')
                .replace(/RV|Reval/i, ' (Revaluation)').trim();
        };

        if (studentMarks) {
            studentMarks.forEach(m => pool.push({
                id: m.id,
                subject_code: (m.subject_code || m.code || '').trim().toUpperCase(),
                subject_name: (m.subject_name || m.name || '').trim(),
                cie_marks: m.cie_marks ?? m.internal ?? 0,
                see_marks: m.see_marks ?? m.external ?? 0,
                total_marks: m.total_marks ?? m.total ?? 0,
                grade: (m.grade || '').trim().toUpperCase(),
                credits: Number(m.credits) || 3,
                semester: Number(m.semester) || 1,
                announced_date: m.announced_date || m.exam_date || null,
                exam_date: m.announced_date || 'Manual Entry',
                source: 'manual'
            }));
        }

        if (resultMarks) {
            resultMarks.forEach(m => pool.push({
                id: m.id,
                subject_code: (m.subject_code || m.code || '').trim().toUpperCase(),
                subject_name: (m.subject_name || m.name || '').trim(),
                cie_marks: m.cie_marks ?? m.internal ?? 0,
                see_marks: m.see_marks ?? m.external ?? 0,
                total_marks: m.total_marks ?? m.total ?? 0,
                grade: (m.grade || '').trim().toUpperCase(),
                credits: Number(m.credits) || 3,
                semester: Number(m.semester) || 1,
                announced_date: m.announced_date || null,
                exam_date: m.announced_date || formatExamAlias(m.results?.exam_name || 'Scraped Record'),
                source: 'scraper',
                is_backlog: m.is_backlog || false
            }));
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
            if (m.grade === 'F' || m.is_backlog) {
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
