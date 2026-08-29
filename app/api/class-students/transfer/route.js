import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/analytics-data';
import { requireStaff } from '../../../../lib/server-session';

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

        // 1. Fetch existing members in target class to prevent duplicates
        const { data: existingInTarget } = await supabaseAdmin
            .from('class_students')
            .select('usn')
            .eq('class_id', target_class_id);

        const existingTargetSet = new Set((existingInTarget || []).map(m => m.usn.toUpperCase().trim()));
        const newUsnsForTarget = usnsToTransfer.filter(u => !existingTargetSet.has(u));

        // 2. Insert into target class
        if (newUsnsForTarget.length > 0) {
            const insertRows = newUsnsForTarget.map(u => ({
                class_id: target_class_id,
                usn: u
            }));

            for (let i = 0; i < insertRows.length; i += 100) {
                const { error: insErr } = await supabaseAdmin
                    .from('class_students')
                    .insert(insertRows.slice(i, i + 100));
                if (insErr) {
                    console.error('[POST /api/class-students/transfer] insert error:', insErr);
                }
            }
        }

        // 3. If mode === 'move', remove from source class
        let removedCount = 0;
        if (mode === 'move' && source_class_id) {
            for (let i = 0; i < usnsToTransfer.length; i += 100) {
                const chunk = usnsToTransfer.slice(i, i + 100);
                const { error: delErr } = await supabaseAdmin
                    .from('class_students')
                    .delete()
                    .eq('class_id', source_class_id)
                    .in('usn', chunk);
                if (delErr) {
                    console.error('[POST /api/class-students/transfer] delete error:', delErr);
                } else {
                    removedCount += chunk.length;
                }
            }
        }

        return NextResponse.json({
            success: true,
            transferred_count: usnsToTransfer.length,
            added_to_target: newUsnsForTarget.length,
            removed_from_source: mode === 'move' ? removedCount : 0,
            mode
        });
    } catch (err) {
        console.error('[POST /api/class-students/transfer]', err);
        return NextResponse.json({ error: 'Failed to transfer student(s).' }, { status: 500 });
    }
}
