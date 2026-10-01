'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '@/lib/api/client';
import { supabase } from '@/lib/supabase';
import { VTU_SCHEMES, VTU_BRANCHES } from '@/lib/vtuGrades';
import { normalizeBranch } from '@/lib/vtuAcademicEngine';
import { PageHeader, PageHeaderTitle, PageHeaderSubtitle, PageHeaderEyebrow } from '@/components/ui/PageHeader';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const RESOURCE_TYPES = [
    { id: 'all', label: 'All Resources', icon: 'apps' },
    { id: 'notes', label: 'Notes / PDFs', icon: 'picture_as_pdf', color: '#dc2626', bg: 'rgba(220, 38, 38, 0.1)' },
    { id: 'video', label: 'Lecture Videos', icon: 'play_circle', color: '#4f46e5', bg: 'rgba(79, 70, 229, 0.1)' },
    { id: 'link', label: 'External Links', icon: 'link', color: '#0f766e', bg: 'rgba(15, 118, 110, 0.1)' },
    { id: 'assignment', label: 'Assignments', icon: 'assignment', color: '#b45309', bg: 'rgba(180, 83, 9, 0.1)' },
    { id: 'other', label: 'Other Materials', icon: 'folder', color: '#475569', bg: 'rgba(71, 85, 105, 0.1)' },
];

function getResourceTypeMeta(type) {
    return RESOURCE_TYPES.find(t => t.id === type) || RESOURCE_TYPES[1];
}

