import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { computeBacklogs, getAdminClient } from '../../../../lib/analytics-data';
import { fetchCatalogIndex, resolveSubjectCredit, buildCatalogIndex } from '../../../../lib/subjectCreditResolver';
import { isAuditCourse, normalizeBranch } from '../../../../lib/vtuAcademicEngine';
import { fetchAllPaginated } from '../../../../lib/supabase-utils';
import { canonicalBranchCode, extractBranchFromUsn } from '../../../../lib/semester-utils';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/**
 * Build a lookup: subject_code → semester from catalog rows.
 * Priority: branch-specific > ALL-branch rows.
 * Handles VTU elective variant suffixes (BCS405A → BCS405X → family sem).
 */
function buildCodeToSemMap(catalogRows, branch) {
    const normBranch = (branch || '').toUpperCase().trim();
    const map = new Map();

    // Pass 1: ALL-branch rows (lower priority)
    for (const row of (catalogRows || [])) {
        const rb = (row.branch || '').toUpperCase().trim();
        if (rb === 'ALL') {
            const code = (row.subject_code || '').toUpperCase().trim();
            const sem = Number(row.semester);
            if (code && sem > 0 && !map.has(code)) map.set(code, sem);
        }
    }
    // Pass 2: Branch-specific rows (higher priority — override ALL)
    const canonical = canonicalBranchCode(normBranch) || normBranch;
    for (const row of (catalogRows || [])) {
        const rb = (row.branch || '').toUpperCase().trim();
        if (rb === normBranch || rb === canonical) {
            const code = (row.subject_code || '').toUpperCase().trim();
            const sem = Number(row.semester);
            if (code && sem > 0) map.set(code, sem);
        }
    }
    return map;
}

function inferSemesterFromCode(code, codeToSemMap) {
    if (!code || !codeToSemMap) return null;
    const c = code.toUpperCase().trim();
    if (codeToSemMap.has(c)) return codeToSemMap.get(c);

    // Same-family elective: BCS405A → BCS405X
    const vm = c.match(/^(.+\d)([A-Z])$/);
    if (vm) {
        const fk = vm[1] + 'X';
        if (codeToSemMap.has(fk)) return codeToSemMap.get(fk);
    }

    // Cross-dept elective: BEE654B → BXX654X
    const dm = c.match(/^(\d*)B([A-Z]{2,4})(\d+)([A-Z])$/);
    if (dm) {
        const genericKey = `${dm[1]}BXX${dm[3]}X`;
        if (codeToSemMap.has(genericKey)) return codeToSemMap.get(genericKey);
    }

    return null;
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStudent(req);
        if (authError) return authError;

        const { usn } = session;

        // Fetch student profile and full catalog in parallel
        const [
            { data: student },
            catalogRows
        ] = await Promise.all([
            supabaseAdmin.from('students').select('id, scheme, branch').eq('usn', usn).maybeSingle(),
            fetchAllPaginated('subject_catalog', 'subject_code, semester, branch, scheme, credits', supabaseAdmin)
        ]);

        const studentScheme = student?.scheme || '2022';
        const studentBranch = normalizeBranch(student?.branch, usn) ||
            canonicalBranchCode(extractBranchFromUsn(usn)) || 'CS';

        // Build catalog index for credit resolution + semester inference map
        const catalogIndex = buildCatalogIndex(catalogRows || []);
        const codeToSemMap = buildCodeToSemMap(catalogRows, studentBranch);

        function resolveCredits(code, semester) {
            if (isAuditCourse(code)) return { credits: 0, source: 'audit' };
            return resolveSubjectCredit(catalogIndex, { scheme: studentScheme, branch: studentBranch, semester, subject_code: code });
        }

        const [
            { data: studentMarks },
            { data: subjectMarks },
            { data: remarks },
            { data: results }
        ] = await Promise.all([
            student?.id ? supabaseAdmin.from('marks').select('*').eq('student_id', student.id) : { data: [] },
            supabaseAdmin.from('subject_marks').select('*, results(exam_name)').eq('usn', usn),
            supabaseAdmin.from('academic_remarks').select('*').eq('student_usn', usn),
            supabaseAdmin.from('results').select('*').eq('usn', usn)
        ]);

        const allMarks = [];

        if (studentMarks) {
            studentMarks.forEach(m => {
                const code = (m.subject_code || m.code || '').trim().toUpperCase();
                const storedSem = Number(m.semester) || 0;
                const semester = storedSem > 0
                    ? storedSem
                    : (inferSemesterFromCode(code, codeToSemMap) || 1);
                const resolved = resolveCredits(code, semester);
                allMarks.push({
                    id: m.id,
                    subject_code: code,
                    subject_name: (m.subject_name || m.name || '').trim(),
                    cie_marks: m.cie_marks ?? m.internal ?? 0,
                    see_marks: m.see_marks ?? m.external ?? 0,
                    total_marks: m.total_marks ?? m.total ?? 0,
                    grade: (m.grade || '').trim().toUpperCase(),
                    credits: resolved.credits,
                    credit_source: resolved.source,
                    semester,
                    semester_inferred: storedSem === 0,
                    source: 'manual'
                });
            });
        }

        if (subjectMarks) {
            subjectMarks.forEach(m => {
                const code = (m.subject_code || m.code || '').trim().toUpperCase();
                const storedSem = Number(m.semester) || 0;
                // ── CORE FIX: infer semester from catalog when NULL/0 ──
                const semester = storedSem > 0
                    ? storedSem
                    : (inferSemesterFromCode(code, codeToSemMap) || 1);
                // Credit is always resolved fresh from subject_catalog — the stored
                // subject_marks.credits value (written once at scrape time) is never
                // trusted; see lib/subjectCreditResolver.js for why.
                const resolved = resolveCredits(code, semester);
                allMarks.push({
                    id: m.id,
                    subject_code: code,
                    subject_name: (m.subject_name || m.name || '').trim(),
                    cie_marks: m.cie_marks ?? m.internal ?? 0,
                    see_marks: m.see_marks ?? m.external ?? 0,
                    total_marks: m.total_marks ?? m.total ?? 0,
                    grade: (m.grade || '').trim().toUpperCase(),
                    credits: resolved.credits,
                    credit_source: resolved.source,
                    semester,
                    semester_inferred: storedSem === 0,
                    announced_date: m.announced_date || null,
                    exam_date: m.announced_date || m.results?.exam_name || 'N/A',
                    exam_name: m.announced_date || m.results?.exam_name || 'Scraped Record',
                    source: 'scraper',
                    is_backlog: m.is_backlog || false
                });
            });
        }

        // Group by semester
        const semesterResults = {};
        allMarks.forEach(m => {
            const sem = m.semester || 1;
            if (!semesterResults[sem]) {
                semesterResults[sem] = { semester: sem, subjects: [] };
            }
            semesterResults[sem].subjects.push(m);
        });

        const backlogs = computeBacklogs(allMarks);

        return ok({
            semesterResults: Object.values(semesterResults),
            subjectMarks: allMarks,
            academicRemarks: remarks || [],
            examResults: results || [],
            backlogData: backlogs
        });
    } catch (err) {
        console.error('[GET /api/student/results]', err);
        return fail('Failed to fetch student results.', 'STUDENT_RESULTS_ERROR', 500);
    }
}
