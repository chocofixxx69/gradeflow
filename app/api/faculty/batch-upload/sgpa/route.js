import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient } from '../../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

const COLUMN_ALIASES = {
    usn: ['usn', 'usno', 'roll no', 'university seat number'],
    semester: ['semester', 'sem', 'semester no'],
    sgpa: ['sgpa', 'gpa', 'grade point'],
};

function findColumn(headers, aliases) {
    return headers.find(h => aliases.includes(h.trim().toLowerCase()));
}

/**
 * POST /api/faculty/batch-upload/sgpa
 * Bulk-upserts per-semester SGPA records from a faculty-uploaded spreadsheet.
 * Body: { rows: Array<Record<string, any>> } — the spreadsheet rows, parsed
 * client-side (parsing is presentational; the DB writes happen here).
 */
export async function POST(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { rows } = await req.json().catch(() => ({}));
        if (!Array.isArray(rows) || rows.length === 0) {
            return fail('No rows provided.', 'EMPTY_UPLOAD', 400);
        }

        const headers = Object.keys(rows[0]);
        const usnCol = findColumn(headers, COLUMN_ALIASES.usn);
        const semCol = findColumn(headers, COLUMN_ALIASES.semester);
        const sgpaCol = findColumn(headers, COLUMN_ALIASES.sgpa);

        if (!usnCol || !semCol || !sgpaCol) {
            return fail(`Required columns not found. Need: USN, Semester, SGPA. Found: ${headers.join(', ')}`, 'MISSING_COLUMNS', 400);
        }

        let inserted = 0, skipped = 0, errors = 0;

        for (const row of rows) {
            const usn = String(row[usnCol] || '').trim().toUpperCase();
            const semester = parseInt(row[semCol]) || 0;
            const sgpa = parseFloat(row[sgpaCol]) || 0;

            if (!usn || !semester || sgpa <= 0) { skipped++; continue; }

            const { data: student } = await supabaseAdmin
                .from('students')
                .select('id')
                .eq('usn', usn)
                .maybeSingle();

            let studentId = student?.id;

            if (!studentId) {
                const branchMatch = usn.match(/^\d[A-Z]{2}\d{2}([A-Z]{2,3})\d{3}$/);
                const branch = branchMatch ? branchMatch[1] : '';
                const { data: newStudent, error: sErr } = await supabaseAdmin
                    .from('students')
                    .insert({ usn, name: usn, branch: branch === 'CS' ? 'CSE' : branch, scheme: '2022' })
                    .select('id')
                    .single();

                if (sErr) { errors++; continue; }
                studentId = newStudent.id;
            }

            const { error: rErr } = await supabaseAdmin
                .from('academic_remarks')
                .upsert({
                    student_id: studentId,
                    student_usn: usn,
                    semester,
                    sgpa,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'student_id,semester' });

            if (rErr) errors++; else inserted++;
        }

        return ok({ inserted, skipped, errors, total: rows.length });
    } catch (err) {
        console.error('[POST /api/faculty/batch-upload/sgpa]', err);
        return fail('Batch SGPA upload failed.', 'BATCH_SGPA_ERROR', 500);
    }
}
