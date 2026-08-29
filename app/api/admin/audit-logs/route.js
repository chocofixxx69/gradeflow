import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/admin/audit-logs
 * Paginated audit trail of admin/faculty actions.
 * Auth: admin only (requireAdmin).
 * Query: ?limit=50&offset=0&action_type=ADMIN_DELETE_STUDENT
 */
export async function GET(req) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50', 10) || 50, 1), 200);
        const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10) || 0, 0);
        const actionType = searchParams.get('action_type');

        let query = supabaseAdmin
            .from('audit_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (actionType) query = query.eq('action_type', actionType);

        const { data, count, error } = await query;
        if (error) throw error;

        return ok({
            logs: data || [],
            count: count || 0,
            limit,
            offset,
            has_more: (offset + (data?.length || 0)) < (count || 0),
        });
    } catch (err) {
        console.error('[GET /api/admin/audit-logs]', err);
        return fail('Failed to load audit logs.', 'AUDIT_LOGS_ERROR', 500, { error: String(err?.message || err) });
    }
}
