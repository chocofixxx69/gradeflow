import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch } from '@/lib/semester-utils';
import { isFailedSubject } from '@/lib/vtuGrades';

import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function ok(data) {
    return NextResponse.json({ success: true, data }, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        }
    });
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

// Maps a raw scraped exam_name to the real academic cycle it belongs to, so a
// revaluation is only ever compared against the regular declaration of the
// SAME cycle — e.g. "D25J26RVcbcs" pairs only with "D25J26Ecbcs", never a
// different cycle. This deliberately does NOT use scraped_at ordering: the
// scraper visits exam URLs in whatever order they're queued, not in real
// chronological order, so scrape timestamps can (and do, confirmed against
// live data) show a revaluation scraped seconds BEFORE its own regular exam —
// an artifact of scrape order, not academic reality. Same-cycle exam-name
// matching is the only reliable signal for "which regular attempt does this
// revaluation actually follow."
function examCycleKey(examName) {
    const c = String(examName || '').trim();
    if (/^MJ26rv/i.test(c)) return 'MJ26';
    if (/^MJ26/i.test(c)) return 'MJ26';
    if (/^D25J26RV/i.test(c)) return 'D25J26';
    if (/^D25J26/i.test(c)) return 'D25J26';
    if (/^JJRVcbcs25/i.test(c)) return 'JJ25';
    if (/^JJEcbcs25/i.test(c)) return 'JJ25';
    if (/^SERVcbcs25/i.test(c)) return 'SE25';
    if (/^SEcbcs25/i.test(c)) return 'SE25';
    if (/^DJRVcbcs25/i.test(c)) return 'DJ25';
    if (/^DJcbcs25/i.test(c)) return 'DJ25';
    if (/^JJRVcbcs24/i.test(c)) return 'JJ24';
    if (/^JJEcbcs24/i.test(c)) return 'JJ24';
    if (/^DJRVcbcs24/i.test(c)) return 'DJ24';
    if (/^DJcbcs24/i.test(c)) return 'DJ24';
    return c; // unrecognized naming — treat as its own cycle, never cross-matched
}

