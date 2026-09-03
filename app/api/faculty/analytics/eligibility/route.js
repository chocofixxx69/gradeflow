import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs } from '@/lib/analytics-data';
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

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students for this branch & batch
        let query = supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, semester, year, lateral_entry')
            .ilike('branch', `%${branch}%`)
            .limit(500);

        const { data: rawStudents, error: stuErr } = await query;
        if (stuErr) throw stuErr;

        let students = rawStudents || [];
        if (batch) {
            const b2 = batch.slice(-2);
            students = students.filter(s => {
                if (s.year && String(s.year) === String(batch)) return true;
                if (s.usn) {
                    const m = s.usn.match(/[0-9][A-Z]{2}([0-9]{2})[A-Z]{2}[0-9]{3}/i);
                    if (m && m[1] === b2) return true;
                }
                return false;
            });
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

        // 2. Fetch all subject marks prior to target semester
        const { data: rawMarks } = await supabaseAdmin
            .from('subject_marks')
            .select('usn, semester, subject_code, subject_name, credits, internal, external, total, grade, passed')
            .in('usn', usns)
            .lt('semester', targetSemester);

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

            const totalEarnedCredits = uMarks.filter(m => !isFailedSubject(m)).reduce((acc, m) => acc + resolveSubjectCredits(m), 0);

            let isEligible = true;
            const reasons = [];

            // Rule 1: Admission to 3rd Semester (Year 2 entry)
            if (targetSemester === 3) {
                const year1Backlogs = activeBacklogs.filter(b => b.semester <= 2);
                if (year1Backlogs.length > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${year1Backlogs.length} backlogs from Year 1 (Maximum allowed: 4)`);
                }
            }
            // Rule 2: Admission to 5th Semester (Year 3 entry)
            else if (targetSemester === 5) {
                // Not more than 4 backlogs from 1st and 2nd year combined
                const year1And2Backlogs = activeBacklogs.filter(b => b.semester <= 4);
                if (year1And2Backlogs.length > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${year1And2Backlogs.length} backlogs from Semesters 1 to 4 (Maximum allowed: 4)`);
                }
            }
            // Rule 3: Admission to 7th Semester (Year 4 entry)
            else if (targetSemester === 7) {
                // Must have completely cleared all 1st year subjects (Sem 1 and 2)
                const sem1And2Backlogs = activeBacklogs.filter(b => b.semester <= 2);
                if (sem1And2Backlogs.length > 0 && !student.lateral_entry) {
                    isEligible = false;
                    reasons.push(`Uncleared 1st-year arrears (${sem1And2Backlogs.map(s => s.subject_code).join(', ')}). All 1st-year subjects must be cleared for 7th semester admission.`);
                }
                // Not more than 4 backlogs from 2nd and 3rd year
                const year2And3Backlogs = activeBacklogs.filter(b => b.semester > 2 && b.semester <= 6);
                if (year2And3Backlogs.length > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${year2And3Backlogs.length} backlogs from Semesters 3 to 6 (Maximum allowed: 4)`);
                }
            }
            // Generic fallback for any other semester
            else {
                if (totalBacklogs > 4) {
                    isEligible = false;
                    reasons.push(`Carrying ${totalBacklogs} active backlogs (Standard threshold: 4)`);
                }
            }

            const studentReport = {
                usn: student.usn,
                name: student.name || student.usn,
                branch: student.branch,
                isLE: Boolean(student.lateral_entry),
                totalEarnedCredits,
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

        return ok({
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
        });
    } catch (err) {
        console.error('[GET /api/faculty/analytics/eligibility]', err);
        return fail('Failed to evaluate vertical progression eligibility: ' + (err.message || err), 'ELIGIBILITY_ERROR', 500);
    }
}
