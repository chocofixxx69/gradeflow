import { NextResponse } from 'next/server';
import { getAdminClient, invalidateAnalyticsCache } from '../../../../lib/analytics-data';
import { requireStaff } from '../../../../lib/server-session';
import { logFacultyActivityServer } from '../../../../lib/server-audit';
import { invalidateTableCache } from '../../../../lib/table-cache';
import { invalidateStudentRecords } from '../../../../lib/student-record';
import { clearServerCache } from '../../../../lib/server-cache';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

export async function POST(req) {
    const { session, error: authError } = requireStaff(req);
    if (authError) return authError;

    try {
        const body = await req.json().catch(() => ({}));
        const { source_class_id, target_class_id, usns: rawUsns, mode = 'move', transfer_all = false } = body || {};

        if (!target_class_id) {
            return NextResponse.json({ error: 'Target destination class is required.' }, { status: 400 });
        }
        if (source_class_id && source_class_id === target_class_id) {
            return NextResponse.json({ error: 'Source and destination classes cannot be the same.' }, { status: 400 });
        }

        // 1. Fetch Target & Source Class Metadata
        const [{ data: targetClass, error: targetErr }, { data: sourceClass, error: sourceErr }] = await Promise.all([
            supabaseAdmin
                .from('classes')
                .select('id, name, branch, branch_code, semester, section, batch, scheme')
                .eq('id', target_class_id)
                .maybeSingle(),
            source_class_id
                ? supabaseAdmin
                    .from('classes')
                    .select('id, name, branch, branch_code, semester, section, batch, scheme')
                    .eq('id', source_class_id)
                    .maybeSingle()
                : Promise.resolve({ data: null, error: null })
        ]);

        if (targetErr || !targetClass) {
            return NextResponse.json({ error: 'Destination class not found or invalid.' }, { status: 404 });
        }

        // 2. Resolve USNs to transfer
        let usnsToTransfer = [];

        if (transfer_all && source_class_id) {
            const { data: members, error: memErr } = await supabaseAdmin
                .from('class_students')
                .select('usn')
                .eq('class_id', source_class_id);

            if (memErr) throw memErr;
            usnsToTransfer = (members || []).map(m => m.usn.toUpperCase().trim());
        } else if (Array.isArray(rawUsns) && rawUsns.length > 0) {
            usnsToTransfer = rawUsns.map(u => String(u).toUpperCase().trim()).filter(Boolean);
        } else if (typeof rawUsns === 'string' && rawUsns.trim()) {
            usnsToTransfer = [rawUsns.toUpperCase().trim()];
        }

        if (usnsToTransfer.length === 0) {
            return NextResponse.json({ error: 'No student USNs selected for transfer.' }, { status: 400 });
        }

        // Deduplicate
        usnsToTransfer = Array.from(new Set(usnsToTransfer));

        // 3. Realign (move only) + insert into target + remove from source —
        // all inside transfer_class_students(), one DB transaction. If the
        // insert is rejected (e.g. the strict membership trigger catches
        // something unexpected on a 'copy'), the whole call rolls back,
        // including any profile realignment — no partial state is possible.
        const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc('transfer_class_students', {
            p_usns: usnsToTransfer,
            p_source_class_id: source_class_id || null,
            p_target_class_id: target_class_id,
            p_mode: mode,
            p_added_by: session?.email || session?.id || 'Faculty Transfer'
        });

        if (rpcErr) {
            console.error('[POST /api/class-students/transfer] rpc error:', rpcErr);
            return NextResponse.json({
                error: `Could not transfer student(s) to "${targetClass.name}": ${rpcErr.message || 'Database error during class enrollment.'}`
            }, { status: 400 });
        }

        const newTargetCount = rpcResult?.added_to_target ?? 0;
        const removedCount = rpcResult?.removed_from_source ?? 0;

        // 4. Invalidate all institutional in-memory & whole-table caches
        // This guarantees that Class Roster, Students Directory, Result Sheets,
        // Rankings, Backlogs, Comparison, and Hall Tickets immediately reflect the transfer.
        invalidateTableCache();
        invalidateAnalyticsCache();
        invalidateStudentRecords();
        clearServerCache();

        // 5. Audit log in faculty_activity
        logFacultyActivityServer(req, {
            action_type: 'CLASS_STUDENTS_TRANSFER',
            context_module: 'Faculty Portal > Classes > Section Roster',
            reason: 'Departmental student section reallocation or class re-balancing.',
            details: `Transferred ${usnsToTransfer.length} student(s) (${mode.toUpperCase()}) from "${sourceClass?.name || 'source'}" to "${targetClass.name}"`,
            metadata: {
                source_class_id,
                source_class_name: sourceClass?.name,
                target_class_id,
                target_class_name: targetClass.name,
                count: usnsToTransfer.length,
                mode,
                sampleUsns: usnsToTransfer.slice(0, 10)
            }
        }).catch(() => {});

        return NextResponse.json({
            success: true,
            transferred_count: usnsToTransfer.length,
            added_to_target: newTargetCount,
            removed_from_source: mode === 'move' ? removedCount : 0,
            target_class_name: targetClass.name,
            mode
        });
    } catch (err) {
        console.error('[POST /api/class-students/transfer]', err);
        return NextResponse.json({ error: 'Failed to transfer student(s).' }, { status: 500 });
    }
}
