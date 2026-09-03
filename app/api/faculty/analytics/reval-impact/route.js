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

function formatExamSession(code) {
    if (!code) return 'University Exam';
    const c = String(code).trim();
    if (/^MJ26rv/i.test(c)) return 'May/June 2026 Reval';
    if (/^MJ26/i.test(c)) return 'May/June 2026 Regular';
    if (/^D25J26RV/i.test(c)) return 'Dec 25/Jan 26 Reval';
    if (/^D25J26/i.test(c)) return 'Dec 25/Jan 26 Regular';
    if (/^JJRVcbcs25/i.test(c)) return 'Jun/Jul 2025 Reval';
    if (/^JJEcbcs25/i.test(c)) return 'Jun/Jul 2025 Regular';
    if (/^SERVcbcs25/i.test(c)) return 'Summer 2025 Reval';
    if (/^DJRVcbcs25/i.test(c)) return 'Dec 24/Jan 25 Reval';
    if (/^DJcbcs25/i.test(c)) return 'Dec 24/Jan 25 Regular';
    if (/^JJRVcbcs24/i.test(c)) return 'Jun/Jul 2024 Reval';
    if (/^JJEcbcs24/i.test(c)) return 'Jun/Jul 2024 Regular';
    if (/^DJRVcbcs24/i.test(c)) return 'Dec 23/Jan 24 Reval';
    if (/^DJcbcs24/i.test(c)) return 'Dec 23/Jan 24 Regular';
    if (/rv/i.test(c)) return `${c} (Reval)`;
    return c;
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

                const formattedAppliedDate = attempt.scraped_at ? new Date(attempt.scraped_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const formattedRegularDate = prior.scraped_at ? new Date(prior.scraped_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

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
                    revalExam: attempt.exam_name || 'Reval',
                    revalExamLabel: formatExamSession(attempt.exam_name),
                    regularExam: prior.exam_name || 'Regular',
                    regularExamLabel: formatExamSession(prior.exam_name),
                    appliedDate: formattedAppliedDate,
                    regularDate: formattedRegularDate,
                    credits: attempt.credits || prior.credits || 3,
                });
            });
        });

        // Group by student so faculty can see which student put which subjects and when
        const studentMap = new Map();
        deltaRoster.forEach(d => {
            const entry = studentMap.get(d.usn) || {
                usn: d.usn,
                name: d.name,
                applications: [],
                totalDelta: 0,
                upgraded: 0,
                cleared: 0,
                decreased: 0,
                confirmed: 0,
            };
            entry.applications.push(d);
            entry.totalDelta += d.delta;
            if (d.outcome === 'Cleared Backlog') entry.cleared++;
            else if (d.delta > 0) entry.upgraded++;
            else if (d.delta < 0) entry.decreased++;
            else entry.confirmed++;
            studentMap.set(d.usn, entry);
        });
        const studentRoster = Array.from(studentMap.values()).sort((a, b) => a.name.localeCompare(b.name));

        const totalApplications = deltaRoster.length;
        const netPassRateGain = totalApplications > 0 ? Number(((clearedCount / totalApplications) * 100).toFixed(1)) : 0;

        const payload = {
            summary: {
                totalApplications,
                totalStudents: studentRoster.length,
                upgradedCount,
                clearedCount,
                unchangedCount,
                decreasedCount,
                netPassRateGain,
            },
            deltaRoster,
            studentRoster,
            branch,
            semester,
        };

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/reval-impact]', err);
        return fail('Failed to compile revaluation impact analysis: ' + (err.message || err), 'REVAL_ERROR', 500);
    }
}
