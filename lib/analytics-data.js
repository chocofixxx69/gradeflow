import { createClient } from '@supabase/supabase-js';
import { fetchAllPaginated } from './supabase-utils';

// Shared analytics data layer — used by /api/admin/analytics, exports, and risk.
// Keeps the SGPA/CGPA + scoping logic in ONE place.

export function getAdminClient() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
}

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

/**
 * Builds per-student analytics rows, scoped by role + optional filters.
 * @returns {{ students: Array, classes: Array, classStudents: Array }}
 */
export async function getStudentAnalytics(client, { role, facultyId, filters = {} } = {}) {
    const [students, remarks, results, classes, classStudents] = await Promise.all([
        fetchAllPaginated('students', 'usn, name, branch, semester, cgpa, lateral_entry', client),
        fetchAllPaginated('academic_remarks', 'student_usn, semester, sgpa, backlog_count, is_all_clear', client),
        fetchAllPaginated('results', 'usn, semester, total_credits', client),
        fetchAllPaginated('classes', '*', client, 'created_at', false),
        fetchAllPaginated('class_students', 'class_id, usn', client),
    ]);

    let allowedUsns = null;
    if (role === 'faculty') {
        const myClassIds = new Set(classes.filter(c => c.faculty_id === facultyId).map(c => c.id));
        allowedUsns = new Set(classStudents.filter(cs => myClassIds.has(cs.class_id)).map(cs => cs.usn));
    }

    const remarksByUsn = {};
    for (const r of remarks) (remarksByUsn[r.student_usn] ||= []).push(r);

    const creditsByUsnSem = {};
    for (const res of results) {
        (creditsByUsnSem[res.usn] ||= {});
        creditsByUsnSem[res.usn][res.semester] = Math.max(creditsByUsnSem[res.usn][res.semester] || 0, res.total_credits || 0);
    }
    const usnsWithResults = new Set(results.map(r => r.usn));

    const { branch, semester, classId } = filters;
    let classUsns = null;
    if (classId) classUsns = new Set(classStudents.filter(cs => cs.class_id === classId).map(cs => cs.usn));

    const rows = students
        .filter(s => {
            if (allowedUsns && !allowedUsns.has(s.usn)) return false;
            if (branch && !(s.branch || '').toUpperCase().includes(branch.toUpperCase())) return false;
            if (semester && String(s.semester) !== String(semester)) return false;
            if (classUsns && !classUsns.has(s.usn)) return false;
            return true;
        })
        .map(s => {
            const rem = remarksByUsn[s.usn] || [];
            const cgpa = weightedCGPA(rem, creditsByUsnSem[s.usn] || {});
            const totalBacklogs = rem.reduce((a, r) => a + (r.backlog_count || 0), 0);
            const maxSemBacklogs = rem.reduce((m, r) => Math.max(m, r.backlog_count || 0), 0);
            return {
                usn: s.usn,
                name: s.name || '',
                branch: s.branch || '',
                semester: s.semester ?? '',
                cgpa,
                total_backlogs: totalBacklogs,
                max_semester_backlogs: maxSemBacklogs,
                has_results: usnsWithResults.has(s.usn),
                lateral_entry: !!s.lateral_entry,
            };
        });

    return { students: rows, classes, classStudents };
}
