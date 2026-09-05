import * as XLSX from 'xlsx';
import _jsPDF from 'jspdf';
const jsPDF = _jsPDF?.jsPDF || _jsPDF?.default || _jsPDF;
import autoTable from 'jspdf-autotable';
import { isFailedSubject } from './vtuGrades.js';
import { AITM_LOGO_BASE64 } from './aitmLogoBase64.js';

// GradeFlow Institutional Brand Palette
const BRAND_PRIMARY = [23, 75, 77];       // #174B4D — deep executive teal
const BRAND_PRIMARY_DARK = [15, 51, 52];  // #0F3334 — dark forest teal
const BRAND_GOLD = [197, 160, 89];        // #C5A059 — AITM official crest gold
const BRAND_TINT = [253, 246, 237];       // #FDF6ED — warm cream surface
const BRAND_SURFACE = [248, 250, 252];    // soft slate
const TEXT_MAIN = [28, 25, 23];           // deep charcoal
const TEXT_MUTED = [107, 114, 112];       // soft slate
const FAIL_RED = [220, 38, 38];           // #DC2626
const FAIL_BG = [254, 242, 242];          // soft red tint
const PASS_GREEN = [22, 101, 52];         // #166534
const PASS_BG = [240, 253, 244];         // soft green tint

/**
 * Exports data to an Excel file.
 * 
 * @param {Array} data - Flat array of objects
 * @param {string} fileName - Name of the file (e.g. "Results.xlsx")
 */
export function exportToExcel(data, fileName) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
    XLSX.writeFile(workbook, fileName);
}

/**
 * Exports results to a PDF file with a table.
 * 
 * @param {object} options - { title, subtitle, columns, data, fileName }
 */
export function exportToPDF({ title, subtitle, columns, data, fileName }) {
    const doc = new jsPDF();
    
    // Add Title
    doc.setFontSize(18);
    doc.text(title, 14, 22);
    
    // Add Subtitle
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(subtitle, 14, 30);
    
    // Add Table
    autoTable(doc, {
        startY: 35,
        head: [columns],
        body: data,
        theme: 'striped',
        headStyles: { fillColor: [28, 25, 23] }, // Charcoal from design system
        styles: { fontSize: 9 }
    });
    
    doc.save(fileName);
}

/**
 * Generates a CSV blob and triggers a download.
 * Often used as "Export to Google Sheets".
 */
export function exportToCSV(data, fileName) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const csvContent = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", fileName.replace(/\.[^/.]+$/, "") + ".csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

export const GRADE_POINTS = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'P': 4, 'F': 0 };

export function scoreToGradePoint(score, grade) {
    if (grade && GRADE_POINTS[grade.toUpperCase()] !== undefined && grade.toUpperCase() !== 'P') {
        return GRADE_POINTS[grade.toUpperCase()];
    }
    const s = Number(score) || 0;
    if (s >= 90) return 10;
    if (s >= 80) return 9;
    if (s >= 70) return 8;
    if (s >= 60) return 7;
    if (s >= 50) return 6;
    if (s >= 40) return 4;
    return 0;
}

export function resolveSubjectCredits(sm, sub) {
    if (sm && sm.credits !== undefined && sm.credits !== null && !isNaN(Number(sm.credits))) {
        return Number(sm.credits);
    }
    if (sub && sub.credits !== undefined && sub.credits !== null && !isNaN(Number(sub.credits))) {
        return Number(sub.credits);
    }
    const code = (sm?.subject_code || sub?.code || '').toUpperCase();
    if (code.startsWith('BIKS') || code.startsWith('BPEK') || code.startsWith('BNSK') || code.startsWith('BYOK') || code.includes('AUDIT') || code.includes('NON-CREDIT')) {
        return 0;
    }
    return 3;
}

/**
 * Export full Class Performance Report to PDF including Overall Toppers, Subject Toppers, and Full Roster.
 */
