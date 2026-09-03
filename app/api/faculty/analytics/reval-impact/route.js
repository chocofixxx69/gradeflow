import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch } from '@/lib/semester-utils';
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

        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { branch, select: 'id, usn, name, branch, year, lateral_entry' });

        let students = rawStudents || [];
        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        const studentByUsn = new Map(students.map(s => [s.usn, s]));

        // Fetch attempts for this semester directly without query param length overflow
        const { data: rawAttempts, error: attemptsErr } = await supabaseAdmin
            .from('subject_mark_attempts')
            .select('id, result_id, usn, subject_code, subject_name, semester, total, grade, exam_name, scraped_at')
            .eq('semester', semester);

        if (attemptsErr) throw attemptsErr;

        // Filter by branch and batch
        const attempts = (rawAttempts || []).filter(a => {
            if (branch === 'ALL' && !batch) return true;
            return studentByUsn.has(a.usn);
        });
        const bySubject = new Map(); // `${usn}|${subject_code}` -> attempt rows, each tagged with isReval
        attempts.forEach(a => {
            const key = `${a.usn}|${(a.subject_code || '').toUpperCase()}`;
            const list = bySubject.get(key) || [];
            list.push({ ...a, isReval: Boolean(a.exam_name && /rv/i.test(a.exam_name)) });
            bySubject.set(key, list);
        });

        const deltaRoster = [];
        let upgradedCount = 0;
        let clearedCount = 0;
        let unchangedCount = 0;
        let decreasedCount = 0;

        bySubject.forEach((subjectAttempts, key) => {
            // Chronological order — earliest declaration first — so "pre" always
            // means "the most recent real mark recorded before this reval attempt",
            // never an invented baseline.
            const sorted = [...subjectAttempts].sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));

            sorted.forEach((attempt, idx) => {
                if (!attempt.isReval) return; // only reval attempts produce a delta row
                // Non-reval regular attempt for this subject
                let prior = [...sorted.slice(0, idx)].reverse().find(a => !a.isReval);
                if (!prior) {
                    prior = sorted.find(a => !a.isReval);
                }
                if (!prior) return; // no real prior mark on file — skip

                const [usn] = key.split('|');
                const stu = studentByUsn.get(usn);

                const preScore = Number(prior.total) || 0;
                const postScore = Number(attempt.total) || 0;
                const preGrade = prior.grade || '—';
                const postGrade = attempt.grade || '—';
                const delta = postScore - preScore;
                const wasFailingBefore = isFailedSubject(prior);
                const isFailingNow = isFailedSubject(attempt);

                let outcome;
                if (wasFailingBefore && !isFailingNow) {
                    outcome = 'Cleared Backlog';
                    clearedCount++;
                } else if (delta > 0) {
                    outcome = 'Grade Upgraded';
                    upgradedCount++;
                } else if (delta < 0) {
                    outcome = 'Marks Decreased';
                    decreasedCount++;
                } else {
                    outcome = 'Confirmed';
                    unchangedCount++;
                }

                deltaRoster.push({
                    usn,
                    name: stu?.name || usn,
                    subject_code: attempt.subject_code,
                    subject_name: attempt.subject_name || attempt.subject_code,
                    preMarks: preScore,
                    preGrade,
                    postMarks: postScore,
                    postGrade,
                    delta,
                    outcome,
                    isCleared: outcome === 'Cleared Backlog',
                });
            });
        });

        const totalApplications = deltaRoster.length;
        const netPassRateGain = totalApplications > 0 ? Number(((clearedCount / totalApplications) * 100).toFixed(1)) : 0;

        const payload = {
            summary: {
                totalApplications,
                upgradedCount,
                clearedCount,
                unchangedCount,
                decreasedCount,
                netPassRateGain,
            },
            deltaRoster,
            branch,
            semester,
        };

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/reval-impact]', err);
        return fail('Failed to compile revaluation impact analysis: ' + (err.message || err), 'REVAL_ERROR', 500);
    }
}
