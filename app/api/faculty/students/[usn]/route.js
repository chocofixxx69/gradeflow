import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs, weightedCGPA, invalidateAnalyticsCache } from '@/lib/analytics-data';
import { scoreToGradePoint, resolveSubjectCredits } from '@/lib/export-utils';
import { isFailedSubject } from '@/lib/vtuGrades';
import { isLateralEntry, canonicalBranchCode, extractBranchFromUsn, getStudentAcademicBatch } from '@/lib/semester-utils';
import { readTable, SELECTS } from '@/lib/table-cache';
import { normalizeBranch } from '@/lib/vtuAcademicEngine';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/**
 * Build a lookup map: subject_code (uppercased) → semester number
 * from subject_catalog rows filtered by branch + scheme.
 * Used to infer semester when subject_marks.semester is NULL/0.
 *
 * Strategy (priority order):
 *   1. Exact branch match
 *   2. 'ALL' branch rows (shared/common subjects)
 *
 * We intentionally do NOT restrict to a single scheme so that backlog
 * re-attempt rows (which carry the original scheme code) still resolve.
 */
function buildCodeToSemMap(catalogRows, branch) {
    const map = new Map(); // subject_code → semester
    const normBranch = (branch || '').toUpperCase().trim();

    // Two-pass: first load ALL-branch rows (lower priority), then branch-specific (overrides)
    for (const row of (catalogRows || [])) {
        const rowBranch = (row.branch || '').toUpperCase().trim();
        if (rowBranch === 'ALL') {
            const code = (row.subject_code || '').toUpperCase().trim();
            const sem = Number(row.semester);
            if (code && sem > 0 && !map.has(code)) {
                map.set(code, sem);
            }
        }
    }
    for (const row of (catalogRows || [])) {
        const rowBranch = (row.branch || '').toUpperCase().trim();
        if (rowBranch === normBranch || rowBranch === canonicalBranchCode(normBranch)) {
            const code = (row.subject_code || '').toUpperCase().trim();
            const sem = Number(row.semester);
            if (code && sem > 0) {
                map.set(code, sem); // branch-specific overrides ALL
            }
        }
    }
    return map;
}

/**
 * Infer semester from subject code via catalog.
 * Also handles VTU elective variant codes:
 *   BCS405A → try BCS405X (same-family elective slot)
 *   BEE654B → try BXX654X (cross-department open elective slot)
 */
