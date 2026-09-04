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
        const branch = (searchParams.get('branch') || '').toUpperCase().trim();
        const batch = (searchParams.get('batch') || '').trim();
        const semester = searchParams.get('semester') ? parseInt(searchParams.get('semester'), 10) : null;
        const search = (searchParams.get('search') || '').trim().toLowerCase();

        const supabaseAdmin = getAdminClient();

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