export function exportClassReportPDF({ selectedClass, students, subjectToppers, fileName }) {
    try {
        const doc = new jsPDF();
        const cleanName = (selectedClass?.name || 'Class').replace(/[^\x00-\x7F]/g, '');

        // Header Title
        doc.setFontSize(18);
        doc.setTextColor(15, 23, 42);
        doc.text(`GradeFlow - Class Performance Report`, 14, 18);

        // Subtitle Info
        doc.setFontSize(10);
        doc.setTextColor(100, 116, 139);
        const branchStr = (selectedClass?.branch || '-').replace(/[^\x00-\x7F]/g, '');
        const semStr = String(selectedClass?.semester || '-');
        const schemeStr = (selectedClass?.scheme || '-').replace(/[^\x00-\x7F]/g, '');
        doc.text(`Class: ${cleanName}  |  Branch: ${branchStr}  |  Sem: ${semStr}  |  Scheme: ${schemeStr}  |  Students: ${students?.length || 0}`, 14, 25);
        doc.setFontSize(8);
        doc.text(`Exported on: ${new Date().toLocaleString()}`, 14, 30);

        let startY = 36;

        // 1. Overall Toppers
        const toppers = [...(students || [])].filter(s => s.has_data && s.cgpa != null).sort((a, b) => b.cgpa - a.cgpa).slice(0, 5);
        if (toppers.length > 0) {
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(`Overall Class Toppers`, 14, startY);
            startY += 4;

            autoTable(doc, {
                startY,
                head: [['Rank', 'USN', 'Student Name', 'CGPA', 'Backlogs']],
                body: toppers.map((st, i) => [
                    `Rank #${i + 1}`,
                    (st.usn || '').replace(/[^\x00-\x7F]/g, ''),
                    (st.name || '').replace(/[^\x00-\x7F]/g, ''),
                    st.cgpa ? st.cgpa.toFixed(2) : 'N/A',
                    st.total_backlogs > 0 ? `${st.total_backlogs} Backlog` : 'Clear'
                ]),
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42] },
                styles: { fontSize: 8.5 }
            });
            startY = (doc.lastAutoTable?.finalY || startY + 40) + 10;
        }

        // 2. Subject-Wise Toppers
        if (subjectToppers && subjectToppers.length > 0) {
            if (startY > 240) { doc.addPage(); startY = 20; }
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(`Subject-Wise Toppers`, 14, startY);
            startY += 4;

            const subRows = subjectToppers.map(st => {
                const topStudent = st.allScores?.[0];
                return [
                    (st.code || '').replace(/[^\x00-\x7F]/g, ''),
                    (st.name || '').replace(/[^\x00-\x7F]/g, ''),
                    (topStudent ? topStudent.name : '-').replace(/[^\x00-\x7F]/g, ''),
                    (topStudent ? topStudent.usn : '-').replace(/[^\x00-\x7F]/g, ''),
                    topStudent ? `${topStudent.total} Marks` : '-'
                ];
            });

            autoTable(doc, {
                startY,
                head: [['Subject Code', 'Subject Name', 'Top Student Name', 'USN', 'Highest Marks']],
                body: subRows,
                theme: 'striped',
                headStyles: { fillColor: [30, 41, 59] },
                styles: { fontSize: 8.5 }
            });
            startY = (doc.lastAutoTable?.finalY || startY + 40) + 10;
        }

        // 3. Full Student Roster
        if (startY > 240) { doc.addPage(); startY = 20; }
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Full Student Roster (${students?.length || 0} Students)`, 14, startY);
        startY += 4;

        const rosterRows = (students || []).map((s, idx) => [
            idx + 1,
            (s.name || '').replace(/[^\x00-\x7F]/g, ''),
            (s.usn || '').replace(/[^\x00-\x7F]/g, ''),
            s.semester || selectedClass?.semester || '-',
            s.has_data && s.cgpa != null ? s.cgpa.toFixed(2) : 'N/A',
            s.has_data ? (s.total_backlogs > 0 ? `${s.total_backlogs} Backlog` : 'Clear') : 'No Data'
        ]);

        autoTable(doc, {
            startY,
            head: [['#', 'Student Name', 'USN', 'Sem', 'CGPA', 'Backlog Status']],
            body: rosterRows,
            theme: 'striped',
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 8 }
        });

        doc.save(fileName || `${cleanName.replace(/\s+/g, '_')}_Class_Report.pdf`);
    } catch (err) {
        console.error('[exportClassReportPDF] error:', err);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert('Failed to generate PDF report: ' + (err.message || err));
        }
    }
}

/**
 * Export full Class Performance Report to CSV including Overall CGPA Toppers, SGPA Toppers, Total Marks Toppers, Subject Toppers, and Full Roster.
 */
export function exportClassReportCSV({ selectedClass, students, allMarks = [], subjects = [], subjectToppers, fileName }) {
    const cleanName = selectedClass?.name || 'Class';
    let csv = `CLASS PERFORMANCE REPORT: ${cleanName}\n`;
    csv += `Branch,${selectedClass?.branch || ''},Semester,${selectedClass?.semester || ''},Scheme,${selectedClass?.scheme || ''}\n`;
    csv += `Total Students,${students?.length || 0},Generated Date,${new Date().toLocaleDateString()}\n\n`;

    // 1. Overall CGPA Toppers
    csv += `OVERALL CLASS TOPPERS (CGPA)\nRank,USN,Name,CGPA,Backlogs\n`;
    const toppers = [...(students || [])].filter(s => s.has_data && s.cgpa != null).sort((a, b) => b.cgpa - a.cgpa).slice(0, 10);
    if (toppers.length > 0) {
        toppers.forEach((st, idx) => {
            csv += `${idx + 1},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.cgpa ? st.cgpa.toFixed(2) : '—'},${st.total_backlogs || 0}\n`;
        });
    } else {
        csv += `No result data available for toppers\n`;
    }
    csv += `\n`;

    // 2. Class Toppers by SGPA
    const marksByUsn = {};
    (allMarks || []).forEach(m => {
        if (!marksByUsn[m.usn]) marksByUsn[m.usn] = [];
        marksByUsn[m.usn].push(m);
    });

    const studentsWithComputed = (students || []).map(s => {
        const uMarks = marksByUsn[s.usn] || [];
        let totalScore = 0;
        let earnedPoints = 0;
        let totalCr = 0;
        uMarks.forEach(m => {
            const score = Number(m.total) || 0;
            totalScore += score;
            const cr = resolveSubjectCredits(m);
            const gp = scoreToGradePoint(m.total, m.grade);
            earnedPoints += (gp * cr);
            totalCr += cr;
        });
        const sgpa = totalCr > 0 ? Number((earnedPoints / totalCr).toFixed(2)) : 0;
        return { ...s, totalScore, sgpa, totalCr };
    });

    const sgpaToppers = [...studentsWithComputed].filter(s => s.sgpa > 0).sort((a, b) => {
        if (b.sgpa !== a.sgpa) return b.sgpa - a.sgpa;
        return b.totalScore - a.totalScore;
    }).slice(0, 10);
    if (sgpaToppers.length > 0) {
        csv += `CLASS TOPPERS (SGPA WISE)\nRank,USN,Name,SGPA,Credits Earned\n`;
        sgpaToppers.forEach((st, idx) => {
            csv += `${idx + 1},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.sgpa.toFixed(2)},${st.totalCr || 0}\n`;
        });
        csv += `\n`;
    }

    // 3. Class Toppers by Total Marks
    const marksToppers = [...studentsWithComputed].filter(s => s.totalScore > 0).sort((a, b) => b.totalScore - a.totalScore).slice(0, 10);
    if (marksToppers.length > 0) {
        csv += `CLASS TOPPERS (TOTAL MARKS WISE)\nRank,USN,Name,Total Marks\n`;
        marksToppers.forEach((st, idx) => {
            csv += `${idx + 1},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.totalScore}\n`;
        });
        csv += `\n`;
    }

    // 4. Subject-wise Toppers
    if (subjectToppers && subjectToppers.length > 0) {
        csv += `SUBJECT-WISE TOPPERS\nSubject Code,Subject Name,Top Student Name,USN,Highest Marks\n`;
        subjectToppers.forEach(st => {
            const topStudent = st.allScores?.[0];
            if (topStudent) {
                csv += `${st.code},"${(st.name || '').replace(/"/g, '""')}","${(topStudent.name || '').replace(/"/g, '""')}",${topStudent.usn},${topStudent.total || '—'}\n`;
            }
        });
        csv += `\n`;
    }

    // 5. Full Roster
    csv += `FULL STUDENT ROSTER\n#,USN,Name,Semester,CGPA,SGPA,Backlog Status\n`;
    (students || []).forEach((s, idx) => {
        const backlogText = s.has_data ? (s.total_backlogs > 0 ? `${s.total_backlogs} Backlog` : 'Clear') : 'No Data';
        const cgpaText = s.has_data && s.cgpa != null ? s.cgpa.toFixed(2) : '—';
        const stComputed = studentsWithComputed.find(sc => sc.usn === s.usn);
        const sgpaText = stComputed && stComputed.sgpa > 0 ? stComputed.sgpa.toFixed(2) : '—';
        csv += `${idx + 1},${s.usn},"${(s.name || '').replace(/"/g, '""')}",${s.semester || '—'},${cgpaText},${sgpaText},${backlogText}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName || `${cleanName.replace(/\s+/g, '_')}_Class_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Export Institutional Consolidated Result Analysis CSV including Toppers by Marks and Toppers by SGPA.
 */
export function exportConsolidatedReportCSV({
    selectedClass,
    students = [],
    allMarks = [],
    subjects = [],
    facultyMap = {},
    targetSemester = null,
    institutionInfo = {},
    fileName
}) {
    const currentSem = targetSemester || selectedClass?.semester || 1;
    const cleanName = selectedClass?.name || 'Class';
    const deptName = institutionInfo.department || `Department of ${selectedClass?.branch || 'CS'}`;

    let csv = `INSTITUTIONAL CONSOLIDATED RESULT ANALYSIS: ${deptName}\n`;
    csv += `Class,${cleanName},Semester,${currentSem},Academic Year,${institutionInfo.academicYear || '2025-2026'}\n`;
    csv += `Generated Date,${new Date().toLocaleDateString()}\n\n`;

    const semMarks = currentSem ? allMarks.filter(m => Number(m.semester) === Number(currentSem)) : allMarks;
    const subList = (subjects && subjects.length > 0)
        ? subjects
        : Array.from(new Set(semMarks.map(m => m.subject_code))).map(code => ({ code, name: code }));

    const marksByUsn = {};
    semMarks.forEach(m => {
        if (!marksByUsn[m.usn]) marksByUsn[m.usn] = {};
        marksByUsn[m.usn][m.subject_code] = m;
    });

    const studentStats = (students || []).map(s => {
        const uMarks = marksByUsn[s.usn] || {};
        let totalScore = 0;
        let arrearsCount = 0;
        let hasAnyResult = false;
        let earnedPoints = 0;
        let totalCredits = 0;

        subList.forEach(sub => {
            const sm = uMarks[sub.code];
            if (sm) {
                hasAnyResult = true;
                const score = Number(sm.total) || 0;
                totalScore += score;
                if (isFailedSubject(sm)) {
                    arrearsCount++;
                }
                const cr = resolveSubjectCredits(sm, sub);
                const gp = scoreToGradePoint(sm.total, sm.grade);
                earnedPoints += (gp * cr);
                totalCredits += cr;
            }
        });

        const sgpa = totalCredits > 0 ? Number((earnedPoints / totalCredits).toFixed(2)) : 0;
        return { ...s, totalScore, arrearsCount, hasAnyResult, sgpa, totalCredits };
    });

    // 1. Passing Summary
    const appearedStats = studentStats.filter(s => s.hasAnyResult);
    const totalAppeared = appearedStats.length;
    const totalPassed = appearedStats.filter(s => s.arrearsCount === 0).length;
    const totalFailed = totalAppeared - totalPassed;
    const passPct = totalAppeared > 0 ? ((totalPassed / totalAppeared) * 100).toFixed(2) : '0.00';

    csv += `CLASS PASSING PERCENTAGE SUMMARY\n`;
    csv += `No. of Students Appeared,No. of Students Passed,No. of Students Failed,Pass Percentage\n`;
    csv += `${totalAppeared},${totalPassed},${totalFailed},${passPct}%\n\n`;

    // 2. Class Toppers (Top 10) — Marks Wise
    csv += `CLASS TOPPERS (TOP 10 - MARKS WISE)\n`;
    csv += `Rank,USN,Name,Total Marks\n`;
    const top10MarksList = [...studentStats].filter(s => s.hasAnyResult).sort((a, b) => b.totalScore - a.totalScore).slice(0, 10);
    top10MarksList.forEach((st, idx) => {
        csv += `${idx + 1},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.totalScore}\n`;
    });
    csv += `\n`;

    // 3. Class Toppers (Top 10) — SGPA Wise
    csv += `CLASS TOPPERS (TOP 10 - SGPA WISE)\n`;
    csv += `Rank,USN,Name,SGPA,Credits Earned\n`;
    const top10SgpaList = [...studentStats].filter(s => s.hasAnyResult && s.sgpa > 0).sort((a, b) => {
        if (b.sgpa !== a.sgpa) return b.sgpa - a.sgpa;
        return b.totalScore - a.totalScore;
    }).slice(0, 10);
    top10SgpaList.forEach((st, idx) => {
        csv += `${idx + 1},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.sgpa.toFixed(2)},${st.totalCredits || 0}\n`;
    });
    csv += `\n`;

    // 4. Arrears (Backlog) Analysis
    csv += `ARREARS (BACKLOG) ANALYSIS\n`;
    csv += `Rank,USN,Name,No of Arrears\n`;
    const arrearsList = studentStats.filter(s => s.arrearsCount > 0).sort((a, b) => b.arrearsCount - a.arrearsCount);
    arrearsList.forEach((st, idx) => {
        csv += `${idx + 1},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.arrearsCount}\n`;
    });
    csv += `\n`;

    // 5. Complete Marks Matrix
    csv += `COMPLETE MARKS MATRIX (SEMESTER ${currentSem})\n`;
    const subHeaders = subList.map(s => `"${s.code} - ${(s.name || '').replace(/"/g, '""')}"`).join(',');
    csv += `Sl. no,USN,NAME,${subHeaders}\n`;
    studentStats.forEach((s, idx) => {
        const uMarks = marksByUsn[s.usn] || {};
        const subScores = subList.map(sub => {
            const sm = uMarks[sub.code];
            return sm ? sm.total : '—';
        }).join(',');
        csv += `${idx + 1},${s.usn},"${(s.name || '').replace(/"/g, '""')}",${subScores}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName || `${cleanName.replace(/\s+/g, '_')}_Sem${currentSem}_Consolidated_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Export Institutional Consolidated Result Analysis PDF matching official VTU accredited format:
 * marks matrix -> class passing % summary -> subject-wise analysis -> pass % bar chart ->
 * toppers (top 10 marks) -> SGPA toppers (top 10) -> arrears (backlog) analysis.
 * Features official Anjuman logo, double certificate border, GradeFlow brand palette,
 * and pristine responsive typography.
 */
export function exportConsolidatedReportPDF({
    selectedClass,
    students,
    allMarks = [],
    subjects = [],
    facultyMap = {},
    institutionInfo = {},
    targetSemester = null,
    fileName
}) {
    try {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();   // 297 mm
        const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm

        const cleanStr = str => (str || '').toString().replace(/[^\x00-\x7F]/g, '').trim();
        const currentSem = Number(targetSemester || selectedClass?.semester || 4);

        const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'];
        const toRoman = n => ROMAN[Math.max(0, Math.min(ROMAN.length - 1, Number(n) - 1))] || String(n);
        const ordinal = n => {
            const num = Number(n);
            const rem100 = num % 100;
            if (rem100 >= 11 && rem100 <= 13) return `${num}th`;
            switch (num % 10) {
                case 1: return `${num}st`;
                case 2: return `${num}nd`;
                case 3: return `${num}rd`;
                default: return `${num}th`;
            }
        };
        const yearRoman = toRoman(Math.ceil(currentSem / 2));
        const semRoman = toRoman(currentSem);
        const isEvenSem = currentSem % 2 === 0;

        const batchLabel = cleanStr(
            institutionInfo.batch ||
            selectedClass?.batch ||
            (selectedClass?.academic_year ? String(selectedClass.academic_year).split(/[-/]/)[0] : '')
        );
        const academicYearRaw = cleanStr(institutionInfo.academicYear || selectedClass?.academic_year || '');

        const colName = cleanStr(institutionInfo.collegeName || 'Anjuman Institute of Technology and Management');
        const deptName = cleanStr(institutionInfo.department || `Department of ${selectedClass?.branch || 'Computer Science & Engineering'}`);
        const addressStr = cleanStr(institutionInfo.address || '(Anjumanabad, Bhatkal - 581320)');
        const yearSemLine = `${yearRoman} Year / ${semRoman} Semester${batchLabel ? `  –  ${batchLabel} Batch` : ''}`;
        const ayStr = academicYearRaw
            ? `AY - ${academicYearRaw} (${isEvenSem ? 'EVEN' : 'ODD'} Semester)`
            : cleanStr(institutionInfo.ay || `AY (${isEvenSem ? 'EVEN' : 'ODD'} Semester)`);
        const titleStr = `Result Analysis – ${ordinal(currentSem)} semester – University Exam`;

        const oMargin = 5.5; // Outer page border margin
        const iMargin = 7.0; // Inner page border margin

        const HEADER_LEFT = 11.0;
        const HEADER_TOP = 9.5;
        const HEADER_WIDTH = pageWidth - (HEADER_LEFT * 2); // 275 mm
        const HEADER_H = 32.5;
        const CONTENT_START = HEADER_TOP + HEADER_H + 4.0;  // 46.0 mm

        const drawHeaderBox = (d) => {
            // Elegant Container with Soft Warm Cream Surface
            d.setFillColor(...BRAND_TINT);
            d.setDrawColor(...BRAND_PRIMARY);
            d.setLineWidth(0.4);
            d.roundedRect(HEADER_LEFT, HEADER_TOP, HEADER_WIDTH, HEADER_H, 1.5, 1.5, 'FD');

            // Gold Accent Divider Bar across bottom of header box
            d.setFillColor(...BRAND_GOLD);
            d.rect(HEADER_LEFT, HEADER_TOP + HEADER_H - 0.9, HEADER_WIDTH, 0.9, 'F');

            // Left Official AITM Crest Logo
            const logoH = 25.0;
            const logoW = logoH * (420 / 480); // ~21.9 mm (maintains aspect ratio)
            const logoY = HEADER_TOP + (HEADER_H - 0.9 - logoH) / 2;
            const logoLeftX = HEADER_LEFT + 4.0;
            if (AITM_LOGO_BASE64) {
                try {
                    d.addImage(AITM_LOGO_BASE64, 'PNG', logoLeftX, logoY, logoW, logoH);
                } catch (e) {
                    console.warn('[PDF Header] Left Logo embed error:', e);
                }
            }

            // Right Symmetrical AITM Crest Logo
            const logoRightX = HEADER_LEFT + HEADER_WIDTH - logoW - 4.0;
            if (AITM_LOGO_BASE64) {
                try {
                    d.addImage(AITM_LOGO_BASE64, 'PNG', logoRightX, logoY, logoW, logoH);
                } catch (e) {
                    console.warn('[PDF Header] Right Logo embed error:', e);
                }
            }

            // Centered Institutional Typography Hierarchy
            const centerX = pageWidth / 2;

            // Line 1: College Name
            d.setFont('helvetica', 'bold');
            d.setFontSize(13.0);
            d.setTextColor(...BRAND_PRIMARY);
            d.text(colName.toUpperCase(), centerX, HEADER_TOP + 6.0, { align: 'center' });

            // Line 2: Department
            d.setFontSize(10.2);
            d.setTextColor(...BRAND_PRIMARY_DARK);
            d.text(deptName.toUpperCase(), centerX, HEADER_TOP + 11.2, { align: 'center' });

            // Line 3: Address
            d.setFontSize(7.8);
            d.setFont('helvetica', 'italic');
            d.setTextColor(...TEXT_MUTED);
            d.text(addressStr, centerX, HEADER_TOP + 15.5, { align: 'center' });

            // Line 4: Year / Semester / Batch
            d.setFont('helvetica', 'bold');
            d.setFontSize(8.5);
            d.setTextColor(...TEXT_MAIN);
            d.text(yearSemLine, centerX, HEADER_TOP + 20.0, { align: 'center' });

            // Line 5: Academic Year
            d.setFont('helvetica', 'normal');
            d.setFontSize(7.8);
            d.setTextColor(75, 85, 85);
            d.text(ayStr, centerX, HEADER_TOP + 24.2, { align: 'center' });

            // Line 6: Exam Title
            d.setFont('helvetica', 'bold');
            d.setFontSize(9.5);
            d.setTextColor(...BRAND_PRIMARY);
            d.text(titleStr, centerX, HEADER_TOP + 29.2, { align: 'center' });
        };

        const semMarks = currentSem ? allMarks.filter(m => Number(m.semester) === Number(currentSem)) : allMarks;

        const subList = (subjects && subjects.length > 0)
            ? subjects
            : Array.from(new Set(semMarks.map(m => m.subject_code))).map(code => ({ code, name: code }));

        const headCols = ['Sl. no', 'USN', 'NAME', ...subList.map(s => {
            const c = cleanStr(s.code);
            const n = cleanStr(s.name || '');
            const truncated = n.length > 12 ? n.substring(0, 11) + '…' : n;
            return `${c}\n${truncated}`;
        })];

        const marksByUsn = {};
        semMarks.forEach(m => {
            if (!marksByUsn[m.usn]) marksByUsn[m.usn] = {};
            marksByUsn[m.usn][m.subject_code] = m;
        });

        const studentStats = (students || []).map(s => {
            const uMarks = marksByUsn[s.usn] || {};
            let totalScore = 0;
            let arrearsCount = 0;
            let hasAnyResult = false;
            let earnedPoints = 0;
            let totalCredits = 0;

            subList.forEach(sub => {
                const sm = uMarks[sub.code];
                if (sm) {
                    hasAnyResult = true;
                    const score = Number(sm.total) || 0;
                    totalScore += score;
                    if (isFailedSubject(sm)) {
                        arrearsCount++;
                    }
                    const cr = resolveSubjectCredits(sm, sub);
                    const gp = scoreToGradePoint(sm.total, sm.grade);
                    earnedPoints += (gp * cr);
                    totalCredits += cr;
                }
            });

            const sgpa = totalCredits > 0 ? Number((earnedPoints / totalCredits).toFixed(2)) : 0;
            return { ...s, totalScore, arrearsCount, hasAnyResult, sgpa, totalCredits };
        });

        const matrixFailFlags = [];
        const matrixBody = studentStats.map((s, idx) => {
            const uMarks = marksByUsn[s.usn] || {};
            const rowFlags = [];
            const subRow = subList.map(sub => {
                const sm = uMarks[sub.code];
                if (!sm) { rowFlags.push(false); return '—'; }
                const isFail = isFailedSubject(sm);
                rowFlags.push(isFail);
                return String(sm.total ?? '—');
            });
            matrixFailFlags.push(rowFlags);
            return [idx + 1, cleanStr(s.usn), cleanStr(s.name), ...subRow];
        });

        const availableSubWidth = 275.0 - (12 + 28 + 42); // 193.0 mm remaining
        const subColWidth = subList.length > 0 ? (availableSubWidth / subList.length) : 20.0;
        const matrixColStyles = {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 28, halign: 'left', fontStyle: 'bold', textColor: BRAND_PRIMARY },
            2: { cellWidth: 42, halign: 'left' }
        };
        subList.forEach((_, sIdx) => {
            matrixColStyles[3 + sIdx] = { cellWidth: subColWidth, halign: 'center' };
        });

        // 1. Marks Matrix Table
        autoTable(doc, {
            startY: CONTENT_START,
            head: [headCols],
            body: matrixBody,
            theme: 'grid',
            tableWidth: 275.0,
            headStyles: {
                fillColor: BRAND_PRIMARY,
                textColor: [255, 255, 255],
                fontSize: 7.0,
                fontStyle: 'bold',
                halign: 'center',
                lineColor: BRAND_GOLD,
                lineWidth: 0.25,
                cellPadding: 1.8
            },
            alternateRowStyles: {
                fillColor: BRAND_TINT
            },
            styles: {
                fontSize: 7.0,
                halign: 'center',
                cellPadding: 1.6,
                lineColor: [220, 226, 230],
                lineWidth: 0.15,
                textColor: TEXT_MAIN
            },
            columnStyles: matrixColStyles,
            margin: { top: CONTENT_START, left: 11.0, right: 11.0, bottom: 16.0 },
            didDrawPage: () => drawHeaderBox(doc),
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index >= 3) {
                    const rowFlags = matrixFailFlags[data.row.index];
                    if (rowFlags && rowFlags[data.column.index - 3]) {
                        data.cell.styles.textColor = FAIL_RED;
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = FAIL_BG;
                    }
                }
            }
        });

        // 2. Class Passing Percentage Summary & Subject Wise Analysis (Page 6)
        doc.addPage();
        drawHeaderBox(doc);
        let nextY = CONTENT_START;

        const appearedStats = studentStats.filter(s => s.hasAnyResult);
        const totalAppeared = appearedStats.length;
        const totalPassed = appearedStats.filter(s => s.arrearsCount === 0).length;
        const totalFailed = totalAppeared - totalPassed;
        const passPct = totalAppeared > 0 ? ((totalPassed / totalAppeared) * 100).toFixed(2) : '0.00';

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND_PRIMARY);
        doc.text('Class Passing Percentage Summary', 11.0, nextY);
        doc.setFillColor(...BRAND_GOLD);
        doc.rect(11.0, nextY + 1.8, 65.0, 0.6, 'F');
        nextY += 5.5;

        autoTable(doc, {
            startY: nextY,
            head: [['No. of Students Appeared', 'No. of Students Passed', 'No. of Students Failed', 'Pass Percentage']],
            body: [[totalAppeared, totalPassed, totalFailed, `${passPct}%`]],
            theme: 'grid',
            headStyles: {
                fillColor: BRAND_PRIMARY,
                textColor: [255, 255, 255],
                fontSize: 8.5,
                fontStyle: 'bold',
                halign: 'center',
                lineColor: BRAND_GOLD,
                lineWidth: 0.25
            },
            styles: {
                fontSize: 9.0,
                halign: 'center',
                fontStyle: 'bold',
                lineColor: [220, 226, 230],
                lineWidth: 0.2
            },
            margin: { left: 11.0, right: 11.0 },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 3) {
                    data.cell.styles.textColor = PASS_GREEN;
                    data.cell.styles.fillColor = PASS_BG;
                }
            }
        });

        nextY = (doc.lastAutoTable?.finalY || nextY + 20) + 9.0;

        // 3. Result Analysis Subject Wise
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND_PRIMARY);
        doc.text('Result Analysis Subject Wise', 11.0, nextY);
        doc.setFillColor(...BRAND_GOLD);
        doc.rect(11.0, nextY + 1.8, 55.0, 0.6, 'F');
        nextY += 5.5;

        const subjectStats = subList.map(sub => {
            const code = sub.code;
            const rawFacName = facultyMap[code] || facultyMap[sub.id];
            const facName = rawFacName ? cleanStr(rawFacName) : '—';

            let app = 0, pass = 0, fail = 0;
            studentStats.forEach(s => {
                const sm = marksByUsn[s.usn]?.[code];
                if (sm) {
                    app++;
                    if (isFailedSubject(sm)) fail++; else pass++;
                }
            });

            const passPct = app > 0 ? (pass / app) * 100 : 0;
            return { code, name: sub.name || code, facName, app, pass, fail, passPct };
        });

        const subjectAnalysisRows = subjectStats.map((s, idx) => [
            idx + 1,
            `${cleanStr(s.code)}  ${cleanStr(s.name)}`,
            s.facName,
            s.app,
            s.pass,
            s.fail,
            `${s.passPct.toFixed(2)}%`
        ]);

        autoTable(doc, {
            startY: nextY,
            head: [['S.No', 'Subject Name with code', 'Faculty Name', 'Appeared', 'Passed', 'Failed', 'Pass %']],
            body: subjectAnalysisRows,
            theme: 'grid',
            tableWidth: 275.0,
            headStyles: {
                fillColor: BRAND_PRIMARY,
                textColor: [255, 255, 255],
                fontSize: 8.0,
                fontStyle: 'bold',
                halign: 'left',
                lineColor: BRAND_GOLD,
                lineWidth: 0.25
            },
            alternateRowStyles: {
                fillColor: BRAND_TINT
            },
            styles: {
                fontSize: 8.0,
                halign: 'left',
                lineColor: [220, 226, 230],
                lineWidth: 0.15
            },
            columnStyles: {
                0: { cellWidth: 12, halign: 'center' },
                1: { cellWidth: 90 },
                2: { cellWidth: 60 },
                3: { cellWidth: 26, halign: 'center' },
                4: { cellWidth: 26, halign: 'center' },
                5: { cellWidth: 26, halign: 'center' },
                6: { cellWidth: 35, halign: 'center', fontStyle: 'bold', textColor: BRAND_PRIMARY }
            },
            margin: { top: CONTENT_START, left: 11.0, right: 11.0, bottom: 16.0 },
            didDrawPage: () => drawHeaderBox(doc),
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 5) {
                    const failVal = Number(data.cell.raw);
                    if (failVal > 0) {
                        data.cell.styles.textColor = FAIL_RED;
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        // 4. Result Analysis Graph & Class Toppers Total Marks (Page 7)
        doc.addPage();
        drawHeaderBox(doc);
        nextY = CONTENT_START;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND_PRIMARY);
        doc.text('Result Analysis Graph', 11.0, nextY);
        doc.setFillColor(...BRAND_GOLD);
        doc.rect(11.0, nextY + 1.8, 45.0, 0.6, 'F');
        nextY += 6.5;

        const chartX = 26, chartY = nextY, chartW = 250, chartH = 38;
        const nBars = Math.max(subjectStats.length, 1);
        const barGap = 4.0;
        const barW = Math.max((chartW / nBars) - barGap, 5.0);

        doc.setDrawColor(215, 225, 225);
        doc.setLineWidth(0.2);
        [0, 25, 50, 75, 100].forEach(v => {
            const y = chartY + chartH - (v / 100) * chartH;
            doc.line(chartX, y, chartX + chartW, y);
            doc.setFontSize(7.0);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...TEXT_MUTED);
            doc.text(String(v), chartX - 3.0, y + 1.2, { align: 'right' });
        });

        subjectStats.forEach((s, i) => {
            const barH = Math.max((s.passPct / 100) * chartH, 1.0);
            const x = chartX + i * (barW + barGap) + barGap / 2;
            const y = chartY + chartH - barH;

            // Brand primary bar fill
            doc.setFillColor(...BRAND_PRIMARY);
            doc.rect(x, y, barW, barH, 'F');

            // Gold cap on top of each bar
            doc.setFillColor(...BRAND_GOLD);
            doc.rect(x, y, barW, 0.8, 'F');

            // Pass % above bar
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...BRAND_PRIMARY);
            doc.text(`${s.passPct.toFixed(1)}%`, x + barW / 2, y - 1.5, { align: 'center' });

            // Faculty name inside bar (if tall enough)
            if (s.facName && s.facName !== '—' && barH > 14) {
                doc.setFontSize(6.0);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(255, 255, 255);
                doc.text(s.facName, x + barW / 2 + 1.0, chartY + chartH - 2.5, { angle: 90 });
            }

            // Subject label below bar
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(...TEXT_MAIN);
            const label = `${s.code} ${s.name}`.trim();
            doc.text(label.length > 22 ? label.slice(0, 22) + '…' : label, x + barW / 2, chartY + chartH + 3.8, { angle: 35, align: 'left' });
        });

        nextY = chartY + chartH + 18.0;

        // Class Toppers (Top 10 - Total Marks Wise)
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND_PRIMARY);
        doc.text('Class Toppers (Top 10 - Total Marks Wise)', 11.0, nextY);
        doc.setFillColor(...BRAND_GOLD);
        doc.rect(11.0, nextY + 1.8, 75.0, 0.6, 'F');
        nextY += 5.0;

        const top10MarksList = [...studentStats].filter(s => s.hasAnyResult).sort((a, b) => b.totalScore - a.totalScore).slice(0, 10);
        const toppersBody = top10MarksList.length > 0
            ? top10MarksList.map((s, i) => [
                `Rank #${i + 1}`,
                cleanStr(s.usn),
                cleanStr(s.name),
                `${s.totalScore} Marks`
            ])
            : [['—', '—', 'No declared result records found for this semester', '—']];

        autoTable(doc, {
            startY: nextY,
            head: [['Rank', 'USN', 'Student Name', 'Total Marks']],
            body: toppersBody,
            theme: 'grid',
            headStyles: {
                fillColor: BRAND_PRIMARY,
                textColor: [255, 255, 255],
                fontSize: 8.0,
                fontStyle: 'bold',
                lineColor: BRAND_GOLD,
                lineWidth: 0.25
            },
            alternateRowStyles: {
                fillColor: BRAND_TINT
            },
            styles: {
                fontSize: 8.0,
                lineColor: [220, 226, 230],
                lineWidth: 0.15
            },
            columnStyles: {
                0: { cellWidth: 28, fontStyle: 'bold', textColor: BRAND_PRIMARY },
                1: { cellWidth: 35, fontStyle: 'bold' },
                2: { cellWidth: 100 },
                3: { cellWidth: 40, fontStyle: 'bold', halign: 'right', textColor: BRAND_PRIMARY }
            },
            margin: { top: CONTENT_START, left: 11.0, right: 11.0, bottom: 16.0 },
            didDrawPage: () => drawHeaderBox(doc),
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 0) {
                    if (data.row.index === 0) {
                        data.cell.styles.fillColor = [254, 243, 199];
                        data.cell.styles.textColor = [180, 83, 9];
                    } else if (data.row.index === 1) {
                        data.cell.styles.fillColor = [241, 245, 249];
                        data.cell.styles.textColor = [71, 85, 105];
                    } else if (data.row.index === 2) {
                        data.cell.styles.fillColor = [255, 237, 213];
                        data.cell.styles.textColor = [194, 65, 12];
                    }
                }
            }
        });

        // 5. SGPA Wise Toppers (Top 10) (Page 8)
        doc.addPage();
        drawHeaderBox(doc);
        nextY = CONTENT_START;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...BRAND_PRIMARY);
        doc.text('SGPA Wise Toppers (Top 10)', 11.0, nextY);
        doc.setFillColor(...BRAND_GOLD);
        doc.rect(11.0, nextY + 1.8, 55.0, 0.6, 'F');
        nextY += 5.0;

        const top10SgpaList = [...studentStats].filter(s => s.hasAnyResult && s.sgpa > 0).sort((a, b) => {
            if (b.sgpa !== a.sgpa) return b.sgpa - a.sgpa;
            return b.totalScore - a.totalScore;
        }).slice(0, 10);

        const toppersSgpaBody = top10SgpaList.length > 0
            ? top10SgpaList.map((s, i) => [
                `Rank #${i + 1}`,
                cleanStr(s.usn),
                cleanStr(s.name),
                s.sgpa.toFixed(2),
                s.totalCredits ? `${s.totalCredits} Credits` : '—'
            ])
            : [['—', '—', 'No SGPA records found for this semester', '—', '—']];

        autoTable(doc, {
            startY: nextY,
            head: [['Rank', 'USN', 'Student Name', 'SGPA', 'Credits Earned']],
            body: toppersSgpaBody,
            theme: 'grid',
            headStyles: {
                fillColor: BRAND_PRIMARY,
                textColor: [255, 255, 255],
                fontSize: 8.0,
                fontStyle: 'bold',
                lineColor: BRAND_GOLD,
                lineWidth: 0.25
            },
            alternateRowStyles: {
                fillColor: BRAND_TINT
            },
            styles: {
                fontSize: 8.0,
                lineColor: [220, 226, 230],
                lineWidth: 0.15
            },
            columnStyles: {
                0: { cellWidth: 28, fontStyle: 'bold', textColor: BRAND_PRIMARY },
                1: { cellWidth: 35, fontStyle: 'bold' },
                2: { cellWidth: 100 },
                3: { cellWidth: 30, fontStyle: 'bold', halign: 'center', textColor: BRAND_PRIMARY },
                4: { cellWidth: 35, halign: 'center' }
            },
            margin: { top: CONTENT_START, left: 11.0, right: 11.0, bottom: 16.0 },
            didDrawPage: () => drawHeaderBox(doc),
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 0) {
                    if (data.row.index === 0) {
                        data.cell.styles.fillColor = [254, 243, 199];
                        data.cell.styles.textColor = [180, 83, 9];
                    } else if (data.row.index === 1) {
                        data.cell.styles.fillColor = [241, 245, 249];
                        data.cell.styles.textColor = [71, 85, 105];
                    } else if (data.row.index === 2) {
                        data.cell.styles.fillColor = [255, 237, 213];
                        data.cell.styles.textColor = [194, 65, 12];
                    }
                }
            }
        });

        // 6. Arrears (Backlog) Analysis (Page 9)
        doc.addPage();
        drawHeaderBox(doc);
        nextY = CONTENT_START;

        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(185, 28, 28);
        doc.text('Arrears (Backlog) Analysis', 11.0, nextY);
        doc.setFillColor(185, 28, 28);
        doc.rect(11.0, nextY + 1.8, 55.0, 0.6, 'F');
        nextY += 5.0;

        const arrearsList = studentStats.filter(s => s.arrearsCount > 0).sort((a, b) => b.arrearsCount - a.arrearsCount);
        const arrearsBody = arrearsList.length > 0
            ? arrearsList.map((s, i) => [
                i + 1,
                cleanStr(s.usn),
                cleanStr(s.name),
                `${s.arrearsCount} Subject(s)`
            ])
            : [['—', '—', 'All appeared students successfully cleared all subjects (Zero Backlogs)', '0 Arrears']];

        autoTable(doc, {
            startY: nextY,
            head: [['Sl', 'USN', 'Student Name', 'No of Arrears']],
            body: arrearsBody,
            theme: 'grid',
            headStyles: {
                fillColor: [185, 28, 28],
                textColor: [255, 255, 255],
                fontSize: 8.0,
                fontStyle: 'bold',
                lineColor: [220, 38, 38],
                lineWidth: 0.25
            },
            alternateRowStyles: {
                fillColor: FAIL_BG
            },
            styles: {
                fontSize: 8.0,
                lineColor: [220, 226, 230],
                lineWidth: 0.15
            },
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                1: { cellWidth: 35, fontStyle: 'bold' },
                2: { cellWidth: 110 },
                3: { cellWidth: 45, halign: 'center', fontStyle: 'bold', textColor: FAIL_RED }
            },
            margin: { top: CONTENT_START, left: 11.0, right: 11.0, bottom: 16.0 },
            didDrawPage: () => drawHeaderBox(doc)
        });

        // 7. Post-Processing: Double Certificate Border & Running Footer on EVERY page
        const totalPages = doc.getNumberOfPages();
        for (let p = 1; p <= totalPages; p++) {
            doc.setPage(p);

            // Outer Border (Executive Teal)
            doc.setDrawColor(...BRAND_PRIMARY);
            doc.setLineWidth(0.65);
            doc.rect(oMargin, oMargin, pageWidth - (oMargin * 2), pageHeight - (oMargin * 2));

            // Inner Border (AITM Crest Gold)
            doc.setDrawColor(...BRAND_GOLD);
            doc.setLineWidth(0.3);
            doc.rect(iMargin, iMargin, pageWidth - (iMargin * 2), pageHeight - (iMargin * 2));

            // Running Footer (safely inside inner border)
            doc.setFontSize(6.8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(130, 135, 135);
            doc.text(`${colName} · GradeFlow Institutional Intelligence · Page ${p} of ${totalPages}`, pageWidth / 2, 198.5, { align: 'center' });
            doc.text('This is an official system-generated institutional performance document. Affiliated to VTU, Belagavi.', pageWidth / 2, 201.8, { align: 'center' });
        }

        const safeFileName = fileName || `${cleanStr(selectedClass?.name || 'Class').replace(/\s+/g, '_')}_Consolidated_Report.pdf`;
        doc.save(safeFileName);
        return doc;
    } catch (err) {
        console.error('[exportConsolidatedReportPDF] error:', err);
        if (typeof window !== 'undefined' && typeof window.alert === 'function') {
            window.alert('Failed to generate Consolidated PDF Report: ' + (err.message || err));
        }
    }
}


