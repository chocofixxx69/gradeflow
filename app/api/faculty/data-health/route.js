import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { readTable, invalidateTableCache, SELECTS } from '@/lib/table-cache';
import { fetchCatalogIndex } from '@/lib/subjectCreditResolver';
import { validateDataset } from '@/lib/data-validation';
import { configureBranchRegistry, buildBatchRegistry } from '@/lib/vtu-identity';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/**
 * Full-institution integrity sweep. Every table the academic pipeline depends on is
 * pulled whole and run through lib/data-validation.js, so what comes back describes
 * the database as it is right now rather than as the schema hopes it is.
 *
 * Held for 60 seconds because the sweep touches every row in the warehouse and the
 * answer does not change between two clicks; `?fresh=1` bypasses it.
 */
const REPORT_TTL_MS = 60_000;
let reportCache = { at: 0, promise: null };

async function buildReport(supabaseAdmin) {
    const [students, marks, results, remarks, classes, classStudents, catalog, branches, examSessions, catalogIndex] =
        await Promise.all([
            readTable(supabaseAdmin, 'students', SELECTS.students, { orderCol: 'usn' }),
            readTable(supabaseAdmin, 'subject_marks', SELECTS.subject_marks),
            readTable(supabaseAdmin, 'results', SELECTS.results),
            readTable(supabaseAdmin, 'academic_remarks', SELECTS.academic_remarks),
            readTable(supabaseAdmin, 'classes', SELECTS.classes, { orderCol: 'created_at', ascending: false }),
            readTable(supabaseAdmin, 'class_students', SELECTS.class_students),
            readTable(supabaseAdmin, 'subject_catalog', SELECTS.subject_catalog),
            supabaseAdmin.from('branches').select('code, label, usn_codes, aliases, sort_order, is_active').then(r => r.data || []),
            supabaseAdmin.from('exam_sessions').select('id, name, exam_type, academic_year').then(r => r.data || []),
            fetchCatalogIndex(supabaseAdmin).catch(() => null)
        ]);

    // The branches table is the department authority; seed the resolver from it
    // before anything resolves a branch code.
    configureBranchRegistry(branches);

    const report = validateDataset({
        students, marks, results, remarks, classes, classStudents,
        catalog, examSessions, catalogIndex
    });

    // Semesters each student has evidence for, so the batch registry can report a
    // real semester spread rather than the stale students.semester column.
    const semestersByUsn = new Map();
    for (const m of marks) {
        const u = String(m.usn || '').toUpperCase().trim();
        if (!semestersByUsn.has(u)) semestersByUsn.set(u, new Set());
        semestersByUsn.get(u).add(Number(m.semester));
    }

    return {
        ...report,
        batches: buildBatchRegistry(students, { semestersByUsn }),
        branches: branches.map(b => ({ code: b.code, label: b.label, isActive: b.is_active !== false }))
    };
}

export async function GET(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const fresh = searchParams.get('fresh') === '1';

        if (!fresh && reportCache.promise && Date.now() - reportCache.at < REPORT_TTL_MS) {
            return ok(await reportCache.promise);
        }

        const supabaseAdmin = getAdminClient();
        if (fresh) invalidateTableCache();
        const promise = buildReport(supabaseAdmin).catch(err => {
            reportCache = { at: 0, promise: null };
            throw err;
        });
        reportCache = { at: Date.now(), promise };

        return ok(await promise);
    } catch (err) {
        console.error('[GET /api/faculty/data-health]', err);
        return fail('Failed to run the data integrity sweep: ' + (err.message || err), 'DATA_HEALTH_ERROR', 500);
    }
}
