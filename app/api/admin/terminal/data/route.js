import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/server-session';
import { fetchAllPaginated } from '../../../../../lib/supabase-utils';
import { getAdminClient } from '../../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const studentId = searchParams.get('student_id');
        const usn = (searchParams.get('usn') || '').toUpperCase().trim();

        // If specific student_id details are requested
        if (studentId) {
            // `marks` (manually-entered, keyed by student_id) covers only a small
            // fraction of records — the vast majority of real results live in
            // `subject_marks`, populated by the VTU scraper and keyed by usn, not
            // student_id. Querying `marks` alone made this panel show "No marks
            // synced" for almost every student even though their real results exist.
            const [{ data: manualMarks }, { data: scrapedMarks }, { data: docs }] = await Promise.all([
                supabaseAdmin.from('marks').select('*').eq('student_id', studentId).order('semester', { ascending: true }),
                usn
                    ? supabaseAdmin.from('subject_marks').select('*').eq('usn', usn).order('semester', { ascending: true })
                    : Promise.resolve({ data: [] }),
                supabaseAdmin.from('documents').select('*').eq('student_id', studentId).order('created_at', { ascending: false })
            ]);

            const combinedMarks = [
                ...(manualMarks || []),
                ...(scrapedMarks || []).map(m => ({
                    ...m,
                    cie_marks: m.internal,
                    see_marks: m.external,
                    total_marks: m.total,
                })),
            ];

            return ok({
                studentId,
                marks: combinedMarks,
                documents: docs || []
            });
        }

        // Parallel fetch for full Terminal Datasets
        const [
            students,
            { data: facultyOnboarding },
            { data: marksCount },
            { data: facultyActivity },
            { data: facultyList },
            { data: documentsCount },
            { data: classes }
        ] = await Promise.all([
            fetchAllPaginated('students', '*', supabaseAdmin, 'created_at', false),
            supabaseAdmin.from('faculty_onboarding').select('*').order('created_at', { ascending: false }),
            supabaseAdmin.from('marks').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('faculty_activity').select('*').order('created_at', { ascending: false }).limit(300),
            supabaseAdmin.from('faculty_onboarding').select('id, full_name, email, department'),
            supabaseAdmin.from('documents').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('classes').select('id, name, branch, semester, section, subject_name, subject_code, faculty_id, created_at')
        ]);

        return ok({
            students: students || [],
            facultyOnboarding: facultyOnboarding || [],
            facultyActivity: facultyActivity || [],
            facultyList: facultyList || [],
            classes: classes || [],
            counts: {
                totalStudents: students?.length || 0,
                totalFacultyOnboarding: facultyOnboarding?.length || 0,
                totalMarksRecords: marksCount?.count || 0,
                totalFacultyActivities: facultyActivity?.length || 0,
                totalDocuments: documentsCount?.count || 0,
                totalClasses: classes?.length || 0,
            }
        });
    } catch (err) {
        console.error('[GET /api/admin/terminal/data]', err);
        return fail('Failed to fetch admin terminal datasets.', 'ADMIN_TERMINAL_DATA_ERROR', 500);
    }
}

export async function POST(req) {
    try {
        const { error: authError } = requireAdmin(req);
        if (authError) return authError;

        const body = await req.json();
        const { usn, name, branch, scheme, semester } = body || {};

        if (!usn) return fail('USN is required.', 'MISSING_USN', 400);

        const { data: student, error } = await supabaseAdmin
            .from('students')
            .upsert({
                usn: usn.toUpperCase().trim(),
                name: name || usn.toUpperCase().trim(),
                branch: branch || null,
                scheme: scheme || '2022',
                semester: semester || 1,
                updated_at: new Date().toISOString()
            }, { onConflict: 'usn' })
            .select()
            .single();

        if (error) throw error;

        return ok({ student });
    } catch (err) {
        console.error('[POST /api/admin/terminal/data]', err);
        return fail('Failed to upsert student.', 'ADMIN_STUDENT_UPSERT_ERROR', 500);
    }
}

