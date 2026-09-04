import { NextResponse } from 'next/server';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { requireStaff } from '../../../../../../lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, buildStudentRow, parseFiltersFromBody } from '../../../../../../lib/analytics-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const avg = (nums) => nums.length ? Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100 : 0;

/**
 * POST /api/admin/analytics/export/pdf
 * Full faculty Result Analysis report: dashboard KPIs + class + subject
 * breakdowns, as a downloadable PDF (jsPDF + jspdf-autotable — already in
 * package.json, same stack used client-side by lib/export-utils.js).
 * Body (optional): { academicYear, examSession, branch, semester, classId, section }
 */
export async function POST(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        let body = {};
        try { body = (await req.json()) || {}; } catch { body = {}; }
        const filters = parseFiltersFromBody(body);

        const dataset = await loadResultAnalysisDataset(getAdminClient(), {
            role: session.role, facultyId: session.sub, filters,
        });

        const rows = dataset.students.map(s => buildStudentRow(s, dataset));
        const appeared = rows.filter(r => r.has_results).length;
        const passed = rows.filter(r => r.has_results && r.is_all_clear).length;
        const cgpas = rows.filter(r => r.cgpa > 0).map(r => r.cgpa);

        const doc = new jsPDF();
        doc.setFontSize(18);
        doc.text('GradeFlow — Result Analysis Report', 14, 18);
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generated for: ${session.role} | Filters: ${JSON.stringify(filters)}`, 14, 25);

        autoTable(doc, {
            startY: 32,
            head: [['Metric', 'Value']],
            body: [
                ['Total Students', rows.length],
                ['Appeared', appeared],
                ['Passed', passed],
                ['Failed', appeared - passed],
                ['Overall Pass %', `${pct(passed, appeared)}%`],
                ['Average CGPA', avg(cgpas)],
                ['Highest CGPA', cgpas.length ? Math.max(...cgpas) : '-'],
                ['Lowest CGPA', cgpas.length ? Math.min(...cgpas) : '-'],
                ['Total Backlogs', rows.reduce((a, r) => a + r.total_backlogs, 0)],
                ['All Clear Students', rows.filter(r => r.is_all_clear).length],
            ],
            theme: 'striped',
            headStyles: { fillColor: [28, 25, 23] },
            styles: { fontSize: 9 },
        });

        // ── Class breakdown ──
        const rowByUsn = {};
        for (const r of rows) rowByUsn[r.usn] = r;
        const classBody = dataset.classes.map(c => {
            const usns = dataset.classStudents.filter(cs => cs.class_id === c.id).map(cs => cs.usn);
            const members = usns.map(u => rowByUsn[u]).filter(Boolean);
            const clsAppeared = members.filter(m => m.has_results).length;
            const clsPassed = members.filter(m => m.has_results && m.is_all_clear).length;
            return [c.name, c.branch, c.semester, usns.length, clsAppeared, clsPassed, `${pct(clsPassed, clsAppeared)}%`];
        });
        if (classBody.length) {
            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 10,
                head: [['Class', 'Branch', 'Sem', 'Students', 'Appeared', 'Passed', 'Pass %']],
                body: classBody,
                theme: 'striped',
                headStyles: { fillColor: [28, 25, 23] },
                styles: { fontSize: 8 },
            });
        }

        // ── Subject breakdown ──
        const scopedUsns = new Set(dataset.students.map(s => s.usn));
        const bySubject = {};
        for (const m of dataset.subjectMarks) {
            if (!scopedUsns.has(m.usn)) continue;
            (bySubject[m.subject_code] ||= []).push(m);
        }
        const subjectBody = Object.entries(bySubject).map(([code, marks]) => {
            const subjPassed = marks.filter(m => m.passed).length;
            return [code, marks[0]?.subject_name || code, marks.length, subjPassed, marks.length - subjPassed, `${pct(subjPassed, marks.length)}%`];
        });
        if (subjectBody.length) {
            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 10,
                head: [['Code', 'Subject', 'Appeared', 'Passed', 'Failed', 'Pass %']],
                body: subjectBody,
                theme: 'striped',
                headStyles: { fillColor: [28, 25, 23] },
                styles: { fontSize: 8 },
            });
        }

        // ── Top 10 Toppers by CGPA ──
        const topCgpa = [...rows].filter(r => r.cgpa > 0).sort((a, b) => {
            const bc = Number(Number(b.cgpa).toFixed(2));
            const ac = Number(Number(a.cgpa).toFixed(2));
            if (bc !== ac) return bc - ac;
            return (a.usn || '').localeCompare(b.usn || '');
        }).slice(0, 10);

        if (topCgpa.length) {
            doc.addPage();
            doc.setFontSize(14);
            doc.text('Class Toppers (Top 10 — CGPA Wise)', 14, 18);
            let curRank = 1, lastCgpa = null;
            const bodyRows = topCgpa.map((r, i) => {
                const rounded = Number(Number(r.cgpa).toFixed(2));
                if (i === 0) { curRank = 1; lastCgpa = rounded; }
                else if (rounded !== lastCgpa) { curRank++; lastCgpa = rounded; }
                return [`#${curRank}`, r.usn, r.name, r.branch, r.semester, r.cgpa ? r.cgpa.toFixed(2) : '—', r.total_backlogs];
            });
            autoTable(doc, {
                startY: 24,
                head: [['Rank', 'USN', 'Name', 'Branch', 'Sem', 'CGPA', 'Backlogs']],
                body: bodyRows,
                theme: 'striped',
                headStyles: { fillColor: [28, 25, 23] },
                styles: { fontSize: 8.5 },
            });
        }

        // ── Top 10 Toppers by SGPA ──
        const topSgpa = [...rows].filter(r => r.sgpa > 0).sort((a, b) => {
            const bs = Number(Number(b.sgpa).toFixed(2));
            const as = Number(Number(a.sgpa).toFixed(2));
            if (bs !== as) return bs - as;
            return (a.usn || '').localeCompare(b.usn || '');
        }).slice(0, 10);

        if (topSgpa.length) {
            doc.setFontSize(14);
            doc.text('Class Toppers (Top 10 — SGPA Wise)', 14, doc.lastAutoTable.finalY + 12);
            let curRank = 1, lastSgpa = null;
            const bodyRows = topSgpa.map((r, i) => {
                const rounded = Number(Number(r.sgpa).toFixed(2));
                if (i === 0) { curRank = 1; lastSgpa = rounded; }
                else if (rounded !== lastSgpa) { curRank++; lastSgpa = rounded; }
                return [`#${curRank}`, r.usn, r.name, r.branch, r.semester, r.sgpa ? r.sgpa.toFixed(2) : '—', r.earned_credits || r.total_credits || 20];
            });
            autoTable(doc, {
                startY: doc.lastAutoTable.finalY + 18,
                head: [['Rank', 'USN', 'Name', 'Branch', 'Sem', 'SGPA', 'Credits']],
                body: bodyRows,
                theme: 'striped',
                headStyles: { fillColor: [15, 23, 42] },
                styles: { fontSize: 8.5 },
            });
        }

        const buffer = Buffer.from(doc.output('arraybuffer'));
        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': 'attachment; filename="gradeflow-result-analysis.pdf"',
            },
        });
    } catch (err) {
        console.error('[POST /api/admin/analytics/export/pdf]', err);
        return NextResponse.json(
            { success: false, error: { code: 'EXPORT_PDF_ERROR', message: 'PDF export failed.', details: { error: String(err?.message || err) } } },
            { status: 500 }
        );
    }
}
