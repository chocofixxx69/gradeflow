import { createHash, timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const ADMIN_PASSWORD_SALT = 'vtu_calc_secure_2026';
let supabaseAdmin = null;

function getSupabaseAdmin() {
    if (supabaseAdmin) return supabaseAdmin;

    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Supabase admin credentials are not configured.');
    }

    supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    return supabaseAdmin;
}

function hashAdminPassword(password) {
    return createHash('sha256').update(`${password}${ADMIN_PASSWORD_SALT}`).digest('hex');
}

function safeCompare(a, b) {
    const left = Buffer.from(String(a || ''), 'hex');
    const right = Buffer.from(String(b || ''), 'hex');
    return left.length === right.length && timingSafeEqual(left, right);
}

function getBasicCredentials(req) {
    const header = req.headers.get('authorization') || '';
    if (!header.startsWith('Basic ')) return null;

    try {
        const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
        const separator = decoded.indexOf(':');
        if (separator < 1) return null;

        return {
            email: decoded.slice(0, separator).trim().toLowerCase(),
            password: decoded.slice(separator + 1),
        };
    } catch {
        return null;
    }
}

async function requireVerifiedAdmin(req) {
    const credentials = getBasicCredentials(req);
    if (!credentials?.email || !credentials.password) {
        return {
            error: NextResponse.json(
                { error: 'Admin authentication required.' },
                { status: 401, headers: { 'WWW-Authenticate': 'Basic realm="GradeFlow Admin"' } }
            ),
        };
    }

    const supabase = getSupabaseAdmin();
    const { data: admin, error } = await supabase
        .from('admin_users')
        .select('id, email, password_hash')
        .eq('email', credentials.email)
        .maybeSingle();

    if (error) throw error;

    const incomingHash = hashAdminPassword(credentials.password);
    if (!admin?.password_hash || !safeCompare(incomingHash, admin.password_hash)) {
        return {
            error: NextResponse.json({ error: 'Admin authentication failed.' }, { status: 403 }),
        };
    }

    return { admin };
}

async function logAdminDeletion(admin, usn) {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('audit_logs').insert({
        faculty_id: admin.id,
        faculty_name: admin.email,
        faculty_email: admin.email,
        action_type: 'ADMIN_DELETE_STUDENT',
        entity_type: 'student',
        entity_id: usn,
        old_values: null,
        new_values: null,
        metadata: {
            usn,
            admin_id: admin.id,
            source: 'api/admin/delete-student',
            timestamp: new Date().toISOString(),
        },
    });

    if (error) {
        console.error('Admin delete audit log failed:', error);
    }
}

export async function POST(req) {
    try {
        const { admin, error: authError } = await requireVerifiedAdmin(req);
        if (authError) return authError;

        const supabase = getSupabaseAdmin();
        const { usn } = await req.json();

        if (!usn) {
            return NextResponse.json({ error: 'USN is required' }, { status: 400 });
        }

        const cleanUSN = usn.toUpperCase().trim();

        // 1. Manually clean up un-linked or loosely linked data by USN if needed
        await supabase.from('scraper_jobs').delete().eq('usn', cleanUSN);

        // 2. Delete the primary student record.
        // DATABASE CASCADE will handle: marks, academic_remarks, results (and its subject_marks), and documents.
        const { error } = await supabase
            .from('students')
            .delete()
            .eq('usn', cleanUSN);

        if (error) throw error;

        await logAdminDeletion(admin, cleanUSN);

        return NextResponse.json({ success: true, message: `All data for ${cleanUSN} deleted.` });
    } catch (err) {
        console.error('Delete Error:', err);
        return NextResponse.json({ error: 'Failed to delete student.' }, { status: 500 });
    }
}
