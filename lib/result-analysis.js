// Single-class Result Analysis report — used by GET /api/admin/result-analysis.
// Kept for backward compatibility with the original endpoint; the underlying
// fetch/aggregation logic now lives in lib/services/result-analysis/ (dataset.js,
// aggregate.js) and is shared with the newer, filter-generic endpoints so there is
// exactly one implementation of each rule.

import { buildDataset } from './services/result-analysis/dataset';
import { buildStudentRows, buildSubjectRows, rankStudents, classSummaryFromStudentRows } from './services/result-analysis/aggregate';
import { getFacultyForSubjects } from './services/result-analysis/facultyAnalysisService';

/**
 * Builds the full Result Analysis dataset for one class + one exam session.
 * @returns {{ data: object|null, error: {code, message, status}|null }}
 */
export async function getResultAnalysis(client, { classId, examName }) {
    if (!classId) {
        return { data: null, error: { code: 'MISSING_CLASS_ID', message: 'classId is required.', status: 400 } };
    }

    const ds = await buildDataset(client, { classId, examName }, {});

    if (ds.classes.length === 0) {
        return { data: null, error: { code: 'CLASS_NOT_FOUND', message: 'Class not found.', status: 404 } };
    }
    const cls = ds.classes[0];

    if (ds.emptyReason) {
        const reasonText = ds.emptyReason === 'NO_ENROLLED_STUDENTS'
            ? 'Class has no enrolled students.'
            : 'No results found for this class/exam selection.';
        return { data: emptyReport(cls, ds.resolvedExamName, reasonText), error: null };
    }

    const studentRows = buildStudentRows(ds);
    let subjects = buildSubjectRows(ds.subjectMarks);
    subjects = await getFacultyForSubjects(client, subjects, ds.classes);

    const classSummary = classSummaryFromStudentRows(studentRows);
    const topStudents = rankStudents(studentRows, 10).map(s => ({ rank: s.rank, usn: s.usn, name: s.name, total_marks: s.total_marks, arrears: s.arrears }));
    const arrearsAnalysis = studentRows
        .filter(s => s.arrears > 0)
        .sort((a, b) => (b.arrears - a.arrears) || a.usn.localeCompare(b.usn))
        .map(s => ({ usn: s.usn, name: s.name, arrear_count: s.arrears }));

    return {
        data: {
            context: {
                class_id: cls.id, class_name: cls.name, branch: cls.branch, semester: cls.semester,
                section: cls.section ?? null, batch: cls.batch ?? null, exam_name: ds.resolvedExamName,
            },
            subjects,
            students: studentRows,
            class_summary: classSummary,
            subject_analysis: subjects,
            top_students: topStudents,
            arrears_analysis: arrearsAnalysis,
            graph: {
                labels: subjects.map(s => s.subject_code || s.subject_name),
                pass_percentage: subjects.map(s => s.pass_percentage),
            },
        },
        error: null,
    };
}

function emptyReport(cls, examName, reason) {
    return {
        context: {
            class_id: cls.id, class_name: cls.name, branch: cls.branch, semester: cls.semester,
            section: cls.section ?? null, batch: cls.batch ?? null, exam_name: examName,
        },
        subjects: [],
        students: [],
        class_summary: { appeared: 0, passed: 0, failed: 0, pass_percentage: 0 },
        subject_analysis: [],
        top_students: [],
        arrears_analysis: [],
        graph: { labels: [], pass_percentage: [] },
        empty_reason: reason,
    };
}
