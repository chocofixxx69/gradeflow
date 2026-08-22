// Shared aggregation helpers built on top of dataset.js's raw fetch result.
// Every service composes these instead of re-walking subject_marks itself.

import { unifyGrade, isPass, isArrear, isAppeared, pct, subjectAverageMarks, compareForRanking } from '../../academic-rules';
import { buildUsnToClassMap } from './dataset';

/** Groups subject_marks rows by usn and by subject (code falling back to name). */
export function groupMarks(subjectMarks) {
    const marksByUsn = {};
    const subjectGroups = new Map();

    for (const m of subjectMarks) {
        (marksByUsn[m.usn] ||= []).push(m);

        const key = m.subject_code || m.subject_name;
        if (!subjectGroups.has(key)) subjectGroups.set(key, []);
        subjectGroups.get(key).push(m);
    }

    return { marksByUsn, subjectGroups };
}

/** Per-subject rollup: appeared / passed / failed / pass% / average marks. Faculty is populated by the caller if faculty_subject_assignments data is available. */
export function buildSubjectRows(subjectMarks) {
    const { subjectGroups } = groupMarks(subjectMarks);

    return [...subjectGroups.entries()].map(([key, rows]) => {
        const first = rows[0];
        const appeared = rows.filter(m => isAppeared(m.grade));
        const passed = appeared.filter(m => isPass(m.grade));
        return {
            subject_code: first.subject_code || null,
            subject_name: first.subject_name || key,
            credits: first.credits ?? null,
            faculty: null, // populated by facultyAnalysisService when faculty_subject_assignments exists
            appeared: appeared.length,
            passed: passed.length,
            failed: appeared.length - passed.length,
            pass_percentage: pct(passed.length, appeared.length),
            average_marks: subjectAverageMarks(rows),
        };
    });
}

/**
 * Per-student rollup for one exam session: total marks, arrear count, pass/fail
 * status (canonical rule: overall pass = zero arrears), and the subject list.
 */
export function buildStudentRows({ matchingResults, subjectMarks, studentByUsn, classes, classStudents }) {
    const { marksByUsn } = groupMarks(subjectMarks);
    const classByUsn = buildUsnToClassMap(classes || [], classStudents || []);

    const rows = [];
    for (const result of matchingResults) {
        const usn = result.usn;
        const marks = marksByUsn[usn] || [];
        if (marks.length === 0) continue; // no subject rows scraped yet for this student/exam

        const student = studentByUsn[usn];
        const cls = classByUsn[usn];
        const appeared = marks.filter(m => isAppeared(m.grade));
        const arrearSubjects = marks.filter(m => isArrear(m.grade));
        const arrears = arrearSubjects.length;
        const total = marks.reduce((a, m) => a + (Number(m.total) || 0), 0);

        rows.push({
            usn,
            name: student?.name || '',
            branch: student?.branch || cls?.branch || '',
            semester: student?.semester ?? cls?.semester ?? null,
            class_id: cls?.id ?? null,
            class_name: cls?.name ?? null,
            total_marks: total,
            appeared_subjects: appeared.length,
            arrears,
            status: arrears === 0 ? 'PASS' : 'FAIL',
            subjects: marks.map(m => ({
                subject_code: m.subject_code,
                subject_name: m.subject_name,
                internal: m.internal,
                external: m.external,
                total: m.total,
                grade: m.grade,
                unified_grade: unifyGrade(m.grade),
                passed: isPass(m.grade),
            })),
        });
    }
    return rows;
}

export function rankStudents(studentRows, limit = null) {
    const ranked = [...studentRows].sort(compareForRanking).map((s, i) => ({ rank: i + 1, ...s }));
    return limit ? ranked.slice(0, limit) : ranked;
}

export function classSummaryFromStudentRows(studentRows) {
    const appeared = studentRows.length;
    const passed = studentRows.filter(s => s.status === 'PASS').length;
    return {
        appeared,
        passed,
        failed: appeared - passed,
        pass_percentage: pct(passed, appeared),
    };
}
