import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { readTable, SELECTS } from '@/lib/table-cache';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, matchesBranch, isLateralEntry } from '@/lib/semester-utils';
import { loadStudentRecords } from '@/lib/student-record';

import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    noStore();
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branch = (searchParams.get('branch') || 'CS').toUpperCase().trim();
        const batch = searchParams.get('batch') || '';
        const section = (searchParams.get('section') || '').toUpperCase().trim();
        const semester = searchParams.get('semester') && searchParams.get('semester') !== 'all'
            ? parseInt(searchParams.get('semester'), 10)
            : null;
        const fresh = searchParams.get('fresh') === '1';

        const cacheKey = `merit_list:${branch}:${batch}:${semester || 'all'}:${section || 'all'}`;
        if (!fresh) {
            const cached = getCached(cacheKey);
            if (cached) return ok(cached);
        }

        const supabaseAdmin = getAdminClient();

        // 1. Fetch canonical records and class mapping in parallel
        const [
            studentRecords,
            rawClasses,
            rawClassStudents
        ] = await Promise.all([
            loadStudentRecords(supabaseAdmin, { fresh }),
            readTable(supabaseAdmin, 'classes', SELECTS.classes, { orderCol: 'created_at', ascending: false }),
            readTable(supabaseAdmin, 'class_students', SELECTS.class_students)
        ]);

        const classById = new Map((rawClasses || []).map(c => [c.id, c]));
        const usnToSectionMap = new Map();
        const sortedClassStudents = [...(rawClassStudents || [])].sort((a, b) => {
            const cA = classById.get(a.class_id);
            const cB = classById.get(b.class_id);
            const aScore = (cA && (!semester || Number(cA.semester) === Number(semester)) ? 2 : 0) + (cA && cA.batch === batch ? 1 : 0);
            const bScore = (cB && (!semester || Number(cB.semester) === Number(semester)) ? 2 : 0) + (cB && cB.batch === batch ? 1 : 0);
            return aScore - bScore;
        });
        sortedClassStudents.forEach(cs => {
            const c = classById.get(cs.class_id);
            if (c && c.section) {
                usnToSectionMap.set(cs.usn, c.section.toUpperCase().trim());
            }
        });

        let records = [...studentRecords.values()];
        if (branch && branch !== 'ALL') {
            records = records.filter(r => matchesBranch(r.raw, branch));
        }
        if (batch && batch.toUpperCase() !== 'ALL') {
            records = records.filter(r => matchesBatch(r.raw, batch));
        }
        if (section && section !== 'ALL') {
            records = records.filter(r => usnToSectionMap.get(r.usn) === section);
        }

        if (records.length === 0) {
            return ok({
                summary: { totalRanked: 0, highestScore: 0, avgScore: 0 },
                podium: [],
                rankedStudents: []
            });
        }

        // 2. Derive candidate entries directly from canonical record
        const candidateList = records.map(record => {
            const semSubjects = semester
                ? (record.marksBySemester[semester] || [])
                : Object.values(record.marksBySemester).flat();

            if (semSubjects.length === 0) return null;

            const totalMarks = semSubjects.reduce((acc, m) => acc + (Number(m.total) || 0), 0);
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
                usn: record.usn,
                name: record.name || record.usn,
                branch: record.raw?.branch || branch,
                section: usnToSectionMap.get(record.usn) || null,
                isLE: isLateralEntry(record.usn, record.raw?.lateral_entry),
                gpa: finalGpa,
                totalMarks,
                creditsEarned,
                hasBacklogs: backlogCount > 0,
                backlogCount,
            };
        }).filter(Boolean);

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
                semester: semester ? `Semester ${semester}` : 'Overall Cumulative',
                section: section && section !== 'ALL' ? `Section ${section}` : 'All Sections'
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
