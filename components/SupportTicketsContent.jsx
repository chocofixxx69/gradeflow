'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '../lib/api/client';

export function SupportTicketsContent({ onStatsUpdate }) {
    const [tickets, setTickets] = useState([]);
    const [stats, setStats] = useState({ total: 0, open: 0, in_progress: 0, resolved: 0, rejected: 0, student_tickets: 0, faculty_tickets: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [userTypeFilter, setUserTypeFilter] = useState('all');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [sortOrder, setSortOrder] = useState('created_at_desc');
    const [selectedTicket, setSelectedTicket] = useState(null);
    const [actionBusy, setActionBusy] = useState(false);
    const [adminNotesInput, setAdminNotesInput] = useState('');
    const [drawerNotesInput, setDrawerNotesInput] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    const [actionSuccessMsg, setActionSuccessMsg] = useState('');
    const [confirmingAction, setConfirmingAction] = useState(null); // { type, ticket, count }

    // Multi-selection for bulk actions
    const [selectedTicketIds, setSelectedTicketIds] = useState(new Set());

    // Create Manual Ticket Modal state
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [creatingTicket, setCreatingTicket] = useState(false);
    const [createError, setCreateError] = useState('');
    const [newTicketForm, setNewTicketForm] = useState({
        user_type: 'student',
        user_identifier: '',
        user_name: '',
        user_email: '',
        issue_type: 'password_reset',
        subject: '',
        description: '',
        initial_status: 'open',
        admin_notes: '',
    });

    const fetchTickets = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const query = {};
            if (statusFilter !== 'all') query.status = statusFilter;
            if (userTypeFilter !== 'all') query.user_type = userTypeFilter;
            if (categoryFilter !== 'all') query.category = categoryFilter;
            if (sortOrder) query.sort = sortOrder;
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
    }, [statusFilter, userTypeFilter, categoryFilter, sortOrder, search, onStatsUpdate]);

    useEffect(() => {
        fetchTickets();
    }, [fetchTickets]);

    // Keep drawer notes in sync when selecting ticket
    useEffect(() => {
        if (selectedTicket) {
            setDrawerNotesInput(selectedTicket.admin_notes || '');
        }
    }, [selectedTicket]);

    // ── Ticket Action Dispatcher ──
    const handleTicketAction = async (action, ticketId = null, customNotes = null, ticketIds = null) => {
        setActionBusy(true);
        setActionSuccessMsg('');
        try {
            const payload = {
                action,
                ticket_id: ticketId,
                ticket_ids: ticketIds,
                admin_notes: customNotes !== null ? customNotes : adminNotesInput,
            };

            const res = await apiRequest('/api/admin/support/tickets', {
                method: 'POST',
                body: JSON.stringify(payload)
            });

            setActionSuccessMsg(res?.message || 'Action completed successfully.');
            setConfirmingAction(null);
            setAdminNotesInput('');

            // If a ticket was deleted, close drawer if open
            if (action === 'delete' && selectedTicket?.id === ticketId) {
                setSelectedTicket(null);
            }
            if (action === 'bulk_delete' && ticketIds?.includes(selectedTicket?.id)) {
                setSelectedTicket(null);
            }

            // Clear batch selections
            if (action.startsWith('bulk_')) {
                setSelectedTicketIds(new Set());
            }

            await fetchTickets();

            // Refresh selected ticket in drawer if still active
            if (selectedTicket && selectedTicket.id === ticketId && res?.ticket) {
                setSelectedTicket(res.ticket);
                setDrawerNotesInput(res.ticket.admin_notes || '');
            }

            setTimeout(() => setActionSuccessMsg(''), 6000);
        } catch (err) {
            alert('Action failed: ' + err.message);
        } finally {
            setActionBusy(false);
        }
    };

    // ── Save Admin Notes from Drawer ──
    const handleSaveDrawerNotes = async () => {
        if (!selectedTicket) return;
        setSavingNotes(true);
        try {
            const res = await apiRequest('/api/admin/support/tickets', {
                method: 'POST',
                body: JSON.stringify({
                    ticket_id: selectedTicket.id,
                    action: 'save_notes',
                    admin_notes: drawerNotesInput,
                })
            });
            setActionSuccessMsg(res?.message || 'Notes updated.');
            if (res?.ticket) {
                setSelectedTicket(res.ticket);
            }
            await fetchTickets();
            setTimeout(() => setActionSuccessMsg(''), 4000);
        } catch (err) {
            alert('Failed to save notes: ' + err.message);
        } finally {
            setSavingNotes(false);
        }
    };

    // ── Create Manual Ticket Handler ──
    const handleCreateTicketSubmit = async (e) => {
        e.preventDefault();
        setCreateError('');
        if (!newTicketForm.user_identifier.trim()) {
            setCreateError(newTicketForm.user_type === 'student' ? 'Student USN is required.' : 'Faculty Email is required.');
            return;
        }
        if (!newTicketForm.subject.trim()) {
            setCreateError('Subject line is required.');
            return;
        }
        if (!newTicketForm.description.trim()) {
            setCreateError('Description is required.');
            return;
        }

        setCreatingTicket(true);
        try {
            const res = await apiRequest('/api/admin/support/tickets', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'create_ticket',
                    ...newTicketForm,
                })
            });

            setShowCreateModal(false);
            setNewTicketForm({
                user_type: 'student',
                user_identifier: '',
                user_name: '',
                user_email: '',
                issue_type: 'password_reset',
                subject: '',
                description: '',
                initial_status: 'open',
                admin_notes: '',
            });

            setActionSuccessMsg(res?.message || 'Support ticket created successfully.');
            await fetchTickets();
            setTimeout(() => setActionSuccessMsg(''), 6000);
        } catch (err) {
            setCreateError(err.message || 'Failed to create ticket.');
        } finally {
            setCreatingTicket(false);
        }
    };

    // ── Checkbox Selection Handlers ──
    const allFilteredSelected = useMemo(() => {
        if (tickets.length === 0) return false;
        return tickets.every(t => selectedTicketIds.has(t.id));
    }, [tickets, selectedTicketIds]);

    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            setSelectedTicketIds(new Set());
        } else {
            setSelectedTicketIds(new Set(tickets.map(t => t.id)));
        }
    };

    const toggleSelectTicket = (id, e) => {
        if (e) e.stopPropagation();
        setSelectedTicketIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    // ── Export Tickets to CSV ──
    const handleExportCSV = () => {
        if (!tickets.length) {
            alert('No tickets available to export.');
            return;
        }

        const headers = ['Ticket Number', 'Status', 'User Type', 'Identifier', 'Name', 'Email', 'Category', 'Subject', 'Description', 'Admin Notes', 'Resolved By', 'Resolved At', 'Created At'];
        const rows = tickets.map(t => [
            `"${t.ticket_number || ''}"`,
            `"${(t.status || '').toUpperCase()}"`,
            `"${t.user_type || ''}"`,
            `"${t.user_identifier || ''}"`,
            `"${(t.user_name || '').replace(/"/g, '""')}"`,
            `"${t.user_email || ''}"`,
            `"${t.issue_type || ''}"`,
            `"${(t.subject || '').replace(/"/g, '""')}"`,
            `"${(t.description || '').replace(/"/g, '""')}"`,
            `"${(t.admin_notes || '').replace(/"/g, '""')}"`,
            `"${t.resolved_by || ''}"`,
            `"${t.resolved_at || ''}"`,
            `"${t.created_at || ''}"`,
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `gradeflow_support_tickets_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
                        Manage student & faculty problem reports, inquiries, 1-click password resets, and audit resolutions.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setShowCreateModal(true)}
                        style={{
                            padding: '9px 16px', borderRadius: '8px', border: 'none',
                            background: 'var(--primary)', color: '#ffffff', fontWeight: 700,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.08)'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>add_task</span>
                        + Log Support Ticket
                    </button>

                    <button
                        onClick={handleExportCSV}
                        style={{
                            padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                            background: 'var(--surface-low)', color: 'var(--tx-main)', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem'
                        }}
                        title="Export current tickets to CSV"
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>file_download</span>
                        Export CSV
                    </button>

                    <button
                        onClick={fetchTickets}
                        disabled={loading}
                        style={{
                            padding: '9px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                            background: 'var(--surface)', color: 'var(--tx-main)', fontWeight: 600,
                            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem'
                        }}
                        title="Refresh ticket records"
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px', animation: loading ? 'spin 1s linear infinite' : 'none' }}>refresh</span>
                        Refresh Desk
                    </button>
                </div>
            </div>

            {/* Success Banner */}
            {actionSuccessMsg && (
                <div className="gf-fade-up" style={{
                    background: 'var(--success-bg, #E8F5E9)', border: '1px solid var(--success-border, #A5D6A7)',
                    color: 'var(--success, #166534)', padding: '12px 18px', borderRadius: '10px',
                    marginBottom: '16px', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '20px' }}>check_circle</span>
                    <span>{actionSuccessMsg}</span>
                </div>
            )}

            {/* Interactive Stats Overview Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                <div
                    onClick={() => setStatusFilter('all')}
                    style={{
                        background: statusFilter === 'all' ? 'var(--surface-low)' : 'var(--surface)',
                        border: `1px solid ${statusFilter === 'all' ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: '12px', padding: '16px', cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>All Tickets</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--tx-main)', marginTop: '4px' }}>{stats.total}</div>
                </div>

                <div
                    onClick={() => setStatusFilter('open')}
                    style={{
                        background: statusFilter === 'open' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(239, 68, 68, 0.03)',
                        border: `1px solid ${statusFilter === 'open' ? '#b91c1c' : 'rgba(239, 68, 68, 0.25)'}`,
                        borderRadius: '12px', padding: '16px', cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b91c1c', textTransform: 'uppercase' }}>Open / Pending</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#b91c1c', marginTop: '4px' }}>{stats.open}</div>
                </div>

                <div
                    onClick={() => setStatusFilter('in_progress')}
                    style={{
                        background: statusFilter === 'in_progress' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(245, 158, 11, 0.03)',
                        border: `1px solid ${statusFilter === 'in_progress' ? '#b45309' : 'rgba(245, 158, 11, 0.25)'}`,
                        borderRadius: '12px', padding: '16px', cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#b45309', textTransform: 'uppercase' }}>In Progress</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#b45309', marginTop: '4px' }}>{stats.in_progress}</div>
                </div>

                <div
                    onClick={() => setStatusFilter('resolved')}
                    style={{
                        background: statusFilter === 'resolved' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(16, 185, 129, 0.03)',
                        border: `1px solid ${statusFilter === 'resolved' ? '#047857' : 'rgba(16, 185, 129, 0.25)'}`,
                        borderRadius: '12px', padding: '16px', cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                >
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Resolved</div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>{stats.resolved}</div>
                </div>

                <div
                    onClick={() => setUserTypeFilter(prev => prev === 'all' ? 'student' : prev === 'student' ? 'faculty' : 'all')}
                    style={{
                        background: userTypeFilter !== 'all' ? 'var(--surface-low)' : 'var(--surface)',
                        border: `1px solid ${userTypeFilter !== 'all' ? 'var(--primary)' : 'var(--border)'}`,
                        borderRadius: '12px', padding: '16px', cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                    title="Click to toggle Student / Faculty filter"
                >
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: '1 1 280px' }}>
                    <span className="material-icons-round" style={{ color: 'var(--tx-muted)', fontSize: '20px' }}>search</span>
                    <input
                        type="text"
                        placeholder="Search ticket #, USN, email, name, or subject..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        style={{
                            width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border)',
                            fontSize: '0.88rem', background: 'var(--surface-low)', color: 'var(--tx-main)', outline: 'none'
                        }}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    {/* Status filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--tx-muted)' }}>Status:</span>
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            style={{
                                padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                fontSize: '0.85rem', background: 'var(--surface-low)', color: 'var(--tx-main)', cursor: 'pointer'
                            }}
                        >
                            <option value="all">All Statuses ({stats.total})</option>
                            <option value="open">Open ({stats.open})</option>
                            <option value="in_progress">In Progress ({stats.in_progress})</option>
                            <option value="resolved">Resolved ({stats.resolved})</option>
                            <option value="rejected">Rejected ({stats.rejected || 0})</option>
                        </select>
                    </div>

                    {/* User Type filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--tx-muted)' }}>User:</span>
                        <select
                            value={userTypeFilter}
                            onChange={(e) => setUserTypeFilter(e.target.value)}
                            style={{
                                padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                fontSize: '0.85rem', background: 'var(--surface-low)', color: 'var(--tx-main)', cursor: 'pointer'
                            }}
                        >
                            <option value="all">All Users</option>
                            <option value="student">Students ({stats.student_tickets})</option>
                            <option value="faculty">Faculty ({stats.faculty_tickets})</option>
                        </select>
                    </div>

                    {/* Category filter */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--tx-muted)' }}>Category:</span>
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
                            style={{
                                padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                fontSize: '0.85rem', background: 'var(--surface-low)', color: 'var(--tx-main)', cursor: 'pointer'
                            }}
                        >
                            <option value="all">All Categories</option>
                            <option value="password_reset">Password Reset</option>
                            <option value="login_issue">Login Problem</option>
                            <option value="marks_dispute">Marks Discrepancy</option>
                            <option value="subject_allocation">Subject Allocation</option>
                            <option value="student_record">Student Record Access</option>
                            <option value="grade_card_issue">Grade Sheet Download</option>
                            <option value="reval_query">Re-evaluation</option>
                            <option value="other">Other</option>
                        </select>
                    </div>

                    {/* Sort Order */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--tx-muted)' }}>Sort:</span>
                        <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                            style={{
                                padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                fontSize: '0.85rem', background: 'var(--surface-low)', color: 'var(--tx-main)', cursor: 'pointer'
                            }}
                        >
                            <option value="created_at_desc">Newest First</option>
                            <option value="created_at_asc">Oldest First</option>
                            <option value="status">By Status</option>
                        </select>
                    </div>

                    {(statusFilter !== 'all' || userTypeFilter !== 'all' || categoryFilter !== 'all' || search) && (
                        <button
                            onClick={() => {
                                setStatusFilter('all');
                                setUserTypeFilter('all');
                                setCategoryFilter('all');
                                setSearch('');
                            }}
                            style={{
                                padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                background: 'transparent', color: 'var(--tx-muted)', fontSize: '0.8rem',
                                cursor: 'pointer'
                            }}
                            title="Reset all filters"
                        >
                            ✕ Reset
                        </button>
                    )}
                </div>
            </div>

            {/* Batch Selection Action Bar */}
            {selectedTicketIds.size > 0 && (
                <div
                    className="gf-fade-up"
                    style={{
                        background: 'var(--surface-low)',
                        border: '1px solid var(--primary)',
                        borderRadius: '12px',
                        padding: '12px 18px',
                        marginBottom: '16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '28px', height: '28px', borderRadius: '50%', background: 'var(--primary)',
                            color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 800
                        }}>
                            {selectedTicketIds.size}
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>
                            {selectedTicketIds.size} ticket{selectedTicketIds.size > 1 ? 's' : ''} selected
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        {/* Bulk Delete */}
                        <button
                            onClick={() => setConfirmingAction({ type: 'bulk_delete', count: selectedTicketIds.size })}
                            style={{
                                padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)',
                                background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', fontSize: '12px',
                                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>delete_forever</span>
                            Delete Selected ({selectedTicketIds.size})
                        </button>

                        {/* Bulk Resolve */}
                        <button
                            onClick={() => setConfirmingAction({ type: 'bulk_resolve', count: selectedTicketIds.size })}
                            style={{
                                padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(16, 185, 129, 0.4)',
                                background: 'rgba(16, 185, 129, 0.1)', color: '#047857', fontSize: '12px',
                                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                            Mark Resolved ({selectedTicketIds.size})
                        </button>

                        {/* Bulk In Progress */}
                        <button
                            onClick={() => handleTicketAction('bulk_in_progress', null, null, Array.from(selectedTicketIds))}
                            style={{
                                padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.4)',
                                background: 'rgba(245, 158, 11, 0.1)', color: '#b45309', fontSize: '12px',
                                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>pending_actions</span>
                            Mark In Progress
                        </button>

                        {/* Clear Selection */}
                        <button
                            onClick={() => setSelectedTicketIds(new Set())}
                            style={{
                                padding: '7px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                                background: 'var(--surface)', color: 'var(--tx-muted)', fontSize: '12px',
                                fontWeight: 600, cursor: 'pointer'
                            }}
                        >
                            ✕ Deselect All
                        </button>
                    </div>
                </div>
            )}

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
                            {statusFilter !== 'all' || userTypeFilter !== 'all' || categoryFilter !== 'all' || search
                                ? 'Try adjusting your search or filters.'
                                : 'All student and faculty problem reports will appear here.'}
                        </p>
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '12px 14px', width: '38px', textAlign: 'center' }}>
                                        <input
                                            type="checkbox"
                                            checked={allFilteredSelected}
                                            onChange={toggleSelectAll}
                                            style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            title="Select all tickets"
                                        />
                                    </th>
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
                                    const isSelected = selectedTicketIds.has(t.id);
                                    return (
                                        <tr
                                            key={t.id}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                background: selectedTicket?.id === t.id
                                                    ? 'var(--surface-low)'
                                                    : isSelected ? 'rgba(37, 99, 235, 0.04)' : 'transparent',
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '14px 14px', textAlign: 'center' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isSelected}
                                                    onChange={(e) => toggleSelectTicket(t.id, e)}
                                                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                                />
                                            </td>
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

                                                    {/* Fast Student Formula Password Reset */}
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

                                                    {/* Fast Faculty Key Reset */}
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

                                                    {/* Fast Resolve */}
                                                    {t.status !== 'resolved' && (
                                                        <button
                                                            onClick={() => setConfirmingAction({ type: 'resolve', ticket: t })}
                                                            style={{
                                                                padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--success-border, #A5D6A7)',
                                                                background: 'var(--success-bg, #E8F5E9)', color: 'var(--success, #166534)', fontSize: '0.78rem',
                                                                fontWeight: 700, cursor: 'pointer'
                                                            }}
                                                            title="Mark as resolved"
                                                        >
                                                            Resolve
                                                        </button>
                                                    )}

                                                    {/* Fast Reopen for resolved/rejected tickets */}
                                                    {(t.status === 'resolved' || t.status === 'rejected') && (
                                                        <button
                                                            onClick={() => setConfirmingAction({ type: 'reopen', ticket: t })}
                                                            style={{
                                                                padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                                                background: 'var(--surface-low)', color: 'var(--tx-main)', fontSize: '0.78rem',
                                                                fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px'
                                                            }}
                                                            title="Reopen this ticket"
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '13px' }}>replay</span>
                                                            Reopen
                                                        </button>
                                                    )}

                                                    {/* Delete Ticket Button */}
                                                    <button
                                                        onClick={() => setConfirmingAction({ type: 'delete', ticket: t })}
                                                        style={{
                                                            padding: '6px 8px', borderRadius: '6px', border: '1px solid transparent',
                                                            background: 'transparent', color: '#dc2626', cursor: 'pointer',
                                                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                        }}
                                                        title="Delete this ticket"
                                                        onMouseEnter={e => {
                                                            e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)';
                                                            e.currentTarget.style.borderColor = 'rgba(239, 68, 68, 0.3)';
                                                        }}
                                                        onMouseLeave={e => {
                                                            e.currentTarget.style.background = 'transparent';
                                                            e.currentTarget.style.borderColor = 'transparent';
                                                        }}
                                                    >
                                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>delete_outline</span>
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

            {/* Selected Ticket Drawer / Details Modal */}
            {selectedTicket && (
                <div style={{
                    marginTop: '20px', background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '14px', padding: '24px', boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
                }} className="gf-fade-up">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                onClick={() => setSelectedTicket(null)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '5px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-low)',
                                    color: 'var(--tx-main)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                title="Back to ticket list"
                            >
                                <span className="material-icons-round" style={{ fontSize: '15px' }}>arrow_back</span>
                                Back to Tickets
                            </button>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <button
                                onClick={() => setConfirmingAction({ type: 'delete', ticket: selectedTicket })}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '5px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                    background: 'rgba(239, 68, 68, 0.06)',
                                    color: '#b91c1c',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                                title="Delete this ticket"
                            >
                                <span className="material-icons-round" style={{ fontSize: '15px' }}>delete</span>
                                Delete Ticket
                            </button>
                            <button
                                onClick={() => setSelectedTicket(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}
                                title="Close (Esc)"
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>
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

                    {/* Admin Internal Notes Editor */}
                    <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px', marginBottom: '18px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                            <label style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--tx-main)', textTransform: 'uppercase' }}>
                                Internal Admin Notes & Audit Trail
                            </label>
                            <button
                                onClick={handleSaveDrawerNotes}
                                disabled={savingNotes}
                                style={{
                                    padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border)',
                                    background: 'var(--surface)', color: 'var(--tx-main)', fontSize: '11px',
                                    fontWeight: 700, cursor: savingNotes ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {savingNotes ? 'Saving…' : 'Save Notes'}
                            </button>
                        </div>
                        <textarea
                            rows={3}
                            value={drawerNotesInput}
                            onChange={(e) => setDrawerNotesInput(e.target.value)}
                            placeholder="Add or update internal administrative notes for this ticket..."
                            style={{
                                width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)',
                                fontSize: '0.85rem', fontFamily: 'inherit', boxSizing: 'border-box', background: '#ffffff',
                                color: 'var(--tx-main)', outline: 'none'
                            }}
                        />
                    </div>

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
                                    cursor: 'pointer', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>pending_actions</span>
                                Mark In-Progress
                            </button>
                        )}

                        {(selectedTicket.status === 'resolved' || selectedTicket.status === 'rejected') && (
                            <button
                                onClick={() => setConfirmingAction({ type: 'reopen', ticket: selectedTicket })}
                                style={{
                                    padding: '10px 16px', borderRadius: '8px', border: '1px solid var(--border)',
                                    background: 'var(--surface-low)', color: 'var(--tx-main)', fontWeight: 700,
                                    cursor: 'pointer', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px' }}>replay</span>
                                Re-open Ticket
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

                        <button
                            onClick={() => setConfirmingAction({ type: 'delete', ticket: selectedTicket })}
                            style={{
                                padding: '10px 16px', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.4)',
                                background: 'transparent', color: '#b91c1c', fontWeight: 600,
                                cursor: 'pointer', fontSize: '0.88rem', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>delete_forever</span>
                            Delete Ticket
                        </button>
                    </div>
                </div>
            )}

            {/* Confirmation Dialog for All Actions (Single Delete, Bulk Delete, Reset, Resolve, Reject, Reopen) */}
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
                    }} className="gf-fade-up">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '50%',
                                background: ['delete', 'bulk_delete', 'reject'].includes(confirmingAction.type) ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                                color: ['delete', 'bulk_delete', 'reject'].includes(confirmingAction.type) ? '#b91c1c' : '#047857',
                                display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                <span className="material-icons-round" style={{ fontSize: '20px' }}>
                                    {confirmingAction.type.includes('delete') ? 'delete_forever' : confirmingAction.type === 'resolve' ? 'check_circle' : confirmingAction.type === 'reopen' ? 'replay' : 'lock_reset'}
                                </span>
                            </div>
                            <h4 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: 'var(--tx-main)' }}>
                                {confirmingAction.type === 'reset_password'
                                    ? `Reset Password for ${confirmingAction.ticket?.user_identifier}?`
                                    : confirmingAction.type === 'resolve'
                                    ? `Resolve Ticket #${confirmingAction.ticket?.ticket_number}?`
                                    : confirmingAction.type === 'bulk_resolve'
                                    ? `Resolve ${confirmingAction.count} Selected Tickets?`
                                    : confirmingAction.type === 'delete'
                                    ? `Delete Ticket #${confirmingAction.ticket?.ticket_number}?`
                                    : confirmingAction.type === 'bulk_delete'
                                    ? `Delete ${confirmingAction.count} Selected Tickets?`
                                    : confirmingAction.type === 'reopen'
                                    ? `Re-open Ticket #${confirmingAction.ticket?.ticket_number}?`
                                    : `Reject Ticket #${confirmingAction.ticket?.ticket_number}?`}
                            </h4>
                        </div>

                        <p style={{ margin: '0 0 16px 0', fontSize: '0.88rem', color: 'var(--tx-muted)', lineHeight: '1.5' }}>
                            {confirmingAction.type === 'delete'
                                ? `Are you sure you want to permanently delete ticket #${confirmingAction.ticket?.ticket_number}? This action cannot be undone.`
                                : confirmingAction.type === 'bulk_delete'
                                ? `Are you sure you want to permanently delete all ${confirmingAction.count} selected tickets? This action cannot be undone.`
                                : confirmingAction.type === 'reset_password'
                                ? (confirmingAction.ticket?.user_type === 'student'
                                    ? `This will reset the student's password to the standard institutional formula (first 2 letters of name + last 3 digits of USN), allowing them to log in immediately. The ticket will also be marked as resolved.`
                                    : `This will reset the faculty member's password to a secure temporary access key (FAC-XXXXXX) recorded in the ticket notes and mark the ticket resolved.`)
                                : confirmingAction.type === 'reopen'
                                ? `This will reopen the ticket back to active status for further investigation.`
                                : `Add optional resolution notes before confirming:`}
                        </p>

                        {!confirmingAction.type.includes('delete') && (
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
                        )}

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
                                onClick={() => {
                                    if (confirmingAction.type === 'delete') {
                                        handleTicketAction('delete', confirmingAction.ticket.id);
                                    } else if (confirmingAction.type === 'bulk_delete') {
                                        handleTicketAction('bulk_delete', null, null, Array.from(selectedTicketIds));
                                    } else if (confirmingAction.type === 'bulk_resolve') {
                                        handleTicketAction('bulk_resolve', null, adminNotesInput, Array.from(selectedTicketIds));
                                    } else if (confirmingAction.type === 'reopen') {
                                        handleTicketAction('reopen', confirmingAction.ticket.id, adminNotesInput);
                                    } else {
                                        handleTicketAction(confirmingAction.type, confirmingAction.ticket.id);
                                    }
                                }}
                                style={{
                                    padding: '9px 20px', borderRadius: '8px', border: 'none',
                                    background: confirmingAction.type.includes('delete') ? '#b91c1c' : confirmingAction.type === 'reject' ? '#b91c1c' : 'var(--primary)',
                                    color: '#ffffff', fontWeight: 600, cursor: actionBusy ? 'not-allowed' : 'pointer'
                                }}
                            >
                                {actionBusy ? 'Processing...' : confirmingAction.type.includes('delete') ? 'Delete Permanently' : 'Confirm'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Log Manual Support Ticket (Admin) */}
            {showCreateModal && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 10000,
                    background: 'rgba(10, 24, 28, 0.65)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px'
                }}>
                    <div style={{
                        background: 'var(--surface)', border: '1px solid var(--border)',
                        borderRadius: '16px', maxWidth: '560px', width: '100%', padding: '24px',
                        boxShadow: '0 24px 48px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto'
                    }} className="gf-fade-up">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: 'var(--tx-main)' }}>
                                    Log Institutional Support Ticket
                                </h3>
                                <div style={{ fontSize: '0.8rem', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                    Record an in-person, phone, or email support inquiry directly into the system.
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCreateModal(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        {createError && (
                            <div style={{
                                padding: '10px 14px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.3)', color: '#b91c1c', fontSize: '0.85rem',
                                marginBottom: '14px', fontWeight: 600
                            }}>
                                {createError}
                            </div>
                        )}

                        <form onSubmit={handleCreateTicketSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            {/* User Type Segment */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
                                    Requester Type *
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setNewTicketForm(p => ({ ...p, user_type: 'student' }))}
                                        style={{
                                            padding: '8px 12px', borderRadius: '8px',
                                            border: `1px solid ${newTicketForm.user_type === 'student' ? 'var(--primary)' : 'var(--border)'}`,
                                            background: newTicketForm.user_type === 'student' ? 'rgba(23, 75, 77, 0.08)' : 'var(--surface-low)',
                                            color: newTicketForm.user_type === 'student' ? 'var(--primary)' : 'var(--tx-muted)',
                                            fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>school</span>
                                        Student
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setNewTicketForm(p => ({ ...p, user_type: 'faculty' }))}
                                        style={{
                                            padding: '8px 12px', borderRadius: '8px',
                                            border: `1px solid ${newTicketForm.user_type === 'faculty' ? 'var(--primary)' : 'var(--border)'}`,
                                            background: newTicketForm.user_type === 'faculty' ? 'rgba(180, 83, 9, 0.08)' : 'var(--surface-low)',
                                            color: newTicketForm.user_type === 'faculty' ? '#b45309' : 'var(--tx-muted)',
                                            fontWeight: 700, cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>badge</span>
                                        Faculty
                                    </button>
                                </div>
                            </div>

                            {/* Identifier & Name */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        {newTicketForm.user_type === 'student' ? 'Student USN *' : 'Faculty Email *'}
                                    </label>
                                    <input
                                        type="text"
                                        placeholder={newTicketForm.user_type === 'student' ? 'e.g. 2AB23CS001' : 'e.g. prof@anjuman.edu.in'}
                                        value={newTicketForm.user_identifier}
                                        onChange={e => setNewTicketForm(p => ({ ...p, user_identifier: e.target.value.toUpperCase() }))}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                                            fontSize: '0.88rem', background: 'var(--surface-low)', color: 'var(--tx-main)', boxSizing: 'border-box'
                                        }}
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Full Name (Optional)
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="Auto-enriched if found"
                                        value={newTicketForm.user_name}
                                        onChange={e => setNewTicketForm(p => ({ ...p, user_name: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                                            fontSize: '0.88rem', background: 'var(--surface-low)', color: 'var(--tx-main)', boxSizing: 'border-box'
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Category & Initial Status */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Issue Category *
                                    </label>
                                    <select
                                        value={newTicketForm.issue_type}
                                        onChange={e => setNewTicketForm(p => ({ ...p, issue_type: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                                            fontSize: '0.88rem', background: 'var(--surface-low)', color: 'var(--tx-main)', boxSizing: 'border-box'
                                        }}
                                    >
                                        <option value="password_reset">🔑 Password Reset</option>
                                        <option value="login_issue">🔒 Login Problem</option>
                                        <option value="marks_dispute">📊 Marks Discrepancy</option>
                                        <option value="subject_allocation">📚 Subject Allocation</option>
                                        <option value="student_record">🎓 Student Record Access</option>
                                        <option value="grade_card_issue">📄 Grade Sheet Download</option>
                                        <option value="reval_query">🔄 Re-evaluation Query</option>
                                        <option value="other">💬 Other Inquiry</option>
                                    </select>
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                        Initial Status
                                    </label>
                                    <select
                                        value={newTicketForm.initial_status}
                                        onChange={e => setNewTicketForm(p => ({ ...p, initial_status: e.target.value }))}
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                                            fontSize: '0.88rem', background: 'var(--surface-low)', color: 'var(--tx-main)', boxSizing: 'border-box'
                                        }}
                                    >
                                        <option value="open">🔴 Open / Pending</option>
                                        <option value="in_progress">🟡 In Progress</option>
                                        <option value="resolved">🟢 Resolved Immediately</option>
                                    </select>
                                </div>
                            </div>

                            {/* Subject */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                    Subject Summary *
                                </label>
                                <input
                                    type="text"
                                    placeholder="Brief title of the issue"
                                    value={newTicketForm.subject}
                                    onChange={e => setNewTicketForm(p => ({ ...p, subject: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)',
                                        fontSize: '0.88rem', background: 'var(--surface-low)', color: 'var(--tx-main)', boxSizing: 'border-box'
                                    }}
                                />
                            </div>

                            {/* Description */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                    Problem Description *
                                </label>
                                <textarea
                                    rows={3}
                                    placeholder="Detailed inquiry or issue description..."
                                    value={newTicketForm.description}
                                    onChange={e => setNewTicketForm(p => ({ ...p, description: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)',
                                        fontSize: '0.88rem', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--surface-low)', color: 'var(--tx-main)'
                                    }}
                                />
                            </div>

                            {/* Initial Admin Note */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
                                    Initial Admin / Action Note (Optional)
                                </label>
                                <textarea
                                    rows={2}
                                    placeholder="e.g. Advised student to check VTU portal, reset credentials on file..."
                                    value={newTicketForm.admin_notes}
                                    onChange={e => setNewTicketForm(p => ({ ...p, admin_notes: e.target.value }))}
                                    style={{
                                        width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)',
                                        fontSize: '0.88rem', fontFamily: 'inherit', boxSizing: 'border-box', background: 'var(--surface-low)', color: 'var(--tx-main)'
                                    }}
                                />
                            </div>

                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    style={{
                                        padding: '9px 18px', borderRadius: '8px', border: '1px solid var(--border)',
                                        background: 'var(--surface)', color: 'var(--tx-muted)', fontWeight: 600, cursor: 'pointer'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={creatingTicket}
                                    style={{
                                        padding: '9px 22px', borderRadius: '8px', border: 'none',
                                        background: 'var(--primary)', color: '#ffffff', fontWeight: 700,
                                        cursor: creatingTicket ? 'not-allowed' : 'pointer'
                                    }}
                                >
                                    {creatingTicket ? 'Submitting…' : 'Create Support Ticket'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
