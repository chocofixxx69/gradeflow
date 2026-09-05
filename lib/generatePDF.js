import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { normalizeSubjectResult } from './vtuAcademicEngine.js';
import { fetchCatalogIndex } from './subjectCreditResolver.js';
import { AITM_LOGO_BASE64 } from './aitmLogoBase64.js';

// GradeFlow brand palette
const BRAND_PRIMARY = [23, 75, 77];      // #174B4D — teal-green
const BRAND_PRIMARY_DARK = [15, 51, 52]; // deeper shade for CGPA panel
const BRAND_TINT = [253, 246, 237];      // #FDF6ED — warm cream surface
const BRAND_GOLD = [197, 160, 89];       // #C5A059 — AITM official crest gold
const TEXT_MAIN = [28, 25, 23];
const TEXT_MUTED = [107, 114, 112];
const WHITE = [250, 250, 248];
const FAIL_RED = [220, 38, 38];
const PASS_GREEN = [22, 101, 52];

const DEFAULT_COLLEGE_NAME = 'Anjuman Institute of Technology and Management';
const DEFAULT_COLLEGE_ADDRESS = 'Anjumanabad, P.O. Box No. 24, Bhatkal - 581320, Karnataka, India';
const DEFAULT_AFFILIATION = 'Affiliated to Visvesvaraya Technological University, Belagavi | Approved by AICTE, New Delhi';
const DEFAULT_ACCREDITATION = 'Accredited by NAAC  ·  Recognized by Govt. of Karnataka  ·  ESTD 1980';

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
 * Guaranteed characteristics:
 *  1. Zero split semester tables (every semester is kept atomic and complete).
 *  2. No unnecessary gaps or half-empty pages (proportional, dynamic vertical budgeting).
 *  3. No wrapped numbers in GP or monospaced subject codes.
 *  4. Clickable portfolio backlinks for Mohammed Ainan Armar & Rawahah Ruknuddin.
 *  5. Unified behavior for both student and faculty downloads.
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
    const marginX = 16;
    const maxUsableY = 262; // Safe bottom limit before running footer & border

    // ===== 1. INSTITUTION HEADER (OFFICIAL CENTERED LETTERHEAD WITH AITM CREST) =====
    // Centered high-resolution AITM crest on clean white surface, safely inside page border
    const logoH = 22; // mm
    const logoW = logoH * (420 / 480); // ~19.25mm maintaining precise aspect ratio
    const logoX = (pageWidth - logoW) / 2;
    const logoY = 9.5; // Starts comfortably below the 7.2mm inner border
    try {
        if (AITM_LOGO_BASE64) {
            doc.addImage(AITM_LOGO_BASE64, 'PNG', logoX, logoY, logoW, logoH);
        }
    } catch (err) {
        console.warn('Could not embed AITM logo in PDF:', err);
    }

    let y = logoY + logoH + 3.8;

    // Line 1: College Name (Centered, Bold, Rich Brand Primary)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...BRAND_PRIMARY);
    doc.text((collegeName || DEFAULT_COLLEGE_NAME).toUpperCase(), pageWidth / 2, y, { align: 'center' });

    // Line 2: Location
    y += 4.2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(80, 85, 85);
    doc.text(collegeAddress || DEFAULT_COLLEGE_ADDRESS, pageWidth / 2, y, { align: 'center' });

    // Line 3: Affiliation
    y += 3.8;
    doc.setFontSize(6.8);
    doc.setTextColor(...TEXT_MUTED);
    doc.text(affiliationLine || DEFAULT_AFFILIATION, pageWidth / 2, y, { align: 'center' });

    // Line 4: Accreditation & Estd (Refined Crest Gold)
    y += 3.8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(155, 118, 42);
    doc.text(DEFAULT_ACCREDITATION, pageWidth / 2, y, { align: 'center' });

    // Line 5: Department (Prominent, Centered)
    y += 4.6;
    const deptLabel = formatDepartment(department || branch);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_PRIMARY);
    doc.text(deptLabel.toUpperCase(), pageWidth / 2, y, { align: 'center' });

    // Dual Accent Divider Bars (Deep Teal + Crest Gold)
    y += 3.2;
    doc.setFillColor(...BRAND_PRIMARY);
    doc.rect(marginX, y, pageWidth - (marginX * 2), 1.1, 'F');
    doc.setFillColor(...BRAND_GOLD);
    doc.rect(marginX, y + 1.3, pageWidth - (marginX * 2), 0.35, 'F');

    // ===== 2. TRANSCRIPT TITLE =====
    y += 6.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(...BRAND_PRIMARY);
    doc.text('ACADEMIC TRANSCRIPT', pageWidth / 2, y, { align: 'center' });
    doc.setDrawColor(...BRAND_PRIMARY);
    doc.setLineWidth(0.35);
    doc.line(pageWidth / 2 - 22, y + 1.8, pageWidth / 2 + 22, y + 1.8);

    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...TEXT_MUTED);
    doc.text(`Generated: ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}`, pageWidth - marginX, y, { align: 'right' });

    y += 5.5;

    // ===== 3. STUDENT PROFILE TABLE =====
    const batchLabel = formatBatch(batch, usn);

    autoTable(doc, {
        startY: y,
        theme: 'grid',
        body: [
            ['Student Name', studentName, 'USN', usn],
            ['Department', deptLabel, 'Batch', batchLabel],
            ['Programme', 'Bachelor of Engineering (B.E.)', 'Scheme', scheme || '2022'],
        ],
        styles: { fontSize: 7.5, cellPadding: 2, lineColor: [210, 205, 198], lineWidth: 0.2 },
        columnStyles: {
            0: { fontStyle: 'bold', textColor: TEXT_MUTED, fillColor: BRAND_TINT, cellWidth: 26 },
            1: { textColor: TEXT_MAIN, fontStyle: 'bold', cellWidth: 68 },
            2: { fontStyle: 'bold', textColor: TEXT_MUTED, fillColor: BRAND_TINT, cellWidth: 24 },
            3: { textColor: TEXT_MAIN, fontStyle: 'bold', cellWidth: 'auto' },
        },
        margin: { left: marginX, right: marginX },
    });
    y = doc.lastAutoTable.finalY + 4;

    // ===== 4. VTU CBCS GRADING SCALE =====
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('VTU CBCS GRADING SCALE (B.E.)', marginX, y);
    y += 2;

    autoTable(doc, {
        startY: y,
        theme: 'grid',
        head: [GRADING_SCALE[0]],
        body: [GRADING_SCALE[1], GRADING_SCALE[2]],
        styles: { fontSize: 6.5, cellPadding: 1.5, halign: 'center', lineColor: [210, 205, 198], lineWidth: 0.2 },
        headStyles: { fillColor: BRAND_PRIMARY, textColor: WHITE, fontStyle: 'bold' },
        bodyStyles: { textColor: TEXT_MAIN },
        margin: { left: marginX, right: marginX },
    });
    y = doc.lastAutoTable.finalY + 6;

    // ===== 5. SEMESTER TABLES WITH DYNAMIC LOOKAHEAD =====
    const semesters = Object.keys(semesterMarks).sort((a, b) => Number(a) - Number(b));
    const sgpas = [];

    semesters.forEach((sem) => {
        const marks = semesterMarks[sem];
        if (!marks || marks.length === 0) return;

        const res = calcSGPA(marks, scheme, branch, Number(sem), catalogIndex);
        sgpas.push({ semester: sem, ...res });

        // Calculate exact required height for this semester block (Banner + Header + Rows + Margin)
        let tableRowsHeight = 5.0;
        marks.forEach(m => {
            const title = String(m.subject_name || m.subjectName || m.name || '');
            tableRowsHeight += title.length > 36 ? 7.8 : 5.8;
        });
        const semTotalBlockHeight = 5.5 + tableRowsHeight + 6;

        // Advance to a fresh page if this entire semester block cannot fit contiguously
        if (y + semTotalBlockHeight > maxUsableY) {
            doc.addPage();
            y = 19;
            // Running top header for continuation pages (safely inside border)
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.8);
            doc.setTextColor(...TEXT_MUTED);
            doc.text(`${(collegeName || DEFAULT_COLLEGE_NAME).toUpperCase()}  ·  ACADEMIC TRANSCRIPT  ·  ${usn}  ·  ${studentName.toUpperCase()}`, marginX, 12.5);
            doc.setDrawColor(215, 210, 205);
            doc.setLineWidth(0.25);
            doc.line(marginX, 14.5, pageWidth - marginX, 14.5);
        }

        // Semester Banner
        doc.setFillColor(...BRAND_PRIMARY);
        doc.roundedRect(marginX, y, pageWidth - (marginX * 2), 5.5, 1, 1, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.setTextColor(...WHITE);
        doc.text(`SEMESTER ${sem}`, marginX + 3, y + 3.8);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.text(`SGPA: ${res.sgpa.toFixed(2)}   |   Credits Earned: ${res.earnedCredits}`, pageWidth - marginX - 3, y + 3.8, { align: 'right' });

        y += 5.5;

        const body = marks.map(m => {
            const norm = normalizeSubjectResult(m, scheme, branch, Number(sem), catalogIndex);
            const session = m.announcedDate || m.announced_date || m.exam_date || m.exam_session || 'Regular';
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
                fontSize: 6.8,
                cellPadding: { top: 1.6, bottom: 1.6, left: 1.2, right: 1.2 },
            },
            bodyStyles: {
                textColor: TEXT_MAIN,
                fontSize: 7.2,
                cellPadding: { top: 1.6, bottom: 1.6, left: 1.2, right: 1.2 },
                lineColor: [215, 210, 205],
                lineWidth: 0.2,
            },
            columnStyles: {
                0: { cellWidth: 23, font: 'courier', fontSize: 7.2 },
                1: { cellWidth: 'auto', fontSize: 7.2 },
                2: { cellWidth: 9, halign: 'center', fontSize: 7.2 },
                3: { cellWidth: 10, halign: 'center', fontSize: 7.2 },
                4: { cellWidth: 10, halign: 'center', fontSize: 7.2 },
                5: { cellWidth: 12, halign: 'center', fontStyle: 'bold', fontSize: 7.5 },
                6: { cellWidth: 11, halign: 'center', fontSize: 7.5, fontStyle: 'bold' },
                7: { cellWidth: 13, halign: 'center', fontStyle: 'bold', fontSize: 7.5 },
                8: { cellWidth: 22, halign: 'center', fontSize: 6.2 },
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

        y = doc.lastAutoTable.finalY + 6;
    });

    // ===== 6. ACADEMIC SUMMARY & PERFORMANCE OVERVIEW =====
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

    const semTableRowsHeight = sgpas.length > 1 ? (5 + (sgpas.length * 5.0) + 6) : 0;
    const totalSummaryHeight = 16 + 4 + semTableRowsHeight + 14 + 12 + 20;

    // Advance to fresh page if entire summary block cannot fit on current page
    if (y + totalSummaryHeight > maxUsableY) {
        doc.addPage();
        y = 19;
        // Running top header for continuation pages (safely inside border)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.8);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(`${(collegeName || DEFAULT_COLLEGE_NAME).toUpperCase()}  ·  ACADEMIC TRANSCRIPT  ·  ${usn}  ·  ${studentName.toUpperCase()}`, marginX, 12.5);
        doc.setDrawColor(215, 210, 205);
        doc.setLineWidth(0.25);
        doc.line(marginX, 14.5, pageWidth - marginX, 14.5);
    }

    // CGPA Summary Card
    doc.setFillColor(...BRAND_PRIMARY_DARK);
    doc.roundedRect(marginX, y, pageWidth - (marginX * 2), 15, 1.8, 1.8, 'F');
    doc.setTextColor(214, 232, 230);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    doc.text('CGPA SUMMARY', marginX + 8, y + 6.5);
    doc.setTextColor(...WHITE);
    doc.setFontSize(14);
    doc.text((calculatedCGPA || 0).toFixed(2), marginX + 8, y + 12.5);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(214, 232, 230);
    doc.text(`Total Credits: ${totalCreditsEarned} / ${totalCreditsAttempted}`, pageWidth - marginX - 8, y + 9.5, { align: 'right' });

    y += 19;

    // Semester-Wise Performance Table (multi-semester transcripts)
    if (sgpas.length > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor(...BRAND_PRIMARY);
        doc.text('SEMESTER-WISE PERFORMANCE', marginX, y);
        y += 3.5;

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
            headStyles: { fillColor: BRAND_PRIMARY, textColor: WHITE, fontStyle: 'bold', fontSize: 6.8, cellPadding: 1.6 },
            bodyStyles: { textColor: TEXT_MAIN, fontSize: 7, cellPadding: 1.6, lineColor: [210, 205, 198], lineWidth: 0.2 },
            didParseCell: (data) => {
                if (data.column.index === 5 && data.section === 'body' && data.cell.text[0] === 'Clear') {
                    data.cell.styles.textColor = PASS_GREEN;
                    data.cell.styles.fontStyle = 'bold';
                }
            },
            margin: { left: marginX, right: marginX },
        });
        y = doc.lastAutoTable.finalY + 5;
    }

    // Legend & Disclaimer
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('LEGEND', marginX, y);
    y += 3.5;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    const legendItems = [
        'P = Pass | F = Fail | A = Absent | W = Withheld | X / NE = Not Eligible',
        'CIE = Continuous Internal Evaluation | SEE = Semester End Examination | SGPA = Semester GPA | CGPA = Cumulative GPA',
    ];
    legendItems.forEach((item, i) => {
        doc.text(item, marginX, y + i * 3.5);
    });
    y += legendItems.length * 3.5 + 4;

    doc.setDrawColor(210, 205, 198);
    doc.setLineWidth(0.2);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 4;

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.2);
    doc.setTextColor(...TEXT_MUTED);
    const disclaimer = 'Disclaimer: This transcript is system-generated from the GradeFlow platform. Data sourced from VTU public results portal and institutional records. For official academic credentials, obtain a certified transcript directly from VTU.';
    const disclaimerLines = doc.splitTextToSize(disclaimer, pageWidth - (marginX * 2));
    doc.text(disclaimerLines, marginX, y);
    y += disclaimerLines.length * 3 + 5;

    // ===== 7. ATTRIBUTION BLOCK WITH CLICKABLE PORTFOLIO BACKLINKS =====
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('© 2026 GradeFlow · Academic Intelligence System · VTU Engine', pageWidth / 2, y, { align: 'center' });
    y += 3.8;

    // Pill Badge Container
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    const t1 = 'ENGINEERED BY ';
    const w1 = doc.getTextWidth(t1);

    doc.setFontSize(7.2);
    const t2 = 'Mohammed Ainan Armar';
    const w2 = doc.getTextWidth(t2);

    const t3 = '  &  ';
    const w3 = doc.getTextWidth(t3);

    const t4 = 'Rawahah Ruknuddin';
    const w4 = doc.getTextWidth(t4);

    const totalTextW = w1 + w2 + w3 + w4;
    const pillW = Math.round(totalTextW + 14);
    const pillH = 6.2;
    const pillX = (pageWidth - pillW) / 2;

    doc.setFillColor(...BRAND_TINT);
    doc.setDrawColor(215, 210, 205);
    doc.setLineWidth(0.25);
    doc.roundedRect(pillX, y, pillW, pillH, 3.1, 3.1, 'FD');

    let textX = (pageWidth - totalTextW) / 2;
    const textY = y + 4.3;

    // Segment 1: ENGINEERED BY
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(130, 125, 120);
    doc.text(t1, textX, textY);
    textX += w1;

    // Segment 2: Mohammed Ainan Armar (WITH CLICKABLE PORTFOLIO BACKLINK)
    doc.setFontSize(7.2);
    doc.setTextColor(...TEXT_MAIN);
    doc.text(t2, textX, textY);
    doc.link(textX, y + 1, w2, 4.5, { url: 'https://ainanai.vercel.app/' });
    textX += w2;

    // Segment 3: &
    doc.setTextColor(...BRAND_PRIMARY);
    doc.text(t3, textX, textY);
    textX += w3;

    // Segment 4: Rawahah Ruknuddin (WITH CLICKABLE PORTFOLIO BACKLINK)
    doc.setTextColor(...TEXT_MAIN);
    doc.text(t4, textX, textY);
    doc.link(textX, y + 1, w4, 4.5, { url: 'https://rawahahruknuddin.vercel.app/' });

    y += pillH + 3.2;

    // Line 3: Department
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...TEXT_MUTED);
    doc.text('Department of Computer Science & Engineering', pageWidth / 2, y, { align: 'center' });

    // ===== 8. DYNAMIC PAGE FOOTER & ACADEMIC CERTIFICATE BORDER =====
    const pageCount = doc.getNumberOfPages();
    const pageHeight = doc.internal.pageSize.getHeight();
    const oMargin = 6.0;
    const iMargin = 7.2;

    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);

        // 1. Prestigious University Double Border (Teal Outer + Gold Inner)
        doc.setDrawColor(...BRAND_PRIMARY);
        doc.setLineWidth(0.65);
        doc.rect(oMargin, oMargin, pageWidth - (oMargin * 2), pageHeight - (oMargin * 2));

        doc.setDrawColor(...BRAND_GOLD);
        doc.setLineWidth(0.3);
        doc.rect(iMargin, iMargin, pageWidth - (iMargin * 2), pageHeight - (iMargin * 2));

        // 2. Running Footer (Safely contained inside the border)
        doc.setFontSize(6.8);
        doc.setTextColor(150, 145, 140);
        doc.text(`${collegeName} · GradeFlow Academic Intelligence System · Page ${i}/${pageCount}`, pageWidth / 2, 282.5, { align: 'center' });
        doc.text('This is a system-generated report. Data integrity is maintained by the institutional database.', pageWidth / 2, 286.5, { align: 'center' });
    }

    // Save in browser environment
    const safeUsn = String(usn).replace(/[^a-zA-Z0-9_-]/g, '-');
    if (typeof window !== 'undefined' && doc.save) {
        doc.save(`GradeFlow_${safeUsn}_Transcript.pdf`);
    }

    return doc;
}
