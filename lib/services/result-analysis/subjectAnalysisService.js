import { buildDataset } from './dataset';
import { buildSubjectRows } from './aggregate';
import { getFacultyForSubjects } from './facultyAnalysisService';

/** Subject-wise analysis: appeared/passed/failed/pass%/average marks per subject, for the given filters. */
export async function getSubjectAnalysis(client, filters = {}, { session } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return { data: { filters_applied: filters, exam_name: ds.resolvedExamName, subjects: [], empty_reason: ds.emptyReason, meta: ds.meta }, error: null };
    }

    let subjects = buildSubjectRows(ds.subjectMarks);
    subjects = await getFacultyForSubjects(client, subjects, ds.classes);

    return {
        data: {
            filters_applied: filters,
            exam_name: ds.resolvedExamName,
            subjects: subjects.sort((a, b) => (a.pass_percentage - b.pass_percentage)), // worst-first, matches faculty/reports/page.jsx convention
            meta: ds.meta,
        },
        error: null,
    };
}
