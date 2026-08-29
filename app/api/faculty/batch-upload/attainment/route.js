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
    subject: ['subject', 'subject code', 'code', 'subject_code'],
    co: ['co', 'course outcome', 'co_number', 'co_id'],
    po: ['po', 'program outcome', 'po_number', 'po_id'],
    level: ['level', 'attainment', 'attainment level', 'mapping', 'value'],
};

function findColumn(headers, aliases) {
    return headers.find(h => aliases.includes(h.trim().toLowerCase()));
}

/**
 * POST /api/faculty/batch-upload/attainment
 * Bulk-upserts CO-PO attainment mappings from a faculty-uploaded spreadsheet.
 * Body: { rows: Array<Record<string, any>> } — the spreadsheet rows, parsed
 * client-side (parsing is presentational; the DB writes happen here).
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { rows } = await req.json().catch(() => ({}));
        if (!Array.isArray(rows) || rows.length === 0) {
            return fail('No rows provided.', 'EMPTY_UPLOAD', 400);
        }

        const headers = Object.keys(rows[0]);
        const subjectCol = findColumn(headers, COLUMN_ALIASES.subject);
        const coCol = findColumn(headers, COLUMN_ALIASES.co);
        const poCol = findColumn(headers, COLUMN_ALIASES.po);
        const levelCol = findColumn(headers, COLUMN_ALIASES.level);

        if (!subjectCol || !levelCol) {
            return fail(`Required columns not found. Need at least: Subject Code, Level/Attainment. Found: ${headers.join(', ')}`, 'MISSING_COLUMNS', 400);
        }

        let inserted = 0, skipped = 0, errors = 0;

        for (const row of rows) {
            const subjectCode = String(row[subjectCol] || '').trim().toUpperCase();
            const co = coCol ? String(row[coCol] || '').trim() : null;
            const po = poCol ? String(row[poCol] || '').trim() : null;
            const level = parseFloat(row[levelCol]) || 0;

            if (!subjectCode) { skipped++; continue; }

            const { error: iErr } = await supabaseAdmin
                .from('co_po_mapping')
                .upsert({
                    subject_code: subjectCode,
                    co_number: co || null,
                    po_number: po || null,
                    attainment_level: level,
                    faculty_id: session.sub,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'subject_code,co_number,po_number' });

            // Fall back to a plain insert if the upsert conflict target doesn't exist yet
            if (iErr) {
                const { error: insErr } = await supabaseAdmin
                    .from('co_po_mapping')
                    .insert({
                        subject_code: subjectCode,
                        co_number: co || null,
                        po_number: po || null,
                        attainment_level: level,
                        faculty_id: session.sub,
                    });
                if (insErr) errors++; else inserted++;
            } else {
                inserted++;
            }
        }

        return ok({ inserted, skipped, errors, total: rows.length });
    } catch (err) {
        console.error('[POST /api/faculty/batch-upload/attainment]', err);
        return fail('Batch attainment upload failed.', 'BATCH_ATTAINMENT_ERROR', 500);
    }
}
