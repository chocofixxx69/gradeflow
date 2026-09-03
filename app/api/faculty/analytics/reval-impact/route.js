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

        const cacheKey = `reval_impact:${branch}:${semester}:${batch}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { branch, select: 'id, usn, name, branch, year, lateral_entry' });

        let students = rawStudents || [];
        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        const usns = students.map(s => s.usn);
        const studentByUsn = new Map(students.map(s => [s.usn, s]));

        if (usns.length === 0) {
            const empty = { summary: { totalApplications: 0, upgradedCount: 0, clearedCount: 0, unchangedCount: 0, decreasedCount: 0, netPassRateGain: 0 }, deltaRoster: [], branch, semester };
            return ok(empty);
        }

        // Every declared exam attempt (regular, makeup, revaluation, ...) for these
        // students in this semester. `exam_name` is the only signal we have for
        // which declarations are revaluations — VTU scrape job names carry "RV"
        // for reval cycles (confirmed against live data: DJRVcbcs25, JJRVcbcs24,
        // MJ26rvcbcs, etc).
        const { data: allResults, error: resErr } = await supabaseAdmin
            .from('results')
            .select('id, usn, semester, exam_name, scraped_at')
            .in('usn', usns)
            .eq('semester', semester);

        if (resErr) throw resErr;

        const results = allResults || [];
        const resultById = new Map(results.map(r => [r.id, r]));
        const revalResultIds = new Set(results.filter(r => r.exam_name && /rv/i.test(r.exam_name)).map(r => r.id));

        // Real subject-level marks for every declaration in scope — the only
        // source of truth for a per-subject before/after comparison. Grouped by
        // (usn, subject_code) so each subject's own attempt history can be walked
        // in chronological order.
        const { data: rawMarks, error: marksErr } = await supabaseAdmin
            .from('subject_marks')
            .select('id, result_id, usn, subject_code, subject_name, semester, total, grade')
            .in('usn', usns)
            .eq('semester', semester);

        if (marksErr) throw marksErr;

        const marks = rawMarks || [];
        const bySubject = new Map(); // `${usn}|${subject_code}` -> mark rows, each tagged with its declaration's scraped_at/isReval
        marks.forEach(m => {
            const decl = resultById.get(m.result_id);
            if (!decl) return; // orphaned mark row with no matching declaration in scope — skip rather than guess
            const key = `${m.usn}|${(m.subject_code || '').toUpperCase()}`;
            const list = bySubject.get(key) || [];
            list.push({ ...m, scraped_at: decl.scraped_at, isReval: revalResultIds.has(m.result_id) });
            bySubject.set(key, list);
        });

        const deltaRoster = [];
        let upgradedCount = 0;
        let clearedCount = 0;
        let unchangedCount = 0;
        let decreasedCount = 0;

        bySubject.forEach((attempts, key) => {
            // Chronological order — earliest declaration first — so "pre" always
            // means "the most recent real mark recorded before this reval attempt",
            // never an invented baseline.
            const sorted = [...attempts].sort((a, b) => new Date(a.scraped_at) - new Date(b.scraped_at));

            sorted.forEach((attempt, idx) => {
                if (!attempt.isReval) return; // only reval attempts produce a delta row
                // Most recent non-reval attempt strictly before this one.
                const prior = [...sorted.slice(0, idx)].reverse().find(a => !a.isReval);
                if (!prior) return; // no real prior mark on file — nothing honest to compare against, so skip

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

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/reval-impact]', err);
        return fail('Failed to compile revaluation impact analysis: ' + (err.message || err), 'REVAL_ERROR', 500);
    }
}
