import { buildDataset } from './dataset';
import { buildStudentRows, rankStudents } from './aggregate';

/** Top-N ranking across the filtered scope. Tie-break: total marks desc, fewer arrears, USN asc. */
export async function getRankings(client, filters = {}, { session, limit = 10 } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return { data: { filters_applied: filters, exam_name: ds.resolvedExamName, rankings: [], empty_reason: ds.emptyReason, meta: ds.meta }, error: null };
    }

    const studentRows = buildStudentRows(ds);
    const rankings = rankStudents(studentRows, limit).map(s => ({
        rank: s.rank, usn: s.usn, name: s.name, class_name: s.class_name,
        total_marks: s.total_marks, arrears: s.arrears, status: s.status,
    }));

    return { data: { filters_applied: filters, exam_name: ds.resolvedExamName, rankings, meta: ds.meta }, error: null };
}
