'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../lib/api/client';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthGuard from '../../../components/AuthGuard';
import { ClassesContent } from '../../../components/ClassesContent';
import { AuditLogContent } from '../../../components/AuditLogContent';

function AdminPanelContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const applyCollapseForWidth = () => {
            setSidebarCollapsed(window.innerWidth < 1024);
        };

        applyCollapseForWidth();
        window.addEventListener('resize', applyCollapseForWidth);
        return () => window.removeEventListener('resize', applyCollapseForWidth);
    }, []);
    const initialTab = searchParams?.get('tab') || 'overview';
    const [tab, setTab] = useState(initialTab);
    const [students, setStudents] = useState([]);
    const [requests, setRequests] = useState([]);
    const [activityLogs, setActivityLogs] = useState([]);
    const [activitySearch, setActivitySearch] = useState('');
    const [activityTypeFilter, setActivityTypeFilter] = useState('all');
    const [activityDateFilter, setActivityDateFilter] = useState('all');
    const [stats, setStats] = useState({ students: 0, pending: 0, faculty: 0, totalMarks: 0, activityToday: 0 });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [actionId, setActionId] = useState(null);
    const [search, setSearch] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentDetails, setStudentDetails] = useState(null);
    const [detailTab, setDetailTab] = useState('marks');
    const [adminUser, setAdminUser] = useState(null);
    const [copiedKey, setCopiedKey] = useState(null);

    // New Student creation form
    const [showAddStudent, setShowAddStudent] = useState(false);
    const [newStudent, setNewStudent] = useState({ usn: '', name: '', branch: '', scheme: '2022', semester: 1 });
    const [addError, setAddError] = useState('');

    useEffect(() => {
        const sessionStr = localStorage.getItem('admin_session');
        if (sessionStr) {
            setAdminUser(JSON.parse(sessionStr));
        }
        loadData();
    }, []);

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const resData = await apiRequest('/api/admin/terminal/data');
            const s = resData?.students || [];
            const r = resData?.facultyOnboarding || [];
            const l = resData?.facultyActivity || [];
            const fList = resData?.facultyList || [];

            const facultyMap = {};
            fList.forEach(f => { facultyMap[f.id] = f; });
            const enrichedLogs = l.map(log => ({
                ...log,
                _faculty: facultyMap[log.faculty_id] || null,
            }));

            setStudents(s);
            setRequests(r);
            setActivityLogs(enrichedLogs);

            const todayStr = new Date().toISOString().slice(0, 10);
            const todayCount = l.filter(x => x.created_at?.startsWith(todayStr)).length;
            setStats({
                students: resData?.counts?.totalStudents || s.length,
                pending: r.filter(x => x.status === 'pending').length,
                faculty: r.filter(x => x.status === 'approved').length,
                totalMarks: resData?.counts?.totalMarksRecords || 0,
                activityToday: todayCount,
            });
        } catch (err) {
            console.error('Failed to load admin data:', err);
            setLoadError('Failed to load admin data. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    const openStudent = async (student) => {
        setSelectedStudent(student);
        setDetailTab('marks');
        try {
            const data = await apiRequest('/api/admin/terminal/data', { query: { student_id: student.id } });
            setStudentDetails({ marks: data?.marks || [], docs: data?.documents || [] });
        } catch (err) {
            console.error('Error fetching student details:', err);
            setStudentDetails({ marks: [], docs: [] });
        }
    };

    const approveRequest = async (id) => {
        setActionId(id);
        try {
            const res = await fetch('/api/admin/approve-faculty', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action: 'approve' }),
            });
            const data = await res.json();
            if (data.success) {
                await loadData();
            } else {
                alert(data.error || 'Failed to approve request.');
            }
        } catch (err) {
            console.error('Approve error:', err);
            alert('Failed to approve request.');
        } finally {
            setActionId(null);
        }
    };

    const rejectRequest = async (id) => {
        setActionId(id);
        try {
            const res = await fetch('/api/admin/approve-faculty', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action: 'reject' }),
            });
            const data = await res.json();
            if (data.success) {
                await loadData();
            } else {
                alert(data.error || 'Failed to reject request.');
            }
        } catch (err) {
            console.error('Reject error:', err);
            alert('Failed to reject request.');
        } finally {
            setActionId(null);
        }
    };

    const addStudent = async () => {
        if (!newStudent.usn || newStudent.usn.length < 5) {
            setAddError('Please enter a valid USN.'); return;
        }
        setAddError('');
        try {
            await apiRequest('/api/admin/terminal/data', {
                method: 'POST',
                body: JSON.stringify({
                    usn: newStudent.usn.toUpperCase(),
                    name: newStudent.name || newStudent.usn.toUpperCase(),
                    branch: newStudent.branch,
                    scheme: newStudent.scheme,
                    semester: newStudent.semester,
                })
            });
            setShowAddStudent(false);
            setNewStudent({ usn: '', name: '', branch: '', scheme: '2022', semester: 1 });
            await loadData();
        } catch (err) {
            console.error('Add student error:', err);
            setAddError('Failed to add student. Please check the details and try again.');
        }
    };

    const resetStudentCredentials = async () => {
        if (!selectedStudent) return;
        const confirmReset = window.confirm(`WARNING: This will reset the password and Recovery PIN for ${selectedStudent.name || selectedStudent.usn}. They will need to 'Activate' their account again. Proceed?`);
        if (!confirmReset) return;

        try {
            const { error } = await supabase
                .from('students')
                .update({ password_hash: null, recovery_pin: null })
                .eq('id', selectedStudent.id);

            if (error) throw error;

            alert(`✓ Credentials reset successfully for ${selectedStudent.usn}. They can now re-activate their account.`);
            await loadData();
            setSelectedStudent(prev => ({ ...prev, activated_at: null })); // Optionally update UI state directly
        } catch (err) {
            console.error('Reset error:', err);
            alert('❌ Failed to reset credentials.');
        }
    };

    const deleteStudentEntirely = async () => {
        if (!selectedStudent) return;
        if (!confirm(`⚠️ PERMANENTLY DELETE student ${selectedStudent.name || selectedStudent.usn} from the entire database?\n\nThis removes ALL their data: marks, profile, class enrollments.\nThis CANNOT be undone.`)) return;
        
        try {
            const r = await fetch('/api/admin/delete-student', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usn: selectedStudent.usn }) });
            const j = await r.json();
            if (j.success) {
                setSelectedStudent(null);
                alert(`✓ Student ${selectedStudent.usn} permanently deleted.`);
                await loadData();
            } else {
                alert(j.error || 'Failed to delete student.');
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('❌ Failed to delete student.');
        }
    };

    const copyKey = (key) => {
        navigator.clipboard.writeText(key);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const filtered = students.filter(s =>
        (s.usn || '').toLowerCase().includes(search.toLowerCase()) ||
        (s.name || '').toLowerCase().includes(search.toLowerCase())
    );

    // Calculate SGPA for student marks
    const GP = { 'O': 10, 'S': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'P': 4, 'F': 0, 'Ab': 0 };
    const calcSGPA = (marks) => {
        if (!marks?.length) return 0;
        let pts = 0, cr = 0;
        marks.forEach(m => {
            const c = m.credits || 3;
            pts += (GP[m.grade] || 0) * c;
            cr += c;
        });
        return cr > 0 ? (pts / cr).toFixed(2) : '0.00';
    };

    const c = {
        layout: { display: 'flex', minHeight: '100dvh', background: 'var(--bg)', fontFamily: "'Plus Jakarta Sans', sans-serif", minWidth: 0 },
        sidebar: {
            width: sidebarCollapsed ? '72px' : '260px',
            minWidth: sidebarCollapsed ? '72px' : '260px',
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            padding: sidebarCollapsed ? 'var(--space-4) var(--space-2)' : 'var(--space-6) var(--space-4)',
            display: 'flex', flexDirection: 'column',
            position: 'sticky', top: 0, height: '100dvh', overflow: 'auto',
            transition: 'all 0.2s ease-in-out',
            zIndex: 100,
        },
        logoRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-2) var(--space-1)' },
        logoBox: {
            width: '36px', height: '36px', background: 'var(--primary)',
            borderRadius: 'var(--radius-4)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '17px',
        },
        adminTag: {
            fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            padding: 'var(--space-1) var(--space-2) var(--space-4)',
        },
        sep: { height: '1px', background: 'var(--border)', margin: 'var(--space-2) 0 var(--space-4)' },
        navBtn: (active) => ({
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            width: '100%', padding: '11px 14px', borderRadius: 'var(--radius-5)',
            border: 'none', background: active ? 'var(--surface-low)' : 'transparent',
            color: active ? 'var(--tx-main)' : 'var(--tx-muted)',
            fontWeight: active ? 700 : 500, fontSize: '13px',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            transition: 'all 0.15s', marginBottom: '2px',
        }),
        main: { flex: 1, padding: 'var(--page-py) var(--page-px)', overflowY: 'auto', minWidth: 0 },
        pageLabel: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-2)' },
        pageTitle: { fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: 'var(--space-7)' },
        statGrid: {},
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: 'var(--space-6)' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-3)' },
        statVal: { fontSize: '40px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', lineHeight: 1 },
        tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-7)', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' },
        tableHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--border)', gap: 'var(--space-3)', flexWrap: 'wrap' },
        tableTitle: { fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)' },
        searchInput: {
            background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)',
            padding: '9px 14px', fontSize: '13px', color: 'var(--tx-main)',
            outline: 'none', width: 'min(240px, 100%)', fontFamily: 'inherit', fontWeight: 600, boxSizing: 'border-box',
        },
        th: { padding: '14px var(--space-6)', background: 'var(--surface-low)', fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' },
        td: { padding: '16px var(--space-6)', borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--tx-main)', fontWeight: 600, verticalAlign: 'middle' },
        badge: (status) => {
            const map = {
                pending: ['var(--amber-bg)', 'var(--amber)'],
                approved: ['var(--green-bg)', 'var(--green)'],
                rejected: ['var(--red-bg)', 'var(--red)'],
                active: ['var(--green-bg)', 'var(--green)'],
            };
            const [bg, cl] = map[status] || ['var(--surface-low)', 'var(--tx-muted)'];
            return { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: bg, color: cl };
        },
        avatar: { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: 'var(--tx-muted)', flexShrink: 0 },
        actionBtn: (filled) => ({
            padding: '7px 16px', borderRadius: 'var(--radius-3)', border: filled ? 'none' : '1px solid var(--border)',
            background: filled ? 'var(--primary)' : 'transparent',
            color: filled ? 'var(--bg)' : 'var(--tx-muted)',
            fontSize: '11px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
        }),
        overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)', paddingLeft: 'env(safe-area-inset-left)' },
        drawer: { width: 'min(100vw, 760px)', maxWidth: '760px', background: 'var(--surface)', maxHeight: '100dvh', overflowY: 'auto', padding: 'max(var(--space-6), env(safe-area-inset-top)) clamp(var(--space-5), 4vw, var(--space-9)) max(var(--space-6), env(safe-area-inset-bottom))', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-7)', boxShadow: 'var(--shadow-lg)' },
        tabRow: { display: 'flex', gap: 'var(--space-1)', background: 'var(--surface-low)', padding: 'var(--space-1)', borderRadius: 'var(--radius-5)', width: '100%', maxWidth: 'fit-content', overflowX: 'auto' },
        tabBtn: (active) => ({
            padding: '8px var(--space-5)', borderRadius: 'var(--radius-3)', border: 'none',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--tx-main)' : 'var(--tx-muted)',
            fontWeight: active ? 700 : 600, fontSize: '12px',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
        }),
        modal: {
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            padding: 'max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-4), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left))',
            overflowY: 'auto',
        },
        modalCard: {
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-8)', padding: 'clamp(var(--space-5), 4vw, var(--space-8))', width: '100%', maxWidth: '480px', maxHeight: 'calc(100dvh - max(var(--space-8), env(safe-area-inset-top) + env(safe-area-inset-bottom)))', overflowY: 'auto',
        },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-4)', padding: '11px 14px', fontSize: '14px',
            fontWeight: 600, color: 'var(--tx-main)', outline: 'none',
            fontFamily: 'inherit', marginBottom: 'var(--space-4)',
        },
    };

    const nav = [
        { id: 'overview', label: 'Overview', icon: 'space_dashboard' },
        { id: 'students', label: 'Students', icon: 'school' },
        { id: 'classes', label: 'Classes', icon: 'groups' },
        { id: 'requests', label: 'Faculty Access', icon: 'verified_user' },
        { id: 'activity', label: 'Activity Log', icon: 'history' },
        { id: 'audit', label: 'System Audit', icon: 'security' },
        { id: 'settings', label: 'Settings', icon: 'settings_suggest' },
    ];

    // ── Activity helpers ──────────────────────────────────────
    const ACTION_COLORS = {
        SCRAPE: ['var(--blue-bg)','var(--blue)'], FETCH: ['var(--blue-bg)','var(--blue)'],
        CLASS_CREATE: ['var(--green-bg)','var(--green)'], CLASS_ADD_STUDENT: ['var(--green-bg)','var(--green)'],
        CLASS_BULK_IMPORT: ['var(--green-bg)','var(--green)'], CLASS_FETCH_VTU: ['var(--blue-bg)','var(--blue)'],
        CLASS_REMOVE_STUDENT: ['var(--amber-bg)','var(--amber)'], CLASS_DELETE: ['var(--red-bg)','var(--red)'],
        DELETE_STUDENT: ['var(--red-bg)','var(--red)'], URL_TOGGLE: ['var(--surface-low)','var(--tx-muted)'],
    };
    const getActionColor = (t) => ACTION_COLORS[t] || ['var(--surface-low)','var(--tx-muted)'];

    const filteredActivity = activityLogs.filter(l => {
        const searchMatch = !activitySearch ||
            (l.faculty_name||'').toLowerCase().includes(activitySearch.toLowerCase()) ||
            (l.target_usn||'').toLowerCase().includes(activitySearch.toLowerCase()) ||
            (l.action_type||'').toLowerCase().includes(activitySearch.toLowerCase());
        const typeMatch = activityTypeFilter === 'all' || l.action_type === activityTypeFilter;
        let dateMatch = true;
        if (activityDateFilter === 'today') {
            const todayStr = new Date().toISOString().slice(0,10);
            dateMatch = (l.created_at||'').startsWith(todayStr);
        } else if (activityDateFilter === '7d') {
            const cutoff = new Date(Date.now() - 7*24*60*60*1000).toISOString();
            dateMatch = (l.created_at||'') >= cutoff;
        }
        return searchMatch && typeMatch && dateMatch;
    });
    const uniqueTypes = [...new Set(activityLogs.map(l => l.action_type).filter(Boolean))];

    // Group marks by semester for drawer
    const groupedMarks = {};
    if (studentDetails?.marks) {
        studentDetails.marks.forEach(m => {
            const sem = m.semester || 1;
            if (!groupedMarks[sem]) groupedMarks[sem] = [];
            groupedMarks[sem].push(m);
        });
    }

    return (
        <div style={c.layout}>
            {/* Sidebar */}
            <aside style={c.sidebar}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: sidebarCollapsed ? 'center' : 'space-between', padding: '0 4px', marginBottom: '8px' }}>
                    {!sidebarCollapsed ? (
                        <div style={{ ...c.logoRow, cursor: 'pointer' }} onClick={() => setTab('overview')}>
                            <div style={c.logoBox}>G</div>
                            <span style={{ fontWeight: 800, fontSize: '17px', color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>GradeFlow</span>
                        </div>
                    ) : (
                        <div style={{ ...c.logoBox, cursor: 'pointer' }} onClick={() => setTab('overview')}>G</div>
                    )}
                    <button 
                        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                        title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                        style={{ background: 'transparent', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', borderRadius: '6px' }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '20px' }}>menu</span>
                    </button>
                </div>
                {!sidebarCollapsed && <span style={c.adminTag}>Institutional Admin</span>}
                <div style={c.sep} />

                {nav.map(n => (
                    <button 
                        key={n.id} 
                        style={{ 
                            ...c.navBtn(tab === n.id), 
                            justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                            padding: sidebarCollapsed ? '12px 0' : '11px 14px' 
                        }} 
                        onClick={() => setTab(n.id)}
                        title={sidebarCollapsed ? n.label : undefined}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>{n.icon}</span>
                        {!sidebarCollapsed && <span>{n.label}</span>}
                        {n.id === 'requests' && stats.pending > 0 && (
                            <span style={{ marginLeft: sidebarCollapsed ? '0' : 'auto', background: 'var(--amber)', color: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--radius-4)', fontSize: '10px', fontWeight: 900 }}>
                                {stats.pending}
                            </span>
                        )}
                    </button>
                ))}

                <div style={{ ...c.sep, marginTop: 'auto' }} />
                {!sidebarCollapsed && (
                    <div style={{ padding: '0 8px 12px' }}>
                        <div style={{ padding: '14px', background: 'var(--surface-low)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)' }}>{adminUser?.email || 'Admin Account'}</div>
                            <div style={{ fontSize: '9px', color: 'var(--tx-dim)', textTransform: 'uppercase', marginTop: '2px', fontWeight: 700 }}>Full Access Active</div>
                        </div>
                    </div>
                )}
                <button 
                    style={{ 
                        ...c.navBtn(false), 
                        color: 'var(--red)',
                        justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                        padding: sidebarCollapsed ? '12px 0' : '11px 14px'
                    }} 
                    onClick={() => { localStorage.removeItem('admin_session'); router.push('/admin/gateway'); }}
                    title={sidebarCollapsed ? "Terminate Session" : undefined}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>logout</span>
                    {!sidebarCollapsed && <span>Terminate Session</span>}
                </button>
            </aside>

            {/* Main */}
            <main style={c.main} className="gf-fade-up">
                {loadError && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '14px 18px', borderRadius: 'var(--radius-5)', marginBottom: 'var(--space-6)', background: 'var(--red-bg)', border: '1px solid var(--red)' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)' }}>{loadError}</span>
                        <button style={c.actionBtn(false)} onClick={loadData}>
                            <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                            Retry
                        </button>
                    </div>
                )}

                {tab === 'overview' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>Institutional Overview</h1>

                    <div className="gf-stats-grid" style={{ marginBottom: '40px' }}>
                        {[
                            { label: 'Total Students', val: stats.students, icon: 'people' },
                            { label: 'Pending Access', val: stats.pending, warn: stats.pending > 0, icon: 'pending_actions' },
                            { label: 'Active Faculty', val: stats.faculty, icon: 'badge' },
                            { label: 'Academic Records', val: stats.totalMarks, icon: 'inventory_2' },
                            { label: 'Faculty Actions Today', val: stats.activityToday, icon: 'history', link: 'activity' },
                        ].map(st => (
                            <div key={st.label} style={{ ...c.statCard, cursor: st.link ? 'pointer' : 'default' }} onClick={() => st.link && setTab(st.link)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={c.statLabel}>{st.label}</div>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--tx-dim)', opacity: 0.4 }}>{st.icon}</span>
                                </div>
                                <div style={{ ...c.statVal, color: st.warn ? 'var(--amber)' : 'var(--tx-main)' }}>{loading ? '—' : st.val}</div>
                            </div>
                        ))}
                    </div>

                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div style={c.tableTitle}>Recent Registrations</div>
                            <button style={c.actionBtn(true)} onClick={() => setTab('students')}>View All Students</button>
                        </div>
                        <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>{['Student', 'USN', 'Branch', 'Scheme', 'Registered'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {students.slice(0, 5).map(s => (
                                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openStudent(s)} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={c.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={c.avatar}>{((s.name || s.usn || '?')[0]).toUpperCase()}</div>
                                                <span style={{ fontWeight: 800 }}>{s.name || 'Student'}</span>
                                            </div>
                                        </td>
                                        <td style={{ ...c.td, fontFamily: 'monospace', fontSize: '12px', color: 'var(--tx-muted)' }}>{s.usn}</td>
                                        <td style={c.td}>{s.branch || '—'}</td>
                                        <td style={c.td}>{s.scheme || '2022'}</td>
                                        <td style={{ ...c.td, color: 'var(--tx-dim)', fontSize: '12px' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
                                    </tr>
                                ))}
                                {students.length === 0 && <tr><td colSpan="5" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students registered yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>}

                {tab === 'students' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>Student Directory</h1>
                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <div style={c.tableTitle}>All Registered Students</div>
                                <button style={c.actionBtn(true)} onClick={() => setShowAddStudent(true)}>
                                    <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>add</span>
                                    Add Student
                                </button>
                            </div>
                            <input style={{ ...c.searchInput, flex: '1 1 220px' }} placeholder="Search USN or Name..." value={search} onChange={e => setSearch(e.target.value)} />
                        </div>
                        <table style={{ width: '100%', minWidth: '620px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>{['Student', 'USN', 'Semester', 'Branch', 'Status'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {filtered.map(s => (
                                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openStudent(s)} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                        <td style={c.td}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={c.avatar}>{((s.name || s.usn || '?')[0]).toUpperCase()}</div>
                                                <span style={{ fontWeight: 800 }}>{s.name || 'Student'}</span>
                                            </div>
                                        </td>
                                        <td style={{ ...c.td, fontFamily: 'monospace', color: 'var(--tx-muted)' }}>{s.usn}</td>
                                        <td style={c.td}>Sem {s.semester || '—'}</td>
                                        <td style={c.td}>{s.branch || '—'}</td>
                                        <td style={c.td}><span style={c.badge(s.activated_at ? 'active' : 'pending')}>{s.activated_at ? 'Active' : 'Awaiting'}</span></td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && <tr><td colSpan="5" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)', fontStyle: 'italic' }}>No matching students found.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>}

                {tab === 'requests' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>Faculty Onboarding</h1>
                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div style={c.tableTitle}>Verification Queue</div>
                        </div>
                        <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>{['Faculty Member', 'Employee ID', 'Department', 'Access Key', 'Action'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {requests.map(r => (
                                    <tr key={r.id}>
                                        <td style={c.td}>
                                            <div style={{ fontWeight: 800 }}>{r.full_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{r.email}</div>
                                        </td>
                                        <td style={c.td}>{r.employee_id || 'ID PENDING'}</td>
                                        <td style={c.td}>{r.department}</td>
                                        <td style={{ ...c.td, fontFamily: 'monospace', fontSize: '11px', color: 'var(--tx-muted)' }}>
                                            {r.generated_access_key ? (
                                                <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => copyKey(r.generated_access_key)}>
                                                    {r.generated_access_key}
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: copiedKey === r.generated_access_key ? '#16A34A' : 'var(--tx-dim)' }}>
                                                        {copiedKey === r.generated_access_key ? 'check' : 'content_copy'}
                                                    </span>
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={c.td}>
                                            {r.status === 'pending' ? (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button style={c.actionBtn(true)} onClick={() => approveRequest(r.id)} disabled={actionId === r.id}>
                                                        {actionId === r.id ? '...' : 'Approve'}
                                                    </button>
                                                    <button style={c.actionBtn(false)} onClick={() => rejectRequest(r.id)}>Decline</button>
                                                </div>
                                            ) : (
                                                <span style={c.badge(r.status)}>{r.status?.toUpperCase()}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {requests.length === 0 && <tr><td colSpan="5" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No faculty requests yet.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>}

                {tab === 'activity' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>Faculty Activity Log</h1>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
                        <input
                            style={{ ...c.searchInput, flex: 1, minWidth: '200px' }}
                            placeholder="Search faculty, USN, action..."
                            value={activitySearch}
                            onChange={e => setActivitySearch(e.target.value)}
                        />
                        <select
                            style={{ ...c.searchInput, width: 'auto', minWidth: '150px', flex: '1 1 150px', cursor: 'pointer' }}
                            value={activityTypeFilter}
                            onChange={e => setActivityTypeFilter(e.target.value)}
                        >
                            <option value="all">All Actions</option>
                            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select
                            style={{ ...c.searchInput, width: 'auto', minWidth: '150px', flex: '1 1 150px', cursor: 'pointer' }}
                            value={activityDateFilter}
                            onChange={e => setActivityDateFilter(e.target.value)}
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="7d">Last 7 Days</option>
                        </select>
                        <button style={c.actionBtn(false)} onClick={loadData}>
                            <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                            Refresh
                        </button>
                    </div>

                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div style={c.tableTitle}>All Faculty Actions</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 600 }}>{filteredActivity.length} records</div>
                        </div>
                        <table style={{ width: '100%', minWidth: '840px', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr>{['Timestamp', 'Faculty', 'Dept', 'Action', 'Target / Detail', 'Status'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr>
                            </thead>
                            <tbody>
                                {filteredActivity.map((log, i) => {
                                    const [bg, col] = getActionColor(log.action_type);
                                    const ts = log.created_at ? new Date(log.created_at) : null;
                                    const facultyInfo = log._faculty || {};
                                    return (
                                        <tr key={log.id || i} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={{ ...c.td, fontSize: '11px', color: 'var(--tx-dim)', whiteSpace: 'nowrap' }}>
                                                {ts ? ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                                                <div style={{ fontSize: '10px', marginTop: '2px' }}>{ts ? ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                                            </td>
                                            <td style={c.td}>
                                                <div style={{ fontWeight: 800, fontSize: '13px' }}>{log.faculty_name || facultyInfo.full_name || 'Faculty'}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{facultyInfo.email || ''}</div>
                                            </td>
                                            <td style={{ ...c.td, fontSize: '12px', color: 'var(--tx-muted)' }}>{facultyInfo.department || '—'}</td>
                                            <td style={c.td}>
                                                <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: bg, color: col }}>
                                                    {log.action_type || 'ACTION'}
                                                </span>
                                            </td>
                                            <td style={{ ...c.td, fontFamily: 'monospace', fontSize: '12px', color: 'var(--tx-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {log.target_usn || '—'}
                                            </td>
                                            <td style={c.td}>
                                                <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: log.sync_status === 'SUCCESS' ? 'var(--green-bg)' : 'var(--red-bg)', color: log.sync_status === 'SUCCESS' ? 'var(--green)' : 'var(--red)' }}>
                                                    {log.sync_status || 'OK'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {filteredActivity.length === 0 && (
                                    <tr><td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No activity logs match your filters.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
                }

                {tab === 'classes' && <ClassesContent embedded={true} />}

                {tab === 'audit' && <AuditLogContent />}

                {tab === 'settings' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>System Settings</h1>
                    <div style={{ maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                        <div style={c.statCard}>
                            <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '20px' }}>Institutional Profile</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Environment</label>
                                    <input style={{ ...c.searchInput, width: '100%' }} value="GradeFlow Intelligence" readOnly />
                                </div>
                                <div>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>Primary Region</label>
                                    <input style={{ ...c.searchInput, width: '100%' }} value="South Asia (VTU-HQ)" readOnly />
                                </div>
                            </div>
                        </div>
                        <div style={c.statCard}>
                            <h3 style={{ fontSize: '16px', fontWeight: 800, marginBottom: '20px' }}>Security & Auth</h3>
                            <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
                                Administrator access is secured with encrypted credentials and role-based access control.
                            </p>
                            
                            <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                                <label style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '8px', display: 'block' }}>System Access Token</label>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <code style={{ fontSize: '15px', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.05em' }}>GF-ADMIN-PROD</code>
                                    <button onClick={() => copyKey('GF-ADMIN-PROD')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}>
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>{copiedKey === 'GF-ADMIN-PROD' ? 'check' : 'content_copy'}</span>
                                    </button>
                                </div>
                                <div style={{ fontSize: '10px', color: 'var(--tx-muted)', marginTop: '8px' }}>Use this code at the Gateway to authenticate.</div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button style={c.actionBtn(false)} onClick={() => loadData()}>
                                    <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                                    Reload Data
                                </button>
                            </div>
                        </div>
                    </div>
                </>}
            </main>

            {/* STUDENT DETAIL DRAWER */}
            {selectedStudent && (
                <div style={c.overlay} onClick={e => { if (e.target === e.currentTarget) setSelectedStudent(null); }}>
                    <div style={c.drawer} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '20px', minWidth: 0, flex: '1 1 260px' }}>
                                <div style={{ ...c.avatar, width: '64px', height: '64px', fontSize: '22px', borderRadius: '16px' }}>
                                    {((selectedStudent.name || selectedStudent.usn || '?')[0]).toUpperCase()}
                                </div>
                                <div>
                                    <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em' }}>{selectedStudent.name || 'Student'}</h2>
                                    <div style={{ fontSize: '13px', color: 'var(--tx-muted)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                                        {selectedStudent.usn} · {selectedStudent.branch || 'Unassigned'} · Sem {selectedStudent.semester || '—'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                        Status: <span style={c.badge(selectedStudent.activated_at ? 'active' : 'pending')}>{selectedStudent.activated_at ? 'Activated' : 'Pending'}</span>
                                    </div>
                                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        <button style={{ ...c.actionBtn(false), padding: '6px 12px', fontSize: '10px', borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)' }} onClick={resetStudentCredentials}>
                                            <span className="material-icons-round" style={{ fontSize: '12px', verticalAlign: 'middle', marginRight: '4px' }}>lock_reset</span>
                                            Reset Password
                                        </button>
                                        <button style={{ ...c.actionBtn(false), padding: '6px 12px', fontSize: '10px', borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)' }} onClick={deleteStudentEntirely}>
                                            <span className="material-icons-round" style={{ fontSize: '12px', verticalAlign: 'middle', marginRight: '4px' }}>delete_forever</span>
                                            Delete Student
                                        </button>
                                    </div>
                                </div>
                            </div>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px' }} onClick={() => setSelectedStudent(null)}>
                                <span className="material-icons-round" style={{ fontSize: '28px' }}>close</span>
                            </button>
                        </div>

                        <div style={c.tabRow}>
                            {['marks', 'documents'].map(t => (
                                <button key={t} style={c.tabBtn(detailTab === t)} onClick={() => setDetailTab(t)}>
                                    {t === 'marks' ? 'Academic Records' : 'Documents'}
                                </button>
                            ))}
                        </div>

                        {detailTab === 'marks' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {Object.keys(groupedMarks).length > 0 ? (
                                    Object.entries(groupedMarks).sort(([a], [b]) => a - b).map(([sem, marks]) => (
                                        <div key={sem}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>Semester {sem}</div>
                                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)' }}>SGPA: {calcSGPA(marks)}</div>
                                            </div>
                                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                            <table style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                                                <thead>
                                                    <tr>{['Subject', 'CIE', 'SEE', 'Total', 'Grade'].map(h => <th key={h} style={{ ...c.th, padding: '10px 16px' }}>{h}</th>)}</tr>
                                                </thead>
                                                <tbody>
                                                    {marks.map(m => (
                                                        <tr key={m.id}>
                                                            <td style={{ ...c.td, padding: '12px 16px' }}>
                                                                <div style={{ fontWeight: 700, fontSize: '12px' }}>{m.subject_name}</div>
                                                                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{m.subject_code}</div>
                                                            </td>
                                                            <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center' }}>{m.cie_marks ?? m.internal ?? '—'}</td>
                                                            <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center' }}>{m.see_marks ?? m.external ?? '—'}</td>
                                                            <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center', fontWeight: 800 }}>{m.total_marks ?? m.total ?? '—'}</td>
                                                            <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center' }}>
                                                                <span style={c.badge(m.grade === 'F' ? 'rejected' : 'approved')}>{m.grade}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No marks synced for this student.</div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(studentDetails?.docs || []).map(d => (
                                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '14px', flexWrap: 'wrap' }}>
                                        <span className="material-icons-round" style={{ color: 'var(--tx-main)' }}>description</span>
                                        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                            <div style={{ fontSize: '14px', fontWeight: 800, overflowWrap: 'anywhere' }}>{d.file_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{d.file_size ? (d.file_size / 1024 / 1024).toFixed(2) + ' MB' : ''} · Added {new Date(d.created_at).toLocaleDateString()}</div>
                                        </div>
                                        {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" style={c.actionBtn(true)}>View</a>}
                                    </div>
                                ))}
                                {(!studentDetails?.docs || studentDetails.docs.length === 0) && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No documents in vault.</div>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ADD STUDENT MODAL */}
            {showAddStudent && (
                <div style={c.modal} onClick={e => { if (e.target === e.currentTarget) setShowAddStudent(false); }}>
                    <div style={c.modalCard} className="gf-fade-up">
                        <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '8px', letterSpacing: '-0.03em' }}>Add New Student</h2>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
                            Create a student profile. When this student logs in with this USN, they will connect to this record automatically.
                        </p>
                        {addError && <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px', fontSize: '12px', color: 'var(--red)', fontWeight: 600, marginBottom: '16px' }}>{addError}</div>}
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>USN *</label>
                        <input style={c.input} placeholder="e.g. 4AB22CS001" value={newStudent.usn} onChange={e => setNewStudent(p => ({ ...p, usn: e.target.value.toUpperCase() }))} />
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Student Name</label>
                        <input style={c.input} placeholder="Full Name" value={newStudent.name} onChange={e => setNewStudent(p => ({ ...p, name: e.target.value }))} />
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Branch</label>
                        <input style={c.input} placeholder="e.g. CSE, ISE, ECE" value={newStudent.branch} onChange={e => setNewStudent(p => ({ ...p, branch: e.target.value }))} />
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button style={{ ...c.actionBtn(true), padding: '12px 24px', fontSize: '13px' }} onClick={addStudent}>Create Student</button>
                            <button style={{ ...c.actionBtn(false), padding: '12px 24px', fontSize: '13px' }} onClick={() => setShowAddStudent(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminPanel() {
    return (
        <AuthGuard role="admin">
            <AdminPanelContent />
        </AuthGuard>
    );
}
