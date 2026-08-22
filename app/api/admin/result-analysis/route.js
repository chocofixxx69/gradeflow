import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../lib/server-session';
import { getResultAnalysis } from '../../../../lib/result-analysis';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/**
 * GET /api/admin/result-analysis?classId=<uuid>&examName=<optional>
 *
 * Single-request Result Analysis report for one class + one exam session:
 * context, subjects, student-wise marks, class summary, subject-wise analysis,
 * top 10, arrears analysis, and graph data — one dataset, no N+1 lookups.
 *
 * Required: classId
 * Optional: examName (defaults to the most recently scraped exam for the class)
 *
 * Auth: staff session cookie (faculty or admin). Faculty are scoped to their own
 * classes, matching the existing convention in /api/admin/analytics.
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const classId = searchParams.get('classId');
        const examName = searchParams.get('examName');

        if (!classId) {
            return fail('classId is required.', 'MISSING_CLASS_ID', 400);
        }

        if (session.role === 'faculty') {
            const { data: cls, error: classErr } = await supabaseAdmin
                .from('classes').select('faculty_id').eq('id', classId).single();
            if (classErr || !cls) return fail('Class not found.', 'CLASS_NOT_FOUND', 404);
            if (cls.faculty_id !== session.sub) return fail('Not authorized for this class.', 'FORBIDDEN', 403);
        }

        const { data, error } = await getResultAnalysis(supabaseAdmin, { classId, examName });
        if (error) return fail(error.message, error.code, error.status);

        return ok({
            ...data,
            generated_for_role: session.role,
            filters_applied: { classId, examName: examName || null },
            meta: {
                marks_source: 'subject_marks',
                faculty_mapping: 'UNKNOWN — no subject-faculty relationship exists in the schema; always null',
            },
        });
    } catch (err) {
        console.error('[GET /api/admin/result-analysis]', err);
        return fail('Failed to build result analysis.', 'RESULT_ANALYSIS_ERROR', 500, { error: String(err?.message || err) });
    }
}
