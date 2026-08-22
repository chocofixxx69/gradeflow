import { buildDataset } from './dataset';
import { buildStudentRows } from './aggregate';

/** Students with one or more arrears in the filtered scope, worst-first, plus per-subject backlog counts. */
export async function getBacklogAnalysis(client, filters = {}, { session } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return { data: { filters_applied: filters, exam_name: ds.resolvedExamName, students_with_backlogs: [], subject_backlog_counts: [], empty_reason: ds.emptyReason, meta: ds.meta }, error: null };
    }

    const studentRows = buildStudentRows(ds);
    const withBacklogs = studentRows
        .filter(s => s.arrears > 0)
        .sort((a, b) => (b.arrears - a.arrears) || String(a.usn).localeCompare(String(b.usn)))
        .map(s => ({
            usn: s.usn, name: s.name, class_name: s.class_name, arrear_count: s.arrears,
            arrear_subjects: s.subjects.filter(sub => !sub.passed).map(sub => ({ subject_code: sub.subject_code, subject_name: sub.subject_name, grade: sub.grade })),
        }));

    const bySubject = new Map();
    for (const s of withBacklogs) {
        for (const sub of s.arrear_subjects) {
            const key = sub.subject_code || sub.subject_name;
            bySubject.set(key, (bySubject.get(key) || 0) + 1);
        }
    }
    const subjectBacklogCounts = [...bySubject.entries()]
        .map(([subject, backlog_count]) => ({ subject, backlog_count }))
        .sort((a, b) => b.backlog_count - a.backlog_count);

    return {
        data: {
            filters_applied: filters,
            exam_name: ds.resolvedExamName,
            students_with_backlogs: withBacklogs,
            subject_backlog_counts: subjectBacklogCounts,
            meta: ds.meta,
        },
        error: null,
    };
}
