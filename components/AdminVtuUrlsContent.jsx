'use client';

import { useState, useEffect, useMemo } from 'react';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Foundation';
import { LoadingState } from '@/components/ui';
import VtuUrlManager from '@/components/VtuUrlManager';
import { getFacultyAssignments } from '../lib/api/admin-management';

/**
 * Institutional Admin VTU Result Portals Configuration.
 * Manages the institutional master VTU result portals (2022 / 2025 / MBA / MCA)
 * used across the college for automated scraping and student result fetches.
 */
export function AdminVtuUrlsContent({ embedded = false }) {
    const [faculty, setFaculty] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [selectedFacultyId, setSelectedFacultyId] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncMessage, setSyncMessage] = useState('');
    const [showFacultyOverride, setShowFacultyOverride] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                const data = await getFacultyAssignments();
                if (cancelled) return;
                const list = data?.faculty || [];
                setFaculty(list);
                if (list.length > 0) {
                    setSelectedFacultyId(list[0].id);
                }
            } catch (err) {
                if (!cancelled) setError(err?.message || 'Failed to load faculty list.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const selectedFaculty = useMemo(
        () => faculty.find(f => f.id === selectedFacultyId) || null,
        [faculty, selectedFacultyId]
    );

    const handleSyncAllFaculty = async () => {
        if (!selectedFacultyId) return;
        setSyncing(true);
        setSyncMessage('');
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    faculty_id: selectedFacultyId,
                    action: 'sync_all_faculty'
                })
            });
            const json = await res.json();
            if (json.success) {
                setSyncMessage(json.message || '✓ Portals synchronized across all faculty accounts in the institution!');
            } else {
                setSyncMessage(json.error || 'Failed to sync portals.');
            }
        } catch (err) {
            setSyncMessage('Network error while synchronizing portals.');
        } finally {
            setSyncing(false);
            setTimeout(() => setSyncMessage(''), 6000);
        }
    };

    return (
        <div style={{ padding: embedded ? '0' : 'var(--page-py) var(--page-px)', maxWidth: embedded ? 'none' : '1100px', margin: embedded ? '0' : '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            {!embedded && (
                <PageHeader>
                    <PageHeaderEyebrow>Institutional Scraper Configuration</PageHeaderEyebrow>
                    <PageHeaderTitle>VTU Result Portals</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Manage official VTU examination result portals (2022 Scheme NEP, 2025 Scheme, MBA, MCA) for college-wide scraping and student result fetches.
                    </PageHeaderSubtitle>
                </PageHeader>
            )}

            {/* Institutional Master Mode Banner */}
            <div style={{
                background: 'var(--surface-low)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '16px 20px',
                marginBottom: '20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>domain</span>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>
                            Institutional Master Portals
                        </span>
                        <span style={{
                            fontSize: '10px',
                            fontWeight: 800,
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: '#6366F1',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            textTransform: 'uppercase',
                            letterSpacing: '0.04em'
                        }}>
                            College Master
                        </span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--tx-muted)', margin: 0, maxWidth: '650px' }}>
                        Active portals configured here are utilized college-wide by automated scrapers and student result processing engines.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <Button
                        variant="secondary"
                        onClick={handleSyncAllFaculty}
                        disabled={syncing || !selectedFacultyId}
                        style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}
                    >
                        <span className={`material-icons-round ${syncing ? 'gf-spin' : ''}`} style={{ fontSize: '16px' }}>sync</span>
                        {syncing ? 'Syncing...' : 'Sync to All Faculty Accounts'}
                    </Button>

                    <button
                        type="button"
                        onClick={() => setShowFacultyOverride(prev => !prev)}
                        style={{
                            background: 'transparent',
                            border: '1px solid var(--border)',
                            color: 'var(--tx-muted)',
                            borderRadius: '8px',
                            padding: '7px 12px',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '15px' }}>manage_accounts</span>
                        {showFacultyOverride ? 'Hide Faculty Picker' : 'Inspect Specific Faculty Account'}
                    </button>
                </div>
            </div>

            {/* Sync confirmation alert */}
            {syncMessage && (
                <div style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: syncMessage.startsWith('✓') ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${syncMessage.startsWith('✓') ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    color: syncMessage.startsWith('✓') ? '#10B981' : '#EF4444',
                    fontSize: '13px',
                    fontWeight: 700,
                    marginBottom: '18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>
                        {syncMessage.startsWith('✓') ? 'check_circle' : 'error'}
                    </span>
                    {syncMessage}
                </div>
            )}

            {/* Optional Specific Faculty Override (collapsed by default) */}
            {showFacultyOverride && (
                <Card style={{ padding: '16px 20px', marginBottom: '20px', borderLeft: '4px solid var(--primary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            Inspect Individual Faculty Portal Configuration
                        </label>
                        <span style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>Advanced Override</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--tx-muted)', marginBottom: '12px' }}>
                        Select a specific faculty member if you wish to inspect or customize their personal scraper portal overrides.
                    </p>
                    {loading ? (
                        <LoadingState label="Loading faculty list" />
                    ) : error ? (
                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red, #e02424)' }}>{error}</div>
                    ) : faculty.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>No approved faculty found.</div>
                    ) : (
                        <select
                            value={selectedFacultyId}
                            onChange={e => setSelectedFacultyId(e.target.value)}
                            style={{
                                width: '100%',
                                maxWidth: '440px',
                                minHeight: '40px',
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid var(--border)',
                                background: 'var(--surface)',
                                color: 'var(--tx-main)',
                                fontWeight: 700,
                                fontSize: '13px',
                                outline: 'none',
                                cursor: 'pointer'
                            }}
                        >
                            {faculty.map(f => (
                                <option key={f.id} value={f.id}>
                                    {f.full_name || f.email || f.id}{f.department ? ` — ${f.department}` : ''}
                                </option>
                            ))}
                        </select>
                    )}
                    {selectedFaculty && (
                        <p style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '8px', margin: 0 }}>
                            Currently viewing configuration for: <strong>{selectedFaculty.full_name || selectedFaculty.email}</strong>
                            {selectedFaculty.email ? ` (${selectedFaculty.email})` : ''}.
                        </p>
                    )}
                </Card>
            )}

            {/* Portal Manager Component */}
            {!loading && selectedFacultyId && (
                <VtuUrlManager facultyId={selectedFacultyId} />
            )}
        </div>
    );
}
