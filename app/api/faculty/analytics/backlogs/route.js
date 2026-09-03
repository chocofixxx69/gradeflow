import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs, fetchDynamicStudents, fetchDynamicMarks } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, matchesBranch, isLateralEntry } from '@/lib/semester-utils';
import { resolveSubjectCredits } from '@/lib/export-utils';

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
        const branch = (searchParams.get('branch') || 'ALL').toUpperCase().trim();
        const batch = searchParams.get('batch') || '';
        const threshold = parseInt(searchParams.get('threshold') || '1', 10); // min backlogs to show
        const search = (searchParams.get('search') || '').trim().toLowerCase();

        const cacheKey = `backlogs:${branch}:${batch}:${threshold}:${search}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students dynamically for this branch & batch without limits
        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { branch });

        let students = rawStudents || [];
        if (branch && branch !== 'ALL') {
            students = students.filter(s => matchesBranch(s, branch));
        }
        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        if (search) {
            students = students.filter(s =>
                s.usn.toLowerCase().includes(search) || (s.name && s.name.toLowerCase().includes(search))
            );
        }

        if (students.length === 0) {
            return ok({
                summary: { totalCarriers: 0, totalArrearsSubjects: 0, totalArrearsCredits: 0, criticalCarriers: 0 },
                ledger: [],
                subjectConcentration: []
            });
        }

        const usns = students.map(s => s.usn);

        // 2. Fetch subject marks dynamically across all semesters
        const marks = await fetchDynamicMarks(supabaseAdmin, {
            usns,
            select: 'usn, semester, subject_code, subject_name, credits, internal, external, total, grade, passed'
        });

        const marksByUsn = new Map();
        marks.forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // 3. Compute active arrears per student and aggregate subject failure counts
        const ledger = [];
        const subjectFailCount = new Map(); // code -> { code, name, count, credits }
        let totalArrearsSubjectsCount = 0;
        let totalArrearsCreditsCount = 0;
        let criticalCarriersCount = 0;

        students.forEach(s => {
            const uMarks = marksByUsn.get(s.usn) || [];
            const backlogInfo = computeBacklogs(uMarks);
            const activeBacklogs = backlogInfo.failedSubjects;
            const count = activeBacklogs.length;

            if (count >= threshold) {
                const totalCredits = activeBacklogs.reduce((sum, sub) => sum + (sub.credits || 3), 0);
                totalArrearsSubjectsCount += count;
                totalArrearsCreditsCount += totalCredits;
                if (count > 4) criticalCarriersCount++;

                activeBacklogs.forEach(sub => {
                    const code = (sub.subject_code || '').toUpperCase();
                    const existing = subjectFailCount.get(code) || {
                        code,
                        name: sub.subject_name || code,
                        count: 0,
                        credits: sub.credits || 3,
                        semester: sub.semester || 1
                    };
                    existing.count++;
                    subjectFailCount.set(code, existing);
                });

                ledger.push({
                    usn: s.usn,
                    name: s.name || s.usn,
                    branch: s.branch,
                    semester: s.semester || 1,
                    isLE: isLateralEntry(s.usn, s.lateral_entry),
                    totalBacklogs: count,
                    backlogCredits: totalCredits,
                    isCritical: count > 4,
                    failedSubjects: activeBacklogs.map(b => ({
                        code: b.subject_code,
                        name: b.subject_name,
                        semester: b.semester,
                        credits: b.credits || 3
                    }))
                });
            }
        });

        // Sort ledger by backlog count descending
        ledger.sort((a, b) => b.totalBacklogs - a.totalBacklogs || a.usn.localeCompare(b.usn));

        // Subject concentration ranked by highest failure count
        const subjectConcentration = Array.from(subjectFailCount.values()).sort((a, b) => b.count - a.count);

        const payload = {
            summary: {
                totalCarriers: ledger.length,
                totalArrearsSubjects: totalArrearsSubjectsCount,
                totalArrearsCredits: totalArrearsCreditsCount,
                criticalCarriers: criticalCarriersCount,
                branch,
                batch: batch || 'All Batches'
            },
            ledger,
            subjectConcentration
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/backlogs]', err);
        return fail('Failed to compile standing backlogs register: ' + (err.message || err), 'BACKLOGS_ERROR', 500);
    }
}
