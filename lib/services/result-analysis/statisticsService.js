import { buildDataset } from './dataset';
import { buildStudentRows, buildSubjectRows } from './aggregate';
import { unifyGrade, pct } from '../../academic-rules';

const GRADE_BUCKETS = ['P', 'F', 'A', 'W', 'X', 'NE'];

/** Grade distribution, subject-average marks distribution, and total-marks quartiles for the filtered scope. */
export async function getStatistics(client, filters = {}, { session } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return { data: { filters_applied: filters, exam_name: ds.resolvedExamName, grade_distribution: {}, subject_statistics: [], total_marks_distribution: {}, empty_reason: ds.emptyReason, meta: ds.meta }, error: null };
    }

    const gradeDistribution = Object.fromEntries(GRADE_BUCKETS.map(g => [g, 0]));
    for (const m of ds.subjectMarks) {
        const g = unifyGrade(m.grade);
        gradeDistribution[g] = (gradeDistribution[g] || 0) + 1;
    }

    const subjects = buildSubjectRows(ds.subjectMarks);
    const studentRows = buildStudentRows(ds);
    const totals = studentRows.map(s => s.total_marks).sort((a, b) => a - b);

    return {
        data: {
            filters_applied: filters,
            exam_name: ds.resolvedExamName,
            grade_distribution: gradeDistribution,
            subject_statistics: subjects.map(s => ({ subject_code: s.subject_code, subject_name: s.subject_name, average_marks: s.average_marks, pass_percentage: s.pass_percentage })),
            total_marks_distribution: quartiles(totals),
            class_pass_percentage: pct(studentRows.filter(s => s.status === 'PASS').length, studentRows.length),
            meta: ds.meta,
        },
        error: null,
    };
}

function quartiles(sortedValues) {
    if (sortedValues.length === 0) return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
    const at = (p) => sortedValues[Math.min(sortedValues.length - 1, Math.floor(p * (sortedValues.length - 1)))];
    return { min: sortedValues[0], q1: at(0.25), median: at(0.5), q3: at(0.75), max: sortedValues[sortedValues.length - 1] };
}