/**
 * Export Class Leaderboard PDF (Overall CGPA, Semester SGPA, and Subject Marks Toppers)
 */
export function exportLeaderboardPDF({
    cohortName = 'Department',
    batchCode = 'CS',
    totalStudents = 0,
    regularCount = 0,
    lateralCount = 0,
    targetSemester = 6,
    overallLeaderboard = [],
    semesterLeaderboard = [],
    subjectLeaderboard = [],
    currentSubject = null,
    fileName
}) {
    try {
        const doc = new jsPDF();

        // 1. Header
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Class Leaderboard & Toppers Report`, 14, 18);

        doc.setFontSize(9.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Cohort: ${cohortName} (${batchCode})  |  Total: ${totalStudents} Students (${regularCount} Regular + ${lateralCount} Lateral Entry)`, 14, 25);
        doc.text(`Target Semester: Sem ${targetSemester}  |  Generated on: ${new Date().toLocaleDateString()}`, 14, 30);

        let startY = 38;

        // 2. Overall Class Toppers (CGPA) — Top 10
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Overall Class Toppers (Top 10 - CGPA Wise)', 14, startY);
        startY += 4;

        const topCgpa = (overallLeaderboard || []).slice(0, 10);
        autoTable(doc, {
            startY,
            head: [['Rank', 'USN', 'Student Name', 'CGPA', 'Semesters Tracked', 'Backlogs']],
            body: topCgpa.map(st => [
                `#${st.rank}`,
                st.usn,
                st.isLateral ? `${st.name} [Lateral]` : st.name,
                st.cgpa ? st.cgpa.toFixed(2) : '—',
                `${st.semestersTracked || 0} Sems`,
                st.totalBacklogs > 0 ? `${st.totalBacklogs} Backlog` : 'Clear'
            ]),
            theme: 'striped',
            headStyles: { fillColor: [15, 23, 42] },
            styles: { fontSize: 8.5 }
        });

        startY = (doc.lastAutoTable?.finalY || startY + 40) + 10;

        // 3. Semester Toppers (SGPA) — Top 10
        if (startY > 220) { doc.addPage(); startY = 20; }
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Semester ${targetSemester} Toppers (Top 10 - SGPA Wise)`, 14, startY);
        startY += 4;

        const topSgpa = (semesterLeaderboard || []).filter(s => s.hasAppeared).slice(0, 10);
        autoTable(doc, {
            startY,
            head: [['Rank', 'USN', 'Student Name', 'SGPA', 'Credits Earned']],
            body: topSgpa.map(st => [
                `#${st.rank}`,
                st.usn,
                st.isLateral ? `${st.name} [Lateral]` : st.name,
                st.sgpa ? st.sgpa.toFixed(2) : '—',
                `${st.credits || 20} Credits`
            ]),
            theme: 'striped',
            headStyles: { fillColor: [30, 41, 59] },
            styles: { fontSize: 8.5 }
        });

        startY = (doc.lastAutoTable?.finalY || startY + 40) + 10;

        // 4. Subject Toppers (Top 10)
        if (subjectLeaderboard && subjectLeaderboard.length > 0) {
            if (startY > 220) { doc.addPage(); startY = 20; }
            doc.setFontSize(11);
            doc.setFont(undefined, 'bold');
            doc.setTextColor(15, 23, 42);
            doc.text(`Subject Toppers: ${currentSubject?.subject_code || ''} ${currentSubject?.subject_name || 'Subject'}`, 14, startY);
            startY += 4;

            const topSub = subjectLeaderboard.slice(0, 10);
            autoTable(doc, {
                startY,
                head: [['Rank', 'USN', 'Student Name', 'CIE /50', 'SEE /50', 'Total /100', 'Grade']],
                body: topSub.map(st => [
                    `#${st.rank}`,
                    st.usn,
                    st.isLateral ? `${st.name} [Lateral]` : st.name,
                    st.internal,
                    st.external,
                    st.total,
                    st.grade
                ]),
                theme: 'striped',
                headStyles: { fillColor: [4, 120, 87] },
                styles: { fontSize: 8.5 }
            });
        }

        doc.save(fileName || `${batchCode}_Leaderboard_Report.pdf`);
    } catch (err) {
        console.error('[exportLeaderboardPDF] error:', err);
        alert('Failed to generate Leaderboard PDF Report: ' + (err.message || err));
    }
}

