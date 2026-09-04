import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents, fetchDynamicMarks } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch } from '@/lib/semester-utils';
import { calculateAcademicRecord } from '@/lib/vtuAcademicEngine';
import { fetchCatalogIndex } from '@/lib/subjectCreditResolver';

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
        const batch = searchParams.get('batch') || '';
        const semester = searchParams.get('semester') && searchParams.get('semester') !== 'all'
            ? parseInt(searchParams.get('semester'), 10)
            : null;

        const cacheKey = `merit_list:${branch}:${batch}:${semester || 'all'}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students dynamically for this branch without limits
        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { branch });

        let students = rawStudents || [];
        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        if (students.length === 0) {
            return ok({
                summary: { totalRanked: 0, highestScore: 0, avgScore: 0 },
                podium: [],
                rankedStudents: []
            });
        }

        const usns = students.map(s => s.usn);

        // 2. Fetch marks dynamically. When `semester` is set, this already scopes
        // marks to just that semester, so the canonical engine below naturally
        // produces that semester's SGPA/backlogs from them.
        const marks = await fetchDynamicMarks(supabaseAdmin, {
            usns,
            semester,
            select: 'usn, semester, subject_code, subject_name, internal, external, total, grade, passed, credits'
        });

        const marksByUsn = new Map();
        marks.forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // 3. GPA/credits/backlogs come exclusively from the canonical
        // calculateAcademicRecord engine (lib/vtuAcademicEngine.js) — the same
        // one the Leaderboard, student dashboard, and every admin analytics page
        // use. This used to reimplement SGPA/CGPA from scratch here (its own
        // totalPoints/totalCredits loop), which is exactly the kind of second
        // calculation path that can silently drift from the canonical one and
        // show a different GPA for the same student on two different pages.
        // totalMarks (a simple raw sum, not a GPA) is still computed locally —
        // that's not a competing calculation, just an honest arithmetic total
        // used as the merit list's tiebreak criterion.
        const catalogIndex = await fetchCatalogIndex(supabaseAdmin);

        const candidateList = (await Promise.all(students.map(async s => {
            const uMarks = marksByUsn.get(s.usn) || [];
            if (uMarks.length === 0) return null;

            const record = await calculateAcademicRecord(uMarks, { usn: s.usn, branch: s.branch, scheme: s.scheme }, { catalogIndex });

            const totalMarks = uMarks.reduce((acc, m) => acc + (Number(m.total) || 0), 0);
            const finalGpa = semester
                ? (record.semStats?.[semester]?.sgpa ?? 0)
                : record.cgpa;
            const creditsEarned = semester
                ? (record.semStats?.[semester]?.totalCredits ?? 0)
                : record.totalEarnedCredits;
            const backlogCount = semester
                ? (record.semStats?.[semester]?.backlogs ?? 0)
                : record.totalActiveBacklogs;

            return {
                usn: s.usn,
                name: s.name || s.usn,
                branch: s.branch,
                isLE: Boolean(s.lateral_entry),
                gpa: finalGpa,
                totalMarks,
                creditsEarned,
                hasBacklogs: backlogCount > 0,
                backlogCount,
            };
        }))).filter(Boolean);

        // 4. Sort with tie-breaking rules:
        // Priority 1: Clear students before backlog carriers
        // Priority 2: Highest GPA (CGPA or SGPA)
        // Priority 3: Highest Total Marks
        candidateList.sort((a, b) => {
            if (a.hasBacklogs !== b.hasBacklogs) {
                return a.hasBacklogs ? 1 : -1;
            }
            const agpa = Number(Number(a.gpa).toFixed(2));
            const bgpa = Number(Number(b.gpa).toFixed(2));
            if (bgpa !== agpa) {
                return bgpa - agpa;
            }
            if (b.totalMarks !== a.totalMarks) {
                return b.totalMarks - a.totalMarks;
            }
            return (a.usn || '').localeCompare(b.usn || '');
        });

        // Assign ranks and honors dynamically (tied GPAs share the exact same rank)
        const total = candidateList.length;
        let currentRank = 1;
        let lastGpa = null;
        let clearCount = 0;

        const rankedStudents = candidateList.map((c) => {
            let rank;
            let honors = 'Pass Class';

            if (!c.hasBacklogs) {
                const roundedGpa = Number(Number(c.gpa).toFixed(2));
                if (clearCount === 0) {
                    currentRank = 1;
                    lastGpa = roundedGpa;
                } else if (roundedGpa === lastGpa) {
                    // Tied GPA: exact same rank
                } else {
                    currentRank = currentRank + 1; // Dense ranking
                    lastGpa = roundedGpa;
                }
                rank = currentRank;
                clearCount++;

                if (rank === 1) honors = 'Gold Medal (Rank 1)';
                else if (rank === 2) honors = 'Silver Medal (Rank 2)';
                else if (rank === 3) honors = 'Bronze Medal (Rank 3)';
                else if (rank <= Math.max(3, Math.ceil(total * 0.10))) honors = 'Distinction (Top 10%)';
                else if (rank <= Math.ceil(total * 0.25)) honors = 'First Class (Top 25%)';
                else honors = 'First Class';
            } else {
                rank = '—';
                honors = `Carrying ${c.backlogCount} Arrears`;
            }

            return {
                rank,
                ...c,
                honors
            };
        });

        // Podium includes all students who earned top-3 ranks (including all ties)
        const podiumMedalists = rankedStudents.filter(s => typeof s.rank === 'number' && s.rank <= 3);
        const podium = podiumMedalists.length > 0 ? podiumMedalists : rankedStudents.slice(0, 3);
        const highestScore = rankedStudents.length > 0 ? rankedStudents[0].gpa : 0;
        const avgScore = rankedStudents.length > 0
            ? Number((rankedStudents.reduce((acc, r) => acc + r.gpa, 0) / rankedStudents.length).toFixed(2))
            : 0;

        const payload = {
            summary: {
                totalRanked: rankedStudents.length,
                highestScore,
                avgScore,
                department: branch,
                batch: batch || 'All Batches',
                semester: semester ? `Semester ${semester}` : 'Overall Cumulative'
            },
            podium,
            rankedStudents
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/merit-list]', err);
        return fail('Failed to compile merit rank list: ' + (err.message || err), 'MERIT_LIST_ERROR', 500);
    }
}
