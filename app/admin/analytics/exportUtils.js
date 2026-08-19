'use client';

function escapeCsvValue(value) {
    const stringValue = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

function toCsvRow(values) {
    return values.map(escapeCsvValue).join(',');
}

function triggerDownload(csvContent, fileName) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Builds a CSV snapshot of the currently loaded analytics view (KPIs + classes)
 * and triggers a browser download. Mirrors the section-based layout of the
 * server-side /api/admin/analytics/export/csv route but works off data already
 * loaded on the page, so it reflects the active filters instantly.
 */
export function downloadAnalyticsCsv(metrics = [], classes = [], studentsByClass = [], filters = {}) {
    const lines = [];

    lines.push('Admin Analytics Report');
    lines.push(toCsvRow(['Branch', filters.branch || 'all']));
    lines.push(toCsvRow(['Semester', filters.semester || 'all']));
    lines.push(toCsvRow(['Class', filters.classId || 'all']));
    lines.push('');

    lines.push('Overview KPIs');
    lines.push(toCsvRow(['Label', 'Value', 'Meta']));
    metrics.forEach(metric => {
        lines.push(toCsvRow([metric.label, metric.value, metric.meta]));
    });
    lines.push('');

    lines.push('Classes');
    lines.push(toCsvRow(['Name', 'Branch', 'Semester', 'Student Count']));
    classes.forEach(cls => {
        lines.push(toCsvRow([cls.name, cls.branch, cls.semester, cls.student_count]));
    });

    if (Array.isArray(studentsByClass) && studentsByClass.length > 0) {
        lines.push('');
        lines.push('Students');
        lines.push(toCsvRow(['Class', 'Name', 'USN', 'CGPA', 'Backlogs']));
        studentsByClass.forEach(entry => {
            (entry.students || []).forEach(student => {
                lines.push(toCsvRow([
                    entry.className || entry.name || entry.classId,
                    student.name,
                    student.usn,
                    student.cgpa,
                    student.total_backlogs,
                ]));
            });
        });
    }

    triggerDownload(lines.join('\n'), `gradeflow-admin-analytics-${new Date().toISOString().slice(0, 10)}.csv`);
}
