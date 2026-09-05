import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizeSubjectResult } from './vtuAcademicEngine.js';
import { fetchCatalogIndex } from './subjectCreditResolver.js';

// GradeFlow brand palette
const BRAND_PRIMARY = [23, 75, 77];      // #174B4D — teal-green
const BRAND_PRIMARY_DARK = [15, 51, 52]; // deeper shade for CGPA panel
const BRAND_TINT = [253, 246, 237];      // #FDF6ED — warm cream surface
const TEXT_MAIN = [28, 25, 23];
const TEXT_MUTED = [107, 114, 112];
const WHITE = [250, 250, 248];
const FAIL_RED = [220, 38, 38];
const PASS_GREEN = [22, 101, 52];

const DEFAULT_COLLEGE_NAME = 'Anjuman Institute of Technology and Management';
const DEFAULT_COLLEGE_ADDRESS = 'Bhatkal, Uttara Kannada, Karnataka';
const DEFAULT_AFFILIATION = 'Affiliated to VTU, Belagavi  |  Approved by AICTE';

// VTU CBCS grading scale
const GRADING_SCALE = [
    ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'],
    ['10', '9', '8', '7', '6', '5', '4', '0'],
    ['90-100%', '80-89%', '70-79%', '60-69%', '55-59%', '50-54%', '40-49%', '0-39%'],
];

/**
 * Normalizes branch into standard institutional department label.
 */
function formatDepartment(branch) {
    if (!branch) return 'Department of Engineering';
    const b = String(branch).trim();
    if (b.toLowerCase().startsWith('department of')) return b;

    const map = {
        'CS': 'Department of Computer Science & Engineering (CSE)',
        'CSE': 'Department of Computer Science & Engineering (CSE)',
        'CD': 'Department of Computer Science & Engineering (Data Science)',
        'DS': 'Department of Computer Science & Engineering (Data Science)',
        'CI': 'Department of AI & Machine Learning (AIML)',
        'AI': 'Department of AI & Machine Learning (AIML)',
        'AIML': 'Department of AI & Machine Learning (AIML)',
        'EC': 'Department of Electronics & Communication Engineering (ECE)',
        'ECE': 'Department of Electronics & Communication Engineering (ECE)',
        'EE': 'Department of Electrical & Electronics Engineering (EEE)',
        'EEE': 'Department of Electrical & Electronics Engineering (EEE)',
        'ME': 'Department of Mechanical Engineering',
        'MECH': 'Department of Mechanical Engineering',
        'CV': 'Department of Civil Engineering',
        'CIVIL': 'Department of Civil Engineering',
        'RI': 'Department of Robotics & Artificial Intelligence (RAI)',
    };
    if (map[b.toUpperCase()]) return map[b.toUpperCase()];
    if (b.includes('(') || b.toLowerCase().includes('engineering') || b.toLowerCase().includes('science')) {
        return `Department of ${b.replace(/^department of\s*/i, '')}`;
    }
    return `Department of ${b}`;
}

/**
 * Expands batch into formal graduation window (e.g. 23 -> "2023 – 2027 (2023 Batch)").
 */
function formatBatch(batch, usn) {
    if (batch && String(batch).length >= 4) return String(batch);
    const u = String(usn || '').toUpperCase().trim();
    const m = u.match(/^\d[A-Z]{2}(\d{2})/);
    if (m) {
        const startYear = 2000 + parseInt(m[1], 10);
        const endYear = startYear + 4;
        return `${startYear} – ${endYear} (${startYear} Batch)`;
    }
    return batch || 'N/A';
}

