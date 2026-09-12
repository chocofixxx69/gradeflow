// lib/format.js
//
// Display formatting that never throws.
//
// Half the runtime crashes this app has shipped were a `.toFixed()` on a value the
// API is entitled to send as null — `Cannot read properties of null (reading
// 'toFixed')` on the batch trajectory table being the most recent. A CGPA is null
// when a student has no credited semester yet; that is correct data, and the UI's
// job is to render a dash for it, not to blow up the page.
//
// Rule: nothing formats a number for display without going through here.

/** A fixed-decimal number, or `dash` when the value isn't a finite number. */
export function fmtNum(value, decimals = 2, dash = '—') {
    const n = typeof value === 'number' ? value : Number(value);
    if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return dash;
    return n.toFixed(decimals);
}

/** SGPA/CGPA to two places, dash when absent. Zero counts as absent for GPAs. */
export function fmtGpa(value, dash = '—') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n) || n <= 0) return dash;
    return n.toFixed(2);
}

/** A percentage like "82.4%", dash when absent. */
export function fmtPercent(value, decimals = 1, dash = '—') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return dash;
    return `${n.toFixed(decimals)}%`;
}

/** An integer count; blank/NaN becomes 0 so a badge never reads "undefined". */
export function fmtCount(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th" … */
export function ordinal(n) {
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n ?? '');
    const abs = Math.abs(Math.trunc(num));
    const mod100 = abs % 100;
    if (mod100 >= 11 && mod100 <= 13) return `${num}th`;
    switch (abs % 10) {
        case 1: return `${num}st`;
        case 2: return `${num}nd`;
        case 3: return `${num}rd`;
        default: return `${num}th`;
    }
}

/** "5th Sem" — the way results are referred to on campus. */
export function ordinalSemesterLabel(semester) {
    const n = Number(semester);
    if (!Number.isFinite(n)) return 'Semester';
    return `${ordinal(n)} Sem`;
}

/**
 * The name a downloaded result PDF should carry: "5th Sem Result - 2AB23CS043".
 *
 * Faculty file these per student per exam cycle, so the semester has to lead and
 * the identifier has to be in the name. A download filename may contain spaces and
 * hyphens on every platform; only the reserved path characters are stripped.
 */
export function resultFileName({ semester = null, usn = '', suffix = 'Result', extension = '.pdf' } = {}) {
    const head = semester === null || semester === undefined || semester === ''
        ? suffix
        : `${ordinalSemesterLabel(semester)} ${suffix}`;
    const tail = String(usn || '').trim().toUpperCase();
    const name = tail ? `${head} - ${tail}` : head;
    return `${name.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()}${extension}`;
}
