/**
 * Institutional Result Parser
 * Parses VTU Result HTML content directly into structured JSON.
 */
export function parseVTUHTML(htmlContent) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // 1. Extract Student Info
    const infoTable = doc.querySelector('table.table-striped');
    const rows = infoTable ? infoTable.querySelectorAll('tr') : [];

    let studentData = {
        name: '',
        usn: '',
    };

    rows.forEach(row => {
        const text = row.textContent;
        if (text.includes('Student Name')) studentData.name = text.split(':')[1].trim();
        if (text.includes('University Seat Number')) studentData.usn = text.split(':')[1].trim();
    });

    // 2. Extract Marks
    const marksTable = doc.querySelectorAll('div.table-responsive')[1]?.querySelector('table');
    const subjects = [];

    if (marksTable) {
        const trs = marksTable.querySelectorAll('tbody tr');
        trs.forEach(tr => {
            const cols = tr.querySelectorAll('td');
            if (cols.length >= 6) {
                subjects.push({
                    code: cols[0].textContent.trim(),
                    name: cols[1].textContent.trim(),
                    cie: parseInt(cols[2].textContent.trim()),
                    see: parseInt(cols[3].textContent.trim()),
                    total: parseInt(cols[4].textContent.trim()),
                    grade: cols[5].textContent.trim(),
                    passed: cols[6].textContent.trim().toUpperCase() === 'P'
                });
            }
        });
    }

    return { ...studentData, subjects };
}
