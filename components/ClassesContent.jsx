'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { apiRequest } from '../lib/api/client';
import { useRouter } from 'next/navigation';
import { parseClassUsns } from '../lib/class-usn-import';
import { recordFacultyAction } from '../lib/api/faculty-action';
import { createClient } from '@supabase/supabase-js';
import { exportClassReportPDF, exportClassReportCSV, exportConsolidatedReportPDF } from '../lib/export-utils';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const MEDALS = ['🥇', '🥈', '🥉'];
const USN_RE = /^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/;

// ── Activity Logger ─────────────────────────────────────────
async function logActivity(faculty, action_type, target = null) {
    await recordFacultyAction(faculty, action_type, target);
}

// ── Shared Styles ───────────────────────────────────────────
const S = {
    page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
    eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-2)' },
    title: { fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: 'var(--space-2)' },
    subtitle: { fontSize: '13px', color: 'var(--tx-muted)', marginBottom: 'var(--space-6)' },
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-7)', padding: 'var(--space-6)' },
    input: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', padding: '10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
    sel: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', padding: '10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%' },
    label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.06em' },
    th: { padding: '10px var(--space-4)', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left' },
    td: { padding: '13px var(--space-4)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--tx-main)' },
    modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', background: 'rgba(15, 23, 42, 0.45)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box' },
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
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        setMounted(true);
        if (typeof window === 'undefined') return;
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
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
    const [showAddModal, setShowAddModal] = useState(false);
    const [addTab, setAddTab] = useState('single');
    const [importResult, setImportResult] = useState(null);
    const [showImportResult, setShowImportResult] = useState(false);
    const [showUrlModal, setShowUrlModal] = useState(false);
    const [vtuUrls, setVtuUrls] = useState([]);
    const [loadingUrls, setLoadingUrls] = useState(false);
    const [newUrlInput, setNewUrlInput] = useState({ url: '', exam_name: '' });
    const [facultyList, setFacultyList] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [facultyFilter, setFacultyFilter] = useState('all');
    const [branchFilter, setBranchFilter] = useState('all');
    const [sectionFilter, setSectionFilter] = useState('all');
    const [semesterFilter, setSemesterFilter] = useState('all');

    const [newClass, setNewClass] = useState({
        name: '',
        branch: 'CS',
        semester: 3,
        scheme: '2022',
        section: 'A',
        faculty_id: 'all',
        academic_year: '2024-2025'
    });
    const [addUsn, setAddUsn] = useState('');
    const [bulkUsns, setBulkUsns] = useState('');
    const [fileLoading, setFileLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [scrapeStatus, setScrapeStatus] = useState({});
    const [drawerScrapeStatus, setDrawerScrapeStatus] = useState('');
    const [showTransfer, setShowTransfer] = useState(false);
    const [transferStudent, setTransferStudent] = useState(null);
    const [transferMode, setTransferMode] = useState('move');
    const [transferTarget, setTransferTarget] = useState('');
    const [transferLoading, setTransferLoading] = useState(false);
    const [drawerTab, setDrawerTab] = useState('marks');
    const [branches, setBranches] = useState([]);
    const [schemes] = useState(['2022', '2025']);
    const [exportSemester, setExportSemester] = useState(4);
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportType, setExportType] = useState('consolidated');
    const [facultyMap, setFacultyMap] = useState({});
    const [classSubjects, setClassSubjects] = useState([]);
    const fileRef = useRef(null);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        const data = await apiRequest('/api/system/meta').catch(() => null);
        if (data?.branches) setBranches(data.branches);
        if (data?.faculty) setFacultyList(data.faculty);
    };

    const loadSemesterExportData = async (targetSem) => {
        if (!selectedClass) return;
        const usnList = students.map(s => s.usn);

        try {
            const saved = localStorage.getItem(`gf_faculty_map_${selectedClass.id}_sem_${targetSem}`);
            if (saved) setFacultyMap(JSON.parse(saved));
            else setFacultyMap({});
        } catch (e) {}

        if (usnList.length > 0) {
            try {
                const { data: marksData } = await supabase
                    .from('subject_marks')
                    .select('*')
                    .in('usn', usnList)
                    .eq('semester', Number(targetSem));
                if (marksData) setAllMarks(marksData);

                const { data: catData } = await supabase
                    .from('subject_catalog')
                    .select('id, subject_code, subject_name, credits')
                    .eq('scheme', selectedClass.scheme || '2022')
                    .eq('branch', selectedClass.branch || 'CS')
                    .eq('semester', Number(targetSem));

                if (catData && catData.length > 0) {
                    const formatted = catData.map(c => ({ id: c.id, code: c.subject_code, name: c.subject_name, credits: c.credits }));
                    setClassSubjects(formatted);
                } else if (marksData && marksData.length > 0) {
                    const codes = Array.from(new Set(marksData.map(m => m.subject_code)));
                    setClassSubjects(codes.map(c => ({ code: c, name: c })));
                } else {
                    setClassSubjects([]);
                }
            } catch (e) {
                console.error('Failed to load export data:', e);
            }
        }
    };

    const openPdfExportModal = async () => {
        if (!selectedClass) return;
        setMsg('');
        const initialSem = Number(selectedClass.semester) || 4;
        setExportSemester(initialSem);
        setShowExportModal(true);
        await loadSemesterExportData(initialSem);
    };

    const handleSemesterChange = async (newSem) => {
        const parsed = Number(newSem);
        setExportSemester(parsed);
        await loadSemesterExportData(parsed);
    };

    const handleGeneratePdf = () => {
        try {
            localStorage.setItem(`gf_faculty_map_${selectedClass.id}_sem_${exportSemester}`, JSON.stringify(facultyMap));
        } catch (e) {}

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
                    department: `Department of ${selectedClass.branch || 'CSE'}`,
                    batch: `Sem ${exportSemester} - ${selectedClass.name}`,
                    ay: 'AY -2025-26 (EVEN Semester)'
                },
                fileName: `${(selectedClass.name || 'Class').replace(/\s+/g, '_')}_Sem${exportSemester}_Consolidated_Report.pdf`
            });
        } else {
            exportClassReportPDF({ selectedClass, students, subjectToppers });
        }
        setShowExportModal(false);
    };

    useEffect(() => {
        const s = localStorage.getItem('faculty_session') || localStorage.getItem('admin_session');
        if (s) {
            try { setFaculty(JSON.parse(s)); } catch (e) {}
        }
        fetchClasses();
    }, []);

    const fetchClasses = async () => {
        setLoadingClasses(true);
        try {
            const r = await fetch('/api/classes', { credentials: 'include' });
            const j = await r.json();
            if (j.success) {
                setClasses(j.classes || []);
                if (j.faculty) setFacultyList(j.faculty);
            }
        } finally {
            setLoadingClasses(false);
        }
    };

    const fetchClassStudents = useCallback(async (cls) => {
        setLoadingStudents(true); setStudents([]); setAllMarks([]); setSubjectToppers([]); setAvailableSems([]); setSemFilter('all');
        try {
            const r = await fetch(`/api/class-students?class_id=${cls.id}`);
            const j = await r.json();
            if (!j.success) return;
            const studs = j.students || [];
            setStudents(studs);
            if (studs.length > 0) {
                const parsedSem = Number(cls.semester) || 1;
                const sems = Array.from({ length: parsedSem }, (_, i) => i + 1);
                setAvailableSems(sems);
                setSelectedSem(sems[sems.length - 1]);
            }
        } finally { setLoadingStudents(false); }
    }, []);

    const computeToppers = (marks, studs, sem, remarks = null) => {
        const filtered = marks.filter(m => m.semester === sem);
        const bySubj = {};
        const byStudent = {};
        filtered.forEach(m => {
            if (!bySubj[m.subject_code]) bySubj[m.subject_code] = [];
            bySubj[m.subject_code].push(m);
            if (!byStudent[m.usn]) byStudent[m.usn] = 0;
            byStudent[m.usn] += m.total || 0;
        });
        const nameMap = Object.fromEntries(studs.map(s => [s.usn, s.name]));
        const result = Object.entries(bySubj).map(([code, rows]) => ({
            code,
            name: rows[0].subject_name || code,
            allScores: rows.sort((a, b) => b.total - a.total).map(r => ({ usn: r.usn, name: nameMap[r.usn] || r.usn, total: r.total }))
        })).sort((a, b) => a.code.localeCompare(b.code));
        setSubjectToppers(result);

        let fullSem = [];
        if (remarks && remarks.some(r => r.semester === sem && r.sgpa !== null)) {
            fullSem = remarks.filter(r => r.semester === sem && r.sgpa !== null).map(r => ({ usn: r.student_usn, name: nameMap[r.student_usn] || r.student_usn, score: r.sgpa, type: 'SGPA' })).sort((a, b) => b.score - a.score);
        } else {
            fullSem = Object.entries(byStudent).map(([usn, total]) => ({ usn, name: nameMap[usn] || usn, score: total, type: 'Marks' })).sort((a, b) => b.score - a.score);
        }
        setSemToppers(fullSem);
    };

    const selectClass = cls => { setSelectedClass(cls); setMsg(''); setEditingName(false); fetchClassStudents(cls); };

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
            setNewClass({
                name: '',
                branch: 'CS',
                semester: 3,
                scheme: '2022',
                section: 'A',
                faculty_id: 'all',
                academic_year: '2024-2025'
            });
            setMsg('✓ Class created successfully. Visible to all faculty & administrators.');
            await logActivity(faculty, 'CLASS_CREATE', newClass.name);
            fetchClasses();
        } else {
            setMsg(j.error || 'Failed to create class.');
        }
    };

    const renameClass = async () => {
        if (!editName.trim()) return;
        const r = await fetch('/api/classes', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedClass.id, name: editName }) });
        const j = await r.json();
        if (j.success) { setSelectedClass(p => ({ ...p, name: editName })); setClasses(prev => prev.map(c => c.id === selectedClass.id ? { ...c, name: editName } : c)); setEditingName(false); }
    };

    const deleteClass = async id => {
        if (!confirm('Delete this class?')) return;
        await logActivity(faculty, 'CLASS_DELETE', selectedClass?.name);
        await fetch('/api/classes', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        setSelectedClass(null); fetchClasses();
    };

    const [csvPreview, setCsvPreview] = useState([]);

    const downloadCsvTemplate = () => {
        const csvContent = "USN,Name,Semester,Branch\n2AB23CS001,Mohammed Ainan Armar,3,CS\n2AB23CS002,Sample Student 2,3,CS";
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'sample_class_roster.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
            await logActivity(faculty, 'CLASS_ADD_STUDENT', selectedClass.name);
            fetchClassStudents(selectedClass);
            fetchClasses();
        } else {
            setMsg(j.error || 'Failed to add student. Please check USNs and try again.');
        }
    };

    const removeStudent = async usn => {
        if (!confirm(`Remove ${usn} from this class?`)) return;
        await fetch('/api/class-students', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn }) });
        await logActivity(faculty, 'CLASS_REMOVE_STUDENT', usn);
        setStudents(p => p.filter(s => s.usn !== usn)); fetchClasses();
    };

    const filteredStudents = students;
    const top10 = [...students].filter(s => s.cgpa !== null).sort((a, b) => b.cgpa - a.cgpa).slice(0, 10);
    const totalBacklogs = students.reduce((s, st) => s + (st.total_backlogs || 0), 0);
    const withCgpa = students.filter(s => s.cgpa !== null);
    const avgCgpa = withCgpa.length ? (withCgpa.reduce((s, st) => s + (st.cgpa || 0), 0) / withCgpa.length).toFixed(2) : '—';
    const classTopper = top10[0] || null;

    if (selectedClass) return (
        <div style={S.page} className="gf-fade-up">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <button onClick={() => setSelectedClass(null)} style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>Classes
                </button>
                <span style={{ color: 'var(--tx-dim)' }}>›</span>
                <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>{selectedClass.name}</span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}>
                <div>
                    <h1 style={S.title}>{selectedClass.name}</h1>
                    <p style={S.subtitle}>
                        {selectedClass.branch} · Sem {selectedClass.semester} {selectedClass.section ? `· Sec ${selectedClass.section} ` : ''}· {selectedClass.scheme} Scheme · 👨‍🏫 {selectedClass.faculty_name || 'All Faculty (Shared)'} · {students.length} students
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button style={btn('primary')} onClick={() => { setShowAddModal(true); setAddTab('manual'); setMsg(''); }}>
                        <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>person_add</span>Add Students
                    </button>
                    <button style={btn('ghost')} onClick={() => { setShowAddModal(true); setAddTab('csv'); setMsg(''); setTimeout(() => fileRef.current?.click(), 100); }}>
                        <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>upload_file</span>Import CSV
                    </button>
                    <button style={btn('danger')} onClick={() => deleteClass(selectedClass.id)}>Delete Class</button>
                </div>
            </div>

            {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>Student Roster</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
                        <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => exportClassReportCSV({ selectedClass, students, subjectToppers })}>
                            <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--green)' }}>table_view</span>Export CSV
                        </button>
                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginLeft: '4px' }}>{filteredStudents.length} students</div>
                    </div>
                </div>
                {loadingStudents ? <div style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>Loading…</div>
                    : (
                        <div style={S.tableWrap}>
                            {!isMobile ? (
                                <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>{['#', 'Name', 'USN', 'Sem', semFilter === 'all' ? 'CGPA' : `SGPA (S${semFilter})`, semFilter === 'all' ? 'Total Backlogs' : `Backlogs (S${semFilter})`, ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map((s, idx) => {
                                            const semData = semFilter !== 'all' ? s.semester_data?.[semFilter] : null;
                                            const displayScore = semFilter !== 'all'
                                                ? (semData?.sgpa != null ? Number(semData.sgpa).toFixed(2) : '—')
                                                : (s.has_data && s.cgpa != null ? s.cgpa?.toFixed(2) : '—');

                                            const displayBacklogs = semFilter !== 'all'
                                                ? (semData ? semData.backlogs : null)
                                                : (s.has_data ? s.total_backlogs : null);

                                            return (
                                                <tr key={s.usn}>
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
                                                                {displayBacklogs > 0 ? displayBacklogs : 'Clear ✓'}
                                                            </span>
                                                        ) : (
                                                            <span style={{ color: 'var(--tx-dim)', fontSize: '11px', fontWeight: 600 }}>—</span>
                                                        )}
                                                    </td>
                                                    <td style={{ ...S.td, textAlign: 'center' }}>
                                                        <button title="Remove" onClick={() => removeStudent(s.usn)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>remove_circle_outline</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                                    {filteredStudents.map((s, idx) => {
                                        const semData = semFilter !== 'all' ? s.semester_data?.[semFilter] : null;
                                        const displayScore = semFilter !== 'all'
                                            ? (semData?.sgpa != null ? Number(semData.sgpa).toFixed(2) : '—')
                                            : (s.has_data && s.cgpa != null ? s.cgpa?.toFixed(2) : '—');
                                        const displayBacklogs = semFilter !== 'all'
                                            ? (semData ? semData.backlogs : null)
                                            : (s.has_data ? s.total_backlogs : null);

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
                                                                {displayBacklogs > 0 ? `${displayBacklogs} Backlog` : 'Clear ✓'}
                                                            </span>
                                                        ) : (
                                                            <span style={{ fontSize: '10px', color: 'var(--tx-dim)', fontWeight: 600 }}>No result data</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <button title="Remove" onClick={() => removeStudent(s.usn)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', flexShrink: 0 }}>
                                                    <span className="material-icons-round" style={{ fontSize: '20px' }}>remove_circle_outline</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                    {filteredStudents.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No students in roster.</div>}
                                </div>
                            )}
                        </div>
                    )}
            </div>

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
                                        placeholder={"Enter USN or line-by-line format:\n2AB23CS001, Student Name\n2AB23CS002, Another Student\n2AB23CS003"}
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
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                    <option key={s} value={s}>
                                        Semester {s} {s === Number(selectedClass.semester) ? '(Class Default)' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {exportType === 'consolidated' && (
                            <div>
                                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Assign Faculty Names for Subjects (Sem {exportSemester})
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
                                                    placeholder="Faculty Name (e.g. Mrs. Madhura)"
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
                            <button style={btn('primary')} onClick={handleGeneratePdf}>
                                <span className="material-icons-round" style={{ fontSize: '16px', verticalAlign: 'middle', marginRight: '6px' }}>picture_as_pdf</span>Generate & Download PDF
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );

    const displayedClasses = classes.filter(cls => {
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchName = (cls.name || '').toLowerCase().includes(q);
            const matchBranch = (cls.branch || '').toLowerCase().includes(q);
            const matchSection = (cls.section || '').toLowerCase().includes(q);
            const matchFaculty = (cls.faculty_name || '').toLowerCase().includes(q);
            if (!matchName && !matchBranch && !matchSection && !matchFaculty) return false;
        }
        if (facultyFilter !== 'all') {
            if (cls.faculty_id !== facultyFilter) return false;
        }
        if (branchFilter !== 'all') {
            if (cls.branch !== branchFilter) return false;
        }
        if (semesterFilter !== 'all') {
            if (String(cls.semester) !== String(semesterFilter)) return false;
        }
        if (sectionFilter !== 'all') {
            if ((cls.section || 'A').toUpperCase() !== sectionFilter.toUpperCase()) return false;
        }
        return true;
    });

    return (
        <div style={S.page} className="gf-fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={S.eyebrow}>Academic Management</div>
                    <h1 style={S.title}>Classes & Sections</h1>
                    <p style={S.subtitle}>All college classes, sections, and assigned faculty members. Shared across all faculty.</p>
                </div>
                <button style={btn('primary')} onClick={() => setShowCreate(true)}>
                    <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>add</span>New Class
                </button>
            </div>

            {/* Filter and Search Bar */}
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
                <div style={{ flex: '1 1 240px', position: 'relative' }}>
                    <input
                        style={{ ...S.input, paddingLeft: '36px' }}
                        placeholder="Search classes, sections, or faculty..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <span className="material-icons-round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--tx-dim)', fontSize: '18px', pointerEvents: 'none' }}>
                        search
                    </span>
                </div>

                <select style={{ ...S.sel, width: 'auto', minWidth: '150px' }} value={facultyFilter} onChange={e => setFacultyFilter(e.target.value)}>
                    <option value="all">👨‍🏫 All Faculty ({facultyList.length})</option>
                    {facultyList.map(f => (
                        <option key={f.id} value={f.id}>{f.full_name}</option>
                    ))}
                </select>

                <select style={{ ...S.sel, width: 'auto', minWidth: '130px' }} value={semesterFilter} onChange={e => setSemesterFilter(e.target.value)}>
                    <option value="all">All Semesters</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                        <option key={s} value={s}>Semester {s}</option>
                    ))}
                </select>

                <select style={{ ...S.sel, width: 'auto', minWidth: '120px' }} value={branchFilter} onChange={e => setBranchFilter(e.target.value)}>
                    <option value="all">All Branches</option>
                    {branches.map(b => (
                        <option key={b.code} value={b.code}>{b.code}</option>
                    ))}
                </select>

                <select style={{ ...S.sel, width: 'auto', minWidth: '110px' }} value={sectionFilter} onChange={e => setSectionFilter(e.target.value)}>
                    <option value="all">All Sections</option>
                    {['A', 'B', 'C', 'D', 'E', 'F'].map(sec => (
                        <option key={sec} value={sec}>Section {sec}</option>
                    ))}
                </select>
            </div>

            {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

            {loadingClasses ? <div style={{ textAlign: 'center', padding: '80px', color: 'var(--tx-dim)' }}>Loading classes…</div>
                : displayedClasses.length === 0 ? (
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
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', background: 'var(--surface-low)', padding: '3px 9px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                Sem {cls.semester}
                                            </span>
                                            {cls.section && (
                                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-main)', background: 'var(--surface-low)', padding: '3px 9px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                    Sec {cls.section}
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
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: 'var(--primary)' }}>
                                        View Class <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_forward</span>
                                    </div>
                                </div>
                            </div>
                        ))}
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
                                <label style={S.label}>Class / Section Name *</label>
                                <input
                                    style={S.input}
                                    placeholder="e.g. 6th Sem CSE - Section A"
                                    value={newClass.name}
                                    onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))}
                                    autoFocus
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={S.label}>Branch</label>
                                    <select style={S.sel} value={newClass.branch} onChange={e => setNewClass(p => ({ ...p, branch: e.target.value }))}>
                                        {branches.map(b => <option key={b.code} value={b.code}>{b.code} — {b.label || b.name || b.code}</option>)}
                                        {branches.length === 0 && <option value="CS">CSE — Computer Science</option>}
                                    </select>
                                </div>
                                <div>
                                    <label style={S.label}>Semester</label>
                                    <select style={S.sel} value={newClass.semester} onChange={e => setNewClass(p => ({ ...p, semester: parseInt(e.target.value) }))}>
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={S.label}>Section</label>
                                    <select style={S.sel} value={newClass.section} onChange={e => setNewClass(p => ({ ...p, section: e.target.value }))}>
                                        {['A', 'B', 'C', 'D', 'E', 'F', 'General'].map(sec => (
                                            <option key={sec} value={sec}>Section {sec}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={S.label}>Scheme</label>
                                    <select style={S.sel} value={newClass.scheme} onChange={e => setNewClass(p => ({ ...p, scheme: e.target.value }))}>
                                        {schemes.map(s => <option key={s} value={s}>{s} Scheme</option>)}
                                    </select>
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
        </div>
    );
}
