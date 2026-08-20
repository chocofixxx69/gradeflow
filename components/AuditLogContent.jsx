'use client';
import { useState, useEffect } from 'react';
import { apiRequest } from '../lib/api/client';
import AuthGuard from './AuthGuard';

const S = {
    page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto' },
    title: { fontSize: '28px', fontWeight: 900, marginBottom: 'var(--space-2)', letterSpacing: '-0.03em' },
    subtitle: { fontSize: '14px', color: 'var(--tx-muted)', marginBottom: 'var(--space-6)' },
    label: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: 'var(--space-1)', display: 'block' }
};

export function AuditLogContent() {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [typeFilter, setTypeFilter] = useState('all');
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        fetchLogs();
    }, []);

    const fetchLogs = async () => {
        setLoading(true);
        setError('');
        try {
            const [auditRes, termRes] = await Promise.all([
                apiRequest('/api/admin/audit-logs').catch(() => null),
                apiRequest('/api/admin/terminal/data').catch(() => null)
            ]);
            const auditData = auditRes?.logs || [];
            const actData = termRes?.facultyActivity || [];
            const combined = [...(auditData || []), ...(actData || [])].sort(
                (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
            );
            setLogs(combined);
        } catch (err) {
            console.error('Audit log fetch error:', err);
            setLogs([]);
            setError('Failed to load audit logs. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const filtered = logs.filter(l => {
        const matchesSearch = !search || 
            (l.faculty_name||'').toLowerCase().includes(search.toLowerCase()) ||
            (l.faculty_email||'').toLowerCase().includes(search.toLowerCase()) ||
            (l.action_type||'').toLowerCase().includes(search.toLowerCase());
        const matchesType = typeFilter === 'all' || l.action_type === typeFilter;
        return matchesSearch && matchesType;
    });

    const uniqueTypes = [...new Set(logs.map(l => l.action_type).filter(Boolean))];

    return (
        <div style={S.page}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <h1 style={S.title}>Institutional Audit Log</h1>
                <button onClick={fetchLogs} className="gf-btn gf-btn-ghost" style={{ height: '36px', padding: '0 var(--space-4)', fontSize: '13px' }}>
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>refresh</span>
                    Refresh
                </button>
            </div>
            <p style={S.subtitle}>Comprehensive record of all faculty actions and system modifications.</p>

            {error && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', padding: '12px 16px', borderRadius: 'var(--radius-4)', marginBottom: 'var(--space-4)', background: 'var(--red-bg)', border: '1px solid var(--red)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)' }}>{error}</span>
                    <button onClick={fetchLogs} className="gf-btn gf-btn-ghost" style={{ height: '32px', padding: '0 var(--space-3)', fontSize: '12px' }}>Retry</button>
                </div>
            )}

            <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-5)', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                    <label style={S.label}>Search Logs</label>
                    <input className="gf-input" placeholder="Search name, email, action..." value={search} onChange={e => setSearch(e.target.value)} style={{ padding: '9px var(--space-3)', fontSize: '13px' }} />
                </div>
                <div style={{ width: isMobile ? '100%' : '200px' }}>
                    <label style={S.label}>Action Type</label>
                    <select className="gf-input" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: '9px var(--space-3)', fontSize: '13px' }}>
                        <option value="all">All Actions</option>
                        {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                </div>
            </div>

            <div className="gf-table-container">
                {!isMobile ? (
                    <table className="gf-table">
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>Faculty</th>
                                <th>Action</th>
                                <th>Details</th>
                                <th>Previous State</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: 'var(--space-6)' }}>
                                        Loading audit logs...
                                    </td>
                                </tr>
                            )}
                            {!loading && !error && filtered.length === 0 && (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: 'var(--space-6)', color: 'var(--tx-muted)' }}>
                                        No audit records found.
                                    </td>
                                </tr>
                            )}
                            {!loading && !error && filtered.map(l => (
                                <tr key={l.id}>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: '12px' }}>
                                        {l.created_at ? new Date(l.created_at).toLocaleString() : '—'}
                                    </td>
                                    <td>
                                        <div style={{ fontWeight: 700 }}>{l.faculty_name || 'System'}</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{l.faculty_email || ''}</div>
                                    </td>
                                    <td>
                                        <span className="gf-badge" style={{ background: 'var(--surface-low)', color: 'var(--tx-main)' }}>
                                            {l.action_type}
                                        </span>
                                    </td>
                                    <td>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-main)', fontWeight: 600 }}>{l.entity_type || 'Target'}: {l.target_usn || l.entity_id || '—'}</div>
                                        {l.new_values && (
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                                                {JSON.stringify(l.new_values)}
                                            </div>
                                        )}
                                    </td>
                                    <td>
                                        {l.old_values ? (
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '200px' }}>
                                                {JSON.stringify(l.old_values)}
                                            </div>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px 0' }}>
                        {loading && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--tx-dim)' }}>Loading audit logs...</div>}
                        {!loading && !error && filtered.length === 0 && <div style={{ textAlign: 'center', padding: '24px', color: 'var(--tx-muted)', fontSize: '13px' }}>No audit records found.</div>}
                        {!loading && !error && filtered.map(l => (
                            <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span className="gf-badge" style={{ background: 'var(--surface-low)', color: 'var(--tx-main)', fontSize: '10px' }}>
                                        {l.action_type}
                                    </span>
                                    <span style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>
                                        {l.created_at ? new Date(l.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </span>
                                </div>
                                <div>
                                    <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{l.faculty_name || 'System'}</div>
                                    {l.faculty_email && <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>{l.faculty_email}</div>}
                                </div>
                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', background: 'var(--surface-low)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)', wordBreak: 'break-word' }}>
                                    <span style={{ fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '9px' }}>Target: </span>
                                    {l.entity_type || 'Target'}: {l.target_usn || l.entity_id || '—'}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
