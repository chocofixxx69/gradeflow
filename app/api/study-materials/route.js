import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getStaffSession } from '@/lib/server-session';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder'
);

const ALLOWED_TYPES = ['notes', 'video', 'link', 'assignment', 'other'];

function getSubjectKey(subjectCode) {
    return `study_materials:${String(subjectCode || '').trim().toUpperCase()}`;
}

// GET /api/study-materials?subject_code=1BCS301&module=1
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const subjectCode = searchParams.get('subject_code');
        const moduleNum = searchParams.get('module');

        if (!subjectCode) {
            return NextResponse.json(
                { success: false, error: { message: 'subject_code query parameter is required.' } },
                { status: 400 }
            );
        }

        const key = getSubjectKey(subjectCode);
        const { data, error } = await supabaseAdmin
            .from('system_settings')
            .select('value, updated_at, updated_by')
            .eq('key', key)
            .maybeSingle();

        if (error) throw error;

        let materials = Array.isArray(data?.value) ? data.value : [];

        if (moduleNum) {
            const m = Number(moduleNum);
            materials = materials.filter(item => Number(item.module_number) === m);
        }

        return NextResponse.json({
            success: true,
            subject_code: subjectCode.toUpperCase(),
            count: materials.length,
            materials,
            updated_at: data?.updated_at || null,
        });
    } catch (err) {
        console.error('GET /api/study-materials error:', err);
        return NextResponse.json(
            { success: false, error: { message: err.message || 'Failed to retrieve study materials.' } },
            { status: 500 }
        );
    }
}

// POST /api/study-materials
export async function POST(request) {
    try {
        // Authorize faculty or admin
        const staff = await getStaffSession(request);
        if (!staff) {
            return NextResponse.json(
                { success: false, error: { message: 'Unauthorized. Faculty or Admin credentials required.' } },
                { status: 401 }
            );
        }

        const body = await request.json();
        const {
            subject_code,
            subject_name,
            module_number,
            title,
            resource_type = 'notes',
            url,
            description = '',
            due_date = null,
        } = body || {};

        if (!subject_code || !title || !url) {
            return NextResponse.json(
                { success: false, error: { message: 'subject_code, title, and url are required.' } },
                { status: 400 }
            );
        }

        const modNum = Math.min(5, Math.max(1, Number(module_number) || 1));
        const normalizedType = ALLOWED_TYPES.includes(resource_type) ? resource_type : 'notes';

        // URL validation (http or https only)
        let parsedUrl;
        try {
            parsedUrl = new URL(url);
            if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
                throw new Error();
            }
        } catch {
            return NextResponse.json(
                { success: false, error: { message: 'Invalid URL. Only HTTP and HTTPS links are permitted.' } },
                { status: 400 }
            );
        }

        const newResource = {
            id: `mat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
            subject_code: subject_code.toUpperCase(),
            subject_name: subject_name || subject_code.toUpperCase(),
            module_number: modNum,
            title: title.trim(),
            resource_type: normalizedType,
            url: parsedUrl.toString(),
            description: String(description || '').trim(),
            due_date: due_date || null,
            author_id: staff.id || staff.faculty_id || null,
            author_name: staff.name || staff.full_name || staff.email || 'Faculty',
            author_role: staff.role || 'faculty',
            created_at: new Date().toISOString(),
        };

        const key = getSubjectKey(subject_code);

        // Fetch existing list
        const { data: existingRow, error: fetchErr } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();

        if (fetchErr) throw fetchErr;

        const currentList = Array.isArray(existingRow?.value) ? existingRow.value : [];
        const updatedList = [newResource, ...currentList];

        const { error: upsertErr } = await supabaseAdmin
            .from('system_settings')
            .upsert({
                key,
                value: updatedList,
                updated_at: new Date().toISOString(),
                updated_by: staff.email || 'Faculty',
            }, { onConflict: 'key' });

        if (upsertErr) throw upsertErr;

        return NextResponse.json({
            success: true,
            material: newResource,
            total_materials: updatedList.length,
        });
    } catch (err) {
        console.error('POST /api/study-materials error:', err);
        return NextResponse.json(
            { success: false, error: { message: err.message || 'Failed to save study material.' } },
            { status: 500 }
        );
    }
}

// DELETE /api/study-materials?subject_code=1BCS301&id=mat_123
export async function DELETE(request) {
    try {
        const staff = await getStaffSession(request);
        if (!staff) {
            return NextResponse.json(
                { success: false, error: { message: 'Unauthorized. Faculty or Admin credentials required.' } },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(request.url);
        const subjectCode = searchParams.get('subject_code');
        const id = searchParams.get('id');

        if (!subjectCode || !id) {
            return NextResponse.json(
                { success: false, error: { message: 'subject_code and id are required.' } },
                { status: 400 }
            );
        }

        const key = getSubjectKey(subjectCode);
        const { data: existingRow, error: fetchErr } = await supabaseAdmin
            .from('system_settings')
            .select('value')
            .eq('key', key)
            .maybeSingle();

        if (fetchErr) throw fetchErr;

        const currentList = Array.isArray(existingRow?.value) ? existingRow.value : [];
        const updatedList = currentList.filter(item => item.id !== id);

        const { error: updateErr } = await supabaseAdmin
            .from('system_settings')
            .update({
                value: updatedList,
                updated_at: new Date().toISOString(),
                updated_by: staff.email || 'Faculty',
            })
            .eq('key', key);

        if (updateErr) throw updateErr;

        return NextResponse.json({
            success: true,
            deleted_id: id,
            remaining_count: updatedList.length,
        });
    } catch (err) {
        console.error('DELETE /api/study-materials error:', err);
        return NextResponse.json(
            { success: false, error: { message: err.message || 'Failed to remove study material.' } },
            { status: 500 }
        );
    }
}
