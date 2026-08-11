import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from '../../../../lib/supabase-utils';
import { requireStaff } from '../../../../lib/server-session';

// Service-key client (bypasses RLS); authorization is enforced via requireStaff below.
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

// ── Standard response helpers ───────────────────────────────────────────────
function ok(data) {
    return NextResponse.json({ success: true, data });
}
function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

// Weighted CGPA = Σ(sgpa × sem_credits) / Σ(credits); falls back to simple average.
function weightedCGPA(remarks, creditsBySem) {
    let weighted = 0, totalCredits = 0;
    for (const r of remarks) {
        const sgpa = Number(r.sgpa) || 0;
        const cr = creditsBySem[r.semester] || 0;
        if (cr > 0) { weighted += sgpa * cr; totalCredits += cr; }
    }
    if (totalCredits > 0) return Math.round((weighted / totalCredits) * 100) / 100;
    if (remarks.length) {
        const avg = remarks.reduce((a, r) => a + (Number(r.sgpa) || 0), 0) / remarks.length;
        return Math.round(avg * 100) / 100;
    }
    return 0;
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

/**
 * GET /api/admin/analytics
 * Single aggregate endpoint for the analytics dashboard (replaces the 1+N pattern).
 * Auth: staff session cookie. Admin → all data; Faculty → their assigned classes only.
 * Optional filters: ?branch=CSE&semester=6&classId=<uuid>
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const fBranch = searchParams.get('branch');
        const fSemester = searchParams.get('semester');
        const fClassId = searchParams.get('classId');

        // ── Batch-load everything in parallel (no N+1) ──
        const [students, remarks, results, classes, classStudents] = await Promise.all([
            fetchAllPaginated('students', 'usn, name, branch, semester, cgpa, lateral_entry', supabaseAdmin),
            fetchAllPaginated('academic_remarks', 'student_usn, semester, sgpa, backlog_count, is_all_clear', supabaseAdmin),
            fetchAllPaginated('results', 'usn, semester, total_credits', supabaseAdmin),
            fetchAllPaginated('classes', '*', supabaseAdmin, 'created_at', false),
            fetchAllPaginated('class_students', 'class_id, usn', supabaseAdmin),
        ]);

        // ── Role scoping: faculty only see students in their classes ──
        let allowedUsns = null;
        if (session.role === 'faculty') {
            const myClassIds = new Set(classes.filter(c => c.faculty_id === session.sub).map(c => c.id));
            allowedUsns = new Set(classStudents.filter(cs => myClassIds.has(cs.class_id)).map(cs => cs.usn));
        }

        // ── Index helper maps ──
        const remarksByUsn = {};
        for (const r of remarks) (remarksByUsn[r.student_usn] ||= []).push(r);

        const creditsByUsnSem = {};
        for (const res of results) {
            (creditsByUsnSem[res.usn] ||= {});
            creditsByUsnSem[res.usn][res.semester] = Math.max(creditsByUsnSem[res.usn][res.semester] || 0, res.total_credits || 0);
        }
        const usnsWithResults = new Set(results.map(r => r.usn));

        // ── Apply role + query filters to the student set ──
        let scopedStudents = students.filter(s => {
            if (allowedUsns && !allowedUsns.has(s.usn)) return false;
            if (fBranch && !(s.branch || '').toUpperCase().includes(fBranch.toUpperCase())) return false;
            if (fSemester && String(s.semester) !== String(fSemester)) return false;
            return true;
        });
        if (fClassId) {
            const classUsns = new Set(classStudents.filter(cs => cs.class_id === fClassId).map(cs => cs.usn));
            scopedStudents = scopedStudents.filter(s => classUsns.has(s.usn));
        }

        // ── Per-student computation + distributions ──
        const cgpaDist = { '9-10': 0, '8-9': 0, '7-8': 0, '6-7': 0, 'below6': 0 };
        const backlogDist = { clear: 0, '1-2': 0, '3-5': 0, '6plus': 0 };
        const branchDist = {}, semDist = {};
        let cgpaSum = 0, cgpaCount = 0, withBacklogs = 0, withoutCgpa = 0, withResults = 0;

        const studentByUsn = {};
        for (const s of scopedStudents) {
            const rem = remarksByUsn[s.usn] || [];
            const cgpa = weightedCGPA(rem, creditsByUsnSem[s.usn] || {});
            const totalBacklogs = rem.reduce((a, r) => a + (r.backlog_count || 0), 0);
            const hasResults = usnsWithResults.has(s.usn);

            if (hasResults) withResults++;
            if (cgpa > 0) { cgpaSum += cgpa; cgpaCount++; } else withoutCgpa++;
            if (totalBacklogs > 0) withBacklogs++;

            if (cgpa >= 9) cgpaDist['9-10']++;
            else if (cgpa >= 8) cgpaDist['8-9']++;
            else if (cgpa >= 7) cgpaDist['7-8']++;
            else if (cgpa >= 6) cgpaDist['6-7']++;
            else if (cgpa > 0) cgpaDist['below6']++;

            if (totalBacklogs === 0) backlogDist.clear++;
            else if (totalBacklogs <= 2) backlogDist['1-2']++;
            else if (totalBacklogs <= 5) backlogDist['3-5']++;
            else backlogDist['6plus']++;

            branchDist[s.branch || 'Unknown'] = (branchDist[s.branch || 'Unknown'] || 0) + 1;
            semDist[s.semester ?? 'Unknown'] = (semDist[s.semester ?? 'Unknown'] || 0) + 1;

            studentByUsn[s.usn] = { usn: s.usn, name: s.name, branch: s.branch, semester: s.semester, cgpa, total_backlogs: totalBacklogs, has_results: hasResults };
        }

        // ── Class analytics (scoped by role) ──
        const scopedClasses = session.role === 'faculty'
            ? classes.filter(c => c.faculty_id === session.sub)
            : classes;
        const usnsByClass = {};
        for (const cs of classStudents) (usnsByClass[cs.class_id] ||= []).push(cs.usn);

        const classAnalytics = scopedClasses.map(c => {
            const usns = usnsByClass[c.id] || [];
            const members = usns.map(u => studentByUsn[u]).filter(Boolean);
            const withCg = members.filter(m => m.cgpa > 0);
            const avgCgpa = withCg.length ? Math.round((withCg.reduce((a, m) => a + m.cgpa, 0) / withCg.length) * 100) / 100 : 0;
            return {
                id: c.id, name: c.name, branch: c.branch, semester: c.semester,
                student_count: usns.length,
                average_cgpa: avgCgpa,
                total_backlogs: members.reduce((a, m) => a + m.total_backlogs, 0),
            };
        });
        const emptyClasses = scopedClasses.filter(c => (usnsByClass[c.id] || []).length === 0).length;

        const totalStudents = scopedStudents.length;
        const data = {
            kpis: {
                total_students: totalStudents,
                total_classes: scopedClasses.length,
                average_cgpa: cgpaCount ? Math.round((cgpaSum / cgpaCount) * 100) / 100 : 0,
                students_with_backlogs: withBacklogs,
                students_without_cgpa: withoutCgpa,
                empty_classes: emptyClasses,
                coverage_percentage: pct(withResults, totalStudents),
            },
            branch_distribution: branchDist,
            semester_distribution: semDist,
            cgpa_distribution: cgpaDist,
            backlog_distribution: backlogDist,
            class_analytics: classAnalytics,
            data_coverage: {
                total_students: totalStudents,
                students_with_results: withResults,
                coverage_percentage: pct(withResults, totalStudents),
            },
            academic_health: {
                clear_students: backlogDist.clear,
                at_risk_students: backlogDist['3-5'] + backlogDist['6plus'],
                pass_rate: pct(backlogDist.clear, totalStudents),
            },
            generated_for_role: session.role,
            filters_applied: { branch: fBranch || null, semester: fSemester || null, classId: fClassId || null },
        };

        return ok(data);
    } catch (err) {
        console.error('[GET /api/admin/analytics]', err);
        return fail('Failed to build analytics.', 'ANALYTICS_ERROR', 500, { error: String(err?.message || err) });
    }
}