/**
 * Calculate SGPA for a list of subjects using canonical credit resolution.
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
 * Generate a professional, cohesive PDF report for student results.
 * Structure guarantees that:
 *  1. No semester table is ever cut or split across pages.
 *  2. Grade Point (GP) and subject codes never wrap awkwardly into multiple lines.
 *  3. Summary and legend sections remain cohesive without creating empty trailing pages.
 *  4. Works identically for student downloads, faculty downloads, and single-semester exports.
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
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 16;
    const maxUsableY = 262; // Printable boundary before reaching page footer

    // ===== INSTITUTION HEADER =====
    doc.setFillColor(...BRAND_PRIMARY);
    doc.rect(0, 0, pageWidth, 26, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...WHITE);
    doc.text(collegeName.toUpperCase(), pageWidth / 2, 11, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(214, 232, 230);
    const subtitleParts = [collegeAddress, affiliationLine].filter(Boolean);
    doc.text(subtitleParts.join('  —  '), pageWidth / 2, 19, { align: 'center' });

    // ===== TRANSCRIPT TITLE =====
    let y = 35;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...BRAND_PRIMARY);
    doc.text('ACADEMIC TRANSCRIPT', pageWidth / 2, y, { align: 'center' });
    doc.setDrawColor(...BRAND_PRIMARY);
    doc.setLineWidth(0.5);
    doc.line(pageWidth / 2 - 28, y + 2, pageWidth / 2 + 28, y + 2);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - marginX, y, { align: 'right' });

    y += 9;

    // ===== STUDENT PROFILE TABLE =====
    const deptLabel = formatDepartment(department || branch);
    const batchLabel = formatBatch(batch, usn);

    autoTable(doc, {
        startY: y,
        theme: 'grid',
        body: [
            ['Student Name', studentName, 'USN', usn],
            ['Department', deptLabel, 'Batch', batchLabel],
            ['Programme', 'Bachelor of Engineering (B.E.)', 'Scheme', scheme || '2022'],
        ],
        styles: { fontSize: 8, cellPadding: 2.8, lineColor: [210, 205, 198], lineWidth: 0.2 },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: TEXT_MUTED, fillColor: BRAND_TINT, cellWidth: 30 },
            1: { textColor: TEXT_MAIN, fontStyle: 'bold', cellWidth: 67 },
            2: { fontStyle: 'bold', textColor: TEXT_MUTED, fillColor: BRAND_TINT, cellWidth: 26 },
            3: { textColor: TEXT_MAIN, fontStyle: 'bold', cellWidth: 'auto' },
        },
        margin: { left: marginX, right: marginX },
    });
    y = doc.lastAutoTable.finalY + 6;

    // ===== VTU CBCS GRADING SCALE =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('VTU CBCS GRADING SCALE (B.E.)', marginX, y);
    y += 2.5;

    autoTable(doc, {
        startY: y,
        theme: 'grid',
        head: [GRADING_SCALE[0]],
        body: [GRADING_SCALE[1], GRADING_SCALE[2]],
        styles: { fontSize: 7, cellPadding: 2, halign: 'center', lineColor: [210, 205, 198], lineWidth: 0.2 },
        headStyles: { fillColor: BRAND_PRIMARY, textColor: WHITE, fontStyle: 'bold' },
        bodyStyles: { textColor: TEXT_MAIN },
        margin: { left: marginX, right: marginX },
    });
    y = doc.lastAutoTable.finalY + 8;

    // ===== SEMESTER TABLES WITH DYNAMIC LOOKAHEAD =====
    const semesters = Object.keys(semesterMarks).sort((a, b) => Number(a) - Number(b));
    const sgpas = [];

    semesters.forEach((sem) => {
        const marks = semesterMarks[sem];
        if (!marks || marks.length === 0) return;

        const res = calcSGPA(marks, scheme, branch, Number(sem), catalogIndex);
        sgpas.push({ semester: sem, ...res });

        // Calculate exact required height for this semester block (Banner + Header + Rows + Spacing)
        let estimatedTableHeight = 6.0;
        marks.forEach(m => {
            const title = String(m.subject_name || m.subjectName || m.name || '');
            estimatedTableHeight += title.length > 36 ? 8.8 : 6.4;
        });
        const semTotalBlockHeight = 6.5 + estimatedTableHeight + 7;

        // CRITICAL: If the semester cannot fit completely on the current page,
        // advance to a fresh page BEFORE rendering the banner!
        if (y + semTotalBlockHeight > maxUsableY) {
            doc.addPage();
            y = 16;
        }

        // Semester Banner
        doc.setFillColor(...BRAND_PRIMARY);
        doc.roundedRect(marginX, y, pageWidth - (marginX * 2), 6.5, 1.2, 1.2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...WHITE);
        doc.text(`SEMESTER ${sem}`, marginX + 3, y + 4.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(`SGPA: ${res.sgpa.toFixed(2)}   |   Credits Earned: ${res.earnedCredits}`, pageWidth - marginX - 3, y + 4.5, { align: 'right' });

        y += 6.5;

        const body = marks.map(m => {
            const norm = normalizeSubjectResult(m, scheme, branch, Number(sem), catalogIndex);
            const session = m.announcedDate || m.announced_date || m.exam_date || m.exam_session || 'Regular';
            // Format Grade Point cleanly as integer matching the VTU scale (prevents awkward wrapping)
            const gpDisplay = (norm.gradePoint !== null && norm.gradePoint !== undefined)
                ? String(norm.gradePoint)
                : '—';

            return [
                norm.subjectCode || '—',
                norm.subjectName || '—',
                norm.isUnresolved ? 'UNRES.' : (norm.credits ?? '—'),
                norm.internalMarks ?? '—',
                norm.seeMarks ?? '—',
                norm.totalMarks ?? '—',
                gpDisplay,
                norm.grade || '—',
                session,
            ];
        });

        autoTable(doc, {
            startY: y,
            head: [['Code', 'Subject', 'Cr', 'Int', 'Ext', 'Total', 'GP', 'Grade', 'Session']],
            body,
            theme: 'grid',
            pageBreak: 'avoid',
            headStyles: {
                fillColor: BRAND_TINT,
                textColor: TEXT_MUTED,
                fontStyle: 'bold',
                fontSize: 7,
                cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
            },
            bodyStyles: {
                textColor: TEXT_MAIN,
                fontSize: 7.5,
                cellPadding: { top: 2, bottom: 2, left: 1.5, right: 1.5 },
                lineColor: [215, 210, 205],
                lineWidth: 0.2,
            },
            columnStyles: {
                0: { cellWidth: 23, font: 'courier', fontSize: 7.5 },
                1: { cellWidth: 'auto', fontSize: 7.5 },
                2: { cellWidth: 9, halign: 'center', fontSize: 7.5 },
                3: { cellWidth: 10, halign: 'center', fontSize: 7.5 },
                4: { cellWidth: 10, halign: 'center', fontSize: 7.5 },
                5: { cellWidth: 12, halign: 'center', fontStyle: 'bold', fontSize: 8 },
                6: { cellWidth: 11, halign: 'center', fontSize: 8, fontStyle: 'bold' },
                7: { cellWidth: 13, halign: 'center', fontStyle: 'bold', fontSize: 8 },
                8: { cellWidth: 22, halign: 'center', fontSize: 6.5 },
            },
            margin: { left: marginX, right: marginX },
            didParseCell: (data) => {
                if (data.column.index === 7 && data.section === 'body') {
                    const gradeText = (data.cell.text[0] || '').toUpperCase();
                    if (gradeText === 'F' || gradeText === 'AB') {
                        data.cell.styles.textColor = FAIL_RED;
                    } else if (gradeText === 'O' || gradeText === 'A+' || gradeText === 'A') {
                        data.cell.styles.textColor = PASS_GREEN;
                    }
                }
            },
        });

        y = doc.lastAutoTable.finalY + 8;
    });

    // ===== ACADEMIC SUMMARY & PERFORMANCE OVERVIEW =====
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

    const semTableRowsHeight = sgpas.length > 1 ? (7 + (sgpas.length * 5.8) + 8) : 0;
    const totalSummaryHeight = 20 + 6 + semTableRowsHeight + 16 + 14;

    // Check if entire summary block fits together on current page
    if (y + totalSummaryHeight > maxUsableY) {
        doc.addPage();
        y = 16;
    }

    // CGPA Summary Card
    doc.setFillColor(...BRAND_PRIMARY_DARK);
    doc.roundedRect(marginX, y, pageWidth - (marginX * 2), 18, 2, 2, 'F');
    doc.setTextColor(214, 232, 230);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CGPA SUMMARY', marginX + 8, y + 7.5);
    doc.setTextColor(...WHITE);
    doc.setFontSize(16);
    doc.text((calculatedCGPA || 0).toFixed(2), marginX + 8, y + 14.5);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(214, 232, 230);
    doc.text(`Total Credits: ${totalCreditsEarned} / ${totalCreditsAttempted}`, pageWidth - marginX - 8, y + 11.5, { align: 'right' });

    y += 24;

    // Semester-Wise Performance Table (shown for multi-semester transcripts)
    if (sgpas.length > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...BRAND_PRIMARY);
        doc.text('SEMESTER-WISE PERFORMANCE', marginX, y);
        y += 4;

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
            pageBreak: 'avoid',
            headStyles: { fillColor: BRAND_PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 7, cellPadding: 2 },
            bodyStyles: { textColor: TEXT_MAIN, fontSize: 7.5, cellPadding: 2, lineColor: [210, 205, 198], lineWidth: 0.2 },
            didParseCell: (data) => {
                if (data.column.index === 5 && data.section === 'body' && data.cell.text[0] === 'Clear') {
                    data.cell.styles.textColor = PASS_GREEN;
                    data.cell.styles.fontStyle = 'bold';
                }
            },
            margin: { left: marginX, right: marginX },
        });
        y = doc.lastAutoTable.finalY + 8;
    }

    // Legend
    if (y + 30 > maxUsableY) {
        doc.addPage();
        y = 16;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEGEND', marginX, y);
    y += 4.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    const legendItems = [
        'P = Pass | F = Fail | A = Absent | W = Withheld | X / NE = Not Eligible',
        'CIE = Continuous Internal Evaluation | SEE = Semester End Examination',
        'SGPA = Semester Grade Point Average | CGPA = Cumulative Grade Point Average',
    ];
    legendItems.forEach((item, i) => {
        doc.text(item, marginX, y + i * 4);
    });
    y += legendItems.length * 4 + 6;

    // Disclaimer
    doc.setDrawColor(210, 205, 198);
    doc.setLineWidth(0.2);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(...TEXT_MUTED);
    const disclaimer = 'Disclaimer: This transcript is system-generated from the GradeFlow platform. The data is sourced from VTU\'s public results portal and institutional records, and is provided for informational and reference purposes only. For official academic credentials, please obtain a certified transcript directly from VTU.';
    const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - (marginX * 2));
    doc.text(disclaimerLines, marginX, y);

    // ===== DYNAMIC PAGE FOOTER =====
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(150, 145, 140);
        doc.text(`${collegeName} · GradeFlow Academic Intelligence System · Page ${i}/${pageCount}`, pageWidth / 2, 287, { align: 'center' });
        doc.text('This is a system-generated report. Data integrity is maintained by the institutional database.', pageWidth / 2, 291, { align: 'center' });
    }

    // Save in browser environment
    const safeUsn = String(usn).replace(/[^a-zA-Z0-9_-]/g, '-');
    if (typeof window !== 'undefined' && doc.save) {
        doc.save(`GradeFlow_${safeUsn}_Transcript.pdf`);
    }

    return doc;
}
