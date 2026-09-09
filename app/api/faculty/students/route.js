import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, weightedCGPA, fetchDynamicMarks } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, matchesBranch, isLateralEntry } from '@/lib/semester-utils';
import { calculateAcademicRecord } from '@/lib/vtuAcademicEngine';
import { fetchCatalogIndex } from '@/lib/subjectCreditResolver';
import { filterAndRankStudents } from '@/lib/search-utils';

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
        const section = (searchParams.get('section') || 'all').trim().toUpperCase();
        const classId = searchParams.get('classId') || '';
        const search = (searchParams.get('search') || '').trim().toLowerCase();
        const status = searchParams.get('status') || 'all'; // 'all' | 'active' | 'inactive'
        const backlogsFilter = searchParams.get('backlogsFilter') || 'all'; // 'all' | 'clear' | 'backlogs'

        const cacheKey = `students_dir:${page}:${limit}:${branch}:${semester || 'all'}:${batch}:${section}:${classId}:${search}:${status}:${backlogsFilter}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch classes & class_students for dynamic section resolution
        const [
            { data: rawClasses },
            { data: rawClassStudents }
        ] = await Promise.all([
            supabaseAdmin.from('classes').select('id, name, branch, semester, section, batch'),
            supabaseAdmin.from('class_students').select('class_id, usn')
        ]);

        const classById = new Map((rawClasses || []).map(c => [c.id, c]));
        const usnToClassMap = new Map();
        (rawClassStudents || []).forEach(cs => {
            const c = classById.get(cs.class_id);
            if (c) {
                const existing = usnToClassMap.get(cs.usn);
                if (!existing || (!existing.section && c.section)) {
                    usnToClassMap.set(cs.usn, {
                        classId: c.id,
                        className: c.name,
                        section: (c.section || '').toUpperCase().trim(),
                        batch: c.batch,
                        semester: c.semester,
                        branch: c.branch
                    });
                }
            }
        });

        const availableSections = Array.from(new Set(
            (rawClasses || []).map(c => (c.section || '').toUpperCase().trim()).filter(Boolean)
        )).sort();

        // 2. Build dynamic query for students without arbitrary caps
        let allStudents = [];
        let from = 0;
        const pageSize = 1000;
        while (true) {
            let q = supabaseAdmin
                .from('students')
                .select('id, usn, name, branch, semester, year, email, phone, is_suspended, lateral_entry, created_at, scheme')
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

        // 3. Client-side filter for branch, batch, section & text search
        if (branch && branch !== 'ALL') {
            students = students.filter(s => matchesBranch(s, branch));
        }

        if (batch && batch !== 'all') {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        if (section && section !== 'ALL') {
            if (section === 'UNASSIGNED') {
                students = students.filter(s => !usnToClassMap.has(s.usn));
            } else {
                students = students.filter(s => {
                    const info = usnToClassMap.get(s.usn);
                    return info && info.section === section;
                });
            }
        }

        if (classId) {
            students = students.filter(s => {
                const info = usnToClassMap.get(s.usn);
                return info && info.classId === classId;
            });
        }

        if (search) {
            // Attach section and class info for multi-field search evaluation
            const searchableStudents = students.map(s => {
                const info = usnToClassMap.get(s.usn);
                return {
                    ...s,
                    section: info?.section || '',
                    className: info?.className || ''
                };
            });
            students = filterAndRankStudents(searchableStudents, search);
        }

        // Helper function to enrich student records with live CGPA, backlogs &
        // section using the canonical academic engine (lib/vtuAcademicEngine.js)
        // — the same SGPA/CGPA/backlog/credit source the Student Lookup dashboard
        // uses, so this directory never shows a different CGPA for the same
        // student. This used to hand-roll its own CGPA using a credit resolver
        // that trusted the (sometimes stale) subject_marks.credits column.
        const catalogIndex = await fetchCatalogIndex(supabaseAdmin);

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

            return Promise.all(targetStudents.map(async s => {
                const uMarks = marksByUsn.get(s.usn) || [];
                const uRemarks = remarksByUsn.get(s.usn) || [];

                const record = await calculateAcademicRecord(
                    uMarks,
                    { usn: s.usn, branch: s.branch, scheme: s.scheme },
                    { catalogIndex }
                );

                let cgpa = record.cgpa > 0 ? record.cgpa : null;
                if (cgpa === null && uRemarks.length > 0) {
                    const creditsMap = {};
                    uRemarks.forEach(r => creditsMap[r.semester] = 20);
                    cgpa = weightedCGPA(uRemarks, creditsMap);
                }

                const classInfo = usnToClassMap.get(s.usn);

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
                    section: classInfo?.section || null,
                    className: classInfo?.className || null,
                    classId: classInfo?.classId || null,
                    cgpa,
                    total_backlogs: record.totalActiveBacklogs,
                    backlog_credits: record.activeBacklogSubjects.reduce((sum, sub) => sum + (sub.credits || 0), 0),
                    failedSubjects: record.activeBacklogSubjects.map(f => f.subjectCode)
                };
            }));
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
            },
            meta: {
                sections: availableSections
            }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/students]', err);
        return fail('Failed to fetch students directory: ' + (err.message || err), 'STUDENTS_DIRECTORY_ERROR', 500);
    }
}