/**
 * Export Class Leaderboard CSV (Overall CGPA, Semester SGPA, and Subject Marks Toppers)
 */
export function exportLeaderboardCSV({
    cohortName = 'Department',
    batchCode = 'CS',
    totalStudents = 0,
    regularCount = 0,
    lateralCount = 0,
    targetSemester = 6,
    overallLeaderboard = [],
    semesterLeaderboard = [],
    subjectLeaderboard = [],
    currentSubject = null,
    fileName
}) {
    let csv = `CLASS LEADERBOARD & TOPPERS REPORT: ${cohortName} (${batchCode})\n`;
    csv += `Total Students,${totalStudents},Regular,${regularCount},Lateral Entry,${lateralCount},Target Semester,${targetSemester}\n`;
    csv += `Generated Date,${new Date().toLocaleDateString()}\n\n`;

    // 1. Overall CGPA Leaderboard
    csv += `OVERALL CLASS LEADERBOARD (CGPA WISE)\nRank,USN,Name,Type,CGPA,Semesters Tracked,Backlogs\n`;
    (overallLeaderboard || []).forEach(st => {
        csv += `${st.rank},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.isLateral ? 'Lateral Entry' : 'Regular'},${st.cgpa ? st.cgpa.toFixed(2) : '—'},${st.semestersTracked || 0},${st.totalBacklogs || 0}\n`;
    });
    csv += `\n`;

    // 2. Semester SGPA Leaderboard
    csv += `SEMESTER ${targetSemester} LEADERBOARD (SGPA WISE)\nRank,USN,Name,Type,SGPA,Credits,Status\n`;
    (semesterLeaderboard || []).forEach(st => {
        csv += `${st.rank},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.isLateral ? 'Lateral Entry' : 'Regular'},${st.sgpa ? st.sgpa.toFixed(2) : '—'},${st.credits || 0},"${st.statusText || ''}"\n`;
    });
    csv += `\n`;

    // 3. Subject-wise Leaderboard
    if (subjectLeaderboard && subjectLeaderboard.length > 0) {
        csv += `SUBJECT LEADERBOARD: ${currentSubject?.subject_code || ''} - ${currentSubject?.subject_name || ''}\nRank,USN,Name,Type,CIE /50,SEE /50,Total /100,Grade\n`;
        subjectLeaderboard.forEach(st => {
            csv += `${st.rank},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.isLateral ? 'Lateral Entry' : 'Regular'},${st.internal},${st.external},${st.total},${st.grade}\n`;
        });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName || `${batchCode}_Leaderboard_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

