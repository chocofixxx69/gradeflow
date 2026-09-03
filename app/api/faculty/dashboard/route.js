import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

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
                    .eq('usn', cleanUSN)
                    .maybeSingle(),
                supabaseAdmin
                    .from('subject_marks')
                    .select('*, results(exam_name)')
                    .eq('usn', cleanUSN)
            ]);

            const [{ data: studentMarks }] = await Promise.all([
                studentProfile?.id ? supabaseAdmin.from('marks').select('*').eq('student_id', studentProfile.id) : { data: [] }
            ]);

            return ok({
                profile: studentProfile || { usn: cleanUSN, name: cleanUSN },
                recentResults: (resultMarks || []).filter(m => m.usn === cleanUSN),
                studentMarks: studentMarks || []
            });
        }

        const facultyId = session.sub || session.id;

        const [
            { data: assignedClasses },
            { data: rawAssignments, error: assignedSubjectsError },
            { data: recentActivity },
            { count: studentCount }
        ] = await Promise.all([
            supabaseAdmin.from('classes').select('*').eq('faculty_id', facultyId),
            // The real, admin-managed link (app/admin/faculty-assignments) is
            // faculty_subject_assignments — a since-removed table named just
            // `faculty_assignments` used to be queried here instead, so this KPI
            // (and the dashboard's subject list) silently showed zero for every
            // faculty member regardless of what admins actually assigned.
            supabaseAdmin.from('faculty_subject_assignments').select('*').eq('faculty_id', facultyId),
            supabaseAdmin.from('faculty_activity').select('*').eq('faculty_id', facultyId).order('created_at', { ascending: false }).limit(20),
            supabaseAdmin.from('students').select('id', { count: 'exact', head: true })
        ]);

        if (assignedSubjectsError) console.error('[GET /api/faculty/dashboard] assigned subjects error:', assignedSubjectsError);

        // subject_catalog has no foreign key to faculty_subject_assignments (they
        // only share subject_code/branch/semester/scheme as plain columns) — so
        // Supabase's embedded-resource join isn't available. Resolve the display
        // name/credits manually against the catalog rows for the matching codes.
        const rawAssignments2 = rawAssignments || [];
        const assignedCodes = Array.from(new Set(rawAssignments2.map(a => a.subject_code).filter(Boolean)));
        const { data: catalogRows } = assignedCodes.length
            ? await supabaseAdmin.from('subject_catalog').select('subject_code, subject_name, credits, branch, semester, scheme').in('subject_code', assignedCodes)
            : { data: [] };

        const catalogByKey = new Map();
        (catalogRows || []).forEach(c => catalogByKey.set(`${c.subject_code}|${c.branch}|${c.semester}|${c.scheme}`, c));
        const catalogByCode = new Map();
        (catalogRows || []).forEach(c => { if (!catalogByCode.has(c.subject_code)) catalogByCode.set(c.subject_code, c); });

        const assignedSubjects = rawAssignments2.map(a => {
            const exact = catalogByKey.get(`${a.subject_code}|${a.branch}|${a.semester}|${a.scheme}`);
            const cat = exact || catalogByCode.get(a.subject_code) || null;
            return { ...a, subject_catalog: cat ? { subject_name: cat.subject_name, credits: cat.credits } : null };
        });

        return ok({
            kpis: {
                totalClasses: assignedClasses?.length || 0,
                totalSubjects: assignedSubjects?.length || 0,
                totalStudents: studentCount || 0,
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
