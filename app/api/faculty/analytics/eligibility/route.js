import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
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
        const targetSemester = parseInt(searchParams.get('targetSemester') || '5', 10);
        const fresh = searchParams.get('fresh') === '1';

        const cacheKey = `eligibility:${branch}:${batch}:${targetSemester}`;
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

        if (records.length === 0) {
            return ok({
                summary: { totalEvaluated: 0, eligibleCount: 0, detainedCount: 0, eligibilityRate: 0 },
                eligibleStudents: [],
                detainedStudents: [],
                targetSemester
            });
        }

        // 2. Evaluate VTU Vertical Progression Rules using canonical academic record
        const eligibleStudents = [];
        const detainedStudents = [];

        records.forEach(record => {
            const activeBacklogs = record.activeBacklogSubjects || [];
            const totalBacklogs = activeBacklogs.length;
            const isLE = isLateralEntry(record.usn, record.raw?.lateral_entry) || /[A-Z]{2,3}9\d{2}/i.test(record.usn);
            const totalEarnedCredits = record.totalEarnedCredits;
            const year1EarnedCredits = (record.semStats[1]?.earnedCredits || 0) + (record.semStats[2]?.earnedCredits || 0);

            let isEligible = true;
            const reasons = [];
            const currentStudentSem = Number(record.raw?.semester) || 0;
            const alreadyPassedGate = currentStudentSem > targetSemester;

            if (alreadyPassedGate) {
                if (targetSemester === 7) {
                    const sem1And2Backlogs = activeBacklogs.filter(b => Number(b.semester) <= 2);
                    if (sem1And2Backlogs.length > 0 && !isLE) {
                        isEligible = false;
                        reasons.push(`Carrying ${sem1And2Backlogs.length} uncleared backlog(s) from 1st Year (${sem1And2Backlogs.map(s => s.subjectCode || s.subject_code).join(', ')}). VTU Rule: Any student with 1st-year backlogs CANNOT be admitted to 7th Semester.`);
                    }
                }
            }
            else if (targetSemester === 3) {
                if (year1EarnedCredits < 20 && !isLE) {
                    isEligible = false;
                    reasons.push(`Earned only ${year1EarnedCredits} credits in 1st Year (VTU Minimum Required to move to 2nd Year: 20 credits).`);
                }
                const year1Backlogs = activeBacklogs.filter(b => Number(b.semester) <= 2);
                if (year1Backlogs.length > 4 && !isLE) {
                    isEligible = false;
                    reasons.push(`Carrying ${year1Backlogs.length} backlogs from 1st Year (Maximum allowed: 4).`);
                }
            }
            else if (targetSemester === 5) {
                const year1And2Backlogs = activeBacklogs.filter(b => Number(b.semester) <= 4);
                if (year1And2Backlogs.length > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${year1And2Backlogs.length} backlogs from Semesters 1 to 4 (Maximum allowed: 4).`);
                }
            }
            else if (targetSemester === 7) {
                const sem1And2Backlogs = activeBacklogs.filter(b => Number(b.semester) <= 2);
                if (sem1And2Backlogs.length > 0 && !isLE) {
                    isEligible = false;
                    reasons.push(`Carrying ${sem1And2Backlogs.length} uncleared backlog(s) from 1st Year (${sem1And2Backlogs.map(s => s.subjectCode || s.subject_code).join(', ')}). VTU Rule: Any student with 1st-year backlogs CANNOT be admitted to 7th Semester.`);
                }
            }
            else {
                if (totalBacklogs > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${totalBacklogs} active backlogs (Standard threshold: 4).`);
                }
            }

            const studentItem = {
                usn: record.usn,
                name: record.name || record.usn,
                branch: record.raw?.branch || branch,
                currentSemester: currentStudentSem,
                isLE,
                totalEarnedCredits,
                year1Credits: year1EarnedCredits,
                backlogCount: totalBacklogs,
                backlogs: activeBacklogs.map(b => ({
                    code: b.subjectCode || b.subject_code,
                    name: b.subjectName || b.subject_name || b.subjectCode,
                    semester: b.semester,
                    credits: b.credits
                })),
                cgpa: record.cgpa || 0,
                isEligible,
                reasons
            };

            if (isEligible) {
                eligibleStudents.push(studentItem);
            } else {
                detainedStudents.push(studentItem);
            }
        });

        eligibleStudents.sort((a, b) => a.usn.localeCompare(b.usn));

        const totalEvaluated = records.length;
        const eligibleCount = eligibleStudents.length;
        const detainedCount = detainedStudents.length;
        const eligibilityRate = totalEvaluated > 0 ? Number(((eligibleCount / totalEvaluated) * 100).toFixed(1)) : 0;

        const allEvaluatedStudents = [...detainedStudents, ...eligibleStudents].sort((a, b) => a.usn.localeCompare(b.usn));

        const payload = {
            summary: {
                totalEvaluated,
                eligibleCount,
                detainedCount,
                eligibilityRate
            },
            allStudents: allEvaluatedStudents,
            eligibleStudents,
            detainedStudents,
            targetSemester,
            filtersApplied: { branch, batch, targetSemester }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/eligibility]', err);
        return fail('Failed to evaluate vertical progression eligibility: ' + (err.message || err), 'ELIGIBILITY_ERROR', 500);
    }
}
