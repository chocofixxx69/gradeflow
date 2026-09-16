import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { clearServerCache } from '@/lib/server-cache';
import { invalidateTableCache } from '@/lib/table-cache';
import { computeBatchLabel, computeBatchStanding, computeGraduatingClass } from '@/lib/vtu-identity';
import { clearSystemMetaCache } from '@/app/api/system/meta/route';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, ...data });
}

function fail(message, code = 'ERROR', status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/admin/batches
 * Lists all academic batches with live student enrollment and class counts.
 * Auth: admin only.
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError) return authError;

        const supabaseAdmin = getAdminClient();

        // 1. Fetch batches, students summary, and classes in parallel
        const [
            { data: rawBatches, error: batchErr },
            { data: rawStudents, error: stuErr },
            { data: rawClasses, error: classErr }
        ] = await Promise.all([
            supabaseAdmin.from('batches').select('*').order('year', { ascending: false }),
            supabaseAdmin.from('students').select('year, usn, is_suspended'),
            supabaseAdmin.from('classes').select('id, batch')
        ]);

        if (batchErr) throw batchErr;

        // Tally students per batch year
        const studentCounts = {};
        const activeStudentCounts = {};
        (rawStudents || []).forEach(s => {
            const yr = String(s.year || '').trim() || (s.usn && s.usn.length >= 5 ? `20${s.usn.substring(3, 5)}` : null);
            if (yr) {
                studentCounts[yr] = (studentCounts[yr] || 0) + 1;
                if (!s.is_suspended) {
                    activeStudentCounts[yr] = (activeStudentCounts[yr] || 0) + 1;
                }
            }
        });

        // Tally classes per batch
        const classCounts = {};
        (rawClasses || []).forEach(c => {
            if (c.batch) {
                const b = String(c.batch).trim();
                classCounts[b] = (classCounts[b] || 0) + 1;
            }
        });

        const curYear = new Date().getFullYear();

        const batches = (rawBatches || []).map(b => {
            const yr = String(b.year).trim();
            return {
                ...b,
                year: yr,
                standing: computeBatchStanding(yr, curYear),
                graduatingClass: computeGraduatingClass(yr),
                studentCount: studentCounts[yr] || 0,
                activeStudentCount: activeStudentCounts[yr] || 0,
                classCount: classCounts[yr] || 0
            };
        });

        return ok({ batches });
    } catch (err) {
        console.error('[GET /api/admin/batches]', err);
        return fail('Failed to load academic batches: ' + (err.message || err), 'BATCH_LOAD_ERROR', 500);
    }
}

/**
 * POST /api/admin/batches
 * Creates or provisions a new academic batch.
 * Instantly flushes both process cache and table cache so all portals see the new batch immediately.
 * Auth: admin only.
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError) return authError;

        const body = await req.json().catch(() => ({}));
        let { year, label, academic_year, default_scheme, is_active, sort_order } = body;

        year = String(year || '').trim();
        if (!year || !/^\d{4}$/.test(year)) {
            return fail('A valid 4-digit batch year is required (e.g. 2026, 2027).', 'VALIDATION_ERROR', 400);
        }

        const yNum = parseInt(year, 10);
        if (yNum < 2000 || yNum > 2100) {
            return fail('Batch year must be between 2000 and 2100.', 'VALIDATION_ERROR', 400);
        }

        label = String(label || '').trim() || computeBatchLabel(year);
        academic_year = String(academic_year || '').trim() || `${year}-${yNum + 1}`;
        default_scheme = String(default_scheme || '').trim() || (yNum >= 2025 ? '2025' : '2022');
        is_active = is_active !== false;
        sort_order = Number(sort_order ?? yNum);

        const supabaseAdmin = getAdminClient();

        const { data: newBatch, error: insertErr } = await supabaseAdmin
            .from('batches')
            .upsert({
                year,
                label,
                academic_year,
                default_scheme,
                is_active,
                sort_order
            }, { onConflict: 'year' })
            .select()
            .single();

        if (insertErr) throw insertErr;

        // Instant Cache Busting across the entire system
        clearServerCache('analytics_meta');
        invalidateTableCache('batches');
        clearSystemMetaCache();

        return ok({
            batch: newBatch,
            message: `Academic Batch ${year} (${label}) created successfully.`
        });
    } catch (err) {
        console.error('[POST /api/admin/batches]', err);
        return fail('Failed to create academic batch: ' + (err.message || err), 'BATCH_CREATE_ERROR', 500);
    }
}

/**
 * PUT /api/admin/batches
 * Updates an academic batch (e.g. toggle active status, change scheme, or edit label).
 * Auth: admin only.
 */
