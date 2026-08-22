import { buildDataset, fetchByColumnIn, isMissingTableError } from './dataset';
import { buildSubjectRows } from './aggregate';

/**
 * Reads faculty_subject_assignments for the given classes and returns it as
 * subject_code -> faculty_id/name lookups. Returns null (not []) when the
 * table doesn't exist yet (migration 001 not applied) so callers can tell
 * "no assignments" apart from "feature unavailable".
 */
async function loadAssignments(client, classes) {
    const classIds = classes.map(c => c.id).filter(Boolean);
    if (classIds.length === 0) return [];
    try {
        const rows = await fetchByColumnIn(
            client, 'faculty_subject_assignments', 'faculty_id, subject_code, class_id', 'class_id', classIds
        );
        const facultyIds = [...new Set(rows.map(r => r.faculty_id).filter(Boolean))];
        const faculty = facultyIds.length
            ? await fetchByColumnIn(client, 'faculty_onboarding', 'id, full_name, email', 'id', facultyIds)
            : [];
        const facultyById = {};
        for (const f of faculty) facultyById[f.id] = f;
        return rows.map(r => ({ ...r, faculty_name: facultyById[r.faculty_id]?.full_name || null }));
    } catch (err) {
        if (isMissingTableError(err)) return null;
        throw err;
    }
}

/** Populates subject.faculty on already-built subject rows, or leaves it null if unassigned/unmigrated. */
export async function getFacultyForSubjects(client, subjectRows, classes) {
    const assignments = await loadAssignments(client, classes);
    if (!assignments) return subjectRows; // table not migrated — leave faculty: null as set by buildSubjectRows

    const byCode = {};
    for (const a of assignments) {
        (byCode[a.subject_code] ||= []).push({ faculty_id: a.faculty_id, faculty_name: a.faculty_name });
    }
    return subjectRows.map(s => ({ ...s, faculty: byCode[s.subject_code] || null }));
}

/** Faculty-wise analysis: for each faculty with an assignment, their subjects' pass rates. */
export async function getFacultyAnalysis(client, filters = {}, { session } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return { data: { filters_applied: filters, faculty: [], empty_reason: ds.emptyReason, meta: ds.meta }, error: null };
    }

    const assignments = await loadAssignments(client, ds.classes);
    if (!assignments) {
        return {
            data: {
                filters_applied: filters,
                faculty: [],
                unavailable_reason: 'faculty_subject_assignments table not migrated yet — run database/migrations/001_result_analysis.sql',
                meta: ds.meta,
            },
            error: null,
        };
    }

    const subjectRows = buildSubjectRows(ds.subjectMarks);
    const subjectByCode = {};
    for (const s of subjectRows) subjectByCode[s.subject_code] = s;

    const byFaculty = new Map();
    for (const a of assignments) {
        const subj = subjectByCode[a.subject_code];
        if (!subj) continue;
        if (!byFaculty.has(a.faculty_id)) {
            byFaculty.set(a.faculty_id, { faculty_id: a.faculty_id, faculty_name: a.faculty_name, subjects: [] });
        }
        byFaculty.get(a.faculty_id).subjects.push(subj);
    }

    const faculty = [...byFaculty.values()].map(f => {
        const totalAppeared = f.subjects.reduce((a, s) => a + s.appeared, 0);
        const totalPassed = f.subjects.reduce((a, s) => a + s.passed, 0);
        return {
            ...f,
            overall_pass_percentage: totalAppeared ? Math.round((totalPassed / totalAppeared) * 1000) / 10 : 0,
        };
    });

    return { data: { filters_applied: filters, exam_name: ds.resolvedExamName, faculty, meta: ds.meta }, error: null };
}
