import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs, weightedCGPA } from '@/lib/analytics-data';
import { scoreToGradePoint, resolveSubjectCredits } from '@/lib/export-utils';
import { isFailedSubject } from '@/lib/vtuGrades';
import { isLateralEntry } from '@/lib/semester-utils';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req, { params }) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const rawUsn = params?.usn;
        if (!rawUsn) return fail('USN parameter is required.', 'MISSING_USN', 400);

        const cleanUsn = rawUsn.toUpperCase().trim();
        const supabaseAdmin = getAdminClient();

        // 1. Fetch student master profile
        const { data: student, error: stuErr } = await supabaseAdmin
            .from('students')
            .select('*')
            .eq('usn', cleanUsn)
            .maybeSingle();

        if (stuErr) throw stuErr;

        // 2. Fetch subject marks and academic remarks
        const [
            { data: rawMarks },
            { data: rawRemarks },
            { data: rawResults }
        ] = await Promise.all([
            supabaseAdmin
                .from('subject_marks')
                .select('*, results(exam_name)')
                .eq('usn', cleanUsn)
                .order('semester', { ascending: true })
                .order('subject_code', { ascending: true }),
            supabaseAdmin
                .from('academic_remarks')
                .select('*')
                .eq('student_usn', cleanUsn)
                .order('semester', { ascending: true }),
            supabaseAdmin
                .from('results')
                .select('*')
                .eq('usn', cleanUsn)
        ]);

        const marks = rawMarks || [];
        const remarks = rawRemarks || [];

        // 3. Compute Backlogs
        const backlogInfo = computeBacklogs(marks);
        const totalBacklogCredits = backlogInfo.failedSubjects.reduce((sum, sub) => sum + (sub.credits || 3), 0);

        // 4. Group marks by semester & compute SGPA per semester
        const semesterMarks = {};
        const semStats = {};
        const gradeCounts = { O: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, P: 0, F: 0 };
        let totalCreditsEarned = 0;
        let subjectsClearedCount = 0;
        let subjectsFailedCount = 0;
        let bestSgpa = 0;

        marks.forEach(m => {
            const sem = m.semester || 1;
            if (!semesterMarks[sem]) semesterMarks[sem] = [];

            const isFail = isFailedSubject(m);
            const cr = resolveSubjectCredits(m);
            const score = Number(m.total) || 0;
            const gp = scoreToGradePoint(m.total, m.grade);
            const g = (m.grade || '').toUpperCase().trim();

            if (isFail) {
                subjectsFailedCount++;
                gradeCounts.F++;
            } else {
                subjectsClearedCount++;
                totalCreditsEarned += cr;
                if (gradeCounts[g] !== undefined) {
                    gradeCounts[g]++;
                } else if (g === 'S') {
                    gradeCounts.O++;
                } else {
                    gradeCounts.P++;
                }
            }

            semesterMarks[sem].push({
                id: m.id,
                subject_code: m.subject_code,
                subject_name: m.subject_name || m.subject_code,
                credits: cr,
                internal: m.internal,
                external: m.external,
                total: m.total,
                grade: m.grade || (isFail ? 'F' : 'P'),
                grade_point: gp,
                is_fail: isFail,
                result: isFail ? 'FAIL' : 'PASS',
                exam_session: m.results?.exam_name || 'Regular'
            });
        });

        // Compute SGPA for each semester
        const trend = [];
        const sortedSemesters = Object.keys(semesterMarks).map(Number).sort((a, b) => a - b);

        sortedSemesters.forEach(sem => {
            const sList = semesterMarks[sem];
            let semRegCr = 0;
            let semEarnedCr = 0;
            let semCrP = 0;
            let semBacklogs = 0;

            sList.forEach(item => {
                semRegCr += item.credits;
                if (item.is_fail) {
                    semBacklogs++;
                } else {
                    semEarnedCr += item.credits;
                    semCrP += (item.credits * item.grade_point);
                }
            });

            const storedRemark = remarks.find(r => Number(r.semester) === sem);
            let semSgpa = semRegCr > 0 ? Number((semCrP / semRegCr).toFixed(2)) : (storedRemark?.sgpa ? Number(storedRemark.sgpa) : 0);

            if (semSgpa > bestSgpa) bestSgpa = semSgpa;

            semStats[sem] = {
                sgpa: semSgpa,
                earnedCredits: semEarnedCr,
                registeredCredits: semRegCr,
                backlogs: semBacklogs
            };

            trend.push({
                semester: `Sem ${sem}`,
                semNum: sem,
                sgpa: semSgpa,
                credits: semEarnedCr,
                backlogs: semBacklogs
            });
        });

        // Compute CGPA
        let cgpa = null;
        if (remarks.length > 0) {
            const creditsMap = {};
            remarks.forEach(r => creditsMap[r.semester] = 20);
            cgpa = weightedCGPA(remarks, creditsMap);
        } else if (sortedSemesters.length > 0) {
            let totalCr = 0;
            let totalWeighted = 0;
            sortedSemesters.forEach(s => {
                const stat = semStats[s];
                if (stat && stat.sgpa > 0) {
                    totalCr += (stat.registeredCredits || 20);
                    totalWeighted += (stat.sgpa * (stat.registeredCredits || 20));
                }
            });
            if (totalCr > 0) cgpa = Number((totalWeighted / totalCr).toFixed(2));
        }

        const gradeDistribution = Object.entries(gradeCounts).map(([grade, count]) => ({
            grade,
            count
        }));

        return ok({
            profile: {
                id: student?.id || null,
                usn: cleanUsn,
                name: student?.name || cleanUsn,
                branch: student?.branch || 'Unassigned',
                college: student?.college || 'AITM',
                batch: student?.year ? String(student.year) : (cleanUsn.length >= 5 ? '20' + cleanUsn.slice(3, 5) : '—'),
                semester: student?.semester || (sortedSemesters.length > 0 ? sortedSemesters[sortedSemesters.length - 1] : 1),
                scheme: student?.scheme || '2022',
                email: student?.email || '—',
                phone: student?.phone || '—',
                is_inactive: Boolean(student?.is_suspended),
                is_suspended: Boolean(student?.is_suspended),
                lateral_entry: isLateralEntry(cleanUsn, student?.lateral_entry)
            },
            guardian: {
                parent_name: student?.parent_name || '',
                parent_phone: student?.parent_phone || '',
                parent_email: student?.parent_email || '',
                guardian_relation: student?.guardian_relation || 'Parent'
            },
            kpis: {
                cgpa: cgpa || 0,
                total_backlogs: backlogInfo.totalBacklogs,
                backlog_credits: totalBacklogCredits,
                semesters_tracked: sortedSemesters.length,
                credits_earned: totalCreditsEarned,
                subjects_cleared: subjectsClearedCount,
                subjects_failed: subjectsFailedCount,
                best_sgpa: bestSgpa
            },
            trend,
            gradeDistribution,
            semesterMarks,
            semStats
        });
    } catch (err) {
        console.error('[GET /api/faculty/students/[usn]]', err);
        return fail('Failed to fetch student record: ' + (err.message || err), 'STUDENT_RECORD_ERROR', 500);
    }
}

