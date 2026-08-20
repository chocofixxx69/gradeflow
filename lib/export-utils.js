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
