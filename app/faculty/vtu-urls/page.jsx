'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Input, Button } from '@/components/ui/Foundation';

function VtuUrlManagerContent() {
    const [vtuUrls, setVtuUrls] = useState([]);
    const [newUrl, setNewUrl] = useState('');
    const [newExamName, setNewExamName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchVtuUrls();
    }, []);

    const fetchVtuUrls = async () => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        try {
            const res = await fetch(`/api/vtu-urls?faculty_id=${facSession.id}&_t=${Date.now()}`, { cache: 'no-store', credentials: 'include' });
            const json = await res.json();
            if (json.success) setVtuUrls(json.urls || []);
        } catch (e) { }
    };

    const addVtuUrl = async () => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        if (!newUrl.includes('results.vtu.ac.in')) {
            setMessage('URL must be from results.vtu.ac.in');
            return;
        }
        setLoading(true);
        try {
            const res = await fetch('/api/vtu-urls', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: newUrl, exam_name: newExamName, faculty_id: facSession.id, is_active: true }),
            });
            const json = await res.json();
            if (json.success) {
                setNewUrl('');
                setNewExamName('');
                setMessage('✓ URL added successfully!');
                fetchVtuUrls();
            } else {
                setMessage(json.error || 'Failed to add URL.');
            }
        } catch (e) {
            setMessage('Network error.');
        } finally { setLoading(false); }
    };

    const toggleVtuUrl = async (urlObj, forceState) => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        try {
            await fetch('/api/vtu-urls', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url: urlObj.url,
                    exam_name: urlObj.exam_name,
                    faculty_id: facSession.id,
                    is_active: forceState !== undefined ? forceState : !urlObj.is_active
                }),
            });
            fetchVtuUrls();
        } catch (e) { }
    };

    const toggleAllUrls = async (is_active) => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        try {
            await fetch('/api/vtu-urls', {
                method: 'PUT',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ faculty_id: facSession.id, is_active }),
            });
            fetchVtuUrls();
            setMessage(is_active ? '✓ All URLs enabled for scraping.' : '✓ All URLs disabled for scraping.');
        } catch (e) { }
    };

    const removeVtuUrl = async (id) => {
        const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
        if (!facSession.id) return;
        try {
            await fetch('/api/vtu-urls', {
                method: 'DELETE',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, faculty_id: facSession.id }),
            });
            fetchVtuUrls();
        } catch (e) { }
    };

    const c = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1000px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        badge: (active) => ({
            fontSize: '9px', fontWeight: 800, padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-2)',
            background: active ? 'var(--green-bg)' : 'var(--red-bg)',
            color: active ? 'var(--green)' : 'var(--red)',
        }),
        msg: (ok) => ({
            fontSize: '13px', fontWeight: 700, color: ok ? 'var(--green)' : 'var(--red)',
            marginBottom: 'var(--space-4)'
        })
    };

    return (
        <div style={c.page} className="gf-fade-up">
            <PageHeader>
                <PageHeaderEyebrow>Portal Configuration</PageHeaderEyebrow>
                <PageHeaderTitle>VTU Result Portals</PageHeaderTitle>
                <PageHeaderSubtitle>Manage the specific VTU result URLs that the system uses to scrape student marks. Add new links as they are released by the university.</PageHeaderSubtitle>
            </PageHeader>

            <Card style={{ padding: 'var(--space-8)' }}>
                <div style={{ marginBottom: 'var(--space-8)' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: 'var(--space-4)' }}>Add New Result Portal</h3>
                    {message && <div style={c.msg(message.includes('✓'))}>{message}</div>}
                    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        <div style={{ flex: 2, minWidth: '240px' }}>
                            <Input label="VTU URL" placeholder="https://results.vtu.ac.in/..." value={newUrl} onChange={e => setNewUrl(e.target.value)} />
                        </div>
                        <div style={{ flex: 1, minWidth: '180px' }}>
                            <Input label="Exam Name" placeholder="e.g. Jun/July 2025" value={newExamName} onChange={e => setNewExamName(e.target.value)} />
                        </div>
                        <div style={{ alignSelf: 'flex-end' }}>
                            <Button variant="primary" style={{ opacity: loading ? 0.7 : 1 }} onClick={addVtuUrl} disabled={loading || !newUrl}>
                                {loading ? 'Adding...' : 'Register URL'}
                            </Button>
                        </div>
                    </div>
                </div>

                <div style={{ height: '1px', background: 'var(--border)', margin: 'var(--space-8) 0' }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-5)' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)' }}>Configured Portals ({vtuUrls.length})</h3>
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                        <Button
                            onClick={() => toggleAllUrls(true)}
                            size="sm"
                            variant="ghost"
                            style={{ color: 'var(--green)' }}>
                            Enable All
                        </Button>
                        <Button
                            onClick={() => toggleAllUrls(false)}
                            size="sm"
                            variant="ghost"
                            style={{ color: 'var(--red)' }}>
                            Disable All
                        </Button>
                    </div>
                </div>
                <div style={{ display: 'grid', gap: 'var(--space-3)' }}>
                    {vtuUrls.map(u => (
                        <div key={u.id} style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            flexWrap: 'wrap', gap: 'var(--space-3)',
                            padding: 'var(--space-4) var(--space-5)', background: 'var(--surface-low)',
                            borderRadius: 'var(--radius-6)', border: `1px solid ${u.is_active ? 'var(--primary)' : 'var(--border)'}`,
                            opacity: u.is_active ? 1 : 0.6
                        }}>
                            <div style={{ overflow: 'hidden', minWidth: 0, flex: '1 1 200px' }}>
                                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>{u.exam_name || 'Unnamed Exam'}</div>
                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontFamily: 'monospace', marginTop: 'var(--space-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.url}</div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexShrink: 0 }}>
                                <button
                                    onClick={() => toggleVtuUrl(u)}
                                    style={{
                                        padding: 'var(--space-2) var(--space-4)', minHeight: '44px', background: u.is_active ? 'var(--green-bg)' : 'var(--surface)',
                                        color: u.is_active ? 'var(--green)' : 'var(--tx-muted)',
                                        border: `1px solid ${u.is_active ? 'var(--green)' : 'var(--border)'}`,
                                        borderRadius: 'var(--radius-2)', fontWeight: 800, fontSize: '11px', cursor: 'pointer',
                                        transition: 'all 0.2s', whiteSpace: 'nowrap'
                                    }}
                                >
                                    {u.is_active ? '✓ ENABLED' : 'DISABLED'}
                                </button>
                                <Button
                                    onClick={() => removeVtuUrl(u.id)}
                                    variant="ghost"
                                    size="sm"
                                    style={{ padding: 'var(--space-2)' }}
                                    title="Delete URL permanently"
                                    aria-label="Delete"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '20px' }}>delete_outline</span>
                                </Button>
                            </div>
                        </div>
                    ))}
                    {vtuUrls.length === 0 && (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--tx-dim)' }}>
                            No portals configured yet.
                        </div>
                    )}
                </div>
            </Card>
        </div>
    );
}

export default function VtuUrlManagerPage() {
    return (
        <AuthGuard role="faculty">
            <VtuUrlManagerContent />
        </AuthGuard>
    );
}
