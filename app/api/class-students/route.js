import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../lib/server-session';
import { weightedCGPA, computeBacklogs } from '../../../lib/analytics-data';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

import { fetchByChunks } from '../../../lib/supabase-utils';

// GET — students in a class, joined with their CGPA/backlog data
export async function GET(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const class_id = searchParams.get('class_id');
        if (!class_id) return NextResponse.json({ error: 'class_id required.' }, { status: 400 });

        // Get USNs in class (paginated). class_students has no added_at/added_by
        // columns — fall back to created_at for display.
        const members = await fetchByChunks('class_students', 'id, usn, created_at', 'class_id', [class_id], supabaseAdmin);

        if (!members || members.length === 0) {
            return NextResponse.json({ success: true, students: [] });
        }

        const usns = members.map(m => m.usn);

        // Fetch student profiles (paginated)
        const profiles = await fetchByChunks('students', 'usn, name, branch, semester', 'usn', usns, supabaseAdmin);

        // Fetch academic remarks (SGPA per semester) for the shared weighted-CGPA formula (paginated)
        const remarks = await fetchByChunks('academic_remarks', 'student_usn, sgpa, semester', 'student_usn', usns, supabaseAdmin);

        // Pull total_credits per student per semester from results table for weighted CGPA (paginated)
        const resultRows = await fetchByChunks('results', 'usn, semester, sgpa, total_credits', 'usn', usns, supabaseAdmin);

        // Backlogs are derived from subject_marks.is_backlog — the real source of truth
        const marks = await fetchByChunks('subject_marks', 'usn, semester, subject_code, subject_name, grade, total, is_backlog', 'usn', usns, supabaseAdmin);

        // Build a map: usn → { semester → total_credits }
        const creditsMap = {};
        (resultRows || []).forEach(r => {
            if (!creditsMap[r.usn]) creditsMap[r.usn] = {};
            // keep highest credits seen for that sem (multiple exam_urls per sem possible)
            const prev = creditsMap[r.usn][r.semester] || 0;
            creditsMap[r.usn][r.semester] = Math.max(prev, r.total_credits || 0);
        });

        // Compute CGPA per student via the shared canonical weighted formula
        const remarksByUsn = {};
        (remarks || []).forEach(r => (remarksByUsn[r.student_usn] ||= []).push(r));
        const cgpaMap = {};
        usns.forEach(usn => {
            cgpaMap[usn] = weightedCGPA(remarksByUsn[usn] || [], creditsMap[usn] || {});
        });

        // Compute backlogs per student via the shared canonical derivation
        const marksByUsn = {};
        (marks || []).forEach(m => (marksByUsn[m.usn] ||= []).push(m));
        const backlogMap = {};
        usns.forEach(usn => {
            backlogMap[usn] = computeBacklogs(marksByUsn[usn] || []).totalBacklogs;
        });

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.usn] = p; });

        const students = members.map(m => ({
            id: m.id,
            usn: m.usn,
            name: profileMap[m.usn]?.name || m.usn,
            branch: profileMap[m.usn]?.branch || '—',
            semester: profileMap[m.usn]?.semester || '—',
            cgpa: cgpaMap[m.usn] ?? null,
            total_backlogs: backlogMap[m.usn] ?? 0,
            added_at: m.created_at,
        }));

        return NextResponse.json({ success: true, students });
    } catch (err) {
        console.error('[GET /api/class-students]', err);
        return NextResponse.json({ error: 'Failed to fetch students.' }, { status: 500 });
    }
}

// POST — add student(s) to a class
export async function POST(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { class_id, usn, faculty_id } = await req.json();
        if (!class_id || !usn) return NextResponse.json({ error: 'class_id and usn required.' }, { status: 400 });

        let rawUsns = Array.isArray(usn) ? usn : [usn];
        const usns = [...new Set(rawUsns.map(u => u.toUpperCase().trim()).filter(Boolean))];

        if (usns.length === 0) return NextResponse.json({ error: 'No USNs provided.' }, { status: 400 });

        // Ensure student profiles exist (BULK OPTIMIZED) — paginate check
        const existing = await fetchByChunks('students', 'usn', 'usn', usns, supabaseAdmin);
        const existingSet = new Set((existing || []).map(e => e.usn));

        const toInsert = usns.filter(u => !existingSet.has(u)).map(u => ({ usn: u, name: u }));
        if (toInsert.length > 0) {
            // chunk the insert just in case, using upsert to avoid chunk failure
            for (let i = 0; i < toInsert.length; i += 100) {
                await supabaseAdmin.from('students')
                    .upsert(toInsert.slice(i, i + 100), { onConflict: 'usn', ignoreDuplicates: true })
                    .catch(() => { });
            }
        }

        const rows = usns.map(u => ({ class_id, usn: u, added_by: faculty_id || null }));
        let addedCount = 0;

        for (let i = 0; i < rows.length; i += 100) {
            const { data, error } = await supabaseAdmin
                .from('class_students')
                .upsert(rows.slice(i, i + 100), { onConflict: 'class_id,usn', ignoreDuplicates: true })
                .select();
            if (error) throw error;
            addedCount += data?.length || 0;
        }

        return NextResponse.json({ success: true, added: addedCount || usns.length });
    } catch (err) {
        console.error('[POST /api/class-students]', err);
        return NextResponse.json({ error: 'Failed to add student.' }, { status: 500 });
    }
}

// DELETE — remove a student from a class
export async function DELETE(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { class_id, usn } = await req.json();
        if (!class_id || !usn) return NextResponse.json({ error: 'class_id and usn required.' }, { status: 400 });

        const { error } = await supabaseAdmin
            .from('class_students')
            .delete()
            .eq('class_id', class_id)
            .eq('usn', usn.toUpperCase().trim());

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/class-students]', err);
        return NextResponse.json({ error: 'Failed to remove student.' }, { status: 500 });
    }
}
