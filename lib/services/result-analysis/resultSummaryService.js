import { buildDataset } from './dataset';
import { buildStudentRows, classSummaryFromStudentRows } from './aggregate';

/**
 * Top-line Result Summary for the given academic-hierarchy filters:
 * classes in scope, students appeared/passed/failed, and overall pass %.
 */
export async function getResultSummary(client, filters = {}, { session } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return {
            data: {
                filters_applied: filters,
                classes_in_scope: ds.classes.map(c => ({ id: c.id, name: c.name, branch: c.branch, semester: c.semester, section: c.section ?? null })),
                exam_name: ds.resolvedExamName,
                summary: { appeared: 0, passed: 0, failed: 0, pass_percentage: 0 },
                empty_reason: ds.emptyReason,
                meta: ds.meta,
            },
            error: null,
        };
    }

    const studentRows = buildStudentRows(ds);
    const summary = classSummaryFromStudentRows(studentRows);

    return {
        data: {
            filters_applied: filters,
            classes_in_scope: ds.classes.map(c => ({ id: c.id, name: c.name, branch: c.branch, semester: c.semester, section: c.section ?? null })),
            exam_name: ds.resolvedExamName,
            exam_session_id: ds.resolvedExamSessionId,
            summary,
            total_subject_records: ds.subjectMarks.length,
            meta: ds.meta,
        },
        error: null,
    };
}
