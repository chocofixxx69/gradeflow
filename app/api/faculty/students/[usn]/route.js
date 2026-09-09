import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, invalidateAnalyticsCache } from '@/lib/analytics-data';
import { isLateralEntry, canonicalBranchCode, extractBranchFromUsn, getStudentAcademicBatch } from '@/lib/semester-utils';
import { readTable, SELECTS } from '@/lib/table-cache';
import { getStudentRecord, invalidateStudentRecords } from '@/lib/student-record';
import { normalizeBranch } from '@/lib/vtuAcademicEngine';
import { logFacultyActivityServer } from '@/lib/server-audit';

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

        // ── THE canonical academic record ─────────────────────────────────────
        // Every number on this page comes from lib/student-record.js — the same
        // record the faculty dashboard and the students directory read. This route
        // used to compute its own: it averaged academic_remarks at a flat 20 credits
        // per semester, which for 2AB23CS006 produced a CGPA of 7.56 from a stale
        // semester-6 SGPA of 7.56 while this very page's mark sheet showed 6.72 for
        // that semester. Nothing here recomputes anything any more.
        const record = await getStudentRecord(supabaseAdmin, cleanUsn);
        if (!record) return fail('Student not found.', 'STUDENT_NOT_FOUND', 404);

        // Exam round per mark, for the "Exam Session" column — provenance the engine
        // does not carry because it is not part of the academic calculation.
        const examByMarkId = new Map();
        for (const m of marks) if (m.id) examByMarkId.set(m.id, m.results?.exam_name || null);

        // ── Mark sheets, straight off the engine's normalised subjects ────────
        const semesterMarks = {};
        const gradeCounts = { O: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, P: 0, F: 0 };
        let semesterInferredCount = 0;

        for (const [semKey, subjects] of Object.entries(record.marksBySemester || {})) {
            const sem = Number(semKey);
            semesterMarks[sem] = (subjects || []).map(sub => {
                const g = (sub.rawGrade || sub.grade || '').toUpperCase().trim();
                if (sub.isFailed) {
                    gradeCounts.F++;
                } else if (gradeCounts[g] !== undefined) {
                    gradeCounts[g]++;
                } else if (g === 'S') {
                    gradeCounts.O++;
                } else {
                    gradeCounts.P++;
                }

                return {
                    id: sub.id,
                    subject_code: sub.subjectCode || sub.subject_code,
                    subject_name: sub.subjectName || sub.subject_name,
                    credits: sub.credits,
                    credit_source: sub.creditSource,
                    internal: sub.internal ?? sub.internalMarks,
                    external: sub.external ?? sub.seeMarks,
                    total: sub.total ?? sub.totalMarks,
                    grade: sub.grade,
                    grade_point: sub.gradePoint,
                    is_fail: sub.isFailed,
                    is_audit: sub.isAudit,
                    // A subject the catalog cannot price is excluded from the SGPA
                    // rather than guessed at; the page can say so.
                    credit_unresolved: Boolean(sub.isUnresolved),
                    result: sub.isFailed ? 'FAIL' : 'PASS',
                    exam_session: examByMarkId.get(sub.id) || 'Regular'
                };
            });
        }

        // ── Per-semester stats and the SGPA trend, from the record ────────────
        const sortedSemesters = Object.keys(record.semStats).map(Number).sort((a, b) => a - b);
        const semStats = {};
        const trend = [];
        for (const sem of sortedSemesters) {
            const st = record.semStats[sem];
            const pv = record.provenance[sem] || {};
            semStats[sem] = {
                sgpa: st.sgpa,
                earnedCredits: st.earnedCredits,
                registeredCredits: st.totalCredits,
                gradePoints: st.gradePoints,
                backlogs: st.backlogs,
                subjectCount: st.subjectCount,
                examName: pv.examName || null,
                examKind: pv.examKind || null,
                attemptCount: pv.attemptCount || 0,
                hasRevaluation: Boolean(pv.hasRevaluation),
                publishedSgpa: pv.publishedSgpa ?? null,
                sgpaDelta: pv.sgpaDelta ?? 0
            };
            trend.push({
                semester: `Sem ${sem}`,
                semNum: sem,
                sgpa: st.sgpa,
                credits: st.earnedCredits,
                backlogs: st.backlogs
            });
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
                cgpa: record.cgpa || 0,
                cgpa_source: record.cgpaSource,
                total_backlogs: record.totalActiveBacklogs,
                backlog_credits: record.backlogCredits,
                semesters_tracked: record.semestersTracked,
                credits_earned: record.totalEarnedCredits,
                credits_registered: record.totalRegisteredCredits,
                subjects_cleared: record.subjectsCleared,
                subjects_failed: record.subjectsFailed,
                best_sgpa: record.bestSgpa,
                stale_semesters: record.staleSemesters,
                unresolved_credit_subjects: record.unresolvedSubjects.length,
                semester_inferred_count: semesterInferredCount
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

        // Audit log in faculty_activity with 5W1H governance context
        let actionType = 'STUDENT_PROFILE_UPDATED';
        let detailText = `Updated academic profile for student ${cleanUsn}`;

        if (body.is_inactive !== undefined || body.is_suspended !== undefined) {
            actionType = 'STUDENT_STATUS_TOGGLED';
            detailText = `${updates.is_suspended ? 'Deactivated / Suspended' : 'Activated / Restored'} student ${cleanUsn} account`;
        } else if (updates.year) {
            actionType = 'STUDENT_BATCH_REASSIGNED';
            detailText = `Reassigned student ${cleanUsn} to Academic Batch ${updates.year}${body.reason ? ` (Reason: ${body.reason})` : ''}`;
        } else if (body.semester) {
            actionType = 'STUDENT_PROFILE_UPDATED';
            detailText = `Updated semester standing to Semester ${updates.semester} for student ${cleanUsn}${body.reason ? ` (Reason: ${body.reason})` : ''}`;
        } else if (body.parent_name || body.parent_phone || body.parent_email || body.guardian_relation) {
            actionType = 'STUDENT_PROFILE_UPDATED';
            detailText = `Updated guardian details for student ${cleanUsn} (${body.parent_name || 'Guardian'})`;
        }

        logFacultyActivityServer(req, {
            action_type: actionType,
            target_usn: cleanUsn,
            context_module: 'Faculty Portal > Student Directory > Profile Dossier',
            reason: body.reason || 'Continuous Internal Evaluation (CIE) verification and student dossier maintenance.',
            details: detailText,
            metadata: { updates, rawBody: body }
        }).catch(() => {});

        // Every analytics page reads a cached copy of the warehouse; a student
        // mutation has to drop it or the change stays invisible for a minute.
        invalidateAnalyticsCache();
        invalidateStudentRecords();

        return ok({
            message: 'Student record updated successfully.',
            updated: updated || updates
        });
    } catch (err) {
        console.error('[PUT /api/faculty/students/[usn]]', err);
        return fail('Failed to update student: ' + (err.message || err), 'UPDATE_ERROR', 500);
    }
}
