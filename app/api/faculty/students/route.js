import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs, weightedCGPA, fetchDynamicMarks } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, matchesBranch, isLateralEntry } from '@/lib/semester-utils';
import { resolveSubjectCredits } from '@/lib/export-utils';

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
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)));
        const branch = (searchParams.get('branch') || '').toUpperCase().trim();
        const semester = searchParams.get('semester') && searchParams.get('semester') !== 'all' 
            ? parseInt(searchParams.get('semester'), 10) 
            : null;
        const batch = searchParams.get('batch') || '';
        const search = (searchParams.get('search') || '').trim().toLowerCase();
        const status = searchParams.get('status') || 'all'; // 'all' | 'active' | 'inactive'
        const backlogsFilter = searchParams.get('backlogsFilter') || 'all'; // 'all' | 'clear' | 'backlogs'

        const cacheKey = `students_dir:${page}:${limit}:${branch}:${semester || 'all'}:${batch}:${search}:${status}:${backlogsFilter}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Build dynamic query for students without arbitrary caps
        let allStudents = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
            let q = supabaseAdmin
                .from('students')
                .select('id, usn, name, branch, semester, year, email, phone, is_suspended, lateral_entry, created_at')
                .order('usn', { ascending: true });

            if (semester) {
                q = q.eq('semester', semester);
            }

            if (status === 'active') {
                q = q.or('is_suspended.is.null,is_suspended.eq.false');
            } else if (status === 'inactive') {
                q = q.eq('is_suspended', true);
            }

            q = q.range(from, from + pageSize - 1);
            const { data, error } = await q;
            if (error) throw error;
            if (data && data.length > 0) allStudents.push(...data);
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }

        let students = allStudents;

        // 2. Client-side filter for branch, batch & text search
        if (branch && branch !== 'ALL') {
            students = students.filter(s => matchesBranch(s, branch));
        }

        if (batch && batch !== 'all') {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        if (search) {
            students = students.filter(s => 
                (s.usn && s.usn.toLowerCase().includes(search)) ||
                (s.name && s.name.toLowerCase().includes(search)) ||
                (s.email && s.email.toLowerCase().includes(search))
            );
        }

        // Helper function to enrich student records with live CGPA and backlogs
        const enrichList = async (targetStudents) => {
            const usns = targetStudents.map(s => s.usn);
            if (usns.length === 0) return [];

            const [marksData, { data: remarksData }] = await Promise.all([
                fetchDynamicMarks(supabaseAdmin, { usns }),
                supabaseAdmin
                    .from('academic_remarks')
                    .select('student_usn, semester, sgpa')
                    .in('student_usn', usns)
            ]);

            const marksByUsn = new Map();
            (marksData || []).forEach(m => {
                const list = marksByUsn.get(m.usn) || [];
                list.push(m);
                marksByUsn.set(m.usn, list);
            });

            const remarksByUsn = new Map();
            (remarksData || []).forEach(r => {
                const list = remarksByUsn.get(r.student_usn) || [];
                list.push(r);
                remarksByUsn.set(r.student_usn, list);
            });

            return targetStudents.map(s => {
                const uMarks = marksByUsn.get(s.usn) || [];
                const uRemarks = remarksByUsn.get(s.usn) || [];

                const backlogInfo = computeBacklogs(uMarks);
                const backlogCredits = backlogInfo.failedSubjects.reduce((sum, sub) => sum + (sub.credits || 3), 0);

                let cgpa = null;
                if (uRemarks.length > 0) {
                    const creditsMap = {};
                    uRemarks.forEach(r => creditsMap[r.semester] = 20);
                    cgpa = weightedCGPA(uRemarks, creditsMap);
                } else if (uMarks.length > 0) {
                    const semGroups = {};
                    uMarks.forEach(m => {
                        const sem = m.semester || 1;
                        (semGroups[sem] ||= []).push(m);
                    });
                    let totalCr = 0;
                    let totalPoints = 0;
                    Object.entries(semGroups).forEach(([_, sMarks]) => {
                        sMarks.forEach(m => {
                            const cr = resolveSubjectCredits(m);
                            const score = Number(m.total) || 0;
                            const gp = score >= 90 ? 10 : score >= 80 ? 9 : score >= 70 ? 8 : score >= 60 ? 7 : score >= 50 ? 6 : score >= 40 ? 4 : 0;
                            if (!backlogInfo.failedSubjects.some(fb => fb.subject_code === m.subject_code)) {
                                totalCr += cr;
                                totalPoints += (cr * gp);
                            }
                        });
                    });
                    if (totalCr > 0) cgpa = Number((totalPoints / totalCr).toFixed(2));
                }

                return {
                    id: s.id,
                    usn: s.usn,
                    name: s.name || s.usn,
                    branch: s.branch || '—',
                    semester: s.semester || 1,
                    year: s.year,
                    email: s.email || '—',
                    phone: s.phone || '—',
                    is_inactive: Boolean(s.is_suspended),
                    is_suspended: Boolean(s.is_suspended),
                    lateral_entry: isLateralEntry(s.usn, s.lateral_entry),
                    cgpa,
                    total_backlogs: backlogInfo.totalBacklogs,
                    backlog_credits: backlogCredits,
                    failedSubjects: backlogInfo.failedSubjects.map(f => f.subject_code)
                };
            });
        };

        let totalStudents = students.length;
        let pagedEnriched = [];

        if (backlogsFilter === 'all') {
            // Fast path: paginate candidate students first, then enrich current page
            const startIndex = (page - 1) * limit;
            const pageStudents = students.slice(startIndex, startIndex + limit);
            pagedEnriched = await enrichList(pageStudents);
        } else {
            // Filter by backlogs: enrich all candidates and filter
            const allEnriched = await enrichList(students);
            const filtered = allEnriched.filter(s => 
                backlogsFilter === 'clear' ? s.total_backlogs === 0 : s.total_backlogs > 0
            );
            totalStudents = filtered.length;
            const startIndex = (page - 1) * limit;
            pagedEnriched = filtered.slice(startIndex, startIndex + limit);
        }

        const payload = {
            students: pagedEnriched,
            pagination: {
                total: totalStudents,
                page,
                limit,
                totalPages: Math.ceil(totalStudents / limit) || 1
            }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/students]', err);
        return fail('Failed to fetch students directory: ' + (err.message || err), 'STUDENTS_DIRECTORY_ERROR', 500);
    }
}
