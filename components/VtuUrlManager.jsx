'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Input, Button } from '@/components/ui/Foundation';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const SCHEME_LABELS = { '2022': '2022', '2025': '2025', 'mba': 'MBA', 'mca': 'MCA' };
const schemeLabel = (s) => SCHEME_LABELS[s] || s;

/**
 * Manages the VTU result-portal URL config for one faculty account (the
 * `faculty_vtu_urls` table is scoped per faculty_id — see
 * backend/scraper/discover_urls.py, which propagates newly discovered
 * portals to every approved faculty's rows). Used directly by the faculty
 * portal (facultyId comes from their own session) and, with a faculty
 * picker wrapped around it, by the admin portal so staff can manage any
 * faculty's portal config without needing that faculty to log in.
 */
export default function VtuUrlManager({ facultyId }) {
    const [selectedScheme, setSelectedScheme] = useState('2022'); // '2022' | '2025' | 'mba' | 'mca'
    const [vtuUrls, setVtuUrls] = useState([]);
    const [schemeCounts, setSchemeCounts] = useState({
        '2022': { total: 0, active: 0 },
        '2025': { total: 0, active: 0 },
        'mba': { total: 0, active: 0 },
        'mca': { total: 0, active: 0 }
    });
    const [newUrl, setNewUrl] = useState('');
    const [newExamName, setNewExamName] = useState('');
    const [newExamType, setNewExamType] = useState('REGULAR'); // 'REGULAR' | 'MAKEUP' | 'REVAL'
    // New portals always target whichever tab is open — no separate scheme
    // picker, so you can't accidentally register a URL into a scheme you
    // aren't looking at. The only extra choice is this opt-in checkbox,
    // offered only on the 2022/2025 tabs, for the one combo that's genuinely
    // useful: registering the same URL to both UG schemes at once.
    const [addToBothUgSchemes, setAddToBothUgSchemes] = useState(false);
    const [userOverrodeExamType, setUserOverrodeExamType] = useState(false);
    const [autoDetectedInfo, setAutoDetectedInfo] = useState(null);

    // Editing Portal State
    const [editingPortalId, setEditingPortalId] = useState(null);
    const [editExamName, setEditExamName] = useState('');
    const [editUrl, setEditUrl] = useState('');
    const [editScheme, setEditScheme] = useState('2022');
    const [editExamType, setEditExamType] = useState('REGULAR');
    const [editSaving, setEditSaving] = useState(false);
    const [editError, setEditError] = useState('');

    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [message, setMessage] = useState('');
    const [confirmingRemove, setConfirmingRemove] = useState(null);
    const [removing, setRemoving] = useState(false);
    const [portalTypeFilter, setPortalTypeFilter] = useState('ALL'); // 'ALL' | 'REVAL' | 'MAKEUP' | 'REGULAR'
    const [portalSearchFilter, setPortalSearchFilter] = useState('');

    const fetchVtuUrls = useCallback(async (schemeToFetch = selectedScheme, isManual = false) => {
        if (!facultyId) return;
        setFetching(true);
        const prevCount = vtuUrls.length;
        try {
            const res = await fetch(`/api/vtu-urls?faculty_id=${facultyId}&scheme=${schemeToFetch}&_t=${Date.now()}`, {
                cache: 'no-store',
                credentials: 'include'
            });
            const json = await res.json();
            if (json.success) {
                const newUrls = json.urls || [];
                setVtuUrls(newUrls);
                if (json.counts) {
                    setSchemeCounts(json.counts);
                }
                if (isManual) {
                    const diff = newUrls.length - prevCount;
                    if (diff > 0) {
                        setMessage(`✓ New portal URL(s) detected: +${diff} added dynamically!`);
                    } else {
                        setMessage(`✓ Live portal sync verified: All ${newUrls.length} portals are current.`);
                    }
                    setTimeout(() => setMessage(''), 4500);
                }
            }
        } catch (e) {
            console.error('[fetchVtuUrls error]', e);
        } finally {
            setFetching(false);
        }
    }, [selectedScheme, facultyId, vtuUrls.length]);

    useEffect(() => {
        if (!facultyId) return;
        fetchVtuUrls(selectedScheme);
        setAddToBothUgSchemes(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedScheme, facultyId]);

    const handleSchemeChange = (scheme) => {
        setSelectedScheme(scheme);
        setAddToBothUgSchemes(false);
        setMessage('');
        setPortalTypeFilter('ALL');
        setPortalSearchFilter('');
    };

    const normalizeScheme = useCallback((s) => {
        const sc = String(s || '').trim().toLowerCase();
        if (sc === 'mba') return 'mba';
        if (sc === 'mca' || sc === 'pg') return 'mca';
        if (sc === '2025' || sc === '2026') return '2025';
        return '2022';
    }, []);

    // Returns 'REVAL' | 'MAKEUP' | 'REGULAR' for a portal entry
    const getPortalCategory = useCallback((u) => {
        const combined = `${u?.exam_name || ''} ${u?.url || ''}`.toLowerCase();
        if (combined.includes('reval') || combined.includes('revaluation') || combined.includes(' rv') || combined.includes('/rv') || /rvce?cbcs|rvcbcs|rv[0-9]|rvspl|servcbcs/.test(combined)) return 'REVAL';
        if (combined.includes('makeup') || combined.includes('make up') || combined.includes('make-up') || combined.includes('summer') || combined.includes('special') || combined.includes('spl') || /secbcs|spljul/.test(combined)) return 'MAKEUP';
        return 'REGULAR';
    }, []);
    // Legacy alias used in badge labels
    const isRevalPortal = useCallback((u) => getPortalCategory(u) === 'REVAL', [getPortalCategory]);

    // Robust Auto-detect of exam type from BOTH URL and Exam Name
    useEffect(() => {
        const urlStr = (newUrl || '').trim();
        const nameStr = (newExamName || '').trim();
        if (!urlStr && !nameStr) {
            setAutoDetectedInfo(null);
            setUserOverrodeExamType(false);
            return;
        }

        const combined = `${urlStr} ${nameStr}`.toLowerCase();
        let detected = 'REGULAR';
        let reason = '';

        if (
            combined.includes('reval') || combined.includes('revaluation') ||
            combined.includes(' rv') || combined.includes('/rv') || combined.includes('rv_') ||
            /rvce?cbcs|rvcbcs|rv[0-9]|rvspl|servcbcs/i.test(combined)
        ) {
            detected = 'REVAL';
            reason = 'Revaluation (RV)';
        } else if (
            combined.includes('makeup') || combined.includes('make up') || combined.includes('make-up') ||
            combined.includes('summer') || combined.includes('special') || combined.includes('spl') ||
            /secbcs|spljul/i.test(combined)
        ) {
            detected = 'MAKEUP';
            reason = 'MakeUp / Summer';
        } else {
            detected = 'REGULAR';
            reason = 'Regular Semester';
        }

        setAutoDetectedInfo({ type: detected, reason });

        if (!userOverrodeExamType) {
            setNewExamType(detected);
        }

        // Auto-suggest clean exam title if user hasn't typed one yet
        if (!nameStr && urlStr.includes('vtu.ac.in')) {
            const urlPath = urlStr.split('/').pop() || '';
            const cleanPath = urlPath.replace(/index\.php|\.php/i, '');
            if (/d25j26rvcbcs/i.test(cleanPath)) setNewExamName('Dec 25/Jan 26 Revaluation');
            else if (/mj26rvcbcs/i.test(cleanPath)) setNewExamName('May/June 2026 Revaluation');
            else if (/mj26cbcs/i.test(cleanPath)) setNewExamName('May/June 2026 Regular');
            else if (/d25j26ecbcs/i.test(cleanPath)) setNewExamName('Dec 25/Jan 26 Regular');
            else if (/jjrvcbcs25/i.test(cleanPath)) setNewExamName('Jun/Jul 25 Reval');
            else if (/jjecbcs25/i.test(cleanPath)) setNewExamName('Jun/Jul 25 Regular');
            else if (/makeupecbcs25/i.test(cleanPath)) setNewExamName('Jun/Jul 25 MakeUp');
            else if (/servcbcs25/i.test(cleanPath)) setNewExamName('Jun/Jul 25 Summer Reval');
            else if (/secbcs25/i.test(cleanPath)) setNewExamName('Jun/Jul 25 Summer');
            else if (/djrvcbcs25/i.test(cleanPath)) setNewExamName('Dec 24/Jan 25 Reval');
            else if (/djcbcs25/i.test(cleanPath)) setNewExamName('Dec 24/Jan 25 Regular');
        }
    }, [newUrl, newExamName, userOverrodeExamType]);

    // Editing handlers
    const startEditingPortal = (portal) => {
        setEditingPortalId(portal.id);
        setEditExamName(portal.exam_name || '');
        setEditUrl(portal.url || '');
        setEditScheme(normalizeScheme(portal.scheme || selectedScheme));
        setEditExamType(getPortalCategory(portal));
        setEditError('');
    };

    const cancelEditingPortal = () => {
        setEditingPortalId(null);
        setEditError('');
    };

    const saveEditingPortal = async (portalId) => {
        if (!facultyId || !portalId) return;
        const cleanUrl = editUrl.trim();
        if (!cleanUrl.includes('results.vtu.ac.in')) {
            setEditError('URL must be an official results.vtu.ac.in link.');
            return;
        }

        const rawName = (editExamName || cleanUrl).trim();
        const lower = rawName.toLowerCase();
        const typeKeywords = {
            REVAL:   ['reval', 'revaluation', ' rv'],
            MAKEUP:  ['makeup', 'make up', 'make-up', 'summer', 'special', 'spl'],
            REGULAR: [],
        };
        const alreadyLabelled = (typeKeywords[editExamType] || []).some(kw => lower.includes(kw));
        const typeSuffixes = { REVAL: ' Revaluation', MAKEUP: ' MakeUp', REGULAR: '' };
        const finalExamName = alreadyLabelled ? rawName : `${rawName}${typeSuffixes[editExamType] || ''}`;

        setEditSaving(true);
        setEditError('');
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: portalId,
                    faculty_id: facultyId,
                    url: cleanUrl,
                    exam_name: finalExamName,
                    scheme: editScheme
                })
            });
            const json = await res.json();
            if (json.success) {
                setVtuUrls(prev => prev.map(item => {
                    if (item.id === portalId) {
                        return { ...item, url: cleanUrl, exam_name: finalExamName, scheme: editScheme };
                    }
                    return item;
                }));
                if (editScheme !== selectedScheme) {
                    fetchVtuUrls(selectedScheme);
                }
                broadcastUrlChange();
                setMessage(`✓ Portal "${finalExamName}" updated successfully!`);
                setTimeout(() => setMessage(''), 4000);
                setEditingPortalId(null);
            } else {
                setEditError(json.error || 'Failed to update portal.');
            }
        } catch (err) {
            setEditError('Network error while saving changes.');
        } finally {
            setEditSaving(false);
        }
    };

    const filteredVtuUrls = useMemo(() => {
        return (vtuUrls || []).filter(u => {
            if (portalTypeFilter !== 'ALL' && getPortalCategory(u) !== portalTypeFilter) return false;
            if (portalSearchFilter.trim()) {
                const q = portalSearchFilter.toLowerCase();
                const matchName = (u.exam_name || '').toLowerCase().includes(q);
                const matchUrl = (u.url || '').toLowerCase().includes(q);
                if (!matchName && !matchUrl) return false;
            }
            return true;
        });
    }, [vtuUrls, portalTypeFilter, portalSearchFilter]);

    const revalCount   = useMemo(() => (vtuUrls || []).filter(u => getPortalCategory(u) === 'REVAL').length,   [vtuUrls]);
    const makeupCount  = useMemo(() => (vtuUrls || []).filter(u => getPortalCategory(u) === 'MAKEUP').length,  [vtuUrls]);
    const regularCount = useMemo(() => (vtuUrls || []).filter(u => getPortalCategory(u) === 'REGULAR').length, [vtuUrls]);

    const broadcastUrlChange = () => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vtu_urls_updated'));
            try {
                localStorage.setItem('vtu_urls_last_sync', String(Date.now()));
            } catch (_) {}
        }
    };

    const addVtuUrl = async () => {
        if (!facultyId) return;
        if (!newUrl.includes('results.vtu.ac.in')) {
            setMessage('URL must be from results.vtu.ac.in');
            return;
        }

        // Duplicate URL validation (normalized comparison)
        const cleanIncoming = newUrl.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
        const duplicate = vtuUrls.find(u => {
            const cleanExisting = (u.url || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
            return cleanExisting === cleanIncoming;
        });

        if (duplicate) {
            setMessage(`⚠️ Duplicate URL: This portal is already registered as "${duplicate.exam_name}" for ${schemeLabel(duplicate.scheme || selectedScheme)} Scheme.`);
            return;
        }

        const effectiveScheme = (addToBothUgSchemes && (selectedScheme === '2022' || selectedScheme === '2025'))
            ? 'both'
            : selectedScheme;

        // Build the final exam name — append type suffix if not already implied by the name
        const rawName = newExamName.trim();
        const lower = rawName.toLowerCase();
        const typeKeywords = {
            REVAL:   ['reval', 'revaluation', ' rv'],
            MAKEUP:  ['makeup', 'make up', 'make-up', 'summer', 'special', 'spl'],
            REGULAR: [], // No suffix needed; Regular is the default
        };
        const alreadyLabelled = (typeKeywords[newExamType] || []).some(kw => lower.includes(kw));
        const typeSuffixes = { REVAL: ' Revaluation', MAKEUP: ' MakeUp', REGULAR: '' };
        const finalExamName = rawName
            ? (alreadyLabelled ? rawName : `${rawName}${typeSuffixes[newExamType] || ''}`)
            : '';

        setLoading(true);
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: newUrl.trim(),
                    exam_name: finalExamName,
                    faculty_id: facultyId,
                    scheme: effectiveScheme,
                    is_active: true
                }),
            });
            const json = await res.json();
            if (json.success) {
                setNewUrl('');
                setNewExamName('');
                setNewExamType('REGULAR');
                setUserOverrodeExamType(false);
                const addedToLabel = effectiveScheme === 'both'
                    ? 'both 2022 & 2025 Schemes'
                    : `${schemeLabel(effectiveScheme)} Scheme`;
                setMessage(`✓ URL registered successfully for ${addedToLabel}!`);
                broadcastUrlChange();
                fetchVtuUrls(selectedScheme);
            } else {
                setMessage(json.error || 'Failed to add URL.');
            }
        } catch (e) {
            setMessage('Network error.');
        } finally {
            setLoading(false);
        }
    };

    const toggleVtuUrl = async (urlObj) => {
        if (!facultyId) return;
        const nextState = !urlObj.is_active;

        // Optimistic update
        setVtuUrls(prev => prev.map(u => u.id === urlObj.id ? { ...u, is_active: nextState } : u));
        setSchemeCounts(prev => ({
            ...prev,
            [selectedScheme]: {
                ...prev[selectedScheme],
                active: Math.max(0, (prev[selectedScheme]?.active || 0) + (nextState ? 1 : -1))
            }
        }));
        broadcastUrlChange();

        try {
            await fetch('/api/vtu-urls', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: urlObj.id,
                    faculty_id: facultyId,
                    is_active: nextState
                }),
            });
            broadcastUrlChange();
            fetchVtuUrls(selectedScheme);
        } catch (e) {
            fetchVtuUrls(selectedScheme);
        }
    };

    const toggleAllUrls = async (is_active) => {
        if (!facultyId) return;
        try {
            await fetch('/api/vtu-urls', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    faculty_id: facultyId,
                    is_active,
                    scheme: selectedScheme
                }),
            });
            broadcastUrlChange();
            fetchVtuUrls(selectedScheme);
            setMessage(is_active
                ? `✓ All ${schemeLabel(selectedScheme)} Scheme URLs enabled for scraping.`
                : `✓ All ${schemeLabel(selectedScheme)} Scheme URLs disabled for scraping.`
            );
        } catch (e) {
            setMessage('Network error.');
        }
    };

    const restoreDefaults = async () => {
        if (!facultyId) return;
        setFetching(true);
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    faculty_id: facultyId,
                    action: 'restore_defaults',
                    scheme: selectedScheme
                })
            });
            const json = await res.json();
            if (json.success) {
                setMessage(selectedScheme === '2022'
                    ? '✓ All 26 official 2022 Scheme portals restored and enabled!'
                    : `✓ All official ${schemeLabel(selectedScheme)} Scheme portals restored and enabled!`
                );
                broadcastUrlChange();
                fetchVtuUrls(selectedScheme);
            }
        } catch (e) {
            setMessage('Failed to restore default portals.');
        } finally {
            setFetching(false);
        }
    };

    const removeVtuUrl = async (id) => {
        if (!facultyId) return;
        setRemoving(true);
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'DELETE',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, faculty_id: facultyId }),
            });
            const json = await res.json();
            broadcastUrlChange();
            fetchVtuUrls(selectedScheme);
            setMessage(json.message || '✓ URL updated in portal configuration.');
        } catch (e) {
            setMessage('Failed to remove URL.');
        } finally {
            setRemoving(false);
            setConfirmingRemove(null);
        }
    };

    const c = {
        badge: (active) => ({
            fontSize: '10px', fontWeight: 800, padding: '4px 10px', borderRadius: 'var(--radius-2)',
            background: active ? 'var(--green-bg, #e6f7ed)' : 'var(--red-bg, #fde8e8)',
            color: active ? 'var(--green, #0d9f57)' : 'var(--red, #e02424)',
            letterSpacing: '0.04em'
        }),
        schemeBadge: (scheme) => {
            const color = scheme === '2025' ? '#8b5cf6' : scheme === 'mba' ? '#d97706' : scheme === 'mca' ? '#0d9488' : '#2563eb';
            return {
                fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: 'var(--radius-2)',
                background: `${color}1f`,
                color,
                border: `1px solid ${color}4d`,
                display: 'inline-flex', alignItems: 'center', gap: '4px'
            };
        },
        typeBadge: (category) => {
            const cat = typeof category === 'boolean' ? (category ? 'REVAL' : 'REGULAR') : category;
            if (cat === 'REVAL') return {
                fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                textTransform: 'uppercase', letterSpacing: '0.03em',
                background: 'rgba(245, 158, 11, 0.12)', color: '#D97706',
                border: '1px solid rgba(245, 158, 11, 0.25)'
            };
            if (cat === 'MAKEUP') return {
                fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                textTransform: 'uppercase', letterSpacing: '0.03em',
                background: 'rgba(139, 92, 246, 0.12)', color: '#7C3AED',
                border: '1px solid rgba(139, 92, 246, 0.25)'
            };
            return {
                fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                textTransform: 'uppercase', letterSpacing: '0.03em',
                background: 'rgba(59, 130, 246, 0.12)', color: '#2563EB',
                border: '1px solid rgba(59, 130, 246, 0.25)'
            };
        },
        quickFilterBtn: (active) => ({
            padding: '6px 12px', borderRadius: 'var(--radius-3, 6px)',
            border: `1px solid ${active ? 'var(--primary, #2563eb)' : 'var(--border, #e2e8f0)'}`,
            background: active ? 'rgba(37, 99, 235, 0.1)' : 'var(--surface, #fff)',
            color: active ? 'var(--primary, #2563eb)' : 'var(--tx-muted, #64748b)',
            fontWeight: 700, fontSize: '12px', cursor: 'pointer'
        }),
        msg: (ok) => ({
            fontSize: '13px', fontWeight: 700, color: ok ? 'var(--green, #0d9f57)' : 'var(--red, #e02424)',
            marginBottom: 'var(--space-4)',
            padding: '10px 14px',
            background: ok ? 'var(--green-bg, #e6f7ed)' : 'var(--red-bg, #fde8e8)',
            borderRadius: 'var(--radius-4)',
            border: `1px solid ${ok ? 'rgba(13, 159, 87, 0.2)' : 'rgba(224, 36, 36, 0.2)'}`
        }),
        tabsContainer: {
            display: 'flex',
            gap: '8px',
            background: 'var(--surface-low, #f8fafc)',
            padding: '6px',
            borderRadius: 'var(--radius-6, 12px)',
            border: '1px solid var(--border, #e2e8f0)',
            marginBottom: 'var(--space-6, 24px)',
            flexWrap: 'wrap'
        },
        tabButton: (active) => ({
            flex: '1 1 200px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px 20px',
            borderRadius: 'var(--radius-4, 8px)',
            border: 'none',
            background: active ? 'var(--surface, #ffffff)' : 'transparent',
            boxShadow: active ? '0 2px 8px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' : 'none',
            color: active ? 'var(--tx-main, #0f172a)' : 'var(--tx-muted, #64748b)',
            fontWeight: active ? 800 : 600,
            fontSize: '14px',
            cursor: 'pointer',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
        })
    };

    if (!facultyId) {
        return (
            <div style={{
                textAlign: 'center', padding: '48px 24px', background: 'var(--surface-low)',
                borderRadius: 'var(--radius-6)', border: '1px dashed var(--border)'
            }}>
                <span className="material-icons-round" style={{ fontSize: '36px', color: 'var(--tx-dim)', marginBottom: '8px', display: 'block' }}>
                    person_search
                </span>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-main)' }}>
                    Select a faculty member above to manage their VTU result portals.
                </div>
            </div>
        );
    }

    return (
        <div className="gf-fade-up">
            {/* Scheme Tab Selector */}
            <div style={c.tabsContainer} role="tablist" aria-label="Curriculum Schemes">
                <button
                    type="button"
                    role="tab"
                    aria-selected={selectedScheme === '2022'}
                    style={c.tabButton(selectedScheme === '2022')}
                    onClick={() => handleSchemeChange('2022')}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', color: selectedScheme === '2022' ? 'var(--primary, #2563eb)' : 'inherit' }}>
                        auto_stories
                    </span>
                    <span>2022 Scheme (NEP)</span>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: selectedScheme === '2022' ? 'rgba(37, 99, 235, 0.12)' : 'var(--border, #e2e8f0)',
                        color: selectedScheme === '2022' ? 'var(--primary, #2563eb)' : 'var(--tx-dim, #94a3b8)'
                    }}>
                        {schemeCounts['2022']?.active ?? 0}/{schemeCounts['2022']?.total ?? 0} Active
                    </span>
                </button>

                <button
                    type="button"
                    role="tab"
                    aria-selected={selectedScheme === '2025'}
                    style={c.tabButton(selectedScheme === '2025')}
                    onClick={() => handleSchemeChange('2025')}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', color: selectedScheme === '2025' ? '#8b5cf6' : 'inherit' }}>
                        school
                    </span>
                    <span>2025 Scheme</span>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: selectedScheme === '2025' ? 'rgba(139, 92, 246, 0.12)' : 'var(--border, #e2e8f0)',
                        color: selectedScheme === '2025' ? '#8b5cf6' : 'var(--tx-dim, #94a3b8)'
                    }}>
                        {schemeCounts['2025']?.active ?? 0}/{schemeCounts['2025']?.total ?? 0} Active
                    </span>
                </button>

                <button
                    type="button"
                    role="tab"
                    aria-selected={selectedScheme === 'mba'}
                    style={c.tabButton(selectedScheme === 'mba')}
                    onClick={() => handleSchemeChange('mba')}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', color: selectedScheme === 'mba' ? '#d97706' : 'inherit' }}>
                        workspace_premium
                    </span>
                    <span>MBA Scheme</span>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: selectedScheme === 'mba' ? 'rgba(217, 119, 6, 0.12)' : 'var(--border, #e2e8f0)',
                        color: selectedScheme === 'mba' ? '#d97706' : 'var(--tx-dim, #94a3b8)'
                    }}>
                        {schemeCounts['mba']?.active ?? 0}/{schemeCounts['mba']?.total ?? 0} Active
                    </span>
                </button>

                <button
                    type="button"
                    role="tab"
                    aria-selected={selectedScheme === 'mca'}
                    style={c.tabButton(selectedScheme === 'mca')}
                    onClick={() => handleSchemeChange('mca')}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', color: selectedScheme === 'mca' ? '#0d9488' : 'inherit' }}>
                        memory
                    </span>
                    <span>MCA Scheme</span>
                    <span style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '12px',
                        background: selectedScheme === 'mca' ? 'rgba(13, 148, 136, 0.12)' : 'var(--border, #e2e8f0)',
                        color: selectedScheme === 'mca' ? '#0d9488' : 'var(--tx-dim, #94a3b8)'
                    }}>
                        {schemeCounts['mca']?.active ?? 0}/{schemeCounts['mca']?.total ?? 0} Active
                    </span>
                </button>
            </div>

            {(selectedScheme === 'mba' || selectedScheme === 'mca') && (
                <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: '10px',
                    padding: '12px 16px', borderRadius: 'var(--radius-4, 8px)',
                    background: selectedScheme === 'mba' ? 'rgba(217, 119, 6, 0.08)' : 'rgba(13, 148, 136, 0.08)',
                    border: `1px solid ${selectedScheme === 'mba' ? 'rgba(217, 119, 6, 0.25)' : 'rgba(13, 148, 136, 0.25)'}`,
                    marginBottom: 'var(--space-5, 20px)', fontSize: '12.5px', color: 'var(--tx-main)'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '18px', color: selectedScheme === 'mba' ? '#d97706' : '#0d9488', marginTop: '1px' }}>info</span>
                    <span>
                        These portals are VTU&rsquo;s regular result-lookup forms — the same ones the B.E side already uses. VTU&rsquo;s exam-session
                        pages route every program&rsquo;s results (B.E, M.Tech, PG, B.Sc, etc.) through identical shared forms, so these are the
                        strongest known candidates for {selectedScheme === 'mba' ? 'MBA' : 'MCA'} lookups. This hasn&rsquo;t yet been confirmed
                        end-to-end against a real {selectedScheme === 'mba' ? 'MBA' : 'MCA'} USN — treat results here as provisional until verified.
                        MBA and MCA portals are configured separately here so either can be enabled, disabled, or scraped independently of the other.
                    </span>
                </div>
            )}

            <Card style={{ padding: 'clamp(var(--space-4), 4vw, var(--space-6))' }}>
                {/* Add New Result Portal Form */}
                <div style={{ marginBottom: 'var(--space-6)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)', flexWrap: 'wrap', gap: '8px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)' }}>
                            Add New Result Portal
                        </h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--tx-muted)' }}>
                            <span>Targeting:</span>
                            <span style={c.schemeBadge(selectedScheme)}>
                                {schemeLabel(selectedScheme)} Scheme
                            </span>
                        </div>
                    </div>

                    {message && <div style={c.msg(message.includes('✓'))}>{message}</div>}

                    {/* Row 1: URL + Exam Name */}
                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        <div style={{ flex: '2 1 240px', minWidth: '200px' }}>
                            <Input
                                label="VTU URL"
                                placeholder="https://results.vtu.ac.in/..."
                                value={newUrl}
                                onChange={e => setNewUrl(e.target.value)}
                            />
                        </div>
                        <div style={{ flex: '1 1 180px', minWidth: '150px' }}>
                            <Input
                                label="Exam Name"
                                placeholder="e.g. Dec 25/Jan 26"
                                value={newExamName}
                                onChange={e => setNewExamName(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Row 2: Prominent Exam Category Selector Cards (Regular / MakeUp / Reval) */}
                    <div style={{ marginTop: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                                    Exam Category / Type
                                </span>
                                <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                    (Required — Click to choose)
                                </span>
                            </div>
                            {autoDetectedInfo && (
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '5px',
                                    fontSize: '11.5px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                                    background: newExamType === 'REVAL' ? 'rgba(217, 119, 6, 0.12)' : newExamType === 'MAKEUP' ? 'rgba(124, 58, 237, 0.12)' : 'rgba(37, 99, 235, 0.12)',
                                    color: newExamType === 'REVAL' ? '#D97706' : newExamType === 'MAKEUP' ? '#7C3AED' : '#2563EB',
                                    border: `1px solid ${newExamType === 'REVAL' ? 'rgba(217, 119, 6, 0.3)' : newExamType === 'MAKEUP' ? 'rgba(124, 58, 237, 0.3)' : 'rgba(37, 99, 235, 0.3)'}`
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>auto_awesome</span>
                                    Auto-selected: <strong>{autoDetectedInfo.reason}</strong>
                                </span>
                            )}
                        </div>

                        {/* 3 Large, Visible, Tactile Cards */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                            {[
                                {
                                    key: 'REGULAR',
                                    title: 'Regular Exam',
                                    subtitle: 'Main semester examinations',
                                    icon: 'school',
                                    color: '#2563EB',
                                    activeBg: 'rgba(37, 99, 235, 0.08)',
                                    borderColor: '#2563EB'
                                },
                                {
                                    key: 'MAKEUP',
                                    title: 'MakeUp / Summer',
                                    subtitle: 'Backlogs, fast-track & special exams',
                                    icon: 'replay',
                                    color: '#7C3AED',
                                    activeBg: 'rgba(124, 58, 237, 0.08)',
                                    borderColor: '#7C3AED'
                                },
                                {
                                    key: 'REVAL',
                                    title: 'Revaluation (RV)',
                                    subtitle: 'Reval, re-totaling & review results',
                                    icon: 'fact_check',
                                    color: '#D97706',
                                    activeBg: 'rgba(217, 119, 6, 0.08)',
                                    borderColor: '#D97706'
                                },
                            ].map(card => {
                                const active = newExamType === card.key;
                                return (
                                    <button
                                        key={card.key}
                                        type="button"
                                        onClick={() => {
                                            setNewExamType(card.key);
                                            setUserOverrodeExamType(true);
                                        }}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '12px',
                                            padding: '12px 14px',
                                            borderRadius: 'var(--radius-4, 10px)',
                                            border: active ? `2px solid ${card.borderColor}` : '1.5px solid var(--border, #e2e8f0)',
                                            background: active ? card.activeBg : 'var(--surface, #ffffff)',
                                            boxShadow: active ? `0 2px 8px ${card.color}26` : 'none',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.18s ease'
                                        }}
                                    >
                                        <div style={{
                                            width: '36px', height: '36px', borderRadius: '8px',
                                            background: active ? card.color : 'var(--surface-low, #f1f5f9)',
                                            color: active ? '#ffffff' : card.color,
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            flexShrink: 0, transition: 'all 0.18s ease'
                                        }}>
                                            <span className="material-icons-round" style={{ fontSize: '20px' }}>{card.icon}</span>
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                <span style={{
                                                    fontWeight: 800, fontSize: '13px',
                                                    color: active ? card.color : 'var(--tx-main, #1e293b)'
                                                }}>
                                                    {card.title}
                                                </span>
                                                {active && (
                                                    <span className="material-icons-round" style={{ fontSize: '17px', color: card.color }}>
                                                        check_circle
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted, #64748b)', marginTop: '2px', fontWeight: 500 }}>
                                                {card.subtitle}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Row 3: Dual UG Registration + Register Button */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                        <div>
                            {(selectedScheme === '2022' || selectedScheme === '2025') && (
                                <label style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                                    fontSize: '12.5px', fontWeight: 600,
                                    color: 'var(--tx-muted)', cursor: 'pointer'
                                }}>
                                    <input
                                        type="checkbox"
                                        checked={addToBothUgSchemes}
                                        onChange={e => setAddToBothUgSchemes(e.target.checked)}
                                        style={{ width: '15px', height: '15px', cursor: 'pointer' }}
                                    />
                                    Also register this URL for the other UG scheme (2022 &amp; 2025 together)
                                </label>
                            )}
                        </div>

                        <div style={{ minWidth: '160px' }}>
                            <Button
                                variant="primary"
                                style={{ width: '100%', minHeight: '44px', fontWeight: 800, fontSize: '13px', opacity: loading ? 0.7 : 1 }}
                                onClick={addVtuUrl}
                                disabled={loading || !newUrl}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>add_link</span>
                                {loading ? 'Adding...' : 'Register URL'}
                            </Button>
                        </div>
                    </div>
                </div>

                <div style={{ height: '1px', background: 'var(--border)', margin: 'var(--space-6) 0' }} />

                {/* Configured Portals Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                Configured Portals ({vtuUrls.length})
                            </h3>
                            <span style={c.schemeBadge(selectedScheme)}>
                                {schemeLabel(selectedScheme)} Scheme
                            </span>
                        </div>
                        <p style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                            {schemeCounts[selectedScheme]?.active ?? 0} of {vtuUrls.length} portals currently enabled for {schemeLabel(selectedScheme)} Scheme scraping.
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                        <Button
                            onClick={() => fetchVtuUrls(selectedScheme, true)}
                            size="sm"
                            variant="ghost"
                            disabled={fetching}
                            style={{ color: 'var(--tx-main)', fontWeight: 700 }}
                            title="Refresh portals from database"
                        >
                            <span
                                className="material-icons-round"
                                style={{
                                    fontSize: '16px',
                                    marginRight: '4px',
                                    verticalAlign: 'text-bottom',
                                    animation: fetching ? 'spin 1s linear infinite' : 'none'
                                }}
                            >
                                refresh
                            </span>
                            {fetching ? 'Syncing...' : 'Refresh Portals'}
                        </Button>
                        <Button
                            onClick={restoreDefaults}
                            size="sm"
                            variant="ghost"
                            style={{ color: 'var(--primary, #2563eb)', fontWeight: 700 }}>
                            <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '4px', verticalAlign: 'text-bottom' }}>restart_alt</span>
                            Restore {selectedScheme === '2022' ? '26 Official Portals' : 'Official Portals'}
                        </Button>
                        <Button
                            onClick={() => toggleAllUrls(true)}
                            size="sm"
                            variant="ghost"
                            style={{ color: 'var(--green, #0d9f57)', fontWeight: 700 }}>
                            Enable All ({schemeLabel(selectedScheme)})
                        </Button>
                        <Button
                            onClick={() => toggleAllUrls(false)}
                            size="sm"
                            variant="ghost"
                            style={{ color: 'var(--red, #e02424)', fontWeight: 700 }}>
                            Disable All ({schemeLabel(selectedScheme)})
                        </Button>
                    </div>
                </div>

                {/* Regular / MakeUp / Reval Quick Filters + Search */}
                {!fetching && vtuUrls.length > 0 && (
                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            <button type="button" style={c.quickFilterBtn(portalTypeFilter === 'ALL')} onClick={() => setPortalTypeFilter('ALL')}>
                                All ({vtuUrls.length})
                            </button>
                            <button type="button" style={c.quickFilterBtn(portalTypeFilter === 'REGULAR')} onClick={() => setPortalTypeFilter('REGULAR')}>
                                Regular ({regularCount})
                            </button>
                            <button type="button" style={{
                                ...c.quickFilterBtn(portalTypeFilter === 'MAKEUP'),
                                ...(portalTypeFilter === 'MAKEUP' ? { borderColor: '#7C3AED', color: '#7C3AED', background: 'rgba(139,92,246,0.1)' } : {})
                            }} onClick={() => setPortalTypeFilter('MAKEUP')}>
                                MakeUp / Summer ({makeupCount})
                            </button>
                            <button type="button" style={{
                                ...c.quickFilterBtn(portalTypeFilter === 'REVAL'),
                                ...(portalTypeFilter === 'REVAL' ? { borderColor: '#D97706', color: '#D97706', background: 'rgba(245,158,11,0.1)' } : {})
                            }} onClick={() => setPortalTypeFilter('REVAL')}>
                                Reval ({revalCount})
                            </button>
                        </div>
                        <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
                            <input
                                type="text"
                                placeholder="Filter portals by exam name or URL..."
                                value={portalSearchFilter}
                                onChange={e => setPortalSearchFilter(e.target.value)}
                                style={{
                                    width: '100%', padding: '9px 12px', fontSize: '12.5px',
                                    borderRadius: 'var(--radius-3, 6px)', border: '1px solid var(--border, #e2e8f0)',
                                    background: 'var(--surface, #fff)', color: 'var(--tx-main)'
                                }}
                            />
                        </div>
                    </div>
                )}

                {/* Portals List */}
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {fetching ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>
                            Loading {schemeLabel(selectedScheme)} Scheme portals...
                        </div>
                    ) : filteredVtuUrls.map(u => (
                        editingPortalId === u.id ? (
                            <div key={u.id} style={{
                                background: 'var(--surface, #ffffff)',
                                borderRadius: 'var(--radius-6, 12px)',
                                border: '2px solid var(--primary, #2563eb)',
                                padding: 'var(--space-4) var(--space-5)',
                                boxShadow: '0 8px 24px rgba(37, 99, 235, 0.12)',
                                transition: 'all 0.2s ease'
                            }}>
                                {/* Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{ width: '30px', height: '30px', borderRadius: '6px', background: 'rgba(37,99,235,0.1)', color: 'var(--primary, #2563eb)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>edit_note</span>
                                        </div>
                                        <div>
                                            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                Editing Portal: {u.exam_name || 'Unnamed Exam'}
                                            </h4>
                                            <span style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>
                                                Modify title, destination URL, curriculum scheme, or exam type
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={cancelEditingPortal}
                                        style={{ background: 'none', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                                    >
                                        ✕ Cancel
                                    </button>
                                </div>

                                {editError && (
                                    <div style={{ ...c.msg(false), marginBottom: '12px' }}>{editError}</div>
                                )}

                                {/* Row 1: Inputs */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px', marginBottom: '14px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                                            Exam Name
                                        </label>
                                        <input
                                            type="text"
                                            value={editExamName}
                                            onChange={e => setEditExamName(e.target.value)}
                                            placeholder="e.g. Dec 25/Jan 26 Regular"
                                            style={{
                                                width: '100%', height: '38px', padding: '0 12px', fontSize: '13px',
                                                border: '1.5px solid var(--border, #e2e8f0)', borderRadius: '6px',
                                                background: 'var(--surface-low, #f8fafc)', color: 'var(--tx-main)', outline: 'none'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                                            VTU Results URL
                                        </label>
                                        <input
                                            type="url"
                                            value={editUrl}
                                            onChange={e => setEditUrl(e.target.value)}
                                            placeholder="https://results.vtu.ac.in/..."
                                            style={{
                                                width: '100%', height: '38px', padding: '0 12px', fontSize: '13px',
                                                fontFamily: 'monospace', border: '1.5px solid var(--border, #e2e8f0)', borderRadius: '6px',
                                                background: 'var(--surface-low, #f8fafc)', color: 'var(--tx-main)', outline: 'none'
                                            }}
                                        />
                                    </div>
                                </div>

                                {/* Row 2: Scheme & Exam Type Pickers */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '16px' }}>
                                    {/* Scheme */}
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                                            Curriculum Scheme
                                        </label>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {[
                                                { key: '2022', label: '2022 Scheme' },
                                                { key: '2025', label: '2025 Scheme' },
                                                { key: 'mba',  label: 'MBA' },
                                                { key: 'mca',  label: 'MCA' },
                                            ].map(s => {
                                                const active = editScheme === s.key;
                                                return (
                                                    <button
                                                        key={s.key}
                                                        type="button"
                                                        onClick={() => setEditScheme(s.key)}
                                                        style={{
                                                            padding: '6px 12px', borderRadius: '6px',
                                                            border: active ? '1.5px solid var(--primary, #2563eb)' : '1px solid var(--border, #e2e8f0)',
                                                            background: active ? 'rgba(37,99,235,0.1)' : 'var(--surface-low, #f8fafc)',
                                                            color: active ? 'var(--primary, #2563eb)' : 'var(--tx-muted, #64748b)',
                                                            fontWeight: active ? 800 : 600, fontSize: '12px', cursor: 'pointer'
                                                        }}
                                                    >
                                                        {s.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Exam Type */}
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                                            Exam Category
                                        </label>
                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                            {[
                                                { key: 'REGULAR', label: 'Regular', icon: 'school', color: '#2563EB', bg: 'rgba(37,99,235,0.1)' },
                                                { key: 'MAKEUP',  label: 'MakeUp / Summer', icon: 'replay', color: '#7C3AED', bg: 'rgba(124,58,237,0.1)' },
                                                { key: 'REVAL',   label: 'Revaluation', icon: 'fact_check', color: '#D97706', bg: 'rgba(217,119,6,0.1)' },
                                            ].map(opt => {
                                                const active = editExamType === opt.key;
                                                return (
                                                    <button
                                                        key={opt.key}
                                                        type="button"
                                                        onClick={() => setEditExamType(opt.key)}
                                                        style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                            padding: '6px 12px', borderRadius: '6px',
                                                            border: active ? `1.5px solid ${opt.color}` : '1px solid var(--border, #e2e8f0)',
                                                            background: active ? opt.bg : 'var(--surface-low, #f8fafc)',
                                                            color: active ? opt.color : 'var(--tx-muted, #64748b)',
                                                            fontWeight: active ? 800 : 600, fontSize: '12px', cursor: 'pointer'
                                                        }}
                                                    >
                                                        <span className="material-icons-round" style={{ fontSize: '14px' }}>{opt.icon}</span>
                                                        {opt.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Footer buttons */}
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center', paddingTop: '10px', borderTop: '1px solid var(--border, #e2e8f0)' }}>
                                    <button
                                        type="button"
                                        onClick={cancelEditingPortal}
                                        style={{
                                            padding: '8px 16px', borderRadius: '6px', border: '1px solid var(--border, #cbd5e1)',
                                            background: 'var(--surface, #ffffff)', color: 'var(--tx-muted, #64748b)', fontWeight: 700, fontSize: '12px', cursor: 'pointer'
                                        }}
                                    >
                                        Cancel
                                    </button>
                                    <Button
                                        variant="primary"
                                        onClick={() => saveEditingPortal(u.id)}
                                        disabled={editSaving || !editUrl.trim()}
                                        style={{ minHeight: '38px', padding: '0 20px', fontWeight: 800, fontSize: '12.5px' }}
                                    >
                                        {editSaving ? 'Saving...' : '✓ Save Changes'}
                                    </Button>
                                </div>
                            </div>
                        ) : (
                            <div key={u.id} style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                flexWrap: 'wrap', gap: 'var(--space-3)', minWidth: 0,
                                padding: 'var(--space-4) var(--space-5)', background: 'var(--surface-low)',
                                borderRadius: 'var(--radius-6)',
                                border: `1px solid ${u.is_active ? (selectedScheme === '2025' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(37, 99, 235, 0.4)') : 'var(--border)'}`,
                                opacity: u.is_active ? 1 : 0.6,
                                transition: 'all 0.2s ease'
                            }}>
                                <div style={{ overflow: 'hidden', minWidth: 0, flex: '1 1 220px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>
                                            {u.exam_name || 'Unnamed Exam'}
                                        </span>
                                        <span style={c.schemeBadge(u.scheme || selectedScheme)}>
                                            {schemeLabel(u.scheme || selectedScheme)}
                                        </span>
                                        <span style={c.typeBadge(getPortalCategory(u))}>
                                            {{ REVAL: 'Reval', MAKEUP: 'MakeUp', REGULAR: 'Regular' }[getPortalCategory(u)]}
                                        </span>
                                    </div>
                                    <div style={{
                                        fontSize: '11px',
                                        color: 'var(--tx-dim)',
                                        fontFamily: 'monospace',
                                        marginTop: 'var(--space-1)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis'
                                    }}>
                                        {u.url}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => toggleVtuUrl(u)}
                                        style={{
                                            padding: 'var(--space-2) var(--space-4)',
                                            minHeight: '38px',
                                            background: u.is_active ? 'var(--green-bg, #e6f7ed)' : 'var(--surface, #ffffff)',
                                            color: u.is_active ? 'var(--green, #0d9f57)' : 'var(--tx-muted, #64748b)',
                                            border: `1px solid ${u.is_active ? 'var(--green, #0d9f57)' : 'var(--border, #cbd5e1)'}`,
                                            borderRadius: 'var(--radius-3, 6px)',
                                            fontWeight: 800,
                                            fontSize: '11px',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            whiteSpace: 'nowrap',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        {u.is_active ? '✓ ENABLED' : 'DISABLED'}
                                    </button>
                                    <Button
                                        onClick={() => startEditingPortal(u)}
                                        variant="secondary"
                                        size="sm"
                                        style={{
                                            minHeight: '38px',
                                            padding: 'var(--space-2) var(--space-3)',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            fontWeight: 700,
                                            fontSize: '11.5px',
                                            color: 'var(--tx-main)'
                                        }}
                                        title={`Edit ${u.exam_name}`}
                                        aria-label="Edit Portal"
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary, #2563eb)' }}>edit</span>
                                        Edit
                                    </Button>
                                    <Button
                                        onClick={() => setConfirmingRemove(u)}
                                        variant="ghost"
                                        size="sm"
                                        style={{ padding: 'var(--space-2)', color: 'var(--tx-dim)' }}
                                        title={`Delete URL from ${schemeLabel(selectedScheme)} scheme`}
                                        aria-label="Delete"
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '20px' }}>delete_outline</span>
                                    </Button>
                                </div>
                            </div>
                        )
                    ))}

                    {!fetching && vtuUrls.length === 0 && (
                        <div style={{
                            textAlign: 'center',
                            padding: '48px 24px',
                            background: 'var(--surface-low)',
                            borderRadius: 'var(--radius-6)',
                            border: '1px dashed var(--border)'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '36px', color: 'var(--tx-dim)', marginBottom: '8px', display: 'block' }}>
                                link_off
                            </span>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--tx-main)', marginBottom: '4px' }}>
                                No portals configured for {schemeLabel(selectedScheme)} Scheme yet.
                            </div>
                            <p style={{ fontSize: '12px', color: 'var(--tx-muted)', maxWidth: '400px', margin: '0 auto' }}>
                                Add a new result URL above or click &ldquo;Register URL&rdquo; to set up your first result portal for {schemeLabel(selectedScheme)} Scheme.
                            </p>
                        </div>
                    )}

                    {!fetching && vtuUrls.length > 0 && filteredVtuUrls.length === 0 && (
                        <div style={{ padding: '24px', textAlign: 'center', fontSize: '12.5px', color: 'var(--tx-muted)' }}>
                            No matching portals found.
                        </div>
                    )}
                </div>
            </Card>

            <ConfirmDialog
                open={Boolean(confirmingRemove)}
                title={`Delete this ${schemeLabel(selectedScheme)} Scheme URL?`}
                description={`This removes "${confirmingRemove?.exam_name || confirmingRemove?.url || 'this portal'}" from ${schemeLabel(selectedScheme)} Scheme scraping configuration. This action cannot be undone.`}
                busy={removing}
                onCancel={() => setConfirmingRemove(null)}
                onConfirm={() => removeVtuUrl(confirmingRemove.id)}
            />
        </div>
    );
}

export { schemeLabel };
