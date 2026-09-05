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
        const rawClassIds = [
            ...searchParams.getAll('class_id'),
            ...(searchParams.get('class_ids') ? searchParams.get('class_ids').split(',') : [])
        ].map(s => s.trim()).filter(Boolean);
        const classIds = Array.from(new Set(rawClassIds));

        const branch = (searchParams.get('branch') || '').toUpperCase().trim();
        const batch = (searchParams.get('batch') || '').trim();
        const semester = searchParams.get('semester') ? parseInt(searchParams.get('semester'), 10) : null;
        const search = (searchParams.get('search') || '').trim().toLowerCase();

        const supabaseAdmin = getAdminClient();

        // ── Class mode (single or multiple classes) ───────────────────────────
        // A hall ticket cohort can span one or multiple classes (e.g. CS-A and CS-B).
        // Querying class_roster ensures only authorized enrolled students are included.
        if (classIds.length > 0) {
            const { data: roster, error: rErr } = await supabaseAdmin
                .from('class_roster')
                .select('student_id, usn, student_name, student_branch, student_branch_label, student_semester, class_name, class_branch, class_semester, class_scheme, section, batch, academic_year, is_suspended, semester_mismatch, class_id')
                .in('class_id', classIds)
                .order('usn', { ascending: true });

            if (rErr) throw rErr;

            const seenUsns = new Set();
            let students = [];
            for (const r of (roster || [])) {
                if (r.is_suspended) continue;
                const cleanUsn = (r.usn || '').toUpperCase().trim();
                if (seenUsns.has(cleanUsn)) continue;
                seenUsns.add(cleanUsn);
                students.push({
                    id: r.student_id,
                    usn: r.usn,
                    name: r.student_name,
                    branch: r.student_branch,
                    branch_code: r.student_branch,
                    branch_label: r.student_branch_label,
                    semester: r.student_semester,
                    semester_mismatch: r.semester_mismatch,
                    class_id: r.class_id,
                    class_name: r.class_name,
                    section: r.section,
                });
            }

            if (search) {
                students = students.filter(s =>
                    (s.usn && s.usn.toLowerCase().includes(search)) ||
                    (s.name && s.name.toLowerCase().includes(search))
                );
            }

            students.sort((a, b) => (a.usn || '').localeCompare(b.usn || ''));

            const classesInfo = (roster || []).reduce((acc, r) => {
                if (r.class_id && !acc.some(c => c.id === r.class_id)) {
                    acc.push({
                        id: r.class_id,
                        name: r.class_name,
                        branch_code: r.class_branch,
                        semester: r.class_semester,
                        scheme: r.class_scheme,
                        section: r.section,
                        batch: r.batch,
                        academic_year: r.academic_year,
                    });
                }
                return acc;
            }, []);

            return ok({
                students,
                total: students.length,
                mode: 'class',
                class: classesInfo[0] || { id: classIds[0] },
                classes: classesInfo,
                filtersApplied: { classIds, search },
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
