'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';
import { useRouter } from 'next/navigation';

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
    subtitle: { fontSize: '13px', color: 'var(--tx-muted)', marginBottom: 'var(--space-6)' },
    card: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-7)', padding: 'var(--space-6)' },
    input: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', padding: '10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' },
    sel: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)', padding: '10px 14px', fontSize: '14px', color: 'var(--tx-main)', fontWeight: 600, outline: 'none', fontFamily: 'inherit', width: '100%' },
    label: { display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.06em' },
    th: { padding: '10px var(--space-4)', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: 'left' },
    td: { padding: '13px var(--space-4)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 600, color: 'var(--tx-main)' },
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--space-5)' },
    mbox: (w = '480px') => ({ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-8)', width: '100%', maxWidth: w, padding: 'var(--space-7)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: '90vh', overflowY: 'auto' }),
    drawer: { position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '720px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 1100, overflowY: 'hidden', padding: '40px clamp(var(--space-6),4vw,var(--space-9))', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', boxShadow: 'var(--shadow-lg)' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 1050 },
};
const btn = (v = 'primary') => ({ padding: '10px 20px', borderRadius: 'var(--radius-4)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: v === 'primary' ? 'var(--primary)' : v === 'danger' ? 'var(--red-bg)' : 'var(--surface-low)', color: v === 'primary' ? 'var(--bg)' : v === 'danger' ? 'var(--red)' : 'var(--tx-main)', ...(v !== 'primary' && { border: `1px solid ${v === 'danger' ? 'var(--red)' : 'var(--border)'}` }) });
const msgBox = ok => ({ padding: '10px 16px', borderRadius: 'var(--radius-4)', marginBottom: 'var(--space-4)', fontSize: '13px', fontWeight: 700, background: ok ? 'var(--green-bg)' : 'var(--surface-low)', color: ok ? 'var(--green)' : 'var(--tx-muted)', border: `1px solid ${ok ? 'var(--green)' : 'var(--border)'}` });

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

// Helper to fetch without PostgREST limits by chunking the filterValues
const fetchAllRows = async (table, select, filterCol, filterValues) => {
    let all = [];
    const CHUNK_SIZE = 15; // 15 USNs per request to avoid URL length & row limits
    for (let i = 0; i < filterValues.length; i += CHUNK_SIZE) {
        const chunk = filterValues.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase.from(table).select(select).in(filterCol, chunk);
        if (error) throw error;
        all = all.concat(data || []);
    }
    return all;
};

// ══════════════════════════════════════════════════════════
export function ClassesContent({ embedded = false }) {
    const [faculty, setFaculty] = useState(null);
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const router = useRouter();
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
        const s = localStorage.getItem('admin_session');
        if (s) setFaculty(JSON.parse(s));
        fetchClasses();
    }, []);

    const fetchClasses = async () => {
        setLoadingClasses(true);
        try { const r = await fetch('/api/classes', { credentials: 'include' }); const j = await r.json(); if (j.success) setClasses(j.classes || []); } finally { setLoadingClasses(false); }
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
                const usns = studs.map(s => s.usn);
                const marks = await fetchAllRows('subject_marks', 'usn,subject_code,subject_name,total,semester', 'usn', usns);
                if (marks?.length) {
                    setAllMarks(marks);
                    const parsedSem = Number(cls.semester) || 1;
                    const sems = Array.from({ length: parsedSem }, (_, i) => i + 1);
                    setAvailableSems(sems);
                    const last = sems[sems.length - 1];
                    setSelectedSem(last);
                    
                    const remarks = await fetchAllRows('academic_remarks', 'student_usn,semester,sgpa', 'student_usn', usns);
                    computeToppers(marks, studs, last, remarks || []);
                }
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

        // Compute Semester Toppers (Top 5 & Full List)
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

    const resetPassword = async () => {
        if (!openStudent) return;
        if (!confirm(`Reset credentials for ${openStudent.name || openStudent.usn}? They will need to activate again.`)) return;
        const { error } = await supabase.from('students').update({ password_hash: null, recovery_pin: null }).eq('usn', openStudent.usn);
        if (error) alert('Failed to reset.');
        else alert('✓ Reset successful. Student must re-activate.');
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
    const filteredStudents = semFilter === 'all' ? students : students.filter(s => String(s.semester) === String(semFilter));
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <button onClick={() => setSelectedClass(null)} style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>Classes
                </button>
                <span style={{ color: 'var(--tx-dim)' }}>›</span>
                {editingName ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <input style={{ ...S.input, width: '240px', padding: '6px 12px' }} value={editName} onChange={e => setEditName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') renameClass(); if (e.key === 'Escape') setEditingName(false); }} autoFocus />
                        <button onClick={renameClass} style={btn('primary')}>✓</button>
                        <button onClick={() => setEditingName(false)} style={btn('ghost')}>✕</button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>{selectedClass.name}</span>
                        <button onClick={() => { setEditName(selectedClass.name); setEditingName(true); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', padding: '2px' }}>
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button style={btn('primary')} onClick={() => { setShowAddModal(true); setAddTab('single'); setMsg(''); }}>
                        <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>person_add</span>Add Students
                    </button>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.ods" style={{ display: 'none' }} onChange={e => { if (e.target.files[0]) handleFileImport(e.target.files[0]); }} />
                    <button style={btn('ghost')} onClick={() => { loadVtuUrls(); setShowUrlModal(true); }} disabled={students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>cloud_download</span>Fetch All VTU
                    </button>
                    <button style={btn('danger')} onClick={() => deleteClass(selectedClass.id)}>Delete Class</button>
                </div>

            </div>

            {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

            {/* Stat cards */}
            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginBottom: '28px' }}>
                {[
                    { label: 'Students', val: students.length, color: 'var(--tx-main)' },
                    { label: 'Avg CGPA', val: avgCgpa, color: 'var(--primary)' },
                    { label: 'Backlogs', val: totalBacklogs, color: totalBacklogs > 0 ? 'var(--red)' : 'var(--green)' },
                ].map(st => (
                    <div key={st.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px', flex: 1, minWidth: '130px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>{st.label}</div>
                        <div style={{ fontSize: '28px', fontWeight: 900, color: st.color, letterSpacing: '-0.04em' }}>{st.val}</div>
                    </div>
                ))}
                {classTopper && (
                    <div style={{ background: 'linear-gradient(135deg,var(--surface),var(--surface-low))', border: '1px solid var(--primary)', borderRadius: '14px', padding: '20px', flex: 2, minWidth: '200px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>🏆 Class Topper</div>
                        <div style={{ fontSize: '17px', fontWeight: 900, color: 'var(--tx-main)' }}>{classTopper.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>{classTopper.usn} · CGPA {classTopper.cgpa?.toFixed(2)}</div>
                    </div>
                )}
            </div>

            {/* Sub-Tabs */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
                <button onClick={() => setClassTab('roster')} style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: classTab === 'roster' ? 'var(--primary)' : 'transparent', color: classTab === 'roster' ? 'var(--bg)' : 'var(--tx-muted)' }}>Student Roster</button>
                <button onClick={() => setClassTab('analytics')} style={{ padding: '8px 16px', borderRadius: '8px', fontWeight: 800, fontSize: '13px', cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: classTab === 'analytics' ? 'var(--primary)' : 'transparent', color: classTab === 'analytics' ? 'var(--bg)' : 'var(--tx-muted)' }}>Class Analytics & Rankings</button>
            </div>

            {classTab === 'analytics' && (
                <div className="gf-fade-up">
                    {/* Top 10 bar */}
            {top10.length > 1 && (
                <div style={{ ...S.card, padding: '16px 20px', marginBottom: '24px', overflowX: 'auto' }}>
                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Top 10 Rankers</div>
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

            {/* Subject & Semester Toppers */}
            {(subjectToppers.length > 0 || semToppers.length > 0) && (
                <div style={{ ...S.card, marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>📚 Sem {selectedSem} Toppers (Overall & Subjects)</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {availableSems.map(s => (
                                <button key={s} onClick={async () => { 
                                    setSelectedSem(s); 
                                    const remarks = await fetchAllRows('academic_remarks', 'student_usn,semester,sgpa', 'student_usn', students.map(st=>st.usn));
                                    computeToppers(allMarks, students, s, remarks || []); 
                                }} style={{ padding: '4px 12px', borderRadius: '8px', fontWeight: 800, fontSize: '11px', cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: selectedSem === s ? 'var(--primary)' : 'var(--surface-low)', color: selectedSem === s ? 'var(--bg)' : 'var(--tx-dim)' }}>Sem {s}</button>
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
                                <button onClick={() => setViewingList({ title: `Sem ${selectedSem} Overall Rankings`, type: semToppers[0]?.type || 'Score', data: semToppers })}   style={{ ...btn('ghost'), marginTop: '12px', fontSize: '11px', fontWeight: 800 }}>View Full List ({semToppers.length} students)</button>
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
                                        <button onClick={() => setViewingList({ title: `${t.code} - ${t.name}`, type: 'Total Marks', data: t.allScores.map(r => ({ usn: r.usn, name: r.name, score: r.total })) })} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 800, padding: '8px 0 0 0', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', borderTop: '1px dashed var(--border)', marginTop: '8px' }}>View Full List</button>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            )}
            </div>
            )}

            {classTab === 'roster' && (
                <div className="gf-fade-up">

            {/* Semester filter tabs */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {['all', ...availableSems].map(s => (
                    <button key={s} onClick={() => setSemFilter(String(s))} style={{ padding: '6px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '12px', cursor: 'pointer', border: `1px solid ${String(semFilter) === String(s) ? 'var(--primary)' : 'var(--border)'}`, fontFamily: 'inherit', background: String(semFilter) === String(s) ? 'var(--primary)' : 'var(--surface-low)', color: String(semFilter) === String(s) ? 'var(--bg)' : 'var(--tx-muted)' }}>
                        {s === 'all' ? 'All Students' : `Sem ${s}`}
                    </button>
                ))}
            </div>

            {/* Roster */}
            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>Student Roster</div>
                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{filteredStudents.length} students</div>
                </div>
                {loadingStudents ? <div style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>Loading…</div>
                    : filteredStudents.length === 0 ? <div style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students{semFilter !== 'all' ? ` in Sem ${semFilter}` : '. Add students above.'}.</div>
                        : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr>{['#', 'Name', 'USN', 'Sem', 'CGPA', 'Backlogs', 'Fetch VTU', 'Transfer', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {filteredStudents.map((s, idx) => {
                                            const sc = scrapeStatus[s.usn];
                                            return (
                                                <tr key={s.usn} onClick={() => openStudentDrawer(s)} style={{ cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                    <td style={{ ...S.td, color: 'var(--tx-dim)', fontSize: '11px' }}>{idx + 1}</td>
                                                    <td style={{ ...S.td, fontWeight: 800 }}>{s.name}</td>
                                                    <td style={{ ...S.td, fontFamily: 'monospace', color: 'var(--tx-muted)', fontSize: '11px' }}>{s.usn}</td>
                                                    <td style={{ ...S.td, textAlign: 'center' }}>{s.semester || '—'}</td>
                                                    <td style={{ ...S.td, textAlign: 'center', fontWeight: 900, color: s.cgpa ? 'var(--primary)' : 'var(--tx-dim)' }}>{s.cgpa != null ? s.cgpa?.toFixed(2) : '—'}</td>
                                                    <td style={{ ...S.td, textAlign: 'center' }}>
                                                        <span style={{ fontWeight: 900, color: s.total_backlogs > 0 ? 'var(--red)' : 'var(--green)', background: s.total_backlogs > 0 ? 'var(--red-bg)' : 'var(--green-bg)', padding: '3px 10px', borderRadius: '6px', fontSize: '11px', whiteSpace: 'nowrap' }}>
                                                            {s.total_backlogs > 0 ? s.total_backlogs : 'Clear ✓'}
                                                        </span>
                                                    </td>
                                                    <td style={{ ...S.td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <button onClick={() => scrapeStudent(s.usn)} disabled={sc === 'scraping'} style={{ padding: '5px 12px', borderRadius: '8px', fontWeight: 700, fontSize: '11px', cursor: 'pointer', border: 'none', fontFamily: 'inherit', background: sc === 'queued' ? 'var(--green-bg)' : sc === 'error' ? 'var(--red-bg)' : 'var(--surface-low)', color: sc === 'queued' ? 'var(--green)' : sc === 'error' ? 'var(--red)' : 'var(--tx-muted)' }}>
                                                            {sc === 'scraping' ? '…' : sc === 'queued' ? 'Queued ✓' : sc === 'error' ? 'Error' : 'Fetch VTU'}
                                                        </button>
                                                    </td>
                                                    <td style={{ ...S.td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <button title="Transfer to another class" onClick={e => openTransfer(s, e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>swap_horiz</span>
                                                        </button>
                                                    </td>
                                                    <td style={{ ...S.td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <button title="Remove from class" onClick={() => removeStudent(s.usn)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>remove_circle_outline</span>
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                </div>
            </div>
            )}

            {/* ── Student Drawer ── */}
            {openStudent && (
                <>
                    <div style={S.overlay} onClick={() => setOpenStudent(null)} />
                    <div style={S.drawer} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                <div style={{ width: '64px', height: '64px', borderRadius: '16px', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', fontWeight: 900, color: 'var(--tx-muted)', flexShrink: 0 }}>
                                    {(openStudent.name || openStudent.usn || '?')[0].toUpperCase()}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em' }}>{openStudent.name || 'Student'}</h2>
                                    <div style={{ fontSize: '13px', color: 'var(--tx-muted)', fontFamily: 'monospace' }}>
                                        {openStudent.usn} · {openStudent.branch || 'Unassigned'} · Sem {openStudent.semester || '—'}
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                                        <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '11px', borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)' }} onClick={resetPassword}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>lock_reset</span>
                                            Reset Password
                                        </button>
                                        <button style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)' }} onClick={() => deleteStudentEntirely(openStudent.usn, openStudent.name)}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>delete_forever</span>
                                            Delete Student
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <button onClick={scrapeInDrawer} disabled={drawerScrapeStatus === 'scraping'} style={btn('ghost')}>
                                    <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                                    {drawerScrapeStatus === 'scraping' ? 'Fetching…' : 'Fetch VTU'}
                                </button>
                                <button onClick={() => setOpenStudent(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}>
                                    <span className="material-icons-round" style={{ fontSize: '28px' }}>close</span>
                                </button>
                            </div>
                        </div>

                        {/* Drawer Tabs */}
                        <div style={{ display: 'flex', gap: '4px', background: 'var(--surface-low)', padding: '4px', borderRadius: '12px', width: 'fit-content' }}>
                            {[
                                { id: 'marks', label: 'All Marks', icon: 'grade' },
                                { id: 'backlogs', label: 'Backlogs', icon: 'warning' },
                            ].map(t => (
                                <button key={t.id} onClick={() => setDrawerTab(t.id)} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', background: drawerTab === t.id ? 'var(--bg)' : 'transparent', color: drawerTab === t.id ? 'var(--tx-main)' : 'var(--tx-muted)', fontWeight: drawerTab === t.id ? 700 : 600, fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>{t.icon}</span>{t.label}
                                </button>
                            ))}
                        </div>

                        {/* Drawer Content Area */}
                        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, paddingRight: '8px' }}>
                            {loadingDrawer ? (
                                <div style={{ textAlign: 'center', padding: '100px 0', color: 'var(--tx-dim)' }}>
                                    <div className="gf-spinner" style={{ marginBottom: '16px' }} />
                                    Loading academic records…
                                </div>
                            ) : (() => {
                                const marksToShow = drawerTab === 'backlogs' 
                                    ? studentMarks.filter(m => m.grade === 'F' || m.grade === 'Ab')
                                    : studentMarks;

                                if (marksToShow.length === 0) {
                                    return (
                                        <div style={{ textAlign: 'center', padding: '100px 20px', color: 'var(--tx-dim)', background: 'var(--surface-low)', borderRadius: '24px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '12px', opacity: 0.2 }}>{drawerTab === 'backlogs' ? 'verified' : 'history_edu'}</span>
                                            <div style={{ fontSize: '16px', fontWeight: 700 }}>{drawerTab === 'backlogs' ? 'No active backlogs' : 'No records yet'}</div>
                                            <div style={{ fontSize: '13px' }}>{drawerTab === 'backlogs' ? 'This student has cleared all subjects!' : 'Click "Fetch VTU" to sync latest marks.'}</div>
                                        </div>
                                    );
                                }

                                const grouped = {};
                                marksToShow.forEach(m => {
                                    const s = m.semester || 1;
                                    if (!grouped[s]) grouped[s] = [];
                                    grouped[s].push(m);
                                });

                                return Object.entries(grouped).sort(([a], [b]) => a - b).map(([sem, marks]) => (
                                    <div key={sem} style={{ marginBottom: '32px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
                                            <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>Semester {sem}</div>
                                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', background: 'var(--primary-bg)', padding: '4px 10px', borderRadius: '8px' }}>
                                                {(() => {
                                                    let pts = 0, cr = 0;
                                                    marks.forEach(m => {
                                                        const c = m.credits || 3;
                                                        const g = { O: 10, S: 10, 'A+': 9, A: 8, 'B+': 7, B: 6, C: 5, P: 4, F: 0, Ab: 0 };
                                                        pts += (g[m.grade] || 0) * c; cr += c;
                                                    });
                                                    return cr > 0 ? `SGPA ${(pts / cr).toFixed(2)}` : 'SGPA —';
                                                })()}
                                            </div>
                                        </div>
                                        <div style={{ background: 'var(--surface-low)', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr>{['Subject', 'CIE', 'SEE', 'Total', 'Grade'].map(h => <th key={h} style={{ ...S.th, padding: '12px 16px', background: 'rgba(0,0,0,0.02)' }}>{h}</th>)}</tr>
                                                </thead>
                                                <tbody>
                                                    {marks.map((m, idx) => (
                                                        <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                                                            <td style={{ ...S.td, padding: '14px 16px' }}>
                                                                <div style={{ fontWeight: 800, fontSize: '13px' }}>{m.subject_name}</div>
                                                                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)', marginTop: '2px' }}>{m.subject_code}</div>
                                                            </td>
                                                            <td style={{ ...S.td, textAlign: 'center' }}>{m.cie_marks ?? m.internal ?? '—'}</td>
                                                            <td style={{ ...S.td, textAlign: 'center' }}>{m.see_marks ?? m.external ?? '—'}</td>
                                                            <td style={{ ...S.td, textAlign: 'center', fontWeight: 900, color: 'var(--tx-main)' }}>{m.total_marks ?? m.total ?? '—'}</td>
                                                            <td style={{ ...S.td, textAlign: 'center' }}>
                                                                <span style={{ padding: '4px 10px', borderRadius: '8px', fontWeight: 900, fontSize: '11px', background: m.grade === 'F' ? 'var(--red-bg)' : 'var(--green-bg)', color: m.grade === 'F' ? 'var(--red)' : 'var(--green)', minWidth: '28px', display: 'inline-block' }}>{m.grade}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                ));
                            })()}
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
                        <button onClick={() => setShowAddModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
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
                        <button onClick={() => setShowTransfer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                            <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                        </button>
                    </div>

                    {/* Move vs Copy */}
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '10px' }}>Transfer Mode</div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {[
                                { id: 'move', label: 'Move', desc: 'Remove from this class → add to new class', icon: 'drive_file_move' },
                                { id: 'copy', label: 'Copy', desc: 'Keep in both classes', icon: 'content_copy' },
                            ].map(m => (
                                <button key={m.id} onClick={() => setTransferMode(m.id)} style={{ flex: 1, padding: '12px', border: `2px solid ${transferMode === m.id ? 'var(--primary)' : 'var(--border)'}`, borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', background: transferMode === m.id ? 'var(--surface-low)' : 'var(--bg)', textAlign: 'left', transition: 'all 0.15s' }}>
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

                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                            <h3 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Choose VTU Portals</h3>
                            <p style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>Enable the portals to scrape. Your settings only affect your account.</p>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button style={{ ...btn('ghost'), fontSize: '11px', padding: '6px 12px' }} onClick={() => toggleAllUrls(true)}>Enable All</button>
                            <button style={{ ...btn('ghost'), fontSize: '11px', padding: '6px 12px' }} onClick={() => toggleAllUrls(false)}>Disable All</button>
                        </div>
                    </div>
                    {loadingUrls ? <div style={{ textAlign: 'center', padding: '32px', color: 'var(--tx-dim)' }}>Loading URLs…</div>
                        : <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto' }}>
                            {vtuUrls.map(u => (
                                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '10px', border: `1px solid ${u.is_active ? 'var(--primary)' : 'var(--border)'}` }}>
                                    <button onClick={() => toggleUrl(u)} style={{ flexShrink: 0, width: '36px', height: '20px', borderRadius: '10px', border: 'none', cursor: 'pointer', background: u.is_active ? 'var(--primary)' : 'var(--border)', transition: 'background 0.2s', position: 'relative' }}>
                                        <span style={{ position: 'absolute', top: '2px', left: u.is_active ? '18px' : '2px', width: '16px', height: '16px', borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
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
                            <button style={btn('primary')} onClick={addNewUrl}>Add</button>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
                    </div>
                </div>
            </div>}

            {/* Full List Modal */}
            {viewingList && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px' }} onClick={() => setViewingList(null)}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '0', width: '100%', maxWidth: '500px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 48px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-low)' }}>
                            <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)' }}>{viewingList.title}</h3>
                            <button onClick={() => setViewingList(null)} style={{ background: 'none', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', padding: '4px' }}>✕</button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1, padding: '0 24px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)' }}>
                                    <tr>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)', width: '40px' }}>Rank</th>
                                        <th style={{ padding: '12px 8px', textAlign: 'left', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>Student</th>
                                        <th style={{ padding: '12px 8px', textAlign: 'right', fontSize: '11px', color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--border)' }}>{viewingList.type}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewingList.data.map((r, i) => (
                                        <tr key={r.usn}>
                                            <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: 800, color: 'var(--tx-dim)' }}>#{i + 1} {MEDALS[i] || ''}</td>
                                            <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>{r.name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{r.usn}</div>
                                            </td>
                                            <td style={{ padding: '12px 8px', borderBottom: '1px solid var(--border)', textAlign: 'right', fontSize: '13px', fontWeight: 900, color: 'var(--primary)' }}>{viewingList.type === 'SGPA' ? r.score?.toFixed(2) : r.score}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    // ── CLASS LIST VIEW ──────────────────────────────────────
    return (
        <div style={S.page} className="gf-fade-up">
            {!embedded && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
                    <button onClick={() => router.push('/admin/terminal')} style={{ ...btn('ghost'), padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>arrow_back</span>
                        Return to Admin Terminal
                    </button>
                </div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '36px', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                    <div style={S.eyebrow}>Institutional Admin</div>
                    <h1 style={S.title}>Classes</h1>
                    <p style={S.subtitle}>Create and manage classes. All faculty and admins can view and edit class data.</p>
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
                            <div key={cls.id} onClick={() => selectClass(cls)} className="gf-hover-lift" style={{ ...S.card, cursor: 'pointer', transition: 'transform 0.2s,box-shadow 0.2s' }}>
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
                        ))}
                    </div>
                )}

            {/* Create Class Modal */}
            {showCreate && <div style={S.modal} onClick={() => setShowCreate(false)}>
                <div style={S.mbox()} onClick={e => e.stopPropagation()} className="gf-fade-up">
                    <div><h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>New Class</h3><p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>All faculty can view and manage this class.</p></div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div><label style={S.label}>Class Name</label><input style={S.input} placeholder="e.g. CSE-A 2023 Batch" value={newClass.name} onChange={e => setNewClass(p => ({ ...p, name: e.target.value }))} autoFocus /></div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}><button style={btn('ghost')} onClick={() => setShowCreate(false)}>Cancel</button><button style={btn('primary')} onClick={createClass}>Create Class</button></div>
                </div>
            </div>}
        </div>
    );
}

export default function ClassesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/terminal?tab=classes');
    }, [router]);
    return <AuthGuard role="admin"><div style={{ padding: '80px', textAlign: 'center', color: 'var(--tx-dim)' }}>Opening Classes…</div></AuthGuard>;
}
