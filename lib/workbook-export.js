// lib/workbook-export.js
//
// THE single way this app hands a spreadsheet to the user.
//
// Two symptoms sent us here, and both are encoding/plumbing problems rather than
// data problems:
//
//   1. "Export Excel comes in Chinese mode" — a workbook handed to the browser
//      without an explicit bookType and without the XLSX MIME type is at the mercy
//      of whatever Excel guesses. SheetJS's `writeFile()` derives the book type from
//      the filename extension and downloads the bytes as `application/octet-stream`,
//      so anything that disturbs either (a filename that picks up a dot, a proxy
//      rewriting the type, Excel falling back to its ANSI text importer) lands the
//      user in a mojibake text import — CJK glyphs on a Windows install whose
//      non-Unicode codepage is not 1252. Writing `{ bookType: 'xlsx', type: 'array' }`
//      and shipping the bytes as a Blob with the real OOXML MIME removes every
//      guess from the chain.
//
//   2. "CSV export should be directly seen in Excel" — Excel only reads a .csv as
//      UTF-8 when the file opens with a BOM. Without it, every non-ASCII character
//      (this app emits em dashes, ≥, • and student names with diacritics) decodes
//      through the system ANSI codepage and the columns can break apart. BOM plus
//      CRLF line endings plus RFC-4180 quoting makes a CSV open cleanly on a
//      double-click, on every Excel version.
//
// Everything that exports a spreadsheet should import from here so the two fixes
// above stay fixed.

import { getXLSX } from './lazy-export-libs.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
export const CSV_MIME = 'text/csv;charset=utf-8';

/** Excel's own limits: 31 characters, and none of : \ / ? * [ ] */
export function sanitizeSheetName(name, fallback = 'Sheet1') {
    const cleaned = String(name || '')
        .replace(/[:\\/?*[\]]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 31);
    return cleaned || fallback;
}

/** A filename Windows, macOS and every browser will accept, ending in `ext`. */
export function safeFileName(name, ext) {
    const base = String(name || 'export')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^[-_.]+|[-_.]+$/g, '')
        .slice(0, 120) || 'export';
    const suffix = ext.startsWith('.') ? ext : `.${ext}`;
    return base.toLowerCase().endsWith(suffix.toLowerCase()) ? base : `${base}${suffix}`;
}

/**
 * Hands a Blob to the browser as a download. Object URLs are revoked on the next
 * tick rather than immediately — Safari cancels an in-flight download if the URL
 * dies in the same frame.
 */
export function downloadBlob(blob, fileName) {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
        throw new Error('downloadBlob() is browser-only.');
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const NUMERIC_RE = /^-?(?:\d+|\d*\.\d+)(?:[eE][+-]?\d+)?$/;

function isBlank(v) {
    return v === null || v === undefined || v === '';
}

/**
 * One spreadsheet cell.
 *
 * Numbers are written as NUMBERS, so Excel can sum, sort and chart a column of
 * CGPAs instead of treating "8.22" as text. A numeric-looking string is converted
 * too, except when it is obviously an identifier that must keep its shape (a USN,
 * a leading-zero roll number) — those stay text.
 */
function toCell(value, { numberFormat } = {}) {
    if (isBlank(value)) return { t: 's', v: '' };
    if (value instanceof Date) return { t: 'd', v: value, z: 'dd-mmm-yyyy' };
    if (typeof value === 'boolean') return { t: 'b', v: value };
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return { t: 's', v: '' };
        return numberFormat ? { t: 'n', v: value, z: numberFormat } : { t: 'n', v: value };
    }

    const str = String(value);
    const trimmed = str.trim();
    const keepAsText = /^0\d/.test(trimmed) || trimmed.length > 15;
    if (!keepAsText && NUMERIC_RE.test(trimmed)) {
        const n = Number(trimmed);
        if (Number.isFinite(n)) return numberFormat ? { t: 'n', v: n, z: numberFormat } : { t: 'n', v: n };
    }
    return { t: 's', v: str };
}

/**
 * Builds a worksheet from a header row and a matrix of values.
 *
 * `rows` may also contain leading "banner" rows of differing width (report titles,
 * filter lines) — pass them in `preamble` and they are written above the header
 * without disturbing the column sizing.
 */
