import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
 * Export 5-page Institutional Consolidated Result Analysis PDF matching official VTU accredited format.
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
        const cleanStr = str => (str || '').replace(/[^\x00-\x7F]/g, '');
        const currentSem = targetSemester || selectedClass?.semester || 4;

        const colName = cleanStr(institutionInfo.collegeName || 'Anjuman Institute of Technology and Management');
        const deptName = cleanStr(institutionInfo.department || `Department of ${selectedClass?.branch || 'CSE'}`);
        const addressStr = cleanStr(institutionInfo.address || '(Anjumanabad, Bhatkal - 581320)');
        const semBatchStr = cleanStr(institutionInfo.batch || `Sem ${currentSem} - ${selectedClass?.name || 'Class'}`);
        const ayStr = cleanStr(institutionInfo.ay || 'AY -2025-26 (EVEN Semester)');
        const titleStr = cleanStr(`Result Analysis - Sem ${currentSem} - University Exam`);

        const drawHeaderBox = (d) => {
            d.rect(14, 8, 269, 28);
            d.setFontSize(13);
            d.setFont(undefined, 'bold');
            d.setTextColor(27, 43, 107);
            d.text(colName, 148, 14, { align: 'center' });

            d.setFontSize(11);
            d.setFont(undefined, 'bold');
            d.setTextColor(194, 24, 91);
            d.text(deptName, 148, 19, { align: 'center' });

            d.setFontSize(8.5);
            d.setFont(undefined, 'normal');
            d.setTextColor(71, 85, 105);
            d.text(`${addressStr}  |  ${semBatchStr}  |  ${ayStr}`, 148, 25, { align: 'center' });
            d.setFont(undefined, 'bold');
            d.text(titleStr, 148, 31, { align: 'center' });
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
                    if (sm.is_backlog || sm.grade === 'F' || sm.grade === 'A' || score < 40) {
                        arrearsCount++;
                    }
                }
            });

            return { ...s, totalScore, arrearsCount };
        });

        const matrixBody = studentStats.map((s, idx) => {
            const uMarks = marksByUsn[s.usn] || {};
            const subRow = subList.map(sub => {
                const sm = uMarks[sub.code];
                if (!sm) return '—';
                return String(sm.total ?? '—');
            });
            return [idx + 1, cleanStr(s.usn), cleanStr(s.name), ...subRow];
        });

        autoTable(doc, {
            startY: 40,
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
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index >= 3) {
                    const val = data.cell.raw;
                    const num = Number(val);
                    if (!isNaN(num) && num < 40 && num >= 0) {
                        data.cell.styles.textColor = [220, 38, 38];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            }
        });

        let nextY = (doc.lastAutoTable?.finalY || 100) + 10;
        if (nextY > 160) { doc.addPage(); drawHeaderBox(doc); nextY = 40; }

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
        if (nextY > 150) { doc.addPage(); drawHeaderBox(doc); nextY = 40; }

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Result Analysis Subject Wise', 14, nextY);
        nextY += 4;

        const subjectAnalysisRows = subList.map((sub, idx) => {
            const code = sub.code;
            const facName = cleanStr(facultyMap[code] || facultyMap[sub.id] || '—');

            let app = 0, pass = 0, fail = 0;
            studentStats.forEach(s => {
                const sm = marksByUsn[s.usn]?.[code];
                if (sm) {
                    app++;
                    if (sm.passed && !sm.is_backlog && Number(sm.total) >= 40) pass++;
                    else fail++;
                }
            });

            const subPassPct = app > 0 ? ((pass / app) * 100).toFixed(2) : '0.00';
            return [idx + 1, `${cleanStr(code)}  ${cleanStr(sub.name || '')}`, facName, app, pass, fail, `${subPassPct}%`];
        });

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
            }
        });

        doc.addPage();
        drawHeaderBox(doc);
        nextY = 40;

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text('Class Toppers (Top 10)', 14, nextY);

        const top10List = [...studentStats].sort((a, b) => b.totalScore - a.totalScore).slice(0, 10);
        const toppersBody = top10List.map((s, i) => [i + 1, cleanStr(s.usn), cleanStr(s.name), s.totalScore]);

        autoTable(doc, {
            startY: nextY + 4,
            head: [['SI', 'USN', 'Name', 'Total Marks']],
            body: toppersBody,
            theme: 'grid',
            headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontSize: 8, fontStyle: 'bold' },
            styles: { fontSize: 8 },
            margin: { left: 14, right: 150 }
        });

        const arrearsList = studentStats.filter(s => s.arrearsCount > 0).sort((a, b) => b.arrearsCount - a.arrearsCount);
        const arrearsBody = arrearsList.map((s, i) => [i + 1, cleanStr(s.usn), cleanStr(s.name), s.arrearsCount]);

        doc.text('Arrears (Backlog) Analysis', 150, nextY);

        autoTable(doc, {
            startY: nextY + 4,
            head: [['SI', 'USN', 'Name', 'No of Arrears']],
            body: arrearsBody,
            theme: 'grid',
            headStyles: { fillColor: [254, 226, 226], textColor: [185, 28, 28], fontSize: 8, fontStyle: 'bold' },
            styles: { fontSize: 8 },
            margin: { left: 150, right: 14 }
        });

        const safeFileName = fileName || `${cleanStr(selectedClass?.name || 'Class').replace(/\s+/g, '_')}_Consolidated_Report.pdf`;
        doc.save(safeFileName);
    } catch (err) {
        console.error('[exportConsolidatedReportPDF] error:', err);
        alert('Failed to generate Consolidated PDF Report: ' + (err.message || err));
    }
}
