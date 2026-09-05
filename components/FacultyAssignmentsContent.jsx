'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '../lib/api/client';
import { ConfirmDialog } from './ui';

export function FacultyAssignmentsContent({ embedded = false, preselectedFacultyId = null }) {
    const [assignments, setAssignments] = useState([]);
    const [facultyList, setFacultyList] = useState([]);
    const [classesList, setClassesList] = useState([]);
    const [subjectsList, setSubjectsList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Filters
    const [search, setSearch] = useState('');
    const [filterFaculty, setFilterFaculty] = useState(preselectedFacultyId || 'all');
    const [filterBranch, setFilterBranch] = useState('all');
    const [filterSemester, setFilterSemester] = useState('all');

    // Create Modal state
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [form, setForm] = useState({
        faculty_id: preselectedFacultyId || '',
        branch: 'CS',
        semester: '3',
        scheme: '2022',
        subject_code: '',
        class_id: '',
    });

    // Delete state
    const [confirmingDelete, setConfirmingDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);

    // Sync preselected faculty if passed
    useEffect(() => {
        if (preselectedFacultyId) {
            setFilterFaculty(preselectedFacultyId);
            setForm(f => ({ ...f, faculty_id: preselectedFacultyId }));
        }
    }, [preselectedFacultyId]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Proactively align admin session cookies if admin_session is stored
            if (typeof window !== 'undefined') {
                try {
                    const admStr = localStorage.getItem('admin_session');
                    if (admStr) {
                        const adm = JSON.parse(admStr);
                        if (adm?.token) {
                            await fetch('/api/auth/session/sync', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ role: 'admin', token: adm.token, email: adm.email }),
                            }).then(r => r.json()).then(res => {
                                if (res?.sessionToken && adm.sessionToken !== res.sessionToken) {
                                    adm.sessionToken = res.sessionToken;
                                    localStorage.setItem('admin_session', JSON.stringify(adm));
                                }
                            }).catch(() => {});
                        }
                    }
                } catch {}
            }

            const res = await apiRequest('/api/admin/faculty-assignments');
            setAssignments(res?.assignments || []);
            setFacultyList(res?.faculty || []);
            setClassesList(res?.classes || []);
            setSubjectsList(res?.subjects || []);
        } catch (err) {
            console.error('Failed to load faculty assignments:', err);
            setError(err.message || 'Failed to load faculty assignments.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Derived maps & lists
    const facultyMap = useMemo(() => new Map(facultyList.map(f => [f.id, f])), [facultyList]);
    const classMap = useMemo(() => new Map(classesList.map(c => [c.id, c])), [classesList]);
    const subjectMap = useMemo(() => new Map(subjectsList.map(s => [s.subject_code, s])), [subjectsList]);

    const uniqueBranches = useMemo(() => {
        const set = new Set();
        subjectsList.forEach(s => { if (s.branch) set.add(s.branch); });
        classesList.forEach(c => { if (c.branch) set.add(c.branch); });
        return Array.from(set).sort();
    }, [subjectsList, classesList]);

    // Filtered subjects available for assignment based on selected branch/semester/scheme in form
    const availableSubjectsForForm = useMemo(() => {
        return subjectsList.filter(s => {
            const branchMatch = !form.branch || s.branch?.toUpperCase() === form.branch.toUpperCase();
            const semMatch = !form.semester || String(s.semester) === String(form.semester);
            const schemeMatch = !form.scheme || String(s.scheme) === String(form.scheme);
            return branchMatch && semMatch && schemeMatch;
        });
    }, [subjectsList, form.branch, form.semester, form.scheme]);

    // Filtered assignments displayed in table
    const displayedAssignments = useMemo(() => {
        return assignments.filter(a => {
            const fac = facultyMap.get(a.faculty_id) || a.faculty_onboarding;
            const facName = fac?.full_name || '';
            const facEmail = fac?.email || '';
            const sub = subjectMap.get(a.subject_code);
            const subName = sub?.subject_name || '';

            const matchesSearch = !search ||
                facName.toLowerCase().includes(search.toLowerCase()) ||
                facEmail.toLowerCase().includes(search.toLowerCase()) ||
                a.subject_code.toLowerCase().includes(search.toLowerCase()) ||
                subName.toLowerCase().includes(search.toLowerCase());

            const matchesFaculty = filterFaculty === 'all' || a.faculty_id === filterFaculty;
            const matchesBranch = filterBranch === 'all' || (a.branch || '').toUpperCase() === filterBranch.toUpperCase();
            const matchesSem = filterSemester === 'all' || String(a.semester) === String(filterSemester);

            return matchesSearch && matchesFaculty && matchesBranch && matchesSem;
        });
    }, [assignments, facultyMap, subjectMap, search, filterFaculty, filterBranch, filterSemester]);

    // KPI Metrics
    const uniqueFacultyCount = useMemo(() => new Set(assignments.map(a => a.faculty_id)).size, [assignments]);
    const uniqueSubjectsCount = useMemo(() => new Set(assignments.map(a => a.subject_code)).size, [assignments]);
    const uniqueBranchesCount = useMemo(() => new Set(assignments.map(a => a.branch).filter(Boolean)).size, [assignments]);

    // Handle Create
    const handleCreateAssignment = async (e) => {
        e.preventDefault();
        setFormError('');
        if (!form.faculty_id) {
            setFormError('Please select a faculty member.');
            return;
        }
        if (!form.subject_code) {
            setFormError('Please select a subject.');
            return;
        }

        setSubmitting(true);
        try {
            await apiRequest('/api/admin/faculty-assignments', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    faculty_id: form.faculty_id,
                    subject_code: form.subject_code,
                    branch: form.branch || null,
                    semester: form.semester ? parseInt(form.semester, 10) : null,
                    scheme: form.scheme || null,
                    class_id: form.class_id || null,
                }),
            });

            setSuccessMsg('Subject assigned to faculty successfully.');
            setTimeout(() => setSuccessMsg(''), 4000);
            setShowAssignModal(false);
            setForm(prev => ({
                ...prev,
                subject_code: '',
                class_id: '',
            }));
            fetchData();
        } catch (err) {
            console.error('Assignment creation failed:', err);
            setFormError(err.message || 'Failed to assign subject. Check for duplicates.');
        } finally {
            setSubmitting(false);
        }
    };

    // Handle Delete
    const handleDeleteAssignment = async () => {
        if (!confirmingDelete) return;
        setDeleting(true);
        try {
            await apiRequest(`/api/admin/faculty-assignments/${confirmingDelete.id}`, {
                method: 'DELETE',
            });
            setSuccessMsg('Faculty subject assignment removed.');
            setTimeout(() => setSuccessMsg(''), 4000);
            setConfirmingDelete(null);
            fetchData();
        } catch (err) {
            console.error('Failed to remove assignment:', err);
            setError(err.message || 'Failed to remove assignment.');
        } finally {
            setDeleting(false);
        }
    };

    const s = {
        container: {
            width: '100%',
            maxWidth: '1240px',
            margin: '0 auto',
            padding: embedded ? '0' : 'var(--space-6)',
        },
        header: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            flexWrap: 'wrap',
            gap: '16px',
            marginBottom: '24px',
        },
        pageTitle: {
            fontSize: '22px',
            fontWeight: 900,
            color: 'var(--tx-main)',
            letterSpacing: '-0.03em',
            margin: 0,
        },
        pageSubtitle: {
            fontSize: '12px',
            color: 'var(--tx-muted)',
            marginTop: '4px',
            margin: 0,
        },
        kpiGrid: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginBottom: '20px',
        },
        kpiCard: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '16px',
            boxShadow: 'var(--shadow-sm)',
        },
        filterBar: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '14px 18px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
        },
        input: {
            background: 'var(--surface-low)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 12px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--tx-main)',
            outline: 'none',
            fontFamily: 'inherit',
        },
        select: {
            background: 'var(--surface-low)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 28px 8px 12px',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--tx-main)',
            outline: 'none',
            fontFamily: 'inherit',
            cursor: 'pointer',
        },
        btnPrimary: {
            background: 'var(--primary)',
            color: 'var(--surface)',
            border: 'none',
            borderRadius: '8px',
            padding: '9px 16px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'background var(--transition-fast)',
        },
        btnSecondary: {
            background: 'var(--surface-low)',
            color: 'var(--tx-main)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '8px 14px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
        },
        tableWrap: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
        },
        table: {
            width: '100%',
            borderCollapse: 'collapse',
            textAlign: 'left',
        },
        th: {
            padding: '12px 16px',
            background: 'var(--surface-low)',
            fontSize: '11px',
            fontWeight: 800,
            color: 'var(--tx-dim)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            borderBottom: '1px solid var(--border)',
        },
        td: {
            padding: '14px 16px',
            fontSize: '13px',
            color: 'var(--tx-main)',
            borderBottom: '1px solid var(--border)',
        },
        avatar: {
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'var(--surface-low)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 900,
            fontSize: '13px',
            color: 'var(--primary)',
        },
        modalOverlay: {
            position: 'fixed',
            inset: 0,
            background: 'rgba(10, 24, 28, 0.45)',
            backdropFilter: 'blur(6px)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px',
        },
        modalCard: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '560px',
            padding: '28px',
            boxShadow: 'var(--shadow-xl)',
            maxHeight: '90vh',
            overflowY: 'auto',
        },
    };

    return (
        <div style={s.container} className="gf-fade-up">
            {/* Header */}
            <div style={s.header}>
                <div>
                    <h1 style={s.pageTitle}>Faculty Subject Assignments</h1>
                    <p style={s.pageSubtitle}>
                        Map teaching faculty members to academic subjects, departments, semesters, and class sections.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button style={s.btnSecondary} onClick={fetchData} disabled={loading}>
                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>refresh</span>
                        Refresh
                    </button>
                    <button style={s.btnPrimary} onClick={() => { setShowAssignModal(true); setFormError(''); }}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>add_task</span>
                        Assign Subject to Faculty
                    </button>
                </div>
            </div>

            {/* Notification Messages */}
            {successMsg && (
                <div style={{ padding: '12px 16px', background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: '10px', color: 'var(--green)', fontSize: '13px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>check_circle</span>
                    <span>{successMsg}</span>
                </div>
            )}
            {error && (
                <div style={{ padding: '12px 16px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px', color: 'var(--red)', fontSize: '13px', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>error_outline</span>
                    <span>{error}</span>
                </div>
            )}

            {/* KPI Cards */}
            <div style={s.kpiGrid}>
                <div style={s.kpiCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Total Assignments</span>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>assignment</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '6px' }}>
                        {assignments.length}
                    </div>
                </div>
                <div style={s.kpiCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>Faculty Assigned</span>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--green)' }}>supervisor_account</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--green)', marginTop: '6px' }}>
                        {uniqueFacultyCount} / {facultyList.length}
                    </div>
                </div>
                <div style={s.kpiCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Subjects Covered</span>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>library_books</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--primary)', marginTop: '6px' }}>
                        {uniqueSubjectsCount}
                    </div>
                </div>
                <div style={s.kpiCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>Branches</span>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--accent)' }}>domain</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '6px' }}>
                        {uniqueBranchesCount}
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div style={s.filterBar}>
                <div style={{ position: 'relative', flex: '1 1 220px' }}>
                    <span className="material-icons-round" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', fontSize: '16px', color: 'var(--tx-dim)' }}>
                        search
                    </span>
                    <input
                        style={{ ...s.input, width: '100%', paddingLeft: '32px', boxSizing: 'border-box' }}
                        type="text"
                        placeholder="Search faculty or subject code..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <select
                    style={{ ...s.select, flex: '0 0 auto' }}
                    value={filterFaculty}
                    onChange={e => setFilterFaculty(e.target.value)}
                >
                    <option value="all">All Faculty Members</option>
                    {facultyList.map(f => (
                        <option key={f.id} value={f.id}>
                            {f.full_name} ({f.department || 'General'})
                        </option>
                    ))}
                </select>

                <select
                    style={{ ...s.select, flex: '0 0 auto' }}
                    value={filterBranch}
                    onChange={e => setFilterBranch(e.target.value)}
                >
                    <option value="all">All Branches</option>
                    {uniqueBranches.map(b => (
                        <option key={b} value={b}>{b}</option>
                    ))}
                </select>

                <select
                    style={{ ...s.select, flex: '0 0 auto' }}
                    value={filterSemester}
                    onChange={e => setFilterSemester(e.target.value)}
                >
                    <option value="all">All Semesters</option>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                        <option key={sem} value={String(sem)}>Semester {sem}</option>
                    ))}
                </select>

                {(search || filterFaculty !== 'all' || filterBranch !== 'all' || filterSemester !== 'all') && (
                    <button
                        style={{ ...s.btnSecondary, padding: '8px 12px', fontSize: '11px' }}
                        onClick={() => {
                            setSearch('');
                            setFilterFaculty('all');
                            setFilterBranch('all');
                            setFilterSemester('all');
                        }}
                    >
                        Clear Filters
                    </button>
                )}
            </div>

            {/* Assignments Table */}
            <div style={s.tableWrap}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={s.table}>
                        <thead>
                            <tr>
                                <th style={s.th}>Faculty Member</th>
                                <th style={s.th}>Subject</th>
                                <th style={s.th}>Branch / Sem</th>
                                <th style={s.th}>Class Scope</th>
                                <th style={s.th}>Assigned On</th>
                                <th style={{ ...s.th, textAlign: 'right' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '40px', color: 'var(--tx-muted)' }}>
                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                                            <span className="material-icons-round" style={{ animation: 'spin 1s infinite linear', fontSize: '18px' }}>sync</span>
                                            Loading faculty assignments...
                                        </div>
                                    </td>
                                </tr>
                            ) : displayedAssignments.length === 0 ? (
                                <tr>
                                    <td colSpan={6} style={{ ...s.td, textAlign: 'center', padding: '48px', color: 'var(--tx-muted)' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--tx-dim)' }}>assignment_late</span>
                                            <span style={{ fontWeight: 700, color: 'var(--tx-main)' }}>No Subject Assignments Found</span>
                                            <span style={{ fontSize: '12px' }}>Click "Assign Subject to Faculty" above to assign courses.</span>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                displayedAssignments.map(a => {
                                    const fac = facultyMap.get(a.faculty_id) || a.faculty_onboarding;
                                    const sub = subjectMap.get(a.subject_code);
                                    const cls = classMap.get(a.class_id) || a.classes;
                                    const facName = fac?.full_name || 'Faculty Member';
                                    const facEmail = fac?.email || '—';
                                    const subName = sub?.subject_name || '';

                                    return (
                                        <tr key={a.id} style={{ transition: 'background 0.1s ease' }}>
                                            <td style={s.td}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={s.avatar}>{facName[0]?.toUpperCase() || 'F'}</div>
                                                    <div>
                                                        <div style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{facName}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{facEmail}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td style={s.td}>
                                                <div style={{ display: 'inline-block', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '6px', padding: '2px 6px', fontWeight: 800, fontSize: '12px', color: 'var(--primary)', letterSpacing: '0.04em' }}>
                                                    {a.subject_code}
                                                </div>
                                                {subName && (
                                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '3px' }}>
                                                        {subName}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={s.td}>
                                                <span style={{ fontWeight: 700 }}>{a.branch || 'All Branches'}</span>
                                                <span style={{ color: 'var(--tx-dim)' }}> · </span>
                                                <span>Sem {a.semester || 'All'}</span>
                                                {a.scheme && <span style={{ fontSize: '11px', color: 'var(--tx-dim)' }}> ({a.scheme})</span>}
                                            </td>
                                            <td style={s.td}>
                                                {cls ? (
                                                    <span style={{ fontWeight: 700, color: 'var(--tx-main)' }}>{cls.name}</span>
                                                ) : (
                                                    <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontStyle: 'italic' }}>All Sections</span>
                                                )}
                                            </td>
                                            <td style={{ ...s.td, fontSize: '12px', color: 'var(--tx-dim)' }}>
                                                {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
                                            </td>
                                            <td style={{ ...s.td, textAlign: 'right' }}>
                                                <button
                                                    onClick={() => setConfirmingDelete(a)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--red)',
                                                        cursor: 'pointer',
                                                        padding: '6px 8px',
                                                        borderRadius: '6px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                    }}
                                                    title="Unassign this subject"
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>delete_outline</span>
                                                    Unassign
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Create Assignment Modal */}
            {showAssignModal && (
                <div style={s.modalOverlay} onClick={() => setShowAssignModal(false)}>
                    <div style={s.modalCard} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                            <div>
                                <h2 style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', margin: 0 }}>
                                    Assign Subject to Faculty
                                </h2>
                                <p style={{ fontSize: '12px', color: 'var(--tx-muted)', margin: '4px 0 0' }}>
                                    Select the faculty member, curriculum scope, and course.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowAssignModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center' }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '20px' }}>close</span>
                            </button>
                        </div>

                        {formError && (
                            <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '8px', color: 'var(--red)', fontSize: '12px', fontWeight: 600, marginBottom: '16px' }}>
                                {formError}
                            </div>
                        )}

                        <form onSubmit={handleCreateAssignment}>
                            {/* Faculty Selection */}
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                    Faculty Member *
                                </label>
                                <select
                                    style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                                    value={form.faculty_id}
                                    onChange={e => setForm(f => ({ ...f, faculty_id: e.target.value }))}
                                    required
                                >
                                    <option value="">Select Faculty...</option>
                                    {facultyList.map(f => (
                                        <option key={f.id} value={f.id}>
                                            {f.full_name} ({f.email}) · {f.department || 'General'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* Branch & Semester */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        Branch *
                                    </label>
                                    <select
                                        style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                                        value={form.branch}
                                        onChange={e => setForm(f => ({ ...f, branch: e.target.value, subject_code: '' }))}
                                        required
                                    >
                                        <option value="CS">Computer Science (CS)</option>
                                        <option value="IS">Information Science (IS)</option>
                                        <option value="EC">Electronics & Comm (EC)</option>
                                        <option value="EE">Electrical & Electronics (EE)</option>
                                        <option value="ME">Mechanical (ME)</option>
                                        <option value="CV">Civil (CV)</option>
                                        <option value="AI">AI & ML (AI)</option>
                                        <option value="DS">Data Science (DS)</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        Semester *
                                    </label>
                                    <select
                                        style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                                        value={form.semester}
                                        onChange={e => setForm(f => ({ ...f, semester: e.target.value, subject_code: '' }))}
                                        required
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                            <option key={n} value={String(n)}>Semester {n}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Scheme & Class Section */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        Curriculum Scheme
                                    </label>
                                    <select
                                        style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                                        value={form.scheme}
                                        onChange={e => setForm(f => ({ ...f, scheme: e.target.value, subject_code: '' }))}
                                    >
                                        <option value="2022">2022 Scheme</option>
                                        <option value="2021">2021 Scheme</option>
                                        <option value="2018">2018 Scheme</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                        Class Section (Optional)
                                    </label>
                                    <select
                                        style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                                        value={form.class_id}
                                        onChange={e => setForm(f => ({ ...f, class_id: e.target.value }))}
                                    >
                                        <option value="">All Class Sections</option>
                                        {classesList
                                            .filter(c => !form.branch || c.branch?.toUpperCase() === form.branch.toUpperCase())
                                            .map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.name} (Sem {c.semester})
                                                </option>
                                            ))}
                                    </select>
                                </div>
                            </div>

                            {/* Subject Selection */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>
                                        Subject *
                                    </label>
                                    <span style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>
                                        {availableSubjectsForForm.length} subjects found
                                    </span>
                                </div>
                                {availableSubjectsForForm.length > 0 ? (
                                    <select
                                        style={{ ...s.input, width: '100%', cursor: 'pointer' }}
                                        value={form.subject_code}
                                        onChange={e => setForm(f => ({ ...f, subject_code: e.target.value }))}
                                        required
                                    >
                                        <option value="">Choose a subject from catalog...</option>
                                        {availableSubjectsForForm.map(s => (
                                            <option key={s.id || s.subject_code} value={s.subject_code}>
                                                {s.subject_code} — {s.subject_name} ({s.credits || 3} credits)
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            style={{ ...s.input, flex: 1 }}
                                            type="text"
                                            placeholder="Enter subject code manually (e.g. BCS301)"
                                            value={form.subject_code}
                                            onChange={e => setForm(f => ({ ...f, subject_code: e.target.value.toUpperCase() }))}
                                            required
                                        />
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '24px' }}>
                                <button
                                    type="button"
                                    style={s.btnSecondary}
                                    onClick={() => setShowAssignModal(false)}
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    style={s.btnPrimary}
                                    disabled={submitting}
                                >
                                    {submitting ? 'Assigning...' : 'Confirm Assignment'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Unassign Confirmation */}
            <ConfirmDialog
                open={Boolean(confirmingDelete)}
                title="Remove Faculty Subject Assignment?"
                description={`This will unassign ${confirmingDelete?.subject_code} from ${facultyMap.get(confirmingDelete?.faculty_id)?.full_name || 'this faculty member'}.`}
                busy={deleting}
                onCancel={() => setConfirmingDelete(null)}
                onConfirm={handleDeleteAssignment}
            />
        </div>
    );
}
export default FacultyAssignmentsContent;
