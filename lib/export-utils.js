import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { isFailedSubject } from './vtuGrades';

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
        alert('Failed to generate PDF report: ' + (err.message || err));
    }
}

/**
 * Export full Class Performance Report to CSV including Overall Toppers, Subject Toppers, and Full Roster.
 */
export function exportClassReportCSV({ selectedClass, students, subjectToppers, fileName }) {
    const cleanName = selectedClass?.name || 'Class';
    let csv = `CLASS REPORT: ${cleanName}\n`;
    csv += `Branch,${selectedClass?.branch || ''},Semester,${selectedClass?.semester || ''},Scheme,${selectedClass?.scheme || ''}\n`;
    csv += `Total Students,${students?.length || 0},Generated Date,${new Date().toLocaleDateString()}\n\n`;

    // 1. Overall Toppers
    csv += `OVERALL CLASS TOPPERS\nRank,USN,Name,CGPA,Backlogs\n`;
    const toppers = [...(students || [])].filter(s => s.has_data && s.cgpa != null).sort((a, b) => b.cgpa - a.cgpa).slice(0, 5);
    if (toppers.length > 0) {
        toppers.forEach((st, idx) => {
            csv += `${idx + 1},${st.usn},"${(st.name || '').replace(/"/g, '""')}",${st.cgpa ? st.cgpa.toFixed(2) : '—'},${st.total_backlogs || 0}\n`;
        });
    } else {
        csv += `No result data available for toppers\n`;
    }

    csv += `\n`;

    // 2. Subject-wise Toppers
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

    // 3. Full Roster
    csv += `FULL STUDENT ROSTER\n#,USN,Name,Semester,CGPA,Backlog Status\n`;
    (students || []).forEach((s, idx) => {
        const backlogText = s.has_data ? (s.total_backlogs > 0 ? `${s.total_backlogs} Backlog` : 'Clear') : 'No Data';
        const cgpaText = s.has_data && s.cgpa != null ? s.cgpa.toFixed(2) : '—';
        csv += `${idx + 1},${s.usn},"${(s.name || '').replace(/"/g, '""')}",${s.semester || '—'},${cgpaText},${backlogText}\n`;
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
 * Export Institutional Consolidated Result Analysis PDF matching official VTU accredited format:
 * marks matrix -> class passing % summary -> subject-wise analysis -> pass % bar chart ->
 * toppers (top 10) -> arrears (backlog) analysis.
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
        const cleanStr = str => (str || '').toString().replace(/[^\x00-\x7F]/g, '');
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
        const deptName = cleanStr(institutionInfo.department || `Department of ${selectedClass?.branch || 'CSE'}`);
        const addressStr = cleanStr(institutionInfo.address || '(Anjumanabad, Bhatkal - 581320)');
        const yearSemLine = `${yearRoman} Year / ${semRoman} Semester${batchLabel ? `  –  ${batchLabel} Batch` : ''}`;
        const ayStr = academicYearRaw
            ? `AY - ${academicYearRaw} (${isEvenSem ? 'EVEN' : 'ODD'} Semester)`
            : cleanStr(institutionInfo.ay || `AY (${isEvenSem ? 'EVEN' : 'ODD'} Semester)`);
        const titleStr = `Result Analysis – ${ordinal(currentSem)} semester – University Exam`;

        const HEADER_TOP = 8;
        const HEADER_H = 34;
        const CONTENT_START = HEADER_TOP + HEADER_H + 6;

        const drawHeaderBox = (d) => {
            d.rect(14, HEADER_TOP, 269, HEADER_H);
            let y = HEADER_TOP + 6;

            d.setFontSize(13);
            d.setFont(undefined, 'bold');
            d.setTextColor(21, 41, 122);
            d.text(colName, 148, y, { align: 'center' });
            y += 5;

            d.setFontSize(10.5);
            d.setFont(undefined, 'bold');
            d.setTextColor(128, 0, 32);
            d.text(deptName, 148, y, { align: 'center' });
            y += 4.5;

            d.setFontSize(8);
            d.setFont(undefined, 'italic');
            d.setTextColor(71, 85, 105);
            d.text(addressStr, 148, y, { align: 'center' });
            y += 4.5;

            d.setFontSize(8.5);
            d.setFont(undefined, 'bold');
            d.setTextColor(30, 41, 59);
            d.text(yearSemLine, 148, y, { align: 'center' });
            y += 4;

            d.setFont(undefined, 'normal');
            d.text(ayStr, 148, y, { align: 'center' });
            y += 4.5;

            d.setFont(undefined, 'bold');
            d.setFontSize(9);
            d.text(titleStr, 148, y, { align: 'center' });
        };

        drawHeaderBox(doc);

        const semMarks = currentSem ? allMarks.filter(m => Number(m.semester) === Number(currentSem)) : allMarks;

        const subList = (subjects && subjects.length > 0)
            ? subjects
            : Array.from(new Set(semMarks.map(m => m.subject_code))).map(code => ({ code, name: code }));

        const headCols = ['Sl. no', 'USN', 'NAME', ...subList.map(s => `${cleanStr(s.code)}\n${cleanStr(s.name || '').substring(0, 10)}`)];

        const marksByUsn = {};
        semMarks.forEach(m => {
            if (!marksByUsn[m.usn]) marksByUsn[m.usn] = {};
            marksByUsn[m.usn][m.subject_code] = m;
        });

        const studentStats = (students || []).map(s => {
            const uMarks = marksByUsn[s.usn] || {};
            let totalScore = 0;
            let arrearsCount = 0;

            subList.forEach(sub => {
                const sm = uMarks[sub.code];
                if (sm) {
                    const score = Number(sm.total) || 0;
                    totalScore += score;
                    if (isFailedSubject(sm)) {
                        arrearsCount++;
                    }
                }
            });

            return { ...s, totalScore, arrearsCount };
        });

        const matrixFailFlags = [];
        const matrixBody = studentStats.map((s, idx) => {
            const uMarks = marksByUsn[s.usn] || {};
            const rowFlags = [];
            const subRow = subList.map(sub => {
                const sm = uMarks[sub.code];
                if (!sm) { rowFlags.push(false); return '—'; }
                rowFlags.push(isFailedSubject(sm));
                return String(sm.total ?? '—');
            });
            matrixFailFlags.push(rowFlags);
            return [idx + 1, cleanStr(s.usn), cleanStr(s.name), ...subRow];
        });

        autoTable(doc, {
            startY: CONTENT_START,
            head: [headCols],
            body: matrixBody,
            theme: 'grid',
            headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42], fontSize: 7.5, fontStyle: 'bold', halign: 'center' },
            styles: { fontSize: 7.5, halign: 'center', cellPadding: 2 },
            columnStyles: {
                0: { cellWidth: 12, halign: 'center' },
                1: { cellWidth: 28, halign: 'left', fontStyle: 'bold' },
                2: { cellWidth: 40, halign: 'left' }
            },
            margin: { top: CONTENT_START },
            didDrawPage: () => drawHeaderBox(doc),
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index >= 3) {
                    const rowFlags = matrixFailFlags[data.row.index];
                    if (rowFlags && rowFlags[data.column.index - 3]) {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        let nextY = (doc.lastAutoTable?.finalY || 100) + 10;
        if (nextY > 160) { doc.addPage(); drawHeaderBox(doc); nextY = CONTENT_START; }

        const totalAppeared = studentStats.length;
        const totalPassed = studentStats.filter(s => s.arrearsCount === 0).length;
        const totalFailed = totalAppeared - totalPassed;
        const passPct = totalAppeared > 0 ? ((totalPassed / totalAppeared) * 100).toFixed(2) : '0.00';

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Class Passing Percentage Summary', 14, nextY);
        nextY += 4;

        autoTable(doc, {
            startY: nextY,
            head: [['No. of Students Appeared', 'No. of Students Passed', 'No. of Students Failed', 'Pass Percentage']],
            body: [[totalAppeared, totalPassed, totalFailed, `${passPct}%`]],
            theme: 'grid',
            headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontSize: 8.5, fontStyle: 'bold', halign: 'center' },
            styles: { fontSize: 8.5, halign: 'center', fontStyle: 'bold' },
            margin: { left: 14, right: 14 }
        });

        nextY = (doc.lastAutoTable?.finalY || nextY + 20) + 8;
        if (nextY > 150) { doc.addPage(); drawHeaderBox(doc); nextY = CONTENT_START; }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Result Analysis Subject Wise', 14, nextY);
        nextY += 4;

        // Canonical per-subject stats — feeds both the subject-wise table and the bar chart below,
        // using isFailedSubject (same rule as the marks-matrix red-highlighting) instead of a raw >=40 check.
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
            headStyles: { fillColor: [226, 232, 240], textColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold', halign: 'left' },
            styles: { fontSize: 8, halign: 'left' },
            columnStyles: {
                0: { cellWidth: 12, halign: 'center' },
                1: { cellWidth: 80 },
                2: { cellWidth: 55 },
                3: { cellWidth: 28, halign: 'center' },
                4: { cellWidth: 28, halign: 'center' },
                5: { cellWidth: 28, halign: 'center' },
                6: { cellWidth: 28, halign: 'center', fontStyle: 'bold' }
            },
            margin: { top: CONTENT_START },
            didDrawPage: () => drawHeaderBox(doc)
        });

        // --- Result Analysis Graph: hand-drawn bar chart of pass % per subject ---
        doc.addPage();
        drawHeaderBox(doc);
        nextY = CONTENT_START;

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Result Analysis Graph', 14, nextY);
        nextY += 6;

        const chartX = 30, chartY = nextY, chartW = 245, chartH = 42;
        const barGap = 2;
        const nBars = Math.max(subjectStats.length, 1);
        const barW = Math.max((chartW / nBars) - barGap, 4);

        doc.setDrawColor(203, 213, 225);
        doc.setLineWidth(0.15);
        [0, 25, 50, 75, 100].forEach(v => {
            const y = chartY + chartH - (v / 100) * chartH;
            doc.line(chartX, y, chartX + chartW, y);
            doc.setFontSize(7);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(String(v), chartX - 3, y + 1, { align: 'right' });
        });

        subjectStats.forEach((s, i) => {
            const barH = Math.max((s.passPct / 100) * chartH, 0.5);
            const x = chartX + i * (barW + barGap);
            const y = chartY + chartH - barH;

            doc.setFillColor(66, 133, 244);
            doc.rect(x, y, barW, barH, 'F');

            if (s.facName && s.facName !== '—') {
                doc.setFontSize(6);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(255, 255, 255);
                doc.text(s.facName, x + barW / 2 + 1, chartY + chartH - 2, { angle: 90 });
            }

            doc.setFontSize(6.5);
            doc.setFont(undefined, 'normal');
            doc.setTextColor(30, 41, 59);
            const label = `${s.code} ${s.name}`.trim();
            doc.text(label.length > 22 ? label.slice(0, 22) + '…' : label, x + barW / 2, chartY + chartH + 4, { angle: 40, align: 'left' });
        });

        nextY = chartY + chartH + 18;
        if (nextY > 170) { doc.addPage(); drawHeaderBox(doc); nextY = CONTENT_START; }

        // --- Class Toppers (Top 10) — full-width table ---
        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Class Toppers (Top 10)', 14, nextY);
        nextY += 4;

        const top10List = [...studentStats].sort((a, b) => b.totalScore - a.totalScore).slice(0, 10);
        const toppersBody = top10List.map((s, i) => [i + 1, cleanStr(s.usn), cleanStr(s.name), s.totalScore]);

        autoTable(doc, {
            startY: nextY,
            head: [['Sl', 'USN', 'Name', 'Total Marks']],
            body: toppersBody,
            theme: 'grid',
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8.5, fontStyle: 'bold' },
            styles: { fontSize: 8.5 },
            margin: { top: CONTENT_START, left: 14, right: 14 },
            didDrawPage: () => drawHeaderBox(doc)
        });

        // --- Arrears (Backlog) Analysis — full-width table on its own page ---
        doc.addPage();
        drawHeaderBox(doc);
        nextY = CONTENT_START;

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Arrears (Backlog) Analysis', 14, nextY);
        nextY += 4;

        const arrearsList = studentStats.filter(s => s.arrearsCount > 0).sort((a, b) => b.arrearsCount - a.arrearsCount);
        const arrearsBody = arrearsList.map((s, i) => [i + 1, cleanStr(s.usn), cleanStr(s.name), s.arrearsCount]);

        autoTable(doc, {
            startY: nextY,
            head: [['Sl', 'USN', 'Name', 'No of Arrears']],
            body: arrearsBody,
            theme: 'grid',
            headStyles: { fillColor: [254, 226, 226], textColor: [185, 28, 28], fontSize: 8.5, fontStyle: 'bold' },
            styles: { fontSize: 8.5 },
            margin: { top: CONTENT_START, left: 14, right: 14 },
            didDrawPage: () => drawHeaderBox(doc)
        });

        const safeFileName = fileName || `${cleanStr(selectedClass?.name || 'Class').replace(/\s+/g, '_')}_Consolidated_Report.pdf`;
        doc.save(safeFileName);
    } catch (err) {
        console.error('[exportConsolidatedReportPDF] error:', err);
        alert('Failed to generate Consolidated PDF Report: ' + (err.message || err));
    }
}
