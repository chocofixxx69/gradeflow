import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

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
    doc.autoTable({
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
