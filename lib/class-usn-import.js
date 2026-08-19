import * as XLSX from 'xlsx';

function extractUsnsFromWorkbook(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) return [];

    const header = (rows[0] || []).map(value => String(value).trim().toLowerCase());
    const usnIndex = header.findIndex(value => ['usn', 'usno', 'university seat number', 'roll no', 'rollno', 'roll number'].includes(value));
    const column = usnIndex >= 0 ? usnIndex : 0;

    return rows.slice(usnIndex >= 0 ? 1 : 0)
        .map(row => String(row[column] || '').trim().toUpperCase())
        .filter(Boolean);
}

export async function parseClassUsns(file) {
    const extension = file.name.split('.').pop().toLowerCase();
    const workbook = extension === 'csv'
        ? XLSX.read(await file.text(), { type: 'string' })
        : XLSX.read(await file.arrayBuffer(), { type: 'array' });

    return extractUsnsFromWorkbook(workbook);
}
