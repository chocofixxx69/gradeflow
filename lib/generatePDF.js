import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizeSubjectResult } from './vtuAcademicEngine';
import { fetchCatalogIndex } from './subjectCreditResolver';

// GradeFlow's own brand palette (app/globals.css --primary / --surface-low) —
// kept as RGB triples since jsPDF doesn't accept CSS color strings.
const BRAND_PRIMARY = [23, 75, 77];      // #174B4D — teal-green
const BRAND_PRIMARY_DARK = [15, 51, 52]; // slightly deeper shade for the CGPA panel
const BRAND_TINT = [253, 246, 237];      // #FDF6ED — warm cream surface
const TEXT_MAIN = [28, 25, 23];
const TEXT_MUTED = [107, 114, 112];
const WHITE = [250, 250, 248];
const FAIL_RED = [220, 38, 38];
const PASS_GREEN = [22, 101, 52];

const DEFAULT_COLLEGE_NAME = 'Anjuman Institute of Technology and Management';
const DEFAULT_COLLEGE_ADDRESS = 'Bhatkal, Uttara Kannada, Karnataka';
const DEFAULT_AFFILIATION = 'Affiliated to VTU, Belagavi  |  Approved by AICTE';

// VTU CBCS grading scale — static reference table, matches the official
// scale printed on every VTU-affiliated transcript.
const GRADING_SCALE = [
    ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'],
    ['10', '9', '8', '7', '6', '5', '4', '0'],
    ['90-100%', '80-89%', '70-79%', '60-69%', '55-59%', '50-54%', '40-49%', '0-39%'],
];

/**
 * Calculate SGPA for a list of subjects. Subjects whose credit can't be
 * resolved from the catalog (no `catalogIndex` match) are excluded from the
 * credit/SGPA sums — never defaulted — same rule as the live dashboards.
 */
