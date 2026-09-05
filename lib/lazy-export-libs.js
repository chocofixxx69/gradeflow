/**
 * Lazy loaders for browser-only export libraries.
 *
 * xlsx, jspdf, and jspdf-autotable access window/document/self at module
 * evaluation time. Next.js runs 'use client' components on the server during
 * the initial static pass — a static import fires at that point and throws:
 *   ReferenceError: self is not defined   (xlsx)
 *   ReferenceError: window is not defined (jspdf)
 *
 * USAGE: replace static imports with these helpers inside async handlers.
 *
 *   import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
 *
 *   const handleExcel = async () => {
 *     const XLSX = await getXLSX();
 *   };
 *
 *   const handlePdf = async () => {
 *     const { jsPDF, autoTable } = await getJsPDF();
 *     const doc = new jsPDF();
 *     autoTable(doc, { ... });
 *   };
 */

let _xlsxPromise = null;
export async function getXLSX() {
    if (typeof window === 'undefined') throw new Error('getXLSX() must only be called in the browser.');
    if (!_xlsxPromise) _xlsxPromise = import('xlsx').then(m => m);
    return _xlsxPromise;
}

let _jspdfPromise = null;
export async function getJsPDF() {
    if (typeof window === 'undefined') throw new Error('getJsPDF() must only be called in the browser.');
    if (!_jspdfPromise) {
        _jspdfPromise = Promise.all([
            import('jspdf'),
            import('jspdf-autotable'),
        ]).then(([jspdfModule, autoTableModule]) => ({
            jsPDF: jspdfModule.default || jspdfModule.jsPDF,
            autoTable: autoTableModule.default,
        }));
    }
    return _jspdfPromise;
}