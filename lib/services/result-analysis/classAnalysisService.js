import { buildDataset } from './dataset';
import { buildStudentRows } from './aggregate';
import { pct } from '../../academic-rules';

/** Class-wise analysis: one row per class in scope, with its own appeared/passed/pass% — a single query set, not one query per class. */
export async function getClassAnalysis(client, filters = {}, { session } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return { data: { filters_applied: filters, classes: [], empty_reason: ds.emptyReason, meta: ds.meta }, error: null };
    }

    const studentRows = buildStudentRows(ds);
    const byClass = new Map();
    for (const c of ds.classes) byClass.set(c.id, { class_id: c.id, class_name: c.name, branch: c.branch, semester: c.semester, section: c.section ?? null, students: [] });

    for (const s of studentRows) {
        if (s.class_id && byClass.has(s.class_id)) byClass.get(s.class_id).students.push(s);
    }

    const classes = [...byClass.values()].map(c => {
        const appeared = c.students.length;
        const passed = c.students.filter(s => s.status === 'PASS').length;
        return {
            class_id: c.class_id,
            class_name: c.class_name,
            branch: c.branch,
            semester: c.semester,
            section: c.section,
            appeared,
            passed,
            failed: appeared - passed,
            pass_percentage: pct(passed, appeared),
        };
    });

    return { data: { filters_applied: filters, exam_name: ds.resolvedExamName, classes, meta: ds.meta }, error: null };
}