function calcSGPA(marks, scheme = '2022', branch = null, semNumber = null, catalogIndex = null) {
    let totalCredits = 0;
    let earnedCredits = 0;
    let totalCreditPoints = 0;
    let backlogs = 0;

    marks.forEach(m => {
        const norm = normalizeSubjectResult(m, scheme, branch, semNumber, catalogIndex);
        if (norm.isFailed && !norm.isAudit) backlogs++;
        if (norm.isAudit || norm.isUnresolved) return;

        totalCredits += norm.credits;
        if (norm.isPassed) {
            earnedCredits += norm.credits;
            totalCreditPoints += norm.weightedPoints;
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
 * Generate a professional PDF report for a student's academic results,
 * branded for the institution (defaults to Anjuman Institute of Technology
 * and Management — GradeFlow's only tenant) using GradeFlow's own brand
 * palette (app/globals.css --primary / --surface-low).
 *
 * @param {Object} params
 * @param {string} params.studentName - Student's full name
 * @param {string} params.usn - University Seat Number
 * @param {string} params.branch - Branch (e.g., CSE)
 * @param {string} params.scheme - Scheme (e.g., 2022)
 * @param {string} params.collegeName - Institution name (defaults to Anjuman Institute of Technology and Management)
 * @param {string} params.collegeAddress - Institution location line
 * @param {string} params.affiliationLine - Affiliation/approval line under the address
 * @param {string} params.department - Department/programme label (defaults from branch)
 * @param {string} params.batch - Admission batch/year label
 * @param {Object} params.semesterMarks - Object keyed by semester number, values are arrays of mark objects
 * @param {number|null} params.cgpa - Overall CGPA (null = auto-calculate)
 * @param {Object|null} params.catalogIndex - Pre-fetched lib/subjectCreditResolver.js
 *   index; if omitted, one is fetched here (one query) so this can still be called
 *   standalone.
 */
export async function generateResultPDF({
    studentName = 'Student',
    usn = 'N/A',
    branch = '',
    scheme = '2022',
    collegeName = DEFAULT_COLLEGE_NAME,
    collegeAddress = DEFAULT_COLLEGE_ADDRESS,
    affiliationLine = DEFAULT_AFFILIATION,
    department = '',
    batch = '',
    semesterMarks = {},
    cgpa = null,
    catalogIndex = null,
}) {
    if (!catalogIndex) {
        const { supabase } = await import('./supabase.js');
        catalogIndex = await fetchCatalogIndex(supabase);
    }

    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const student = { branch };

    // ===== INSTITUTION HEADER =====
    doc.setFillColor(...BRAND_PRIMARY);
    doc.rect(0, 0, pageWidth, 28, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...WHITE);
    doc.text(collegeName.toUpperCase(), pageWidth / 2, 12, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(214, 232, 230);
    const subtitleParts = [collegeAddress, affiliationLine].filter(Boolean);
    doc.text(subtitleParts.join('  —  '), pageWidth / 2, 20, { align: 'center' });

    // ===== TRANSCRIPT TITLE =====
    let y = 40;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_PRIMARY);
    doc.text('ACADEMIC TRANSCRIPT', pageWidth / 2, y, { align: 'center' });
    doc.setDrawColor(...BRAND_PRIMARY);
    doc.setLineWidth(0.6);
    doc.line(pageWidth / 2 - 32, y + 2.5, pageWidth / 2 + 32, y + 2.5);

    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - 20, y, { align: 'right' });

    y += 12;

    // ===== STUDENT PROFILE TABLE =====
    const deptLabel = department || (branch ? `Department of ${branch}` : 'N/A');
    // USN scheme is {digit}{college code}{admission year}{branch}{roll} (e.g.
    // 2AB23CS043 -> admission year "23") — derive the batch label from it
    // when the caller doesn't already have one on hand.
    const derivedBatch = String(usn || '').match(/^\d[A-Z]{2}(\d{2})/)?.[1];
    const batchLabel = batch || derivedBatch || 'N/A';
    autoTable(doc, {
        startY: y,
        theme: 'grid',
        body: [
            ['Student Name', studentName, 'USN', usn],
            ['Department', deptLabel, 'Batch', batchLabel],
            ['Programme', 'Bachelor of Engineering (B.E.)', 'Scheme', scheme],
        ],
        styles: { fontSize: 8.5, cellPadding: 3.5, lineColor: [210, 205, 198], lineWidth: 0.2 },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: TEXT_MUTED, fillColor: BRAND_TINT, cellWidth: 32 },
            1: { textColor: TEXT_MAIN, fontStyle: 'bold', cellWidth: 63 },
            2: { fontStyle: 'bold', textColor: TEXT_MUTED, fillColor: BRAND_TINT, cellWidth: 32 },
            3: { textColor: TEXT_MAIN, fontStyle: 'bold', cellWidth: 'auto' },
        },
        margin: { left: 20, right: 20 },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ===== VTU CBCS GRADING SCALE =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('VTU CBCS GRADING SCALE (B.E.)', 20, y);
    y += 3;

    autoTable(doc, {
        startY: y,
        theme: 'grid',
        head: [GRADING_SCALE[0]],
        body: [GRADING_SCALE[1], GRADING_SCALE[2]],
        styles: { fontSize: 7.5, cellPadding: 2.5, halign: 'center', lineColor: [210, 205, 198], lineWidth: 0.2 },
        headStyles: { fillColor: BRAND_PRIMARY, textColor: WHITE, fontStyle: 'bold' },
        bodyStyles: { textColor: TEXT_MAIN },
        margin: { left: 20, right: 20 },
    });
    y = doc.lastAutoTable.finalY + 12;

    // ===== SEMESTER TABLES =====
    const semesters = Object.keys(semesterMarks).sort((a, b) => Number(a) - Number(b));
    const sgpas = [];

    semesters.forEach((sem) => {
        const marks = semesterMarks[sem];
        if (!marks || marks.length === 0) return;

        if (y > 245) {
            doc.addPage();
            y = 20;
        }

        const res = calcSGPA(marks, scheme, student?.branch, Number(sem), catalogIndex);
        sgpas.push({ semester: sem, ...res });

        doc.setFillColor(...BRAND_PRIMARY);
        doc.rect(20, y, pageWidth - 40, 7, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...WHITE);
        doc.text(`SEMESTER ${sem}`, 23, y + 5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`SGPA: ${res.sgpa.toFixed(2)}  |  Credits Earned: ${res.earnedCredits}`, pageWidth - 23, y + 5, { align: 'right' });

        y += 7;

        const body = marks.map(m => {
            const norm = normalizeSubjectResult(m, scheme, branch, Number(sem), catalogIndex);
            const session = m.announcedDate || m.announced_date || m.exam_date || m.exam_session || 'Regular';
            return [
                norm.subjectCode || '—',
                norm.subjectName || '—',
                norm.isUnresolved ? 'UNRES.' : norm.credits,
                norm.internalMarks ?? '—',
                norm.seeMarks ?? '—',
                norm.totalMarks ?? '—',
                norm.gpFormatted,
                norm.grade,
                session,
            ];
        });

        autoTable(doc, {
            startY: y,
            head: [['Code', 'Subject', 'Cr', 'Int', 'Ext', 'Total', 'GP', 'Grade', 'Session']],
            body,
            theme: 'grid',
            headStyles: {
                fillColor: BRAND_TINT,
                textColor: TEXT_MUTED,
                fontStyle: 'bold',
                fontSize: 7,
                cellPadding: 3,
            },
            bodyStyles: {
                textColor: TEXT_MAIN,
                fontSize: 8,
                cellPadding: 3,
                lineColor: [210, 205, 198],
                lineWidth: 0.2,
            },
            columnStyles: {
                0: { cellWidth: 20, font: 'courier' },
                1: { cellWidth: 'auto' },
                2: { cellWidth: 9, halign: 'center' },
                3: { cellWidth: 11, halign: 'center' },
                4: { cellWidth: 11, halign: 'center' },
                5: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
                6: { cellWidth: 11, halign: 'center' },
                7: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
                8: { cellWidth: 22, halign: 'center', fontSize: 6.5 },
            },
            margin: { left: 20, right: 20 },
            didParseCell: (data) => {
                if (data.column.index === 7 && data.section === 'body') {
                    const gradeText = (data.cell.text[0] || '').toUpperCase();
                    if (gradeText === 'F') {
                        data.cell.styles.textColor = FAIL_RED;
                    } else if (gradeText === 'O' || gradeText === 'A+') {
                        data.cell.styles.textColor = PASS_GREEN;
                    }
                }
            },
        });

        y = doc.lastAutoTable.finalY + 10;
    });

    // ===== CGPA SUMMARY =====
    if (y > 230) {
        doc.addPage();
        y = 20;
    }

    let calculatedCGPA = cgpa;
    if (calculatedCGPA === null && sgpas.length > 0) {
        let totalWeighted = 0, totalCr = 0;
        sgpas.forEach(s => {
            totalWeighted += s.sgpa * s.totalCredits;
            totalCr += s.totalCredits;
        });
        calculatedCGPA = totalCr > 0 ? totalWeighted / totalCr : 0;
    }
    const totalCreditsEarned = sgpas.reduce((a, s) => a + s.earnedCredits, 0);
    const totalCreditsAttempted = sgpas.reduce((a, s) => a + s.totalCredits, 0);

    doc.setFillColor(...BRAND_PRIMARY_DARK);
    doc.roundedRect(20, y, pageWidth - 40, 22, 3, 3, 'F');

    doc.setTextColor(214, 232, 230);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('CGPA SUMMARY', 28, y + 9);

    doc.setTextColor(...WHITE);
    doc.setFontSize(20);
    doc.text((calculatedCGPA || 0).toFixed(2), 28, y + 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(214, 232, 230);
    doc.text(`Total Credits: ${totalCreditsEarned} / ${totalCreditsAttempted}`, pageWidth - 28, y + 13, { align: 'right' });

    y += 34;

    // ===== SEMESTER-WISE PERFORMANCE =====
    if (sgpas.length > 0) {
        if (y > 240) { doc.addPage(); y = 20; }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BRAND_PRIMARY);
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
                s.backlogs === 0 ? 'Clear' : s.backlogs,
            ]),
            theme: 'grid',
            headStyles: { fillColor: BRAND_PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 7 },
            bodyStyles: { textColor: TEXT_MAIN, fontSize: 8, lineColor: [210, 205, 198], lineWidth: 0.2 },
            didParseCell: (data) => {
                if (data.column.index === 5 && data.section === 'body' && data.cell.text[0] === 'Clear') {
                    data.cell.styles.textColor = PASS_GREEN;
                    data.cell.styles.fontStyle = 'bold';
                }
            },
            margin: { left: 20, right: 20 },
        });

        y = doc.lastAutoTable.finalY + 12;
    }

    // ===== LEGEND =====
    if (y > 255) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...TEXT_MUTED);
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
    y += legendItems.length * 5 + 10;

    // ===== DISCLAIMER =====
    if (y > 265) { doc.addPage(); y = 20; }
    doc.setDrawColor(210, 205, 198);
    doc.setLineWidth(0.2);
    doc.line(20, y, pageWidth - 20, y);
    y += 6;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT_MUTED);
    const disclaimer = `Disclaimer: This transcript is system-generated from the GradeFlow platform. The data is sourced from VTU's public results portal and institutional records, and is provided for informational and reference purposes only. For official academic credentials, please obtain a certified transcript directly from VTU.`;
    const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - 40);
    doc.text(disclaimerLines, 20, y);

    // ===== FOOTER =====
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 145, 140);
        doc.text(`${collegeName} · GradeFlow Academic Intelligence System · Page ${i}/${pageCount}`, pageWidth / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' });
        doc.text('This is a system-generated report. Data integrity is maintained by the institutional database.', pageWidth / 2, doc.internal.pageSize.getHeight() - 4, { align: 'center' });
    }

    // Save
    const safeUsn = String(usn).replace(/[^a-zA-Z0-9_-]/g, '-');
    doc.save(`GradeFlow_${safeUsn}_Transcript.pdf`);
}