export async function PUT(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError) return authError;

        const body = await req.json().catch(() => ({}));
        const { year, label, academic_year, default_scheme, is_active, sort_order } = body;

        const cleanYear = String(year || '').trim();
        if (!cleanYear) {
            return fail('year is required.', 'VALIDATION_ERROR', 400);
        }

        const updates = {};
        if (label !== undefined) updates.label = String(label).trim();
        if (academic_year !== undefined) updates.academic_year = String(academic_year).trim();
        if (default_scheme !== undefined) updates.default_scheme = String(default_scheme).trim();
        if (is_active !== undefined) updates.is_active = Boolean(is_active);
        if (sort_order !== undefined) updates.sort_order = Number(sort_order);

        const supabaseAdmin = getAdminClient();

        const { data: updatedBatch, error: updateErr } = await supabaseAdmin
            .from('batches')
            .update(updates)
            .eq('year', cleanYear)
            .select()
            .single();

        if (updateErr) throw updateErr;

        // Instant Cache Busting
        clearServerCache('analytics_meta');
        invalidateTableCache('batches');
        clearSystemMetaCache();

        return ok({
            batch: updatedBatch,
            message: `Academic Batch ${cleanYear} updated successfully.`
        });
    } catch (err) {
        console.error('[PUT /api/admin/batches]', err);
        return fail('Failed to update academic batch: ' + (err.message || err), 'BATCH_UPDATE_ERROR', 500);
    }
}

/**
 * DELETE /api/admin/batches
 * Deletes or safely archives a batch.
 * Guarantees zero data loss: if any students or classes are associated, converts delete into safe archive (is_active: false).
 * Auth: admin only.
 */
export async function DELETE(req) {
    try {
        const { session, error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        let year = searchParams.get('year');
        if (!year) {
            const body = await req.json().catch(() => ({}));
            year = body?.year;
        }

        const cleanYear = String(year || '').trim();
        if (!cleanYear) {
            return fail('year parameter is required.', 'VALIDATION_ERROR', 400);
        }

        const supabaseAdmin = getAdminClient();

        // 1. Guard against data loss: check enrolled students or classes
        const [
            { count: studentCount },
            { count: classCount }
        ] = await Promise.all([
            supabaseAdmin.from('students').select('*', { count: 'exact', head: true }).eq('year', cleanYear),
            supabaseAdmin.from('classes').select('*', { count: 'exact', head: true }).eq('batch', cleanYear)
        ]);

        if ((studentCount || 0) > 0 || (classCount || 0) > 0) {
            // Safe archive: set is_active to false so existing data is completely preserved
            const { error: archiveErr } = await supabaseAdmin
                .from('batches')
                .update({ is_active: false })
                .eq('year', cleanYear);

            if (archiveErr) throw archiveErr;

            clearServerCache('analytics_meta');
            invalidateTableCache('batches');
            clearSystemMetaCache();

            return ok({
                archived: true,
                message: `Batch ${cleanYear} has ${studentCount || 0} enrolled students and ${classCount || 0} classes. Safely archived as inactive to prevent data loss.`
            });
        }

        // 2. Safe to delete if zero data attached
        const { error: delErr } = await supabaseAdmin
            .from('batches')
            .delete()
            .eq('year', cleanYear);

        if (delErr) throw delErr;

        clearServerCache('analytics_meta');
        invalidateTableCache('batches');
        clearSystemMetaCache();

        return ok({
            deleted: true,
            message: `Batch ${cleanYear} removed successfully.`
        });
    } catch (err) {
        console.error('[DELETE /api/admin/batches]', err);
        return fail('Failed to delete academic batch: ' + (err.message || err), 'BATCH_DELETE_ERROR', 500);
    }
}
