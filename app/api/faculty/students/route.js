import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs, weightedCGPA } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch } from '@/lib/semester-utils';
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

        // 1. Build base query for students
        let query = supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, semester, year, email, phone, is_inactive, lateral_entry, created_at');

        if (branch && branch !== 'ALL') {
            query = query.ilike('branch', `%${branch}%`);
        }

        if (semester) {
            query = query.eq('semester', semester);
        }

        if (status === 'active') {
            query = query.or('is_inactive.is.null,is_inactive.eq.false');
        } else if (status === 'inactive') {
            query = query.eq('is_inactive', true);
        }

        const { data: rawStudents, error: stuErr } = await query;
        if (stuErr) throw stuErr;

        let students = rawStudents || [];

        // 2. Client-side filter for batch & text search (covering USN, Name, Email)
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

        const totalStudents = students.length;

        // 3. Paginate the students array
        const startIndex = (page - 1) * limit;
        const pageStudents = students.slice(startIndex, startIndex + limit);
        const pageUsns = pageStudents.map(s => s.usn);

        if (pageUsns.length === 0) {
            return ok({
                students: [],
                pagination: {
                    total: totalStudents,
                    page,
                    limit,
                    totalPages: Math.ceil(totalStudents / limit) || 1
                }
            });
        }

        // 4. Fetch subject marks and remarks for the paginated slice
        const [
            { data: marksData },
            { data: remarksData }
        ] = await Promise.all([
            supabaseAdmin
                .from('subject_marks')
                .select('usn, semester, subject_code, subject_name, internal, external, total, grade, credits, passed')
                .in('usn', pageUsns),
            supabaseAdmin
                .from('academic_remarks')
                .select('student_usn, semester, sgpa')
                .in('student_usn', pageUsns)
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

        // 5. Compute CGPA and Backlogs per student
        const enrichedStudents = pageStudents.map(s => {
            const uMarks = marksByUsn.get(s.usn) || [];
            const uRemarks = remarksByUsn.get(s.usn) || [];

            // Compute Backlogs
            const backlogInfo = computeBacklogs(uMarks);
            const backlogCredits = backlogInfo.failedSubjects.reduce((sum, sub) => sum + (sub.credits || 3), 0);

            // Compute CGPA
            let cgpa = null;
            if (uRemarks.length > 0) {
                const creditsMap = {};
                uRemarks.forEach(r => creditsMap[r.semester] = 20);
                cgpa = weightedCGPA(uRemarks, creditsMap);
            } else if (uMarks.length > 0) {
                // Group by semester
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
                is_inactive: Boolean(s.is_inactive),
                lateral_entry: Boolean(s.lateral_entry),
                cgpa,
                total_backlogs: backlogInfo.totalBacklogs,
                backlog_credits: backlogCredits,
                failedSubjects: backlogInfo.failedSubjects.map(f => f.subject_code)
            };
        });

        // Filter by backlogs if requested
        let finalStudents = enrichedStudents;
        if (backlogsFilter === 'clear') {
            finalStudents = finalStudents.filter(s => s.total_backlogs === 0);
        } else if (backlogsFilter === 'backlogs') {
            finalStudents = finalStudents.filter(s => s.total_backlogs > 0);
        }

        const payload = {
            students: finalStudents,
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
