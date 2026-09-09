import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, matchesBranch, isLateralEntry } from '@/lib/semester-utils';
import { loadStudentRecords } from '@/lib/student-record';
import { filterAndRankStudents } from '@/lib/search-utils';

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
        const branch = (searchParams.get('branch') || 'ALL').toUpperCase().trim();
        const batch = searchParams.get('batch') || '';
        const threshold = parseInt(searchParams.get('threshold') || '1', 10); // min backlogs to show
        const search = (searchParams.get('search') || '').trim().toLowerCase();
        const fresh = searchParams.get('fresh') === '1';

        const cacheKey = `backlogs:${branch}:${batch}:${threshold}:${search}`;
        if (!fresh) {
            const cached = getCached(cacheKey);
            if (cached) return ok(cached);
        }

        const supabaseAdmin = getAdminClient();

        // 1. Fetch canonical records from shared warehouse read
        const studentRecords = await loadStudentRecords(supabaseAdmin, { fresh });

        let records = [...studentRecords.values()];
        if (branch && branch !== 'ALL') {
            records = records.filter(r => matchesBranch(r.raw, branch));
        }
        if (batch && batch.toUpperCase() !== 'ALL') {
            records = records.filter(r => matchesBatch(r.raw, batch));
        }

        if (search) {
            records = records.filter(r => (r.usn || '').toLowerCase().includes(search) || (r.name || '').toLowerCase().includes(search));
        }

        if (records.length === 0) {
            return ok({
                summary: { totalCarriers: 0, totalArrearsSubjects: 0, totalArrearsCredits: 0, criticalCarriers: 0 },
                ledger: [],
                subjectConcentration: []
            });
        }

        // 2. Compute active arrears per student and aggregate subject failure counts
        // directly from the canonical record (already computed with vtuAcademicEngine)
        const ledger = [];
        const subjectFailCount = new Map(); // code -> { code, name, count, credits }
        let totalArrearsSubjectsCount = 0;
        let totalArrearsCreditsCount = 0;
        let criticalCarriersCount = 0;

        records.forEach(record => {
            const activeBacklogs = record.activeBacklogSubjects || [];
            const count = activeBacklogs.length;

            if (count >= threshold) {
                const totalCredits = activeBacklogs.reduce((sum, sub) => sum + (sub.credits || 0), 0);
                totalArrearsSubjectsCount += count;
                totalArrearsCreditsCount += totalCredits;
                if (count > 4) criticalCarriersCount++;

                activeBacklogs.forEach(sub => {
                    const code = (sub.subjectCode || sub.subject_code || '').toUpperCase();
                    const existing = subjectFailCount.get(code) || {
                        code,
                        name: sub.subjectName || sub.subject_name || code,
                        count: 0,
                        credits: sub.credits || 0,
                        semester: sub.semester || 1
                    };
                    existing.count++;
                    subjectFailCount.set(code, existing);
                });

                ledger.push({
                    usn: record.usn,
                    name: record.name || record.usn,
                    branch: record.raw?.branch || branch,
                    semester: record.raw?.semester || 1,
                    isLE: isLateralEntry(record.usn, record.raw?.lateral_entry),
                    totalBacklogs: count,
                    backlogCredits: totalCredits,
                    isCritical: count > 4,
                    failedSubjects: activeBacklogs.map(b => ({
                        code: b.subjectCode || b.subject_code,
                        name: b.subjectName || b.subject_name || b.subjectCode,
                        semester: b.semester,
                        credits: b.credits || 0
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