export function buildSheet(XLSX, { headers = [], rows = [], preamble = [], numberFormats = {}, autoFilter = true } = {}) {
    const matrix = [];
    for (const line of preamble) matrix.push(Array.isArray(line) ? line : [line]);
    const headerRowIndex = matrix.length;
    if (headers.length) matrix.push(headers);
    for (const row of rows) matrix.push(Array.isArray(row) ? row : [row]);

    const ws = {};
    let maxCol = 0;
    const widths = [];

    matrix.forEach((row, r) => {
        row.forEach((value, c) => {
            if (c > maxCol) maxCol = c;
            const isHeader = headers.length > 0 && r === headerRowIndex;
            const cell = isHeader
                ? { t: 's', v: String(value ?? '') }
                : toCell(value, { numberFormat: numberFormats[headers[c]] });
            if (cell.t === 's' && cell.v === '' && !isHeader) return; // leave truly empty cells empty
            ws[XLSX.utils.encode_cell({ r, c })] = cell;

            // Banner rows span the sheet and would size column A to the whole
            // title, so only the header and data rows drive column widths.
            if (r >= headerRowIndex) {
                const len = String(cell.w ?? cell.v ?? '').length;
                widths[c] = Math.max(widths[c] || 0, Math.min(48, len + 2));
            }
        });
    });

    const lastRow = Math.max(0, matrix.length - 1);
    ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: maxCol } });
    ws['!cols'] = Array.from({ length: maxCol + 1 }, (_, i) => ({ wch: Math.max(8, widths[i] || 8) }));

    // A filter row makes an institutional gazette usable the moment it opens.
    if (autoFilter && headers.length && rows.length) {
        ws['!autofilter'] = {
            ref: XLSX.utils.encode_range({
                s: { r: headerRowIndex, c: 0 },
                e: { r: lastRow, c: headers.length - 1 }
            })
        };
    }

    return ws;
}

/**
 * Writes one or more sheets to a real .xlsx and downloads it.
 *
 * @param {Array<{name:string, headers?:Array, rows?:Array<Array>, preamble?:Array, numberFormats?:object, autoFilter?:boolean}>} sheets
 * @param {string} fileName - with or without the .xlsx extension
 */
export async function downloadWorkbook(sheets, fileName) {
    const XLSX = await getXLSX();
    const wb = XLSX.utils.book_new();

    const used = new Set();
    for (const sheet of sheets) {
        let name = sanitizeSheetName(sheet.name, `Sheet${used.size + 1}`);
        let n = 2;
        while (used.has(name.toLowerCase())) {
            name = sanitizeSheetName(`${name.slice(0, 28)} ${n++}`);
        }
        used.add(name.toLowerCase());
        XLSX.utils.book_append_sheet(wb, buildSheet(XLSX, sheet), name);
    }

    // EXPLICIT bookType + array output + the real OOXML MIME. Never XLSX.writeFile():
    // it infers the format from the filename and downloads as octet-stream, which is
    // how a valid workbook ends up in Excel's text importer.
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    downloadBlob(new Blob([out], { type: XLSX_MIME }), safeFileName(fileName, '.xlsx'));
}

/**
 * Downloads a workbook the caller already built with SheetJS.
 *
 * Drop-in replacement for `XLSX.writeFile(wb, name)`, which is the call that leaves
 * the format to be inferred from the filename and the bytes typed as
 * `application/octet-stream`. Same output, no guessing.
 */
export function writeWorkbook(XLSX, wb, fileName) {
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
    downloadBlob(new Blob([out], { type: XLSX_MIME }), safeFileName(fileName, '.xlsx'));
}

/** Formula-injection guard: a cell Excel would execute is neutralised with a quote. */
function neutralizeFormula(str) {
    if (!/^[=+\-@\t\r]/.test(str)) return str;
    if (NUMERIC_RE.test(str.trim())) return str; // -3.5 is a number, not a formula
    return `'${str}`;
}

/** RFC-4180 field: quoted when it has to be, never when it doesn't. */
export function csvEscape(value) {
    if (isBlank(value)) return '';
    const raw = neutralizeFormula(String(value));
    return /[",\r\n;]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** Joins a matrix of values into RFC-4180 CSV text (no BOM — see `downloadCSV`). */
export function toCSV(rows) {
    return rows.map(row => (Array.isArray(row) ? row : [row]).map(csvEscape).join(',')).join('\r\n');
}

/**
 * Downloads CSV text so Excel opens it correctly on a double-click.
 *
 * The UTF-8 BOM is what tells Excel not to decode the file through the machine's
 * ANSI codepage, and CRLF is what its importer expects as a row terminator. Pass
 * either a string (already-joined CSV) or a matrix of rows.
 */
export function downloadCSV(content, fileName) {
    const text = typeof content === 'string'
        ? content.replace(/\r?\n/g, '\r\n')
        : toCSV(content);
    // '﻿' — the byte-order mark. Without it Excel shows mojibake for every
    // non-ASCII character in the file.
    downloadBlob(new Blob(['﻿', text], { type: CSV_MIME }), safeFileName(fileName, '.csv'));
}
