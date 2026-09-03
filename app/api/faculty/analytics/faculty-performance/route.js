import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { isFailedSubject } from '@/lib/vtuGrades';

export const dynamic = 'force-dynamic';

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

        const cacheKey = `fac_perf:${branchFilter}:${semesterFilter || 'all'}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch faculty members
        // "Assigned subjects" comes ONLY from faculty_subject_assignments — the real,
        // admin-managed faculty-to-subject link (app/admin/faculty-assignments). There
        // used to be a fallback here that invented assignments from `classes.faculty_id`
        // (any class a faculty happens to own → first 4 catalog subjects for that class's
        // semester/branch, regardless of who actually teaches them). Since faculty access
        // is deliberately flat/broad in this app — any faculty can open any class — that
        // fallback attributed nearly the entire catalog to whoever had browsed the most
        // classes. A faculty with no real assignment row must show zero subjects, not a
        // guess; the UI already renders "No subjects assigned" for that case.
        const [
            { data: rawFaculty },
            { data: rawAssignments },
            { data: rawSubjects }
        ] = await Promise.all([
            supabaseAdmin.from('faculty_onboarding').select('id, full_name, email, department, status'),
            supabaseAdmin.from('faculty_subject_assignments').select('*'),
            supabaseAdmin.from('subject_catalog').select('subject_code, subject_name, semester, branch, credits')
        ]);

        const facultyList = rawFaculty || [];
        const assignments = rawAssignments || [];
        const catalogSubjects = rawSubjects || [];

        const catalogMap = new Map();
        catalogSubjects.forEach(s => catalogMap.set(s.subject_code.toUpperCase(), s));

        // Group assignments by faculty_id
        const assignmentsByFaculty = new Map();
        assignments.forEach(a => {
            const list = assignmentsByFaculty.get(a.faculty_id) || [];
            list.push(a);
            assignmentsByFaculty.set(a.faculty_id, list);
        });

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
            if (branchFilter && fac.department && !fac.department.toUpperCase().includes(branchFilter)) {
                return;
            }

            const facAssignments = assignmentsByFaculty.get(fac.id) || [];
            
            // Filter by semester if active
            const filteredAssignments = semesterFilter 
                ? facAssignments.filter(a => Number(a.semester) === semesterFilter)
                : facAssignments;

            if (facAssignments.length === 0 && branchFilter) return;

            let totalAppeared = 0;
            let totalPassed = 0;
            let totalFailed = 0;
            let totalScoreSum = 0;
            const gradeCounts = { O: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, P: 0, F: 0 };

            const subjectBreakdowns = [];

            filteredAssignments.forEach(assign => {
                const code = (assign.subject_code || '').toUpperCase();
                const catInfo = catalogMap.get(code);
                const subMarks = marksBySubject.get(code) || [];

                let subAppeared = subMarks.length;
                let subPassed = 0;
                let subFailed = 0;
                let subScoreSum = 0;

                subMarks.forEach(m => {
                    const isFail = isFailedSubject(m);
                    const score = Number(m.total) || 0;
                    subScoreSum += score;
                    totalScoreSum += score;

                    const g = (m.grade || '').toUpperCase().trim();
                    if (isFail) {
                        subFailed++;
                        totalFailed++;
                        gradeCounts.F++;
                    } else {
                        subPassed++;
                        totalPassed++;
                        if (gradeCounts[g] !== undefined) {
                            gradeCounts[g]++;
                        } else if (g === 'S') {
                            gradeCounts.O++;
                        } else {
                            gradeCounts.P++;
                        }
                    }
                });

                totalAppeared += subAppeared;

                subjectBreakdowns.push({
                    subject_code: code,
                    subject_name: assign.subject_name || catInfo?.subject_name || code,
                    semester: assign.semester || catInfo?.semester || 1,
                    branch: assign.branch || catInfo?.branch || fac.department || '—',
                    appeared: subAppeared,
                    passed: subPassed,
                    failed: subFailed,
                    pass_rate: pct(subPassed, subAppeared),
                    avg_score: subAppeared > 0 ? Number((subScoreSum / subAppeared).toFixed(1)) : 0
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
            totalFaculty: performanceList.length
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/faculty-performance]', err);
        return fail('Failed to fetch faculty performance: ' + (err.message || err), 'FACULTY_PERFORMANCE_ERROR', 500);
    }
}
