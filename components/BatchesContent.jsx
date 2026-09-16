'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { apiRequest, clearApiCache } from '@/lib/api/client';
import { computeBatchLabel, computeBatchStanding, computeBatchRange, computeGraduatingClass } from '@/lib/vtu-identity';
import { LoadingState } from '@/components/ui';

export function BatchesContent({ embedded = false, showHeader = false, onNavigateTab = null, onBatchChange = null }) {
    const [batches, setBatches] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [filterStatus, setFilterStatus] = useState('all'); // 'all' | 'active' | 'inactive'

    // Form state for creating a new batch
    const nextSuggestedYear = useMemo(() => {
        if (!batches.length) return String(new Date().getFullYear());
        const years = batches.map(b => parseInt(b.year, 10)).filter(y => !isNaN(y));
        return years.length ? String(Math.max(...years) + 1) : String(new Date().getFullYear());
    }, [batches]);

    const [formYear, setFormYear] = useState('');
    const [formLabel, setFormLabel] = useState('');
    const [formAcademicYear, setFormAcademicYear] = useState('');
    const [formScheme, setFormScheme] = useState('2025');
    const [customScheme, setCustomScheme] = useState('');
    const [formActive, setFormActive] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [actionMessage, setActionMessage] = useState(null);

    // Edit modal state
    const [editingBatch, setEditingBatch] = useState(null);
    const [editLabel, setEditLabel] = useState('');
    const [editAcademicYear, setEditAcademicYear] = useState('');
    const [editScheme, setEditScheme] = useState('2025');
    const [editCustomScheme, setEditCustomScheme] = useState('');
    const [editActive, setEditActive] = useState(true);
    const [updating, setUpdating] = useState(false);

    // Dynamic available schemes list derived from standards + existing batches + current year
    const availableSchemes = useMemo(() => {
        const schemes = new Set(['2026', '2025', '2022', '2018']);
        batches.forEach(b => {
            if (b.default_scheme) schemes.add(String(b.default_scheme).trim());
        });
        if (formYear && parseInt(formYear, 10) >= 2025) {
            schemes.add(formYear);
        }
        return Array.from(schemes).sort((a, b) => {
            const na = parseInt(a, 10);
            const nb = parseInt(b, 10);
            if (!isNaN(na) && !isNaN(nb)) return nb - na;
            return b.localeCompare(a);
        });
    }, [batches, formYear]);

    const formatSchemeLabel = (s) => {
        if (s === '2025') return '2025 Scheme (NEP)';
        if (s === '2022') return '2022 Scheme (NEP)';
        if (s === '2018') return '2018 Scheme (CBCS)';
        const yr = parseInt(s, 10);
        if (!isNaN(yr) && yr >= 2026) return `${s} Scheme (Upcoming / NEP)`;
        return `${s} Scheme`;
    };

    // Load batches from API
    const loadBatches = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await apiRequest('/api/admin/batches');
            if (res?.batches) {
                setBatches(res.batches);
            }
        } catch (err) {
            console.error('[BatchesContent loadBatches]', err);
            setError(err?.message || 'Failed to load academic batches.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadBatches();
    }, [loadBatches]);

    // Set default form values when nextSuggestedYear changes
    useEffect(() => {
        if (!formYear && nextSuggestedYear) {
            setFormYear(nextSuggestedYear);
            setFormLabel(computeBatchLabel(nextSuggestedYear));
            setFormAcademicYear(`${nextSuggestedYear}-${parseInt(nextSuggestedYear, 10) + 1}`);
            const yrNum = parseInt(nextSuggestedYear, 10);
            setFormScheme(yrNum >= 2026 ? nextSuggestedYear : (yrNum >= 2025 ? '2025' : '2022'));
        }
    }, [nextSuggestedYear, formYear]);

    const handleYearChange = (val) => {
        const clean = val.replace(/\D/g, '').slice(0, 4);
        setFormYear(clean);
        if (clean.length === 4) {
            const y = parseInt(clean, 10);
            setFormLabel(computeBatchLabel(clean));
            setFormAcademicYear(`${clean}-${y + 1}`);
            if (formScheme !== '__custom__') {
                setFormScheme(y >= 2026 ? clean : (y >= 2025 ? '2025' : '2022'));
            }
        }
    };

    const handleCreateBatch = async (e) => {
        e?.preventDefault?.();
        if (!formYear || formYear.length !== 4) {
            setActionMessage({ type: 'error', text: 'Please enter a valid 4-digit batch year (e.g. 2026).' });
            return;
        }

        const finalScheme = formScheme === '__custom__' ? customScheme.trim() : formScheme;
        if (!finalScheme) {
            setActionMessage({ type: 'error', text: 'Please enter or select a valid curriculum scheme.' });
            return;
        }

        setSubmitting(true);
        setActionMessage(null);
        try {
            const res = await apiRequest('/api/admin/batches', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: formYear,
                    label: formLabel || computeBatchLabel(formYear),
                    academic_year: formAcademicYear,
                    default_scheme: finalScheme,
                    is_active: formActive
                })
            });

            // Instant cache invalidation
            clearApiCache();

            setActionMessage({
                type: 'success',
                text: `✓ Academic Batch ${formYear} (Scheme ${finalScheme}) created! All dropdowns across the platform are now updated.`
            });

            // Reset form to next consecutive year
            const nextYr = String(parseInt(formYear, 10) + 1);
            setFormYear(nextYr);
            setFormLabel(computeBatchLabel(nextYr));
            setFormAcademicYear(`${nextYr}-${parseInt(nextYr, 10) + 1}`);
            setFormScheme(parseInt(nextYr, 10) >= 2026 ? nextYr : (parseInt(nextYr, 10) >= 2025 ? '2025' : '2022'));
            setCustomScheme('');

            await loadBatches();
            onBatchChange?.();
        } catch (err) {
            console.error('[BatchesContent handleCreateBatch]', err);
            setActionMessage({ type: 'error', text: err?.message || 'Failed to create academic batch.' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleActive = async (b) => {
        try {
            await apiRequest('/api/admin/batches', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: b.year,
                    is_active: !b.is_active
                })
            });
            clearApiCache();
            setBatches(prev => prev.map(item => item.year === b.year ? { ...item, is_active: !item.is_active } : item));
            onBatchChange?.();
        } catch (err) {
            alert('Failed to update batch status: ' + (err?.message || err));
        }
    };

    const openEditModal = (b) => {
        setEditingBatch(b);
        setEditLabel(b.label || computeBatchLabel(b.year));
        setEditAcademicYear(b.academic_year || `${b.year}-${Number(b.year) + 1}`);
        setEditScheme(b.default_scheme || '2025');
        setEditCustomScheme('');
        setEditActive(b.is_active !== false);
    };

    const handleSaveEdit = async () => {
        if (!editingBatch) return;
        const finalScheme = editScheme === '__custom__' ? editCustomScheme.trim() : editScheme;
        if (!finalScheme) {
            alert('Please enter or select a valid curriculum scheme.');
            return;
        }
        setUpdating(true);
        try {
            await apiRequest('/api/admin/batches', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    year: editingBatch.year,
                    label: editLabel,
                    academic_year: editAcademicYear,
                    default_scheme: finalScheme,
                    is_active: editActive
                })
            });
            clearApiCache();
            setEditingBatch(null);
            await loadBatches();
            onBatchChange?.();
        } catch (err) {
            alert('Failed to save batch changes: ' + (err?.message || err));
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteBatch = async (b) => {
        const hasData = (b.studentCount || 0) > 0 || (b.classCount || 0) > 0;
        const confirmText = hasData
            ? `Batch ${b.year} has ${b.studentCount || 0} students and ${b.classCount || 0} classes.\n\nTo ensure ZERO data loss, it will be safely ARCHIVED (deactivated) so existing marks and records are preserved.\n\nProceed?`
            : `Are you sure you want to permanently delete Batch ${b.year}?`;

        if (!window.confirm(confirmText)) return;

        try {
            const res = await apiRequest(`/api/admin/batches?year=${b.year}`, {
                method: 'DELETE'
            });
            clearApiCache();
            setActionMessage({
                type: 'success',
                text: res.message || `Batch ${b.year} updated.`
            });
            await loadBatches();
            onBatchChange?.();
        } catch (err) {
            alert('Failed to delete/archive batch: ' + (err?.message || err));
        }
    };

    // Telemetry aggregations
    const totalBatches = batches.length;
    const activeBatches = batches.filter(b => b.is_active !== false).length;
    const totalStudents = batches.reduce((acc, b) => acc + (b.studentCount || 0), 0);
    const totalClasses = batches.reduce((acc, b) => acc + (b.classCount || 0), 0);

    // Filtered batch list
    const visibleBatches = useMemo(() => {
        return batches.filter(b => {
            if (filterStatus === 'active' && b.is_active === false) return false;
            if (filterStatus === 'inactive' && b.is_active !== false) return false;
            if (search) {
                const q = search.toLowerCase().trim();
                const matchYear = b.year.toLowerCase().includes(q);
                const matchLabel = (b.label || '').toLowerCase().includes(q);
                const matchScheme = (b.default_scheme || '').toLowerCase().includes(q);
                const matchAca = (b.academic_year || '').toLowerCase().includes(q);
                return matchYear || matchLabel || matchScheme || matchAca;
            }
            return true;
        });
    }, [batches, filterStatus, search]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%' }}>
            {/* Header section */}
            {(!embedded || showHeader) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
                            Academic Management
                        </div>
                        <h2 style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', margin: 0, letterSpacing: '-0.03em' }}>
                            Academic Batches & Admission Cohorts
                        </h2>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', margin: '4px 0 0', maxWidth: '680px' }}>
                            Define and activate institutional admission cohorts. Any batch added here automatically updates all dropdowns in Class rosters, Faculty analytics, Merit lists, and VTU result reports.
                        </p>
                    </div>

                    <button
                        onClick={loadBatches}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--surface-low)',
                            border: '1px solid var(--border)',
                            color: 'var(--tx-main)',
                            padding: '8px 14px',
                            borderRadius: '10px',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>refresh</span>
                        Refresh Batches
                    </button>
                </div>
            )}

            {/* Telemetry Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Configured Batches</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>calendar_month</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)' }}>{totalBatches}</div>
                    <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>{activeBatches} active for admission/filtering</div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Enrolled Students</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--green, #10B981)' }}>school</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--green, #10B981)' }}>{totalStudents}</div>
                    <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>across all academic batches</div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Class Rosters</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--blue, #3B82F6)' }}>groups</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--blue, #3B82F6)' }}>{totalClasses}</div>
                    <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>assigned to batches</div>
                </div>

                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Zero Data Loss</span>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--amber, #F59E0B)' }}>verified_user</span>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)', marginTop: '4px' }}>Additive Architecture</div>
                    <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '2px' }}>Existing marks & classes preserved</div>
                </div>
            </div>

            {/* Action Feedback Message */}
            {actionMessage && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '10px',
                    background: actionMessage.type === 'error' ? 'var(--red-bg, rgba(239, 68, 68, 0.1))' : 'var(--green-bg, rgba(16, 185, 129, 0.1))',
                    border: `1px solid ${actionMessage.type === 'error' ? 'var(--red, #EF4444)' : 'var(--green, #10B981)'}`,
                    color: actionMessage.type === 'error' ? 'var(--red, #EF4444)' : 'var(--green, #10B981)',
                    fontSize: '13px',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <span>{actionMessage.text}</span>
                    <button
                        onClick={() => setActionMessage(null)}
                        style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 900 }}
                    >
                        ✕
                    </button>
                </div>
            )}

            {/* Add New Batch Card */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span className="material-icons-round" style={{ fontSize: '22px', color: 'var(--primary)' }}>add_circle</span>
                    <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>Register New Academic Batch</h2>
                </div>

                <form onSubmit={handleCreateBatch} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', alignItems: 'flex-end' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                            Batch Year (4 Digits) *
                        </label>
                        <input
                            type="text"
                            value={formYear}
                            onChange={e => handleYearChange(e.target.value)}
                            placeholder="e.g. 2026, 2027"
                            maxLength={4}
                            required
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                color: 'var(--tx-main)',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                fontSize: '14px',
                                fontWeight: 700,
                                height: '42px'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                            Display Title / Cohort
                        </label>
                        <input
                            type="text"
                            value={formLabel}
                            onChange={e => setFormLabel(e.target.value)}
                            placeholder="e.g. Batch 2026–30 (1st Year)"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                color: 'var(--tx-main)',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                fontSize: '14px',
                                fontWeight: 600,
                                height: '42px'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', letterSpacing: '0.04em' }}>
                            Academic Session
                        </label>
                        <input
                            type="text"
                            value={formAcademicYear}
                            onChange={e => setFormAcademicYear(e.target.value)}
                            placeholder="e.g. 2026-2027"
                            style={{
                                width: '100%',
                                boxSizing: 'border-box',
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                color: 'var(--tx-main)',
                                padding: '10px 14px',
                                borderRadius: '10px',
                                fontSize: '14px',
                                height: '42px'
                            }}
                        />
                    </div>

                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                Curriculum Scheme
                            </label>
                            {formScheme === '__custom__' && (
                                <button
                                    type="button"
                                    onClick={() => { setFormScheme(parseInt(formYear, 10) >= 2026 ? formYear : '2025'); setCustomScheme(''); }}
                                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                                >
                                    ← Choose standard
                                </button>
                            )}
                        </div>
                        {formScheme !== '__custom__' ? (
                            <select
                                value={formScheme}
                                onChange={e => {
                                    if (e.target.value === '__custom__') {
                                        setFormScheme('__custom__');
                                        setCustomScheme('');
                                    } else {
                                        setFormScheme(e.target.value);
                                    }
                                }}
                                style={{
                                    width: '100%',
                                    boxSizing: 'border-box',
                                    background: 'var(--surface-low)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--tx-main)',
                                    padding: '10px 14px',
                                    borderRadius: '10px',
                                    fontSize: '14px',
                                    fontWeight: 600,
                                    cursor: 'pointer',
                                    height: '42px'
                                }}
                            >
                                {availableSchemes.map(s => (
                                    <option key={s} value={s}>{formatSchemeLabel(s)}</option>
                                ))}
                                <option value="__custom__">+ Add New / Custom Scheme...</option>
                            </select>
                        ) : (
                            <div style={{ position: 'relative', width: '100%' }}>
                                <input
                                    type="text"
                                    placeholder="e.g. 2026, 2027, NEP-2026"
                                    value={customScheme}
                                    onChange={e => setCustomScheme(e.target.value)}
                                    autoFocus
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        background: 'var(--surface-low)',
                                        border: '2px solid var(--primary)',
                                        color: 'var(--tx-main)',
                                        padding: '10px 38px 10px 14px',
                                        borderRadius: '10px',
                                        fontSize: '14px',
                                        fontWeight: 600,
                                        outline: 'none',
                                        height: '42px'
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => { setFormScheme(parseInt(formYear, 10) >= 2026 ? formYear : '2025'); setCustomScheme(''); }}
                                    title="Cancel and choose from standard schemes"
                                    style={{
                                        position: 'absolute',
                                        right: '8px',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        background: 'rgba(0,0,0,0.06)',
                                        border: 'none',
                                        color: 'var(--tx-muted)',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        width: '26px',
                                        height: '26px',
                                        borderRadius: '50%',
                                        fontSize: '13px',
                                        fontWeight: 800
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        )}
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={submitting || !formYear}
                            style={{
                                background: 'var(--primary)',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '10px',
                                padding: '10px 20px',
                                fontSize: '14px',
                                fontWeight: 800,
                                cursor: submitting || !formYear ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px',
                                width: '100%',
                                height: '42px',
                                justifyContent: 'center',
                                whiteSpace: 'nowrap',
                                boxShadow: 'var(--shadow-sm)',
                                opacity: submitting || !formYear ? 0.6 : 1,
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                {submitting ? 'hourglass_top' : 'check'}
                            </span>
                            {submitting ? 'Adding...' : `Add Batch ${formYear || ''}`}
                        </button>
                    </div>
                </form>
            </div>

            {/* Batches Roster & Management Section */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--tx-muted)' }}>list_alt</span>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>Registered Academic Batches</h3>
                        <span style={{ fontSize: '12px', background: 'var(--surface-low)', padding: '2px 8px', borderRadius: '12px', color: 'var(--tx-dim)', fontWeight: 700 }}>
                            {visibleBatches.length} of {batches.length}
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search batches..."
                            style={{
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                color: 'var(--tx-main)',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                width: '180px'
                            }}
                        />

                        <select
                            value={filterStatus}
                            onChange={e => setFilterStatus(e.target.value)}
                            style={{
                                background: 'var(--surface-low)',
                                border: '1px solid var(--border)',
                                color: 'var(--tx-main)',
                                padding: '6px 10px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                cursor: 'pointer'
                            }}
                        >
                            <option value="all">All Statuses</option>
                            <option value="active">Active Only</option>
                            <option value="inactive">Archived Only</option>
                        </select>
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                        <LoadingState label="Loading academic batches..." />
                    </div>
                ) : error ? (
                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--red, #EF4444)' }}>
                        <p>{error}</p>
                        <button onClick={loadBatches} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', padding: '6px 12px', borderRadius: '8px', color: 'var(--tx-main)', cursor: 'pointer' }}>Retry</button>
                    </div>
                ) : visibleBatches.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                        No academic batches match the current filter.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    <th style={{ padding: '12px 16px' }}>Batch Code</th>
                                    <th style={{ padding: '12px 16px' }}>Cohort Label</th>
                                    <th style={{ padding: '12px 16px' }}>Academic Standing</th>
                                    <th style={{ padding: '12px 16px' }}>Session / Scheme</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Enrolled Students</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Classes</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visibleBatches.map(b => {
                                    const isActive = b.is_active !== false;
                                    const standing = b.standing || computeBatchStanding(b.year);
                                    const gradClass = b.graduatingClass || computeGraduatingClass(b.year);

                                    return (
                                        <tr
                                            key={b.year}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                opacity: isActive ? 1 : 0.6,
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ fontWeight: 900, fontSize: '15px', color: 'var(--tx-main)', letterSpacing: '-0.01em' }}>
                                                    Batch {b.year}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                                    {gradClass}
                                                </div>
                                            </td>

                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ fontWeight: 700, color: 'var(--tx-main)' }}>
                                                    {b.label || computeBatchLabel(b.year)}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                    Intake: {b.year} · Grad: {parseInt(b.year, 10) + 4}
                                                </div>
                                            </td>

                                            <td style={{ padding: '14px 16px' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    fontSize: '11px',
                                                    fontWeight: 800,
                                                    background: standing.includes('1st') ? 'var(--blue-bg, rgba(59, 130, 246, 0.1))' :
                                                                standing.includes('Final') ? 'var(--amber-bg, rgba(245, 158, 11, 0.1))' :
                                                                standing.includes('Graduated') ? 'var(--surface-low)' : 'var(--green-bg, rgba(16, 185, 129, 0.1))',
                                                    color: standing.includes('1st') ? 'var(--blue, #3B82F6)' :
                                                           standing.includes('Final') ? 'var(--amber, #F59E0B)' :
                                                           standing.includes('Graduated') ? 'var(--tx-dim)' : 'var(--green, #10B981)'
                                                }}>
                                                    {standing}
                                                </span>
                                            </td>

                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ fontWeight: 600, color: 'var(--tx-main)' }}>
                                                    {b.academic_year || `${b.year}-${Number(b.year) + 1}`}
                                                </div>
                                                <div style={{ fontSize: '11px', color: 'var(--primary)', fontWeight: 700, marginTop: '2px' }}>
                                                    {b.default_scheme ? `${b.default_scheme} Scheme` : '2025 Scheme'}
                                                </div>
                                            </td>

                                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                <span style={{
                                                    fontWeight: 800,
                                                    fontSize: '14px',
                                                    color: (b.studentCount || 0) > 0 ? 'var(--tx-main)' : 'var(--tx-dim)'
                                                }}>
                                                    {b.studentCount || 0}
                                                </span>
                                                {(b.activeStudentCount !== undefined && b.activeStudentCount < (b.studentCount || 0)) && (
                                                    <div style={{ fontSize: '10px', color: 'var(--amber)' }}>
                                                        ({b.activeStudentCount} active)
                                                    </div>
                                                )}
                                            </td>

                                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                <span style={{
                                                    fontWeight: 800,
                                                    fontSize: '14px',
                                                    color: (b.classCount || 0) > 0 ? 'var(--tx-main)' : 'var(--tx-dim)'
                                                }}>
                                                    {b.classCount || 0}
                                                </span>
                                            </td>

                                            <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                                                <button
                                                    onClick={() => handleToggleActive(b)}
                                                    title="Click to toggle active status"
                                                    style={{
                                                        border: 'none',
                                                        borderRadius: '20px',
                                                        padding: '4px 10px',
                                                        fontSize: '11px',
                                                        fontWeight: 800,
                                                        cursor: 'pointer',
                                                        background: isActive ? 'var(--green-bg, rgba(16, 185, 129, 0.15))' : 'var(--surface-low)',
                                                        color: isActive ? 'var(--green, #10B981)' : 'var(--tx-dim)'
                                                    }}
                                                >
                                                    {isActive ? '● Active' : '○ Inactive'}
                                                </button>
                                            </td>

                                            <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                                                    <button
                                                        onClick={() => openEditModal(b)}
                                                        style={{
                                                            background: 'var(--surface-low)',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '6px',
                                                            padding: '4px 8px',
                                                            fontSize: '12px',
                                                            fontWeight: 700,
                                                            color: 'var(--tx-main)',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        Edit
                                                    </button>

                                                    <button
                                                        onClick={() => handleDeleteBatch(b)}
                                                        title="Archive or Delete Batch"
                                                        style={{
                                                            background: 'transparent',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: '6px',
                                                            padding: '4px 8px',
                                                            fontSize: '12px',
                                                            fontWeight: 700,
                                                            color: 'var(--red, #EF4444)',
                                                            cursor: 'pointer'
                                                        }}
                                                    >
                                                        {(b.studentCount || 0) > 0 ? 'Archive' : 'Delete'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {editingBatch && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.65)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: 'var(--surface)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '480px',
                        padding: '24px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.35)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>
                                Edit Batch {editingBatch.year}
                            </h3>
                            <button
                                onClick={() => setEditingBatch(null)}
                                style={{ background: 'transparent', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', fontSize: '20px' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                    Cohort Title / Label
                                </label>
                                <input
                                    type="text"
                                    value={editLabel}
                                    onChange={e => setEditLabel(e.target.value)}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        background: 'var(--surface-low)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--tx-main)',
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        fontSize: '14px',
                                        fontWeight: 600
                                    }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                    Academic Session
                                </label>
                                <input
                                    type="text"
                                    value={editAcademicYear}
                                    onChange={e => setEditAcademicYear(e.target.value)}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        background: 'var(--surface-low)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--tx-main)',
                                        padding: '10px 14px',
                                        borderRadius: '10px',
                                        fontSize: '14px'
                                    }}
                                />
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>
                                        Curriculum Scheme
                                    </label>
                                    {editScheme === '__custom__' && (
                                        <button
                                            type="button"
                                            onClick={() => setEditScheme('2025')}
                                            style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}
                                        >
                                            ← Choose from list
                                        </button>
                                    )}
                                </div>
                                {editScheme !== '__custom__' ? (
                                    <select
                                        value={editScheme}
                                        onChange={e => {
                                            if (e.target.value === '__custom__') {
                                                setEditScheme('__custom__');
                                                setEditCustomScheme('');
                                            } else {
                                                setEditScheme(e.target.value);
                                            }
                                        }}
                                        style={{
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            color: 'var(--tx-main)',
                                            padding: '10px 14px',
                                            borderRadius: '10px',
                                            fontSize: '14px',
                                            fontWeight: 600,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {availableSchemes.map(s => (
                                            <option key={s} value={s}>{formatSchemeLabel(s)}</option>
                                        ))}
                                        <option value="__custom__">+ Add New / Custom Scheme...</option>
                                    </select>
                                ) : (
                                    <div style={{ position: 'relative', width: '100%' }}>
                                        <input
                                            type="text"
                                            placeholder="e.g. 2026, 2027, NEP-2026"
                                            value={editCustomScheme}
                                            onChange={e => setEditCustomScheme(e.target.value)}
                                            autoFocus
                                            style={{
                                                width: '100%',
                                                boxSizing: 'border-box',
                                                background: 'var(--surface-low)',
                                                border: '2px solid var(--primary)',
                                                color: 'var(--tx-main)',
                                                padding: '10px 38px 10px 14px',
                                                borderRadius: '10px',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                outline: 'none',
                                                height: '42px'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setEditScheme('2025'); setEditCustomScheme(''); }}
                                            title="Cancel and choose from standard schemes"
                                            style={{
                                                position: 'absolute',
                                                right: '8px',
                                                top: '50%',
                                                transform: 'translateY(-50%)',
                                                background: 'rgba(0,0,0,0.06)',
                                                border: 'none',
                                                color: 'var(--tx-muted)',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                width: '26px',
                                                height: '26px',
                                                borderRadius: '50%',
                                                fontSize: '13px',
                                                fontWeight: 800
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
                                <input
                                    type="checkbox"
                                    id="edit-active-toggle"
                                    checked={editActive}
                                    onChange={e => setEditActive(e.target.checked)}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                                />
                                <label htmlFor="edit-active-toggle" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)', cursor: 'pointer' }}>
                                    Active (Visible in all platform dropdowns)
                                </label>
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                            <button
                                onClick={() => setEditingBatch(null)}
                                style={{
                                    background: 'var(--surface-low)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '10px',
                                    padding: '8px 16px',
                                    fontSize: '13px',
                                    fontWeight: 700,
                                    color: 'var(--tx-main)',
                                    cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                disabled={updating}
                                style={{
                                    background: 'var(--primary)',
                                    border: 'none',
                                    borderRadius: '10px',
                                    padding: '8px 18px',
                                    fontSize: '13px',
                                    fontWeight: 800,
                                    color: '#fff',
                                    cursor: updating ? 'not-allowed' : 'pointer',
                                    opacity: updating ? 0.7 : 1
                                }}
                            >
                                {updating ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
