import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents } from '@/lib/analytics-data';
import { matchesBatch, matchesBranch } from '@/lib/semester-utils';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const classId = (searchParams.get('class_id') || '').trim();
        const branch = (searchParams.get('branch') || '').toUpperCase().trim();
        const batch = (searchParams.get('batch') || '').trim();
        const semester = searchParams.get('semester') ? parseInt(searchParams.get('semester'), 10) : null;
        const search = (searchParams.get('search') || '').trim().toLowerCase();

        const supabaseAdmin = getAdminClient();

        // ── Class mode ────────────────────────────────────────────────────────
        // A hall ticket cohort is a class, so when a class is chosen its roster
        // is the answer outright: no branch/batch guessing, and no chance of
        // pulling in a student who is not actually in that class.
        if (classId) {
            const { data: roster, error: rErr } = await supabaseAdmin
                .from('class_roster')
                .select('student_id, usn, student_name, student_branch, student_branch_label, student_semester, class_name, class_branch, class_semester, class_scheme, section, batch, academic_year, is_suspended, semester_mismatch')
                .eq('class_id', classId)
                .order('usn', { ascending: true });

            if (rErr) throw rErr;

            let students = (roster || [])
                .filter(r => !r.is_suspended)
                .map(r => ({
                    id: r.student_id,
                    usn: r.usn,
                    name: r.student_name,
                    // Canonical code and its official label - never the raw
                    // free-text branch, which is spelled inconsistently.
                    branch: r.student_branch,
                    branch_code: r.student_branch,
                    branch_label: r.student_branch_label,
                    semester: r.student_semester,
                    semester_mismatch: r.semester_mismatch,
                }));

            if (search) {
                students = students.filter(s =>
                    (s.usn && s.usn.toLowerCase().includes(search)) ||
                    (s.name && s.name.toLowerCase().includes(search))
                );
            }

            const first = (roster || [])[0];
            return ok({
                students,
                total: students.length,
                mode: 'class',
                class: first ? {
                    id: classId,
                    name: first.class_name,
                    branch_code: first.class_branch,
                    semester: first.class_semester,
                    scheme: first.class_scheme,
                    section: first.section,
                    batch: first.batch,
                    academic_year: first.academic_year,
                } : { id: classId },
                filtersApplied: { classId, search },
            });
        }

        // Fetch all active students without arbitrary pagination limits
        const rawStudents = await fetchDynamicStudents(supabaseAdmin, {
            select: 'id, usn, name, branch, semester, year, photo_url, lateral_entry, is_suspended',
            orderCol: 'usn',
            ascending: true
        });

        // Filter by branch and batch
        let students = (rawStudents || []).filter(s => !s.is_suspended);

        if (branch && branch !== 'ALL' && branch !== 'All Branches') {
            students = students.filter(s => matchesBranch(s, branch));
        }

        if (batch && batch !== 'all' && batch !== 'All Batches') {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        // The semester parameter was parsed but never applied, so a 6th-semester
        // selection still returned students from every other semester.
        if (semester) {
            students = students.filter(s => Number(s.semester) === Number(semester));
        }

        if (search) {
            students = students.filter(s =>
                (s.usn && s.usn.toLowerCase().includes(search)) ||
                (s.name && s.name.toLowerCase().includes(search))
            );
        }

        // Sort by USN ascending (e.g. 2AB23CS001 ... 2AB23CS084 ... 2AB24CS400)
        students.sort((a, b) => (a.usn || '').localeCompare(b.usn || ''));

        return ok({
            students,
            total: students.length,
            filtersApplied: { branch, batch, semester, search }
        });
    } catch (err) {
        console.error('[GET /api/faculty/hall-tickets/students]', err);
        return fail('Failed to fetch students for hall tickets: ' + (err.message || err), 'HALL_TICKETS_STUDENTS_ERROR', 500);
    }
}
