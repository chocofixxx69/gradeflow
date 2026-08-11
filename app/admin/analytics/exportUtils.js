import { deriveClassRows } from './ClassIntelligence';
import { deriveStudentRows } from './StudentIntelligence';

function escapeCsvCell(cell) {
    if (cell === null || cell === undefined) return '';
    const str = String(cell);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function generateAnalyticsCsv(metrics, classes, studentsByClass, filters) {
    const lines = [];

    // Header & Meta
    lines.push('Admin Analytics Export');
    lines.push(`Generated On,${new Date().toLocaleString()}`);
    lines.push('');
    lines.push('--- Active Filters ---');
    lines.push(`Branch,${filters.branch}`);
    lines.push(`Semester,${filters.semester}`);
    lines.push(`Class,${filters.classId}`);
    lines.push('');

    // KPI Summary
    lines.push('--- KPI Summary ---');
    lines.push('Metric,Value,Context');
    metrics.forEach(m => {
        lines.push(`${escapeCsvCell(m.label)},${escapeCsvCell(m.value)},${escapeCsvCell(m.meta)}`);
    });
    lines.push('');

    // Class Intelligence
    lines.push('--- Class Intelligence ---');
    lines.push('Class Name,Branch,Semester,Students,Average CGPA,Backlogs,Data Coverage');
    const classRows = deriveClassRows(classes, studentsByClass);
    classRows.forEach(row => {
        lines.push([
            escapeCsvCell(row.name),
            escapeCsvCell(row.branch),
            escapeCsvCell(row.semester),
            escapeCsvCell(row.studentCount),
            escapeCsvCell(row.avgCgpa !== null ? row.avgCgpa.toFixed(2) : ''),
            escapeCsvCell(row.backlogCount),
            escapeCsvCell(row.dataCoverage !== null ? `${row.dataCoverage}%` : '')
        ].join(','));
    });
    lines.push('');

    // Student Intelligence
    lines.push('--- Student Intelligence ---');
    lines.push('Student Name,USN,Class,Branch,Semester,CGPA,Backlogs');
    const studentRows = deriveStudentRows(classes, studentsByClass);
    studentRows.forEach(row => {
        lines.push([
            escapeCsvCell(row.name),
            escapeCsvCell(row.usn),
            escapeCsvCell(row.className),
            escapeCsvCell(row.branch),
            escapeCsvCell(row.semester),
            escapeCsvCell(row.cgpa !== null ? row.cgpa.toFixed(2) : ''),
            escapeCsvCell(row.total_backlogs)
        ].join(','));
    });

    return lines.join('\n');
}

export function downloadAnalyticsCsv(metrics, classes, studentsByClass, filters) {
    const csvContent = generateAnalyticsCsv(metrics, classes, studentsByClass, filters);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Analytics_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