export async function GET(req) {
    noStore();
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branch = (searchParams.get('branch') || 'ALL').toUpperCase().trim();
        const semParam = (searchParams.get('semester') || 'ALL').toUpperCase().trim();
        const semester = (semParam === 'ALL' || !semParam) ? 'ALL' : parseInt(semParam, 10);
        const batch = searchParams.get('batch') || '';

        const supabaseAdmin = getAdminClient();

        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { branch, select: 'id, usn, name, branch, year, lateral_entry' });

        let students = rawStudents || [];
        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        const studentByUsn = new Map(students.map(s => [s.usn, s]));

        // Fetch attempts for this semester or all semesters directly with automatic pagination
        let rawAttempts = [];
        let from = 0;
        while (true) {
            let q = supabaseAdmin
                .from('subject_mark_attempts')
                .select('id, result_id, usn, subject_code, subject_name, semester, internal, external, total, grade, credits, exam_name, announced_date, scraped_at')
                .order('id')
                .range(from, from + 999);
            if (semester !== 'ALL' && !isNaN(semester)) {
                q = q.eq('semester', semester);
            }
            const { data: page, error: attemptsErr } = await q;
            if (attemptsErr) throw attemptsErr;
            if (!page || page.length === 0) break;
            rawAttempts.push(...page);
            if (page.length < 1000) break;
            from += 1000;
        }

        // Filter by branch and batch
        const attempts = (rawAttempts || []).filter(a => {
            if (branch === 'ALL' && !batch) return true;
            return studentByUsn.has(a.usn);
        });
        const bySubject = new Map(); // `${usn}|${semester}|${subject_code}` -> attempt rows, each tagged with isReval
        attempts.forEach(a => {
            const key = `${a.usn}|${a.semester}|${(a.subject_code || '').toUpperCase()}`;
            const list = bySubject.get(key) || [];
            list.push({ ...a, isReval: Boolean(a.exam_name && /rv/i.test(a.exam_name)) });
            bySubject.set(key, list);
        });

        const deltaRoster = [];
        let upgradedCount = 0;
        let clearedCount = 0;
        let unchangedCount = 0;
        let decreasedCount = 0;
        let awaitingOriginalCount = 0;

        bySubject.forEach((subjectAttempts, key) => {
            subjectAttempts.forEach((attempt) => {
                if (!attempt.isReval) return; // only reval attempts produce a delta row
                const [usn] = key.split('|');
                const stu = studentByUsn.get(usn);

                // The regular attempt from the SAME exam cycle — the only real,
                // reliable "before" value. Every real revaluation still shows up as
                // its own row (confirmed: hiding these made ~34% of real submissions
                // across the college invisible) — what changes is whether a delta can
                // be computed at all. When no same-cycle regular attempt was ever
                // captured, the row is shown with the pre-score honestly marked "not
                // on file" rather than either fabricating a number or disappearing.
                const cycle = examCycleKey(attempt.exam_name);
                const prior = subjectAttempts.find(a => !a.isReval && examCycleKey(a.exam_name) === cycle);

                const revalExternal = attempt.external !== null && attempt.external !== undefined ? Number(attempt.external) : null;
                const revalInternal = attempt.internal !== null && attempt.internal !== undefined ? Number(attempt.internal) : null;
                const postScore = (attempt.total !== null && attempt.total !== undefined) ? Number(attempt.total) : ((revalExternal ?? 0) + (revalInternal ?? 0));

                if (!prior) {
                    awaitingOriginalCount++;
                    deltaRoster.push({
                        usn,
                        name: stu?.name || usn,
                        semester: attempt.semester,
                        subject_code: attempt.subject_code,
                        subject_name: attempt.subject_name || attempt.subject_code,
                        originalExternal: null,
                        revalExternal,
                        deltaMarks: null,
                        originalInternal: null,
                        revalInternal,
                        originalTotal: null,
                        revalTotal: postScore,
                        preMarks: null,
                        preGrade: null,
                        postMarks: postScore,
                        postGrade: attempt.grade || '—',
                        delta: null,
                        outcome: 'Awaiting Original Mark',
                        isCleared: false,
                        revalExam: attempt.exam_name || 'Reval',
                        revalExamLabel: formatExamSession(attempt.exam_name),
                        regularExam: null,
                        regularExamLabel: null,
                        appliedDate: attempt.announced_date ? new Date(attempt.announced_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : (attempt.scraped_at ? new Date(attempt.scraped_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'),
                        regularDate: null,
                        credits: attempt.credits || 3,
                    });
                    return;
                }

                const originalExternal = prior.external !== null && prior.external !== undefined ? Number(prior.external) : null;
                const originalInternal = prior.internal !== null && prior.internal !== undefined ? Number(prior.internal) : null;
                const preScore = (prior.total !== null && prior.total !== undefined) ? Number(prior.total) : ((originalExternal ?? 0) + (originalInternal ?? 0));
                const preGrade = prior.grade || '—';
                const postGrade = attempt.grade || '—';

                // SEE marks are the external evaluation component modified in revaluation.
                // Fall back to total marks if external is not distinct.
                const deltaMarks = (revalExternal !== null && originalExternal !== null)
                    ? (revalExternal - originalExternal)
                    : (postScore - preScore);
                const delta = postScore - preScore;

                const wasFailingBefore = isFailedSubject(prior);
                const isFailingNow = isFailedSubject(attempt);

                let outcome;
                if (wasFailingBefore && !isFailingNow) {
                    outcome = 'Cleared Backlog';
                    clearedCount++;
                } else if (deltaMarks > 0) {
                    outcome = 'Grade Upgraded';
                    upgradedCount++;
                } else if (deltaMarks < 0) {
                    outcome = 'Marks Decreased';
                    decreasedCount++;
                } else {
                    outcome = 'Confirmed';
                    unchangedCount++;
                }

                // announced_date is the real VTU declaration date; scraped_at is only
                // when our own scraper happened to visit the page — confirmed on live
                // data these can differ by months, so announced_date must win whenever
                // it's actually on file, with scraped_at only as a last-resort fallback
                // for older rows scraped before this field existed.
                const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const formattedAppliedDate = formatDate(attempt.announced_date || attempt.scraped_at);
                const formattedRegularDate = formatDate(prior.announced_date || prior.scraped_at);

                deltaRoster.push({
                    usn,
                    name: stu?.name || usn,
                    semester: attempt.semester,
                    subject_code: attempt.subject_code,
                    subject_name: attempt.subject_name || attempt.subject_code,
                    originalExternal,
                    revalExternal,
                    deltaMarks,
                    originalInternal,
                    revalInternal,
                    originalTotal: preScore,
                    revalTotal: postScore,
                    preMarks: preScore,
                    preGrade,
                    postMarks: postScore,
                    postGrade,
                    delta,
                    outcome,
                    isCleared: outcome === 'Cleared Backlog',
                    revalExam: attempt.exam_name || 'Reval',
                    revalExamLabel: formatExamSession(attempt.exam_name),
                    regularExam: prior?.exam_name || 'Regular',
                    regularExamLabel: formatExamSession(prior?.exam_name),
                    appliedDate: formattedAppliedDate,
                    regularDate: formattedRegularDate,
                    credits: attempt.credits || prior?.credits || 3,
                });
            });
        });

        // Group by student so faculty can see which student put which subjects, how many subjects, and when
        const studentMap = new Map();
        deltaRoster.forEach(d => {
            const entry = studentMap.get(d.usn) || {
                usn: d.usn,
                name: d.name,
                branch: studentByUsn.get(d.usn)?.branch || 'Engineering',
                applications: [],
                semesters: new Set(),
                totalDelta: 0,
                upgraded: 0,
                cleared: 0,
                decreased: 0,
                confirmed: 0,
                awaitingOriginal: 0,
            };
            entry.applications.push(d);
            entry.semesters.add(d.semester);
            if (d.delta !== null) entry.totalDelta += d.delta;
            if (d.outcome === 'Awaiting Original Mark') entry.awaitingOriginal++;
            else if (d.outcome === 'Cleared Backlog') entry.cleared++;
            else if (d.delta > 0) entry.upgraded++;
            else if (d.delta < 0) entry.decreased++;
            else entry.confirmed++;
            studentMap.set(d.usn, entry);
        });

        // Calculate totalStudentApplications and sort applications per student
        const studentRoster = Array.from(studentMap.values()).map(s => ({
            ...s,
            semesters: Array.from(s.semesters).sort((a, b) => a - b),
            totalSubjectsPut: s.applications.length,
            applications: s.applications.sort((a, b) => a.semester - b.semester || a.subject_code.localeCompare(b.subject_code)),
        })).sort((a, b) => b.totalSubjectsPut - a.totalSubjectsPut || a.name.localeCompare(b.name));

        // Inject totalStudentApplications into each delta row
        deltaRoster.forEach(d => {
            d.totalStudentApplications = studentMap.get(d.usn)?.applications.length || 1;
        });

        const totalApplications = deltaRoster.length;
        // Net pass rate gain is only meaningful over revals we could actually
        // compute a real delta for — "awaiting original mark" rows have no
        // delta to contribute either way, so they're excluded from this ratio's
        // denominator (they're still fully counted in totalApplications).
        const computedCount = totalApplications - awaitingOriginalCount;
        const netPassRateGain = computedCount > 0 ? Number(((clearedCount / computedCount) * 100).toFixed(1)) : 0;

        const payload = {
            summary: {
                totalApplications,
                totalStudents: studentRoster.length,
                upgradedCount,
                clearedCount,
                unchangedCount,
                decreasedCount,
                awaitingOriginalCount,
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
