import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import { calculateAcademicRecord } from '../../../../lib/vtuAcademicEngine';
import { fetchCatalogIndex } from '../../../../lib/subjectCreditResolver';
import { buildStudentIdentity, LATERAL_ENTRY_SEMESTER } from '../../../../lib/vtu-identity';
import { validateUsn } from '../../../../lib/vtu-usn-validator';
import { cleanAlphanumeric } from '../../../../lib/search-utils';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data }, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    });
}
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
            const cleanUSN = cleanAlphanumeric(searchUsn).toUpperCase();

            // A malformed USN is answered before a single query is issued — the
            // client used to get a synthetic profile back and render an empty
            // record as if the student existed.
            const usnCheck = validateUsn(cleanUSN);
            if (!usnCheck.isValid) {
                return ok({
                    found: false,
                    reason: 'INVALID_USN',
                    usn: cleanUSN,
                    message: `Invalid USN. ${usnCheck.error || 'Expected the VTU format, e.g. 2AB23CS043.'}`,
                    suggestion: usnCheck.suggestion || null,
                    profile: null,
                    marksBySemester: {},
                    semSGPAs: {},
                    semStats: {},
                    cgpa: 0,
                    totalSubjects: 0,
                    totalActiveBacklogs: 0,
                    activeBacklogSubjects: [],
                    recentResults: [],
                    studentMarks: []
                });
            }

            const [
                { data: studentProfile },
                { data: resultMarks },
                catalogIndex
            ] = await Promise.all([
                supabaseAdmin
                    .from('students')
                    .select('*')
                    .eq('usn', cleanUSN)
                    .maybeSingle(),
                supabaseAdmin
                    .from('subject_marks')
                    .select('*, results(exam_name)')
                    .eq('usn', cleanUSN),
                // Fetch catalog on the server (admin key bypasses RLS) to avoid
                // the client trying to query it via the anon key and crashing.
                fetchCatalogIndex(supabaseAdmin)
            ]);

            const { data: studentMarks } = studentProfile?.id
                ? await supabaseAdmin.from('marks').select('*').eq('student_id', studentProfile.id)
                : { data: [] };

            const hasMarks = ((resultMarks || []).length + (studentMarks || []).length) > 0;

            // Nothing in the students table AND nothing in any marks table means the
            // USN is well-formed but unknown to this institution. Say so, rather than
            // fabricating `{ usn, name: usn }` and letting the dashboard render an
            // empty transcript that looks like a real (but blank) student.
            if (!studentProfile && !hasMarks) {
                return ok({
                    found: false,
                    reason: 'NOT_FOUND',
                    usn: cleanUSN,
                    message: `No student record found for ${cleanUSN}. Use "Fetch VTU" to pull their results from the university portal.`,
                    suggestion: null,
                    profile: null,
                    marksBySemester: {},
                    semSGPAs: {},
                    semStats: {},
                    cgpa: 0,
                    totalSubjects: 0,
                    totalActiveBacklogs: 0,
                    activeBacklogSubjects: [],
                    recentResults: [],
                    studentMarks: []
                });
            }

            const profile = studentProfile || { usn: cleanUSN, name: cleanUSN };

            // Merge all marks — identical shape as the client used to produce
            const allMarksRaw = [
                ...(studentMarks || []).map(m => ({ ...m, source: 'manual', exam_date: 'Manual Entry' })),
                ...(resultMarks || [])
                    .filter(m => (m.usn || '').toUpperCase() === cleanUSN)
                    .map(m => ({
                        ...m,
                        source: 'scraped',
                        cie_marks: m.internal,
                        see_marks: m.external,
                        total_marks: m.total,
                        announced_date: m.announced_date || (m.results?.exam_name ? String(m.results.exam_name) : 'Scraped Record')
                    }))
            ];

            // Run the canonical academic pipeline SERVER-SIDE with the admin catalog
            const record = await calculateAcademicRecord(allMarksRaw, {
                usn: cleanUSN,
                name: profile.name,
                branch: profile.branch || '',
                scheme: profile.scheme || '2022'
            }, { catalogIndex });

            // Identity is resolved against the semesters the student actually has
            // marks for, which is what separates a diploma/lateral entrant (record
            // starts at semester 3) from a re-admission carrying a 9xx serial.
            const recordedSemesters = [...new Set(
                Object.keys(record.marksBySemester || {}).map(Number).filter(Boolean)
            )].sort((a, b) => a - b);
            const identity = buildStudentIdentity(profile, recordedSemesters);
            const isLateral = identity.lateral.isLateral;

            return ok({
                found: true,
                profile: {
                    ...record.profile,
                    branchLabel: identity.branch.label,
                    section: studentProfile?.section || null,
                    email: studentProfile?.email || null,
                    phone: studentProfile?.phone || null,
                    isInactive: identity.isInactive,
                    // Batch shown to faculty is the cohort the student graduates
                    // with; a lateral entrant's USN year is one later than that.
                    batch: identity.cohort.year,
                    batchLabel: identity.cohort.label,
                    admissionBatch: identity.batch.year,
                    admissionBatchLabel: identity.batch.label,
                    currentSemester: identity.standing.current,
                    declaredSemester: identity.standing.declared,
                    recordedSemesters
                },
                // VTU lateral entry IS the diploma route — a diploma holder joins
                // directly in semester 3, so semesters 1 and 2 are "not applicable"
                // rather than "missing", and their CGPA is over 6 semesters, not 8.
                entry: {
                    isLateral,
                    entryMode: isLateral ? 'LATERAL_DIPLOMA' : 'REGULAR',
                    entryLabel: isLateral ? 'Lateral Entry (Diploma)' : 'Regular Intake',
                    qualification: isLateral ? 'Diploma' : 'PUC / 10+2',
                    firstSemester: isLateral ? LATERAL_ENTRY_SEMESTER : 1,
                    notApplicableSemesters: isLateral ? [1, 2] : [],
                    confidence: identity.lateral.confidence,
                    flagAgrees: identity.lateral.flagAgrees,
                    reasons: identity.lateral.reasons
                },
                // Pre-computed — client uses these directly, no client-side Supabase needed
                marksBySemester: record.marksBySemester,
                semSGPAs: record.semSGPAs,
                semStats: record.semStats,
                cgpa: record.cgpa,
                totalSubjects: record.totalSubjects,
                totalActiveBacklogs: record.totalActiveBacklogs,
                activeBacklogSubjects: record.activeBacklogSubjects || [],
                // Also expose raw for backwards compat
                recentResults: (resultMarks || []).filter(m => m.usn === cleanUSN),
                studentMarks: studentMarks || []
            });
        }

        const facultyId = session.sub || session.id;
        const isUuid = typeof facultyId === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(facultyId);

        let classesQuery = supabaseAdmin.from('classes').select('*');
        let assignmentsQuery = supabaseAdmin.from('faculty_subject_assignments').select('*');
        let activityQuery = supabaseAdmin.from('faculty_activity').select('*').order('created_at', { ascending: false }).limit(20);

        if (isUuid) {
            classesQuery = classesQuery.eq('faculty_id', facultyId);
            assignmentsQuery = assignmentsQuery.eq('faculty_id', facultyId);
            activityQuery = activityQuery.eq('faculty_id', facultyId);
        }

        const [
            { data: assignedClasses },
            { data: rawAssignments, error: assignedSubjectsError },
            { data: recentActivity },
            { count: studentCount }
        ] = await Promise.all([
            classesQuery,
            assignmentsQuery,
            activityQuery,
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
