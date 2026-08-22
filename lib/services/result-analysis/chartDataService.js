import { buildDataset } from './dataset';
import { buildSubjectRows } from './aggregate';
import { unifyGrade } from '../../academic-rules';

const GRADE_BUCKETS = ['P', 'F', 'A', 'W', 'X', 'NE'];

/** Pre-aggregated series for charting — no client-side computation needed. */
export async function getChartData(client, filters = {}, { session } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return {
            data: {
                filters_applied: filters, exam_name: ds.resolvedExamName,
                subject_pass_percentage: { labels: [], values: [] },
                grade_distribution: { labels: GRADE_BUCKETS, values: GRADE_BUCKETS.map(() => 0) },
                empty_reason: ds.emptyReason, meta: ds.meta,
            },
            error: null,
        };
    }

    const subjects = buildSubjectRows(ds.subjectMarks);
    const gradeDistribution = Object.fromEntries(GRADE_BUCKETS.map(g => [g, 0]));
    for (const m of ds.subjectMarks) {
        const g = unifyGrade(m.grade);
        gradeDistribution[g] = (gradeDistribution[g] || 0) + 1;
    }

    return {
        data: {
            filters_applied: filters,
            exam_name: ds.resolvedExamName,
            subject_pass_percentage: {
                labels: subjects.map(s => s.subject_code || s.subject_name),
                values: subjects.map(s => s.pass_percentage),
            },
            subject_average_marks: {
                labels: subjects.map(s => s.subject_code || s.subject_name),
                values: subjects.map(s => s.average_marks),
            },
            grade_distribution: {
                labels: GRADE_BUCKETS,
                values: GRADE_BUCKETS.map(g => gradeDistribution[g] || 0),
            },
            meta: ds.meta,
        },
        error: null,
    };
}
