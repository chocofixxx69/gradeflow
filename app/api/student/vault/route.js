import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStudent } from '../../../../lib/server-session';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStudent(req);
        if (authError) return authError;

        const { usn } = session;

        const { data: student } = await supabaseAdmin
            .from('students')
            .select('id, usn, name')
            .eq('usn', usn)
            .maybeSingle();

        let documents = [];
        if (student?.id) {
            const { data: docs, error: docErr } = await supabaseAdmin
                .from('documents')
                .select('*')
                .eq('student_id', student.id)
                .order('created_at', { ascending: false });

            if (!docErr && docs) {
                documents = docs;
            }
        }

        const totalUploads = documents.length;
        const totalDownloads = documents.reduce((acc, doc) => acc + (doc.downloads || 0), 0);

        return ok({
            documents,
            metadata: {
                totalUploads,
                totalDownloads,
                studentUsn: usn
            }
        });
    } catch (err) {
        console.error('[GET /api/student/vault]', err);
        return fail('Failed to fetch student vault.', 'STUDENT_VAULT_ERROR', 500);
    }
}
