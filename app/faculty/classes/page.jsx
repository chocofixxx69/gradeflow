'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
const PIE_COLORS = ['#22c55e', '#ef4444', '#6366f1', '#f59e0b', '#14b8a6', '#8b5cf6', '#f97316', '#3b82f6'];
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';
import { fetchByChunks } from '../../../lib/supabase-utils';
import SemesterResults from '../../../components/SemesterResults';
import ClassSemesterSummary from '../../../components/ClassSemesterSummary';

const MEDALS = ['🥇', '🥈', '🥉'];
const USN_RE = /^[0-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/;

// ── Activity Logger ─────────────────────────────────────────
async function logActivity(faculty, action_type, target = null) {
    if (!faculty?.id) return;
    try {
        await supabase.from('faculty_activity').insert({
            faculty_id: faculty.id,
            faculty_name: faculty.full_name || faculty.name || faculty.email || 'Faculty',
            action_type,
            target_usn: target || null,
            sync_status: 'SUCCESS',
        });
    } catch { /* non-blocking */ }
}

// ── Shared Styles ───────────────────────────────────────────
const S = {
    page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
    eyebrow: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-2)' },
    title: { fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: 'var(--space-2)' },
    subtitle: { fontSize: '13px', color: 'var(--tx-muted)', marginBottom: 'var(--space-8)' },
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: 'var(--space-6)' },
    input: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-3)', padding: 'var(--space-3) var(--space-4)', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
    sel: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-3)', padding: 'var(--space-3) var(--space-4)', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%' },
    label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.06em' },
    th: { padding: 'var(--space-3) var(--space-4)', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left' },
    td: { padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--tx-main)' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-4), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left))', overflowY: 'auto' },
    mbox: (w = '480px') => ({ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-7)', width: '100%', maxWidth: w, padding: 'clamp(var(--space-5), 4vw, var(--space-8))', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: 'calc(100dvh - max(var(--space-8), env(safe-area-inset-top) + env(safe-area-inset-bottom)))', overflowY: 'auto' }),
    drawer: { position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(100vw, 720px)', maxWidth: '720px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 1100, overflowY: 'hidden', padding: 'max(var(--space-6), env(safe-area-inset-top)) clamp(var(--space-5), 4vw, var(--space-9)) max(var(--space-6), env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', boxShadow: 'var(--shadow-lg)', maxHeight: '100dvh' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 1050 },
};
const btn = (v = 'primary') => ({ padding: 'var(--space-3) var(--space-5)', borderRadius: 'var(--radius-3)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: v === 'primary' ? 'var(--primary)' : v === 'danger' ? 'var(--red-bg)' : 'var(--surface-low)', color: v === 'primary' ? 'var(--bg)' : v === 'danger' ? 'var(--red)' : 'var(--tx-main)', ...(v !== 'primary' && { border: `1px solid ${v === 'danger' ? 'var(--red)' : 'var(--border)'}` }) });
const msgBox = ok => ({ padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-3)', marginBottom: 'var(--space-4)', fontSize: '13px', fontWeight: 700, background: ok ? 'var(--green-bg)' : 'var(--surface-low)', color: ok ? 'var(--green)' : 'var(--tx-muted)', border: `1px solid ${ok ? 'var(--green)' : 'var(--border)'}` });

const c = {
    statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-6)' },
    statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: 'var(--space-4) var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' },
    statLabel: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' },
    statVal: { fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)' },
};

// ── Parse any spreadsheet/CSV file → USN array ─────────────
async function parseFileForUsns(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
        const text = await file.text();
        const wb = XLSX.read(text, { type: 'string' });
        return extractUsnsFromWorkbook(wb);
    }
    // xlsx, xls, ods, etc.
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    return extractUsnsFromWorkbook(wb);
}

function extractUsnsFromWorkbook(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) return [];
    // Find column with header 'usn' (case-insensitive), or fall back to column 0
    const header = (rows[0] || []).map(h => String(h).trim().toLowerCase());
    const usnIdx = header.findIndex(h => ['usn','usno','university seat number','roll no','rollno','roll number'].includes(h));
    const col = usnIdx >= 0 ? usnIdx : 0;
    return rows.slice(usnIdx >= 0 ? 1 : 0)
        .map(r => String(r[col] || '').trim().toUpperCase())
        .filter(Boolean);
}