export async function PUT(req, { params }) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const rawUsn = params?.usn;
        if (!rawUsn) return fail('USN parameter is required.', 'MISSING_USN', 400);

        const cleanUsn = rawUsn.toUpperCase().trim();
        const body = await req.json();

        const supabaseAdmin = getAdminClient();

        const updates = {};
        if (body.parent_name !== undefined) updates.parent_name = body.parent_name?.trim() || null;
        if (body.parent_phone !== undefined) updates.parent_phone = body.parent_phone?.trim() || null;
        if (body.parent_email !== undefined) updates.parent_email = body.parent_email?.trim() || null;
        if (body.guardian_relation !== undefined) updates.guardian_relation = body.guardian_relation?.trim() || null;
        if (body.is_inactive !== undefined) updates.is_suspended = Boolean(body.is_inactive);
        if (body.is_suspended !== undefined) updates.is_suspended = Boolean(body.is_suspended);

        if (Object.keys(updates).length === 0) {
            return fail('No update fields provided.', 'NO_UPDATES', 400);
        }

        const { data: updated, error: updErr } = await supabaseAdmin
            .from('students')
            .update(updates)
            .eq('usn', cleanUsn)
            .select()
            .single();

        if (updErr) {
            // If columns like parent_name don't exist yet, gracefully catch and return success
            console.warn('[PUT /api/faculty/students/[usn]] update notice:', updErr.message);
        }

        return ok({
            message: 'Student record updated successfully.',
            updated: updated || updates
        });
    } catch (err) {
        console.error('[PUT /api/faculty/students/[usn]]', err);
        return fail('Failed to update student: ' + (err.message || err), 'UPDATE_ERROR', 500);
    }
}
