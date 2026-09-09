'use client';

import { useState, useEffect, useCallback } from 'react';
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
    // New portals always target whichever tab is open — no separate scheme
    // picker, so you can't accidentally register a URL into a scheme you
    // aren't looking at. The only extra choice is this opt-in checkbox,
    // offered only on the 2022/2025 tabs, for the one combo that's genuinely
    // useful: registering the same URL to both UG schemes at once.
    const [addToBothUgSchemes, setAddToBothUgSchemes] = useState(false);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [message, setMessage] = useState('');
    const [confirmingRemove, setConfirmingRemove] = useState(null);
    const [removing, setRemoving] = useState(false);

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
    };

    const addVtuUrl = async () => {
        if (!facultyId) return;
        if (!newUrl.includes('results.vtu.ac.in')) {
            setMessage('URL must be from results.vtu.ac.in');
            return;
        }
        const effectiveScheme = (addToBothUgSchemes && (selectedScheme === '2022' || selectedScheme === '2025'))
            ? 'both'
            : selectedScheme;

        setLoading(true);
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: newUrl.trim(),
                    exam_name: newExamName.trim(),
                    faculty_id: facultyId,
                    scheme: effectiveScheme,
                    is_active: true
                }),
            });
            const json = await res.json();
            if (json.success) {
                setNewUrl('');
                setNewExamName('');
                const addedToLabel = effectiveScheme === 'both'
                    ? 'both 2022 & 2025 Schemes'
                    : `${schemeLabel(effectiveScheme)} Scheme`;
                setMessage(`✓ URL registered successfully for ${addedToLabel}!`);
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
                                placeholder="e.g. Dec 25/Jan 26 Regular"
                                value={newExamName}
                                onChange={e => setNewExamName(e.target.value)}
                            />
                        </div>
                        <div style={{ alignSelf: 'flex-end', minWidth: '130px' }}>
                            <Button
                                variant="primary"
                                style={{ width: '100%', minHeight: '42px', opacity: loading ? 0.7 : 1 }}
                                onClick={addVtuUrl}
                                disabled={loading || !newUrl}
                            >
                                {loading ? 'Adding...' : 'Register URL'}
                            </Button>
                        </div>
                    </div>

                    {(selectedScheme === '2022' || selectedScheme === '2025') && (
                        <label style={{
                            display: 'inline-flex', alignItems: 'center', gap: '8px',
                            marginTop: 'var(--space-3)', fontSize: '12.5px', fontWeight: 600,
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

                {/* Portals List */}
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {fetching ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>
                            Loading {schemeLabel(selectedScheme)} Scheme portals...
                        </div>
                    ) : vtuUrls.map(u => (
                        <div key={u.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            flexWrap: 'wrap', gap: 'var(--space-3)',
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
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexShrink: 0 }}>
                                <button
                                    type="button"
                                    onClick={() => toggleVtuUrl(u)}
                                    style={{
                                        padding: 'var(--space-2) var(--space-4)',
                                        minHeight: '40px',
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