export default function StudyMaterialsContent({ initialRole = 'student' }) {
    const [scheme, setScheme] = useState('2025');
    const [branch, setBranch] = useState('CS');
    const [semester, setSemester] = useState(3);
    const [subjects, setSubjects] = useState([]);
    const [selectedSubject, setSelectedSubject] = useState(null);
    const [materials, setMaterials] = useState([]);
    const [loadingSubjects, setLoadingSubjects] = useState(false);
    const [loadingMaterials, setLoadingMaterials] = useState(false);
    const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');
    const [expandedModules, setExpandedModules] = useState({ 1: true, 2: true, 3: true, 4: true, 5: true });
    const [userRole, setUserRole] = useState(initialRole);

    // Modal state for adding material
    const [showAddModal, setShowAddModal] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formModule, setFormModule] = useState(1);
    const [formTitle, setFormTitle] = useState('');
    const [formType, setFormType] = useState('notes');
    const [formUrl, setFormUrl] = useState('');
    const [formDescription, setFormDescription] = useState('');
    const [formDueDate, setFormDueDate] = useState('');
    const [errorMsg, setErrorMsg] = useState('');
    const [successMsg, setSuccessMsg] = useState('');

    // Delete confirmation
    const [deleteTarget, setDeleteTarget] = useState(null);

    // Detect user role from local storage
    useEffect(() => {
        try {
            const fac = localStorage.getItem('faculty_session');
            const adm = localStorage.getItem('admin_session');
            if (fac) setUserRole('faculty');
            else if (adm) setUserRole('admin');
            else setUserRole('student');
        } catch {
            setUserRole(initialRole);
        }
    }, [initialRole]);

    // Fetch available subjects from subject_catalog
    const fetchSubjects = useCallback(async () => {
        setLoadingSubjects(true);
        const cleanBranch = normalizeBranch(branch);
        try {
            const { data, error } = await supabase
                .from('subject_catalog')
                .select('subject_code, subject_name, credits')
                .eq('scheme', scheme)
                .eq('branch', cleanBranch)
                .eq('semester', semester)
                .order('subject_code', { ascending: true });

            if (error) throw error;
            const list = data || [];
            setSubjects(list);
            if (list.length > 0) {
                // Select first subject by default or keep current if present
                setSelectedSubject(prev => {
                    const match = list.find(s => s.subject_code === prev?.subject_code);
                    return match || list[0];
                });
            } else {
                setSelectedSubject(null);
            }
        } catch (err) {
            console.error('Error fetching subjects for study materials:', err);
        } finally {
            setLoadingSubjects(false);
        }
    }, [scheme, branch, semester]);

    useEffect(() => {
        fetchSubjects();
    }, [fetchSubjects]);

    // Fetch materials for the selected subject
    const fetchMaterials = useCallback(async (code) => {
        if (!code) {
            setMaterials([]);
            return;
        }
        setLoadingMaterials(true);
        try {
            const res = await apiRequest(`/api/study-materials?subject_code=${code}&_t=${Date.now()}`);
            setMaterials(res?.materials || []);
        } catch (err) {
            console.error('Error fetching study materials:', err);
            setMaterials([]);
        } finally {
            setLoadingMaterials(false);
        }
    }, []);

    useEffect(() => {
        if (selectedSubject?.subject_code) {
            fetchMaterials(selectedSubject.subject_code);
        } else {
            setMaterials([]);
        }
    }, [selectedSubject, fetchMaterials]);

    const toggleModule = (modNum) => {
        setExpandedModules(prev => ({ ...prev, [modNum]: !prev[modNum] }));
    };

    const handleOpenAdd = (modNum = 1) => {
        setFormModule(modNum);
        setFormTitle('');
        setFormType('notes');
        setFormUrl('');
        setFormDescription('');
        setFormDueDate('');
        setErrorMsg('');
        setShowAddModal(true);
    };

    const handleSaveMaterial = async (e) => {
        e.preventDefault();
        if (!formTitle.trim()) {
            setErrorMsg('Resource title is required.');
            return;
        }
        if (!formUrl.trim()) {
            setErrorMsg('URL or document link is required.');
            return;
        }

        setSaving(true);
        setErrorMsg('');
        try {
            await apiRequest('/api/study-materials', {
                method: 'POST',
                body: JSON.stringify({
                    subject_code: selectedSubject.subject_code,
                    subject_name: selectedSubject.subject_name,
                    module_number: formModule,
                    title: formTitle.trim(),
                    resource_type: formType,
                    url: formUrl.trim(),
                    description: formDescription.trim(),
                    due_date: formDueDate || null,
                })
            });

            setSuccessMsg('✓ Resource attached successfully!');
            setTimeout(() => setSuccessMsg(''), 4000);
            setShowAddModal(false);
            fetchMaterials(selectedSubject.subject_code);
        } catch (err) {
            setErrorMsg(err.message || 'Failed to attach resource.');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        try {
            await apiRequest(`/api/study-materials?subject_code=${selectedSubject.subject_code}&id=${deleteTarget.id}`, {
                method: 'DELETE'
            });
            setSuccessMsg('✓ Resource removed.');
            setTimeout(() => setSuccessMsg(''), 3000);
            setDeleteTarget(null);
            fetchMaterials(selectedSubject.subject_code);
        } catch (err) {
            alert('Failed to remove resource: ' + err.message);
        }
    };

    // Filtered materials
    const filteredMaterials = useMemo(() => {
        if (selectedTypeFilter === 'all') return materials;
        return materials.filter(m => m.resource_type === selectedTypeFilter);
    }, [materials, selectedTypeFilter]);

    // Group materials by module (1 to 5)
    const materialsByModule = useMemo(() => {
        const groups = { 1: [], 2: [], 3: [], 4: [], 5: [] };
        filteredMaterials.forEach(m => {
            const mod = Number(m.module_number) || 1;
            if (groups[mod]) groups[mod].push(m);
            else groups[1].push(m);
        });
        return groups;
    }, [filteredMaterials]);

    const canManage = userRole === 'faculty' || userRole === 'admin';

    return (
        <div className="gf-page gf-page-wide gf-fade-up" style={{ maxWidth: '1280px', margin: '0 auto', paddingBottom: '60px' }}>
            <PageHeader>
                <PageHeaderEyebrow>Academic Resource Hub</PageHeaderEyebrow>
                <PageHeaderTitle>Course Study Materials</PageHeaderTitle>
                <PageHeaderSubtitle>
                    Organized module-wise lecture notes, problem sets, video lectures, and syllabus resources verified for VTU curriculum.
                </PageHeaderSubtitle>
            </PageHeader>

            {successMsg && (
                <div style={{
                    padding: '12px 18px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '10px',
                    color: '#15803d',
                    fontSize: '13.5px',
                    fontWeight: 700,
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>check_circle</span>
                    {successMsg}
                </div>
            )}

            {/* Academic Structure Selector Bar */}
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-4)',
                padding: '20px',
                marginBottom: '24px',
                boxShadow: 'var(--shadow-sm)'
            }}>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '16px',
                    alignItems: 'end'
                }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Teaching Scheme
                        </label>
                        <select
                            value={scheme}
                            onChange={e => setScheme(e.target.value)}
                            style={{
                                width: '100%',
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontWeight: 700,
                                fontSize: '13px',
                                color: 'var(--tx-main)',
                                outline: 'none'
                            }}
                        >
                            {Object.keys(VTU_SCHEMES).map(k => (
                                <option key={k} value={k}>{k} Scheme</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Programme Branch
                        </label>
                        <select
                            value={branch}
                            onChange={e => setBranch(e.target.value)}
                            style={{
                                width: '100%',
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontWeight: 700,
                                fontSize: '13px',
                                color: 'var(--tx-main)',
                                outline: 'none'
                            }}
                        >
                            {Object.entries(VTU_BRANCHES).map(([code, name]) => (
                                <option key={code} value={code}>{code} — {name}</option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Semester
                        </label>
                        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '2px' }}>
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(sem => (
                                <button
                                    key={sem}
                                    type="button"
                                    onClick={() => setSemester(sem)}
                                    style={{
                                        minWidth: '38px',
                                        height: '38px',
                                        borderRadius: '8px',
                                        border: semester === sem ? 'none' : '1px solid var(--border)',
                                        background: semester === sem ? 'var(--primary)' : 'var(--surface-low)',
                                        color: semester === sem ? '#fff' : 'var(--tx-main)',
                                        fontWeight: 800,
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {sem}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ gridColumn: 'span 1' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '6px', textTransform: 'uppercase' }}>
                            Subject / Course
                        </label>
                        <select
                            disabled={loadingSubjects || subjects.length === 0}
                            value={selectedSubject?.subject_code || ''}
                            onChange={e => {
                                const found = subjects.find(s => s.subject_code === e.target.value);
                                setSelectedSubject(found || null);
                            }}
                            style={{
                                width: '100%',
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontWeight: 700,
                                fontSize: '13px',
                                color: 'var(--tx-main)',
                                outline: 'none'
                            }}
                        >
                            {loadingSubjects ? (
                                <option>Loading curriculum...</option>
                            ) : subjects.length === 0 ? (
                                <option>No subjects found</option>
                            ) : (
                                subjects.map(s => (
                                    <option key={s.subject_code} value={s.subject_code}>
                                        {s.subject_code} - {s.subject_name} ({s.credits} CR)
                                    </option>
                                ))
                            )}
                        </select>
                    </div>
                </div>
            </div>

            {/* Subject Overview & Action Bar */}
            {selectedSubject ? (
                <div>
                    <div style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-4)',
                        padding: '24px',
                        marginBottom: '24px',
                        boxShadow: 'var(--shadow-sm)',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '16px'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                <span style={{
                                    fontFamily: 'monospace',
                                    fontSize: '13px',
                                    fontWeight: 900,
                                    color: 'var(--primary)',
                                    background: 'var(--primary-glow)',
                                    padding: '3px 8px',
                                    borderRadius: '6px'
                                }}>
                                    {selectedSubject.subject_code}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 700 }}>
                                    Semester {semester} · {selectedSubject.credits} Credits · {scheme} Scheme
                                </span>
                            </div>
                            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>
                                {selectedSubject.subject_name}
                            </h2>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {canManage && (
                                <button
                                    type="button"
                                    onClick={() => handleOpenAdd(1)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        background: 'var(--primary)',
                                        color: '#fff',
                                        border: 'none',
                                        padding: '10px 18px',
                                        borderRadius: '8px',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(23,75,77,0.2)'
                                    }}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>add_circle</span>
                                    Attach Study Resource
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Filter Pills */}
                    <div style={{
                        display: 'flex',
                        gap: '8px',
                        overflowX: 'auto',
                        paddingBottom: '12px',
                        marginBottom: '16px'
                    }}>
                        {RESOURCE_TYPES.map(type => {
                            const active = selectedTypeFilter === type.id;
                            const count = type.id === 'all'
                                ? materials.length
                                : materials.filter(m => m.resource_type === type.id).length;

                            return (
                                <button
                                    key={type.id}
                                    type="button"
                                    onClick={() => setSelectedTypeFilter(type.id)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '6px 14px',
                                        borderRadius: '20px',
                                        border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                                        background: active ? 'var(--primary)' : 'var(--surface)',
                                        color: active ? '#ffffff' : 'var(--tx-muted)',
                                        fontWeight: 700,
                                        fontSize: '12.5px',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>{type.icon}</span>
                                    <span>{type.label}</span>
                                    <span style={{
                                        fontSize: '11px',
                                        padding: '1px 6px',
                                        borderRadius: '10px',
                                        background: active ? 'rgba(255,255,255,0.2)' : 'var(--surface-low)',
                                        fontWeight: 800
                                    }}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 5-Module Hierarchical Structure: Subject → Module / Unit → Study Materials */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                        {[1, 2, 3, 4, 5].map(modNum => {
                            const modItems = materialsByModule[modNum] || [];
                            const isExpanded = expandedModules[modNum] !== false;

                            return (
                                <div
                                    key={modNum}
                                    style={{
                                        background: 'var(--surface)',
                                        border: '1px solid var(--border)',
                                        borderRadius: 'var(--radius-4)',
                                        overflow: 'hidden',
                                        boxShadow: 'var(--shadow-sm)'
                                    }}
                                >
                                    {/* Module Header Bar */}
                                    <div
                                        onClick={() => toggleModule(modNum)}
                                        style={{
                                            padding: '16px 20px',
                                            background: 'var(--surface-low)',
                                            borderBottom: isExpanded && modItems.length > 0 ? '1px solid var(--border)' : 'none',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            cursor: 'pointer',
                                            userSelect: 'none'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '6px',
                                                background: 'var(--primary)',
                                                color: '#fff',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontWeight: 900,
                                                fontSize: '13px'
                                            }}>
                                                M{modNum}
                                            </div>
                                            <div>
                                                <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: 'var(--tx-main)' }}>
                                                    Module {modNum}
                                                </h3>
                                                <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                    {modItems.length} {modItems.length === 1 ? 'study resource' : 'study resources'} available
                                                </span>
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleOpenAdd(modNum);
                                                    }}
                                                    title={`Attach resource to Module ${modNum}`}
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        padding: '4px 10px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--surface)',
                                                        color: 'var(--primary)',
                                                        fontSize: '11px',
                                                        fontWeight: 800,
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>add</span>
                                                    Add
                                                </button>
                                            )}
                                            <span className="material-icons-round" style={{
                                                color: 'var(--tx-muted)',
                                                transform: isExpanded ? 'rotate(0deg)' : 'rotate(-90deg)',
                                                transition: 'transform 0.2s ease'
                                            }}>
                                                expand_more
                                            </span>
                                        </div>
                                    </div>

                                    {/* Module Resources List */}
                                    {isExpanded && (
                                        <div style={{ padding: '16px 20px' }}>
                                            {loadingMaterials ? (
                                                <div style={{ textAlign: 'center', padding: '24px', color: 'var(--tx-muted)', fontStyle: 'italic' }}>
                                                    Loading module materials...
                                                </div>
                                            ) : modItems.length === 0 ? (
                                                <div style={{
                                                    padding: '24px',
                                                    textAlign: 'center',
                                                    border: '1px dashed var(--border)',
                                                    borderRadius: '8px',
                                                    color: 'var(--tx-dim)',
                                                    fontSize: '13px'
                                                }}>
                                                    No materials uploaded for Module {modNum} yet.
                                                    {canManage && (
                                                        <div style={{ marginTop: '8px' }}>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenAdd(modNum)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: 'var(--primary)',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    textDecoration: 'underline'
                                                                }}
                                                            >
                                                                Click here to upload lecture notes, problem sets, or videos
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                                                    {modItems.map(item => {
                                                        const meta = getResourceTypeMeta(item.resource_type);

                                                        return (
                                                            <div
                                                                key={item.id}
                                                                style={{
                                                                    border: '1px solid var(--border)',
                                                                    borderRadius: '10px',
                                                                    padding: '14px',
                                                                    background: 'var(--surface)',
                                                                    display: 'flex',
                                                                    flexDirection: 'column',
                                                                    justifyContent: 'space-between',
                                                                    gap: '12px',
                                                                    transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                                                                }}
                                                            >
                                                                <div>
                                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                                        <span style={{
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center',
                                                                            gap: '4px',
                                                                            padding: '2px 8px',
                                                                            borderRadius: '4px',
                                                                            background: meta.bg,
                                                                            color: meta.color,
                                                                            fontSize: '11px',
                                                                            fontWeight: 800,
                                                                            textTransform: 'uppercase'
                                                                        }}>
                                                                            <span className="material-icons-round" style={{ fontSize: '13px' }}>{meta.icon}</span>
                                                                            {meta.label}
                                                                        </span>

                                                                        {canManage && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setDeleteTarget(item)}
                                                                                title="Remove resource"
                                                                                style={{
                                                                                    background: 'none',
                                                                                    border: 'none',
                                                                                    color: 'var(--tx-dim)',
                                                                                    cursor: 'pointer',
                                                                                    padding: '2px'
                                                                                }}
                                                                            >
                                                                                <span className="material-icons-round" style={{ fontSize: '16px' }}>delete_outline</span>
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    <h4 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)', margin: '0 0 4px 0', lineHeight: 1.3 }}>
                                                                        {item.title}
                                                                    </h4>

                                                                    {item.description && (
                                                                        <p style={{ fontSize: '12px', color: 'var(--tx-muted)', margin: '0 0 8px 0', lineHeight: 1.4 }}>
                                                                            {item.description}
                                                                        </p>
                                                                    )}

                                                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                                                        By {item.author_name} · {new Date(item.created_at).toLocaleDateString()}
                                                                    </div>
                                                                </div>

                                                                <a
                                                                    href={item.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        gap: '6px',
                                                                        padding: '8px 12px',
                                                                        borderRadius: '6px',
                                                                        background: 'var(--surface-low)',
                                                                        color: 'var(--primary)',
                                                                        border: '1px solid var(--border)',
                                                                        textDecoration: 'none',
                                                                        fontWeight: 700,
                                                                        fontSize: '12.5px',
                                                                        marginTop: 'auto'
                                                                    }}
                                                                >
                                                                    <span>Open Resource</span>
                                                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>open_in_new</span>
                                                                </a>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    color: 'var(--tx-muted)'
                }}>
                    No subjects found for {branch} Semester {semester} ({scheme} Scheme).
                </div>
            )}

            {/* Attach Resource Modal */}
            {showAddModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0,0,0,0.6)',
                    backdropFilter: 'blur(8px)',
                    zIndex: 1300,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '520px',
                        padding: '24px',
                        boxShadow: 'var(--shadow-xl)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <h3 style={{ fontSize: '17px', fontWeight: 800, margin: 0, color: 'var(--tx-main)' }}>
                                Attach Study Resource
                            </h3>
                            <button
                                type="button"
                                onClick={() => setShowAddModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        {errorMsg && (
                            <div style={{ padding: '8px 12px', borderRadius: '6px', background: '#fef2f2', color: '#b91c1c', fontSize: '12.5px', fontWeight: 700 }}>
                                {errorMsg}
                            </div>
                        )}

                        <form onSubmit={handleSaveMaterial} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Target Module
                                </label>
                                <select
                                    value={formModule}
                                    onChange={e => setFormModule(Number(e.target.value))}
                                    style={{
                                        width: '100%',
                                        background: 'var(--surface-low)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '9px 12px',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        color: 'var(--tx-main)'
                                    }}
                                >
                                    {[1, 2, 3, 4, 5].map(n => (
                                        <option key={n} value={n}>Module {n}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Resource Type
                                </label>
                                <select
                                    value={formType}
                                    onChange={e => setFormType(e.target.value)}
                                    style={{
                                        width: '100%',
                                        background: 'var(--surface-low)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '9px 12px',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        color: 'var(--tx-main)'
                                    }}
                                >
                                    <option value="notes">Notes / PDF Document</option>
                                    <option value="video">Lecture Video</option>
                                    <option value="link">External Reference Link</option>
                                    <option value="assignment">Assignment / Problem Set</option>
                                    <option value="other">Other Material</option>
                                </select>
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Title / Description
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. Module 1: Complete Lecture Notes & Solved Problems"
                                    value={formTitle}
                                    onChange={e => setFormTitle(e.target.value)}
                                    style={{
                                        width: '100%',
                                        background: 'var(--surface-low)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '9px 12px',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                        color: 'var(--tx-main)',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Resource Link / URL (HTTP or HTTPS)
                                </label>
                                <input
                                    type="url"
                                    placeholder="https://drive.google.com/... or https://youtu.be/..."
                                    value={formUrl}
                                    onChange={e => setFormUrl(e.target.value)}
                                    style={{
                                        width: '100%',
                                        background: 'var(--surface-low)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '9px 12px',
                                        fontWeight: 600,
                                        fontSize: '13px',
                                        color: 'var(--tx-main)',
                                        outline: 'none'
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Additional Instructions (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Refer to sections 1.2 to 1.8 before midterms"
                                    value={formDescription}
                                    onChange={e => setFormDescription(e.target.value)}
                                    style={{
                                        width: '100%',
                                        background: 'var(--surface-low)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        padding: '9px 12px',
                                        fontWeight: 500,
                                        fontSize: '13px',
                                        color: 'var(--tx-main)',
                                        outline: 'none',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowAddModal(false)}
                                    style={{
                                        padding: '9px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        background: 'transparent',
                                        color: 'var(--tx-muted)',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    style={{
                                        padding: '9px 20px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: 'var(--primary)',
                                        color: '#fff',
                                        fontWeight: 700,
                                        fontSize: '13px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    {saving ? 'Attaching...' : 'Attach Resource'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Confirm Resource Delete */}
            <ConfirmDialog
                open={Boolean(deleteTarget)}
                title="Remove Study Resource?"
                description={`Are you sure you want to remove "${deleteTarget?.title}"?`}
                confirmLabel="Remove"
                onCancel={() => setDeleteTarget(null)}
                onConfirm={handleDelete}
            />
        </div>
    );
}
