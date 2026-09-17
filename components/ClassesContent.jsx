'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest, clearApiCache } from '../lib/api/client';
import { useRouter } from 'next/navigation';
import { filterAndRank, filterAndRankStudents } from '../lib/search-utils';
import { parseClassUsns } from '../lib/class-usn-import';
import { recordFacultyAction } from '../lib/api/faculty-action';
// lib/export-utils.js statically pulls in jsPDF, jspdf-autotable and the base64
// institutional crest — roughly half a megabyte that used to be in this page's
// first-load bundle even though none of it runs until someone clicks Export.
// Loaded on demand instead; every caller below is already an async handler.
const loadExportUtils = () => import('../lib/export-utils');
import { downloadCSV, downloadWorkbook } from '../lib/workbook-export';
import { isFailedSubject } from '../lib/vtuGrades';
import { normalizePortalScheme } from '../lib/vtu-portals';
import { ConfirmDialog } from './ui';

const MEDALS = ['🥇', '🥈', '🥉'];
const USN_RE = /^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/;

// ── VTU "Fetch Results" ─────────────────────────────────────
// Who to scrape. Every scope is derived from the roster already on screen, so
// the picker can never disagree with the table the user is looking at.
const SCRAPE_SCOPE_LABELS = {
    all: 'Every student in the class',
    selected: 'Students ticked in the roster',
    backlogs: 'Students carrying backlogs',
    missing: 'Students with no results yet',
    custom: 'Hand-picked students',
};

// scraper_jobs.status vocabulary, plus 'missing' for a job row that has been
// cleared out from under us. See backend/scraper/process_queue.py.
const SCRAPE_STATUS_META = {
    queued:    { label: 'Queued',       icon: 'schedule',              color: 'var(--tx-muted)', bg: 'var(--surface-low)' },
    running:   { label: 'Scanning',     icon: 'sync',                  color: 'var(--primary)',  bg: 'var(--surface-low)' },
    finished:  { label: 'Updated',      icon: 'check_circle',          color: 'var(--green)',    bg: 'var(--green-bg)' },
    no_result: { label: 'No new data',  icon: 'remove_circle_outline', color: 'var(--tx-dim)',   bg: 'var(--surface-low)' },
    error:     { label: 'Failed',       icon: 'error_outline',         color: 'var(--red)',      bg: 'var(--red-bg)' },
    missing:   { label: 'Job vanished', icon: 'help_outline',          color: 'var(--red)',      bg: 'var(--red-bg)' },
};
const scrapeMeta = status => SCRAPE_STATUS_META[status] || SCRAPE_STATUS_META.queued;

// How long a watched batch stays interesting. A worker that dies holding jobs
// would otherwise leave the panel spinning until the tab is closed.
const SCRAPE_RUN_TTL_MS = 45 * 60 * 1000;
const scrapeRunKey = classId => `gf_class_scrape_run_${classId}`;

// Dynamic batch intake years starting at least from 2036 (or current year + 10) down to 2018
const CURRENT_YEAR = new Date().getFullYear();
const MAX_BATCH_YEAR = Math.max(2036, CURRENT_YEAR + 10);
const MIN_BATCH_YEAR = 2018;
const BATCH_INTAKE_YEARS = Array.from(
    { length: MAX_BATCH_YEAR - MIN_BATCH_YEAR + 1 },
    (_, i) => String(MAX_BATCH_YEAR - i)
);

// ── Activity Logger ─────────────────────────────────────────
async function logActivity(action_or_faculty, target_or_action = null, options_or_target = {}, maybeOptions = {}) {
    try {
        let action_type = action_or_faculty;
        let target = target_or_action;
        let options = options_or_target;
        let fac = null;

        // Defensively handle when caller passes (faculty, action_type, target, options)
        if (typeof action_or_faculty === 'object' && action_or_faculty !== null) {
            fac = action_or_faculty;
            action_type = target_or_action;
            target = options_or_target;
            options = maybeOptions || {};
        }

        if (!fac && typeof window !== 'undefined') {
            const stored = localStorage.getItem('faculty_session') || localStorage.getItem('gradeflow_faculty') || localStorage.getItem('user_session');
            fac = stored ? JSON.parse(stored) : null;
        }
        await recordFacultyAction(fac, action_type, target, options);
    } catch (e) {
        // Safe failover
    }
}

