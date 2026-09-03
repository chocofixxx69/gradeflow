import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs, fetchDynamicStudents, fetchDynamicMarks } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, isLateralEntry } from '@/lib/semester-utils';
import { resolveSubjectCredits } from '@/lib/export-utils';
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
        const batch = searchParams.get('batch') || '';
        const targetSemester = parseInt(searchParams.get('targetSemester') || '5', 10); // Typically Sem 3, 5, or 7

        const cacheKey = `eligibility:${branch}:${batch}:${targetSemester}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students dynamically for this branch & batch without limits
        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { branch });

        let students = rawStudents || [];
        if (batch) {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        if (students.length === 0) {
            return ok({
                summary: { totalEvaluated: 0, eligibleCount: 0, detainedCount: 0, eligibilityRate: 0 },
                eligibleStudents: [],
                detainedStudents: [],
                targetSemester
            });
        }

        const usns = students.map(s => s.usn);

        // 2. Fetch all subject marks dynamically prior to target semester
        const allMarks = await fetchDynamicMarks(supabaseAdmin, {
            usns,
            select: 'usn, semester, subject_code, subject_name, credits, internal, external, total, grade, passed'
        });
        const rawMarks = (allMarks || []).filter(m => Number(m.semester) < targetSemester);

        const marksByUsn = new Map();
        (rawMarks || []).forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // 3. Evaluate VTU Vertical Progression Rules
        const eligibleStudents = [];
        const detainedStudents = [];

        students.forEach(student => {
            const uMarks = marksByUsn.get(student.usn) || [];
            const backlogInfo = computeBacklogs(uMarks);
            const activeBacklogs = backlogInfo.failedSubjects;
            const totalBacklogs = activeBacklogs.length;
            const isLE = isLateralEntry(student.usn, student.lateral_entry);
            const totalEarnedCredits = uMarks.filter(m => !isFailedSubject(m)).reduce((acc, m) => acc + resolveSubjectCredits(m), 0);
            const year1EarnedCredits = uMarks
                .filter(m => (Number(m.semester) === 1 || Number(m.semester) === 2) && !isFailedSubject(m))
                .reduce((acc, m) => acc + resolveSubjectCredits(m), 0);

            let isEligible = true;
            const reasons = [];

            // Rule 1: Admission to 3rd Semester (Year 2 entry)
            // VTU Regulation: Student must earn a minimum of 20 credits in 1st Year and not carry > 4 backlogs
            if (targetSemester === 3) {
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
            // Rule 2: Admission to 5th Semester (Year 3 entry)
            // VTU Regulation: Not more than 4 backlogs from 1st and 2nd year combined
            else if (targetSemester === 5) {
                const year1And2Backlogs = activeBacklogs.filter(b => Number(b.semester) <= 4);
                if (year1And2Backlogs.length > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${year1And2Backlogs.length} backlogs from Semesters 1 to 4 (Maximum allowed: 4).`);
                }
            }
            // Rule 3: Admission to 7th Semester (Year 4 entry)
            // VTU Regulation: ANY student carrying backlogs from 1st year CANNOT enter 7th Semester!
            else if (targetSemester === 7) {
                const sem1And2Backlogs = activeBacklogs.filter(b => Number(b.semester) <= 2);
                if (sem1And2Backlogs.length > 0 && !isLE) {
                    isEligible = false;
                    reasons.push(`Carrying ${sem1And2Backlogs.length} uncleared backlog(s) from 1st Year (${sem1And2Backlogs.map(s => s.subject_code).join(', ')}). VTU Rule: Any student with 1st-year backlogs CANNOT be admitted to 7th Semester.`);
                }

                const year2And3Backlogs = activeBacklogs.filter(b => Number(b.semester) > 2 && Number(b.semester) <= 6);
                if (year2And3Backlogs.length > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${year2And3Backlogs.length} backlogs from Semesters 3 to 6 (Maximum allowed: 4).`);
                }
            }
            // Generic fallback for any other semester
            else {
                if (totalBacklogs > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${totalBacklogs} active backlogs (Standard threshold: 4).`);
                }
            }

            const studentReport = {
                usn: student.usn,
                name: student.name || student.usn,
                branch: student.branch,
                isLE,
                totalEarnedCredits,
                year1EarnedCredits,
                activeBacklogsCount: totalBacklogs,
                unclearedSubjects: activeBacklogs.map(b => ({
                    code: b.subject_code,
                    name: b.subject_name,
                    semester: b.semester
                })),
                isEligible,
                status: isEligible ? 'Eligible' : 'Detained',
                detentionReasons: reasons
            };

            if (isEligible) {
                eligibleStudents.push(studentReport);
            } else {
                detainedStudents.push(studentReport);
            }
        });

        // Sort both lists by USN
        eligibleStudents.sort((a, b) => a.usn.localeCompare(b.usn));
        detainedStudents.sort((a, b) => b.activeBacklogsCount - a.activeBacklogsCount || a.usn.localeCompare(b.usn));

        const totalEvaluated = students.length;
        const eligibleCount = eligibleStudents.length;
        const detainedCount = detainedStudents.length;
        const eligibilityRate = totalEvaluated > 0 ? Number(((eligibleCount / totalEvaluated) * 100).toFixed(1)) : 0;

        const payload = {
            summary: {
                totalEvaluated,
                eligibleCount,
                detainedCount,
                eligibilityRate
            },
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
