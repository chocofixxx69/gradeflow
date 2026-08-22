import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../../lib/server-session';

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
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const searchUsn = searchParams.get('search_usn');

        // If faculty searches for a specific student USN
        if (searchUsn) {
            const cleanUSN = searchUsn.toUpperCase().trim();
            const [{ data: studentProfile }, { data: resultMarks }] = await Promise.all([
                supabaseAdmin
                    .from('students')
                    .select('*')
                    .ilike('usn', cleanUSN)
                    .maybeSingle(),
                supabaseAdmin
                    .from('subject_marks')
                    .select('*, results(exam_name)')
                    .ilike('usn', cleanUSN)
            ]);

            const [{ data: studentMarks }] = await Promise.all([
                studentProfile?.id ? supabaseAdmin.from('marks').select('*').eq('student_id', studentProfile.id) : { data: [] }
            ]);

            return ok({
                profile: studentProfile || { usn: cleanUSN, name: cleanUSN },
                recentResults: resultMarks || [],
                studentMarks: studentMarks || []
            });
        }

        const facultyId = session.sub || session.id;

        const [
            { data: assignedClasses },
            { data: assignedSubjects },
            { data: recentActivity },
            { data: totalStudentsCount }
        ] = await Promise.all([
            supabaseAdmin.from('classes').select('*').eq('faculty_id', facultyId),
            supabaseAdmin.from('faculty_assignments').select('*, subject_catalog(*)').eq('faculty_id', facultyId),
            supabaseAdmin.from('faculty_activity').select('*').eq('faculty_id', facultyId).order('created_at', { ascending: false }).limit(20),
            supabaseAdmin.from('students').select('id', { count: 'exact', head: true })
        ]);

        return ok({
            kpis: {
                totalClasses: assignedClasses?.length || 0,
                totalSubjects: assignedSubjects?.length || 0,
                totalStudents: totalStudentsCount?.count || 0,
                totalActivities: recentActivity?.length || 0
            },
            assignedClasses: assignedClasses || [],
            assignedSubjects: assignedSubjects || [],
            recentActivity: recentActivity || []
        });
    } catch (err) {
        console.error('[GET /api/faculty/dashboard]', err);
        return fail('Failed to fetch faculty dashboard data.', 'FACULTY_DASHBOARD_ERROR', 500);
    }
}