// ── Shared Styles ───────────────────────────────────────────
const S = {
    page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
    eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-2)' },
    title: { fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: 'var(--space-2)' },
    subtitle: { fontSize: '13px', color: 'var(--tx-muted)', marginBottom: 'var(--space-6)' },
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-7)', padding: 'var(--space-6)' },
    input: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', padding: '10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
    sel: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', padding: '10px 36px 10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23586C6D' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'calc(100% - 12px) center', backgroundSize: '15px 15px' },
    label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.06em' },
    th: { padding: '10px var(--space-4)', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left' },
    td: { padding: '13px var(--space-4)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--tx-main)' },
    modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' },
    mbox: (w = '540px') => ({ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '100%', maxWidth: `min(94vw, ${w})`, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)', margin: 'auto' }),
    tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
    drawer: { position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '720px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 1100, overflowY: 'hidden', padding: 'max(var(--space-6), env(safe-area-inset-top)) clamp(var(--space-6),4vw,var(--space-9)) max(var(--space-6), env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', boxShadow: 'var(--shadow-lg)' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 1050 },
};
const btn = (v = 'primary') => ({ padding: '10px 20px', borderRadius: 'var(--radius-4)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: v === 'primary' ? 'var(--primary)' : v === 'danger' ? 'var(--red-bg)' : 'var(--surface-low)', color: v === 'primary' ? 'var(--bg)' : v === 'danger' ? 'var(--red)' : 'var(--tx-main)', ...(v !== 'primary' && { border: `1px solid ${v === 'danger' ? 'var(--red)' : 'var(--border)'}` }) });
const msgBox = ok => ({ padding: '10px 16px', borderRadius: 'var(--radius-4)', marginBottom: 'var(--space-4)', fontSize: '13px', fontWeight: 700, background: ok ? 'var(--green-bg)' : 'var(--surface-low)', color: ok ? 'var(--green)' : 'var(--tx-muted)', border: `1px solid ${ok ? 'var(--green)' : 'var(--border)'}` });

export function ClassesContent({ embedded = false }) {
    const [mounted, setMounted] = useState(false);
    const [faculty, setFaculty] = useState(null);
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [confirmingBulkRemove, setConfirmingBulkRemove] = useState(false);
    const [bulkRemoving, setBulkRemoving] = useState(false);
    const [confirmingDeleteClass, setConfirmingDeleteClass] = useState(false);
    const [deletingClass, setDeletingClass] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);
    const router = useRouter();
    const [semFilter, setSemFilter] = useState('all');
    const [classTab, setClassTab] = useState('roster');
    const [viewingList, setViewingList] = useState(null);
    const [availableSems, setAvailableSems] = useState([]);
    const [subjectToppers, setSubjectToppers] = useState([]);
    const [semToppers, setSemToppers] = useState([]);
    const [selectedSem, setSelectedSem] = useState(null);
    const [allMarks, setAllMarks] = useState([]);
    const [openStudent, setOpenStudent] = useState(null);
    const [studentMarks, setStudentMarks] = useState([]);
    const [loadingDrawer, setLoadingDrawer] = useState(false);
    const [editingName, setEditingName] = useState(false);
    const [editName, setEditName] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingClass, setEditingClass] = useState(null);
    const [editClassForm, setEditClassForm] = useState({
        id: '',
        name: '',
        branch: 'CS',
        semester: 6,
        scheme: '2022',
        section: 'A',
        faculty_id: 'all',
        academic_year: '2024-2025',
        batch: ''
    });
    const [editLoading, setEditLoading] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [addTab, setAddTab] = useState('single');
    const [importResult, setImportResult] = useState(null);
    const [showImportResult, setShowImportResult] = useState(false);
    // ── VTU Fetch Results: which portals to aim at ──
    // The catalog is resolved server-side from the session (/api/scrape/portals)
    // rather than from a faculty_id guessed in the browser, because this same
    // component renders in both the faculty and the admin portal.
    const [showScrapeModal, setShowScrapeModal] = useState(false);
    const [scrapePortals, setScrapePortals] = useState([]);
    const [scrapePortalsLoading, setScrapePortalsLoading] = useState(false);
    const [scrapePortalsError, setScrapePortalsError] = useState('');
    const [scrapePortalMode, setScrapePortalMode] = useState('all'); // 'all' | 'pick' | 'custom'
    const [scrapePickedUrls, setScrapePickedUrls] = useState(new Set());
    const [scrapePortalSearch, setScrapePortalSearch] = useState('');
    const [scrapeCustomUrl, setScrapeCustomUrl] = useState('');
    const [scrapeScheme, setScrapeScheme] = useState('2022');
    const [facultyList, setFacultyList] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [rosterSearch, setRosterSearch] = useState('');
    const [facultyFilter, setFacultyFilter] = useState('all');
    const [branchFilter, setBranchFilter] = useState('all');
    const [sectionFilter, setSectionFilter] = useState('all');
    const [semesterFilter, setSemesterFilter] = useState('all');
    const [batchFilter, setBatchFilter] = useState('all');
    const [nameIsManual, setNameIsManual] = useState(false);

    const suggestClassName = (bCode, sem, sec, batchYear) => {
        const b = bCode || 'CS';
        const s = sem ? `Sem ${sem}` : '';
        const sc = sec && sec !== 'General' ? `(Sec ${sec})` : (sec === 'General' ? '(General)' : '');
        const bt = batchYear ? `${batchYear} Batch` : '';
        return [b, s, sc, bt].filter(Boolean).join(' - ');
    };

    const handleNewClassChange = (patch) => {
        setNewClass(prev => {
            const updated = { ...prev, ...patch };
            if (patch.batch) {
                const bYear = parseInt(patch.batch, 10);
                if (!isNaN(bYear)) {
                    if (!patch.scheme) {
                        updated.scheme = bYear >= 2025 ? '2025' : '2022';
                    }
                    if (!patch.academic_year) {
                        updated.academic_year = `${bYear}-${bYear + 1}`;
                    }
                }
            }
            if (!nameIsManual || !updated.name?.trim()) {
                updated.name = suggestClassName(updated.branch, updated.semester, updated.section, updated.batch);
            }
            return updated;
        });
    };

    const latestClassSem = useMemo(() => {
        const validSems = (classes || []).map(c => Number(c.semester)).filter(s => !isNaN(s) && s > 0);
        return validSems.length > 0 ? Math.max(...validSems) : 6;
    }, [classes]);

    const openCreateClassModal = () => {
        setNameIsManual(false);
        const initBranch = branches[0]?.code || 'CS';
        const initSem = latestClassSem;
        const initSec = 'A';
        const initBatch = '2023';
        setNewClass({
            name: suggestClassName(initBranch, initSem, initSec, initBatch),
            branch: initBranch,
            semester: initSem,
            scheme: '2022',
            section: initSec,
            faculty_id: 'all',
            academic_year: '2024-2025',
            batch: initBatch
        });
        setShowCreate(true);
    };

    const [newClass, setNewClass] = useState({
        name: 'CS - Sem 6 - (Sec A) - 2023 Batch',
        branch: 'CS',
        semester: 6,
        scheme: '2022',
        section: 'A',
        faculty_id: 'all',
        academic_year: '2024-2025',
        batch: '2023'
    });
    const [addUsn, setAddUsn] = useState('');
    const [bulkUsns, setBulkUsns] = useState('');
    const [fileLoading, setFileLoading] = useState(false);
    const [msg, setMsg] = useState('');
    // ── VTU Fetch Results: which students, and the batch in flight ──
    const [scrapeScope, setScrapeScope] = useState('all');
    const [scrapePickedUsns, setScrapePickedUsns] = useState(new Set());
    const [scrapeStudentSearch, setScrapeStudentSearch] = useState('');
    const [scrapeForce, setScrapeForce] = useState(true);
    const [scrapeQueueing, setScrapeQueueing] = useState(false);
    const [scrapeError, setScrapeError] = useState('');
    // The batch being watched: { runId, classId, className, startedAt,
    // portalLabel, scopeLabel, jobs: [{ id, usn, name }], cached, failed }
    const [scrapeRun, setScrapeRun] = useState(null);
    const [scrapeStatus, setScrapeStatus] = useState({}); // jobId -> status row
    const [scrapeWatching, setScrapeWatching] = useState(false);
    const [scrapePollWarning, setScrapePollWarning] = useState('');
    const [selectedUsns, setSelectedUsns] = useState(new Set());
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [transferScope, setTransferScope] = useState('selected');
    const [transferSingleStudent, setTransferSingleStudent] = useState(null);
    const [transferTargetClassId, setTransferTargetClassId] = useState('');
    const [transferMode, setTransferMode] = useState('move');
    const [transferLoading, setTransferLoading] = useState(false);
    const [branches, setBranches] = useState([]);
    const [metaBatches, setMetaBatches] = useState([]);
    const [schemes, setSchemes] = useState(['2022', '2025', '2026']);
    const [exportSemester, setExportSemester] = useState(4);
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportType, setExportType] = useState('consolidated');
    const [facultyMap, setFacultyMap] = useState({});
    const [classSubjects, setClassSubjects] = useState([]);
    const [subjectTeachers, setSubjectTeachers] = useState([]);
    const [subjectTeachersLoading, setSubjectTeachersLoading] = useState(false);
    const fileRef = useRef(null);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        const data = await apiRequest('/api/system/meta').catch(() => null);
        if (data?.branches) setBranches(data.branches);
        if (data?.faculty) setFacultyList(data.faculty);
        if (data?.batches) setMetaBatches(data.batches);
        if (data?.schemes) setSchemes(data.schemes);
    };

    const loadSemesterExportData = async (targetSem) => {
        if (!selectedClass) return;

        setFacultyMap({});

        let resolvedFaculty = {};
        try {
            const res = await fetch(`/api/class-students?class_id=${selectedClass.id}&export_sem=${targetSem}`);
            const json = await res.json();
            if (json.success) {
                const marksData = json.marksData || [];
                const catData = json.catData || [];
                setAllMarks(marksData);

                if (catData && catData.length > 0) {
                    const formatted = catData.map(c => ({ id: c.id, code: c.subject_code, name: c.subject_name, credits: c.credits }));
                    setClassSubjects(formatted);
                } else if (marksData && marksData.length > 0) {
                    const codes = Array.from(new Set(marksData.map(m => m.subject_code)));
                    setClassSubjects(codes.map(c => ({ code: c, name: c })));
                } else {
                    setClassSubjects([]);
                }

                if (json.facultyMap && typeof json.facultyMap === 'object') {
                    resolvedFaculty = { ...json.facultyMap };
                }
            }
        } catch (e) {
            console.error('Failed to load export data:', e);
        }

        // Dynamically augment faculty assignments from analytics resolver
        try {
            const subjRes = await fetch(`/api/admin/analytics/subjects?branch=${encodeURIComponent(selectedClass.branch || '')}&semester=${targetSem}&classId=${selectedClass.id}`, { credentials: 'include' });
            const subjJson = await subjRes.json();
            if (subjJson.success) {
                (subjJson.data?.subjects || []).forEach(s => {
                    if (s.faculty && s.faculty !== 'Unassigned' && !resolvedFaculty[s.subject_code]) {
                        resolvedFaculty[s.subject_code] = s.faculty;
                    }
                });
            }
        } catch (e) {
            console.error('Failed to load real faculty assignments for export:', e);
        }

        setFacultyMap(resolvedFaculty);
    };

    const openPdfExportModal = async () => {
        if (!selectedClass) return;
        setMsg('');
        const initialSem = semFilter && semFilter !== 'all' ? Number(semFilter) : (Number(selectedClass.semester) || 1);
        setExportSemester(initialSem);
        setShowExportModal(true);
        await loadSemesterExportData(initialSem);
    };

    const handleSemesterChange = async (newSem) => {
        const parsed = Number(newSem);
        setExportSemester(parsed);
        await loadSemesterExportData(parsed);
    };

    const handleGeneratePdf = async () => {
        const { exportConsolidatedReportPDF, exportClassReportPDF } = await loadExportUtils();
        if (exportType === 'consolidated') {
            exportConsolidatedReportPDF({
                selectedClass,
                students,
                allMarks,
                subjects: classSubjects,
                facultyMap,
                targetSemester: exportSemester,
                institutionInfo: {
                    collegeName: 'Anjuman Institute of Technology and Management',
                    department: selectedClass.branch ? (selectedClass.branch.startsWith('Department of') ? selectedClass.branch : `Department of ${selectedClass.branch}`) : 'Department of Computer Science & Engineering',
                    address: '(Anjumanabad, Bhatkal - 581320)',
                    batch: selectedClass.batch || '',
                    academicYear: selectedClass.academic_year || ''
                },
                fileName: `${(selectedClass.name || 'Class').replace(/\s+/g, '_')}_Sem${exportSemester}_Consolidated_Report.pdf`
            });
        } else {
            exportClassReportPDF({ selectedClass, students, subjectToppers });
        }
        setShowExportModal(false);
    };

    const handleGenerateCsv = async () => {
        const { exportConsolidatedReportCSV, exportClassReportCSV } = await loadExportUtils();
        if (exportType === 'consolidated') {
            exportConsolidatedReportCSV({
                selectedClass,
                students,
                allMarks,
                subjects: classSubjects,
                facultyMap,
                targetSemester: exportSemester,
                institutionInfo: {
                    collegeName: 'Anjuman Institute of Technology and Management',
                    department: selectedClass.branch ? (selectedClass.branch.startsWith('Department of') ? selectedClass.branch : `Department of ${selectedClass.branch}`) : 'Department of Computer Science & Engineering',
                    address: '(Anjumanabad, Bhatkal - 581320)',
                    batch: selectedClass.batch || '',
                    academicYear: selectedClass.academic_year || ''
                },
                fileName: `${(selectedClass.name || 'Class').replace(/\s+/g, '_')}_Sem${exportSemester}_Consolidated_Report.csv`
            });
        } else {
            exportClassReportCSV({
                selectedClass,
                students,
                allMarks,
                subjects: classSubjects,
                subjectToppers,
                fileName: `${(selectedClass.name || 'Class').replace(/\s+/g, '_')}_Class_Report.csv`
            });
        }
        setShowExportModal(false);
    };

    /**
     * A real .xlsx of the class report — one sheet per section of the report,
     * numbers written as numbers.
     *
     * The CSV export now opens correctly in Excel (UTF-8 BOM + CRLF, see
     * lib/workbook-export.js), but a class report is five different tables and a
     * CSV can only ever be one flat sheet. This is the version faculty actually
     * want when they say "open it in Excel".
     */
    const handleGenerateExcel = async () => {
        if (!selectedClass) return;
        setExcelBusy(true);
        try {
            const cleanName = selectedClass.name || 'Class';
            const semForExport = exportType === 'consolidated' ? exportSemester : (selectedClass.semester ?? null);

            const marksByUsn = {};
            (allMarks || []).forEach(m => {
                if (semForExport != null && exportType === 'consolidated' && Number(m.semester) !== Number(semForExport)) return;
                if (!marksByUsn[m.usn]) marksByUsn[m.usn] = {};
                marksByUsn[m.usn][m.subject_code] = m;
            });

            const subList = (classSubjects && classSubjects.length > 0)
                ? classSubjects
                : Array.from(new Set((allMarks || []).map(m => m.subject_code))).filter(Boolean).map(code => ({ code, name: code }));

            const rosterRows = (students || []).map((st, idx) => {
                const canonical = semForExport != null ? st.semester_data?.[semForExport] : null;
                return [
                    idx + 1,
                    st.usn,
                    st.name || '',
                    st.lateral_entry ? 'Lateral (Diploma)' : 'Regular',
                    st.semester ?? '',
                    st.has_data && st.cgpa != null ? Number(st.cgpa) : null,
                    canonical?.sgpa ? Number(canonical.sgpa) : null,
                    st.total_backlogs ?? 0,
                    st.has_data ? (st.total_backlogs > 0 ? 'Carrying backlogs' : 'All clear') : 'No results yet'
                ];
            });

            const subjectRows = subList.map((sub, idx) => {
                let appeared = 0, passed = 0, failed = 0, highest = null;
                (students || []).forEach(st => {
                    const sm = marksByUsn[st.usn]?.[sub.code];
                    if (!sm) return;
                    appeared++;
                    if (isFailedSubject(sm)) failed++; else passed++;
                    const total = Number(sm.total);
                    if (Number.isFinite(total) && (highest === null || total > highest)) highest = total;
                });
                return [
                    idx + 1,
                    sub.code,
                    sub.name || sub.code,
                    facultyMap[sub.code] || '',
                    appeared,
                    passed,
                    failed,
                    appeared > 0 ? Number(((passed / appeared) * 100).toFixed(2)) : 0,
                    highest
                ];
            });

            const matrixRows = (students || []).map((st, idx) => ([
                idx + 1,
                st.usn,
                st.name || '',
                ...subList.map(sub => {
                    const sm = marksByUsn[st.usn]?.[sub.code];
                    const total = Number(sm?.total);
                    return Number.isFinite(total) ? total : null;
                })
            ]));

            const appeared = (students || []).filter(st => st.has_data).length;
            const clear = (students || []).filter(st => st.has_data && (st.total_backlogs ?? 0) === 0).length;

            await downloadWorkbook([
                {
                    name: 'Class Roster',
                    preamble: [
                        [`CLASS PERFORMANCE REPORT — ${cleanName}`],
                        ['Branch', selectedClass.branch || '', 'Semester', selectedClass.semester ?? '', 'Scheme', selectedClass.scheme || '', 'Batch', selectedClass.batch || ''],
                        ['Students', students?.length || 0, 'With results', appeared, 'All clear', clear, 'Generated', new Date().toLocaleString()],
                        []
                    ],
                    headers: ['#', 'USN', 'Name', 'Entry', 'Semester', 'CGPA', 'SGPA', 'Backlogs', 'Status'],
                    numberFormats: { CGPA: '0.00', SGPA: '0.00' },
                    rows: rosterRows
                },
                {
                    name: 'Subject Analysis',
                    headers: ['#', 'Subject Code', 'Subject Name', 'Faculty', 'Appeared', 'Passed', 'Failed', 'Pass %', 'Highest'],
                    numberFormats: { 'Pass %': '0.00' },
                    rows: subjectRows
                },
                {
                    name: 'Marks Matrix',
                    headers: ['#', 'USN', 'Name', ...subList.map(sub => `${sub.code}`)],
                    rows: matrixRows
                }
            ], `${cleanName.replace(/\s+/g, '_')}_Class_Report`);

            setShowExportModal(false);
        } catch (err) {
            console.error('Excel export error:', err);
            setMsg('Excel export failed: ' + (err.message || 'Unknown error'));
        } finally {
            setExcelBusy(false);
        }
    };

    const [classesError, setClassesError] = useState(null);

    useEffect(() => {
        const s = localStorage.getItem('faculty_session') || localStorage.getItem('admin_session');
        if (s) {
            try { setFaculty(JSON.parse(s)); } catch (e) {}
        }
        fetchClasses();
    }, []);

    const fetchClasses = async (isManual = false) => {
        const manual = isManual === true;
        setLoadingClasses(true);
        setClassesError(null);
        try {
            clearApiCache();
            const prevCount = classes.length;
            
            // Try apiRequest first, with a direct fetch fallback for maximum resilience
            let data = null;
            try {
                data = await apiRequest('/api/classes', { query: { _t: Date.now() } });
            } catch (apiErr) {
                console.warn('[ClassesContent] apiRequest failed, trying direct fetch fallback:', apiErr);
                const raw = await fetch(`/api/classes?_t=${Date.now()}`, { cache: 'no-store', credentials: 'include' });
                if (raw.ok) {
                    data = await raw.json();
                } else {
                    throw apiErr;
                }
            }

            if (data && data.success !== false) {
                const newClasses = data.classes || [];
                setClasses(newClasses);
                if (data.faculty && data.faculty.length > 0) {
                    setFacultyList(data.faculty);
                }
                if (manual) {
                    const diff = newClasses.length - prevCount;
                    if (diff > 0) {
                        setMsg(`✓ New data detected: +${diff} academic class(es) synced dynamically!`);
                    } else {
                        setMsg(`✓ Live sync verified: All ${newClasses.length} classes are up to date.`);
                    }
                    setTimeout(() => setMsg(''), 4500);
                }
            } else {
                throw new Error(data?.error?.message || data?.error || 'Failed to load classes.');
            }

            // Sync branches in background without blocking class list
            fetchBranches().catch(() => {});
        } catch (err) {
            console.error('Failed to fetch classes:', err);
            setClassesError(err?.message || 'Could not load classes. Please check your connection and retry.');
        } finally {
            setLoadingClasses(false);
        }
    };

    // `silent` is for the scraper's live refresh: pull fresh rows in the
    // background without blanking the table, flipping the spinner on, or
    // stamping a "roster verified" banner over whatever the run is reporting.
    const fetchClassStudents = useCallback(async (cls, isManual = false, silent = false) => {
        if (!silent) setLoadingStudents(true);
        if (!isManual && !silent) {
            setStudents([]); setAllMarks([]); setSubjectToppers([]); setAvailableSems([]); setSemFilter('all');
        }
        try {
            clearApiCache();
            const prevCount = students.length;
            const res = await apiRequest(`/api/class-students?class_id=${cls.id}&_t=${Date.now()}`);
            if (!res?.students) return;
            const studs = res.students || [];
            setStudents(studs);
            if (studs.length > 0) {
                const parsedSem = Number(cls.semester) || 1;
                const sems = Array.from({ length: parsedSem }, (_, i) => i + 1);
                setAvailableSems(sems);
                setSelectedSem(sems[sems.length - 1]);
            }
            if (isManual && !silent) {
                const diff = studs.length - prevCount;
                if (diff > 0) {
                    setMsg(`✓ New student enrollment detected: +${diff} student(s) synced dynamically!`);
                } else {
                    setMsg(`✓ Class roster verified: All ${studs.length} students are up to date.`);
                }
                setTimeout(() => setMsg(''), 4500);
            }
        } catch (err) {
            console.error('Failed to fetch class students:', err);
            if (!silent) setMsg('Failed to load students for this class.');
        } finally { if (!silent) setLoadingStudents(false); }
    }, [students.length]);

    const computeToppers = (marks, studs, sem, remarks = null) => {
        const filtered = marks.filter(m => Number(m.semester) === Number(sem));
        const bySubj = {};
        const byStudent = {};
        filtered.forEach(m => {
            const code = (m.subject_code || '').trim().toUpperCase();
            if (!code) return;
            if (!bySubj[code]) bySubj[code] = {};
            
            // Deduplicate per student for subject topper
            const existing = bySubj[code][m.usn];
            if (!existing || Number(m.total || 0) > Number(existing.total || 0)) {
                bySubj[code][m.usn] = m;
            }

            if (!byStudent[m.usn]) byStudent[m.usn] = 0;
            byStudent[m.usn] += Number(m.total || 0);
        });
        const nameMap = Object.fromEntries(studs.map(s => [s.usn, s.name]));
        const result = Object.entries(bySubj).map(([code, studentMap]) => {
            const rows = Object.values(studentMap);
            return {
                code,
                name: rows[0]?.subject_name || code,
                allScores: rows.sort((a, b) => (Number(b.total || 0) - Number(a.total || 0)) || (Number(b.external || 0) - Number(a.external || 0)) || (Number(b.internal || 0) - Number(a.internal || 0))).map(r => ({ usn: r.usn, name: nameMap[r.usn] || r.usn, total: Number(r.total || 0), internal: Number(r.internal || 0), external: Number(r.external || 0) }))
            };
        }).sort((a, b) => a.code.localeCompare(b.code));
        setSubjectToppers(result);

        let fullSem = [];
        if (remarks && remarks.some(r => Number(r.semester) === Number(sem) && r.sgpa !== null)) {
            fullSem = remarks.filter(r => Number(r.semester) === Number(sem) && r.sgpa !== null).map(r => ({ usn: r.student_usn, name: nameMap[r.student_usn] || r.student_usn, score: Number(r.sgpa), type: 'SGPA' })).sort((a, b) => b.score - a.score);
        } else {
            fullSem = Object.entries(byStudent).map(([usn, total]) => ({ usn, name: nameMap[usn] || usn, score: total, type: 'Marks' })).sort((a, b) => b.score - a.score);
        }
        setSemToppers(fullSem);
    };

    // Who teaches what in this specific class — resolved the same way the
    // Consolidated Report does (faculty_subject_assignments, class-scoped rows
    // preferred over class-agnostic ones), so this always matches what shows
    // up on the exported report for this class.
    const loadSubjectTeachers = useCallback(async (cls) => {
        if (!cls) { setSubjectTeachers([]); return; }
        setSubjectTeachersLoading(true);
        try {
            const res = await fetch(`/api/admin/analytics/subjects?branch=${encodeURIComponent(cls.branch || '')}&semester=${cls.semester || ''}&classId=${cls.id}`, { credentials: 'include' });
            const json = await res.json();
            if (json.success) {
                setSubjectTeachers((json.data?.subjects || []).filter(s => s.faculty && s.faculty !== 'Unassigned'));
            } else {
                setSubjectTeachers([]);
            }
        } catch (e) {
            console.error('Failed to load subject teachers for class:', e);
            setSubjectTeachers([]);
        } finally {
            setSubjectTeachersLoading(false);
        }
    }, []);

    const selectClass = cls => {
        setSelectedClass(cls);
        setMsg('');
        setRosterSearch('');
        setEditingName(false);
        setSelectedUsns(new Set());
        restoreScrapeRun(cls?.id);
        fetchClassStudents(cls);
        loadSubjectTeachers(cls);
    };

    // A scrape outlives the page that started it — the worker is a separate
    // process writing straight to Supabase. So the batch is parked in
    // localStorage and picked up again when the class is reopened, instead of
    // leaving the user with no way to see how their own run is going.
    const restoreScrapeRun = (classId) => {
        setScrapeStatus({});
        setScrapePollWarning('');
        if (!classId) { setScrapeRun(null); setScrapeWatching(false); return; }
        try {
            const raw = localStorage.getItem(scrapeRunKey(classId));
            if (!raw) { setScrapeRun(null); setScrapeWatching(false); return; }
            const saved = JSON.parse(raw);
            if (Array.isArray(saved?.jobs) && saved.jobs.length > 0 && Date.now() - (saved.startedAt || 0) < SCRAPE_RUN_TTL_MS) {
                setScrapeRun(saved);
                setScrapeWatching(true);
                return;
            }
            localStorage.removeItem(scrapeRunKey(classId));
        } catch (e) {
            // A corrupt or unreadable entry is not worth failing the class open over.
        }
        setScrapeRun(null);
        setScrapeWatching(false);
    };

    const createClass = async () => {
        if (!newClass.name.trim()) { setMsg('Class name required.'); return; }
        
        let facId = newClass.faculty_id;
        if (!facId || facId === 'all' || facId === 'current') {
            facId = faculty?.id || faculty?.sub;
            if (!facId) {
                try {
                    const facSess = localStorage.getItem('faculty_session') || localStorage.getItem('admin_session');
                    if (facSess) {
                        const parsed = JSON.parse(facSess);
                        facId = parsed.id || parsed.sub;
                    }
                } catch (e) {}
            }
        }

        const r = await fetch('/api/classes', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...(facId ? { 'x-faculty-id': facId } : {})
            },
            body: JSON.stringify({
                ...newClass,
                faculty_id: facId
            })
        });
        const j = await r.json();
        if (j.success) {
            setShowCreate(false);
            setNameIsManual(false);
            setNewClass({
                name: '',
                branch: 'CS',
                semester: latestClassSem,
                scheme: '2022',
                section: 'A',
                faculty_id: 'all',
                academic_year: '2024-2025',
                batch: '2023'
            });
            setMsg('✓ Class created successfully. Visible to all faculty & administrators.');
            await logActivity('CLASS_CREATE', newClass.name);
            fetchClasses();
        } else {
            setMsg(j.error || 'Failed to create class.');
        }
    };

    const openEditModal = (cls, e) => {
        if (e) e.stopPropagation();
        setEditingClass(cls);
        setEditClassForm({
            id: cls.id,
            name: cls.name || '',
            branch: cls.branch || 'CS',
            semester: cls.semester || latestClassSem || 1,
            scheme: cls.scheme || '2022',
            section: cls.section || 'A',
            faculty_id: cls.faculty_id || 'all',
            academic_year: cls.academic_year || '2024-2025',
            batch: cls.batch || ''
        });
        setShowEditModal(true);
    };

    const saveEditClass = async () => {
        if (!editClassForm.name?.trim()) {
            setMsg('Class name is required.');
            return;
        }

        setEditLoading(true);
        try {
            const r = await fetch('/api/classes', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(editClassForm)
            });
            const j = await r.json();
            if (j.success) {
                setShowEditModal(false);
                setMsg('✓ Class details updated successfully.');

                // Update local state immediately
                setClasses(prev => prev.map(c => c.id === editClassForm.id ? { ...c, ...j.class } : c));
                if (selectedClass && selectedClass.id === editClassForm.id) {
                    setSelectedClass(prev => ({ ...prev, ...j.class }));
                }
                logActivity('CLASS_EDIT', editClassForm.name);
                fetchClasses();
            } else {
                setMsg(j.error || 'Failed to update class.');
            }
        } catch (err) {
            setMsg('Failed to update class.');
        } finally {
            setEditLoading(false);
        }
    };

    const renameClass = async () => {
        if (!editName.trim()) return;
        const r = await fetch('/api/classes', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedClass.id, name: editName }) });
        const j = await r.json();
        if (j.success) { 
            setSelectedClass(p => ({ ...p, name: editName })); 
            setClasses(prev => prev.map(c => c.id === selectedClass.id ? { ...c, name: editName } : c)); 
            setEditingName(false); 
            logActivity('CLASS_EDIT', editName, { details: `Renamed class to "${editName}"` });
        }
    };

    const toggleSelectAll = (studsList) => {
        const list = studsList || students;
        if (selectedUsns.size === list.length && list.length > 0) {
            setSelectedUsns(new Set());
        } else {
            setSelectedUsns(new Set(list.map(s => s.usn)));
        }
    };

    const toggleSelectStudent = (usn) => {
        setSelectedUsns(prev => {
            const next = new Set(prev);
            if (next.has(usn)) next.delete(usn);
            else next.add(usn);
            return next;
        });
    };

    const openSingleStudentTransfer = (student, e) => {
        if (e) e.stopPropagation();
        setTransferSingleStudent(student);
        setTransferScope('single');
        setTransferMode('move');
        const otherClasses = classes.filter(c => c.id !== selectedClass?.id);
        setTransferTargetClassId(otherClasses[0]?.id || '');
        setShowTransferModal(true);
    };

    const openMultiStudentTransfer = (scope = 'selected') => {
        setTransferSingleStudent(null);
        setTransferScope(scope);
        setTransferMode('move');
        const otherClasses = classes.filter(c => c.id !== selectedClass?.id);
        setTransferTargetClassId(otherClasses[0]?.id || '');
        setShowTransferModal(true);
    };

    const executeTransfer = async () => {
        if (!transferTargetClassId) {
            setMsg('Please select a destination target class.');
            return;
        }

        let usns = [];
        let transferAll = false;

        if (transferScope === 'single' && transferSingleStudent) {
            usns = [transferSingleStudent.usn];
        } else if (transferScope === 'whole_class') {
            transferAll = true;
            usns = students.map(s => s.usn);
        } else {
            usns = Array.from(selectedUsns);
            if (usns.length === 0) {
                transferAll = true;
                usns = students.map(s => s.usn);
            }
        }

        if (usns.length === 0) {
            setMsg('No students found to transfer.');
            return;
        }

        setTransferLoading(true);
        try {
            const targetClassObj = classes.find(c => c.id === transferTargetClassId);
            const r = await fetch('/api/class-students/transfer', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source_class_id: selectedClass.id,
                    target_class_id: transferTargetClassId,
                    usns,
                    mode: transferMode,
                    transfer_all: transferAll
                })
            });
            const j = await r.json();
            if (j.success) {
                setShowTransferModal(false);
                setSelectedUsns(new Set());
                const actionVerb = transferMode === 'move' ? 'Transferred' : 'Copied';
                setMsg(`✓ ${actionVerb} ${j.transferred_count} student(s) to "${targetClassObj?.name || 'target class'}".`);

                // Optimistic instant state update
                if (transferMode === 'move') {
                    if (transferAll) {
                        setStudents([]);
                    } else {
                        const transferredSet = new Set(usns);
                        setStudents(prev => prev.filter(s => !transferredSet.has(s.usn)));
                    }
                }
                logActivity('CLASS_STUDENTS_TRANSFER', `${selectedClass.name} -> ${targetClassObj?.name} (${j.transferred_count} students)`);
                fetchClassStudents(selectedClass);
                fetchClasses();
            } else {
                setMsg(j.error || 'Failed to transfer students.');
            }
        } catch (err) {
            console.error('[executeTransfer error]', err);
            setMsg('Failed to transfer students. Please try again.');
        } finally {
            setTransferLoading(false);
        }
    };

    const removeSelectedStudents = async () => {
        const count = selectedUsns.size;
        if (count === 0) return;
        setBulkRemoving(true);
        try {
            for (const usn of Array.from(selectedUsns)) {
                await fetch('/api/class-students', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn }) });
            }
            setStudents(prev => prev.filter(s => !selectedUsns.has(s.usn)));
            setSelectedUsns(new Set());
            setMsg(`✓ Removed ${count} student(s) from class.`);
            fetchClasses();
        } finally {
            setBulkRemoving(false);
            setConfirmingBulkRemove(false);
        }
    };

    const deleteClass = async id => {
        setDeletingClass(true);
        try {
            logActivity('CLASS_DELETE', selectedClass?.name);
            await fetch('/api/classes', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
            setSelectedClass(null); fetchClasses();
        } finally {
            setDeletingClass(false);
            setConfirmingDeleteClass(false);
        }
    };

    const [csvPreview, setCsvPreview] = useState([]);
    const [excelBusy, setExcelBusy] = useState(false);

    const downloadCsvTemplate = () => {
        // Same BOM/CRLF writer as every other CSV in the app, so a template edited
        // and saved in Excel round-trips back through the importer unchanged.
        downloadCSV([
            ['USN', 'Name', 'Semester', 'Branch'],
            ['2AB23CS001', 'Mohammed Ainan Armar', 3, 'CS'],
            ['2AB23CS002', 'Sample Student 2', 3, 'CS']
        ], 'sample_class_roster.csv');
    };

    const handleCsvFile = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileLoading(true);
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const text = event.target?.result || '';
                const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                if (lines.length === 0) { setMsg('CSV file is empty.'); setFileLoading(false); return; }

                const parsed = [];
                const headers = lines[0].split(',').map(c => c.trim().replace(/^"|"$/g, '').toLowerCase());

                let usnIdx = -1;
                let nameIdx = -1;
                let semIdx = -1;
                let branchIdx = -1;

                headers.forEach((h, idx) => {
                    if (h === 'usn' || h.includes('usn')) usnIdx = idx;
                    else if (h.includes('name') || h.includes('student')) nameIdx = idx;
                    else if (h.includes('sem')) semIdx = idx;
                    else if (h.includes('branch')) branchIdx = idx;
                });

                let startIdx = 0;
                if (usnIdx !== -1) {
                    startIdx = 1;
                } else {
                    usnIdx = 0;
                    nameIdx = 1;
                    semIdx = 2;
                    branchIdx = 3;
                    startIdx = 0;
                }

                const isValidUsnFormat = (str) => {
                    if (!str || str.length < 7 || str.length > 12) return false;
                    const val = str.toUpperCase();
                    return /[A-Z]/.test(val) && /[0-9]/.test(val);
                };

                for (let i = startIdx; i < lines.length; i++) {
                    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                    if (cols.length > usnIdx && cols[usnIdx]) {
                        const usn = cols[usnIdx].toUpperCase();
                        if (usn === 'USN') continue;
                        if (!isValidUsnFormat(usn)) continue;

                        const rawName = nameIdx !== -1 && cols[nameIdx] ? cols[nameIdx] : usn;
                        const name = rawName && !isValidUsnFormat(rawName) ? rawName : usn;
                        const semester = semIdx !== -1 && cols[semIdx] ? parseInt(cols[semIdx]) : null;
                        const branch = branchIdx !== -1 && cols[branchIdx] ? cols[branchIdx] : null;

                        parsed.push({
                            usn,
                            name: name || usn,
                            semester: isNaN(semester) ? null : semester,
                            branch
                        });
                    }
                }

                if (parsed.length > 0) {
                    setCsvPreview(parsed);
                    setMsg(`✓ Parsed ${parsed.length} student(s) from CSV.`);
                } else {
                    setMsg('No valid USNs found in CSV file.');
                }
            } catch (err) {
                setMsg('Failed to read CSV file.');
            } finally {
                setFileLoading(false);
            }
        };
        reader.readAsText(file);
    };

    const addStudent = async () => {
        let payload = null;

        if (addTab === 'csv' && csvPreview.length > 0) {
            payload = {
                class_id: selectedClass.id,
                students: csvPreview
            };
        } else {
            const raw = addUsn.trim();
            if (!raw) { setMsg('Please enter student USN(s).'); return; }

            const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
            const parsed = [];
            lines.forEach(line => {
                const parts = line.split(',').map(p => p.trim());
                if (parts[0]) {
                    parsed.push({
                        usn: parts[0].toUpperCase(),
                        name: parts[1] || parts[0]
                    });
                }
            });

            payload = {
                class_id: selectedClass.id,
                students: parsed
            };
        }

        let facId = faculty?.id || faculty?.sub;
        if (!facId) {
            try {
                const facSess = localStorage.getItem('faculty_session') || localStorage.getItem('admin_session');
                if (facSess) facId = JSON.parse(facSess).id;
            } catch (e) {}
        }

        payload.faculty_id = facId;

        const r = await fetch('/api/class-students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const j = await r.json();
        if (j.success) {
            setAddUsn('');
            setCsvPreview([]);
            setShowAddModal(false);
            setMsg(`✓ ${j.added || 1} student(s) added successfully.`);
            logActivity('CLASS_ADD_STUDENT', selectedClass.name);
            fetchClassStudents(selectedClass);
            fetchClasses();
        } else {
            setMsg(j.error || 'Failed to add student. Please check USNs and try again.');
        }
    };

    const removeStudent = async (usn, studentName = '') => {
        const displayName = studentName ? `${studentName} (${usn})` : usn;
        if (!confirm(`Remove ${displayName} from ${selectedClass?.name || 'this class'} roster?`)) return;
        await fetch('/api/class-students', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn }) });
        logActivity('CLASS_REMOVE_STUDENT', usn);
        setStudents(p => p.filter(s => s.usn !== usn)); fetchClasses();
    };

    // ════════════════════════════════════════════════════════════════════════
    //  VTU "Fetch Results" — scope resolution, queueing, and live progress
    //
    //  Three things this has to get right, because a half-run scrape is worse
    //  than no scrape at all:
    //    1. Any scope. One student, a hand-picked few, the whole roster, the
    //       students carrying backlogs, or the ones with no results at all.
    //    2. Any portal. Every active portal (deep scan), a chosen subset, or a
    //       URL pasted straight from a VTU announcement.
    //    3. Survive what actually goes wrong: a reload mid-run, a worker that
    //       dies holding a job, a flaky poll, a roster bigger than one request.
    // ════════════════════════════════════════════════════════════════════════

    // Read by the polling interval, which must not be torn down and rebuilt
    // every time the roster changes underneath it.
    const fetchClassStudentsRef = useRef(fetchClassStudents);
    fetchClassStudentsRef.current = fetchClassStudents;
    const selectedClassRef = useRef(selectedClass);
    selectedClassRef.current = selectedClass;

    const persistScrapeRun = (run) => {
        try { localStorage.setItem(scrapeRunKey(run.classId), JSON.stringify(run)); } catch (e) { /* private mode */ }
    };
    const forgetScrapeRun = (classId) => {
        try { localStorage.removeItem(scrapeRunKey(classId)); } catch (e) { /* private mode */ }
    };

    // Every scope reads from `students`, the same array the roster table renders,
    // so what the modal counts is exactly what the user can see.
    const scrapeScopeGroups = useMemo(() => ({
        all: students,
        selected: students.filter(s => selectedUsns.has(s.usn)),
        backlogs: students.filter(s => (s.total_backlogs || 0) > 0),
        missing: students.filter(s => !s.has_data),
        custom: students.filter(s => scrapePickedUsns.has(s.usn)),
    }), [students, selectedUsns, scrapePickedUsns]);

    const scrapeTargets = scrapeScopeGroups[scrapeScope] || scrapeScopeGroups.all;

    const scrapeTargetUrls = useMemo(() => {
        if (scrapePortalMode === 'pick') return Array.from(scrapePickedUrls);
        if (scrapePortalMode === 'custom') {
            return scrapeCustomUrl.split(/[\s,;]+/).map(u => u.trim()).filter(Boolean);
        }
        return []; // 'all' — no override, the worker walks every active portal
    }, [scrapePortalMode, scrapePickedUrls, scrapeCustomUrl]);

    const scrapePortalLabel = useMemo(() => {
        if (scrapePortalMode === 'all') return `All ${scrapePortals.length} active portal(s) · deep scan`;
        if (scrapeTargetUrls.length === 0) return 'No portal chosen yet';
        if (scrapeTargetUrls.length === 1) {
            const match = scrapePortals.find(p => p.url === scrapeTargetUrls[0]);
            return match?.exam_name || scrapeTargetUrls[0];
        }
        return `${scrapeTargetUrls.length} portals`;
    }, [scrapePortalMode, scrapeTargetUrls, scrapePortals]);

    const visibleScrapePortals = useMemo(() => {
        const q = scrapePortalSearch.trim().toLowerCase();
        if (!q) return scrapePortals;
        return scrapePortals.filter(p => `${p.exam_name || ''} ${p.url || ''}`.toLowerCase().includes(q));
    }, [scrapePortals, scrapePortalSearch]);

    const visibleScrapeStudents = useMemo(() => {
        const q = scrapeStudentSearch.trim();
        if (!q) return students;
        return filterAndRankStudents(students, q);
    }, [students, scrapeStudentSearch]);

    const openScrapeModal = (presetScope, presetUsns) => {
        if (!selectedClass) return;
        // Opening with rows ticked in the roster means "these ones" — anything
        // else would quietly ignore a selection the user just made.
        const scope = presetScope || (selectedUsns.size > 0 ? 'selected' : 'all');
        setScrapeScope(scope);
        setScrapePickedUsns(new Set(presetUsns || selectedUsns));
        setScrapeScheme(normalizePortalScheme(selectedClass.scheme));
        setScrapePortalMode('all');
        setScrapePickedUrls(new Set());
        setScrapePortalSearch('');
        setScrapeStudentSearch('');
        setScrapeCustomUrl('');
        setScrapeForce(true);
        setScrapeError('');
        setShowScrapeModal(true);
    };

    const toggleScrapePickedUsn = (usn) => {
        setScrapePickedUsns(prev => {
            const next = new Set(prev);
            if (next.has(usn)) next.delete(usn); else next.add(usn);
            return next;
        });
    };

    const toggleScrapePickedUrl = (url) => {
        setScrapePickedUrls(prev => {
            const next = new Set(prev);
            if (next.has(url)) next.delete(url); else next.add(url);
            return next;
        });
    };

    // Portal catalog for the chosen scheme. Reloaded whenever the scheme
    // changes so a 2022-scheme class can still be aimed at an NEP portal.
    useEffect(() => {
        if (!showScrapeModal || !selectedClass?.id) return;
        let cancelled = false;
        (async () => {
            setScrapePortalsLoading(true);
            setScrapePortalsError('');
            try {
                const data = await apiRequest('/api/scrape/portals', {
                    query: { scheme: scrapeScheme, class_id: selectedClass.id },
                });
                if (cancelled) return;
                setScrapePortals(data?.portals || []);
            } catch (err) {
                if (cancelled) return;
                console.error('Failed to load VTU portals:', err);
                setScrapePortals([]);
                setScrapePortalsError(err?.message || 'Could not load the VTU portal list.');
            } finally {
                if (!cancelled) setScrapePortalsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [showScrapeModal, scrapeScheme, selectedClass?.id]);

    const startClassScrape = async () => {
        if (!selectedClass) return;

        const targets = scrapeTargets;
        if (targets.length === 0) {
            setScrapeError('That selection matches no students. Pick a different scope.');
            return;
        }
        if (scrapePortalMode !== 'all' && scrapeTargetUrls.length === 0) {
            setScrapeError(scrapePortalMode === 'custom'
                ? 'Paste at least one results.vtu.ac.in URL.'
                : 'Tick at least one portal, or switch back to all active portals.');
            return;
        }
        const badUrl = scrapeTargetUrls.find(u => !u.toLowerCase().includes('vtu.ac.in'));
        if (badUrl) {
            setScrapeError(`"${badUrl}" is not a results.vtu.ac.in URL.`);
            return;
        }

        setScrapeQueueing(true);
        setScrapeError('');

        try {
            // `faculty` falls back to the admin_session when this component
            // renders inside the admin terminal (see the useEffect above), so
            // its id is an admin_users row there — not a faculty_onboarding
            // one. Sending that as faculty_id violates scraper_jobs' FK and
            // 500s the whole queue request, so only forward a real faculty id.
            const isRealFaculty = faculty && faculty.role !== 'admin' && faculty.role !== 'superadmin';
            const facultyId = isRealFaculty ? (faculty?.id || faculty?.sub || null) : null;
            const nameByUsn = {};
            targets.forEach(s => { nameByUsn[s.usn] = s.name || s.usn; });
            const usnList = targets.map(s => s.usn);

            const jobs = [];
            const cached = [];
            const failed = [];

            // /api/scrape caps one request at 400 USNs. Chunking here keeps a
            // large cohort a queueing detail rather than an error the user has
            // to work around by selecting students in batches by hand.
            for (let i = 0; i < usnList.length; i += 200) {
                const chunk = usnList.slice(i, i + 200);
                const res = await apiRequest('/api/scrape', {
                    method: 'POST',
                    body: JSON.stringify({
                        usns: chunk,
                        force: scrapeForce,
                        faculty_id: facultyId,
                        scheme: scrapeScheme,
                        target_urls: scrapeTargetUrls,
                        class_id: selectedClass.id,
                    }),
                });

                (res?.jobs || []).forEach(j => {
                    if (j.status === 'queued' && j.jobId) {
                        jobs.push({ id: j.jobId, usn: j.usn, name: nameByUsn[j.usn] || j.usn });
                    } else if (j.status === 'cached') {
                        cached.push(j.usn);
                    } else {
                        failed.push({ usn: j.usn, error: j.error || 'Could not be queued.' });
                    }
                });
            }

            if (jobs.length === 0) {
                if (cached.length > 0 && failed.length === 0) {
                    setScrapeError(`All ${cached.length} of those students already have results stored. Tick "Re-fetch even if results already exist" to scan them again.`);
                } else {
                    setScrapeError(failed[0]?.error || 'Nothing could be queued. Please try again.');
                }
                return;
            }

            const run = {
                runId: `${selectedClass.id}-${Date.now()}`,
                classId: selectedClass.id,
                className: selectedClass.name,
                startedAt: Date.now(),
                portalLabel: scrapePortalLabel,
                scopeLabel: SCRAPE_SCOPE_LABELS[scrapeScope] || 'Custom selection',
                jobs,
                cached,
                failed,
            };

            setScrapeStatus({});
            setScrapeRun(run);
            setScrapeWatching(true);
            setScrapePollWarning('');
            persistScrapeRun(run);
            setShowScrapeModal(false);
            setMsg(`✓ Queued ${jobs.length} VTU fetch job(s)${cached.length ? ` · ${cached.length} already cached` : ''}${failed.length ? ` · ${failed.length} could not be queued` : ''}.`);
            logActivity('VTU_CLASS_FETCH', null, {
                context_module: 'Classes',
                details: `Queued ${jobs.length} scrape job(s) for "${selectedClass.name}" — ${run.scopeLabel.toLowerCase()} via ${run.portalLabel}`,
                metadata: { class_id: selectedClass.id, scope: scrapeScope, portals: scrapeTargetUrls, usn_count: jobs.length },
            });
        } catch (err) {
            console.error('Class scrape queue failed:', err);
            setScrapeError(err?.message || 'Could not reach the scrape queue. Check your connection and try again.');
        } finally {
            setScrapeQueueing(false);
        }
    };

    // Live progress. Polls only while a batch is being watched, and stops the
    // moment every job in it reaches a terminal status.
    useEffect(() => {
        if (!scrapeWatching || !scrapeRun?.jobs?.length) return;

        const ids = scrapeRun.jobs.map(j => j.id);
        const runClassId = scrapeRun.classId;
        const startedAt = scrapeRun.startedAt;
        let cancelled = false;
        let consecutiveFailures = 0;
        let lastRosterRefresh = Date.now();

        const readStatuses = async () => {
            const merged = {};
            // Comma-joined id list, in slices, so a 400-job run still polls with
            // a URL no proxy is going to truncate.
            for (let i = 0; i < ids.length; i += 50) {
                const data = await apiRequest('/api/scrape/status', {
                    query: { jobIds: ids.slice(i, i + 50).join(',') },
                });
                (data?.jobs || []).forEach(j => { merged[j.id] = j; });
            }
            return merged;
        };

        const refreshRoster = () => {
            const cls = selectedClassRef.current;
            if (cls?.id === runClassId) fetchClassStudentsRef.current?.(cls, false, true);
        };

        const tick = async () => {
            try {
                const merged = await readStatuses();
                if (cancelled) return;

                consecutiveFailures = 0;
                setScrapePollWarning('');
                setScrapeStatus(merged);

                const rows = ids.map(id => merged[id]).filter(Boolean);
                const terminal = rows.filter(r => r.isTerminal).length;

                if (rows.length === ids.length && terminal === ids.length) {
                    setScrapeWatching(false);
                    forgetScrapeRun(runClassId);
                    const ok = rows.filter(r => r.status === 'finished').length;
                    const none = rows.filter(r => r.status === 'no_result').length;
                    const bad = rows.filter(r => r.status === 'error' || r.status === 'missing').length;
                    setMsg(`✓ VTU fetch complete — ${ok} updated${none ? `, ${none} with no new results` : ''}${bad ? `, ${bad} failed` : ''}.`);
                    refreshRoster();
                    return;
                }

                // Marks land in the database job by job, so the roster is pulled
                // forward during the run rather than only once at the end.
                if (terminal > 0 && Date.now() - lastRosterRefresh > 20000) {
                    lastRosterRefresh = Date.now();
                    refreshRoster();
                }

                if (Date.now() - startedAt > SCRAPE_RUN_TTL_MS) {
                    setScrapeWatching(false);
                    forgetScrapeRun(runClassId);
                    setScrapePollWarning('Stopped watching after 45 minutes. Any jobs still running will keep going in the background — use Refresh later to pick up their results.');
                }
            } catch (err) {
                if (cancelled) return;
                consecutiveFailures += 1;
                // A dropped poll is expected now and then (a sleeping laptop, a
                // redeploy). Keep retrying; only say something once it stops
                // looking like a blip, and only give up after ~2 minutes of them.
                if (consecutiveFailures >= 3) {
                    setScrapePollWarning('Live progress cannot reach the server right now — still retrying.');
                }
                if (consecutiveFailures >= 40) {
                    setScrapeWatching(false);
                    setScrapePollWarning('Gave up watching progress after repeated network failures. The queued jobs themselves are unaffected — use Refresh once you are back online.');
                }
            }
        };

        tick();
        const timer = setInterval(tick, 3000);
        return () => { cancelled = true; clearInterval(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scrapeWatching, scrapeRun?.runId]);

    const scrapeProgress = useMemo(() => {
        if (!scrapeRun?.jobs?.length) return null;
        const rows = scrapeRun.jobs.map(j => ({ ...j, ...(scrapeStatus[j.id] || {}) }));
        const done = rows.filter(r => r.isTerminal).length;
        return {
            rows,
            total: rows.length,
            done,
            running: rows.filter(r => r.status === 'running').length,
            finished: rows.filter(r => r.status === 'finished').length,
            noResult: rows.filter(r => r.status === 'no_result').length,
            errored: rows.filter(r => r.status === 'error' || r.status === 'missing').length,
            pct: Math.round((done / rows.length) * 100),
        };
    }, [scrapeRun, scrapeStatus]);

    const stopWatchingScrape = () => {
        setScrapeWatching(false);
        if (scrapeRun?.classId) forgetScrapeRun(scrapeRun.classId);
    };

    const dismissScrapeRun = () => {
        if (scrapeRun?.classId) forgetScrapeRun(scrapeRun.classId);
        setScrapeWatching(false);
        setScrapeRun(null);
        setScrapeStatus({});
        setScrapePollWarning('');
    };

    // Re-open the picker pre-loaded with just the students that did not come
    // back with data, so a retry does not mean re-scanning the whole class.
    const retryFailedScrape = () => {
        if (!scrapeProgress) return;
        const retryUsns = scrapeProgress.rows
            .filter(r => r.status === 'error' || r.status === 'no_result' || r.status === 'missing')
            .map(r => r.usn);
        if (retryUsns.length === 0) return;
        openScrapeModal('custom', new Set(retryUsns));
    };

    const filteredStudents = useMemo(() => {
        if (!rosterSearch.trim()) return students;
        return filterAndRankStudents(students, rosterSearch);
    }, [students, rosterSearch]);

    const top10 = [...students].filter(s => s.cgpa !== null).sort((a, b) => b.cgpa - a.cgpa).slice(0, 10);
    const totalBacklogs = students.reduce((s, st) => s + (st.total_backlogs || 0), 0);
    const withCgpa = students.filter(s => s.cgpa !== null);
    const avgCgpa = withCgpa.length ? (withCgpa.reduce((s, st) => s + (st.cgpa || 0), 0) / withCgpa.length).toFixed(2) : '—';
    const classTopper = top10[0] || null;

    // Batches that exist, plus active registered batches and all intake years
    const availableClassBatches = Array.from(new Set([
        ...classes.map(c => c.batch).filter(Boolean).map(String),
        ...metaBatches,
        ...BATCH_INTAKE_YEARS
    ])).sort((a, b) => b.localeCompare(a));

    const availableClassSections = Array.from(new Set([
        'A', 'B', 'C', 'D', 'E', 'F', 'General',
        ...classes.map(c => c.section).filter(Boolean).map(s => String(s).toUpperCase())
    ])).sort();

    const displayedClasses = useMemo(() => {
        const base = classes.filter(cls => {
            if (facultyFilter !== 'all' && cls.faculty_id !== facultyFilter) return false;
            if (branchFilter !== 'all' && cls.branch !== branchFilter) return false;
            if (semesterFilter !== 'all' && String(cls.semester) !== String(semesterFilter)) return false;
            if (batchFilter !== 'all' && String(cls.batch || '') !== String(batchFilter)) return false;
            if (sectionFilter !== 'all') {
                const clsSec = String(cls.section || '').toUpperCase().trim();
                if (sectionFilter === 'General') {
                    if (clsSec !== 'GENERAL' && clsSec !== '') return false;
                } else if (clsSec !== String(sectionFilter).toUpperCase().trim()) {
                    return false;
                }
            }
            return true;
        });

        if (searchQuery.trim()) {
            return filterAndRank(base, searchQuery, ['name', 'branch', 'section', 'batch', 'faculty_name', 'scheme', 'academic_year']);
        }
        return base;
    }, [classes, facultyFilter, branchFilter, semesterFilter, batchFilter, sectionFilter, searchQuery]);

    return (
        <div style={S.page} className="gf-fade-up">
            {selectedClass ? (
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                        <button
                            onClick={() => {
                                setSelectedClass(null);
                                // The run stays in localStorage; reopening the
                                // class picks the watch back up where it left off.
                                setScrapeWatching(false);
                                setScrapeRun(null);
                                setScrapeStatus({});
                            }}
                            style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>Classes
                        </button>
                        <span style={{ color: 'var(--tx-dim)' }}>›</span>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>{selectedClass.name}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}>
                        <div>
                            <h1 style={S.title}>{selectedClass.name}</h1>
                            <p style={S.subtitle}>
                                {selectedClass.branch} · Sem {selectedClass.semester} {selectedClass.section ? `· Sec ${selectedClass.section} ` : ''}{selectedClass.batch ? `· ${selectedClass.batch} Batch ` : ''}· {selectedClass.scheme} Scheme · 👨‍🏫 {selectedClass.faculty_name || 'All Faculty (Shared)'} · {students.length} students
                            </p>
                            {!subjectTeachersLoading && subjectTeachers.length > 0 && (
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' }}>
                                    {subjectTeachers.map(s => (
                                        <div
                                            key={s.subject_code}
                                            title={s.subject_name}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '8px', padding: '4px 10px', fontSize: '11px' }}
                                        >
                                            <span style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{s.subject_code}</span>
                                            <span style={{ color: 'var(--tx-dim)' }}>·</span>
                                            <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{s.faculty}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                style={{ ...btn('primary'), display: 'flex', alignItems: 'center', gap: '6px' }}
                                onClick={() => openScrapeModal()}
                                title="Fetch official VTU results for students in this class"
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>cloud_download</span>
                                {selectedUsns.size > 0 ? `Fetch Results (${selectedUsns.size})` : 'Fetch Results'}
                            </button>
                            <button style={{ ...btn('ghost'), display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => openEditModal(selectedClass)}>
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>Edit Class
                            </button>
                            <button style={{ ...btn('ghost'), display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => openMultiStudentTransfer(selectedUsns.size > 0 ? 'selected' : 'whole_class')}>
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>swap_horiz</span>
                                {selectedUsns.size > 0 ? `Transfer Selected (${selectedUsns.size})` : 'Transfer / Move Class'}
                            </button>
                            <button style={btn('primary')} onClick={() => { setShowAddModal(true); setAddTab('manual'); setMsg(''); }}>
                                <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>person_add</span>Add Students
                            </button>
                            <button style={btn('ghost')} onClick={() => { setShowAddModal(true); setAddTab('csv'); setMsg(''); setTimeout(() => fileRef.current?.click(), 100); }}>
                                <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>upload_file</span>Import CSV
                            </button>
                            <button style={btn('danger')} onClick={() => setConfirmingDeleteClass(true)}>Delete Class</button>
                        </div>
                    </div>

                    {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

                    {/* ── Live VTU fetch progress ── */}
                    {scrapeProgress && (
                        <div style={{ ...S.card, padding: '16px 20px', marginBottom: '20px', borderColor: scrapeWatching ? 'var(--primary)' : 'var(--border)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                                <div style={{ minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span
                                            className="material-icons-round"
                                            style={{ fontSize: '18px', color: 'var(--primary)', animation: scrapeWatching ? 'spin 1.6s linear infinite' : 'none' }}
                                        >
                                            {scrapeWatching ? 'sync' : 'task_alt'}
                                        </span>
                                        <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            {scrapeWatching ? 'Fetching VTU results…' : 'VTU fetch run'}
                                        </span>
                                        <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>
                                            {scrapeProgress.done}/{scrapeProgress.total}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                        {scrapeRun.scopeLabel} · {scrapeRun.portalLabel}
                                        {scrapeRun.cached?.length > 0 ? ` · ${scrapeRun.cached.length} skipped (already cached)` : ''}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    {scrapeWatching && (
                                        <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px' }} onClick={stopWatchingScrape}>
                                            Stop watching
                                        </button>
                                    )}
                                    {!scrapeWatching && scrapeProgress.errored + scrapeProgress.noResult > 0 && (
                                        <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px' }} onClick={retryFailedScrape}>
                                            Retry {scrapeProgress.errored + scrapeProgress.noResult}
                                        </button>
                                    )}
                                    <button style={{ ...btn('ghost'), padding: '6px 10px', fontSize: '12px' }} onClick={dismissScrapeRun}>
                                        Dismiss
                                    </button>
                                </div>
                            </div>

                            <div style={{ height: '8px', background: 'var(--surface-low)', borderRadius: '999px', overflow: 'hidden', margin: '12px 0 10px' }}>
                                <div style={{ width: `${scrapeProgress.pct}%`, height: '100%', background: 'var(--primary)', transition: 'width .4s ease' }} />
                            </div>

                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {[
                                    { key: 'running', count: scrapeProgress.running, meta: SCRAPE_STATUS_META.running },
                                    { key: 'finished', count: scrapeProgress.finished, meta: SCRAPE_STATUS_META.finished },
                                    { key: 'no_result', count: scrapeProgress.noResult, meta: SCRAPE_STATUS_META.no_result },
                                    { key: 'error', count: scrapeProgress.errored, meta: SCRAPE_STATUS_META.error },
                                ].filter(x => x.count > 0).map(x => (
                                    <span key={x.key} style={{ background: x.meta.bg, color: x.meta.color, border: '1px solid var(--border)', padding: '3px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 800 }}>
                                        {x.count} {x.meta.label.toLowerCase()}
                                    </span>
                                ))}
                            </div>

                            {scrapePollWarning && (
                                <div style={{ marginTop: '10px', fontSize: '11px', fontWeight: 700, color: 'var(--amber, #B45309)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>wifi_tethering_off</span>
                                    {scrapePollWarning}
                                </div>
                            )}

                            <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
                                {scrapeProgress.rows.map(r => {
                                    const meta = scrapeMeta(r.status);
                                    return (
                                        <span
                                            key={r.id}
                                            title={`${r.name} (${r.usn}) — ${r.error || meta.label}`}
                                            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: meta.bg, color: meta.color, border: '1px solid var(--border)', borderRadius: '6px', padding: '3px 8px', fontSize: '10px', fontWeight: 800, fontFamily: 'monospace' }}
                                        >
                                            <span
                                                className="material-icons-round"
                                                style={{ fontSize: '13px', animation: r.status === 'running' ? 'spin 1.4s linear infinite' : 'none' }}
                                            >
                                                {meta.icon}
                                            </span>
                                            {r.usn}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                        <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>Student Roster</div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ position: 'relative', width: '200px' }}>
                                    <input
                                        type="text"
                                        placeholder="Search USN, name..."
                                        value={rosterSearch}
                                        onChange={e => setRosterSearch(e.target.value)}
                                        style={{ ...S.input, padding: '6px 28px 6px 30px', fontSize: '12px', height: '32px', borderRadius: '8px' }}
                                    />
                                    <span className="material-icons-round" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: 'var(--tx-dim)', pointerEvents: 'none' }}>search</span>
                                    {rosterSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setRosterSearch('')}
                                            style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--tx-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '2px' }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>close</span>
                                        </button>
                                    )}
                                </div>
                                <select
                                    value={semFilter}
                                    onChange={e => setSemFilter(e.target.value)}
                                    style={{ ...S.sel, width: 'auto', padding: '6px 12px', fontSize: '12px', fontWeight: 800, borderRadius: '8px', cursor: 'pointer' }}
                                >
                                    <option value="all">🌐 All Semesters (Overall CGPA)</option>
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                        <option key={s} value={s}>Semester {s} (SGPA View)</option>
                                    ))}
                                </select>
                                <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={openPdfExportModal}>
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--red)' }}>picture_as_pdf</span>Export PDF
                                </button>
                                <button
                                    style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={handleGenerateExcel}
                                    disabled={excelBusy}
                                    title="Opens directly in Excel — one sheet per section, numbers stay numeric"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--green)' }}>grid_on</span>
                                    {excelBusy ? 'Building…' : 'Export Excel'}
                                </button>
                                <button
                                    style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={async () => {
                                        const { exportClassReportCSV } = await loadExportUtils();
                                        exportClassReportCSV({ selectedClass, students, allMarks, subjects: classSubjects, subjectToppers });
                                    }}
                                    title="UTF-8 CSV with a byte-order mark — double-click opens it into columns in Excel"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-muted)' }}>table_view</span>Export CSV
                                </button>
                                <button
                                    style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => fetchClassStudents(selectedClass, true)}
                                    disabled={loadingStudents}
                                    title="Refresh student roster for this class"
                                >
                                    <span
                                        className="material-icons-round"
                                        style={{
                                            fontSize: '16px',
                                            color: 'var(--primary)',
                                            animation: loadingStudents ? 'spin 1s linear infinite' : 'none'
                                        }}
                                    >
                                        refresh
                                    </span>
                                    {loadingStudents ? 'Refreshing...' : 'Refresh'}
                                </button>
                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginLeft: '4px' }}>{filteredStudents.length} students</div>
                            </div>
                        </div>

                        {/* Selected Students Actions Bar */}
                        {selectedUsns.size > 0 && (
                            <div style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>check_circle</span>
                                    {selectedUsns.size} student(s) selected
                                </div>
                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                    <button style={{ ...btn('primary'), padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => openScrapeModal('selected')}>
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>cloud_download</span>Fetch Results ({selectedUsns.size})
                                    </button>
                                    <button style={{ ...btn('ghost'), padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => openMultiStudentTransfer('selected')}>
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>swap_horiz</span>Transfer Selected ({selectedUsns.size})
                                    </button>
                                    <button style={{ ...btn('danger'), padding: '6px 12px', fontSize: '12px' }} onClick={() => setConfirmingBulkRemove(true)}>
                                        Remove Selected ({selectedUsns.size})
                                    </button>
                                    <button style={{ ...btn('ghost'), padding: '6px 10px', fontSize: '12px' }} onClick={() => setSelectedUsns(new Set())}>
                                        Deselect All
                                    </button>
                                </div>
                            </div>
                        )}

                        {loadingStudents ? <div style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>Loading…</div>
                            : (
                                <>
                                    <div style={S.tableWrap} className="gf-desktop-table-wrap">
                                        <table style={{ width: '100%', minWidth: '660px', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr>
                                                    <th style={{ ...S.th, width: '40px', textAlign: 'center' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={filteredStudents.length > 0 && selectedUsns.size === filteredStudents.length}
                                                            onChange={() => toggleSelectAll(filteredStudents)}
                                                            style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                                            title="Select All Students"
                                                        />
                                                    </th>
                                                    {['#', 'Name', 'USN', 'Sem', semFilter === 'all' ? 'CGPA' : `SGPA (S${semFilter})`, semFilter === 'all' ? 'Total Backlogs' : `Backlogs (S${semFilter})`, 'Actions'].map(h => <th key={h} style={S.th}>{h}</th>)}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredStudents.map((s, idx) => {
                                                    const semData = semFilter !== 'all' ? s.semester_data?.[semFilter] : null;
                                                    const displayScore = semFilter !== 'all'
                                                        ? (semData?.sgpa != null && semData.sgpa > 0 ? Number(semData.sgpa).toFixed(2) : (semData?.sgpa === 0 ? '0.00' : '—'))
                                                        : (s.has_data && s.cgpa != null ? s.cgpa?.toFixed(2) : '—');

                                                    const displayBacklogs = semFilter !== 'all'
                                                        ? (semData && semData.backlogs != null ? semData.backlogs : null)
                                                        : (s.has_data && s.total_backlogs != null ? s.total_backlogs : null);

                                                    const isSelected = selectedUsns.has(s.usn);

                                                    return (
                                                        <tr key={s.usn} style={{ background: isSelected ? 'var(--surface-low)' : 'transparent' }}>
                                                            <td style={{ ...S.td, textAlign: 'center', width: '40px' }}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isSelected}
                                                                    onChange={() => toggleSelectStudent(s.usn)}
                                                                    style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                                                />
                                                            </td>
                                                            <td style={{ ...S.td, color: 'var(--tx-dim)', fontSize: '11px' }}>{idx + 1}</td>
                                                            <td style={{ ...S.td, fontWeight: 800 }}>{s.name}</td>
                                                            <td style={{ ...S.td, fontFamily: 'monospace', color: 'var(--tx-muted)', fontSize: '11px' }}>{s.usn}</td>
                                                            <td style={{ ...S.td, textAlign: 'center', fontWeight: 800 }}>{semFilter === 'all' ? (s.semester || '—') : semFilter}</td>
                                                            <td style={{ ...S.td, textAlign: 'center', fontWeight: 900, color: displayScore !== '—' ? 'var(--primary)' : 'var(--tx-dim)' }}>
                                                                {displayScore}
                                                            </td>
                                                            <td style={{ ...S.td, textAlign: 'center' }}>
                                                                {displayBacklogs != null ? (
                                                                    <span style={{ fontWeight: 900, color: displayBacklogs > 0 ? 'var(--red)' : 'var(--green)', background: displayBacklogs > 0 ? 'var(--red-bg)' : 'var(--green-bg)', padding: '3px 10px', borderRadius: '6px', fontSize: '11px' }}>
                                                                        {displayBacklogs > 0 ? `${displayBacklogs} Backlog${displayBacklogs > 1 ? 's' : ''}` : 'Clear ✓'}
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ color: 'var(--tx-dim)', fontSize: '11px', fontWeight: 600 }}>—</span>
                                                                )}
                                                            </td>
                                                            <td style={{ ...S.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                    <button
                                                                        title={`Fetch VTU results for ${s.usn}`}
                                                                        onClick={(e) => { e.stopPropagation(); openScrapeModal('custom', new Set([s.usn])); }}
                                                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--green)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', fontSize: '11px', fontWeight: 700, gap: '3px' }}
                                                                    >
                                                                        <span className="material-icons-round" style={{ fontSize: '15px' }}>cloud_download</span> Fetch
                                                                    </button>
                                                                    <button
                                                                        title="Transfer student to another class"
                                                                        onClick={(e) => openSingleStudentTransfer(s, e)}
                                                                        style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', fontSize: '11px', fontWeight: 700, gap: '3px' }}
                                                                    >
                                                                        <span className="material-icons-round" style={{ fontSize: '15px' }}>swap_horiz</span> Transfer
                                                                    </button>
                                                                    <button
                                                                        title={`Remove ${s.name ? `${s.name} ` : ''}(${s.usn}) from this class`}
                                                                        onClick={() => removeStudent(s.usn, s.name)}
                                                                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.12)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.5)'; }}
                                                                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.05)'; e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.25)'; }}
                                                                        style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', cursor: 'pointer', color: 'var(--red, #ef4444)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '4px 8px', fontSize: '11px', fontWeight: 700, gap: '3px', transition: 'all 0.15s ease' }}
                                                                    >
                                                                        <span className="material-icons-round" style={{ fontSize: '15px' }}>person_remove</span> Remove
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="gf-mobile-subject-list" style={{ padding: '12px' }}>
                                            {filteredStudents.map((s, idx) => {
                                                const semData = semFilter !== 'all' ? s.semester_data?.[semFilter] : null;
                                                const displayScore = semFilter !== 'all'
                                                    ? (semData?.sgpa != null && semData.sgpa > 0 ? Number(semData.sgpa).toFixed(2) : (semData?.sgpa === 0 ? '0.00' : '—'))
                                                    : (s.has_data && s.cgpa != null ? s.cgpa?.toFixed(2) : '—');
                                                const displayBacklogs = semFilter !== 'all'
                                                    ? (semData && semData.backlogs != null ? semData.backlogs : null)
                                                    : (s.has_data && s.total_backlogs != null ? s.total_backlogs : null);

                                                return (
                                                    <div key={s.usn} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {idx + 1}. {s.name}
                                                            </div>
                                                            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                                {s.usn} · Sem {semFilter === 'all' ? (s.semester || '—') : semFilter}
                                                            </div>
                                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                                                                <span style={{ fontWeight: 800, fontSize: '11px', color: displayScore !== '—' ? 'var(--primary)' : 'var(--tx-dim)' }}>
                                                                    {semFilter === 'all' ? 'CGPA' : `SGPA (S${semFilter})`}: {displayScore}
                                                                </span>
                                                                {displayBacklogs != null ? (
                                                                    <span style={{ fontWeight: 800, color: displayBacklogs > 0 ? 'var(--red)' : 'var(--green)', background: displayBacklogs > 0 ? 'var(--red-bg)' : 'var(--green-bg)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>
                                                                        {displayBacklogs > 0 ? `${displayBacklogs} Backlog${displayBacklogs > 1 ? 's' : ''}` : 'Clear ✓'}
                                                                    </span>
                                                                ) : (
                                                                    <span style={{ fontSize: '10px', color: 'var(--tx-dim)', fontWeight: 600 }}>No result data</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <button
                                                                title={`Fetch VTU results for ${s.usn}`}
                                                                onClick={(e) => { e.stopPropagation(); openScrapeModal('custom', new Set([s.usn])); }}
                                                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--green)', padding: '6px 8px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>cloud_download</span> Fetch
                                                            </button>
                                                            <button
                                                                title="Transfer student"
                                                                onClick={(e) => openSingleStudentTransfer(s, e)}
                                                                style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '6px', cursor: 'pointer', color: 'var(--primary)', padding: '6px 8px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>swap_horiz</span> Transfer
                                                            </button>
                                                            <button
                                                                title={`Remove ${s.name ? `${s.name} ` : ''}(${s.usn}) from this class`}
                                                                onClick={() => removeStudent(s.usn, s.name)}
                                                                style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '6px', cursor: 'pointer', color: 'var(--red, #ef4444)', padding: '6px 8px', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '3px' }}
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>person_remove</span> Remove
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredStudents.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No students in roster.</div>}
                                    </div>
                                </>
                            )}
                    </div>
                </div>
            ) : (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                        <div>
                            <div style={S.eyebrow}>Academic Management</div>
                            <h1 style={S.title}>Classes & Sections</h1>
                            <p style={S.subtitle}>All college classes, sections, and assigned faculty members. Shared across all faculty.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button
                                style={{ ...btn('secondary'), display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                onClick={() => fetchClasses(true)}
                                disabled={loadingClasses}
                                title="Refresh classes from database"
                            >
                                <span
                                    className="material-icons-round"
                                    style={{
                                        fontSize: '16px',
                                        color: 'var(--primary)',
                                        animation: loadingClasses ? 'spin 1s linear infinite' : 'none'
                                    }}
                                >
                                    refresh
                                </span>
                                {loadingClasses ? 'Refreshing...' : 'Refresh'}
                            </button>
                            <button style={btn('primary')} onClick={openCreateClassModal}>
                                <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>add</span>New Class & Section
                            </button>
                        </div>
                    </div>

                    {/* Filter and Search Bar */}
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
                        <div style={{ flex: '1 1 240px', position: 'relative' }}>
                            <input
                                style={{ ...S.input, paddingLeft: '36px', paddingRight: searchQuery ? '36px' : '14px' }}
                                placeholder="Search classes, sections, batch, or faculty..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                            <span className="material-icons-round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-dim)', fontSize: '18px', pointerEvents: 'none' }}>
                                search
                            </span>
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--tx-dim)', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '4px' }}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                                </button>
                            )}
                        </div>

                        <select style={{ ...S.sel, width: 'auto', minWidth: '175px' }} value={facultyFilter} onChange={e => setFacultyFilter(e.target.value)}>
                            <option value="all">👨‍🏫 All Faculty ({facultyList.length})</option>
                            {facultyList.map(f => (
                                <option key={f.id} value={f.id}>{f.full_name}</option>
                            ))}
                        </select>

                        <select style={{ ...S.sel, width: 'auto', minWidth: '145px' }} value={semesterFilter} onChange={e => setSemesterFilter(e.target.value)}>
                            <option value="all">All Semesters</option>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                <option key={s} value={s}>Semester {s}</option>
                            ))}
                        </select>

                        <select style={{ ...S.sel, width: 'auto', minWidth: '140px' }} value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
                            <option value="all">All Branches</option>
                            {branches.map(b => (
                                <option key={b.code} value={b.code}>{b.code}</option>
                            ))}
                        </select>

                        <select style={{ ...S.sel, width: 'auto', minWidth: '135px' }} value={batchFilter} onChange={e => setBatchFilter(e.target.value)}>
                            <option value="all">All Batches</option>
                            {availableClassBatches.map(b => (
                                <option key={b} value={b}>{b} Batch</option>
                            ))}
                        </select>

                        <select style={{ ...S.sel, width: 'auto', minWidth: '135px' }} value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
                            <option value="all">All Sections</option>
                            {availableClassSections.map(sec => (
                                <option key={sec} value={sec}>Section {sec}</option>
                            ))}
                        </select>
                    </div>

                    {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

                    {classesError ? (
                        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'var(--surface-low)', borderRadius: 'var(--radius-7)', border: '1px solid var(--border)' }}>
                            <span className="material-icons-round" style={{ fontSize: '40px', color: 'var(--red)', marginBottom: '12px', display: 'block' }}>error_outline</span>
                            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx-main)', marginBottom: '8px' }}>{classesError}</div>
                            <button onClick={() => fetchClasses(true)} disabled={loadingClasses} style={{ ...btn('primary'), padding: '8px 24px', display: 'inline-flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', animation: loadingClasses ? 'spin 1s linear infinite' : 'none' }}>refresh</span>
                                {loadingClasses ? 'Retrying...' : 'Retry'}
                            </button>
                        </div>
                    ) : loadingClasses ? (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' }}>
                            {[1, 2, 3, 4, 5, 6].map(i => (
                                <div key={i} style={{ ...S.card, minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', opacity: 0.6, animation: 'gfPulse 1.5s ease-in-out infinite' }}>
                                    <div>
                                        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                                            <div style={{ width: '60px', height: '22px', background: 'var(--surface-low)', borderRadius: '6px' }} />
                                            <div style={{ width: '60px', height: '22px', background: 'var(--surface-low)', borderRadius: '6px' }} />
                                        </div>
                                        <div style={{ width: '70%', height: '24px', background: 'var(--surface-low)', borderRadius: '6px', marginBottom: '10px' }} />
                                        <div style={{ width: '45%', height: '14px', background: 'var(--surface-low)', borderRadius: '4px' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                                        <div style={{ width: '80px', height: '14px', background: 'var(--surface-low)', borderRadius: '4px' }} />
                                        <div style={{ width: '70px', height: '14px', background: 'var(--surface-low)', borderRadius: '4px' }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : displayedClasses.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--tx-dim)' }}>
                            <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '12px', display: 'block', opacity: 0.25 }}>groups</span>
                            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                                {classes.length === 0 ? 'No classes yet' : 'No classes match your filter'}
                            </div>
                            <div style={{ fontSize: '13px' }}>
                                {classes.length === 0 ? 'Create your first class to get started.' : 'Try adjusting your search or faculty filter.'}
                            </div>
                        </div>
                    ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '16px' }}>
                                {displayedClasses.map(cls => (
                                    <div
                                        key={cls.id}
                                        onClick={() => selectClass(cls)}
                                        className="gf-hover-lift"
                                        style={{
                                            ...S.card,
                                            cursor: 'pointer',
                                            transition: 'transform 0.2s, box-shadow 0.2s',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'space-between',
                                            position: 'relative'
                                        }}
                                    >
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', background: 'var(--surface-low)', padding: '3px 9px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                        Sem {cls.semester}
                                                    </span>
                                                    {cls.section && (
                                                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-main)', background: 'var(--surface-low)', padding: '3px 9px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                            Sec {cls.section}
                                                        </span>
                                                    )}
                                                    {cls.batch && (
                                                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#059669', background: 'rgba(16, 185, 129, 0.1)', padding: '3px 9px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                                                            {cls.batch} Batch
                                                        </span>
                                                    )}
                                                </div>
                                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)' }}>
                                                    {cls.scheme} Scheme
                                                </span>
                                            </div>

                                            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.02em', marginBottom: '6px' }}>
                                                {cls.name}
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginBottom: '14px' }}>
                                                {cls.branch} {cls.academic_year ? `· ${cls.academic_year}` : ''}
                                            </div>

                                            <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>person</span>
                                                <div style={{ minWidth: 0, flex: 1 }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Faculty In-Charge</div>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {cls.faculty_name || 'All Faculty (Shared)'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
                                            <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                {cls.student_count ?? 0} <span style={{ fontWeight: 500, color: 'var(--tx-dim)' }}>students</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <button
                                                    type="button"
                                                    onClick={(e) => openEditModal(cls, e)}
                                                    style={{
                                                        background: 'var(--surface-low)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '6px',
                                                        padding: '4px 10px',
                                                        fontSize: '11px',
                                                        fontWeight: 800,
                                                        color: 'var(--tx-muted)',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                    title="Edit Class Details"
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>edit</span> Edit
                                                </button>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', fontSize: '12px', fontWeight: 700, color: 'var(--primary)' }}>
                                                    View <span className="material-icons-round" style={{ fontSize: '15px' }}>arrow_forward</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                </div>
            )}

            {/* Create Class Modal (Portal Rendered) */}
            {mounted && showCreate && createPortal(
                <div style={S.modal} onClick={() => setShowCreate(false)}>
                    <div style={S.mbox()} onClick={e => e.stopPropagation()} className="gf-fade-up">
                        <div>
                            <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Create New Class & Section</h3>
                            <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>Created classes will be accessible by all faculty members in the college.</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                                    <label style={{ ...S.label, marginBottom: 0 }}>Class / Section Name *</label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setNameIsManual(false);
                                            setNewClass(p => ({ ...p, name: suggestClassName(p.branch, p.semester, p.section, p.batch) }));
                                        }}
                                        style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 800, cursor: 'pointer', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>auto_fix_high</span> Suggest Standard Name
                                    </button>
                                </div>
                                <input
                                    style={S.input}
                                    placeholder="e.g. CSE - Sem 5 (Sec A) - 2023 Batch"
                                    value={newClass.name}
                                    onChange={e => {
                                        setNameIsManual(true);
                                        setNewClass(p => ({ ...p, name: e.target.value }));
                                    }}
                                    autoFocus
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={S.label}>Branch</label>
                                    <select style={S.sel} value={newClass.branch} onChange={e => handleNewClassChange({ branch: e.target.value })}>
                                        {branches.map(b => <option key={b.code} value={b.code}>{b.code} — {b.label || b.name || b.code}</option>)}
                                        {branches.length === 0 && <option value="CS">CSE — Computer Science</option>}
                                    </select>
                                </div>
                                <div>
                                    <label style={S.label}>Semester</label>
                                    <select style={S.sel} value={newClass.semester} onChange={e => handleNewClassChange({ semester: parseInt(e.target.value) })}>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={S.label}>Section *</label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <select
                                            style={{ ...S.sel, minWidth: '95px' }}
                                            value={['A', 'B', 'C', 'D', 'E', 'F', 'General'].includes(newClass.section) ? newClass.section : 'custom'}
                                            onChange={e => {
                                                if (e.target.value !== 'custom') {
                                                    handleNewClassChange({ section: e.target.value });
                                                } else {
                                                    handleNewClassChange({ section: '' });
                                                }
                                            }}
                                        >
                                            {['A', 'B', 'C', 'D', 'E', 'F', 'General'].map(sec => (
                                                <option key={sec} value={sec}>Sec {sec}</option>
                                            ))}
                                            <option value="custom">Other…</option>
                                        </select>
                                        {!['A', 'B', 'C', 'D', 'E', 'F', 'General'].includes(newClass.section) && (
                                            <input
                                                style={{ ...S.input, flex: 1 }}
                                                placeholder="Sec"
                                                autoFocus
                                                value={newClass.section}
                                                onChange={e => handleNewClassChange({ section: e.target.value.toUpperCase() })}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label style={S.label}>Scheme</label>
                                    <select style={S.sel} value={newClass.scheme} onChange={e => handleNewClassChange({ scheme: e.target.value })}>
                                        {schemes.map(s => <option key={s} value={s}>{s} Scheme</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={S.label}>Academic Year</label>
                                    <input
                                        style={S.input}
                                        placeholder="e.g. 2024-2025"
                                        value={newClass.academic_year}
                                        onChange={e => setNewClass(p => ({ ...p, academic_year: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label style={S.label}>Batch (Intake Year) *</label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <select
                                            style={{ ...S.sel, minWidth: '100px' }}
                                            value={BATCH_INTAKE_YEARS.includes(newClass.batch) ? newClass.batch : 'custom'}
                                            onChange={e => {
                                                if (e.target.value !== 'custom') {
                                                    handleNewClassChange({ batch: e.target.value });
                                                } else {
                                                    handleNewClassChange({ batch: '' });
                                                }
                                            }}
                                        >
                                            {BATCH_INTAKE_YEARS.map(b => (
                                                <option key={b} value={b}>{b}</option>
                                            ))}
                                            <option value="custom">Other…</option>
                                        </select>
                                        {!BATCH_INTAKE_YEARS.includes(newClass.batch) && (
                                            <input
                                                style={{ ...S.input, flex: 1 }}
                                                placeholder="Batch (e.g. 2036)"
                                                autoFocus
                                                value={newClass.batch}
                                                onChange={e => handleNewClassChange({ batch: e.target.value })}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label style={S.label}>Faculty In-Charge (Assigned Faculty)</label>
                                <select style={S.sel} value={newClass.faculty_id} onChange={e => setNewClass(p => ({ ...p, faculty_id: e.target.value }))}>
                                    <option value="all">🌐 All Faculty (Institutional Shared Class)</option>
                                    {facultyList.map(f => (
                                        <option key={f.id} value={f.id}>
                                            👨‍🏫 {f.full_name} ({f.department || 'Faculty'}{f.email ? ` · ${f.email}` : ''})
                                        </option>
                                    ))}
                                </select>
                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                    Assign a faculty in-charge or share across all faculty members in the department.
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button style={btn('ghost')} onClick={() => setShowCreate(false)}>Cancel</button>
                            <button style={btn('primary')} onClick={createClass}>Create Class</button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Edit Class Modal (Portal Rendered) */}
            {mounted && showEditModal && editingClass && createPortal(
                <div style={S.modal} onClick={() => setShowEditModal(false)}>
                    <div style={S.mbox()} onClick={e => e.stopPropagation()} className="gf-fade-up">
                        <div>
                            <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Edit Class & Section</h3>
                            <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>Update class name, semester, section, branch, scheme, and assigned faculty.</p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                                    <label style={{ ...S.label, marginBottom: 0 }}>Class / Section Name *</label>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditClassForm(p => ({ ...p, name: suggestClassName(p.branch, p.semester, p.section, p.batch) }));
                                        }}
                                        style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 800, cursor: 'pointer', padding: '2px 4px', display: 'inline-flex', alignItems: 'center', gap: '2px' }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>auto_fix_high</span> Suggest Standard Name
                                    </button>
                                </div>
                                <input
                                    style={S.input}
                                    placeholder="e.g. 6th Sem CSE - Section A"
                                    value={editClassForm.name}
                                    onChange={e => setEditClassForm(p => ({ ...p, name: e.target.value }))}
                                    autoFocus
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={S.label}>Branch</label>
                                    <select style={S.sel} value={editClassForm.branch} onChange={e => setEditClassForm(p => ({ ...p, branch: e.target.value }))}>
                                        {branches.map(b => <option key={b.code} value={b.code}>{b.code} — {b.label || b.name || b.code}</option>)}
                                        {branches.length === 0 && <option value="CS">CSE — Computer Science</option>}
                                    </select>
                                </div>
                                <div>
                                    <label style={S.label}>Semester</label>
                                    <select style={S.sel} value={editClassForm.semester} onChange={e => setEditClassForm(p => ({ ...p, semester: parseInt(e.target.value) }))}>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={S.label}>Section *</label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <select
                                            style={{ ...S.sel, minWidth: '95px' }}
                                            value={['A', 'B', 'C', 'D', 'E', 'F', 'General'].includes(editClassForm.section) ? editClassForm.section : 'custom'}
                                            onChange={e => {
                                                if (e.target.value !== 'custom') {
                                                    setEditClassForm(p => ({ ...p, section: e.target.value }));
                                                } else {
                                                    setEditClassForm(p => ({ ...p, section: '' }));
                                                }
                                            }}
                                        >
                                            {['A', 'B', 'C', 'D', 'E', 'F', 'General'].map(sec => (
                                                <option key={sec} value={sec}>Sec {sec}</option>
                                            ))}
                                            <option value="custom">Other…</option>
                                        </select>
                                        {!['A', 'B', 'C', 'D', 'E', 'F', 'General'].includes(editClassForm.section) && (
                                            <input
                                                style={{ ...S.input, flex: 1 }}
                                                placeholder="Sec"
                                                autoFocus
                                                value={editClassForm.section || ''}
                                                onChange={e => setEditClassForm(p => ({ ...p, section: e.target.value.toUpperCase() }))}
                                            />
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label style={S.label}>Scheme</label>
                                    <select style={S.sel} value={editClassForm.scheme} onChange={e => setEditClassForm(p => ({ ...p, scheme: e.target.value }))}>
                                        {schemes.map(s => <option key={s} value={s}>{s} Scheme</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '12px' }}>
                                <div>
                                    <label style={S.label}>Academic Year</label>
                                    <input
                                        style={S.input}
                                        placeholder="e.g. 2024-2025"
                                        value={editClassForm.academic_year || ''}
                                        onChange={e => setEditClassForm(p => ({ ...p, academic_year: e.target.value }))}
                                    />
                                </div>
                                <div>
                                    <label style={S.label}>Batch (Intake Year)</label>
                                    <div style={{ display: 'flex', gap: '6px' }}>
                                        <select
                                            style={{ ...S.sel, minWidth: '100px' }}
                                            value={BATCH_INTAKE_YEARS.includes(editClassForm.batch) ? editClassForm.batch : 'custom'}
                                            onChange={e => {
                                                if (e.target.value !== 'custom') {
                                                    setEditClassForm(p => ({ ...p, batch: e.target.value }));
                                                } else {
                                                    setEditClassForm(p => ({ ...p, batch: '' }));
                                                }
                                            }}
                                        >
                                            {BATCH_INTAKE_YEARS.map(b => (
                                                <option key={b} value={b}>{b}</option>
                                            ))}
                                            <option value="custom">Other…</option>
                                        </select>
                                        {!BATCH_INTAKE_YEARS.includes(editClassForm.batch) && (
                                            <input
                                                style={{ ...S.input, flex: 1 }}
                                                placeholder="Batch (e.g. 2036)"
                                                autoFocus
                                                value={editClassForm.batch || ''}
                                                onChange={e => setEditClassForm(p => ({ ...p, batch: e.target.value }))}
                                            />
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label style={S.label}>Faculty In-Charge (Assigned Faculty)</label>
                                <select style={S.sel} value={editClassForm.faculty_id || 'all'} onChange={e => setEditClassForm(p => ({ ...p, faculty_id: e.target.value }))}>
                                    <option value="all">🌐 All Faculty (Institutional Shared Class)</option>
                                    {facultyList.map(f => (
                                        <option key={f.id} value={f.id}>
                                            👨‍🏫 {f.full_name} ({f.department || 'Faculty'}{f.email ? ` · ${f.email}` : ''})
                                        </option>
                                    ))}
                                </select>
                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                    Assign a faculty in-charge or share across all faculty members in the department.
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '14px' }}>
                            <button style={btn('ghost')} onClick={() => setShowEditModal(false)}>Cancel</button>
                            <button style={btn('primary')} onClick={saveEditClass} disabled={editLoading}>
                                {editLoading ? 'Saving…' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Transfer Students Modal (Portal Rendered) */}
            {mounted && showTransferModal && createPortal(
                <div style={S.modal} onClick={() => setShowTransferModal(false)}>
                    <div style={S.mbox('580px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>
                                    🔀 Transfer Students & Section
                                </h3>
                                <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>
                                    Move or duplicate students between classes and sections in the institution.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowTransferModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', display: 'flex', alignItems: 'center', padding: '4px' }}
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '14px' }}>
                            {/* Source Class Summary Card */}
                            {selectedClass && (
                                <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>From Source Class</div>
                                        <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--tx-main)' }}>{selectedClass.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                            {selectedClass.branch} · Sem {selectedClass.semester} {selectedClass.section ? `· Sec ${selectedClass.section}` : ''}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', background: 'var(--surface)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                            {transferScope === 'single'
                                                ? '1 Student'
                                                : transferScope === 'whole_class'
                                                ? `All ${students.length} Students`
                                                : `${selectedUsns.size || students.length} Student(s)`}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Transfer Scope Selector if not single student */}
                            {transferScope !== 'single' && (
                                <div>
                                    <label style={S.label}>Who would you like to transfer?</label>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                        <div
                                            onClick={() => setTransferScope('selected')}
                                            style={{
                                                border: `1.5px solid ${transferScope === 'selected' ? 'var(--primary)' : 'var(--border)'}`,
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                cursor: 'pointer',
                                                background: transferScope === 'selected' ? 'var(--surface-low)' : 'var(--surface)',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                                Selected Students ({selectedUsns.size})
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                                Transfer currently checked students
                                            </div>
                                        </div>
                                        <div
                                            onClick={() => setTransferScope('whole_class')}
                                            style={{
                                                border: `1.5px solid ${transferScope === 'whole_class' ? 'var(--primary)' : 'var(--border)'}`,
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                cursor: 'pointer',
                                                background: transferScope === 'whole_class' ? 'var(--surface-low)' : 'var(--surface)',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                                Entire Class (All {students.length})
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                                Transfer all students in this class
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Single Student Info if single */}
                            {transferScope === 'single' && transferSingleStudent && (
                                <div>
                                    <label style={S.label}>Student to Transfer</label>
                                    <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{transferSingleStudent.name}</div>
                                        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '12px', color: 'var(--tx-muted)' }}>{transferSingleStudent.usn}</div>
                                    </div>
                                </div>
                            )}

                            {/* Target Class Dropdown */}
                            <div>
                                <label style={S.label}>Destination Target Class / Section *</label>
                                <select
                                    style={S.sel}
                                    value={transferTargetClassId}
                                    onChange={e => setTransferTargetClassId(e.target.value)}
                                >
                                    <option value="">-- Choose Destination Class / Section --</option>
                                    {classes.filter(c => c.id !== selectedClass?.id).map(c => (
                                        <option key={c.id} value={c.id}>
                                            {c.name} ({c.branch} · Sem {c.semester} {c.section ? `· Sec ${c.section}` : ''} {c.batch ? `· ${c.batch} Batch` : ''} · {c.student_count ?? 0} students · 👨‍🏫 {c.faculty_name || 'Shared'})
                                        </option>
                                    ))}
                                </select>
                                {classes.filter(c => c.id !== selectedClass?.id).length === 0 && (
                                    <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '6px', fontWeight: 600 }}>
                                        ⚠️ No other classes found. Please create another class/section first.
                                    </div>
                                )}
                            </div>

                            {/* Transfer Mode */}
                            <div>
                                <label style={S.label}>Transfer Mode</label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div
                                        onClick={() => setTransferMode('move')}
                                        style={{
                                            border: `1.5px solid ${transferMode === 'move' ? 'var(--primary)' : 'var(--border)'}`,
                                            borderRadius: '8px',
                                            padding: '10px 14px',
                                            cursor: 'pointer',
                                            background: transferMode === 'move' ? 'var(--surface-low)' : 'var(--surface)',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>📦 Move (Cut & Paste)</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                            Remove from current class & add to destination
                                        </div>
                                    </div>
                                    <div
                                        onClick={() => setTransferMode('copy')}
                                        style={{
                                            border: `1.5px solid ${transferMode === 'copy' ? 'var(--primary)' : 'var(--border)'}`,
                                            borderRadius: '8px',
                                            padding: '10px 14px',
                                            cursor: 'pointer',
                                            background: transferMode === 'copy' ? 'var(--surface-low)' : 'var(--surface)',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>📋 Copy (Duplicate)</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                            Keep in current class & also enroll in destination
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button style={btn('ghost')} onClick={() => setShowTransferModal(false)}>Cancel</button>
                            <button
                                style={btn('primary')}
                                onClick={executeTransfer}
                                disabled={transferLoading || !transferTargetClassId}
                            >
                                {transferLoading ? 'Transferring…' : 'Confirm & Transfer'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* Add Students Modal (Portal Rendered) */}
            {mounted && showAddModal && selectedClass && createPortal(
                <div style={S.modal} onClick={() => setShowAddModal(false)}>
                    <div style={S.mbox('620px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Add Students to {selectedClass.name}</h3>
                                <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>Import students manually or bulk upload via CSV file. All faculty can view enrolled students.</p>
                            </div>
                            <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={downloadCsvTemplate}>
                                <span className="material-icons-round" style={{ fontSize: '15px' }}>download</span>CSV Template
                            </button>
                        </div>

                        {/* Modal Tab Bar */}
                        <div style={{ display: 'flex', gap: '8px', background: 'var(--surface-low)', padding: '4px', borderRadius: '8px', marginBottom: '16px' }}>
                            <button
                                style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: addTab === 'manual' ? 'var(--surface)' : 'transparent', color: addTab === 'manual' ? 'var(--primary)' : 'var(--tx-muted)', boxShadow: addTab === 'manual' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                                onClick={() => { setAddTab('manual'); setMsg(''); }}
                            >
                                ✏️ Manual Entry
                            </button>
                            <button
                                style={{ flex: 1, padding: '8px 12px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: addTab === 'csv' ? 'var(--surface)' : 'transparent', color: addTab === 'csv' ? 'var(--primary)' : 'var(--tx-muted)', boxShadow: addTab === 'csv' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                                onClick={() => { setAddTab('csv'); setMsg(''); }}
                            >
                                📄 CSV Upload
                            </button>
                        </div>

                        {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

                        {addTab === 'manual' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div>
                                    <label style={S.label}>Student USN & Name List</label>
                                    <textarea
                                        style={{ ...S.input, minHeight: '130px', resize: 'vertical', fontFamily: 'monospace' }}
                                        placeholder={"Enter USN or line-by-line format:\n2AB23CS063, Rawahah\n2AB23CS043, Mohammed Ainan\n2AB23CS001, Student Name"}
                                        value={addUsn}
                                        onChange={e => setAddUsn(e.target.value)}
                                        autoFocus
                                    />
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '6px' }}>
                                        Format: <code style={{ background: 'var(--surface-low)', padding: '2px 4px', borderRadius: '4px' }}>USN, Name</code> (or just USNs separated by commas/newlines).
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                <div
                                    onClick={() => fileRef.current?.click()}
                                    style={{ border: '2px dashed var(--border)', borderRadius: '12px', padding: '24px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-low)', transition: 'background 0.2s' }}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '36px', color: 'var(--primary)', marginBottom: '8px' }}>upload_file</span>
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '4px' }}>
                                        {fileLoading ? 'Reading CSV...' : 'Click or Drag CSV File Here'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>
                                        Supports CSV files with columns: <strong>USN, Name, Semester, Branch</strong>
                                    </div>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept=".csv,text/csv"
                                        onChange={handleCsvFile}
                                        style={{ display: 'none' }}
                                    />
                                </div>

                                {csvPreview.length > 0 && (
                                    <div>
                                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Parsed Preview ({csvPreview.length} Students)</span>
                                            <span style={{ color: 'var(--primary)', fontWeight: 900 }}>Ready to Import</span>
                                        </div>
                                        <div style={{ maxHeight: '160px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                                <thead>
                                                    <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>USN</th>
                                                        <th style={{ padding: '6px 10px', textAlign: 'left' }}>Name</th>
                                                        <th style={{ padding: '6px 10px', textAlign: 'center' }}>Sem</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {csvPreview.slice(0, 10).map((st, i) => (
                                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', fontWeight: 700 }}>{st.usn}</td>
                                                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{st.name}</td>
                                                            <td style={{ padding: '6px 10px', textAlign: 'center' }}>{st.semester || selectedClass.semester}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            {csvPreview.length > 10 && (
                                                <div style={{ padding: '6px', textAlign: 'center', fontSize: '10px', color: 'var(--tx-dim)', background: 'var(--surface-low)' }}>
                                                    + {csvPreview.length - 10} more students
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '20px' }}>
                            <button style={btn('ghost')} onClick={() => { setShowAddModal(false); setCsvPreview([]); }}>Cancel</button>
                            <button style={btn('primary')} onClick={addStudent}>
                                {addTab === 'csv' ? `Import ${csvPreview.length} Students` : 'Add Students'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* PDF Export Modal (Portal Rendered) */}
            {mounted && showExportModal && selectedClass && createPortal(
                <div style={S.modal} onClick={() => setShowExportModal(false)}>
                    <div style={S.mbox('680px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Export PDF Report — {selectedClass.name}</h3>
                                <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>Configure report options and assign faculty names for subjects before downloading.</p>
                            </div>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }} onClick={() => setShowExportModal(false)}>
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        {/* Format Selection Tab */}
                        <div style={{ display: 'flex', gap: '8px', background: 'var(--surface-low)', padding: '4px', borderRadius: '8px', marginBottom: '16px' }}>
                            <button
                                style={{ flex: 1, padding: '10px 14px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: exportType === 'consolidated' ? 'var(--surface)' : 'transparent', color: exportType === 'consolidated' ? 'var(--primary)' : 'var(--tx-muted)', boxShadow: exportType === 'consolidated' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                                onClick={() => setExportType('consolidated')}
                            >
                                📄 Institutional Consolidated Report (5-Page PDF)
                            </button>
                            <button
                                style={{ flex: 1, padding: '10px 14px', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 800, cursor: 'pointer', background: exportType === 'roster' ? 'var(--surface)' : 'transparent', color: exportType === 'roster' ? 'var(--primary)' : 'var(--tx-muted)', boxShadow: exportType === 'roster' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}
                                onClick={() => setExportType('roster')}
                            >
                                📋 Standard Student Roster PDF
                            </button>
                        </div>

                        {/* Semester Selector Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', background: 'var(--surface-low)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', whiteSpace: 'nowrap' }}>Select Semester for Export:</label>
                            <select
                                value={exportSemester}
                                onChange={(e) => handleSemesterChange(e.target.value)}
                                style={{ ...S.sel, width: 'auto', flex: 1, padding: '6px 12px', fontSize: '13px', fontWeight: 700 }}
                            >
                                {(availableSems.length > 0 ? availableSems : Array.from({ length: Number(selectedClass?.semester) || 8 }, (_, i) => i + 1)).map(s => (
                                    <option key={s} value={s}>
                                        Semester {s} {s === Number(selectedClass?.semester) ? '(Current Semester)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {exportType === 'consolidated' && (
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Faculty for Subjects (Sem {exportSemester})
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginBottom: '8px' }}>
                                    Auto-filled from real assignments (Admin &rarr; Faculty Assignments). A blank field means no faculty is assigned to that subject yet — type a name only to override for this export.
                                </div>
                                <div style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px' }}>
                                    {classSubjects.length > 0 ? (
                                        classSubjects.map((sub) => (
                                            <div key={sub.code} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 4px', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ width: '100px', fontWeight: 800, fontSize: '12px', fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                    {sub.code}
                                                </div>
                                                <div style={{ flex: 1, fontSize: '12px', color: 'var(--tx-main)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {sub.name}
                                                </div>
                                                <input
                                                    type="text"
                                                    placeholder="Unassigned"
                                                    value={facultyMap[sub.code] || ''}
                                                    onChange={(e) => setFacultyMap({ ...facultyMap, [sub.code]: e.target.value })}
                                                    style={{ ...S.input, width: '220px', padding: '6px 10px', fontSize: '12px' }}
                                                />
                                            </div>
                                        ))
                                    ) : (
                                        <div style={{ padding: '16px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '12px' }}>
                                            Loading class subjects...
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button style={btn('ghost')} onClick={() => setShowExportModal(false)}>Cancel</button>
                            <button
                                style={{ ...btn('ghost'), border: '1px solid var(--border)', background: 'var(--surface-low)', color: 'var(--tx-main)' }}
                                onClick={handleGenerateExcel}
                                disabled={excelBusy}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>grid_on</span>
                                {excelBusy ? 'Building…' : 'Download Excel'}
                            </button>
                            <button
                                style={{ ...btn('ghost'), border: '1px solid var(--border)', background: 'var(--surface-low)', color: 'var(--tx-main)' }}
                                onClick={handleGenerateCsv}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>table_view</span>Download CSV
                            </button>
                            <button style={btn('primary')} onClick={handleGeneratePdf}>
                                <span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>picture_as_pdf</span>Generate & Download PDF
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {/* ── Fetch VTU Results (Portal Rendered) ── */}
            {mounted && showScrapeModal && selectedClass && createPortal(
                <div style={S.modal} onClick={() => { if (!scrapeQueueing) setShowScrapeModal(false); }}>
                    <div style={S.mbox('760px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>
                                    ☁️ Fetch VTU Results
                                </h3>
                                <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>
                                    Queue the official VTU scraper for <strong>{selectedClass.name}</strong>. Choose who to fetch, and which exam portals to scan.
                                </p>
                            </div>
                            <button
                                onClick={() => { if (!scrapeQueueing) setShowScrapeModal(false); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', display: 'flex', alignItems: 'center', padding: '4px' }}
                                aria-label="Close"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        {/* ── 1. Students ── */}
                        <div>
                            <label style={S.label}>1 · Which students</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '8px' }}>
                                {[
                                    { key: 'all', label: 'Whole class', icon: 'groups' },
                                    { key: 'selected', label: 'Ticked in roster', icon: 'check_box' },
                                    { key: 'backlogs', label: 'With backlogs', icon: 'report_problem' },
                                    { key: 'missing', label: 'No results yet', icon: 'help_outline' },
                                    { key: 'custom', label: 'Pick students', icon: 'person_search' },
                                ].map(opt => {
                                    const count = (scrapeScopeGroups[opt.key] || []).length;
                                    // 'custom' stays clickable at zero — that is the
                                    // state you are in right before you pick someone.
                                    const disabled = count === 0 && opt.key !== 'custom';
                                    const active = scrapeScope === opt.key;
                                    return (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            disabled={disabled}
                                            onClick={() => setScrapeScope(opt.key)}
                                            style={{
                                                textAlign: 'left',
                                                border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                                                background: active ? 'var(--surface-low)' : 'var(--surface)',
                                                borderRadius: 'var(--radius-4)',
                                                padding: '10px 12px',
                                                cursor: disabled ? 'not-allowed' : 'pointer',
                                                opacity: disabled ? 0.45 : 1,
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 800, color: active ? 'var(--primary)' : 'var(--tx-main)' }}>
                                                <span className="material-icons-round" style={{ fontSize: '16px' }}>{opt.icon}</span>
                                                {opt.label}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '3px', fontWeight: 700 }}>
                                                {count} student{count === 1 ? '' : 's'}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {scrapeScope === 'custom' && (
                                <div style={{ marginTop: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-low)', flexWrap: 'wrap' }}>
                                        <input
                                            style={{ ...S.input, flex: '1 1 160px', padding: '6px 10px', fontSize: '12px', height: '30px' }}
                                            placeholder="Search USN or name…"
                                            value={scrapeStudentSearch}
                                            onChange={e => setScrapeStudentSearch(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            style={{ ...btn('ghost'), padding: '5px 10px', fontSize: '11px' }}
                                            onClick={() => setScrapePickedUsns(new Set(visibleScrapeStudents.map(st => st.usn)))}
                                        >
                                            Select {scrapeStudentSearch.trim() ? 'matches' : 'all'}
                                        </button>
                                        <button
                                            type="button"
                                            style={{ ...btn('ghost'), padding: '5px 10px', fontSize: '11px' }}
                                            onClick={() => setScrapePickedUsns(new Set(scrapeScopeGroups.backlogs.map(st => st.usn)))}
                                        >
                                            Only backlogs
                                        </button>
                                        <button
                                            type="button"
                                            style={{ ...btn('ghost'), padding: '5px 10px', fontSize: '11px' }}
                                            onClick={() => setScrapePickedUsns(new Set())}
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div style={{ maxHeight: '190px', overflowY: 'auto' }}>
                                        {visibleScrapeStudents.length === 0 && (
                                            <div style={{ padding: '18px', textAlign: 'center', fontSize: '12px', color: 'var(--tx-dim)' }}>No students match.</div>
                                        )}
                                        {visibleScrapeStudents.map(st => (
                                            <label
                                                key={st.usn}
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px' }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={scrapePickedUsns.has(st.usn)}
                                                    onChange={() => toggleScrapePickedUsn(st.usn)}
                                                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                                                />
                                                <span style={{ fontWeight: 800, color: 'var(--tx-main)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{st.name}</span>
                                                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--tx-muted)' }}>{st.usn}</span>
                                                {(st.total_backlogs || 0) > 0 && (
                                                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--red)', background: 'var(--red-bg)', padding: '2px 6px', borderRadius: '4px' }}>
                                                        {st.total_backlogs}
                                                    </span>
                                                )}
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── 2. Portals ── */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <label style={{ ...S.label, marginBottom: 0 }}>2 · Which VTU portals</label>
                                <select
                                    style={{ ...S.sel, width: 'auto', padding: '5px 30px 5px 10px', fontSize: '11px', height: '30px' }}
                                    value={scrapeScheme}
                                    onChange={e => { setScrapeScheme(e.target.value); setScrapePickedUrls(new Set()); }}
                                    aria-label="Portal scheme"
                                >
                                    <option value="2022">2022 Scheme</option>
                                    <option value="2025">2025 Scheme</option>
                                    <option value="mba">MBA</option>
                                    <option value="mca">MCA</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                {[
                                    { key: 'all', label: `All active portals (${scrapePortals.length})`, hint: 'Deep scan — slowest, most complete' },
                                    { key: 'pick', label: 'Choose portals', hint: 'Fast — only what you tick' },
                                    { key: 'custom', label: 'Paste a URL', hint: 'A portal not in the list yet' },
                                ].map(opt => {
                                    const active = scrapePortalMode === opt.key;
                                    return (
                                        <button
                                            key={opt.key}
                                            type="button"
                                            onClick={() => setScrapePortalMode(opt.key)}
                                            title={opt.hint}
                                            style={{
                                                flex: '1 1 150px',
                                                textAlign: 'left',
                                                border: `1.5px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                                                background: active ? 'var(--surface-low)' : 'var(--surface)',
                                                borderRadius: 'var(--radius-4)',
                                                padding: '9px 12px',
                                                cursor: 'pointer',
                                                fontFamily: 'inherit',
                                            }}
                                        >
                                            <div style={{ fontSize: '12px', fontWeight: 800, color: active ? 'var(--primary)' : 'var(--tx-main)' }}>{opt.label}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '2px', fontWeight: 700 }}>{opt.hint}</div>
                                        </button>
                                    );
                                })}
                            </div>

                            {scrapePortalsLoading && (
                                <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '8px' }}>Loading portals…</div>
                            )}
                            {scrapePortalsError && (
                                <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '8px', fontWeight: 700 }}>{scrapePortalsError}</div>
                            )}

                            {scrapePortalMode === 'pick' && !scrapePortalsLoading && (
                                <div style={{ marginTop: '10px', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', overflow: 'hidden' }}>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-low)', flexWrap: 'wrap' }}>
                                        <input
                                            style={{ ...S.input, flex: '1 1 160px', padding: '6px 10px', fontSize: '12px', height: '30px' }}
                                            placeholder="Search exam session…"
                                            value={scrapePortalSearch}
                                            onChange={e => setScrapePortalSearch(e.target.value)}
                                        />
                                        <button
                                            type="button"
                                            style={{ ...btn('ghost'), padding: '5px 10px', fontSize: '11px' }}
                                            onClick={() => setScrapePickedUrls(new Set(visibleScrapePortals.map(x => x.url)))}
                                        >
                                            Select {scrapePortalSearch.trim() ? 'matches' : 'all'}
                                        </button>
                                        <button
                                            type="button"
                                            style={{ ...btn('ghost'), padding: '5px 10px', fontSize: '11px' }}
                                            onClick={() => setScrapePickedUrls(new Set())}
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div style={{ maxHeight: '190px', overflowY: 'auto' }}>
                                        {visibleScrapePortals.length === 0 && (
                                            <div style={{ padding: '18px', textAlign: 'center', fontSize: '12px', color: 'var(--tx-dim)' }}>
                                                No active portals for this scheme. Add or re-enable them under VTU Portals.
                                            </div>
                                        )}
                                        {visibleScrapePortals.map(portal => (
                                            <label
                                                key={portal.id || portal.url}
                                                style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px' }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={scrapePickedUrls.has(portal.url)}
                                                    onChange={() => toggleScrapePickedUrl(portal.url)}
                                                    style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                                                />
                                                <span style={{ minWidth: 0, flex: 1 }}>
                                                    <span style={{ display: 'block', fontWeight: 800, color: 'var(--tx-main)' }}>{portal.exam_name || 'Unnamed portal'}</span>
                                                    <span style={{ display: 'block', fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{portal.url}</span>
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {scrapePortalMode === 'custom' && (
                                <div style={{ marginTop: '10px' }}>
                                    <textarea
                                        style={{ ...S.input, minHeight: '68px', fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                                        placeholder="https://results.vtu.ac.in/D25J26Ecbcs/index.php&#10;One URL per line — several can be scanned in the same job."
                                        value={scrapeCustomUrl}
                                        onChange={e => setScrapeCustomUrl(e.target.value)}
                                    />
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                        Must be results.vtu.ac.in addresses. Paste one per line, or separate with commas.
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── 3. Options ── */}
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', padding: '10px 12px' }}>
                            <input
                                type="checkbox"
                                checked={scrapeForce}
                                onChange={e => setScrapeForce(e.target.checked)}
                                style={{ width: '15px', height: '15px', cursor: 'pointer', marginTop: '2px' }}
                            />
                            <span>
                                <span style={{ display: 'block', fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                    Re-fetch even if results already exist
                                </span>
                                <span style={{ display: 'block', fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                    Leave this on after a revaluation or a new announcement. Turn it off to fill in only the students who have nothing stored yet.
                                </span>
                            </span>
                        </label>

                        {scrapeError && (
                            <div style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', color: 'var(--red)', borderRadius: 'var(--radius-4)', padding: '10px 12px', fontSize: '12px', fontWeight: 700 }}>
                                {scrapeError}
                            </div>
                        )}

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '14px' }}>
                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                <span style={{ color: 'var(--primary)', fontWeight: 900 }}>{scrapeTargets.length}</span> student{scrapeTargets.length === 1 ? '' : 's'} → {scrapePortalLabel}
                            </div>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button style={btn('ghost')} onClick={() => setShowScrapeModal(false)} disabled={scrapeQueueing}>Cancel</button>
                                <button style={btn('primary')} onClick={startClassScrape} disabled={scrapeQueueing || scrapeTargets.length === 0}>
                                    {scrapeQueueing ? 'Queueing…' : `Start Fetch (${scrapeTargets.length})`}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            <ConfirmDialog
                open={confirmingBulkRemove}
                title="Remove selected students?"
                description={`This removes ${selectedUsns.size} selected student(s) from ${selectedClass?.name || 'this class'}.`}
                busy={bulkRemoving}
                onCancel={() => setConfirmingBulkRemove(false)}
                onConfirm={removeSelectedStudents}
            />
            <ConfirmDialog
                open={confirmingDeleteClass}
                title="Delete this class?"
                description={`This permanently deletes ${selectedClass?.name || 'this class'} and its student roster. This cannot be undone.`}
                busy={deletingClass}
                onCancel={() => setConfirmingDeleteClass(false)}
                onConfirm={() => selectedClass && deleteClass(selectedClass.id)}
            />
        </div>
    );
}
