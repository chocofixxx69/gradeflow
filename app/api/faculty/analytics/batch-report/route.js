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

export async function GET(req) {
    noStore();
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branch = (searchParams.get('branch') || 'ALL').toUpperCase().trim();
        const batch = searchParams.get('batch') || '';
        const section = (searchParams.get('section') || 'ALL').toUpperCase().trim();
        const upToSemester = Math.min(8, Math.max(1, parseInt(searchParams.get('upToSemester') || '6', 10)));
        const fresh = searchParams.get('fresh') === '1';

        const cacheKey = `batch_report:${branch}:${batch}:${upToSemester}:${section}`;
        if (!fresh) {
            const cached = getCached(cacheKey);
            if (cached) return ok(cached);
        }

        const supabaseAdmin = getAdminClient();

        // Canonical per-student records — one shared, cached warehouse read
        // (lib/student-record.js) instead of this route pulling and recomputing
        // its own copy of students + subject_marks on every request.
        const [studentRecords, rawClasses, rawClassStudents] = await Promise.all([
            loadStudentRecords(supabaseAdmin, { fresh }),
            readTable(supabaseAdmin, 'classes', SELECTS.classes, { orderCol: 'created_at', ascending: false }),
            readTable(supabaseAdmin, 'class_students', SELECTS.class_students)
        ]);

        // 1. Section resolution from class rosters
        const classById = new Map((rawClasses || []).map(c => [c.id, c]));
        const usnToSectionMap = new Map();
        const sortedClassStudents = [...(rawClassStudents || [])].sort((a, b) => {
            const cA = classById.get(a.class_id);
            const cB = classById.get(b.class_id);
            const aScore = (cA && cA.batch === batch ? 2 : 0) + (cA && Number(cA.semester) <= upToSemester ? 1 : 0);
            const bScore = (cB && cB.batch === batch ? 2 : 0) + (cB && Number(cB.semester) <= upToSemester ? 1 : 0);
            return aScore - bScore;
        });
        sortedClassStudents.forEach(cs => {
            const c = classById.get(cs.class_id);
            if (c && c.section) {
                usnToSectionMap.set(cs.usn, c.section.toUpperCase().trim());
            }
        });

        // 2. Scope to branch, batch & section
        let records = [...studentRecords.values()];
        if (branch !== 'ALL') records = records.filter(r => matchesBranch(r.raw, branch));
        if (batch && batch.toUpperCase() !== 'ALL') records = records.filter(r => matchesBatch(r.raw, batch));
        if (section && section !== 'ALL') records = records.filter(r => usnToSectionMap.get(r.usn) === section);

        if (records.length === 0) {
            return ok({
                students: [],
                upToSemester,
                summary: {
                    totalStudents: 0,
                    avgCGPA: 0,
                    withBacklogs: 0,
                    distinctionCount: 0,
                    lateralCount: 0
                }
            });
        }

        // 3. Derive each student's progression "as of upToSemester" from their
        // already-computed canonical record (lib/vtuAcademicEngine.js via
        // lib/student-record.js) — same SGPA/CGPA/backlog/credit source as every
        // other page, so this report never disagrees with them for the same student.
        const processedStudents = records.map(record => {
            const isLE = isLateralEntry(record.usn, record.raw?.lateral_entry);
            const semesters = {};
            let cumulativeCredits = 0;
            let totalTrackedCredits = 0;
            let weightedSum = 0;

            for (let sem = 1; sem <= upToSemester; sem++) {
                if (isLE && (sem === 1 || sem === 2)) {
                    semesters[sem] = { isLE: true, sgpa: null, credits: null, backlogs: 0 };
                    continue;
                }

                const stat = record.semStats[sem];
                if (stat) {
                    semesters[sem] = {
                        hasData: true,
                        sgpa: stat.sgpa,
                        credits: stat.earnedCredits,
                        regCredits: stat.totalCredits,
                        backlogs: stat.backlogs
                    };
                    cumulativeCredits += stat.earnedCredits;
                    totalTrackedCredits += stat.totalCredits;
                    weightedSum += (stat.sgpa * stat.totalCredits);
                } else {
                    semesters[sem] = { hasData: false, sgpa: null, credits: null, backlogs: 0 };
                }
            }

            const cgpa = totalTrackedCredits > 0 ? Number((weightedSum / totalTrackedCredits).toFixed(2)) : null;
            const scopedBacklogs = (record.activeBacklogSubjects || []).filter(s => Number(s.semester) <= upToSemester);
            const totalBacklogs = scopedBacklogs.length;
            const totalBacklogCredits = scopedBacklogs.reduce((sum, sub) => sum + (sub.credits || 0), 0);

            return {
                usn: record.usn,
                name: record.name || record.usn,
                branch: record.raw?.branch || (record.usn.length >= 7 ? record.usn.substring(5, 7).toUpperCase() : '—'),
                section: usnToSectionMap.get(record.usn) || '—',
                isLE,
                semesters,
                cumulativeCredits,
                cgpa,
                totalBacklogs,
                backlogCredits: totalBacklogCredits,
                isDistinction: cgpa !== null && cgpa >= 8.0,
                isLow: cgpa !== null && cgpa < 5.0,
                hasBacklogs: totalBacklogs > 0
            };
        }).sort((a, b) => a.usn.localeCompare(b.usn));

        let totalCgpaSum = 0;
        let cgpaCount = 0;
        let withBacklogsCount = 0;
        let distinctionCount = 0;
        let lateralCount = 0;

        processedStudents.forEach(s => {
            if (s.isLE) lateralCount++;
            if (s.cgpa !== null) {
                totalCgpaSum += s.cgpa;
                cgpaCount++;
                if (s.cgpa >= 8.0) distinctionCount++;
            }
            if (s.hasBacklogs) withBacklogsCount++;
        });

        const avgCGPA = cgpaCount > 0 ? Number((totalCgpaSum / cgpaCount).toFixed(2)) : 0;

        const payload = {
            students: processedStudents,
            upToSemester,
            summary: {
                totalStudents: processedStudents.length,
                avgCGPA,
                withBacklogs: withBacklogsCount,
                distinctionCount,
                lateralCount
            },
            filtersApplied: { branch, batch, upToSemester }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/batch-report]', err);
        return fail('Failed to generate batch report: ' + (err.message || err), 'BATCH_REPORT_ERROR', 500);
    }
}
