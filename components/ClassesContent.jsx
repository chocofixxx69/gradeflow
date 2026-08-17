'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
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
    mbox: (w = '480px') => ({ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-8)', width: '100%', maxWidth: w, padding: 'var(--space-7)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: '90dvh', overflowY: 'auto' }),
    tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
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
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    return extractUsnsFromWorkbook(wb);
}

function extractUsnsFromWorkbook(wb) {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (!rows.length) return [];
    const header = (rows[0] || []).map(h => String(h).trim().toLowerCase());
    const usnIdx = header.findIndex(h => ['usn','usno','university seat number','roll no','rollno','roll number'].includes(h));
    const col = usnIdx >= 0 ? usnIdx : 0;
    return rows.slice(usnIdx >= 0 ? 1 : 0)
        .map(r => String(r[col] || '').trim().toUpperCase())
        .filter(Boolean);
}

const fetchAllRows = async (table, select, filterCol, filterValues) => {
    let all = [];
    const CHUNK_SIZE = 15;
    for (let i = 0; i < filterValues.length; i += CHUNK_SIZE) {
        const chunk = filterValues.slice(i, i + CHUNK_SIZE);
        const { data, error } = await supabase.from(table).select(select).in(filterCol, chunk);
        if (error) throw error;
        all = all.concat(data || []);
    }
    return all;
};

export function ClassesContent({ embedded = false }) {
    const [faculty, setFaculty] = useState(null);
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
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
    const [newClass, setNewClass] = useState({ name: '', branch: 'CS', semester: 3, scheme: '2022' });
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
    const fileRef = useRef(null);

    useEffect(() => {
        fetchBranches();
    }, []);

    const fetchBranches = async () => {
        const { data } = await supabase.from('branches').select('*').order('label');
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

    const removeStudent = async usn => {
        if (!confirm(`Remove ${usn} from this class?`)) return;
        await fetch('/api/class-students', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ class_id: selectedClass.id, usn }) });
        await logActivity(faculty, 'CLASS_REMOVE_STUDENT', usn);
        setStudents(p => p.filter(s => s.usn !== usn)); fetchClasses();
    };

    const filteredStudents = semFilter === 'all' ? students : students.filter(s => String(s.semester) === String(semFilter));
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
                    <p style={S.subtitle}>{selectedClass.branch} · Sem {selectedClass.semester} · {selectedClass.scheme} Scheme · {students.length} students</p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button style={btn('primary')} onClick={() => { setShowAddModal(true); setAddTab('single'); setMsg(''); }}>
                        <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '6px' }}>person_add</span>Add Students
                    </button>
                    <button style={btn('danger')} onClick={() => deleteClass(selectedClass.id)}>Delete Class</button>
                </div>
            </div>

            {msg && <div style={msgBox(msg.startsWith('✓'))}>{msg}</div>}

            <div style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>Student Roster</div>
                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{filteredStudents.length} students</div>
                </div>
                {loadingStudents ? <div style={{ padding: '48px', textAlign: 'center', color: 'var(--tx-dim)' }}>Loading…</div>
                    : (
                        <div style={S.tableWrap}>
                        <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>{['#', 'Name', 'USN', 'Sem', 'CGPA', 'Backlogs', ''].map(h => <th key={h} style={S.th}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {filteredStudents.map((s, idx) => (
                                    <tr key={s.usn}>
                                        <td style={{ ...S.td, color: 'var(--tx-dim)', fontSize: '11px' }}>{idx + 1}</td>
                                        <td style={{ ...S.td, fontWeight: 800 }}>{s.name}</td>
                                        <td style={{ ...S.td, fontFamily: 'monospace', color: 'var(--tx-muted)', fontSize: '11px' }}>{s.usn}</td>
                                        <td style={{ ...S.td, textAlign: 'center' }}>{s.semester || '—'}</td>
                                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 900, color: s.cgpa ? 'var(--primary)' : 'var(--tx-dim)' }}>{s.cgpa != null ? s.cgpa?.toFixed(2) : '—'}</td>
                                        <td style={{ ...S.td, textAlign: 'center' }}>
                                            <span style={{ fontWeight: 900, color: s.total_backlogs > 0 ? 'var(--red)' : 'var(--green)', background: s.total_backlogs > 0 ? 'var(--red-bg)' : 'var(--green-bg)', padding: '3px 10px', borderRadius: '6px', fontSize: '11px' }}>
                                                {s.total_backlogs > 0 ? s.total_backlogs : 'Clear ✓'}
                                            </span>
                                        </td>
                                        <td style={{ ...S.td, textAlign: 'center' }}>
                                            <button title="Remove" onClick={() => removeStudent(s.usn)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '18px' }}>remove_circle_outline</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    )}
            </div>
        </div>
    );

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