function inferSemester(code, codeToSemMap) {
    if (!code || !codeToSemMap) return null;
    const c = code.toUpperCase().trim();

    // Exact match
    if (codeToSemMap.has(c)) return codeToSemMap.get(c);

    // Variant ending in letter: BCS405A → BCS405X
    const variantMatch = c.match(/^(.+\d)([A-Z])$/);
    if (variantMatch) {
        const familyKey = variantMatch[1] + 'X';
        if (codeToSemMap.has(familyKey)) return codeToSemMap.get(familyKey);
    }

    // Cross-dept elective: BEE654B → BXX654X
    const deptMatch = c.match(/^(\d*)B([A-Z]{2,4})(\d+)([A-Z])$/);
    if (deptMatch) {
        const [, lead, , digits] = deptMatch;
        const genericKey = `${lead}BXX${digits}X`;
        if (codeToSemMap.has(genericKey)) return codeToSemMap.get(genericKey);
    }

    return null;
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

        // Resolve branch from student record or USN (most authoritative)
        const studentBranch = normalizeBranch(student?.branch, cleanUsn) ||
            canonicalBranchCode(extractBranchFromUsn(cleanUsn)) || 'CS';

        // 2. Fetch subject marks, academic remarks and the subject catalog in parallel.
        //
        // The standalone `results` query that used to sit here was never read - the
        // exam name each mark needs already comes through the `results(exam_name)`
        // join below, and every SGPA on this page is computed from the marks - so it
        // was a per-page round trip for nothing.
        const [
            { data: rawMarks },
            { data: rawRemarks },
            catalogRows
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
            readTable(supabaseAdmin, 'subject_catalog', SELECTS.subject_catalog)
        ]);

        const marks = rawMarks || [];
        const remarks = rawRemarks || [];

        // Build semester-inference map from catalog
        const codeToSemMap = buildCodeToSemMap(catalogRows, studentBranch);

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
        let semesterInferredCount = 0;

        marks.forEach(m => {
            const code = (m.subject_code || '').toUpperCase().trim();

            // ── CORE FIX: infer semester from subject_catalog when NULL/0 ──
            const storedSem = Number(m.semester) || 0;
            const inferredSem = storedSem > 0 ? null : inferSemester(code, codeToSemMap);
            const sem = storedSem > 0 ? storedSem : (inferredSem || 1);
            const semesterWasInferred = storedSem === 0 && inferredSem !== null;
            if (semesterWasInferred) semesterInferredCount++;

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
                subject_code: code,
                subject_name: m.subject_name || code,
                credits: cr,
                internal: m.internal,
                external: m.external,
                total: m.total,
                grade: m.grade || (isFail ? 'F' : 'P'),
                grade_point: gp,
                is_fail: isFail,
                result: isFail ? 'FAIL' : 'PASS',
                exam_session: m.results?.exam_name || 'Regular',
                semester_inferred: semesterWasInferred   // data-quality flag for UI
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
                backlogs: semBacklogs,
                subjectCount: sList.length
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

        const cohort = getStudentAcademicBatch(cleanUsn, student?.lateral_entry, student?.year);

        return ok({
            profile: {
                id: student?.id || null,
                usn: cleanUsn,
                name: student?.name || cleanUsn,
                branch: student?.branch || 'Unassigned',
                college: student?.college || 'AITM',
                batch: cohort?.fullYear || (student?.year ? String(student.year) : (cleanUsn.length >= 5 ? '20' + cleanUsn.slice(3, 5) : '—')),
                batch_label: cohort?.label || `${student?.year || ''} Batch`,
                is_batch_overridden: Boolean(cohort?.isOverridden),
                raw_usn_batch: cohort?.rawUsnBatch || (cleanUsn.length >= 5 ? cleanUsn.slice(3, 5) : ''),
                year: student?.year || (cohort?.fullYear ? Number(cohort.fullYear) : 2023),
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
                best_sgpa: bestSgpa,
                semester_inferred_count: semesterInferredCount  // diagnostic: how many subjects had semester inferred
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
        
        if (body.year !== undefined) {
            const cleanYr = String(body.year).replace(/[^0-9]/g, '');
            if (cleanYr.length >= 2) {
                updates.year = Number(cleanYr.length === 2 ? '20' + cleanYr : cleanYr);
            }
        }
        if (body.batch !== undefined) {
            const cleanYr = String(body.batch).replace(/[^0-9]/g, '');
            if (cleanYr.length >= 2) {
                updates.year = Number(cleanYr.length === 2 ? '20' + cleanYr : cleanYr);
            }
        }
        if (body.semester !== undefined) {
            const semNum = Number(body.semester);
            if (semNum >= 1 && semNum <= 8) updates.semester = semNum;
        }
        if (body.lateral_entry !== undefined) {
            updates.lateral_entry = Boolean(body.lateral_entry);
        }
        if (body.branch !== undefined && typeof body.branch === 'string' && body.branch.trim()) {
            updates.branch = body.branch.trim();
        }
        if (body.name !== undefined && typeof body.name === 'string' && body.name.trim()) {
            updates.name = body.name.trim();
        }

        if (Object.keys(updates).length === 0) {
            return fail('No update fields provided.', 'NO_UPDATES', 400);
        }

        updates.updated_at = new Date().toISOString();

        const { data: updated, error: updErr } = await supabaseAdmin
            .from('students')
            .update(updates)
            .eq('usn', cleanUsn)
            .select()
            .single();

        if (updErr) {
            console.warn('[PUT /api/faculty/students/[usn]] update notice:', updErr.message);
        }

        // Audit log in faculty_activity
        try {
            await supabaseAdmin.from('faculty_activity').insert({
                faculty_id: session?.id || '00000000-0000-0000-0000-000000000000',
                faculty_name: session?.name || session?.email || 'Staff Member',
                target_usn: cleanUsn,
                action_type: updates.year ? 'STUDENT_BATCH_REASSIGNED' : 'STUDENT_PROFILE_UPDATED',
                details: updates.year 
                    ? `Reassigned student ${cleanUsn} to Academic Batch ${updates.year}${body.reason ? ` (Reason: ${body.reason})` : ''}` 
                    : `Updated profile details for student ${cleanUsn}`,
                sync_status: 'SUCCESS'
            });
        } catch (e) {
            // non-critical
        }

        // Every analytics page reads a cached copy of the warehouse; a student
        // mutation has to drop it or the change stays invisible for a minute.
        invalidateAnalyticsCache();

        return ok({
            message: 'Student record updated successfully.',
            updated: updated || updates
        });
    } catch (err) {
        console.error('[PUT /api/faculty/students/[usn]]', err);
        return fail('Failed to update student: ' + (err.message || err), 'UPDATE_ERROR', 500);
    }
}
