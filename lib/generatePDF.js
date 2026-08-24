import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizeSubjectResult, calculateAcademicRecord } from './vtuAcademicEngine';

/**
 * Calculate SGPA for a list of subjects
 */
function calcSGPA(marks, scheme = '2022', branch = null, semNumber = null) {
    let totalCredits = 0;
    let earnedCredits = 0;
    let totalCreditPoints = 0;
    let backlogs = 0;

    marks.forEach(m => {
        const norm = normalizeSubjectResult(m, scheme, branch, semNumber);
        if (norm.isAudit || norm.credits === 0) return;

        totalCredits += norm.credits;
        if (norm.isPassed) {
            earnedCredits += norm.credits;
            totalCreditPoints += norm.weightedPoints;
        } else {
            backlogs++;
        }
    });

    const sgpa = totalCredits > 0 ? Number((totalCreditPoints / totalCredits).toFixed(2)) : 0;

    return {
        sgpa,
        totalCredits,
        earnedCredits,
        backlogs,
        gradePoints: totalCreditPoints
    };
}

/**
 * Generate a professional PDF report for a student's academic results.
 *
 * @param {Object} params
 * @param {string} params.studentName - Student's full name
 * @param {string} params.usn - University Seat Number
 * @param {string} params.branch - Branch (e.g., CSE)
 * @param {string} params.scheme - Scheme (e.g., 2022)
 * @param {string} params.collegeName - College name (optional)
 * @param {Object} params.semesterMarks - Object keyed by semester number, values are arrays of mark objects
 * @param {number|null} params.cgpa - Overall CGPA (null = auto-calculate)
 */
