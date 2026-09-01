import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/server-session';
import { fetchCatalogIndex, resolveSubjectCredit } from '../../../../lib/subjectCreditResolver';
import { isAuditCourse, normalizeBranch, calculateAcademicRecord } from '../../../../lib/vtuAcademicEngine';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

/**
 * Institution-wide credit integrity audit. Compares every subject_marks.credits
 * value against what the live subject_catalog resolves to right now (the same
 * resolver every dashboard/PDF/report reads from) and reports drift — the
 * durable way to answer "did my catalog edit actually take effect everywhere"
 * without trusting any one cascade to have covered every case.
 *
 * GET  -> read-only report, grouped by (subject_code, semester, resolved branch).
 * POST -> applies the fix (subject_marks.credits) for every mismatch reported,
 *         then recalculates academic_remarks/results for every affected
 *         (usn, semester) using the same canonical calculateAcademicRecord
 *         pipeline the rest of the app uses. Pass { apply: true } in the body
 *         to confirm — a POST without it returns the same report as GET.
 */
async function fetchAllPaged(table, select, filterFn) {
    const all = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        let q = supabaseAdmin.from(table).select(select).range(from, from + pageSize - 1);
        if (filterFn) q = filterFn(q);
        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

async function runAudit() {
    const catalogIndex = await fetchCatalogIndex(supabaseAdmin);
    const students = await fetchAllPaged('students', 'id, usn, branch, scheme');
    const studentByUsn = new Map(students.map(s => [s.usn.toUpperCase(), s]));

    const marks = await fetchAllPaged('subject_marks', 'id, usn, semester, subject_code, credits');

    const mismatches = [];
    const unresolved = [];
    let auditCount = 0, okCount = 0;

    for (const m of marks) {
        const code = (m.subject_code || '').trim().toUpperCase();
        if (isAuditCourse(code)) { auditCount++; continue; }

        const student = studentByUsn.get((m.usn || '').toUpperCase());
        const scheme = student?.scheme || '2022';
        const branch = normalizeBranch(student?.branch, m.usn);

        const resolved = resolveSubjectCredit(catalogIndex, { scheme, branch, semester: m.semester, subject_code: code });

        if (resolved.credits === null) {
            unresolved.push({ id: m.id, usn: m.usn, semester: m.semester, subject_code: code, stored_credits: m.credits, branch });
            continue;
        }

        if (Number(resolved.credits) !== Number(m.credits)) {
            mismatches.push({ id: m.id, usn: m.usn, semester: m.semester, subject_code: code, stored_credits: m.credits, correct_credits: resolved.credits, branch, source: resolved.source });
        } else {
            okCount++;
        }
    }

    const groupsMap = new Map();
    mismatches.forEach(m => {
        const key = `${m.subject_code}|${m.semester}|${m.branch}|${m.stored_credits}|${m.correct_credits}`;
        if (!groupsMap.has(key)) {
            groupsMap.set(key, { subject_code: m.subject_code, semester: m.semester, branch: m.branch, stored_credits: m.stored_credits, correct_credits: m.correct_credits, count: 0 });
        }
        groupsMap.get(key).count++;
    });

    return {
        totalMarks: marks.length,
        ok: okCount,
        auditSkipped: auditCount,
        mismatchCount: mismatches.length,
        unresolvedCount: unresolved.length,
        groups: Array.from(groupsMap.values()).sort((a, b) => b.count - a.count),
        mismatches,
        unresolved: unresolved.slice(0, 50), // cap — full list is rarely actionable beyond the pattern
        catalogIndex, studentByUsn
    };
}

export async function GET(req) {
    const { error: authError } = requireAdmin(req);
    if (authError) return authError;

    try {
        const { groups, totalMarks, ok, auditSkipped, mismatchCount, unresolvedCount, unresolved } = await runAudit();
        return NextResponse.json({
            success: true,
            summary: { totalMarks, ok, auditSkipped, mismatchCount, unresolvedCount },
            groups,
            unresolvedSample: unresolved
        });
    } catch (err) {
        console.error('[GET /api/admin/credit-audit] Error:', err);
        return NextResponse.json({ error: err.message || 'Audit failed.' }, { status: 500 });
    }
}

export async function POST(req) {
    const { error: authError } = requireAdmin(req);
    if (authError) return authError;

    try {
        const body = await req.json().catch(() => ({}));
        const audit = await runAudit();

        if (!body?.apply) {
            return NextResponse.json({
                success: true,
                applied: false,
                summary: { totalMarks: audit.totalMarks, ok: audit.ok, auditSkipped: audit.auditSkipped, mismatchCount: audit.mismatchCount, unresolvedCount: audit.unresolvedCount },
                groups: audit.groups,
                message: 'Dry run only — POST with { "apply": true } to fix these.'
            });
        }

        const { mismatches, catalogIndex, studentByUsn } = audit;
        if (mismatches.length === 0) {
            return NextResponse.json({ success: true, applied: true, fixedRows: 0, recalculatedPairs: 0, message: 'No drift found.' });
        }

        // 1. Bulk-fix subject_marks.credits
        const chunkSize = 200;
        for (let i = 0; i < mismatches.length; i += chunkSize) {
            const chunk = mismatches.slice(i, i + chunkSize);
            await Promise.all(chunk.map(m =>
                supabaseAdmin.from('subject_marks').update({ credits: m.correct_credits }).eq('id', m.id)
            ));
        }

        // 2. Recompute affected (usn, semester) pairs via the canonical pipeline.
        const pairKey = (usn, sem) => `${usn.toUpperCase()}_${sem}`;
        const pairs = new Map();
        mismatches.forEach(m => pairs.set(pairKey(m.usn, m.semester), { usn: m.usn.toUpperCase(), semester: m.semester }));

        const usns = [...new Set([...pairs.values()].map(p => p.usn))];
        const remarksRows = [];
        const resultUpdates = [];

        for (const usn of usns) {
            const student = studentByUsn.get(usn);
            const scheme = student?.scheme || '2022';
            const semestersForUsn = [...pairs.values()].filter(p => p.usn === usn).map(p => p.semester);

            const { data: allMarksForUsn, error } = await supabaseAdmin.from('subject_marks').select('*').eq('usn', usn);
            if (error) throw error;

            const record = await calculateAcademicRecord(allMarksForUsn, { usn, branch: student?.branch, scheme }, { catalogIndex });

            for (const semester of semestersForUsn) {
                const stat = record.semStats[semester];
                if (!stat) continue;
                const backlogs = record.activeBacklogSubjects.filter(s => Number(s.semester) === Number(semester)).length;

                if (student?.id) {
                    remarksRows.push({
                        student_id: student.id,
                        student_usn: usn,
                        semester,
                        sgpa: stat.sgpa,
                        backlog_count: backlogs,
                        is_all_clear: backlogs === 0
                    });
                }
                resultUpdates.push({ usn, semester, newSgpa: stat.sgpa, tc: stat.totalCredits });
            }
        }

        if (remarksRows.length) {
            for (let i = 0; i < remarksRows.length; i += 200) {
                const chunk = remarksRows.slice(i, i + 200);
                const { error } = await supabaseAdmin.from('academic_remarks').upsert(chunk, { onConflict: 'student_id,semester' });
                if (error) throw error;
            }
        }

        const semestersInvolved = [...new Set(resultUpdates.map(r => r.semester))];
        const existingResults = await fetchAllPaged('results', 'id, usn, semester', q => q.in('usn', usns).in('semester', semestersInvolved));
        const firstResultByPair = new Map();
        existingResults.forEach(r => {
            const k = pairKey(r.usn, r.semester);
            if (!firstResultByPair.has(k)) firstResultByPair.set(k, r.id);
        });

        for (let i = 0; i < resultUpdates.length; i += 50) {
            const chunk = resultUpdates.slice(i, i + 50);
            await Promise.all(chunk.map(async ({ usn, semester, newSgpa, tc }) => {
                const id = firstResultByPair.get(pairKey(usn, semester));
                if (!id) return;
                await supabaseAdmin.from('results').update({ sgpa: newSgpa, total_credits: tc }).eq('id', id);
            }));
        }

        return NextResponse.json({
            success: true,
            applied: true,
            fixedRows: mismatches.length,
            recalculatedPairs: pairs.size,
            groups: audit.groups
        });
    } catch (err) {
        console.error('[POST /api/admin/credit-audit] Error:', err);
        return NextResponse.json({ error: err.message || 'Audit fix failed.' }, { status: 500 });
    }
}
