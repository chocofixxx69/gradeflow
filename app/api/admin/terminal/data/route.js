import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../../lib/server-session';
import { fetchAllPaginated } from '../../../../../lib/supabase-utils';
import { getAdminClient } from '../../../../../lib/analytics-data';
import { generateFormulaPassword, hashStudentPassword } from '../../../../../lib/student-auth';

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
            const [{ data: manualMarks }, { data: scrapedMarks }] = await Promise.all([
                supabaseAdmin.from('marks').select('*').eq('student_id', studentId).order('semester', { ascending: true }),
                usn
                    ? supabaseAdmin.from('subject_marks').select('*').eq('usn', usn).order('semester', { ascending: true })
                    : Promise.resolve({ data: [] })
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
            { count: marksCount },
            { data: facultyActivity },
            { data: classes }
        ] = await Promise.all([
            fetchAllPaginated('students', 'id, usn, name, branch, scheme, semester, year, lateral_entry, activated_at, is_suspended, suspended_at, suspended_reason, created_at, updated_at', supabaseAdmin, 'created_at', false),
            supabaseAdmin.from('faculty_onboarding').select('*').order('created_at', { ascending: false }),
            supabaseAdmin.from('subject_marks').select('id', { count: 'exact', head: true }),
            supabaseAdmin.from('faculty_activity').select('*').order('created_at', { ascending: false }).limit(300),
            supabaseAdmin.from('classes').select('id, name, branch, semester, section, batch, scheme, academic_year, faculty_id, created_at')
        ]);

        // Derive facultyList from facultyOnboarding to avoid duplicate query
        const facultyList = (facultyOnboarding || []).map(f => ({
            id: f.id, full_name: f.full_name, email: f.email, department: f.department
        }));

        return ok({
            students: students || [],
            facultyOnboarding: facultyOnboarding || [],
            facultyActivity: facultyActivity || [],
            facultyList,
            classes: classes || [],
            counts: {
                totalStudents: students?.length || 0,
                totalFacultyOnboarding: facultyOnboarding?.length || 0,
                totalMarksRecords: marksCount || 0,
                totalFacultyActivities: facultyActivity?.length || 0,
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

        const cleanUSN = usn.toUpperCase().trim();
        const studentName = name || cleanUSN;
        const formulaPass = generateFormulaPassword(studentName, cleanUSN);
        const passHash = await hashStudentPassword(formulaPass);

        const { data: student, error } = await supabaseAdmin
            .from('students')
            .upsert({
                usn: cleanUSN,
                name: studentName,
                branch: branch || null,
                scheme: scheme || '2022',
                semester: semester || 1,
                password_hash: passHash,
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

