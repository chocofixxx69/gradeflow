// Export data builder + renderers. Business logic (what goes in the report) lives
// here and is shared by all three formats; only the rendering step differs. This
// avoids recomputing summary/subjects/students separately per format.

import { buildDataset } from './dataset';
import { buildStudentRows, buildSubjectRows, rankStudents, classSummaryFromStudentRows } from './aggregate';
import { getFacultyForSubjects } from './facultyAnalysisService';

/** The single dataset every export format renders from. */
export async function getReportForExport(client, filters = {}, { session } = {}) {
    const ds = await buildDataset(client, filters, { session });

    if (ds.emptyReason) {
        return {
            context: { exam_name: ds.resolvedExamName, filters_applied: filters },
            subjects: [], students: [], class_summary: { appeared: 0, passed: 0, failed: 0, pass_percentage: 0 },
            top_students: [], students_with_backlogs: [],
            empty_reason: ds.emptyReason,
        };
    }

    const studentRows = buildStudentRows(ds);
    let subjects = buildSubjectRows(ds.subjectMarks);
    subjects = await getFacultyForSubjects(client, subjects, ds.classes);

    return {
        context: {
            exam_name: ds.resolvedExamName,
            filters_applied: filters,
            classes: ds.classes.map(c => ({ id: c.id, name: c.name, branch: c.branch, semester: c.semester, section: c.section ?? null })),
        },
        subjects,
        students: studentRows,
        class_summary: classSummaryFromStudentRows(studentRows),
        top_students: rankStudents(studentRows, 10),
        students_with_backlogs: studentRows.filter(s => s.arrears > 0).sort((a, b) => b.arrears - a.arrears),
    };
}

export function toCSV(report) {
    const columns = ['usn', 'name', 'class_name', 'total_marks', 'arrears', 'status'];
    const esc = (v) => {
        const s = String(v ?? '');
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = columns.join(',');
    const body = report.students.map(r => columns.map(c => esc(r[c])).join(',')).join('\n');
    return `${header}\n${body}`;
}

export async function toExcelBuffer(report) {
    const XLSX = await import('xlsx');

    const wb = XLSX.utils.book_new();

    const summarySheet = XLSX.utils.json_to_sheet([{
        'Exam': report.context.exam_name || '',
        'Appeared': report.class_summary.appeared,
        'Passed': report.class_summary.passed,
        'Failed': report.class_summary.failed,
        'Pass %': report.class_summary.pass_percentage,
    }]);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    const subjectsSheet = XLSX.utils.json_to_sheet(report.subjects.map(s => ({
        Code: s.subject_code, Name: s.subject_name, Credits: s.credits,
        Appeared: s.appeared, Passed: s.passed, Failed: s.failed, 'Pass %': s.pass_percentage, 'Avg Marks': s.average_marks,
    })));
    XLSX.utils.book_append_sheet(wb, subjectsSheet, 'Subjects');

    const studentsSheet = XLSX.utils.json_to_sheet(report.students.map(s => ({
        USN: s.usn, Name: s.name, Class: s.class_name, 'Total Marks': s.total_marks, Arrears: s.arrears, Status: s.status,
    })));
    XLSX.utils.book_append_sheet(wb, studentsSheet, 'Students');

    const rankingSheet = XLSX.utils.json_to_sheet(report.top_students.map(s => ({
        Rank: s.rank, USN: s.usn, Name: s.name, 'Total Marks': s.total_marks, Arrears: s.arrears,
    })));
    XLSX.utils.book_append_sheet(wb, rankingSheet, 'Top 10');

    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

export async function toPdfBuffer(report) {
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text('Result Analysis Report', 14, 16);
    doc.setFontSize(10);
    doc.text(`Exam: ${report.context.exam_name || '—'}`, 14, 24);
    doc.text(`Appeared: ${report.class_summary.appeared}  Passed: ${report.class_summary.passed}  Failed: ${report.class_summary.failed}  Pass %: ${report.class_summary.pass_percentage}`, 14, 30);

    autoTable(doc, {
        startY: 36,
        head: [['Code', 'Subject', 'Appeared', 'Passed', 'Pass %', 'Avg Marks']],
        body: report.subjects.map(s => [s.subject_code || '', s.subject_name || '', s.appeared, s.passed, s.pass_percentage, s.average_marks]),
    });

    const afterSubjects = doc.lastAutoTable.finalY + 8;
    autoTable(doc, {
        startY: afterSubjects,
        head: [['Rank', 'USN', 'Name', 'Total Marks', 'Arrears']],
        body: report.top_students.map(s => [s.rank, s.usn, s.name, s.total_marks, s.arrears]),
    });

    return Buffer.from(doc.output('arraybuffer'));
}
