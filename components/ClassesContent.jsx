'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../lib/api/client';
import { useRouter } from 'next/navigation';
import { parseClassUsns } from '../lib/class-usn-import';
import { recordFacultyAction } from '../lib/api/faculty-action';

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
    modal: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(12px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-4), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left))', overflowY: 'auto' },
    mbox: (w = '480px') => ({ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-8)', width: '100%', maxWidth: w, padding: 'var(--space-7)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxHeight: 'calc(100dvh - max(var(--space-8), env(safe-area-inset-top) + env(safe-area-inset-bottom)))', overflowY: 'auto' }),
    tableWrap: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' },
    drawer: { position: 'fixed', top: 0, right: 0, bottom: 0, width: '100%', maxWidth: '720px', background: 'var(--surface)', borderLeft: '1px solid var(--border)', zIndex: 1100, overflowY: 'hidden', padding: 'max(var(--space-6), env(safe-area-inset-top)) clamp(var(--space-6),4vw,var(--space-9)) max(var(--space-6), env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', boxShadow: 'var(--shadow-lg)' },
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)', zIndex: 1050 },
};
const btn = (v = 'primary') => ({ padding: '10px 20px', borderRadius: 'var(--radius-4)', fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit', border: 'none', background: v === 'primary' ? 'var(--primary)' : v === 'danger' ? 'var(--red-bg)' : 'var(--surface-low)', color: v === 'primary' ? 'var(--bg)' : v === 'danger' ? 'var(--red)' : 'var(--tx-main)', ...(v !== 'primary' && { border: `1px solid ${v === 'danger' ? 'var(--red)' : 'var(--border)'}` }) });
const msgBox = ok => ({ padding: '10px 16px', borderRadius: 'var(--radius-4)', marginBottom: 'var(--space-4)', fontSize: '13px', fontWeight: 700, background: ok ? 'var(--green-bg)' : 'var(--surface-low)', color: ok ? 'var(--green)' : 'var(--tx-muted)', border: `1px solid ${ok ? 'var(--green)' : 'var(--border)'}` });



export function ClassesContent({ embedded = false }) {
    const [faculty, setFaculty] = useState(null);
    const [classes, setClasses] = useState([]);
    const [loadingClasses, setLoadingClasses] = useState(true);
    const [selectedClass, setSelectedClass] = useState(null);
    const [students, setStudents] = useState([]);
    const [loadingStudents, setLoadingStudents] = useState(false);
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
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
        const data = await apiRequest('/api/system/meta').catch(() => null);
        if (data?.branches) setBranches(data.branches);
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
        
        let facId = faculty?.id || faculty?.sub;
        if (!facId) {
            try {
                const facSess = localStorage.getItem('faculty_session') || localStorage.getItem('admin_session');
                if (facSess) {
                    const parsed = JSON.parse(facSess);
                    facId = parsed.id || parsed.sub;
                }
            } catch (e) {}
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
            setNewClass({ name: '', branch: 'CS', semester: 3, scheme: '2022' });
            setMsg('✓ Class created.');
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
                let startIdx = 0;
                const firstLine = lines[0].toLowerCase();
                const hasHeader = firstLine.includes('usn') || firstLine.includes('name');
                if (hasHeader) startIdx = 1;

                for (let i = startIdx; i < lines.length; i++) {
                    const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
                    if (cols.length > 0 && cols[0]) {
                        const usn = cols[0].toUpperCase();
                        const name = cols[1] || usn;
                        const semester = cols[2] ? parseInt(cols[2]) : null;
                        const branch = cols[3] || null;
                        if (usn) parsed.push({ usn, name, semester, branch });
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
                            {!isMobile ? (
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
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                                    {filteredStudents.map((s, idx) => (
                                        <div key={s.usn} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {idx + 1}. {s.name}
                                                </div>
                                                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                    {s.usn} · Sem {s.semester || '—'}
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' }}>
                                                    <span style={{ fontWeight: 800, fontSize: '11px', color: s.cgpa ? 'var(--primary)' : 'var(--tx-dim)' }}>
                                                        CGPA: {s.cgpa != null ? s.cgpa?.toFixed(2) : '—'}
                                                    </span>
                                                    <span style={{ fontWeight: 800, color: s.total_backlogs > 0 ? 'var(--red)' : 'var(--green)', background: s.total_backlogs > 0 ? 'var(--red-bg)' : 'var(--green-bg)', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>
                                                        {s.total_backlogs > 0 ? `${s.total_backlogs} Backlog` : 'Clear ✓'}
                                                    </span>
                                                </div>
                                            </div>
                                            <button title="Remove" onClick={() => removeStudent(s.usn)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', flexShrink: 0 }}>
                                                <span className="material-icons-round" style={{ fontSize: '20px' }}>remove_circle_outline</span>
                                            </button>
                                        </div>
                                    ))}
                                    {filteredStudents.length === 0 && <div style={{ padding: '24px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No students in roster.</div>}
                                </div>
                            )}
                        </div>
                    )}
            </div>

            {/* Add Students Modal */}
            {showAddModal && selectedClass && (
                <div style={S.modal} onClick={() => setShowAddModal(false)}>
                    <div style={S.mbox('620px')} onClick={e => e.stopPropagation()} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                            <div>
                                <h3 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '4px' }}>Add Students to {selectedClass.name}</h3>
                                <p style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>Import students manually or bulk upload via CSV file.</p>
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
                </div>
            )}
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