// ══════════════════════════════════════════════════════════
function ClassesContent() {
    const [faculty, setFaculty] = useState(null);
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [semFilter, setSemFilter] = useState('all');
    const [classTab, setClassTab] = useState('roster'); // 'roster', 'analytics'
    const [viewingList, setViewingList] = useState(null); // { title: string, columns: [{...}], data: [...] }
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
    const [showEditSem, setShowEditSem] = useState(null);
    const [editSemVal, setEditSemVal] = useState(1);
    const [showCreate, setShowCreate] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);   // unified add students modal
    const [addTab, setAddTab] = useState('single');             // 'single' | 'paste' | 'file'
    const [importResult, setImportResult] = useState(null);    // result summary
    const [showImportResult, setShowImportResult] = useState(false);
    const [showUrlModal, setShowUrlModal] = useState(false);
    const [vtuUrls, setVtuUrls] = useState([]);
    const [loadingUrls, setLoadingUrls] = useState(false);
    const [newUrlInput, setNewUrlInput] = useState({ url: '', exam_name: '' });
    const [newClass, setNewClass] = useState({ name: '', branch: 'CS', semester: 3, scheme: '2022' });
    const [addUsn, setAddUsn] = useState('');
    const [bulkUsns, setBulkUsns] = useState('');
    const [fileLoading, setFileLoading] = useState(false);
    const [msg, setMsg] = useState('');
    const [scrapeStatus, setScrapeStatus] = useState({});
    const [drawerScrapeStatus, setDrawerScrapeStatus] = useState('');
    const [showTransfer, setShowTransfer] = useState(false);
    const [transferStudent, setTransferStudent] = useState(null);  // { usn, name }
    const [transferMode, setTransferMode] = useState('move');       // 'move' | 'copy'
    const [transferTarget, setTransferTarget] = useState('');       // destination class id
    const [transferLoading, setTransferLoading] = useState(false);
    const [drawerTab, setDrawerTab] = useState('marks'); // 'marks' | 'backlogs'
    const [marksViewSem, setMarksViewSem] = useState(null);
    const [branches, setBranches] = useState([]);
    const [schemes] = useState(['2022', '2025']);
    const fileRef = useRef(null);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        const { data, error } = await supabase.from('branches').select('*').order('label');
        if (data) setBranches(data);
    };

    useEffect(() => {
        const s = localStorage.getItem('faculty_session');
        if (s) setFaculty(JSON.parse(s));
        fetchClasses();
    }, []);

    const fetchClasses = async () => {
        setLoadingClasses(true);
        try { const r = await fetch('/api/classes', { credentials: 'include' }); const j = await r.json(); if (j.success) setClasses(j.classes || []); } finally { setLoadingClasses(false); }
    };


    const fetchClassStudents = useCallback(async (cls) => {
        setLoadingStudents(true); setStudents([]); setAllMarks([]); setSubjectToppers([]); setAvailableSems([]);
        try {
            const r = await fetch(`/api/class-students?class_id=${cls.id}`);
            const j = await r.json();
            if (!j.success) return;
            const studs = j.students || [];
            setStudents(studs);
            if (studs.length > 0) {
                const usns = studs.map(s => s.usn);
                // Paginated fetch — gets ALL marks, not just 1000
                const marks = await fetchByChunks('subject_marks', 'usn,subject_code,subject_name,internal,external,total,grade,credits,passed,semester', 'usn', usns, supabase, 15);
                if (marks?.length) {
                    setAllMarks(marks);
                    const semsInData = Array.from(new Set(marks.map(m => Number(m.semester)))).sort((a,b) => a-b);
                    const maxSemInData = semsInData[semsInData.length - 1] || 0;
                    const maxSem = Math.max(maxSemInData, Number(cls.semester) || 1);
                    const sems = Array.from({ length: maxSem }, (_, i) => i + 1);
                    setAvailableSems(sems);
                    const last = Number(cls.semester) || maxSem || 1;
                    setSelectedSem(last);
                    setMarksViewSem(last);
                    
                    // Also paginate remarks
                    const remarks = await fetchByChunks('academic_remarks', 'student_usn,semester,sgpa', 'student_usn', usns, supabase, 15);
                    computeToppers(marks, studs, last, remarks || []);
                } else {
                    const parsedSem = Number(cls.semester) || 1;
                    const sems = Array.from({ length: parsedSem }, (_, i) => i + 1);
                    setAvailableSems(sems);
                    setSelectedSem(parsedSem);
                }
            }
        } finally { setLoadingStudents(false); }
    }, []);

    const computeToppers = (marks, studs, sem, remarks = null) => {
        // Always compare as numbers to prevent string vs int mismatches
        const semNum = Number(sem);
        const filtered = marks.filter(m => Number(m.semester) === semNum);
        const bySubj = {};
        const byStudent = {};
        
        filtered.forEach(m => {
            if (!bySubj[m.subject_code]) bySubj[m.subject_code] = [];
            bySubj[m.subject_code].push(m);
            
            if (!byStudent[m.usn]) byStudent[m.usn] = 0;
            byStudent[m.usn] += m.total || 0;
        });
        
        const result = Object.entries(bySubj).map(([code, rows]) => {
            const allScores = studs.map(s => {
                const r = rows.find(x => x.usn === s.usn);
                return r 
                  ? { usn: s.usn, name: s.name, total: r.total ?? 0, internal: r.internal ?? '-', external: r.external ?? '-', grade: r.grade ?? '-' }
                  : { usn: s.usn, name: s.name, total: 0, internal: '-', external: '-', grade: '-' };
            }).sort((a, b) => b.total - a.total);
            
            return {
                code,
                name: rows[0].subject_name || code,
                allScores
            };
        }).sort((a, b) => a.code.localeCompare(b.code));
        
        setSubjectToppers(result);

        // Compute Semester Toppers — prefer SGPA from academic_remarks, fall back to raw marks sum
        let fullSem = [];
        const semRemarks = (remarks || []).filter(r => Number(r.semester) === semNum && r.sgpa !== null);
        if (semRemarks.length > 0) {
            fullSem = studs.map(s => {
                const r = semRemarks.find(x => x.student_usn === s.usn);
                return { usn: s.usn, name: s.name, score: r ? parseFloat(r.sgpa) : 0, type: 'SGPA' };
            }).sort((a, b) => b.score - a.score);
        } else {
            fullSem = studs.map(s => ({
                usn: s.usn, name: s.name, score: byStudent[s.usn] || 0, type: 'Marks'
            })).sort((a, b) => b.score - a.score);
        }
        setSemToppers(fullSem);
    };

    const selectClass = cls => { 
        setViewingList(null); // Clear any open lists from previous class
        setSelectedClass(cls); 
        setMsg(''); 
        setEditingName(false); 
        fetchClassStudents(cls); 
    };

    const createClass = async () => {
        if (!newClass.name.trim()) { setMsg('Class name required.'); return; }
        const r = await fetch('/api/classes', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newClass, faculty_id: faculty?.id }) });
        const j = await r.json();
        if (j.success) { setShowCreate(false); setNewClass({ name: '', branch: 'CS', semester: 3, scheme: '2022' }); setMsg('✓ Class created.'); await logActivity(faculty, 'CLASS_CREATE', newClass.name); fetchClasses(); }
        else setMsg(j.error || 'Failed.');
    };

    const renameClass = async () => {
        if (!editName.trim()) return;
        const r = await fetch('/api/classes', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: selectedClass.id, name: editName }) });
        const j = await r.json();
        if (j.success) { setSelectedClass(p => ({ ...p, name: editName })); setClasses(prev => prev.map(c => c.id === selectedClass.id ? { ...c, name: editName } : c)); setEditingName(false); }
    };

    const updateClassSem = async (classId, newSem) => {
        const r = await fetch('/api/classes', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: classId, semester: newSem }) });
        const j = await r.json();
        if (j.success) {
            setClasses(prev => prev.map(c => c.id === classId ? { ...c, semester: newSem } : c));
            if (selectedClass?.id === classId) setSelectedClass(p => ({ ...p, semester: newSem }));
            setShowEditSem(null);
            setMsg('✓ Semester updated.');
        }
    };

    const deleteClass = async id => {
        if (!confirm('Delete this class?')) return;
        await logActivity(faculty, 'CLASS_DELETE', selectedClass?.name);
        await fetch('/api/classes', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
        setSelectedClass(null); fetchClasses();
    };

    const addStudent = async () => {
        const u = addUsn.trim().toUpperCase(); if (!u) return;
        const r = await fetch('/api/class-students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn: u, faculty_id: faculty?.id }) });
        const j = await r.json();
        if (j.success) { setAddUsn(''); setShowAddModal(false); setMsg('✓ Student added.'); await logActivity(faculty, 'CLASS_ADD_STUDENT', u); fetchClassStudents(selectedClass); fetchClasses(); }
        else setMsg(j.error || 'Failed to add student. Check USN and try again.');
    };

    const addBulkStudents = async () => {
        const usns = bulkUsns.split(/[\n,;\s]+/).map(u => u.trim().toUpperCase()).filter(Boolean);
        if (!usns.length) return;
        const r = await fetch('/api/class-students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn: usns, faculty_id: faculty?.id }) });
        const j = await r.json();
        if (j.success) {
            setBulkUsns(''); setShowAddModal(false);
            setMsg(`✓ ${j.added} student(s) added.`);
            await logActivity(faculty, 'CLASS_BULK_IMPORT', `${j.added} students`);
            fetchClassStudents(selectedClass); fetchClasses();
        } else setMsg(j.error || 'Failed.');
    };

    const handleFileImport = async (file) => {
        if (!file || !selectedClass) return;
        setFileLoading(true);
        try {
            const raw = await parseFileForUsns(file);
            const valid = [], invalid = [];
            raw.forEach(u => USN_RE.test(u) ? valid.push(u) : invalid.push(u));
            let added = 0;
            if (valid.length) {
                const r = await fetch('/api/class-students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn: valid, faculty_id: faculty?.id }) });
                const j = await r.json();
                added = j.added || 0;
                if (j.success) { await logActivity(faculty, 'CLASS_BULK_IMPORT', `${added} from file`); fetchClassStudents(selectedClass); fetchClasses(); }
            }
            setImportResult({ added, total: raw.length, invalid });
            setShowImportResult(true);
            setShowAddModal(false);
        } catch (e) {
            setMsg('Failed to parse file. Try CSV or XLSX format.');
        } finally {
            setFileLoading(false);
            if (fileRef.current) fileRef.current.value = '';
        }
    };

    const removeStudent = async usn => {
        if (!confirm(`Remove ${usn} from this class?`)) return;
        await fetch('/api/class-students', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn }) });
        await logActivity(faculty, 'CLASS_REMOVE_STUDENT', usn);
        setStudents(p => p.filter(s => s.usn !== usn)); fetchClasses();
    };

    const openTransfer = (s, e) => { e.stopPropagation(); setTransferStudent(s); setTransferTarget(''); setTransferMode('move'); setShowTransfer(true); };

    const doTransfer = async () => {
        if (!transferTarget || !transferStudent) return;
        setTransferLoading(true);
        // Add to destination class
        const addRes = await fetch('/api/class-students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: transferTarget, usn: transferStudent.usn, faculty_id: faculty?.id }) });
        const addJ = await addRes.json();
        if (!addJ.success) { setMsg(addJ.error || 'Failed to add to target class.'); setTransferLoading(false); return; }
        // If move mode: remove from current class
        if (transferMode === 'move') {
            await fetch('/api/class-students', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn: transferStudent.usn }) });
            setStudents(p => p.filter(s => s.usn !== transferStudent.usn));
            await logActivity(faculty, 'CLASS_TRANSFER', `${transferStudent.usn} moved`);
        } else {
            await logActivity(faculty, 'CLASS_TRANSFER', `${transferStudent.usn} copied`);
        }
        setShowTransfer(false);
        setTransferStudent(null);
        setTransferLoading(false);
        const destName = classes.find(c => c.id === transferTarget)?.name || 'target class';
        setMsg(`✓ ${transferStudent.name || transferStudent.usn} ${transferMode === 'move' ? 'moved to' : 'also added to'} ${destName}`);
        fetchClasses();
    };

    const openStudentDrawer = async s => {
        setOpenStudent(s); setLoadingDrawer(true); setDrawerScrapeStatus(''); setDrawerTab('marks');
        const { data: marks } = await supabase.from('subject_marks').select('*').eq('usn', s.usn).order('semester');
        setStudentMarks(marks || []); setLoadingDrawer(false);
    };

    const deleteStudentEntirely = async (usn, name) => {
        if (!confirm(`⚠️ PERMANENTLY DELETE student ${name || usn} from the entire database?\n\nThis removes ALL their data: marks, profile, class enrollments.\nThis CANNOT be undone.`)) return;
        const r = await fetch('/api/admin/delete-student', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usn }) });
        const j = await r.json();
        if (j.success) {
            setOpenStudent(null);
            setStudents(p => p.filter(s => s.usn !== usn));
            setMsg(`✓ Student ${usn} permanently deleted.`);
            fetchClasses();
        } else {
            setMsg(j.error || 'Failed to delete student.');
        }
    };

    const scrapeInDrawer = async () => {
        if (!openStudent) return;
        setDrawerScrapeStatus('scraping');
        const r = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usn: openStudent.usn, role: 'faculty', force: true, faculty_id: faculty?.id }) });
        const j = await r.json();
        setDrawerScrapeStatus(j.jobId ? 'queued' : 'done');
    };

    const scrapeStudent = async usn => {
        setScrapeStatus(p => ({ ...p, [usn]: 'scraping' }));
        try { const r = await fetch('/api/scrape', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usn, role: 'faculty', force: true, faculty_id: faculty?.id }) }); const j = await r.json(); setScrapeStatus(p => ({ ...p, [usn]: j.jobId ? 'queued' : 'done' })); } catch { setScrapeStatus(p => ({ ...p, [usn]: 'error' })); }
    };

    const fetchAllVtu = async () => {
        const activeUrls = vtuUrls.filter(u => u.is_active);
        if (activeUrls.length === 0) { setMsg('No active URLs selected. Enable at least one URL.'); setShowUrlModal(false); return; }
        setShowUrlModal(false);
        setMsg(`Queuing ${students.length} scrape jobs via ${activeUrls.length} URL(s)...`);
        await logActivity(faculty, 'CLASS_FETCH_VTU', selectedClass?.name);
        for (const s of students) { await scrapeStudent(s.usn); await new Promise(r => setTimeout(r, 400)); }
        setMsg(`✓ ${students.length} jobs queued.`);
    };

    const loadVtuUrls = async () => {
        if (!faculty?.id) return;
        setLoadingUrls(true);
        const r = await fetch(`/api/vtu-urls?faculty_id=${faculty.id}`, { credentials: 'include' });
        const j = await r.json();
        if (j.success) setVtuUrls(j.urls || []);
        setLoadingUrls(false);
    };

    const toggleUrl = async (url) => {
        const updated = vtuUrls.map(u => u.id === url.id ? { ...u, is_active: !u.is_active } : u);
        setVtuUrls(updated);
        await fetch('/api/vtu-urls', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faculty_id: faculty?.id, url: url.url, exam_name: url.exam_name, is_active: !url.is_active }) });
    };

    const toggleAllUrls = async (active) => {
        setVtuUrls(p => p.map(u => ({ ...u, is_active: active })));
        await fetch('/api/vtu-urls', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faculty_id: faculty?.id, is_active: active }) });
    };

    const addNewUrl = async () => {
        if (!newUrlInput.url.trim()) return;
        const r = await fetch('/api/vtu-urls', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ faculty_id: faculty?.id, url: newUrlInput.url.trim(), exam_name: newUrlInput.exam_name || 'Custom URL', is_active: true }) });
        const j = await r.json();
        if (j.success) { setVtuUrls(p => [j.url, ...p]); setNewUrlInput({ url: '', exam_name: '' }); }
    };

    // ── Derived data ──────────────────────────────────────────
    // Build a set of USNs that have marks in the selected roster semester
    // (Student profile 'semester' field just stores their current year level, not which marks they have)
    const usnsInSemFilter = semFilter === 'all'
        ? new Set(students.map(s => s.usn))
        : new Set(allMarks.filter(m => Number(m.semester) === Number(semFilter)).map(m => m.usn));

    const filteredStudents = semFilter === 'all'
        ? students
        : students.filter(s => usnsInSemFilter.has(s.usn));

    const top10 = [...students].filter(s => s.cgpa !== null).sort((a, b) => b.cgpa - a.cgpa).slice(0, 10);
    const totalBacklogs = students.reduce((s, st) => s + (st.total_backlogs || 0), 0);
    const withCgpa = students.filter(s => s.cgpa !== null);
    const avgCgpa = withCgpa.length ? (withCgpa.reduce((s, st) => s + (st.cgpa || 0), 0) / withCgpa.length).toFixed(2) : '—';
    const classTopper = top10[0] || null;

    const groupedDrawerMarks = {};
    (studentMarks || []).forEach(m => { const sem = m.semester || 1; if (!groupedDrawerMarks[sem]) groupedDrawerMarks[sem] = []; groupedDrawerMarks[sem].push(m); });

    // ── Detail View ───────────────────────────────────────────
    if (selectedClass) return (
        <div style={S.page} className="gf-fade-up">
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <button onClick={() => setSelectedClass(null)} style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>Classes
                </button>
                <span style={{ color: 'var(--tx-dim)' }}>›</span>
                {editingName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', minWidth: 0 }}>
                        <input style={{ ...S.input, width: 'min(240px, 100%)', padding: '6px 12px', flex: '1 1 180px' }} value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameClass(); if (e.key === 'Escape') setEditingName(false); }} autoFocus />
                        <button onClick={renameClass} style={btn('primary')}>✓</button>
                        <button onClick={() => setEditingName(false)} style={btn('ghost')}>✕</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55vw' }}>{selectedClass.name}</span>
                        <button onClick={() => { setEditName(selectedClass.name); setEditingName(true); }} aria-label="Edit class name" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', padding: '2px' }}>
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>edit</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Header row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '28px' }}>
                <div>
                    <h1 style={S.title}>{selectedClass.name}</h1>
                    <p style={S.subtitle}>{selectedClass.branch} · Sem {selectedClass.semester} · {selectedClass.scheme} Scheme · {students.length} students</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button style={btn('primary')} onClick={() => { setShowAddModal(true); setAddTab('single'); setMsg(''); }}>
                        <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>person_add</span>Add Students
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleFileImport(e.target.files[0]); }} />
                    <button style={btn('ghost')} onClick={() => { loadVtuUrls(); setShowUrlModal(true); }} disabled={students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>cloud_download</span>Fetch All VTU
                    </button>
                    <button style={btn('ghost')} onClick={() => { setShowEditSem(selectedClass); setEditSemVal(selectedClass.semester); }}>
                        <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>edit</span>Edit Sem
                    </button>
                    <button style={btn('danger')} onClick={() => deleteClass(selectedClass.id)}>Delete Class</button>
                </div>

            </div>

            {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

            {/* TAB SWITCHER */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '10px', flexWrap: 'wrap' }}>
                {[
                    { id: 'analytics', label: 'Analytics & Rankings', icon: 'leaderboard' },
                    { id: 'marksview', label: 'Marks View', icon: 'grid_on' },
                    { id: 'roster', label: 'Students List', icon: 'people' },
                ].map(t => (
                    <button key={t.id} onClick={() => setClassTab(t.id)} style={{ padding: '8px 16px', background: classTab === t.id ? 'var(--primary)' : 'transparent', color: classTab === t.id ? 'var(--bg)' : 'var(--tx-dim)', borderRadius: '10px', border: 'none', fontWeight: 800, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>{t.icon}</span>{t.label}
                    </button>
                ))}
            </div>

            {classTab === 'analytics' && (
            <div className="gf-fade-up">
                {/* Stats */}
                <div style={c.statGrid}>
                    <div style={c.statCard}>
                        <div style={c.statLabel}>Total Students</div>
                        <div style={c.statVal}>{students.length}</div>
                    </div>
                    <div style={c.statCard}>
                        <div style={c.statLabel}>Avg CGPA</div>
                        <div style={{ ...c.statVal, color: 'var(--primary)' }}>{avgCgpa}</div>
                    </div>
                    <div style={c.statCard}>
                        <div style={c.statLabel}>Backlogs</div>
                        <div style={{ ...c.statVal, color: totalBacklogs > 0 ? 'var(--red)' : 'var(--green)' }}>{totalBacklogs}</div>
                    </div>
                    {classTopper && (
                        <div style={{ ...c.statCard, background: 'linear-gradient(135deg,var(--surface),var(--surface-low))', border: '1px solid var(--primary)', flex: 2 }}>
                            <div style={{ ...c.statLabel, color: 'var(--primary)' }}>🏆 Class Topper</div>
                            <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--tx-main)' }}>{classTopper.name}</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{classTopper.usn} · CGPA {classTopper.cgpa?.toFixed(2)}</div>
                        </div>
                    )}
                </div>

                {/* Top 10 bar */}
                {top10.length > 1 && (
                    <div style={{ ...S.card, padding: '16px 20px', marginBottom: '24px', overflowX: 'auto' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Class Top 10 Rankers</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'nowrap' }}>
                            {top10.map((s, i) => (
                                <button key={s.usn} onClick={() => { openStudentDrawer(s); }} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 14px', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)' }}>#{i + 1} {i === 0 ? '🏆' : i === 1 ? '🥈' : i === 2 ? '🥉' : ''}</div>
                                    <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>{s.name}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>{s.cgpa?.toFixed(2)}</div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}


            {/* Semester Analytics Header & Tabs */}
            <div style={{ ...S.card, marginBottom: '24px' }}>
                 <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                     <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>📚 Semester {selectedSem} Performance</div>
                     <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {(availableSems.length > 0 ? availableSems : [1,2,3,4,5,6,7,8]).map(s => (
                                <button key={s} onClick={async () => { 
                                    setSelectedSem(s); 
                                    const remarks = await fetchByChunks('academic_remarks', 'student_usn,semester,sgpa', 'student_usn', students.map(st=>st.usn), supabase, 15);
                                    computeToppers(allMarks, students, s, remarks || []); 
                                }} style={{ padding: '6px 14px', borderRadius: '8px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: Number(selectedSem) === Number(s) ? 'var(--primary)' : 'var(--surface-low)', color: Number(selectedSem) === Number(s) ? 'var(--bg)' : 'var(--tx-dim)' }}>Sem {s}</button>
                            ))}
                        </div>
                    </div>

                    {/* Semester Overall Toppers */}
                    {semToppers.length > 0 && (
                        <div style={{ marginBottom: '24px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Top Rankers (Sem {selectedSem})</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {semToppers.slice(0, 5).map((s, i) => (
                                    <div key={s.usn} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 14px', whiteSpace: 'nowrap', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '140px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)' }}>#{i + 1} {MEDALS[i] || ''}</div>
                                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>{s.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>{s.type}: {s.type === 'SGPA' ? s.score?.toFixed(2) : s.score}</div>
                                    </div>
                                ))}
                            </div>
                           {semToppers.length > 5 && (
                                <button onClick={() => setViewingList({ title: `Sem ${selectedSem} Overall Rankings`, type: semToppers[0]?.type || 'Score', data: semToppers })} style={{ ...btn('ghost'), marginTop: '12px', fontSize: '11px', fontWeight: 800 }}>
                                    View Full Ranked List ({semToppers.length} students)
                                </button>
                            )}
                        </div>
                    )}

                    {/* Subject Toppers */}
                    {subjectToppers.length > 0 && (
                        <>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Subject Toppers</div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: '10px' }}>
                                {subjectToppers.map(t => (
                                    <div key={t.code} style={{ background: 'var(--surface-low)', borderRadius: '12px', padding: '14px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '4px', fontFamily: 'monospace' }}>{t.code}</div>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)', marginBottom: '8px', lineHeight: 1.3 }}>{t.name}</div>
                                        {t.allScores.slice(0, 3).map((r, i) => (
                                            <div key={r.usn} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderTop: i > 0 ? '1px solid var(--border)' : undefined }}>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{MEDALS[i]} {r.name}</div>
                                                <div style={{ fontSize: '12px', fontWeight: 900, color: i === 0 ? 'var(--primary)' : 'var(--tx-main)' }}>{r.total}</div>
                                            </div>
                                        ))}
                                        <button onClick={() => setViewingList({ title: `${t.code} - ${t.name}`, type: 'Total Marks', showMarks: true, data: t.allScores.map(r => ({ usn: r.usn, name: r.name, score: r.total, internal: r.internal, external: r.external, grade: r.grade })) })} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 800, padding: '8px 0 0 0', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', borderTop: '1px dashed var(--border)', marginTop: '8px' }}>
                                            View Full List
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* Class Wide Semester Analysis */}
                    {students.length > 0 && selectedSem && (
                        <ClassSemesterSummary 
                            students={students} 
                            allMarks={allMarks} 
                            selectedSem={selectedSem} 
                        />
                    )}
                </div>
            </div>
            )}

            {/* ── MARKS VIEW TAB ── */}
            {classTab === 'marksview' && (() => {
                const mvSem = marksViewSem || selectedSem || (availableSems[0] ?? 1);
                const semMarks = allMarks.filter(m => Number(m.semester) === Number(mvSem));
                const studentMap = Object.fromEntries(students.map(s => [s.usn, s]));

                // Build subject-wise analytics
                const bySubject = {};
                semMarks.forEach(m => {
                    const code = m.subject_code || 'UNKNOWN';
                    if (!bySubject[code]) bySubject[code] = { name: m.subject_name || code, code, marks: [] };
                    bySubject[code].marks.push(m);
                });

                const subjectAnalytics = Object.values(bySubject).sort((a, b) => a.code.localeCompare(b.code)).map(sub => {
                    const total = students.length;
                    const attempted = sub.marks.length;
                    const FAIL_SET = new Set(['F', 'X', 'NE', 'W', 'A', 'FAIL', 'ABSENT']);
                    const passed = sub.marks.filter(m => !FAIL_SET.has((m.grade || 'F').toUpperCase())).length;
                    const failed = attempted - passed;
                    const passP = attempted > 0 ? Math.round((passed / attempted) * 100) : 0;
                    const avgTotal = attempted > 0 ? Math.round(sub.marks.reduce((s, m) => s + (m.total || 0), 0) / attempted) : 0;
                    const gradeCount = {};
                    sub.marks.forEach(m => { const g = (m.grade || 'F').toUpperCase(); gradeCount[g] = (gradeCount[g] || 0) + 1; });
                    return { ...sub, total, attempted, passed, failed, passP, avgTotal, gradeCount };
                });

                // Excel export for marks view
                const exportMarksExcel = () => {
                    const wb = XLSX.utils.book_new();
                    // Sheet 1: All students x subjects grid
                    const subjects = subjectAnalytics.map(s => s.code);
                    const header = ['USN', 'Name', ...subjects.flatMap(code => [`${code} (CIE)`, `${code} (SEE)`, `${code} (Total)`, `${code} (Grade)`])];
                    const rows = students.map(stu => {
                        const stuMarks = Object.fromEntries(semMarks.filter(m => m.usn === stu.usn).map(m => [m.subject_code, m]));
                        return [stu.usn, stu.name, ...subjects.flatMap(code => {
                            const m = stuMarks[code];
                            return m ? [m.internal ?? '—', m.external ?? '—', m.total ?? '—', m.grade ?? '—'] : ['—', '—', '—', '—'];
                        })];
                    });
                    const ws1 = XLSX.utils.aoa_to_sheet([header, ...rows]);
                    XLSX.utils.book_append_sheet(wb, ws1, `Sem ${mvSem} All Marks`);

                    // Sheet 2: Subject analytics
                    const analytics = [['Subject Code', 'Subject Name', 'Students Appeared', 'Passed', 'Failed', 'Pass %', 'Avg Total']];
                    subjectAnalytics.forEach(s => analytics.push([s.code, s.name, s.attempted, s.passed, s.failed, s.passP + '%', s.avgTotal]));
                    const ws2 = XLSX.utils.aoa_to_sheet(analytics);
                    XLSX.utils.book_append_sheet(wb, ws2, 'Subject Analytics');

                    XLSX.writeFile(wb, `${selectedClass.name}_Sem${mvSem}_Marks.xlsx`);
                };

                return (
                    <div className="gf-fade-up">
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <h3 style={{ fontSize: '18px', fontWeight: 900, margin: 0 }}>Marks View — Semester {mvSem}</h3>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>{students.length} students · {Object.keys(bySubject).length} subjects</div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-low)', padding: '4px', borderRadius: '10px' }}>
                                    {(availableSems.length > 0 ? availableSems : [1,2,3,4,5,6,7,8]).map(s => (
                                        <button key={s} onClick={() => setMarksViewSem(s)} style={{ padding: '6px 12px', borderRadius: '7px', fontWeight: 800, fontSize: '12px', cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: Number(mvSem) === Number(s) ? 'var(--primary)' : 'transparent', color: Number(mvSem) === Number(s) ? 'var(--bg)' : 'var(--tx-dim)' }}>Sem {s}</button>
                                    ))}
                                </div>
                                <button onClick={exportMarksExcel} style={btn('ghost')}>
                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>download</span>Export Excel
                                </button>
                            </div>
                        </div>

                        {semMarks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px', color: 'var(--tx-dim)' }}>
                                <span className="material-icons-round" style={{ fontSize: '48px', display: 'block', marginBottom: '12px', opacity: 0.3 }}>grid_off</span>
                                No marks found for Semester {mvSem}. Fetch VTU results to populate data.
                            </div>
                        ) : (
                            <>
                                {/* Subject Analytics Cards */}
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Subject-wise Analytics</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px', marginBottom: '28px' }}>
                                    {subjectAnalytics.map(sub => {
                                        const pieData = [
                                            { name: 'Passed', value: sub.passed },
                                            { name: 'Failed', value: sub.failed },
                                        ].filter(d => d.value > 0);
                                        return (
                                            <div key={sub.code} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '16px', overflow: 'hidden' }}>
                                                <div style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '2px' }}>{sub.code}</div>
                                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)', marginBottom: '12px', lineHeight: 1.3 }}>{sub.name}</div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                                                    {[
                                                        { label: 'Appeared', val: sub.attempted },
                                                        { label: 'Avg Score', val: sub.avgTotal },
                                                        { label: 'Pass %', val: `${sub.passP}%`, color: sub.passP >= 75 ? 'var(--green)' : sub.passP >= 50 ? 'var(--amber)' : 'var(--red)' },
                                                        { label: 'Fail', val: sub.failed, color: sub.failed > 0 ? 'var(--red)' : 'var(--green)' },
                                                    ].map(stat => (
                                                        <div key={stat.label} style={{ background: 'var(--surface-low)', borderRadius: '8px', padding: '8px 10px' }}>
                                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)', fontWeight: 700 }}>{stat.label}</div>
                                                            <div style={{ fontSize: '16px', fontWeight: 900, color: stat.color || 'var(--tx-main)' }}>{stat.val}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                                {pieData.length > 0 && (
                                                    <ResponsiveContainer width="100%" height={120}>
                                                        <PieChart>
                                                            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={30} outerRadius={50} paddingAngle={4}>
                                                                {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                                            </Pie>
                                                            <Tooltip formatter={(v, n) => [`${v} students`, n]} />
                                                            <Legend iconSize={8} wrapperStyle={{ fontSize: '11px' }} />
                                                        </PieChart>
                                                    </ResponsiveContainer>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* All Students Marks Table */}
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>All Students — Semester {mvSem} Marks</div>
                                <div className="gf-table-wrap">
                                    <table className="gf-table" style={{ minWidth: `${300 + subjectAnalytics.length * 180}px` }}>
                                        <thead>
                                            <tr>
                                                <th>Student</th>
                                                {subjectAnalytics.map(sub => (
                                                    <th key={sub.code} style={{ textAlign: 'center', minWidth: '160px' }}>
                                                        <div>{sub.code}</div>
                                                        <div style={{ fontWeight: 500, fontSize: '10px', textTransform: 'none', opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{sub.name}</div>
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...students].sort((a, b) => a.usn.localeCompare(b.usn)).map(stu => {
                                                const stuMarkMap = Object.fromEntries(semMarks.filter(m => m.usn === stu.usn).map(m => [m.subject_code, m]));
                                                return (
                                                    <tr key={stu.usn}>
                                                        <td>
                                                            <div style={{ fontWeight: 700, fontSize: '12px' }}>{stu.name}</div>
                                                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{stu.usn}</div>
                                                        </td>
                                                        {subjectAnalytics.map(sub => {
                                                            const m = stuMarkMap[sub.code];
                                                            if (!m) return <td key={sub.code} style={{ textAlign: 'center', color: 'var(--tx-dim)' }}>—</td>;
                                                            const FAIL_SET = new Set(['F', 'X', 'NE', 'W', 'A', 'FAIL', 'ABSENT']);
                                                            const isFail = FAIL_SET.has((m.grade || 'F').toUpperCase());
                                                            return (
                                                                <td key={sub.code} style={{ textAlign: 'center' }}>
                                                                    <div style={{ fontWeight: 800, fontSize: '13px', color: isFail ? 'var(--red)' : 'var(--tx-main)' }}>{m.total ?? '—'}</div>
                                                                    <div style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>{m.internal ?? '—'}/{m.external ?? '—'}</div>
                                                                    <span style={{ display: 'inline-block', marginTop: '2px', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 900, background: isFail ? 'var(--red-bg)' : 'var(--green-bg)', color: isFail ? 'var(--red)' : 'var(--green)' }}>{m.grade || 'F'}</span>
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                );
            })()}

            {classTab === 'roster' && (
                <div className="gf-fade-up" style={{ ...S.card, padding: '0', overflow: 'hidden' }}>
                    <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)' }}>Students</h3>
                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{students.length} Students</div>
                    </div>
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>
                                    <th style={S.th}>USN</th>
                                    <th style={S.th}>Name</th>
                                    <th style={{ ...S.th, textAlign: 'center' }}>CGPA</th>
                                    <th style={{ ...S.th, textAlign: 'center' }}>Backlogs</th>
                                    <th style={{ ...S.th, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[...students].sort((a,b) => a.usn.localeCompare(b.usn)).map(s => {
                                    const sc = scrapeStatus[s.usn];
                                    return (
                                        <tr key={s.usn} onClick={() => openStudentDrawer(s)} style={{ cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ ...S.td, fontFamily: 'monospace', color: 'var(--tx-muted)' }}>{s.usn}</td>
                                            <td style={{ ...S.td }}>
                                                <div style={{ fontWeight: 800 }}>{s.name}</div>
                                            </td>
                                            <td style={{ ...S.td, textAlign: 'center', fontWeight: s.cgpa ? 800 : 500, color: s.cgpa ? 'var(--primary)' : 'var(--tx-dim)' }}>{s.cgpa?.toFixed(2) || '—'}</td>
                                            <td style={{ ...S.td, textAlign: 'center' }}>
                                                {s.total_backlogs > 0 ? <span style={{ padding: '4px 8px', borderRadius: '6px', background: 'var(--red-bg)', color: 'var(--red)', fontSize: '10px', fontWeight: 900 }}>{s.total_backlogs}</span> : <span style={{ color: 'var(--tx-dim)', fontSize: '12px' }}>Clear</span>}
                                            </td>
                                            <td style={{ ...S.td, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button onClick={() => scrapeStudent(s.usn)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-low)', cursor: 'pointer' }} title="Fetch VTU">
                                                        <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--tx-dim)' }}>{sc === 'scraping' ? 'sync' : 'cloud_download'}</span>
                                                    </button>
                                                    <button onClick={(e) => openTransfer(s, e)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface-low)', cursor: 'pointer' }} title="Transfer">
                                                        <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--tx-dim)' }}>swap_horiz</span>
                                                    </button>
                                                    <button onClick={() => removeStudent(s.usn)} style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid var(--red)', background: 'var(--red-bg)', cursor: 'pointer' }} title="Remove">
                                                        <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--red)' }}>remove_circle_outline</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {students.length === 0 && <tr><td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No students found.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}



            {/* ── Student Drawer ── */}
            {openStudent && (
                <>
                    <div style={S.overlay} onClick={() => setOpenStudent(null)} />
                    <div style={S.drawer} className="gf-fade-up">
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0, flexWrap: 'wrap', gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', minWidth: 0 }}>
                                <div style={{ width: '56px', height: '56px', borderRadius: '14px', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', fontWeight: 900, color: 'var(--tx-muted)', flexShrink: 0 }}>
                                    {(openStudent.name || openStudent.usn || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>{openStudent.name}</h2>
                                    <div style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--tx-muted)' }}>{openStudent.usn} · {openStudent.branch || '—'} · Sem {openStudent.semester || '—'}</div>
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        {openStudent.cgpa != null && <span style={{ fontSize: '12px', fontWeight: 800, color: 'var(--primary)' }}>CGPA {openStudent.cgpa?.toFixed(2)}</span>}
                                        <span style={{ fontSize: '12px', fontWeight: 700, padding: '2px 10px', borderRadius: '6px', background: openStudent.total_backlogs > 0 ? 'var(--red-bg)' : 'var(--green-bg)', color: openStudent.total_backlogs > 0 ? 'var(--red)' : 'var(--green)' }}>
                                            {openStudent.total_backlogs > 0 ? `${openStudent.total_backlogs} Backlogs` : 'All Clear ✓'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                <button onClick={scrapeInDrawer} disabled={drawerScrapeStatus === 'scraping'} style={btn('ghost')}>
                                    <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                                    {drawerScrapeStatus === 'scraping' ? 'Fetching…' : drawerScrapeStatus === 'queued' ? 'Queued ✓' : 'Fetch VTU'}
                                </button>
                                <button onClick={() => deleteStudentEntirely(openStudent.usn, openStudent.name)} style={{ ...btn('danger'), fontSize: '12px', padding: '8px 14px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>delete_forever</span>
                                    Delete Student
                                </button>
                                <button onClick={() => setOpenStudent(null)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}>
                                    <span className="material-icons-round" style={{ fontSize: '26px' }}>close</span>
                                </button>
                            </div>
                        </div>

                        {/* Drawer Tabs */}
                        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-low)', borderRadius: '10px', padding: '4px', flexShrink: 0 }}>
                            {[
                                { id: 'marks', label: 'All Marks', icon: 'school' },
                                { id: 'semesters', label: 'Semester Analysis', icon: 'auto_graph' },
                                { id: 'backlogs', label: `Backlogs${openStudent.total_backlogs > 0 ? ` (${openStudent.total_backlogs})` : ''}`, icon: 'warning_amber' },
                            ].map(t => (
                                <button key={t.id} onClick={() => setDrawerTab(t.id)} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: drawerTab === t.id ? 'var(--bg)' : 'transparent', color: drawerTab === t.id ? 'var(--tx-main)' : 'var(--tx-dim)', transition: 'all 0.15s' }}>
                                    <span className="material-icons-round" style={{ fontSize: '14px', color: t.id === 'backlogs' && openStudent.total_backlogs > 0 ? 'var(--red)' : 'inherit' }}>{t.icon}</span>
                                    <span style={{ color: t.id === 'backlogs' && openStudent.total_backlogs > 0 ? 'var(--red)' : 'inherit' }}>{t.label}</span>
                                </button>
                            ))}
                        </div>

                        {/* Drawer Content */}
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
                        {loadingDrawer ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>Loading marks…</div>
                            : drawerTab === 'semesters' ? (
                                <SemesterResults marks={studentMarks} scheme={openStudent.scheme || '2022'} />
                            )
                            : drawerTab === 'backlogs' ? (() => {
                                const FAIL_GRADES = new Set(['F', 'X', 'NE', 'W', 'FAIL', 'ABSENT', 'A']);
                                const backlogs = studentMarks.filter(m => FAIL_GRADES.has((m.grade || 'F').toUpperCase()));
                                if (backlogs.length === 0) return (
                                    <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '48px', color: 'var(--green)', marginBottom: '12px', display: 'block' }}>check_circle</span>
                                        <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--green)' }}>No Backlogs!</div>
                                        <div style={{ fontSize: '13px', color: 'var(--tx-dim)', marginTop: '4px' }}>This student has cleared all subjects.</div>
                                    </div>
                                );
                                const bySubj = {};
                                backlogs.forEach(m => { const key = m.subject_code || m.subject_name; if (!bySubj[key]) bySubj[key] = []; bySubj[key].push(m); });
                                return (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
                                        {Object.entries(bySubj).map(([code, rows]) => (
                                            <div key={code} style={{ background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '12px', padding: '14px 16px' }}>
                                                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--red)', marginBottom: '4px' }}>{rows[0].subject_name || code}</div>
                                                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-dim)', marginBottom: '8px' }}>{code}</div>
                                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                                                    {rows.map((r, i) => (
                                                        <div key={i} style={{ fontSize: '12px' }}>
                                                            <span style={{ color: 'var(--tx-dim)' }}>Sem {r.semester} · </span>
                                                            <span style={{ fontWeight: 700, color: 'var(--red)' }}>Grade: {r.grade || 'F'}</span>
                                                            {r.total != null && <span style={{ color: 'var(--tx-muted)' }}> · Total: {r.total}</span>}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()
                            : Object.keys(groupedDrawerMarks).length === 0
                                ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>No marks synced yet. Click "Fetch VTU" to load data.</div>
                                : Object.entries(groupedDrawerMarks).sort(([a], [b]) => a - b).map(([sem, marks]) => {
                                    const excludeGrades = new Set(['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE']);
                                    let tc = 0, tcp = 0;
                                    marks.forEach(m => {
                                        const g = (m.grade || 'F').toUpperCase();
                                        if (excludeGrades.has(g)) return;
                                        const cr = m.credits || 3;
                                        let gp = 0;
                                        const unified = ['O','S','A+','B+','B','C','P','PASS'].includes(g) ? 'P' : g;
                                        if (unified === 'P') {
                                            const tot = m.total || 0;
                                            if (tot >= 90) gp = 10;
                                            else if (tot >= 80) gp = 9;
                                            else if (tot >= 70) gp = 8;
                                            else if (tot >= 60) gp = 7;
                                            else if (tot >= 55) gp = 6;
                                            else if (tot >= 50) gp = 5;
                                            else if (tot >= 40) gp = 4;
                                        }
                                        tc += cr;
                                        tcp += gp * cr;
                                    });
                                    const sgpa = tc > 0 ? (tcp / tc).toFixed(2) : '—';
                                    return (
                                    <div key={sem}>
                                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                                            <span>Semester {sem}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700 }}>
                                                {tc > 0 ? `SGPA ${sgpa}` : ''}
                                            </span>
                                        </div>
                                        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '20px' }}>
                                        <table style={{ width: '100%', minWidth: '520px', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                                            <thead><tr>{['Subject', 'CIE', 'SEE', 'Total', 'Grade'].map(h => <th key={h} style={{ ...S.th, padding: '8px 14px' }}>{h}</th>)}</tr></thead>
                                            <tbody>
                                                {marks.map(m => {
                                                    const g = (m.grade || 'F').toUpperCase();
                                                    const isFail = ['F', 'A', 'X', 'NE', 'W'].includes(g);
                                                    const gradeLabel = g === 'A' ? 'A' : g === 'X' ? 'X' : g === 'NE' ? 'NE' : g === 'W' ? 'W' : g === 'F' ? 'F' : 'P';
                                                    const gradeColor = g === 'A' || g === 'X' || g === 'NE' ? '#6b7280' : isFail ? 'var(--red)' : 'var(--green)';
                                                    const gradeBg = g === 'A' || g === 'X' || g === 'NE' ? 'rgba(107,114,128,0.15)' : isFail ? 'var(--red-bg)' : 'var(--green-bg)';
                                                    return (
                                                    <tr key={m.id || m.subject_code}>
                                                        <td style={{ ...S.td, padding: '10px 14px' }}>
                                                            <div style={{ fontWeight: 700, fontSize: '12px' }}>{m.subject_name}</div>
                                                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{m.subject_code}</div>
                                                        </td>
                                                        <td style={{ ...S.td, textAlign: 'center', padding: '10px 14px' }}>{m.internal ?? m.cie_marks ?? '—'}</td>
                                                        <td style={{ ...S.td, textAlign: 'center', padding: '10px 14px' }}>{m.external ?? m.see_marks ?? '—'}</td>
                                                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 800, padding: '10px 14px' }}>{m.total ?? m.total_marks ?? '—'}</td>
                                                        <td style={{ ...S.td, textAlign: 'center', padding: '10px 14px' }}>
                                                            <span style={{ padding: '3px 8px', borderRadius: '6px', fontWeight: 800, fontSize: '11px', background: gradeBg, color: gradeColor }}>{gradeLabel}</span>
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                        </div>
                                    </div>
                                    );
                                })
                        }
                        </div>
                    </div>
                </>
            )}


            {/* ── Unified Add Students Modal ── */}
            {showAddModal && <div style={S.modal} onClick={() => setShowAddModal(false)}>
                <div style={S.mbox('540px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Add Students</h3>
                            <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>to {selectedClass?.name}</p>
                        </div>
                        <button onClick={() => setShowAddModal(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                            <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                        </button>
                    </div>

                    {/* Tab switcher */}
                    <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-low)', borderRadius: '10px', padding: '4px' }}>
                        {[
                            { id: 'single', label: 'Single USN', icon: 'person' },
                            { id: 'paste', label: 'Paste List', icon: 'list' },
                            { id: 'file', label: 'Upload File', icon: 'upload_file' },
                        ].map(t => (
                            <button key={t.id} onClick={() => setAddTab(t.id)} style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px', background: addTab === t.id ? 'var(--bg)' : 'transparent', color: addTab === t.id ? 'var(--tx-main)' : 'var(--tx-dim)', boxShadow: addTab === t.id ? '0 1px 4px rgba(0,0,0,0.10)' : 'none', transition: 'all 0.15s' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>{t.icon}</span>{t.label}
                            </button>
                        ))}
                    </div>

                    {/* Tab: Single USN */}
                    {addTab === 'single' && <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={S.label}>Student USN</label>
                            <input style={S.input} placeholder="e.g. 2AB23CS030" value={addUsn} onChange={e => setAddUsn(e.target.value.toUpperCase())} onKeyDown={e => e.key === 'Enter' && addStudent()} autoFocus />
                            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--tx-dim)' }}>Format: 1 digit · 2 letters · 2 digits · 2 letters · 3 digits (e.g. 2AB23CS030)</div>
                        </div>
                        {msg && <div style={{ fontSize: '12px', fontWeight: 700, color: msg.startsWith('✓') ? 'var(--green)' : 'var(--red)', padding: '8px 12px', borderRadius: '8px', background: msg.startsWith('✓') ? 'var(--green-bg)' : 'var(--red-bg)' }}>{msg}</div>}
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button style={btn('ghost')} onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button style={btn('primary')} onClick={addStudent} disabled={!addUsn.trim()}>Add Student</button>
                        </div>
                    </div>}

                    {/* Tab: Paste List */}
                    {addTab === 'paste' && <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div>
                            <label style={S.label}>USN List</label>
                            <textarea style={{ ...S.input, height: '160px', resize: 'vertical' }} placeholder={'2AB23CS001\n2AB23CS002\n2AB23CS003'} value={bulkUsns} onChange={e => setBulkUsns(e.target.value)} autoFocus />
                            <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--tx-dim)' }}>
                                {bulkUsns.split(/[\n,;\s]+/).filter(Boolean).length} USNs entered · Separate by newline, comma, or semicolon
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                            <button style={btn('ghost')} onClick={() => setShowAddModal(false)}>Cancel</button>
                            <button style={btn('primary')} onClick={addBulkStudents} disabled={!bulkUsns.trim()}>Add All</button>
                        </div>
                    </div>}

                    {/* Tab: Upload File */}
                    {addTab === 'file' && <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        <div style={{ border: '2px dashed var(--border)', borderRadius: '14px', padding: '32px 24px', textAlign: 'center', cursor: 'pointer', background: 'var(--surface-low)', transition: 'border-color 0.15s' }}
                            onClick={() => fileRef.current?.click()}
                            onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--primary)'; }}
                            onDragLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                            onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)'; const f = e.dataTransfer.files[0]; if (f) { setShowAddModal(false); handleFileImport(f); } }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '36px', color: 'var(--tx-dim)', marginBottom: '10px', display: 'block' }}>{fileLoading ? 'hourglass_top' : 'upload_file'}</span>
                            <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '4px' }}>{fileLoading ? 'Processing file…' : 'Click to browse or drag & drop'}</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>Supports CSV, Excel (.xlsx / .xls), Google Sheets export, ODS</div>
                        </div>
                        <div style={{ background: 'var(--surface-low)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>File format guide</div>
                            {[
                                ['CSV / Google Sheets export', 'Column header "USN" or "Roll No" (row 1) — or just put USNs in column A'],
                                ['Excel (.xlsx / .xls)', 'Same structure — first sheet, "USN" column or column A'],
                                ['ODS', 'LibreOffice Calc — same column structure'],
                            ].map(([fmt, desc]) => (
                                <div key={fmt} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', paddingTop: '1px', flexShrink: 0 }}>▸</span>
                                    <div><div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>{fmt}</div><div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{desc}</div></div>
                                </div>
                            ))}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button style={btn('ghost')} onClick={() => setShowAddModal(false)}>Cancel</button>
                        </div>
                    </div>}
                </div>
            </div>}

            {/* ── Import Result Summary Modal ── */}
            {showImportResult && importResult && <div style={S.modal} onClick={() => setShowImportResult(false)}>
                <div style={S.mbox('480px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)' }}>Import Complete</h3>
                    <div style={{ padding: '16px', background: 'var(--green-bg)', borderRadius: '12px', border: '1px solid var(--green)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--green)', fontSize: '15px' }}>✓ {importResult.added} student{importResult.added !== 1 ? 's' : ''} added</div>
                        <div style={{ fontSize: '12px', color: 'var(--green)', marginTop: '2px', opacity: 0.8 }}>{importResult.total} rows read · {importResult.invalid?.length || 0} invalid · {importResult.total - (importResult.invalid?.length || 0) - importResult.added} duplicates skipped</div>
                    </div>
                    {importResult.invalid?.length > 0 && (
                        <div>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--red)', marginBottom: '8px' }}>⚠ {importResult.invalid.length} invalid USNs — skipped</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto' }}>
                                {importResult.invalid.map(u => <span key={u} style={{ padding: '3px 10px', borderRadius: '8px', fontSize: '11px', fontWeight: 700, background: 'var(--red-bg)', color: 'var(--red)', fontFamily: 'monospace' }}>{u}</span>)}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '6px' }}>VTU USN format: 1AB22CS001 — must be exactly this pattern</div>
                        </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button style={btn('primary')} onClick={() => setShowImportResult(false)}>Done</button>
                    </div>
                </div>
            </div>}


            {/* ── Transfer Student Modal ── */}
            {showTransfer && transferStudent && <div style={S.modal} onClick={() => setShowTransfer(false)}>
                <div style={S.mbox('480px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Transfer Student</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>{transferStudent.name || transferStudent.usn}</div>
                                <span style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-dim)', background: 'var(--surface-low)', padding: '2px 8px', borderRadius: '6px' }}>{transferStudent.usn}</span>
                            </div>
                        </div>
                        <button onClick={() => setShowTransfer(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                            <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                        </button>
                    </div>

                    {/* Move vs Copy */}
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Transfer Mode</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {[
                                { id: 'move', label: 'Move', desc: 'Remove from this class → add to new class', icon: 'drive_file_move' },
                                { id: 'copy', label: 'Copy', desc: 'Keep in both classes', icon: 'content_copy' },
                            ].map(m => (
                                <button key={m.id} onClick={() => setTransferMode(m.id)} style={{ flex: '1 1 180px', padding: '12px', border: `2px solid ${transferMode === m.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', background: transferMode === m.id ? 'var(--surface-low)' : 'var(--bg)', textAlign: 'left', transition: 'all 0.15s' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: transferMode === m.id ? 'var(--primary)' : 'var(--tx-dim)' }}>{m.icon}</span>
                                        <span style={{ fontWeight: 800, fontSize: '13px', color: transferMode === m.id ? 'var(--primary)' : 'var(--tx-main)' }}>{m.label}</span>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', lineHeight: 1.4 }}>{m.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Class picker */}
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Destination Class</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto' }}>
                            {classes.filter(c => c.id !== selectedClass?.id).length === 0 && (
                                <div style={{ padding: '20px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No other classes available. Create another class first.</div>
                            )}
                            {classes.filter(c => c.id !== selectedClass?.id).map(c => (
                                <button key={c.id} onClick={() => setTransferTarget(c.id)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px', border: `2px solid ${transferTarget === c.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', background: transferTarget === c.id ? 'var(--surface-low)' : 'var(--bg)', textAlign: 'left', transition: 'all 0.15s' }}>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: transferTarget === c.id ? 'var(--primary)' : 'var(--tx-dim)', flexShrink: 0 }}>groups</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{c.name}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{c.branch} · Sem {c.semester} · {c.student_count ?? 0} students</div>
                                    </div>
                                    {transferTarget === c.id && <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)', flexShrink: 0 }}>check_circle</span>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Preview */}
                    {transferTarget && (
                        <div style={{ padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)', fontSize: '12px', color: 'var(--tx-muted)' }}>
                            {transferMode === 'move'
                                ? <>Will <strong style={{ color: 'var(--red)' }}>remove</strong> {transferStudent.name || transferStudent.usn} from <em>{selectedClass?.name}</em> and <strong style={{ color: 'var(--green)' }}>add</strong> to <em>{classes.find(c => c.id === transferTarget)?.name}</em>.</>
                                : <>Will <strong style={{ color: 'var(--green)' }}>add</strong> {transferStudent.name || transferStudent.usn} to <em>{classes.find(c => c.id === transferTarget)?.name}</em> while keeping them in <em>{selectedClass?.name}</em>.</>}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button style={btn('ghost')} onClick={() => setShowTransfer(false)}>Cancel</button>
                        <button style={btn('primary')} onClick={doTransfer} disabled={!transferTarget || transferLoading}>
                            {transferLoading ? 'Processing…' : transferMode === 'move' ? 'Move Student' : 'Copy to Class'}
                        </button>
                    </div>
                </div>
            </div>}

            {/* ── Fetch All VTU URL Selector Modal ── */}
            {showUrlModal && <div style={S.modal} onClick={() => setShowUrlModal(false)}>

                <div style={S.mbox('600px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                        <div>
                            <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Choose VTU Portals</h3>
                            <p style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>Enable the portals to scrape. Your settings only affect your account.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <button style={{ ...btn('ghost'), fontSize: '11px', padding: '6px 12px' }} onClick={() => toggleAllUrls(true)}>Enable All</button>
                            <button style={{ ...btn('ghost'), fontSize: '11px', padding: '6px 12px' }} onClick={() => toggleAllUrls(false)}>Disable All</button>
                        </div>
                    </div>
                    {loadingUrls ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--tx-dim)' }}>Loading URLs…</div>
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto' }}>
                            {vtuUrls.map(u => (
                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '10px', border: `1px solid ${u.is_active ? 'var(--primary)' : 'var(--border)'}` }}>
                                    <button onClick={() => toggleUrl(u)} style={{ flexShrink: 0, width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}>
                                        <span style={{ width: '36px', height: '20px', borderRadius: '10px', background: u.is_active ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative' }}>
                                            <span style={{ position: 'absolute', top: '2px', left: u.is_active ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
                                        </span>
                                    </button>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>{u.exam_name || 'Unnamed'}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.url}</div>
                                    </div>
                                </div>
                            ))}
                        </div>}
                    {/* Add new URL */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '8px', textTransform: 'uppercase' }}>Add Custom URL</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <input style={{ ...S.input, flex: 2, minWidth: '160px' }} placeholder="https://results.vtu.ac.in/..." value={newUrlInput.url} onChange={e => setNewUrlInput(p => ({ ...p, url: e.target.value }))} />
                            <input style={{ ...S.input, flex: 1, minWidth: '120px' }} placeholder="Exam name" value={newUrlInput.exam_name} onChange={e => setNewUrlInput(p => ({ ...p, exam_name: e.target.value }))} />
                            <button style={{ ...btn('primary'), flex: '0 0 auto' }} onClick={addNewUrl}>Add</button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: '12px', color: 'var(--tx-dim)', display: 'flex', alignItems: 'center' }}>{vtuUrls.filter(u => u.is_active).length} of {vtuUrls.length} active</div>
                        <button style={btn('ghost')} onClick={() => setShowUrlModal(false)}>Cancel</button>
                        <button style={btn('primary')} onClick={fetchAllVtu}>Fetch with Active URLs ({vtuUrls.filter(u => u.is_active).length})</button>
                    </div>
                </div>
            </div>}

            {/* Full List Drawer */}
            {viewingList && (
                <>
                    <div style={{...S.overlay, zIndex: 2000}} onClick={() => setViewingList(null)} />
                    <div style={{...S.drawer, zIndex: 2010, padding: 'max(var(--space-6), env(safe-area-inset-top)) 24px max(var(--space-6), env(safe-area-inset-bottom))', maxWidth: '800px'}} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid var(--border)', paddingBottom: '16px', marginBottom: '8px', gap: '12px' }}>
                            <div>
                                <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>{viewingList.title}</h3>
                                <p style={{ margin: 0, fontSize: '12px', color: 'var(--tx-muted)' }}>{viewingList.data.length} Students</p>
                            </div>
                            <button onClick={() => setViewingList(null)} aria-label="Close" style={{ background: 'var(--surface-low)', border: 'none', borderRadius: '50%', color: 'var(--tx-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                            </button>
                        </div>
                        
                        <div style={{ overflow: 'auto', flex: 1, minHeight: 0, WebkitOverflowScrolling: 'touch' }}>
                            <table style={{ width: '100%', minWidth: viewingList.showMarks ? '620px' : '360px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '10px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', width: '40px' }}>Rank</th>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '10px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Student</th>
                                        {viewingList.showMarks && <>
                                            <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '10px', color: 'var(--tx-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>CIE</th>
                                            <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '10px', color: 'var(--tx-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>SEE</th>
                                        </>}
                                        <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '10px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{viewingList.type}</th>
                                        {viewingList.showMarks && <th style={{ padding: '12px 8px', textAlign: 'center', fontSize: '10px', color: 'var(--tx-dim)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Result</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewingList.data.map((r, i) => {
                                        const isFail = r.grade && ['F', 'A', 'X', 'NE', 'W', 'FAIL'].includes(r.grade);
                                        const gradeLabel = r.grade === 'A' ? 'A (Absent)' : r.grade === 'X' ? 'X (Not Eligible)' : r.grade === 'NE' ? 'NE' : r.grade === 'W' ? 'W (Withheld)' : r.grade === 'F' ? 'FAIL' : r.grade === 'P' ? 'PASS' : r.grade || '—';
                                        return (
                                            <tr key={r.usn + i} style={{ transition: 'background 0.2s', ...((i % 2 === 0) ? { background: 'var(--surface-low)' } : {}) }} onMouseEnter={e => e.currentTarget.style.background = 'var(--bg)'} onMouseLeave={e => e.currentTarget.style.background = (i % 2 === 0) ? 'var(--surface-low)' : 'transparent'}>
                                                <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)' }}>#{i + 1} {MEDALS[i] || ''}</td>
                                                <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '13px', fontWeight: 800, color: isFail ? 'var(--red)' : 'var(--tx-main)' }}>{r.name}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontFamily: 'monospace' }}>{r.usn}</div>
                                                </td>
                                                {viewingList.showMarks && <>
                                                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>{r.internal ?? '—'}</td>
                                                    <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'center', fontSize: '12px', color: 'var(--tx-muted)' }}>{r.external ?? '—'}</td>
                                                </>}
                                                <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontSize: '13px', fontWeight: 900, color: isFail ? 'var(--red)' : 'var(--primary)' }}>{viewingList.type === 'SGPA' ? r.score?.toFixed(2) : r.score}</td>
                                                {viewingList.showMarks && <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'center' }}>
                                                    <span style={{ padding: '4px 10px', borderRadius: '12px', fontWeight: 900, fontSize: '10px', border: `1px solid ${isFail ? 'var(--red)' : 'var(--green)'}`, background: isFail ? 'var(--red-bg)' : 'var(--green-bg)', color: isFail ? 'var(--red)' : 'var(--green)' }}>{gradeLabel}</span>
                                                </td>}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

        </div>
    );

    // ── CLASS LIST VIEW ──────────────────────────────────────
    return (
        <div style={S.page} className="gf-fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '36px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={S.eyebrow}>Faculty Command Center</div>
                    <h1 style={S.title}>Classes</h1>
                    <p style={S.subtitle}>Create and manage classes. All faculty can view and edit class data.</p>
                </div>
                <button style={btn('primary')} onClick={() => setShowCreate(true)}>
                    <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>add</span>New Class
                </button>
            </div>

            {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

            {loadingClasses ? <div style={{ textAlign: 'center', padding: '80px', color: 'var(--tx-dim)' }}>Loading classes…</div>
                : classes.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--tx-dim)' }}>
                        <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '12px', display: 'block', opacity: 0.25 }}>groups</span>
                        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>No classes yet</div>
                        <div style={{ fontSize: '13px' }}>Create your first class to get started.</div>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '16px' }}>
                        {classes.map(cls => (
                            <div key={cls.id} className="gf-hover-lift" style={{ ...S.card, cursor: 'pointer', transition: 'transform 0.2s,box-shadow 0.2s', position: 'relative' }}>
                                <div onClick={() => selectClass(cls)} style={{ marginBottom: '16px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                                        <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span className="material-icons-round" style={{ fontSize: '22px', color: 'var(--tx-dim)' }}>groups</span>
                                        </div>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', background: 'var(--surface-low)', padding: '3px 10px', borderRadius: '6px' }}>Sem {cls.semester}</div>
                                    </div>
                                    <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.02em', marginBottom: '4px' }}>{cls.name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginBottom: '20px' }}>{cls.branch} · {cls.scheme} Scheme</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{cls.student_count ?? 0} <span style={{ fontWeight: 500, color: 'var(--tx-dim)' }}>students</span></div>
                                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>arrow_forward</span>
                                    </div>
                                </div>
                                {/* Card action buttons */}
                                
                            </div>
                        ))}
                    </div>
                )
            }

            {/* Create Class Modal */}
            {showCreate && <div style={S.modal} onClick={() => setShowCreate(false)}>
                <div style={S.mbox()} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <div><h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>New Class</h3><p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>All faculty can view and manage this class.</p></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div><label style={S.label}>Class Name</label><input style={S.input} placeholder="e.g. CSE-A 2023 Batch" value={newClass.name} onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                            <div>
                                <label style={S.label}>Branch</label>
                                <select style={S.sel} value={newClass.branch} onChange={e => setNewClass(p => ({ ...p, branch: e.target.value }))}>
                                    {branches.map(b => <option key={b.code} value={b.code}>{b.code} — {b.label}</option>)}
                                    {branches.length === 0 && <option value="CS">CSE (Default)</option>}
                                </select>
                            </div>
                            <div>
                                <label style={S.label}>Semester</label>
                                <select style={S.sel} value={newClass.semester} onChange={e => setNewClass(p => ({ ...p, semester: parseInt(e.target.value) }))}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label style={S.label}>Scheme</label>
                            <select style={S.sel} value={newClass.scheme} onChange={e => setNewClass(p => ({ ...p, scheme: e.target.value }))}>
                                {schemes.map(s => <option key={s} value={s}>{s} Scheme</option>)}
                            </select>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}><button style={btn('ghost')} onClick={() => setShowCreate(false)}>Cancel</button><button style={btn('primary')} onClick={createClass}>Create Class</button></div>
                </div>
            </div>}

            {/* Edit Semester Modal */}
            {showEditSem && <div style={S.modal} onClick={() => setShowEditSem(null)}>
                <div style={S.mbox('360px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Edit Semester</h3>
                    <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '8px' }}>{showEditSem.name}</p>
                    <div>
                        <label style={S.label}>Semester</label>
                        <select style={S.sel} value={editSemVal} onChange={e => setEditSemVal(parseInt(e.target.value))}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(s => <option key={s} value={s}>Semester {s}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        <button style={btn('ghost')} onClick={() => setShowEditSem(null)}>Cancel</button>
                        <button style={btn('primary')} onClick={() => updateClassSem(showEditSem.id, editSemVal)}>Update Semester</button>
                    </div>
                </div>
            </div>}
        </div>
    );
}

export default function ClassesPage() {
    return <AuthGuard role="faculty"><ClassesContent /></AuthGuard>;
}
