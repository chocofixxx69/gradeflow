'use client';

import { supabase } from '../../../lib/supabase';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../../components/AuthGuard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/Table';
import { Button } from '@/components/ui/Foundation';

function FacultyAdminContent() {
    const router = useRouter();
    const [requests, setRequests] = useState([]);
    const [processed, setProcessed] = useState([]);
    const [activities, setActivities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);

    useEffect(() => {
        const facSession = localStorage.getItem('faculty_session');
        if (!facSession) {
            router.push('/faculty/login');
            return;
        }
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const [{ data: pending }, { data: approved }, { data: logs }] = await Promise.all([
                supabase.from('faculty_onboarding').select('*').eq('status', 'pending'),
                supabase.from('faculty_onboarding').select('*').eq('status', 'approved'),
                supabase.from('faculty_activity').select('*').order('created_at', { ascending: false }).limit(10),
            ]);

            setRequests(pending || []);
            setProcessed(approved || []);
            setActivities(logs || []);
            setLoadError(null);
        } catch (err) {
            console.error('Failed to load admin data:', err);
            setLoadError('Failed to load administration data. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleApprove = async (id) => {
        const newKey = `VTU-FK-${Math.floor(Math.random() * 900000) + 100000}`;
        const { error } = await supabase
            .from('faculty_onboarding')
            .update({ status: 'approved', generated_access_key: newKey })
            .eq('id', id);

        if (error) {
            console.error('Approval failed:', error);
        } else {
            fetchData();
        }
    };

    const s = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
        badge: (count) => ({
            fontSize: '11px', fontWeight: 900, padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-2)',
            background: count > 0 ? 'var(--amber-bg)' : 'var(--green-bg)',
            color: count > 0 ? 'var(--amber)' : 'var(--green)',
        }),
        accessKey: {
            fontSize: '12px', fontWeight: 900, color: 'var(--primary)',
            background: 'var(--surface-low)', padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-2)',
            fontFamily: 'monospace',
        },
        statusPill: (ok) => ({
            fontSize: '9px', fontWeight: 900, textTransform: 'uppercase',
            letterSpacing: '0.06em', padding: '3px var(--space-3)', borderRadius: 'var(--radius-2)',
            background: ok ? 'var(--green-bg)' : 'var(--red-bg)',
            color: ok ? 'var(--green)' : 'var(--red)',
        }),
        statsGrid: { marginBottom: 'var(--space-8)' },
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: 'var(--space-6)' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-3)' },
        statVal: { fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', lineHeight: 1 },
        statSub: { fontSize: '11px', fontWeight: 600, color: 'var(--tx-muted)', marginTop: 'var(--space-2)' },

        emptyRow: { padding: 'var(--space-9) var(--space-6)', textAlign: 'center', color: 'var(--tx-dim)', fontWeight: 700, fontSize: '13px' },
        layout: { display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-8)' },
        timelineItem: { paddingLeft: 'var(--space-6)', borderLeft: '2px solid var(--border)', position: 'relative', marginBottom: 'var(--space-6)' },
        timelineDot: (ok) => ({
            position: 'absolute', left: '-5px', top: '2px', width: '8px', height: '8px',
            borderRadius: '50%', background: ok ? 'var(--green)' : 'var(--primary)',
        }),
    };

    // Helper component for stats
    const StatCard = ({ label, val, sub, primary = false }) => (
        <div style={s.statCard}>
            <div style={s.statLabel}>{label}</div>
            <div style={{ ...s.statVal, color: primary ? 'var(--amber)' : 'var(--tx-main)' }}>
                {val}
            </div>
            <div style={s.statSub}>{sub}</div>
        </div>
    );

    if (loading) return (
        <div style={{ padding: '80px 20px', textAlign: 'center', fontWeight: 700, color: 'var(--tx-dim)' }}>
            <span className="material-icons-round gf-spin" style={{ fontSize: '32px', marginBottom: '16px', display: 'block' }}>sync</span>
            Loading administration panel...
        </div>
    );

    return (
        <div style={s.page} className="gf-fade-up">
            <PageHeader>
                <PageHeaderEyebrow>Administrator Mode</PageHeaderEyebrow>
                <PageHeaderTitle>Faculty Administration</PageHeaderTitle>
                <PageHeaderSubtitle>Manage faculty access requests, monitor engagement, and oversee institutional data flow.</PageHeaderSubtitle>
            </PageHeader>

            {loadError && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', padding: 'var(--space-4) var(--space-6)', marginBottom: 'var(--space-6)', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--radius-6)' }}>
                    <span style={{ color: 'var(--red)', fontWeight: 700, fontSize: '13px' }}>{loadError}</span>
                    <Button size="sm" variant="ghost" onClick={() => { setLoadError(null); fetchData(); }}>Retry</Button>
                </div>
            )}

            {/* Stats Grid */}
            <div className="gf-stats-grid" style={s.statsGrid}>
                <StatCard label="Onboarding Queue" val={requests.length.toString()} sub={requests.length === 0 ? 'Queue Clear' : 'Needs Review'} primary={requests.length > 0} />
                <StatCard label="Verified Educators" val={processed.length.toString()} sub="Active Access" />
                <StatCard label="Audit Entries" val={activities.length.toString()} sub="Recent Activity" />
                <StatCard label="Active USNs" val={new Set(activities.map(l => l.target_usn)).size.toString()} sub="Student Coverage" />
            </div>

            <div className="gf-two-col">
                <div>
                    {/* Onboarding Inbox */}
                    <Card style={{ marginBottom: 'var(--space-6)' }}>
                        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <CardTitle>Onboarding Inbox</CardTitle>
                            <span style={s.badge(requests.length)}>
                                {requests.length} Pending
                            </span>
                        </CardHeader>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Profile</TableHead>
                                    <TableHead>Credentials</TableHead>
                                    <TableHead style={{ textAlign: 'right' }}>Action</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map(req => (
                                    <TableRow key={req.id}>
                                        <TableCell>
                                            <div style={{ fontWeight: 800, fontSize: '14px' }}>{req.full_name}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)', fontFamily: 'monospace', marginTop: '2px' }}>{req.id?.slice(0, 8)}</div>
                                        </TableCell>
                                        <TableCell>
                                            <div style={{ fontSize: '13px', fontWeight: 600 }}>{req.email}</div>
                                            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', marginTop: '2px' }}>{req.department}</div>
                                        </TableCell>
                                        <TableCell style={{ textAlign: 'right' }}>
                                            <Button size="sm" variant="primary" onClick={() => handleApprove(req.id)}>
                                                Approve
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {requests.length === 0 && (
                                    <TableRow><TableCell colSpan={3} style={{ textAlign: 'center', color: 'var(--tx-dim)', fontWeight: 700, padding: 'var(--space-9) 0' }}>Inbox cleared — no pending requests.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>

                    {/* Authorized Directory */}
                    <Card style={{ marginBottom: 'var(--space-6)' }}>
                        <CardHeader style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <CardTitle>Authorized Directory</CardTitle>
                            <span style={s.badge(0)}>{processed.length} Active</span>
                        </CardHeader>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Instructor</TableHead>
                                    <TableHead>Access Key</TableHead>
                                    <TableHead style={{ textAlign: 'right' }}>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {processed.map(p => (
                                    <TableRow key={p.id}>
                                        <TableCell style={{ fontWeight: 800 }}>{p.full_name}</TableCell>
                                        <TableCell>
                                            <code style={s.accessKey}>{p.generated_access_key}</code>
                                        </TableCell>
                                        <TableCell style={{ textAlign: 'right' }}>
                                            <span style={s.statusPill(true)}>Live</span>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {processed.length === 0 && (
                                    <TableRow><TableCell colSpan={3} style={{ textAlign: 'center', color: 'var(--tx-dim)', fontWeight: 700, padding: 'var(--space-9) 0' }}>No approved faculty yet.</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </Card>
                </div>

                {/* Activity Feed */}
                <div>
                    <Card style={{ position: 'sticky', top: 'var(--space-6)' }}>
                        <CardHeader>
                            <CardTitle>Real-time Activity Feed</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {activities.map((log, i) => (
                                <div key={i} style={s.timelineItem}>
                                    <div style={s.timelineDot(log.sync_status === 'SUCCESS')} />
                                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', marginBottom: '4px' }}>{log.faculty_name}</div>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginBottom: '8px' }}>{log.action_type}: {log.target_usn}</div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={s.statusPill(log.sync_status === 'SUCCESS')}>{log.sync_status}</span>
                                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)' }}>{new Date(log.created_at).toLocaleTimeString()}</span>
                                    </div>
                                </div>
                            ))}
                            {activities.length === 0 && (
                                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--tx-dim)', fontWeight: 700 }}>
                                    No activity detected yet.
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}

export default function FacultyAdminPage() {
    return (
        <AuthGuard role="admin">
            <FacultyAdminContent />
        </AuthGuard>
    );
}
