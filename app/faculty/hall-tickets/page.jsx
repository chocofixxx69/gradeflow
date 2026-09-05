'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import { matchesBranch, matchesBatch, canonicalBranchCode, extractBranchFromUsn } from '@/lib/semester-utils';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';
import HallTicketSheet from '@/components/hall-tickets/HallTicketSheet';
import TimetableEditor from '@/components/hall-tickets/TimetableEditor';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Standard default timetable by semester for CS stream
const DEFAULT_TIMETABLES = {
    6: [
        { date: '24/03/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS601', subjectName: 'CC' },
        { date: '24/03/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS602', subjectName: 'ML' },
        { date: '25/03/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS613B', subjectName: 'CV' },
        { date: '25/03/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BEE654B', subjectName: 'TRES' }
    ],
    7: [
        { date: '02/12/2025', time: '10:00 am to 11:00 am', subjectCode: 'BCS701', subjectName: 'IOT' },
        { date: '02/12/2025', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS702', subjectName: 'PC' },
        { date: '03/12/2025', time: '10:00 am to 11:00 am', subjectCode: 'BCS703', subjectName: 'CN' },
        { date: '03/12/2025', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS714D', subjectName: 'BDA' },
        { date: '04/12/2025', time: '10:00 am to 11:00 am', subjectCode: 'BME755D', subjectName: 'NCS' }
    ],
    4: [
        { date: '20/05/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS401', subjectName: 'ADA' },
        { date: '20/05/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS402', subjectName: 'MC' },
        { date: '21/05/2026', time: '10:00 am to 11:00 am', subjectCode: 'BCS403', subjectName: 'DBMS' },
        { date: '21/05/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS456C', subjectName: 'UI/UX' }
    ],
    3: [
        { date: '15/11/2025', time: '10:00 am to 11:00 am', subjectCode: 'BCS301', subjectName: 'MATHS' },
        { date: '15/11/2025', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS302', subjectName: 'DDCO' },
        { date: '16/11/2025', time: '10:00 am to 11:00 am', subjectCode: 'BCS303', subjectName: 'OS' },
        { date: '16/11/2025', time: '02:30 pm to 03:30 pm', subjectCode: 'BCS304', subjectName: 'DSA' }
    ],
    1: [
        { date: '10/01/2026', time: '10:00 am to 11:00 am', subjectCode: 'BMATS101', subjectName: 'MATHS-I' },
        { date: '10/01/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BPHYS102', subjectName: 'PHYSICS' },
        { date: '11/01/2026', time: '10:00 am to 11:00 am', subjectCode: 'BPOPS103', subjectName: 'POP C' },
        { date: '11/01/2026', time: '02:30 pm to 03:30 pm', subjectCode: 'BESCK104B', subjectName: 'ELECTRICAL' }
    ]
};

const ROMAN_SEMESTERS = {
    1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', 7: 'VII', 8: 'VIII'
};

export default function HallTicketsPage() {
    return (
        <AuthGuard role="faculty">
            <HallTicketsContent />
        </AuthGuard>
    );
}

function HallTicketsContent() {
    const [loading, setLoading] = useState(true);
    const [meta, setMeta] = useState({ branches: [], batches: [], semesters: [1,2,3,4,5,6,7,8], subjects: [] });

    // Scope Selection. A hall ticket cohort is a class, so classId is the
    // primary selector; branch/batch/semester remain as a fallback for ad-hoc
    // cohorts that have no class record yet.
    const [classId, setClassId] = useState('');
    const [classes, setClasses] = useState([]);
    const [activeClass, setActiveClass] = useState(null);
    const [branch, setBranch] = useState('CS');
    const [semester, setSemester] = useState(6);
    const [batch, setBatch] = useState('2023');

    // Students Data
    const [allStudents, setAllStudents] = useState([]);
    const [selectedUsns, setSelectedUsns] = useState(new Set());
    const [studentSearch, setStudentSearch] = useState('');

    // Exam Metadata
    const [examType, setExamType] = useState('IA-1'); // 'IA-1' | 'IA-2' | 'IA-3' | 'Semester End'
    const [examMonthYear, setExamMonthYear] = useState('MARCH 2026');
    const [examTitle, setExamTitle] = useState('VI Semester IA-1 MARCH 2026 Examination');
    const [departmentName, setDepartmentName] = useState('Department of Computer Science & Engineering');

    // Timetable
    const [timetable, setTimetable] = useState(DEFAULT_TIMETABLES[6]);

    // Preview Controls
    const [previewMode, setPreviewMode] = useState('paged'); // 'paged' | 'continuous'
    const [activePage, setActivePage] = useState(1);

    // 1. Fetch Metadata
    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) {
                    setMeta(res);
                }
            } catch (err) {
                console.error('Meta loading failed:', err);
            }
        }
        loadMeta();
    }, []);

    // 1b. Load the class list that drives the primary scope selector.
    useEffect(() => {
        async function loadClasses() {
            try {
                const res = await apiRequest('/api/classes');
                setClasses(res?.classes || []);
            } catch (err) {
                console.error('Class loading failed:', err);
            }
        }
        loadClasses();
    }, []);

    // 2. Fetch Students. When a class is selected its roster is authoritative;
    // otherwise fall back to the branch/batch/semester filters.
    const loadStudents = useCallback(async () => {
        setLoading(true);
        try {
            const query = classId
                ? { class_id: classId }
                : { branch, ...(batch ? { batch } : {}), ...(semester ? { semester } : {}) };

            const res = await apiRequest('/api/faculty/hall-tickets/students', { query });
            const payload = res?.students ? res : res?.data;

            setAllStudents(payload?.students || []);
            setActiveClass(payload?.class || null);
        } catch (err) {
            console.error('Students fetch error:', err);
            setAllStudents([]);
        } finally {
            setLoading(false);
        }
    }, [classId, branch, batch, semester]);

    useEffect(() => {
        loadStudents();
    }, [loadStudents]);

    // Selecting a class fixes the exam scope to that class's own semester and
    // department, so the printed header can never disagree with the roster.
    useEffect(() => {
        if (!activeClass) return;
        if (activeClass.semester) setSemester(Number(activeClass.semester));
        if (activeClass.branch_code) setBranch(activeClass.branch_code);
        if (activeClass.batch) setBatch(String(activeClass.batch));
    }, [activeClass]);

    // Update Exam Title when Semester, Exam Type, or Month/Year changes
    useEffect(() => {
        const roman = ROMAN_SEMESTERS[semester] || String(semester);
        setExamTitle(`${roman} Semester ${examType} ${examMonthYear} Examination`);
    }, [semester, examType, examMonthYear]);

    // Update Department Name when branch changes
    useEffect(() => {
        const foundBranch = meta.branches.find(b => b.code === branch);
        const name = foundBranch?.label || foundBranch?.name || 'Computer Science & Engineering';
        const cleanName = name.replace(/\band\b/gi, '&');
        setDepartmentName(`Department of ${cleanName}`);
    }, [branch, meta.branches]);

    // Filtered Students: allStudents returned by API already match branch and batch
    const filteredStudents = useMemo(() => {
        return (allStudents || []).sort((a, b) => (a.usn || '').localeCompare(b.usn || ''));
    }, [allStudents]);

    // Pre-select all students when the student list loads or changes
    useEffect(() => {
        if (filteredStudents.length > 0) {
            setSelectedUsns(new Set(filteredStudents.map(s => s.usn)));
        } else {
            setSelectedUsns(new Set());
        }
    }, [filteredStudents]);

    // Auto-fill Timetable from Catalog / Presets
    const handleAutoFillTimetable = () => {
        if (DEFAULT_TIMETABLES[semester]) {
            setTimetable(DEFAULT_TIMETABLES[semester]);
            return;
        }

        // Pull from metadata subjects if available
        const semSubjects = (meta.subjects || []).filter(s => {
            if (s.semester !== semester) return false;
            return s.branches?.some(b => matchesBranch(b, branch)) || matchesBranch(s.branch, branch);
        }).slice(0, 5);

        if (semSubjects.length > 0) {
            const today = new Date();
            const formatted = semSubjects.map((s, idx) => {
                const examDate = new Date(today);
                examDate.setDate(today.getDate() + Math.floor(idx / 2));
                const dStr = `${String(examDate.getDate()).padStart(2, '0')}/${String(examDate.getMonth() + 1).padStart(2, '0')}/${examDate.getFullYear()}`;
                const timeSlot = idx % 2 === 0 ? '10:00 am to 11:00 am' : '02:30 pm to 03:30 pm';
                const abbr = s.name.split(' ').map(w => w[0]).join('').slice(0, 4);
                return {
                    date: dStr,
                    time: timeSlot,
                    subjectCode: s.code,
                    subjectName: abbr || s.code
                };
            });
            setTimetable(formatted);
        }
    };

    // Selected students objects
    const selectedStudentsList = useMemo(() => {
        return filteredStudents.filter(s => selectedUsns.has(s.usn));
    }, [filteredStudents, selectedUsns]);

    // Group selected students into chunks of 3 per A4 sheet
    const sheets = useMemo(() => {
        const chunks = [];
        for (let i = 0; i < selectedStudentsList.length; i += 3) {
            chunks.push(selectedStudentsList.slice(i, i + 3));
        }
        return chunks;
    }, [selectedStudentsList]);

    const totalSheets = Math.max(1, sheets.length);

    // Toggle single student
    const handleToggleStudent = (usn) => {
        const next = new Set(selectedUsns);
        if (next.has(usn)) next.delete(usn);
        else next.add(usn);
        setSelectedUsns(next);
    };

    // Toggle All students
    const handleToggleAll = () => {
        if (selectedUsns.size === filteredStudents.length) {
            setSelectedUsns(new Set());
        } else {
            setSelectedUsns(new Set(filteredStudents.map(s => s.usn)));
        }
    };

    // Filtered students in the checklist search
    const visibleStudentsInChecklist = useMemo(() => {
        if (!studentSearch) return filteredStudents;
        const q = studentSearch.toLowerCase().trim();
        return filteredStudents.filter(s => s.usn.toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q));
    }, [filteredStudents, studentSearch]);

    // ── Direct Browser Print ──
    const handlePrint = () => {
        window.print();
    };

    // Helper to fetch the optimized AITM logo as Base64 data URL for jsPDF
    const getLogoDataUrl = async () => {
        try {
            const response = await fetch('/aitm-logo-opt.png');
            if (!response.ok) return null;
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch {
            return null;
        }
    };

    // ── Download PDF (Matching 29-page reference layout with exact signature spacing & logo) ──
    const handleDownloadPDF = async () => {
        if (selectedStudentsList.length === 0) return;

        const logoData = await getLogoDataUrl();
        const DocClass = typeof jsPDF === 'function' ? jsPDF : (jsPDF?.jsPDF || jsPDF?.default || window?.jspdf?.jsPDF);
        const doc = new DocClass({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });

        // A4 page dimensions: 210mm x 297mm
        const marginX = 14;
        const contentWidth = 182; // 210 - (14 * 2)
        const cardBoxHeight = 72; // outer card box height (border to border)
        const sigSpace = 11; // 11mm of clear space for physical pen signature
        const sigLabelHeight = 4; // height of "Signature of Class Advisor" text
        const cutGap = 3; // gap before and after cutline
        const ticketSlotHeight = 92; // 72 + 11 + 4 + (cutGap * 2) = ~93mm (3 fit cleanly in 279mm <= 297mm)
        const topMargin = 10;

        sheets.forEach((sheetStudents, sheetIdx) => {
            if (sheetIdx > 0) doc.addPage();

            sheetStudents.forEach((student, cardIdx) => {
                const startY = topMargin + (cardIdx * ticketSlotHeight);

                // 1. Outer Box Border
                doc.setDrawColor(0, 0, 0);
                doc.setLineWidth(0.35);
                doc.rect(marginX, startY, contentWidth, cardBoxHeight);

                // 2. Header Box (19mm)
                const headerHeight = 19;
                doc.line(marginX, startY + headerHeight, marginX + contentWidth, startY + headerHeight);

                // Logo Column Box (24mm wide)
                const logoWidth = 24;
                doc.line(marginX + logoWidth, startY, marginX + logoWidth, startY + headerHeight);

                // Embed Official AITM Crest Logo Image
                if (logoData) {
                    try {
                        doc.addImage(logoData, 'PNG', marginX + 2.5, startY + 1.2, 19, 16.5, 'AITM_LOGO', 'FAST');
                    } catch (err) {
                        console.warn('Logo image embed failed:', err);
                    }
                }

                // College Name & Details
                const headerCenterX = marginX + logoWidth + (contentWidth - logoWidth) / 2;
                doc.setFont('times', 'bold');
                doc.setFontSize(10.5);
                doc.text('ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT', headerCenterX, startY + 5.2, { align: 'center' });

                doc.setFont('times', 'normal');
                doc.setFontSize(8.2);
                doc.text('Anjumanabad, Bhatkal-582320', headerCenterX, startY + 9.2, { align: 'center' });

                doc.text(departmentName || 'Department of Computer Science & Engineering', headerCenterX, startY + 13.2, { align: 'center' });

                doc.setFont('times', 'bold');
                doc.setFontSize(9.5);
                doc.text('HALL TICKET', headerCenterX, startY + 17.5, { align: 'center' });

                // 3. Examination Banner (5.2mm)
                const bannerY = startY + headerHeight;
                const bannerHeight = 5.2;
                doc.line(marginX, bannerY + bannerHeight, marginX + contentWidth, bannerY + bannerHeight);
                doc.setFont('times', 'bold');
                doc.setFontSize(8.5);
                doc.text(examTitle, marginX + contentWidth / 2, bannerY + 3.8, { align: 'center' });

                // 4. Student Details Row 1: Branch & USN (5.2mm)
                const row1Y = bannerY + bannerHeight;
                const row1Height = 5.2;
                doc.line(marginX, row1Y + row1Height, marginX + contentWidth, row1Y + row1Height);

                doc.setFont('times', 'bold');
                doc.setFontSize(8.5);
                doc.text('Branch', marginX + 2, row1Y + 3.8);
                doc.line(marginX + 18, row1Y, marginX + 18, row1Y + row1Height);

                doc.setFont('times', 'normal');
                // Canonical branch code, resolved the same way everywhere. The
                // previous rule ("contains 'computer' and longer than 25 chars
                // -> CS, else print the raw text") made the same class show
                // "CS" for one student and "Computer Science (CSE)" for the
                // next, and printed "CS" on AI & ML tickets.
                const branchLabel = canonicalBranchCode(student.branch_code)
                    || canonicalBranchCode(student.usn ? extractBranchFromUsn(student.usn) : null)
                    || canonicalBranchCode(student.branch)
                    || '—';
                doc.text(branchLabel, marginX + 20, row1Y + 3.8);

                const usnSplitX = marginX + 118;
                doc.line(usnSplitX, row1Y, usnSplitX, row1Y + row1Height);
                doc.setFont('times', 'bold');
                doc.text('USN', usnSplitX + 2.5, row1Y + 3.8);
                doc.line(usnSplitX + 15, row1Y, usnSplitX + 15, row1Y + row1Height);

                doc.setFont('courier', 'bold');
                doc.setFontSize(9.2);
                doc.text(student.usn, usnSplitX + 18, row1Y + 3.8);

                // 5. Student Details Row 2: Name (5.2mm)
                const row2Y = row1Y + row1Height;
                const row2Height = 5.2;
                doc.line(marginX, row2Y + row2Height, marginX + contentWidth, row2Y + row2Height);

                doc.setFont('times', 'bold');
                doc.setFontSize(8.5);
                doc.text('Name', marginX + 2, row2Y + 3.8);
                doc.line(marginX + 18, row2Y, marginX + 18, row2Y + row2Height);

                doc.setFont('times', 'bold');
                doc.setFontSize(8.8);
                doc.text((student.name || '').toUpperCase(), marginX + 20, row2Y + 3.8);

                // 6. Timetable + Photo Grid
                const tableY = row2Y + row2Height;
                const photoBoxWidth = 32;
                const tableWidth = contentWidth - photoBoxWidth; // 150mm
                const colDateW = 26;
                const colTimeW = 44;
                const colCodeW = 28;
                const colNameW = tableWidth - (colDateW + colTimeW + colCodeW); // 52mm

                // Vertical Divider between Timetable and Photo box
                doc.line(marginX + tableWidth, tableY, marginX + tableWidth, startY + cardBoxHeight);

                // Timetable Header (5mm)
                const thHeight = 5;
                doc.line(marginX, tableY + thHeight, marginX + tableWidth, tableY + thHeight);

                doc.setFont('times', 'bold');
                doc.setFontSize(8);
                doc.text('Date', marginX + colDateW / 2, tableY + 3.5, { align: 'center' });
                doc.line(marginX + colDateW, tableY, marginX + colDateW, startY + cardBoxHeight);

                doc.text('Time', marginX + colDateW + colTimeW / 2, tableY + 3.5, { align: 'center' });
                doc.line(marginX + colDateW + colTimeW, tableY, marginX + colDateW + colTimeW, startY + cardBoxHeight);

                doc.text('Subject Code', marginX + colDateW + colTimeW + colCodeW / 2, tableY + 3.5, { align: 'center' });
                doc.line(marginX + colDateW + colTimeW + colCodeW, tableY, marginX + colDateW + colTimeW + colCodeW, startY + cardBoxHeight);

                doc.text('Subject name', marginX + colDateW + colTimeW + colCodeW + colNameW / 2, tableY + 3.5, { align: 'center' });

                // Timetable Rows
                const rowH = 4.8;
                timetable.forEach((exam, rIdx) => {
                    const rowTop = tableY + thHeight + (rIdx * rowH);
                    doc.line(marginX, rowTop + rowH, marginX + tableWidth, rowTop + rowH);

                    doc.setFont('times', 'normal');
                    doc.setFontSize(7.5);
                    doc.text(exam.date, marginX + colDateW / 2, rowTop + 3.4, { align: 'center' });
                    doc.text(exam.time, marginX + colDateW + colTimeW / 2, rowTop + 3.4, { align: 'center' });

                    doc.setFont('courier', 'bold');
                    doc.text(exam.subjectCode, marginX + colDateW + colTimeW + colCodeW / 2, rowTop + 3.4, { align: 'center' });

                    doc.setFont('times', 'bold');
                    doc.text(exam.subjectName, marginX + colDateW + colTimeW + colCodeW + colNameW / 2, rowTop + 3.4, { align: 'center' });
                });

                // Photo Placeholder text inside photo box (matching reference PDF)
                doc.setFont('times', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(150, 150, 150);
                doc.text('[ Photo ]', marginX + tableWidth + photoBoxWidth / 2, tableY + 18, { align: 'center' });
                doc.setTextColor(0, 0, 0);

                // 7. Signature Footer with Generous Physical Signature Spacing
                const sigLabelY = startY + cardBoxHeight + sigSpace;
                doc.setFont('times', 'bold');
                doc.setFontSize(8.5);
                doc.text('Signature of Class Advisor', marginX, sigLabelY);
                doc.text('Signature of HoD', marginX + contentWidth, sigLabelY, { align: 'right' });

                // 8. Scissors cutting guide between tickets on the same page
                if (cardIdx < sheetStudents.length - 1) {
                    const cutY = sigLabelY + sigLabelHeight + cutGap;
                    doc.setFont('courier', 'bold');
                    doc.setFontSize(6.8);
                    doc.text('-----------------------------------------X------------------------------------------------X--------------------------------------', marginX + contentWidth / 2, cutY, { align: 'center' });
                }
            });
        });

        doc.save(`AITM_Hall_Tickets_${branch}_Sem${semester}.pdf`);
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1600px', margin: '0 auto' }} className="gf-fade-up">
            {/* Print Mode CSS */}
            <style jsx global>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 8mm 12mm;
                    }
                    html, body {
                        background: #FFFFFF !important;
                        color: #000000 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        min-height: 0 !important;
                        overflow: visible !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }

                    /* 1. Hide ALL non-print elements: shell topbar, sidebar, footer, toolbar buttons, controls */
                    header,
                    nav,
                    aside,
                    footer,
                    .gf-shell-topbar,
                    .gf-mobile-header,
                    .gf-sidebar,
                    .no-print,
                    .no-print *,
                    .aitm-header-toolbar,
                    .aitm-header-toolbar *,
                    .gf-page-header,
                    .config-panel,
                    .aitm-preview-controls,
                    .screen-only-page-number,
                    .aitm-screen-preview {
                        display: none !important;
                        visibility: hidden !important;
                        height: 0 !important;
                        min-height: 0 !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        border: none !important;
                        overflow: hidden !important;
                    }

                    /* 2. Neutralize all outer page wrappers so no padding, margin, grid, or flex constrains print layout */
                    .app-layout,
                    .app-layout-authenticated,
                    .main-content,
                    .main-content-body,
                    #__next,
                    main,
                    .gf-fade-up,
                    .aitm-main-layout-grid,
                    .aitm-preview-panel {
                        display: block !important;
                        position: static !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        min-height: 0 !important;
                        height: auto !important;
                        border: none !important;
                        box-shadow: none !important;
                        background: transparent !important;
                        overflow: visible !important;
                        gap: 0 !important;
                    }

                    /* 3. Reveal print sheets */
                    .aitm-print-all {
                        display: block !important;
                        width: 100% !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        position: static !important;
                    }

                    /* 4. A4 Sheet Container: Exactly 278mm height (A4 297mm - 16mm margins = 281mm printable) guaranteeing 3 tickets per sheet with zero overflow */
                    .aitm-a4-sheet {
                        box-shadow: none !important;
                        border: none !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        height: 278mm !important;
                        max-height: 278mm !important;
                        min-height: 0 !important;
                        box-sizing: border-box !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        page-break-after: always !important;
                        break-after: page !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justifyContent: space-between !important;
                        overflow: hidden !important;
                        background: #FFFFFF !important;
                    }

                    .aitm-a4-sheet:last-of-type {
                        page-break-after: auto !important;
                        break-after: auto !important;
                    }

                    /* 5. Slot container: exactly 1/3 of printable sheet, never overflow */
                    .aitm-ticket-slot {
                        flex: 1 1 0 !important;
                        max-height: 89mm !important;
                        display: flex !important;
                        flex-direction: column !important;
                        justifyContent: center !important;
                        overflow: hidden !important;
                        margin: 0 !important;
                        padding: 0 !important;
                    }

                    .aitm-hall-ticket-card {
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 auto !important;
                        page-break-inside: avoid !important;
                        break-inside: avoid !important;
                        font-family: 'Times New Roman', Times, serif !important;
                    }

                    /* 6. Compact institutional card styles strictly synchronized with PDF */
                    .aitm-card-outer-box {
                        border: 1.2px solid #000000 !important;
                    }
                    .aitm-card-header-row {
                        grid-template-columns: 88px 1fr !important;
                        border-bottom: 1.2px solid #000000 !important;
                    }
                    .aitm-card-logo-box {
                        padding: 2px !important;
                        border-right: 1.2px solid #000000 !important;
                    }
                    .aitm-card-logo-img {
                        width: 58px !important;
                        height: 58px !important;
                    }
                    .aitm-card-college-name {
                        font-size: 11.5px !important;
                        line-height: 1.2 !important;
                    }
                    .aitm-card-college-address {
                        font-size: 9.5px !important;
                        margin-top: 1px !important;
                    }
                    .aitm-card-dept-name {
                        font-size: 10px !important;
                        margin-top: 1px !important;
                    }
                    .aitm-card-hall-ticket-label {
                        font-size: 11px !important;
                        margin-top: 2px !important;
                    }
                    .aitm-card-banner {
                        padding: 2px 6px !important;
                        font-size: 10px !important;
                        border-bottom: 1.2px solid #000000 !important;
                        background-color: #F3F4F6 !important;
                    }
                    .aitm-card-meta-row {
                        font-size: 10px !important;
                        border-bottom: 1.2px solid #000000 !important;
                    }
                    .aitm-card-meta-row div {
                        padding: 2px 5px !important;
                        border-right-color: #000000 !important;
                    }
                    .aitm-card-name-row {
                        font-size: 10.5px !important;
                        border-bottom: 1.2px solid #000000 !important;
                    }
                    .aitm-card-name-row div {
                        padding: 2px 5px !important;
                        border-right-color: #000000 !important;
                    }
                    .aitm-card-timetable-grid {
                        min-height: 68px !important;
                        grid-template-columns: 1fr 108px !important;
                    }
                    .aitm-card-timetable-grid table th,
                    .aitm-card-timetable-grid table td {
                        padding: 2px 3px !important;
                        font-size: 9.5px !important;
                        border-color: #000000 !important;
                    }
                    .aitm-card-photo-box {
                        border-left: 1.2px solid #000000 !important;
                        padding: 4px !important;
                    }
                    .aitm-card-signatures {
                        padding: 26px 4px 2px 4px !important;
                        font-size: 10px !important;
                    }
                    .aitm-cutting-line {
                        margin: 3px 0 !important;
                        font-size: 9.5px !important;
                        color: #000000 !important;
                    }
                }
            `}</style>

            {/* Header Toolbar */}
            <div className="no-print aitm-header-toolbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Academic Operations & Examination</PageHeaderEyebrow>
                    <PageHeaderTitle>Hall Ticket Generator</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Institutional Hall Ticket generator formatted to the official Anjuman Institute (AITM) 3-per-page A4 print standard.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleDownloadPDF} variant="ghost" disabled={selectedStudentsList.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Download PDF ({selectedStudentsList.length})
                    </Button>
                    <Button onClick={handlePrint} variant="primary" disabled={selectedStudentsList.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>print</span>
                        Print Hall Tickets ({totalSheets} Sheets)
                    </Button>
                </div>
            </div>

            {/* Main 2-Column Content */}
            <div className="aitm-main-layout-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '28px', alignItems: 'flex-start' }}>
                {/* ── LEFT PANEL: Configuration & Settings (Restored to exact spacious original layout) ── */}
                <div className="no-print config-panel" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Scope Selector Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>tune</span>
                                Class & Cohort Scope
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {/* Class is the primary selector: pick a class and its
                                roster is the cohort, exactly as recorded in
                                class_students. */}
                            <div style={{ marginBottom: '16px' }}>
                                <Select
                                    label="Class"
                                    value={classId}
                                    onChange={e => setClassId(e.target.value)}
                                    options={[
                                        { value: '', label: 'Manual scope (choose department, semester & batch below)' },
                                        ...classes.map(c => ({
                                            value: c.id,
                                            label: `${c.name} — Sem ${c.semester ?? '?'} · ${c.student_count ?? 0} students`,
                                        })),
                                    ]}
                                />
                                {classId && activeClass && (
                                    <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                        Roster locked to <strong>{activeClass.name}</strong>
                                        {activeClass.branch_code ? ` · ${activeClass.branch_code}` : ''}
                                        {activeClass.semester ? ` · Semester ${activeClass.semester}` : ''}
                                        {activeClass.scheme ? ` · ${activeClass.scheme} scheme` : ''}
                                        . Only students in this class can be issued a hall ticket.
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 125px), 1fr))', gap: '14px', opacity: classId ? 0.55 : 1 }}>
                                <div>
                                    <Select
                                        label="Department"
                                        value={branch}
                                        disabled={Boolean(classId)}
                                        onChange={e => setBranch(e.target.value)}
                                        options={[
                                            { value: 'CS', label: 'CS - Computer Science' },
                                            { value: 'CI', label: 'CI - AI & Machine Learning' },
                                            { value: 'CD', label: 'CD - Data Science' },
                                            { value: 'EC', label: 'EC - Electronics & Comm' },
                                            { value: 'EE', label: 'EE - Electrical & Electronics' },
                                            { value: 'CV', label: 'CV - Civil Engineering' },
                                            { value: 'ME', label: 'ME - Mechanical Engineering' },
                                            { value: 'RI', label: 'RI - Robotics & AI' }
                                        ]}
                                    />
                                </div>
                                <div>
                                    <Select
                                        label="Semester"
                                        value={semester}
                                        disabled={Boolean(classId)}
                                        onChange={e => setSemester(Number(e.target.value))}
                                        options={[1,2,3,4,5,6,7,8].map(s => ({ value: s, label: `Semester ${s} (${ROMAN_SEMESTERS[s]})` }))}
                                    />
                                </div>
                                <div>
                                    <Select
                                        label="Batch Year"
                                        value={batch}
                                        disabled={Boolean(classId)}
                                        onChange={e => setBatch(e.target.value)}
                                        options={[
                                            { value: '', label: 'All Batches' },
                                            ...(meta.batches && meta.batches.length > 0 ? meta.batches : ['2021', '2022', '2023', '2024', '2025', '2026']).map(b => ({
                                                value: b,
                                                label: `${b.slice(-2)} Batch (${b})`
                                            }))
                                        ]}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Examination Information Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '20px', color: '#6366F1' }}>event_note</span>
                                Examination Details
                            </CardTitle>
                        </CardHeader>
                        <CardContent style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <Select
                                        label="Exam Type"
                                        value={examType}
                                        onChange={e => setExamType(e.target.value)}
                                        options={[
                                            { value: 'IA-1', label: 'IA-1 (Internal Assessment 1)' },
                                            { value: 'IA-2', label: 'IA-2 (Internal Assessment 2)' },
                                            { value: 'IA-3', label: 'IA-3 (Internal Assessment 3)' },
                                            { value: 'Semester End', label: 'Semester End Examination' },
                                            { value: 'Lab Exam', label: 'Practical / Lab Examination' }
                                        ]}
                                    />
                                </div>
                                <div>
                                    <Input
                                        label="Month & Year"
                                        value={examMonthYear}
                                        onChange={e => setExamMonthYear(e.target.value)}
                                        placeholder="e.g. MARCH 2026"
                                    />
                                </div>
                            </div>
                            <div>
                                <Input
                                    label="Custom Examination Title Header"
                                    value={examTitle}
                                    onChange={e => setExamTitle(e.target.value)}
                                    placeholder="e.g. VI Semester IA-1 MARCH 2026 Examination"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Timetable Editor Card */}
                    <Card>
                        <CardContent style={{ padding: '16px 20px' }}>
                            <TimetableEditor
                                timetable={timetable}
                                onChange={setTimetable}
                                onAutoFill={handleAutoFillTimetable}
                            />
                        </CardContent>
                    </Card>

                    {/* Students Selection Card */}
                    <Card>
                        <CardHeader>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: '#10B981' }}>checklist</span>
                                    Student Roster ({selectedStudentsList.length} of {filteredStudents.length} Selected)
                                </CardTitle>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {studentSearch.trim() && visibleStudentsInChecklist.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setSelectedUsns(new Set(visibleStudentsInChecklist.map(s => s.usn)))}
                                            style={{
                                                background: 'rgba(59, 130, 246, 0.12)',
                                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                                color: 'var(--primary)',
                                                borderRadius: '6px',
                                                padding: '4px 8px',
                                                fontWeight: 700,
                                                fontSize: '11px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Select Only Filtered ({visibleStudentsInChecklist.length})
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={handleToggleAll}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--primary)',
                                            fontWeight: 800,
                                            fontSize: '12px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {selectedUsns.size === filteredStudents.length ? 'Deselect All' : 'Select All'}
                                    </button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                                <div style={{ flex: 1 }}>
                                    <Input
                                        placeholder={classId ? 'Search by USN or Name within this class...' : 'Search by USN or Name...'}
                                        value={studentSearch}
                                        onChange={e => setStudentSearch(e.target.value)}
                                    />
                                </div>
                                {/* Issue a ticket for one student: type the USN, then
                                    narrow the selection to just the matches. The
                                    search only ever spans the chosen class, so a
                                    student outside it cannot be issued a ticket. */}
                                <Button
                                    variant="ghost"
                                    disabled={!studentSearch || visibleStudentsInChecklist.length === 0}
                                    onClick={() => setSelectedUsns(new Set(visibleStudentsInChecklist.map(s => s.usn)))}
                                    title="Select only the students matching this search"
                                >
                                    Only these ({visibleStudentsInChecklist.length})
                                </Button>
                            </div>
                            {studentSearch && classId && (
                                <div style={{ marginTop: '-4px', marginBottom: '10px', fontSize: '11.5px', color: 'var(--tx-muted)' }}>
                                    Searching within {activeClass?.name || 'the selected class'} only.
                                </div>
                            )}

                            <div style={{ maxHeight: '280px', overflowY: 'auto', border: '1px solid var(--border-low)', borderRadius: '8px' }}>
                                {visibleStudentsInChecklist.length === 0 ? (
                                    <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '12px' }}>
                                        {loading
                                            ? 'Loading student roster...'
                                            : classId
                                                ? 'No students in this class match your search.'
                                                : 'No students found in this branch/batch.'}
                                    </div>
                                ) : (
                                    visibleStudentsInChecklist.map((s) => {
                                        const isSelected = selectedUsns.has(s.usn);
                                        return (
                                            <div
                                                key={s.usn}
                                                onClick={() => handleToggleStudent(s.usn)}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    padding: '8px 12px',
                                                    borderBottom: '1px solid var(--border-low)',
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                                                    transition: 'background 0.15s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => {}}
                                                        style={{ cursor: 'pointer' }}
                                                    />
                                                    <div>
                                                        <div style={{ fontWeight: 800, fontSize: '12px', color: 'var(--tx-main)' }}>
                                                            {s.name}
                                                        </div>
                                                        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-muted)' }}>
                                                            {s.usn}
                                                        </div>
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                                    {s.branch}
                                                </span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* ── RIGHT PANEL: Live Interactive Preview (A4 Sheet 3-per-page) ── */}
                <div className="aitm-preview-panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Preview Controls Header */}
                    <div className="no-print aitm-preview-controls" style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '12px',
                        padding: '12px 18px',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>visibility</span>
                            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                A4 Print Preview ({sheets.length} Sheets • 3 Tickets/Page)
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {/* Mode Toggle */}
                            <div style={{ display: 'flex', background: 'var(--surface-low)', borderRadius: '6px', padding: '2px' }}>
                                <button
                                    onClick={() => setPreviewMode('paged')}
                                    style={{
                                        background: previewMode === 'paged' ? 'var(--surface)' : 'transparent',
                                        border: 'none',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: previewMode === 'paged' ? 'var(--tx-main)' : 'var(--tx-dim)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Paged
                                </button>
                                <button
                                    onClick={() => setPreviewMode('continuous')}
                                    style={{
                                        background: previewMode === 'continuous' ? 'var(--surface)' : 'transparent',
                                        border: 'none',
                                        padding: '4px 10px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        color: previewMode === 'continuous' ? 'var(--tx-main)' : 'var(--tx-dim)',
                                        cursor: 'pointer'
                                    }}
                                >
                                    All Sheets
                                </button>
                            </div>

                            {/* Paged Navigation */}
                            {previewMode === 'paged' && sheets.length > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <button
                                        onClick={() => setActivePage(p => Math.max(1, p - 1))}
                                        disabled={activePage <= 1}
                                        style={{
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            cursor: activePage <= 1 ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>chevron_left</span>
                                    </button>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                        {activePage} / {sheets.length}
                                    </span>
                                    <button
                                        onClick={() => setActivePage(p => Math.min(sheets.length, p + 1))}
                                        disabled={activePage >= sheets.length}
                                        style={{
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '6px',
                                            padding: '4px 8px',
                                            cursor: activePage >= sheets.length ? 'not-allowed' : 'pointer',
                                            display: 'flex',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>chevron_right</span>
                                    </button>
                                </div>
                            )}

                            {/* Continuous Mode Quick Jump Selector */}
                            {previewMode === 'continuous' && sheets.length > 1 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 700 }}>Jump:</span>
                                    <select
                                        onChange={(e) => {
                                            const el = document.getElementById(`sheet-target-${e.target.value}`);
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                                        }}
                                        defaultValue="1"
                                        style={{
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '6px',
                                            padding: '3px 8px',
                                            fontSize: '11px',
                                            fontWeight: 700,
                                            color: 'var(--tx-main)',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {sheets.map((_, idx) => (
                                            <option key={idx} value={idx + 1}>
                                                Sheet {idx + 1} of {sheets.length}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/*
                      Print-only: every sheet, always in the DOM.
                      window.print() can only output what is rendered, and the
                      preview below renders a single sheet in Paged mode - which
                      is why printing produced one page while the PDF (built from
                      data, not the DOM) came out complete. Hidden on screen,
                      revealed by the @media print rules above.
                    */}
                    <div className="aitm-print-all" style={{ display: 'none' }} aria-hidden="true">
                        {sheets.map((sheetStudents, sheetIdx) => (
                            <HallTicketSheet
                                key={`print-${sheetIdx}`}
                                students={sheetStudents}
                                examMeta={{
                                    title: examTitle,
                                    department: departmentName,
                                    collegeName: 'ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT',
                                    collegeAddress: 'Anjumanabad, Bhatkal-582320'
                                }}
                                timetable={timetable}
                                pageNumber={sheetIdx + 1}
                                totalPages={sheets.length}
                            />
                        ))}
                    </div>

                    {/* Sheets Container: when in All Sheets mode, scroll internally so the page doesn't stretch and left panel stays unaffected */}
                    <div
                        className="aitm-sheets-scroll-container aitm-screen-preview"
                        style={{
                            width: '100%',
                            maxHeight: previewMode === 'continuous' ? '82vh' : 'none',
                            overflowY: previewMode === 'continuous' ? 'auto' : 'visible',
                            padding: previewMode === 'continuous' ? '8px 8px 24px 8px' : '0',
                            background: previewMode === 'continuous' ? 'rgba(0, 0, 0, 0.02)' : 'transparent',
                            borderRadius: previewMode === 'continuous' ? '12px' : '0',
                            border: previewMode === 'continuous' ? '1px solid var(--border)' : 'none',
                            boxSizing: 'border-box'
                        }}
                    >
                        {selectedStudentsList.length === 0 ? (
                            <div style={{
                                background: 'var(--surface)',
                                border: '1px dashed var(--border)',
                                borderRadius: '16px',
                                padding: '60px 20px',
                                textAlign: 'center',
                                color: 'var(--tx-dim)'
                            }}>
                                <span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--tx-dim)', marginBottom: '8px' }}>
                                    badge
                                </span>
                                <div style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)', marginBottom: '4px' }}>
                                    No Students Selected
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>
                                    Select students from the left panel to generate Anjuman Hall Tickets.
                                </div>
                            </div>
                        ) : previewMode === 'paged' ? (
                            <HallTicketSheet
                                key={activePage}
                                students={sheets[activePage - 1] || []}
                                examMeta={{
                                    title: examTitle,
                                    department: departmentName,
                                    collegeName: 'ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT',
                                    collegeAddress: 'Anjumanabad, Bhatkal-582320'
                                }}
                                timetable={timetable}
                                pageNumber={activePage}
                                totalPages={sheets.length}
                            />
                        ) : (
                            sheets.map((sheetStudents, sheetIdx) => (
                                <div key={sheetIdx} id={`sheet-target-${sheetIdx + 1}`}>
                                    <HallTicketSheet
                                        students={sheetStudents}
                                        examMeta={{
                                            title: examTitle,
                                            department: departmentName,
                                            collegeName: 'ANJUMAN INSTITUTE OF TECHNOLOGY & MANAGEMENT',
                                            collegeAddress: 'Anjumanabad, Bhatkal-582320'
                                        }}
                                        timetable={timetable}
                                        pageNumber={sheetIdx + 1}
                                        totalPages={sheets.length}
                                    />
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
