import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { isFailedSubject, resolveCanonicalGrade } from '@/lib/vtuGrades';
import { canonicalBranch } from '@/lib/vtu-identity';

export const dynamic = 'force-dynamic';

// Whole-table analytics reads can exceed Vercel's default 10s ceiling on a cold
// start; see app/api/faculty/analytics/semester-analysis/route.js for the detail.
export const maxDuration = 60;

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branchFilter = (searchParams.get('branch') || '').toUpperCase().trim();
        const semesterFilter = searchParams.get('semester') && searchParams.get('semester') !== 'all' 
            ? parseInt(searchParams.get('semester'), 10) 
            : null;
        const classFilter = (searchParams.get('classId') || '').trim();

        const cacheKey = `fac_perf:${branchFilter}:${semesterFilter || 'all'}:${classFilter || 'all'}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch faculty members, subject assignments with class info, catalog, and classes
        const [
            { data: rawFaculty },
            { data: rawAssignments },
            { data: rawSubjects },
            { data: rawClasses }
        ] = await Promise.all([
            supabaseAdmin.from('faculty_onboarding').select('id, full_name, email, department, status, designation').order('full_name', { ascending: true }),
            supabaseAdmin.from('faculty_subject_assignments').select('*, classes(id, name, branch, semester, section, batch)'),
            supabaseAdmin.from('subject_catalog').select('subject_code, subject_name, semester, branch, credits'),
            supabaseAdmin.from('classes').select('id, name, branch, semester, section, batch, class_students(count)').order('name', { ascending: true })
        ]);

        const facultyList = rawFaculty || [];
        const assignments = rawAssignments || [];
        const catalogSubjects = rawSubjects || [];
        const classesList = (rawClasses || []).map(c => ({
            ...c,
            student_count: c.class_students?.[0]?.count ?? 0
        }));

        const catalogMap = new Map();
        catalogSubjects.forEach(s => catalogMap.set(s.subject_code.toUpperCase(), s));

        // Group assignments by faculty_id
        const assignmentsByFaculty = new Map();
        assignments.forEach(a => {
            const list = assignmentsByFaculty.get(a.faculty_id) || [];
            list.push(a);
            assignmentsByFaculty.set(a.faculty_id, list);
        });

        // Fetch students enrolled in assigned classes for accurate class-level attribution
        const assignedClassIds = Array.from(new Set(assignments.map(a => a.class_id).filter(Boolean)));
        const classStudentsMap = new Map();
        if (assignedClassIds.length > 0) {
            const { data: rawClassStudents } = await supabaseAdmin
                .from('class_students')
                .select('class_id, usn')
                .in('class_id', assignedClassIds);
            (rawClassStudents || []).forEach(cs => {
                if (!classStudentsMap.has(cs.class_id)) classStudentsMap.set(cs.class_id, new Set());
                classStudentsMap.get(cs.class_id).add((cs.usn || '').toUpperCase().trim());
            });
        }

        // 2. Fetch subject marks for all assigned subjects
        const allAssignedCodes = Array.from(new Set(assignments.map(a => a.subject_code.toUpperCase())));

        let marksQuery = supabaseAdmin
            .from('subject_marks')
            .select('subject_code, subject_name, semester, internal, external, total, grade, passed, usn');

        if (allAssignedCodes.length > 0) {
            marksQuery = marksQuery.in('subject_code', allAssignedCodes);
        }

        const { data: rawMarks } = await marksQuery;
        const marks = rawMarks || [];

        // Group marks by subject code
        const marksBySubject = new Map();
        marks.forEach(m => {
            const code = (m.subject_code || '').toUpperCase();
            const list = marksBySubject.get(code) || [];
            list.push(m);
            marksBySubject.set(code, list);
        });

        // 3. Compute performance per faculty member
        const performanceList = [];

        facultyList.forEach(fac => {
            // Departments are matched by canonical code, not substring: a raw
            // `includes('CS')` test is true for "ELECTRONICS" and would keep the
            // wrong faculty in the list.
            if (branchFilter && fac.department && canonicalBranch(fac.department) !== canonicalBranch(branchFilter)) {
                return;
            }

            const facAssignments = assignmentsByFaculty.get(fac.id) || [];
            
            // Filter by semester and class if active
            let filteredAssignments = facAssignments;
            if (semesterFilter) {
                filteredAssignments = filteredAssignments.filter(a => Number(a.semester) === semesterFilter);
            }
            if (classFilter && classFilter !== 'all') {
                filteredAssignments = filteredAssignments.filter(a => a.class_id === classFilter);
            }

            if (facAssignments.length === 0 && (branchFilter || classFilter)) return;

            let totalAppeared = 0;
            let totalPassed = 0;
            let totalFailed = 0;
            let totalScoreSum = 0;
            const gradeCounts = { O: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, P: 0, F: 0 };

            const subjectBreakdowns = [];

            filteredAssignments.forEach(assign => {
                const code = (assign.subject_code || '').toUpperCase();
                const catInfo = catalogMap.get(code);
                let subMarks = marksBySubject.get(code) || [];

                // If this subject is specifically assigned to a class section, scope to that class's students
                if (assign.class_id && classStudentsMap.has(assign.class_id)) {
                    const validUsns = classStudentsMap.get(assign.class_id);
                    subMarks = subMarks.filter(m => validUsns.has((m.usn || '').toUpperCase().trim()));
                }

                let subAppeared = subMarks.length;
                let subPassed = 0;
                let subFailed = 0;
                let subScoreSum = 0;
                const subFailedStudents = [];

                subMarks.forEach(m => {
                    const isFail = isFailedSubject(m);
                    const score = Number(m.total) || 0;
                    subScoreSum += score;
                    totalScoreSum += score;

                    const canonicalG = resolveCanonicalGrade(m);
                    if (isFail || canonicalG === 'F' || canonicalG === 'AB') {
                        subFailed++;
                        totalFailed++;
                        gradeCounts.F++;
                        if (m.usn) {
                            subFailedStudents.push({
                                usn: m.usn,
                                internal: m.internal,
                                external: m.external,
                                total: m.total,
                                grade: canonicalG || 'F'
                            });
                        }
                    } else {
                        subPassed++;
                        totalPassed++;
                        if (gradeCounts[canonicalG] !== undefined) {
                            gradeCounts[canonicalG]++;
                        } else {
                            gradeCounts.P++;
                        }
                    }
                });

                totalAppeared += subAppeared;

                subjectBreakdowns.push({
                    assignment_id: assign.id,
                    subject_code: code,
                    subject_name: assign.subject_name || catInfo?.subject_name || code,
                    semester: assign.semester || catInfo?.semester || 1,
                    branch: assign.branch || catInfo?.branch || fac.department || '—',
                    class_id: assign.class_id || null,
                    class_name: assign.classes?.name || null,
                    class_section: assign.classes?.section || null,
                    class_batch: assign.classes?.batch || null,
                    appeared: subAppeared,
                    passed: subPassed,
                    failed: subFailed,
                    pass_rate: pct(subPassed, subAppeared),
                    avg_score: subAppeared > 0 ? Number((subScoreSum / subAppeared).toFixed(1)) : 0,
                    failed_students: subFailedStudents
                });
            });

            const overallPassRate = pct(totalPassed, totalAppeared);
            const overallAvgScore = totalAppeared > 0 ? Number((totalScoreSum / totalAppeared).toFixed(1)) : 0;

            performanceList.push({
                faculty_id: fac.id,
                faculty_name: fac.full_name || fac.email || 'Faculty Member',
                email: fac.email,
                department: fac.department || 'General',
                status: fac.status || 'active',
                assigned_count: subjectBreakdowns.length,
                total_appeared: totalAppeared,
                total_passed: totalPassed,
                total_failed: totalFailed,
                pass_rate: overallPassRate,
                avg_score: overallAvgScore,
                grade_spread: gradeCounts,
                subjects: subjectBreakdowns
            });
        });

        // Sort by pass rate descending
        performanceList.sort((a, b) => b.pass_rate - a.pass_rate || a.faculty_name.localeCompare(b.faculty_name));

        const payload = {
            faculty: performanceList,
            totalFaculty: performanceList.length,
            classes: classesList,
            currentFacultyId: session?.sub || session?.user?.id || null,
            currentUserRole: session?.role || 'faculty'
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/faculty-performance]', err);
        return fail('Failed to fetch faculty performance: ' + (err.message || err), 'FACULTY_PERFORMANCE_ERROR', 500);
    }
}
