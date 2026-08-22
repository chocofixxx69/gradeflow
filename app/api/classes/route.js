import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../../lib/supabase-utils';
import { getStaffSession } from '../../../lib/server-session';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

// GET — all classes with student count and faculty info
export async function GET(req) {
    try {
        const classes = await fetchAllPaginated('classes', '*, class_students(count)', supabaseAdmin, 'created_at', false);

        // Fetch approved faculty members so all faculty and admins can see who manages each class
        const { data: facultyList } = await supabaseAdmin
            .from('faculty_onboarding')
            .select('id, full_name, email, department')
            .eq('status', 'approved')
            .order('full_name', { ascending: true });

        const facultyMap = new Map((facultyList || []).map(f => [f.id, f]));

        const result = (classes || []).map(c => {
            const fac = c.faculty_id ? facultyMap.get(c.faculty_id) : null;
            return {
                ...c,
                student_count: c.class_students?.[0]?.count ?? 0,
                faculty_name: fac?.full_name || (c.faculty_id ? 'Assigned Faculty' : 'All Faculty (Shared)'),
                faculty_email: fac?.email || null,
                faculty_department: fac?.department || null,
            };
        });

        return NextResponse.json({ success: true, classes: result, faculty: facultyList || [] });
    } catch (err) {
        console.error('[GET /api/classes]', err);
        return NextResponse.json({ error: 'Failed to fetch classes.' }, { status: 500 });
    }
}

// POST — create a new class
export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        let { name, branch, semester, scheme, faculty_id, section, batch, academic_year } = body || {};

        if (!name || !name.trim()) {
            return NextResponse.json({ error: 'Class name is required.' }, { status: 400 });
        }

        const staff = getStaffSession(req);
        if (!faculty_id || faculty_id === 'all' || faculty_id === 'shared') {
            faculty_id = staff?.sub || req.headers?.get?.('x-faculty-id') || null;
        }

        // Fallback for faculty_id if missing from client
        if (!faculty_id) {
            const { data: fac } = await supabaseAdmin.from('faculty_onboarding').select('id').eq('status', 'approved').limit(1).maybeSingle();
            faculty_id = fac?.id;
        }
        if (!faculty_id) {
            const { data: adm } = await supabaseAdmin.from('admin_users').select('id').limit(1).maybeSingle();
            faculty_id = adm?.id;
        }
        if (!faculty_id) {
            faculty_id = '00000000-0000-0000-0000-000000000000';
        }

        const { data, error } = await supabaseAdmin
            .from('classes')
            .insert({
                name: name.trim(),
                branch: branch || 'CS',
                semester: parseInt(semester) || 3,
                scheme: scheme || '2022',
                faculty_id,
                section: section ? section.trim().toUpperCase() : null,
                batch: batch || null,
                academic_year: academic_year || null,
            })
            .select()
            .single();

        if (error) {
            console.error('[POST /api/classes] Supabase error:', error);
            return NextResponse.json({ error: error.message || 'Failed to create class in database.' }, { status: 500 });
        }

        return NextResponse.json({ success: true, class: data });
    } catch (err) {
        console.error('[POST /api/classes]', err);
        return NextResponse.json({ error: err.message || 'Failed to create class.' }, { status: 500 });
    }
}

// PUT — update a class
export async function PUT(req) {
    try {
        const { id, name, semester, section, batch, academic_year } = await req.json().catch(() => ({}));
        if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

        const updates = {};
        if (name?.trim()) updates.name = name.trim();
        if (semester !== undefined && semester !== null) updates.semester = parseInt(semester);
        if (section !== undefined) updates.section = section || null;
        if (batch !== undefined) updates.batch = batch || null;
        if (academic_year !== undefined) updates.academic_year = academic_year || null;

        if (Object.keys(updates).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });

        const { data, error } = await supabaseAdmin
            .from('classes')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return NextResponse.json({ success: true, class: data });
    } catch (err) {
        console.error('[PUT /api/classes]', err);
        return NextResponse.json({ error: 'Failed to update class.' }, { status: 500 });
    }
}

// DELETE — delete a class
export async function DELETE(req) {
    try {
        const { id } = await req.json().catch(() => ({}));
        if (!id) return NextResponse.json({ error: 'Class ID required.' }, { status: 400 });

        const { error } = await supabaseAdmin.from('classes').delete().eq('id', id);
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/classes]', err);
        return NextResponse.json({ error: 'Failed to delete class.' }, { status: 500 });
    }
}