export function generateResultPDF({
    studentName = 'Student',
    usn = 'N/A',
    branch = '',
    scheme = '2022',
    collegeName = '',
    semesterMarks = {},
    cgpa = null,
}) {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const student = { branch };

    // ===== HEADER =====
    doc.setFillColor(28, 25, 23); // charcoal
    doc.rect(0, 0, pageWidth, 48, 'F');

    // College Name (if provided)
    if (collegeName) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(250, 250, 248);
        doc.text(collegeName, pageWidth / 2, 14, { align: 'center' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(collegeName ? 16 : 22);
    doc.setTextColor(250, 250, 248);
    doc.text('GradeFlow', 20, collegeName ? 28 : 20);

    doc.setFontSize(9);
    doc.setTextColor(200, 195, 190);
    doc.text('Academic Intelligence System · Official Transcript', 20, collegeName ? 36 : 30);

    doc.setFontSize(8);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - 20, collegeName ? 28 : 20, { align: 'right' });

    // ===== STUDENT INFO =====
    let y = 60;
    doc.setTextColor(28, 25, 23);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('STUDENT PROFILE', 20, y);

    y += 10;
    doc.setFontSize(9);
    const infoLeft = [
        ['STUDENT NAME', studentName],
        ['UNIVERSITY SEAT NUMBER', usn],
    ];
    const infoRight = [
        ['BRANCH', branch || 'N/A'],
        ['SCHEME', scheme],
    ];

    infoLeft.forEach(([label, val], i) => {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 113, 108);
        doc.text(label, 20, y + i * 14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(28, 25, 23);
        doc.text(val, 20, y + i * 14 + 5);
    });

    infoRight.forEach(([label, val], i) => {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 113, 108);
        doc.text(label, pageWidth / 2, y + i * 14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(28, 25, 23);
        doc.text(val, pageWidth / 2, y + i * 14 + 5);
    });

    y += 38;

    // ===== Line =====
    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.4);
    doc.line(20, y, pageWidth - 20, y);
    y += 12;

    // ===== SEMESTER TABLES =====
    const semesters = Object.keys(semesterMarks).sort((a, b) => Number(a) - Number(b));
    const sgpas = [];
    let totalWeightedSGPA = 0;
    let totalCredits = 0;

    semesters.forEach((sem) => {
        const marks = semesterMarks[sem];
        if (!marks || marks.length === 0) return;

        // Check page space
        if (y > 250) {
            doc.addPage();
            y = 20;
        }

        const res = calcSGPA(marks, scheme, student?.branch, Number(sem));
        totalWeightedSGPA += res.sgpa * res.totalCredits;
        totalCredits += res.totalCredits;
        sgpas.push({ semester: sem, ...res });

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(28, 25, 23);
        doc.text(`SEMESTER ${sem}`, 20, y);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(120, 113, 108);
        doc.text(`SGPA: ${res.sgpa.toFixed(2)} · Earned Credits: ${res.earnedCredits}`, pageWidth - 20, y, { align: 'right' });

        y += 4;

        const body = marks.map(m => {
            const norm = normalizeSubjectResult(m, scheme, branch, Number(sem));
            return [
                norm.subjectCode || '—',
                norm.subjectName || '—',
                norm.credits,
                norm.internalMarks ?? '—',
                norm.seeMarks ?? '—',
                norm.totalMarks ?? '—',
                norm.grade,
                norm.gpFormatted,
                norm.isPassed ? 'Pass' : 'Fail',
            ];
        });

        autoTable(doc, {
            startY: y,
            head: [['Code', 'Subject', 'CR', 'CIE', 'SEE', 'Total', 'Grade', 'GP', 'Result']],
            body,
            theme: 'grid',
            headStyles: {
                fillColor: [245, 245, 242],
                textColor: [120, 113, 108],
                fontStyle: 'bold',
                fontSize: 7,
                cellPadding: 3,
            },
            bodyStyles: {
                textColor: [28, 25, 23],
                fontSize: 8,
                cellPadding: 3,
            },
            columnStyles: {
                0: { cellWidth: 20, font: 'courier' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 10, halign: 'center' },
                3: { cellWidth: 12, halign: 'center' },
                4: { cellWidth: 12, halign: 'center' },
                5: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
                6: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
                7: { cellWidth: 12, halign: 'center' },
                8: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
            },
            margin: { left: 20, right: 20 },
            didParseCell: (data) => {
                if (data.column.index === 8 && data.section === 'body') {
                    const statusText = (data.cell.text[0] || '').toUpperCase();
                    if (statusText === 'FAIL' || statusText === 'F') {
                        data.cell.styles.textColor = [220, 38, 38];
                    } else if (statusText === 'PASS' || statusText === 'P') {
                        data.cell.styles.textColor = [22, 163, 74];
                    }
                }
            },
        });

        y = doc.lastAutoTable.finalY + 16;
    });

    // ===== PERFORMANCE SUMMARY =====
    if (y > 230) {
        doc.addPage();
        y = 20;
    }

    // Calculate CGPA
    let calculatedCGPA = cgpa;
    if (calculatedCGPA === null && sgpas.length > 0) {
        let totalWeighted = 0, totalCr = 0;
        sgpas.forEach(s => {
            totalWeighted += s.sgpa * s.totalCredits;
            totalCr += s.totalCredits;
        });
        calculatedCGPA = totalCr > 0 ? totalWeighted / totalCr : 0;
    }

    doc.setDrawColor(231, 229, 228);
    doc.setLineWidth(0.4);
    doc.line(20, y, pageWidth - 20, y);
    y += 12;

    doc.setFillColor(28, 25, 23);
    doc.roundedRect(20, y, pageWidth - 40, 40, 4, 4, 'F');

    doc.setTextColor(200, 195, 190);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('CUMULATIVE GRADE POINT AVERAGE (CGPA)', 30, y + 12);

    doc.setTextColor(250, 250, 248);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.text((calculatedCGPA || 0).toFixed(2), 30, y + 32);

    const percentage = ((calculatedCGPA || 0) - 0.75) * 10;
    doc.setFontSize(10);
    doc.setTextColor(200, 195, 190);
    doc.text(`Equivalent: ${percentage > 0 ? percentage.toFixed(1) : '0.0'}%`, pageWidth - 30, y + 28, { align: 'right' });
    doc.setFontSize(7);
    doc.text(`Formula: (CGPA - 0.75) × 10`, pageWidth - 30, y + 35, { align: 'right' });

    y += 52;

    // ===== SEMESTER SUMMARY TABLE =====
    if (sgpas.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(28, 25, 23);
        doc.text('SEMESTER-WISE PERFORMANCE', 20, y);
        y += 5;

        autoTable(doc, {
            startY: y,
            head: [['Semester', 'SGPA', 'Credits Attempted', 'Credits Earned', 'Grade Points', 'Backlogs']],
            body: sgpas.map(s => [
                `Semester ${s.semester}`,
                s.sgpa.toFixed(2),
                s.totalCredits,
                s.earnedCredits,
                s.gradePoints.toFixed(2),
                s.backlogs === 0 ? 'Clear ✓' : s.backlogs,
            ]),
            theme: 'grid',
            headStyles: { fillColor: [245, 245, 242], textColor: [120, 113, 108], fontStyle: 'bold', fontSize: 7 },
            bodyStyles: { textColor: [28, 25, 23], fontSize: 8 },
            margin: { left: 20, right: 20 },
        });

        y = doc.lastAutoTable.finalY + 16;
    }

    // ===== LEGEND =====
    if (y > 260) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(120, 113, 108);
    doc.text('LEGEND', 20, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    const legendItems = [
        'P = Pass  |  F = Fail  |  A = Absent  |  W = Withheld  |  X / NE = Not Eligible',
        'CIE = Continuous Internal Evaluation  |  SEE = Semester End Examination',
        'SGPA = Semester Grade Point Average  |  CGPA = Cumulative Grade Point Average',
    ];
    legendItems.forEach((item, i) => {
        doc.text(item, 20, y + i * 5);
    });
    y += legendItems.length * 5 + 8;

    // ===== FOOTER =====
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(168, 162, 158);
        const footerLine1 = collegeName 
            ? `${collegeName} · GradeFlow Academic Intelligence System · Page ${i}/${pageCount}` 
            : `GradeFlow · Academic Intelligence System · Page ${i}/${pageCount}`;
        doc.text(footerLine1, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
        doc.text('This is a system-generated report. Data integrity is maintained by the institutional database.', pageWidth / 2, doc.internal.pageSize.getHeight() - 4, { align: 'center' });
    }

    // Save
    const safeUsn = String(usn).replace(/[^a-zA-Z0-9_-]/g, '-');
    doc.save(`GradeFlow_${safeUsn}_Transcript.pdf`);
}
