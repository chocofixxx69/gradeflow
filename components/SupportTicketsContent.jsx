'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../lib/api/client';

export function SupportTicketsContent({ onStatsUpdate }) {
    const [tickets, setTickets] = useState([]);
    const [stats, setStats] = useState({ total: 0, open: 0, in_progress: 0, resolved: 0, student_tickets: 0, faculty_tickets: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [userTypeFilter, setUserTypeFilter] = useState('all');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [adminNotesInput, setAdminNotesInput] = useState('');
    const [actionSuccessMsg, setActionSuccessMsg] = useState('');
    const [confirmingAction, setConfirmingAction] = useState(null); // { type: 'reset_password'|'resolve'|'reject', ticket }

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const query = {};
            if (statusFilter !== 'all') query.status = statusFilter;
            if (userTypeFilter !== 'all') query.user_type = userTypeFilter;
            if (search) query.search = search;

            const res = await apiRequest('/api/admin/support/tickets', { query });
            setTickets(res?.tickets || []);
            if (res?.stats) {
                setStats(res.stats);
                if (onStatsUpdate) onStatsUpdate(res.stats);
            }
        } catch (err) {
            console.error('Fetch tickets error:', err);
            setError(err.message || 'Failed to load support tickets.');
        } finally {
            setLoading(false);
        }
    }, [statusFilter, userTypeFilter, search, onStatsUpdate]);

    useEffect(() => {
        fetchTickets();
    }, [fetchTickets]);

    const handleTicketAction = async (action, ticketId, customNotes = null) => {
        setActionBusy(true);
        setActionSuccessMsg('');
        try {
            const res = await apiRequest('/api/admin/support/tickets', {
                method: 'POST',
                body: JSON.stringify({
                    ticket_id: ticketId,
                    action,
                    admin_notes: customNotes || adminNotesInput,
                })
            });

            setActionSuccessMsg(res?.message || 'Ticket updated successfully.');
            setConfirmingAction(null);
            setAdminNotesInput('');
            await fetchTickets();

            if (selectedTicket && selectedTicket.id === ticketId && res?.ticket) {
                setSelectedTicket(res.ticket);
            }

            setTimeout(() => setActionSuccessMsg(''), 5000);
        } catch (err) {
            alert('Action failed: ' + err.message);
        } finally {
            setActionBusy(false);
        }
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'open':
                return { label: 'OPEN', bg: 'rgba(239, 68, 68, 0.12)', color: '#b91c1c', border: '1px solid rgba(239, 68, 68, 0.25)' };
            case 'in_progress':
                return { label: 'IN PROGRESS', bg: 'rgba(245, 158, 11, 0.12)', color: '#b45309', border: '1px solid rgba(245, 158, 11, 0.25)' };
            case 'resolved':
                return { label: 'RESOLVED', bg: 'rgba(16, 185, 129, 0.12)', color: '#047857', border: '1px solid rgba(16, 185, 129, 0.25)' };
            case 'rejected':
                return { label: 'REJECTED', bg: 'rgba(107, 114, 128, 0.12)', color: '#4b5563', border: '1px solid rgba(107, 114, 128, 0.25)' };
            default:
                return { label: status?.toUpperCase(), bg: 'var(--surface-low)', color: 'var(--tx-muted)', border: '1px solid var(--border)' };
        }
    };

    const getIssueTypeLabel = (type) => {
        switch (type) {
            case 'password_reset': return '🔑 Password Reset';
            case 'login_issue': return '🔒 Login Problem';
            case 'subject_allocation': return '📚 Subject Allocation';
            case 'marks_dispute': return '📊 Marks Discrepancy';
            case 'attendance_issue': return '📅 Attendance Issue';
            case 'profile_correction': return '📝 Profile Correction';
            case 'student_record': return '🎓 Student Record Access';
            case 'grade_card_issue': return '📄 Grade Sheet Download';
            case 'reval_query': return '🔄 Re-evaluation Query';
            case 'course_registration': return '📋 Course Registration';
            case 'report_issue': return '📑 Report / Export Error';
            default: return '💬 General Support';
        }
    };

    return (
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>
                        Support & Issue Desk
                    </h2>
                    <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--tx-muted)' }}>
                        Manage student & faculty problem reports, inquiries, and 1-click formula password resets.
                    </p>
                </div>
                <button
                    onClick={fetchTickets}
                    disabled={loading}
                    style={{
                        padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                        background: '#ffffff', color: 'var(--tx-main)', fontWeight: 600,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px', animation: loading ? 'spin 1s linear infinite' : 'none' }}>refresh</span>
                    Refresh Desk
                </button>
            </div>

            {/* Success Banner */}
            {actionSuccessMsg && (
                <div style={{
                    background: 'var(--success-bg, #E8F5E9)', border: '1px solid var(--success-border, #A5D6A7)',
                    color: 'var(--success, #166534)', padding: '12px 18px', borderRadius: '10px',
                    marginBottom: '16px', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '20px' }}>check_circle</span>
                    <span>{actionSuccessMsg}</span>
                </div>
            )}

            {/* Stats Overview */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>All Tickets</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--tx-main)', marginTop: '4px' }}>{stats.total}</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '12px', padding: '16px', background: 'rgba(239, 68, 68, 0.03)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase' }}>Open / Pending</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#b91c1c', marginTop: '4px' }}>{stats.open}</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px', padding: '16px', background: 'rgba(245, 158, 11, 0.03)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>In Progress</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>{stats.in_progress}</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '12px', padding: '16px', background: 'rgba(16, 185, 129, 0.03)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Resolved</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>{stats.resolved}</div>
                </div>
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase' }}>Student / Faculty</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--tx-main)', marginTop: '4px' }}>
                        {stats.student_tickets} <span style={{ fontSize: '1rem', color: 'var(--tx-muted)', fontWeight: 500 }}>/ {stats.faculty_tickets}</span>
                    </div>
                </div>
            </div>

            {/* Filter Controls */}
            <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
                padding: '14px 18px', marginBottom: '20px', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 300px' }}>
                    <span className="material-icons-round" style={{ color: 'var(--tx-muted)', fontSize: '20px' }}>search</span>
                    <input
                        type="text"
                        placeholder="Search ticket #, USN, email, name, or subject..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                            fontSize: '0.88rem', background: '#ffffff', color: 'var(--tx-main)'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--tx-muted)' }}>Status:</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={{
                                padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                fontSize: '0.85rem', background: '#ffffff', color: 'var(--tx-main)'
                            }}
                        >
                            <option value="all">All Statuses ({stats.total})</option>
                            <option value="open">Open ({stats.open})</option>
                            <option value="in_progress">In Progress ({stats.in_progress})</option>
                            <option value="resolved">Resolved ({stats.resolved})</option>
                            <option value="rejected">Rejected</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--tx-muted)' }}>User:</span>
                        <select
                            value={userTypeFilter}
                            onChange={(e) => setUserTypeFilter(e.target.value)}
                            style={{
                                padding: '8px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                fontSize: '0.85rem', background: '#ffffff', color: 'var(--tx-main)'
                            }}
                        >
                            <option value="all">All Users</option>
                            <option value="student">Students ({stats.student_tickets})</option>
                            <option value="faculty">Faculty ({stats.faculty_tickets})</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Tickets Table */}
            <div style={{
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
                overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
            }}>
                {loading ? (
                    <div style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                        <span className="material-icons-round" style={{ fontSize: '32px', animation: 'spin 1s linear infinite' }}>sync</span>
                        <div style={{ marginTop: '10px', fontWeight: 600 }}>Loading support tickets...</div>
                    </div>
                ) : tickets.length === 0 ? (
                    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                        <div style={{
                            width: '56px', height: '56px', borderRadius: '50%', background: 'var(--surface-low)',
                            color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: '12px'
                        }}>
                            <span className="material-icons-round" style={{ fontSize: '28px' }}>inbox</span>
                        </div>
                        <h4 style={{ margin: '0 0 6px 0', fontSize: '1.1rem', fontWeight: 700, color: 'var(--tx-main)' }}>
                            No Support Tickets Found
                        </h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--tx-muted)' }}>
                            {statusFilter !== 'all' || userTypeFilter !== 'all' || search
                                ? 'Try adjusting your search or filters.'
                                : 'All student and faculty problem reports will appear here.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--tx-muted)' }}>Ticket #</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--tx-muted)' }}>Status</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--tx-muted)' }}>Type</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--tx-muted)' }}>Identifier / User</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--tx-muted)' }}>Category & Subject</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--tx-muted)' }}>Date</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tickets.map(t => {
                                    const badge = getStatusBadge(t.status);
                                    return (
                                        <tr
                                            key={t.id}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                background: selectedTicket?.id === t.id ? 'var(--surface-low)' : 'transparent',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '14px 16px', fontWeight: 700, fontFamily: 'monospace', color: 'var(--primary)' }}>
                                                {t.ticket_number}
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <span style={{
                                                    padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem',
                                                    fontWeight: 800, background: badge.bg, color: badge.color, border: badge.border
                                                }}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <span style={{
                                                    padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700,
                                                    background: t.user_type === 'student' ? 'rgba(23, 75, 77, 0.08)' : 'rgba(180, 83, 9, 0.08)',
                                                    color: t.user_type === 'student' ? 'var(--primary)' : '#b45309'
                                                }}>
                                                    {t.user_type === 'student' ? 'Student' : 'Faculty'}
                                                </span>
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ fontWeight: 700, color: 'var(--tx-main)' }}>{t.user_identifier}</div>
                                                {t.user_name && <div style={{ fontSize: '0.78rem', color: 'var(--tx-muted)' }}>{t.user_name}</div>}
                                            </td>
                                            <td style={{ padding: '14px 16px' }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--tx-muted)' }}>
                                                    {getIssueTypeLabel(t.issue_type)}
                                                </div>
                                                <div style={{ fontWeight: 600, color: 'var(--tx-main)', marginTop: '2px' }}>
                                                    {t.subject}
                                                </div>
                                            </td>
                                            <td style={{ padding: '14px 16px', fontSize: '0.78rem', color: 'var(--tx-muted)', whiteSpace: 'nowrap' }}>
                                                {new Date(t.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </td>
                                            <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                                                    <button
                                                        onClick={() => setSelectedTicket(selectedTicket?.id === t.id ? null : t)}
                                                        style={{
                                                            padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                                            background: '#ffffff', color: 'var(--tx-main)', fontSize: '0.78rem',
                                                            fontWeight: 600, cursor: 'pointer'
                                                        }}
                                                    >
                                                        {selectedTicket?.id === t.id ? 'Close' : 'View'}
                                                    </button>

                                                    {t.user_type === 'student' && t.status !== 'resolved' && (
                                                        <button
                                                            onClick={() => setConfirmingAction({ type: 'reset_password', ticket: t })}
                                                            title="Reset student password to standard formula"
                                                            style={{
                                                                padding: '6px 10px', borderRadius: '6px', border: 'none',
                                                                background: 'var(--primary)', color: '#ffffff', fontSize: '0.78rem',
                                                                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                                            }}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>lock_reset</span>
                                                            Formula Reset
                                                        </button>
                                                    )}

                                                    {t.user_type === 'faculty' && (t.issue_type === 'password_reset' || t.issue_type === 'login_issue') && t.status !== 'resolved' && (
                                                        <button
                                                            onClick={() => setConfirmingAction({ type: 'reset_password', ticket: t })}
                                                            title="Reset faculty password to temporary access key"
                                                            style={{
                                                                padding: '6px 10px', borderRadius: '6px', border: 'none',
                                                                background: '#b45309', color: '#ffffff', fontSize: '0.78rem',
                                                                fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                                                            }}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>vpn_key</span>
                                                            Reset Key
                                                        </button>
                                                    )}

                                                    {t.status !== 'resolved' && (
                                                        <button
                                                            onClick={() => setConfirmingAction({ type: 'resolve', ticket: t })}
                                                            style={{
                                                                padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--success-border, #A5D6A7)',
                                                                background: 'var(--success-bg, #E8F5E9)', color: 'var(--success, #166534)', fontSize: '0.78rem',
                                                                fontWeight: 700, cursor: 'pointer'
                                                            }}
                                                        >
                                                            Resolve
                                                        </button>
                                                    )}
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

            {/* Selected Ticket Drawer / Details Modal */}
            {selectedTicket && (
                <div style={{
                    marginTop: '20px', background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '14px', padding: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                #{selectedTicket.ticket_number}
                            </span>
                            <span style={{
                                padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800,
                                ...getStatusBadge(selectedTicket.status)
                            }}>
                                {selectedTicket.status.toUpperCase()}
                            </span>
                        </div>
                        <button
                            onClick={() => setSelectedTicket(null)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}
                        >
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Requester</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--tx-main)', marginTop: '2px' }}>
                                {selectedTicket.user_name || 'N/A'} ({selectedTicket.user_identifier})
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--tx-muted)' }}>Role: {selectedTicket.user_type.toUpperCase()}</div>
                        </div>

                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Issue Category</div>
                            <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--tx-main)', marginTop: '2px' }}>
                                {getIssueTypeLabel(selectedTicket.issue_type)}
                            </div>
                        </div>

                        <div>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Submitted At</div>
                            <div style={{ fontSize: '0.88rem', color: 'var(--tx-main)', marginTop: '2px' }}>
                                {new Date(selectedTicket.created_at).toLocaleString()}
                            </div>
                        </div>
                    </div>

                    <div style={{ background: 'var(--surface-low)', padding: '16px', borderRadius: '10px', marginBottom: '18px' }}>
                        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--tx-muted)', marginBottom: '4px' }}>
                            Subject: {selectedTicket.subject}
                        </div>
                        <div style={{ fontSize: '0.92rem', color: 'var(--tx-main)', lineHeight: '1.6', whiteSpace: 'pre-wrap' }}>
                            {selectedTicket.description}
                        </div>
                    </div>

                    {selectedTicket.admin_notes && (
                        <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', padding: '14px', borderRadius: '10px', marginBottom: '18px' }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#047857', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>verified</span>
                                Administrator Resolution Note:
                            </div>
                            <div style={{ fontSize: '0.88rem', color: '#065f46', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                                {selectedTicket.admin_notes}
                            </div>
                            {selectedTicket.resolved_by && (
                                <div style={{ fontSize: '0.75rem', color: '#047857', marginTop: '6px' }}>
                                    Resolved by: {selectedTicket.resolved_by} on {new Date(selectedTicket.resolved_at).toLocaleString()}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Action Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                        {selectedTicket.user_type === 'student' ? (
                            <button
                                onClick={() => setConfirmingAction({ type: 'reset_password', ticket: selectedTicket })}
                                style={{
                                    padding: '10px 18px', borderRadius: '8px', border: 'none',
                                    background: 'var(--primary)', color: '#ffffff', fontWeight: 600,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>lock_reset</span>
                                1-Click Formula Password Reset
                            </button>
                        ) : (selectedTicket.issue_type === 'password_reset' || selectedTicket.issue_type === 'login_issue') && selectedTicket.status !== 'resolved' ? (
                            <button
                                onClick={() => setConfirmingAction({ type: 'reset_password', ticket: selectedTicket })}
                                style={{
                                    padding: '10px 18px', borderRadius: '8px', border: 'none',
                                    background: '#b45309', color: '#ffffff', fontWeight: 600,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>vpn_key</span>
                                Reset Faculty Password (Temp Key)
                            </button>
                        ) : null}

                        {selectedTicket.status !== 'resolved' && (
                            <button
                                onClick={() => setConfirmingAction({ type: 'resolve', ticket: selectedTicket })}
                                style={{
                                    padding: '10px 18px', borderRadius: '8px', border: 'none',
                                    background: '#047857', color: '#ffffff', fontWeight: 600,
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.88rem'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>check_circle</span>
                                Mark as Resolved
                            </button>
                        )}

                        {selectedTicket.status === 'open' && (
                            <button
                                onClick={() => handleTicketAction('in_progress', selectedTicket.id)}
                                style={{
                                    padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                                    background: '#ffffff', color: 'var(--tx-main)', fontWeight: 600,
                                    cursor: 'pointer', fontSize: '0.88rem'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>pending_actions</span>
                                Mark In-Progress
                            </button>
                        )}

                        {selectedTicket.status !== 'rejected' && selectedTicket.status !== 'resolved' && (
                            <button
                                onClick={() => setConfirmingAction({ type: 'reject', ticket: selectedTicket })}
                                style={{
                                    padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.3)',
                                    background: 'transparent', color: '#b91c1c', fontWeight: 600,
                                    cursor: 'pointer', fontSize: '0.88rem'
                                }}
                            >
                                Reject Ticket
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Confirmation Dialog */}
            {confirmingAction && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(10, 24, 28, 0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                }}>
                    <div style={{
                        background: '#ffffff', border: '1px solid var(--border)',
                        borderRadius: '14px', maxWidth: '480px', width: '100%', padding: '24px',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                    }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '1.15rem', fontWeight: 800, color: 'var(--tx-main)' }}>
                            {confirmingAction.type === 'reset_password'
                                ? `Reset Password for ${confirmingAction.ticket.user_identifier}?`
                                : confirmingAction.type === 'resolve'
                                ? `Resolve Ticket #${confirmingAction.ticket.ticket_number}?`
                                : `Reject Ticket #${confirmingAction.ticket.ticket_number}?`}
                        </h4>

                        <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: 'var(--tx-muted)', lineHeight: '1.5' }}>
                            {confirmingAction.type === 'reset_password'
                                ? (confirmingAction.ticket.user_type === 'student'
                                    ? `This will reset the student's password to the standard institutional formula (first 2 letters of name + last 3 digits of USN), allowing them to log in immediately case-insensitively. The ticket will also be marked as resolved.`
                                    : `This will reset the faculty member's password to a secure temporary access key (FAC-XXXXXX). The temporary key will be recorded in the ticket resolution notes and the ticket will be marked as resolved.`)
                                : `Add optional resolution notes before confirming:`}
                        </p>

                        <div style={{ marginBottom: '18px' }}>
                            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 700, color: 'var(--tx-main)', marginBottom: '4px' }}>
                                Admin Response / Resolution Notes:
                            </label>
                            <textarea
                                rows={3}
                                placeholder={confirmingAction.type === 'reset_password' ? 'Optional note to attach...' : 'Explain resolution or reason...'}
                                value={adminNotesInput}
                                onChange={(e) => setAdminNotesInput(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)',
                                    fontSize: '0.88rem', fontFamily: 'inherit', boxSizing: 'border-box'
                                }}
                            />
                        </div>

                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => { setConfirmingAction(null); setAdminNotesInput(''); }}
                                style={{
                                    padding: '9px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                                    background: '#ffffff', color: 'var(--tx-muted)', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                disabled={actionBusy}
                                onClick={() => handleTicketAction(confirmingAction.type, confirmingAction.ticket.id)}
                                style={{
                                    padding: '9px 20px', borderRadius: '8px', border: 'none',
                                    background: confirmingAction.type === 'reject' ? '#b91c1c' : 'var(--primary)',
                                    color: '#ffffff', fontWeight: 600, cursor: actionBusy ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {actionBusy ? 'Processing...' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
