'use client';

import { useState, useMemo, useEffect } from 'react';
import {
    ACTION_CATEGORIES,
    ACTION_REGISTRY,
    enrichActivityRecord,
    formatRelativeTime,
    getDepartmentMeta,
    normalizeDepartment,
} from '../lib/pedagogical-audit';
import { apiRequest } from '../lib/api/client';
import { filterAndRank } from '../lib/search-utils';

function renderEntityChips(record) {
    if (!record) return null;
    const meta = record.metadata || {};
    const chips = [];

    // Subject Code(s)
    if (meta.subject_code) {
        chips.push({ label: meta.subject_code, icon: 'book', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.09)', border: 'rgba(37, 99, 235, 0.25)' });
    } else if (Array.isArray(meta.subject_codes) && meta.subject_codes.length > 0) {
        chips.push({ label: meta.subject_codes.join(', '), icon: 'book', color: '#2563eb', bg: 'rgba(37, 99, 235, 0.09)', border: 'rgba(37, 99, 235, 0.25)' });
    }

    // Class Name / Container
    if (meta.class_name || meta.name) {
        chips.push({ label: meta.class_name || meta.name, icon: 'groups', color: '#0284c7', bg: 'rgba(14, 165, 233, 0.09)', border: 'rgba(14, 165, 233, 0.25)' });
    }

    // Modified Fields
    if (meta.updates && typeof meta.updates === 'object') {
        const keys = Object.keys(meta.updates).join(', ');
        chips.push({ label: `Edited: ${keys}`, icon: 'edit', color: '#ea580c', bg: 'rgba(234, 88, 12, 0.09)', border: 'rgba(234, 88, 12, 0.25)' });
    }

    // Student Count
    if (meta.count || meta.transferred_count || meta.studentCount) {
        const c = meta.count || meta.transferred_count || meta.studentCount;
        chips.push({ label: `${c} Students`, icon: 'person', color: '#059669', bg: 'rgba(16, 185, 129, 0.09)', border: 'rgba(16, 185, 129, 0.25)' });
    }

    // Semester / Branch
    if (meta.semester || meta.branch) {
        chips.push({ label: `${meta.branch || ''} Sem ${meta.semester || ''}`.trim(), icon: 'school', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.09)', border: 'rgba(124, 58, 237, 0.25)' });
    }

    if (chips.length === 0) return null;

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap', margin: '4px 0 2px 0' }}>
            {chips.map((chip, idx) => (
                <span
                    key={idx}
                    style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        color: chip.color,
                        background: chip.bg,
                        border: `1px solid ${chip.border}`,
                        padding: '1px 6px',
                        borderRadius: '4px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '3px',
                        lineHeight: '1.4',
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '11px' }}>{chip.icon}</span>
                    <span>{chip.label}</span>
                </span>
            ))}
        </div>
    );
}

export function FacultyActivityContent({
    activityLogs = [],
    students = [],
    facultyList = [],
    classesList = [],
    onInspectStudent = null,
    onInspectFaculty = null,
    onRefresh = null,
    isMobile = false,
}) {
    // ── Filters & Search ───────────────────────────────────────
    const [search, setSearch] = useState('');
    const [selectedDepartment, setSelectedDepartment] = useState('all');
    const [selectedFacultyId, setSelectedFacultyId] = useState('all');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [selectedTimeFilter, setSelectedTimeFilter] = useState('all');
    const [viewMode, setViewMode] = useState('table'); // 'table' | 'cards'

    // ── Modal States ───────────────────────────────────────────
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [copiedNote, setCopiedNote] = useState(false);
    const [copiedUsn, setCopiedUsn] = useState(null);

    // ── Simulate / Quick Log Action Modal ──────────────────────
    const [showLogModal, setShowLogModal] = useState(false);
    const [logAction, setLogAction] = useState('VIEW_RECORD');
    const [logFacultyId, setLogFacultyId] = useState('');
    const [logUsn, setLogUsn] = useState('');
    const [logNote, setLogNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState('');

    // ── Real-Time Data & Live Polling ──────────────────────────
    const [currentLogs, setCurrentLogs] = useState(activityLogs || []);
    const [currentFaculty, setCurrentFaculty] = useState(facultyList || []);
    const [liveSync, setLiveSync] = useState(true);
    const [lastSyncTime, setLastSyncTime] = useState(Date.now());

    useEffect(() => {
        if (activityLogs) setCurrentLogs(activityLogs);
    }, [activityLogs]);

    useEffect(() => {
        if (facultyList) setCurrentFaculty(facultyList);
    }, [facultyList]);

    // Live real-time polling every 3.5 seconds
    useEffect(() => {
        if (!liveSync) return;
        const fetchLatest = async () => {
            if (typeof document !== 'undefined' && document.hidden) return;
            try {
                const res = await fetch('/api/admin/faculty-activity?limit=300');
                const json = await res.json();
                if (json?.success) {
                    if (json.activity && json.activity.length > 0) setCurrentLogs(json.activity);
                    if (json.faculty && json.faculty.length > 0) setCurrentFaculty(json.faculty);
                    setLastSyncTime(Date.now());
                }
            } catch { /* ignored */ }
        };

        const intervalId = setInterval(fetchLatest, 3500);

        const handleFocusOrVisible = () => {
            if (typeof document !== 'undefined' && !document.hidden) {
                fetchLatest();
            }
        };
        window.addEventListener('focus', handleFocusOrVisible);
        document.addEventListener('visibilitychange', handleFocusOrVisible);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocusOrVisible);
            document.removeEventListener('visibilitychange', handleFocusOrVisible);
        };
    }, [liveSync]);

    // ── Build Fast Lookup Maps ─────────────────────────────────
    const facultyMap = useMemo(() => {
        const map = new Map();
        (currentFaculty || []).forEach(f => {
            if (f.id) map.set(f.id, f);
            if (f.email) map.set(f.email.toLowerCase(), f);
        });
        return map;
    }, [currentFaculty]);

    const studentMap = useMemo(() => {
        const map = new Map();
        (students || []).forEach(s => {
            if (s.usn) map.set(s.usn.toUpperCase().trim(), s);
        });
        return map;
    }, [students]);

    // ── Enrich Logs ────────────────────────────────────────────
    const enrichedLogs = useMemo(() => {
        return (currentLogs || []).map(log => enrichActivityRecord(log, facultyMap, studentMap));
    }, [currentLogs, facultyMap, studentMap]);

    // ── Faculty Login & Presence Status ────────────────────────
    const facultyPresenceList = useMemo(() => {
        return (currentFaculty || []).map(f => {
            // Find all logs for this faculty
            const facultyLogs = enrichedLogs.filter(l =>
                l.faculty_id === f.id ||
                l.who?.email?.toLowerCase() === f.email?.toLowerCase() ||
                l.who?.name?.toLowerCase() === f.full_name?.toLowerCase()
            );

            // Compute latest login or activity timestamp
            let latestTimestamp = f.last_login_at || null;
            let latestIp = f.last_login_ip || null;

            if (facultyLogs.length > 0) {
                const sorted = [...facultyLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
                const latestLog = sorted[0];
                if (!latestTimestamp || new Date(latestLog.created_at) > new Date(latestTimestamp)) {
                    latestTimestamp = latestLog.created_at;
                    latestIp = latestLog.where?.ip || latestIp;
                }
            }

            // Determine status
            let status = 'offline';
            let statusLabel = 'Offline';
            let dotColor = '#9ca3af';

            const sortedLogs = facultyLogs.length > 0 ? [...facultyLogs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : [];
            const latestLogAction = sortedLogs[0]?.action_type || '';
            const isExplicitLogout = latestLogAction === 'FACULTY_LOGOUT' || latestLogAction === 'FACULTY_CHECKOUT';

            if (latestTimestamp) {
                const diffMs = Date.now() - new Date(latestTimestamp).getTime();
                if (isExplicitLogout) {
                    status = 'offline';
                    statusLabel = 'Logged Out';
                    dotColor = '#9ca3af';
                } else if (diffMs <= 20 * 60 * 1000) {
                    status = 'online';
                    statusLabel = 'Online Now';
                    dotColor = '#10b981';
                } else if (diffMs <= 60 * 60 * 1000) {
                    status = 'recent';
                    const mins = Math.max(1, Math.round(diffMs / 60000));
                    statusLabel = `Active ${mins}m ago`;
                    dotColor = '#3b82f6';
                } else if (diffMs <= 24 * 60 * 60 * 1000) {
                    status = 'today';
                    const timeStr = new Date(latestTimestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
                    statusLabel = `Active at ${timeStr}`;
                    dotColor = '#f59e0b';
                } else {
                    status = 'offline';
                    statusLabel = 'Offline';
                    dotColor = '#9ca3af';
                }
            }

            const deptMeta = getDepartmentMeta(f.department);

            return {
                ...f,
                deptMeta,
                totalActions: facultyLogs.length,
                latestTimestamp,
                latestRelative: formatRelativeTime(latestTimestamp),
                status,
                statusLabel,
                dotColor,
            };
        });
    }, [currentFaculty, enrichedLogs]);


    // ── Distinct Departments with Counts ───────────────────────
    const departmentStats = useMemo(() => {
        const statsMap = new Map();

        // Seed with all known faculty departments
        (facultyList || []).forEach(f => {
            const meta = getDepartmentMeta(f.department);
            if (!statsMap.has(meta.name)) {
                statsMap.set(meta.name, {
                    ...meta,
                    actionCount: 0,
                    facultyCount: 0,
                });
            }
            statsMap.get(meta.name).facultyCount += 1;
        });

        // Tally logs
        enrichedLogs.forEach(l => {
            const deptName = l.department || l.who?.department || 'Computer Science & Engineering';
            const meta = getDepartmentMeta(deptName);
            if (!statsMap.has(meta.name)) {
                statsMap.set(meta.name, {
                    ...meta,
                    actionCount: 0,
                    facultyCount: 0,
                });
            }
            statsMap.get(meta.name).actionCount += 1;
        });

        return Array.from(statsMap.values()).sort((a, b) => b.actionCount - a.actionCount);
    }, [facultyList, enrichedLogs]);

    // ── Filtered Records ───────────────────────────────────────
    const filteredRecords = useMemo(() => {
        let list = enrichedLogs.filter(record => {
            // Department filter
            if (selectedDepartment !== 'all') {
                const normSelected = normalizeDepartment(selectedDepartment);
                const recordDept = normalizeDepartment(record.department || record.who?.department);
                if (recordDept !== normSelected) return false;
            }

            // Faculty filter
            if (selectedFacultyId !== 'all') {
                const matchesFaculty = record.who?.id === selectedFacultyId ||
                    record.faculty_id === selectedFacultyId ||
                    record.who?.email === selectedFacultyId;
                if (!matchesFaculty) return false;
            }

            // Category filter
            if (selectedCategory !== 'all') {
                if (selectedCategory === 'HALL_TICKET') {
                    const isHt = record.action_type === 'HALL_TICKET_GENERATE' ||
                        record.action_type === 'HALL_TICKET_BATCH_EXPORT' ||
                        record.what?.code === 'HALL_TICKET_GENERATE' ||
                        record.what?.code === 'HALL_TICKET_BATCH_EXPORT' ||
                        record.what?.category?.id === 'EXAM_GOVERNANCE';
                    if (!isHt) return false;
                } else if (record.what?.category?.id !== selectedCategory) {
                    return false;
                }
            }

            // Time filter
            if (selectedTimeFilter !== 'all' && record.created_at) {
                const logTime = new Date(record.created_at).getTime();
                const now = Date.now();
                if (selectedTimeFilter === 'today') {
                    const todayStr = new Date().toISOString().slice(0, 10);
                    if (!record.created_at.startsWith(todayStr)) return false;
                } else if (selectedTimeFilter === '24h') {
                    if (now - logTime > 24 * 60 * 60 * 1000) return false;
                } else if (selectedTimeFilter === '7d') {
                    if (now - logTime > 7 * 24 * 60 * 60 * 1000) return false;
                } else if (selectedTimeFilter === '30d') {
                    if (now - logTime > 30 * 24 * 60 * 60 * 1000) return false;
                }
            }

            return true;
        });

        if (search.trim()) {
            list = filterAndRank(list, search, [
                r => r.who?.name,
                r => r.who?.email,
                r => r.who?.department,
                r => r.what?.title,
                r => r.what?.code,
                r => r.details,
                r => r.what?.details,
                r => r.target?.usn,
                r => r.target?.studentName,
                r => r.why?.reason,
                r => r.where?.clientEnv,
                r => r.where?.ip,
            ]);
        }

        return list;
    }, [enrichedLogs, search, selectedDepartment, selectedFacultyId, selectedCategory, selectedTimeFilter]);

    // ── Active Filters Check ───────────────────────────────────
    const hasActiveFilters = Boolean(
        search.trim() ||
        selectedDepartment !== 'all' ||
        selectedFacultyId !== 'all' ||
        selectedCategory !== 'all' ||
        selectedTimeFilter !== 'all'
    );

    const clearAllFilters = () => {
        setSearch('');
        setSelectedDepartment('all');
        setSelectedFacultyId('all');
        setSelectedCategory('all');
        setSelectedTimeFilter('all');
    };

    // ── Escape Key Listener ────────────────────────────────────
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                setSelectedRecord(null);
                setShowLogModal(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // ── Helpers ────────────────────────────────────────────────
    const handleCopyUsn = (usn, e) => {
        e.stopPropagation();
        if (!usn) return;
        navigator.clipboard.writeText(usn);
        setCopiedUsn(usn);
        setTimeout(() => setCopiedUsn(null), 1500);
    };

    const handleCopyDetails = (rec) => {
        const text = `Faculty: ${rec.who?.name} (${rec.who?.department})\nAction: ${rec.what?.title}\nTarget USN: ${rec.target?.usn || 'N/A'}\nTime: ${rec.when?.date} ${rec.when?.time}\nReason: ${rec.why?.reason || 'N/A'}`;
        navigator.clipboard.writeText(text);
        setCopiedNote(true);
        setTimeout(() => setCopiedNote(false), 1500);
    };

    // ── Export & Refresh States ───────────────────────────────
    const [isExporting, setIsExporting] = useState(false);
    const [exportSuccess, setExportSuccess] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshSuccess, setRefreshSuccess] = useState(false);

    // ── Safe Refresh Handler ───────────────────────────────────
    const handleRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        setRefreshSuccess(false);
        try {
            const res = await fetch('/api/admin/faculty-activity?limit=300');
            const json = await res.json();
            if (json?.success) {
                if (json.activity && json.activity.length > 0) setCurrentLogs(json.activity);
                if (json.faculty && json.faculty.length > 0) setCurrentFaculty(json.faculty);
                setLastSyncTime(Date.now());
            }
            if (onRefresh) {
                await onRefresh();
            }
            setRefreshSuccess(true);
            setTimeout(() => setRefreshSuccess(false), 2000);
        } catch (err) {
            console.error('Failed to refresh faculty activity:', err);
        } finally {
            setIsRefreshing(false);
        }
    };


    // ── Robust CSV Export ──────────────────────────────────────
    const handleExportCSV = () => {
        setIsExporting(true);
        try {
            const recordsToExport = (filteredRecords && filteredRecords.length > 0) ? filteredRecords : enrichedLogs;
            if (!recordsToExport || recordsToExport.length === 0) {
                alert('No faculty activity records available to export.');
                setIsExporting(false);
                return;
            }

            const headers = [
                'Timestamp',
                'Date',
                'Time',
                'Faculty Name',
                'Faculty Email',
                'Department',
                'Action Code',
                'Action Title',
                'Target USN',
                'Target Student Name',
                'Reason / Notes',
                'Module Context',
                'Status'
            ];

            const escapeCsv = (val) => {
                if (val === null || val === undefined) return '""';
                return `"${String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ')}"`;
            };

            const rows = recordsToExport.map(r => [
                escapeCsv(r.created_at || r.when?.iso || ''),
                escapeCsv(r.when?.date || ''),
                escapeCsv(r.when?.time || ''),
                escapeCsv(r.who?.name || r.faculty_name || 'Faculty Member'),
                escapeCsv(r.who?.email || ''),
                escapeCsv(r.department || r.who?.department || ''),
                escapeCsv(r.what?.code || r.action_type || ''),
                escapeCsv(r.what?.title || ''),
                escapeCsv(r.target?.usn || r.target_usn || ''),
                escapeCsv(r.target?.studentName || ''),
                escapeCsv(r.why?.reason || r.reason || r.what?.details || ''),
                escapeCsv(r.where?.module || r.context_module || ''),
                escapeCsv(r.how?.status || r.sync_status || 'SUCCESS')
            ]);

            const csvContent = '\ufeff' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `faculty_activity_${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            setExportSuccess(true);
            setTimeout(() => setExportSuccess(false), 2500);
        } catch (err) {
            console.error('Export error:', err);
            alert('Failed to export CSV: ' + err.message);
        } finally {
            setIsExporting(false);
        }
    };

    // ── Log Action Handler ─────────────────────────────────────
    const handleOpenLogModal = () => {
        setLogAction('VIEW_RECORD');
        setLogFacultyId(facultyList[0]?.id || 'admin');
        setLogUsn('');
        setLogNote('');
        setSubmitSuccess('');
        setShowLogModal(true);
    };

    const handleLogSubmit = async () => {
        setIsSubmitting(true);
        setSubmitSuccess('');
        try {
            const isSystemAdmin = logFacultyId === 'admin' || !logFacultyId;
            const facultyObj = !isSystemAdmin ? facultyList.find(f => f.id === logFacultyId) : null;
            const targetStudent = students.find(s => s.usn === logUsn.toUpperCase().trim());

            await apiRequest('/api/admin/faculty-activity', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    faculty_id: facultyObj?.id || null,
                    faculty_name: facultyObj?.full_name || 'Institution Administrator',
                    action_type: logAction,
                    target_usn: logUsn ? logUsn.trim().toUpperCase() : undefined,
                    reason: logNote.trim() || undefined,
                    details: logNote.trim() || `Action ${logAction} recorded by ${facultyObj?.full_name || 'Institution Administrator'}.`,
                    metadata: {
                        student_name: targetStudent?.name || null,
                    },
                }),
            });

            setSubmitSuccess('✓ Action recorded successfully! Refreshing...');
            if (onRefresh) await onRefresh();
            setTimeout(() => {
                setSubmitSuccess('');
                setShowLogModal(false);
                setLogNote('');
                setLogUsn('');
            }, 1000);
        } catch (err) {
            alert('Failed to log action: ' + err.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Active counts
    const onlineNowCount = useMemo(() => facultyPresenceList.filter(f => f.status === 'online').length, [facultyPresenceList]);
    const activeTodayCount = useMemo(() => facultyPresenceList.filter(f => f.status === 'today' || f.status === 'online' || f.status === 'recent').length, [facultyPresenceList]);
    const offlineCount = useMemo(() => facultyPresenceList.filter(f => f.status === 'offline').length, [facultyPresenceList]);
    const hallTicketsCount = useMemo(() => enrichedLogs.filter(l =>
        l.action_type === 'HALL_TICKET_GENERATE' ||
        l.action_type === 'HALL_TICKET_BATCH_EXPORT' ||
        l.what?.code === 'HALL_TICKET_GENERATE' ||
        l.what?.code === 'HALL_TICKET_BATCH_EXPORT' ||
        l.what?.category?.id === 'EXAM_GOVERNANCE'
    ).length, [enrichedLogs]);


    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', width: '100%', minWidth: 0 }}>
            {/* ── Page Header ──────────────────────────────────────── */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                    <h1 style={{ fontSize: 'clamp(20px, 3vw, 24px)', fontWeight: 800, color: 'var(--tx-main)', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
                        Faculty Activity & Logins
                    </h1>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--tx-muted)' }}>
                        Track faculty activity, login presence, and actions across academic departments.
                    </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    {/* Export CSV Button with live state */}
                    <button
                        onClick={handleExportCSV}
                        disabled={isExporting}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: exportSuccess ? '1px solid #059669' : '1px solid var(--border)',
                            background: exportSuccess ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface)',
                            color: exportSuccess ? '#059669' : 'var(--tx-main)',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: isExporting ? 'wait' : 'pointer',
                            transition: 'all 0.15s ease',
                        }}
                        title="Download activity logs as CSV"
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px', color: exportSuccess ? '#059669' : '#059669' }}>
                            {exportSuccess ? 'check_circle' : 'download'}
                        </span>
                        <span>{exportSuccess ? 'Exported!' : isExporting ? 'Exporting...' : 'Export CSV'}</span>
                    </button>

                    {/* Log Action Button */}
                    <button
                        onClick={handleOpenLogModal}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: 'var(--primary)',
                            color: 'var(--bg)',
                            fontSize: '12px',
                            fontWeight: 800,
                            cursor: 'pointer',
                            transition: 'opacity 0.15s ease',
                        }}
                        title="Manually log or simulate a faculty activity"
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>add</span>
                        Log Action
                    </button>

                    {/* Refresh Button with spinning icon and tooltip */}
                    {onRefresh && (
                        <button
                            onClick={handleRefresh}
                            disabled={isRefreshing}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '8px 10px',
                                borderRadius: '8px',
                                border: refreshSuccess ? '1px solid #059669' : '1px solid var(--border)',
                                background: refreshSuccess ? 'rgba(16, 185, 129, 0.1)' : 'var(--surface)',
                                color: refreshSuccess ? '#059669' : 'var(--tx-muted)',
                                fontSize: '12px',
                                cursor: isRefreshing ? 'wait' : 'pointer',
                                transition: 'all 0.15s ease',
                            }}
                            title={isRefreshing ? 'Refreshing data...' : refreshSuccess ? 'Refreshed!' : 'Refresh activity logs'}
                        >
                            <span
                                className="material-icons-round"
                                style={{
                                    fontSize: '16px',
                                    animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none',
                                    color: refreshSuccess ? '#059669' : 'inherit',
                                }}
                            >
                                {refreshSuccess ? 'check' : 'refresh'}
                            </span>
                        </button>
                    )}
                </div>
            </div>

            {/* ── Faculty Login Status & Quick Filter Strip ─────────── */}
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>sensors</span>
                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>
                            Faculty Real-Time Presence & Status
                        </span>
                        
                        {/* Real-Time Status Badges */}
                        <span style={{
                            fontSize: '11px',
                            fontWeight: 800,
                            padding: '3px 9px',
                            borderRadius: '12px',
                            background: onlineNowCount > 0 ? 'rgba(16, 185, 129, 0.15)' : 'var(--surface-low)',
                            color: onlineNowCount > 0 ? '#059669' : 'var(--tx-dim)',
                            border: onlineNowCount > 0 ? '1px solid rgba(16, 185, 129, 0.35)' : '1px solid var(--border)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                        }}>
                            <span style={{
                                width: '7px',
                                height: '7px',
                                borderRadius: '50%',
                                background: onlineNowCount > 0 ? '#10b981' : '#9ca3af',
                                boxShadow: onlineNowCount > 0 ? '0 0 0 2px rgba(16, 185, 129, 0.4)' : 'none',
                            }} />
                            {onlineNowCount} Online Now
                        </span>

                        <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 9px',
                            borderRadius: '12px',
                            background: activeTodayCount > 0 ? 'rgba(59, 130, 246, 0.1)' : 'var(--surface-low)',
                            color: activeTodayCount > 0 ? 'var(--primary)' : 'var(--tx-dim)',
                            border: '1px solid var(--border)',
                        }}>
                            {activeTodayCount} Active Today
                        </span>

                        {hallTicketsCount > 0 && (
                            <button
                                type="button"
                                onClick={() => setSelectedCategory(selectedCategory === 'HALL_TICKET' ? 'all' : 'HALL_TICKET')}
                                style={{
                                    fontSize: '11px',
                                    fontWeight: 800,
                                    padding: '3px 9px',
                                    borderRadius: '12px',
                                    background: selectedCategory === 'HALL_TICKET' ? '#7c3aed' : 'rgba(139, 92, 246, 0.12)',
                                    color: selectedCategory === 'HALL_TICKET' ? '#ffffff' : '#7c3aed',
                                    border: '1px solid rgba(139, 92, 246, 0.35)',
                                    cursor: 'pointer',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    transition: 'all 0.15s ease',
                                }}
                                title="Click to filter activities to Hall Ticket Generation"
                            >
                                <span className="material-icons-round" style={{ fontSize: '13px' }}>confirmation_number</span>
                                {hallTicketsCount} Hall Tickets Issued {selectedCategory === 'HALL_TICKET' ? '✕' : ''}
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {/* Live Feed Heartbeat & Pause/Resume Toggle */}
                        <button
                            type="button"
                            onClick={() => setLiveSync(prev => !prev)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                background: liveSync ? 'rgba(16, 185, 129, 0.08)' : 'var(--surface-low)',
                                border: liveSync ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border)',
                                color: liveSync ? '#059669' : 'var(--tx-muted)',
                                borderRadius: '6px',
                                padding: '4px 10px',
                                fontSize: '11px',
                                fontWeight: 800,
                                cursor: 'pointer',
                            }}
                            title={liveSync ? 'Live real-time feed polling every 3.5s. Click to pause.' : 'Live feed paused. Click to resume auto-polling.'}
                        >
                            <span style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                background: liveSync ? '#10b981' : '#9ca3af',
                            }} />
                            {liveSync ? 'LIVE FEED (3.5s)' : 'PAUSED'}
                        </button>
                    </div>
                </div>

                {/* Faculty Quick Cards Grid */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: '8px',
                }}>
                    {facultyPresenceList.map(faculty => {
                        const isSelected = selectedFacultyId === faculty.id || selectedFacultyId === faculty.email;
                        const dept = faculty.deptMeta;

                        return (
                            <div
                                key={faculty.id}
                                onClick={() => {
                                    if (isSelected) {
                                        setSelectedFacultyId('all');
                                    } else {
                                        setSelectedFacultyId(faculty.id);
                                    }
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    borderRadius: '10px',
                                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : 'var(--surface-low)',
                                    border: '1px solid ' + (isSelected ? 'var(--primary)' : 'var(--border)'),
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    gap: '10px',
                                }}
                                title={`Filter by ${faculty.full_name}`}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                    {/* Avatar with status indicator */}
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <div style={{
                                            width: '32px',
                                            height: '32px',
                                            borderRadius: '8px',
                                            background: isSelected ? 'var(--primary)' : 'var(--surface)',
                                            color: isSelected ? 'var(--bg)' : 'var(--tx-main)',
                                            border: '1px solid var(--border)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '12px',
                                            fontWeight: 800,
                                        }}>
                                            {((faculty.full_name || '?')[0]).toUpperCase()}
                                        </div>
                                        <span style={{
                                            position: 'absolute',
                                            bottom: '-2px',
                                            right: '-2px',
                                            width: '9px',
                                            height: '9px',
                                            borderRadius: '50%',
                                            background: faculty.dotColor,
                                            border: '2px solid var(--surface)',
                                            boxShadow: faculty.status === 'online' ? '0 0 0 2px rgba(16, 185, 129, 0.4)' : 'none',
                                        }} />
                                    </div>

                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {faculty.full_name}
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            <span style={{
                                                fontSize: '9px',
                                                fontWeight: 800,
                                                padding: '1px 5px',
                                                borderRadius: '4px',
                                                background: dept.bg,
                                                color: dept.color,
                                            }}>
                                                {dept.code}
                                            </span>
                                            <span style={{
                                                fontSize: '10px',
                                                fontWeight: faculty.status === 'online' ? 800 : 500,
                                                color: faculty.status === 'online' ? '#10b981' : 'var(--tx-dim)',
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis'
                                            }}>
                                                {faculty.status === 'online' ? '🟢 Online Now' : faculty.statusLabel}
                                            </span>
                                        </div>
                                    </div>
                                </div>


                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <span style={{
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        color: isSelected ? 'var(--primary)' : 'var(--tx-muted)',
                                    }}>
                                        {isSelected ? 'Active Filter' : `${faculty.totalActions} logs`}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Department Filter Tabs ───────────────────────────── */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '2px',
                scrollbarWidth: 'none',
            }}>
                <button
                    onClick={() => setSelectedDepartment('all')}
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: selectedDepartment === 'all' ? 800 : 600,
                        background: selectedDepartment === 'all' ? 'var(--primary)' : 'var(--surface)',
                        color: selectedDepartment === 'all' ? 'var(--bg)' : 'var(--tx-muted)',
                        border: '1px solid ' + (selectedDepartment === 'all' ? 'var(--primary)' : 'var(--border)'),
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.15s ease',
                    }}
                >
                    All Departments ({enrichedLogs.length})
                </button>

                {departmentStats.map(dept => {
                    const isSelected = selectedDepartment === dept.name;
                    return (
                        <button
                            key={dept.name}
                            onClick={() => setSelectedDepartment(dept.name)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '12px',
                                fontWeight: isSelected ? 800 : 600,
                                background: isSelected ? dept.bg : 'var(--surface)',
                                color: isSelected ? dept.color : 'var(--tx-muted)',
                                border: '1px solid ' + (isSelected ? dept.color : 'var(--border)'),
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s ease',
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '14px' }}>{dept.icon}</span>
                            <span>{dept.name}</span>
                            <span style={{
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontSize: '10px',
                                fontWeight: 800,
                                background: isSelected ? 'rgba(0,0,0,0.1)' : 'var(--surface-low)',
                                color: isSelected ? dept.color : 'var(--tx-dim)',
                            }}>
                                {dept.actionCount}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ── Search & Filter Controls (Single Row, Responsive) ── */}
            <div style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '12px 14px',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                alignItems: 'center',
            }}>
                {/* Universal Search Input */}
                <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '180px' }}>
                    <span className="material-icons-round" style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        fontSize: '16px',
                        color: 'var(--tx-dim)',
                        pointerEvents: 'none',
                    }}>
                        search
                    </span>
                    <input
                        type="text"
                        placeholder="Search faculty, action, student USN..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 12px 8px 34px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface-low)',
                            color: 'var(--tx-main)',
                            fontSize: '13px',
                            outline: 'none',
                        }}
                    />
                    {search && (
                        <button
                            onClick={() => setSearch('')}
                            style={{
                                position: 'absolute',
                                right: '8px',
                                top: '50%',
                                transform: 'translateY(-50%)',
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                                color: 'var(--tx-dim)',
                                display: 'flex',
                                alignItems: 'center',
                                padding: '2px',
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '15px' }}>close</span>
                        </button>
                    )}
                </div>

                {/* Faculty Dropdown */}
                <select
                    value={selectedFacultyId}
                    onChange={e => setSelectedFacultyId(e.target.value)}
                    style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-low)',
                        color: 'var(--tx-main)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flex: '0 1 180px',
                        minWidth: '140px',
                    }}
                >
                    <option value="all">All Faculty ({facultyList.length})</option>
                    {facultyList.map(f => (
                        <option key={f.id} value={f.id}>{f.full_name}</option>
                    ))}
                </select>

                {/* Action Category Dropdown */}
                <select
                    value={selectedCategory}
                    onChange={e => setSelectedCategory(e.target.value)}
                    style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-low)',
                        color: 'var(--tx-main)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flex: '0 1 150px',
                        minWidth: '130px',
                    }}
                >
                    <option value="all">All Action Types</option>
                    <option value="HALL_TICKET">🎟️ Hall Tickets Generated ({hallTicketsCount})</option>
                    {Object.values(ACTION_CATEGORIES).map(c => (
                        <option key={c.id} value={c.id}>{c.shortLabel}</option>
                    ))}

                </select>

                {/* Time Period Dropdown */}
                <select
                    value={selectedTimeFilter}
                    onChange={e => setSelectedTimeFilter(e.target.value)}
                    style={{
                        padding: '8px 10px',
                        borderRadius: '8px',
                        border: '1px solid var(--border)',
                        background: 'var(--surface-low)',
                        color: 'var(--tx-main)',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        flex: '0 1 120px',
                        minWidth: '100px',
                    }}
                >
                    <option value="all">All Time</option>
                    <option value="today">Today</option>
                    <option value="24h">Past 24h</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                </select>

                {/* View Mode Toggle (Table / Cards) */}
                <div style={{
                    display: 'inline-flex',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-low)',
                    padding: '2px',
                }}>
                    <button
                        onClick={() => setViewMode('table')}
                        style={{
                            padding: '5px 8px',
                            borderRadius: '6px',
                            border: 'none',
                            background: viewMode === 'table' ? 'var(--surface)' : 'transparent',
                            color: viewMode === 'table' ? 'var(--primary)' : 'var(--tx-dim)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                        title="Table View"
                    >
                        <span className="material-icons-round" style={{ fontSize: '17px' }}>table_rows</span>
                    </button>
                    <button
                        onClick={() => setViewMode('cards')}
                        style={{
                            padding: '5px 8px',
                            borderRadius: '6px',
                            border: 'none',
                            background: viewMode === 'cards' ? 'var(--surface)' : 'transparent',
                            color: viewMode === 'cards' ? 'var(--primary)' : 'var(--tx-dim)',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                        title="Cards View"
                    >
                        <span className="material-icons-round" style={{ fontSize: '17px' }}>grid_view</span>
                    </button>
                </div>

                {/* Reset Filters */}
                {hasActiveFilters && (
                    <button
                        onClick={clearAllFilters}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            background: 'var(--surface-low)',
                            color: 'var(--primary)',
                            fontSize: '11px',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '13px' }}>clear</span>
                        Reset Filters
                    </button>
                )}

                <div style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--tx-dim)' }}>
                    Showing <strong>{filteredRecords.length}</strong> of <strong>{enrichedLogs.length}</strong> activities
                </div>
            </div>

            {/* ── Table View (Clean & Responsive) ───────────────────── */}
            {viewMode === 'table' && !isMobile ? (
                <div style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    overflow: 'hidden',
                }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', width: '110px' }}>
                                        Time
                                    </th>
                                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', width: '200px' }}>
                                        Faculty
                                    </th>
                                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', width: '150px' }}>
                                        Department
                                    </th>
                                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', width: '240px' }}>
                                        Action & Student
                                    </th>
                                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>
                                        Details / Reason
                                    </th>
                                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', width: '80px', textAlign: 'center' }}>
                                        Status
                                    </th>
                                    <th style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase', width: '60px', textAlign: 'right' }}>
                                        View
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map((record, i) => {
                                    const dept = record.who?.deptMeta || getDepartmentMeta(record.department);
                                    const cat = record.what?.category || ACTION_CATEGORIES.ACADEMIC_AUDIT;

                                    return (
                                        <tr
                                            key={record.id || i}
                                            onClick={() => setSelectedRecord(record)}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                cursor: 'pointer',
                                                transition: 'background 0.12s ease',
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                                        >
                                            {/* Time */}
                                            <td style={{ padding: '12px 14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                    {record.when?.relative}
                                                </div>
                                                <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                                    {record.when?.date}
                                                </div>
                                            </td>

                                            {/* Faculty */}
                                            <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{
                                                        width: '28px',
                                                        height: '28px',
                                                        borderRadius: '6px',
                                                        background: 'var(--surface-low)',
                                                        border: '1px solid var(--border)',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontSize: '11px',
                                                        fontWeight: 900,
                                                        color: 'var(--primary)',
                                                        flexShrink: 0,
                                                    }}>
                                                        {record.who?.initials}
                                                    </div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {record.who?.name}
                                                        </div>
                                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {record.who?.email}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Department */}
                                            <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                                <span style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: '4px',
                                                    padding: '2px 8px',
                                                    borderRadius: '6px',
                                                    background: dept.bg,
                                                    color: dept.color,
                                                    border: '1px solid ' + dept.border,
                                                    fontSize: '11px',
                                                    fontWeight: 800,
                                                }}>
                                                    <span className="material-icons-round" style={{ fontSize: '12px' }}>{dept.icon}</span>
                                                    <span>{dept.name}</span>
                                                </span>
                                            </td>

                                            {/* Action & Student */}
                                            <td style={{ padding: '12px 14px', verticalAlign: 'top' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                                                    <span style={{ fontWeight: 800, fontSize: '12px', color: 'var(--tx-main)' }}>
                                                        {(record.action_type === 'HALL_TICKET_GENERATE' || record.action_type === 'HALL_TICKET_BATCH_EXPORT')
                                                            ? 'VTU SEE Hall Tickets Issued & Verified'
                                                            : (record.what?.title || record.action_type)}
                                                    </span>
                                                    {(record.action_type === 'HALL_TICKET_GENERATE' || record.action_type === 'HALL_TICKET_BATCH_EXPORT' || record.what?.code === 'HALL_TICKET_GENERATE') && (
                                                        <span style={{
                                                            fontSize: '10px',
                                                            fontWeight: 900,
                                                            padding: '2px 7px',
                                                            borderRadius: '5px',
                                                            background: 'rgba(139, 92, 246, 0.15)',
                                                            color: '#7c3aed',
                                                            border: '1px solid rgba(139, 92, 246, 0.35)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            letterSpacing: '0.02em',
                                                        }}>
                                                            <span className="material-icons-round" style={{ fontSize: '12px' }}>confirmation_number</span>
                                                            HALL TICKET
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Hall ticket specific student cohort pill */}
                                                {(record.metadata?.studentCount || record.metadata?.branch || record.metadata?.semester) && (
                                                    <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                                                        <span style={{
                                                            fontSize: '11px',
                                                            fontWeight: 800,
                                                            color: '#6d28d9',
                                                            background: 'rgba(124, 58, 237, 0.08)',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            border: '1px solid rgba(124, 58, 237, 0.2)',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                        }}>
                                                            <span className="material-icons-round" style={{ fontSize: '12px' }}>school</span>
                                                            {record.metadata.branch || 'Cohort'} Sem {record.metadata.semester || ''} • {record.metadata.studentCount} Students
                                                        </span>
                                                        {record.metadata?.filename && (
                                                            <span style={{ fontSize: '10px', color: 'var(--tx-dim)', fontFamily: 'monospace' }}>
                                                                {record.metadata.filename}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {record.target?.usn && !record.metadata?.studentCount && (
                                                    <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span
                                                            onClick={(e) => handleCopyUsn(record.target.usn, e)}
                                                            style={{
                                                                fontFamily: 'monospace',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                color: 'var(--primary)',
                                                                background: 'var(--surface-low)',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                border: '1px solid var(--border)',
                                                                cursor: 'pointer',
                                                            }}
                                                            title="Click to copy USN"
                                                        >
                                                            {record.target.usn} {copiedUsn === record.target.usn ? '✓' : ''}
                                                        </span>
                                                        {record.target?.studentName && (
                                                            <span style={{ fontSize: '11px', color: 'var(--tx-dim)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                                                                {record.target.studentName}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </td>


                                            {/* Details / Reason */}
                                            <td style={{ padding: '12px 14px', verticalAlign: 'top', maxWidth: '380px' }}>
                                                {/* 1. EXACT ACTION PERFORMED (High contrast bold) */}
                                                <div style={{
                                                    fontSize: '12.5px',
                                                    fontWeight: 750,
                                                    color: 'var(--tx-main)',
                                                    lineHeight: '1.4',
                                                    marginBottom: '2px',
                                                }}>
                                                    {record.details || record.what?.details || record.why?.reason || 'Academic operation completed.'}
                                                </div>

                                                {/* 2. Structured Entity Chips (Subject, Class, Fields, Counts) */}
                                                {renderEntityChips(record)}

                                                {/* 3. Reason / Compliance Intent (Subtle secondary) */}
                                                <div style={{
                                                    fontSize: '11px',
                                                    color: 'var(--tx-dim)',
                                                    lineHeight: '1.3',
                                                    marginTop: '2px',
                                                    display: '-webkit-box',
                                                    WebkitLineClamp: 2,
                                                    WebkitBoxOrient: 'vertical',
                                                    overflow: 'hidden',
                                                }}
                                                title={record.why?.reason || record.reason || ''}
                                                >
                                                    <span style={{ opacity: 0.85 }}>
                                                        {record.why?.reason || record.reason || 'Verified institutional academic action.'}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Status */}
                                            <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'center' }}>
                                                <span style={{
                                                    display: 'inline-block',
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '10px',
                                                    fontWeight: 800,
                                                    background: record.how?.isSuccess ? 'var(--green-bg)' : 'var(--red-bg)',
                                                    color: record.how?.isSuccess ? 'var(--green)' : 'var(--red)',
                                                }}>
                                                    {record.how?.status || 'SUCCESS'}
                                                </span>
                                            </td>

                                            {/* View Button */}
                                            <td style={{ padding: '12px 14px', verticalAlign: 'top', textAlign: 'right' }}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedRecord(record);
                                                    }}
                                                    style={{
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        border: '1px solid var(--border)',
                                                        background: 'var(--surface-low)',
                                                        color: 'var(--tx-muted)',
                                                        fontSize: '11px',
                                                        fontWeight: 700,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}

                                {filteredRecords.length === 0 && (
                                    <tr>
                                        <td colSpan="7" style={{ padding: '40px 20px', textAlign: 'center' }}>
                                            <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--tx-dim)', marginBottom: '8px', display: 'block' }}>
                                                search_off
                                            </span>
                                            <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>
                                                No faculty activities match your search or filters.
                                            </div>
                                            <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                                Try selecting "All Departments" or clearing your search.
                                            </div>
                                            <button
                                                onClick={clearAllFilters}
                                                style={{
                                                    marginTop: '12px',
                                                    padding: '6px 14px',
                                                    borderRadius: '8px',
                                                    border: '1px solid var(--border)',
                                                    background: 'var(--surface)',
                                                    color: 'var(--primary)',
                                                    fontSize: '12px',
                                                    fontWeight: 700,
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Clear Active Filters
                                            </button>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* ── Cards View (Mobile & Tablet friendly) ─────────── */
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                    gap: '10px',
                }}>
                    {filteredRecords.map((record, i) => {
                        const dept = record.who?.deptMeta || getDepartmentMeta(record.department);

                        return (
                            <div
                                key={record.id || i}
                                onClick={() => setSelectedRecord(record)}
                                style={{
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    padding: '14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    cursor: 'pointer',
                                    transition: 'border-color 0.15s ease',
                                }}
                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                            >
                                {/* Card Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            width: '28px',
                                            height: '28px',
                                            borderRadius: '6px',
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '11px',
                                            fontWeight: 800,
                                            color: 'var(--primary)',
                                        }}>
                                            {record.who?.initials}
                                        </div>
                                        <div>
                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                                {record.who?.name}
                                            </div>
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>
                                                {record.when?.relative}
                                            </div>
                                        </div>
                                    </div>

                                    <span style={{
                                        fontSize: '9px',
                                        fontWeight: 800,
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        background: dept.bg,
                                        color: dept.color,
                                    }}>
                                        {dept.code}
                                    </span>
                                </div>

                                {/* Action Title & Target */}
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '3px' }}>
                                        <span style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                            {(record.action_type === 'HALL_TICKET_GENERATE' || record.action_type === 'HALL_TICKET_BATCH_EXPORT')
                                                ? 'VTU SEE Hall Tickets Issued'
                                                : (record.what?.title || record.action_type)}
                                        </span>
                                        {(record.action_type === 'HALL_TICKET_GENERATE' || record.action_type === 'HALL_TICKET_BATCH_EXPORT' || record.what?.code === 'HALL_TICKET_GENERATE') && (
                                            <span style={{
                                                fontSize: '10px',
                                                fontWeight: 900,
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                background: 'rgba(139, 92, 246, 0.15)',
                                                color: '#7c3aed',
                                                border: '1px solid rgba(139, 92, 246, 0.35)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '3px',
                                            }}>
                                                🎟️ HALL TICKET
                                            </span>
                                        )}
                                    </div>

                                    {(record.metadata?.studentCount || record.metadata?.branch || record.metadata?.semester) && (
                                        <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                            <span style={{
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                color: '#6d28d9',
                                                background: 'rgba(124, 58, 237, 0.08)',
                                                padding: '1px 6px',
                                                borderRadius: '4px',
                                                border: '1px solid rgba(124, 58, 237, 0.2)',
                                            }}>
                                                🎓 {record.metadata.branch || 'Cohort'} Sem {record.metadata.semester || ''} ({record.metadata.studentCount} Students)
                                            </span>
                                        </div>
                                    )}

                                    {record.target?.usn && !record.metadata?.studentCount && (
                                        <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{
                                                fontFamily: 'monospace',
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                color: 'var(--primary)',
                                                background: 'var(--surface-low)',
                                                padding: '1px 5px',
                                                borderRadius: '4px',
                                            }}>
                                                {record.target.usn}
                                            </span>
                                            {record.target?.studentName && (
                                                <span style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>
                                                    {record.target.studentName}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>


                                {/* Action Details & Metadata Chips */}
                                <div style={{ fontSize: '12.5px', fontWeight: 750, color: 'var(--tx-main)', lineHeight: '1.4' }}>
                                    {record.details || record.what?.details || record.why?.reason}
                                </div>

                                {renderEntityChips(record)}

                                {/* Reason / Note */}
                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)', lineHeight: '1.3' }}>
                                    {record.why?.reason || record.reason}
                                </div>

                                {/* Card Footer */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: 'auto' }}>
                                    <span style={{
                                        fontSize: '10px',
                                        fontWeight: 800,
                                        color: record.how?.isSuccess ? 'var(--green)' : 'var(--red)',
                                    }}>
                                        ● {record.how?.status || 'SUCCESS'}
                                    </span>
                                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)' }}>
                                        View Details →
                                    </span>
                                </div>
                            </div>
                        );
                    })}

                    {filteredRecords.length === 0 && (
                        <div style={{
                            gridColumn: '1 / -1',
                            padding: '40px 20px',
                            textAlign: 'center',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                        }}>
                            <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>No matching activities found.</div>
                            <button
                                onClick={clearAllFilters}
                                style={{
                                    marginTop: '10px',
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    color: 'var(--primary)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Clear Filters
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* ── Streamlined Details Modal (Clean & Easy to Read) ──── */}
            {selectedRecord && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 3000,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(3px)',
                    padding: '16px',
                }}
                    onClick={() => setSelectedRecord(null)}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 'min(520px, 95vw)',
                            maxHeight: '85vh',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '16px',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Modal Header */}
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            background: 'var(--surface-low)',
                        }}>
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>
                                    Activity Details
                                </div>
                                <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                    {selectedRecord.what?.title}
                                </h3>
                            </div>
                            <button
                                onClick={() => setSelectedRecord(null)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--tx-muted)',
                                    padding: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '20px' }}>close</span>
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div style={{
                            padding: '20px',
                            overflowY: 'auto',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                        }}>
                            {/* Faculty Info */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface-low)', padding: '12px', borderRadius: '10px' }}>
                                <div style={{
                                    width: '38px',
                                    height: '38px',
                                    borderRadius: '8px',
                                    background: 'var(--primary)',
                                    color: 'var(--bg)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    fontWeight: 900,
                                }}>
                                    {selectedRecord.who?.initials}
                                </div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                        {selectedRecord.who?.name}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)' }}>
                                        {selectedRecord.who?.department} · {selectedRecord.who?.email}
                                    </div>
                                </div>
                            </div>

                            {/* Details Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <div style={{ background: 'var(--surface-low)', padding: '10px 12px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block' }}>Date & Time</span>
                                    <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                        {selectedRecord.when?.date} {selectedRecord.when?.time}
                                    </span>
                                    <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '1px' }}>
                                        {selectedRecord.when?.relative}
                                    </div>
                                </div>

                                <div style={{ background: 'var(--surface-low)', padding: '10px 12px', borderRadius: '8px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block' }}>Status</span>
                                    <span style={{
                                        display: 'inline-block',
                                        marginTop: '3px',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 800,
                                        background: selectedRecord.how?.isSuccess ? 'var(--green-bg)' : 'var(--red-bg)',
                                        color: selectedRecord.how?.isSuccess ? 'var(--green)' : 'var(--red)',
                                    }}>
                                        {selectedRecord.how?.status || 'SUCCESS'}
                                    </span>
                                </div>
                            </div>

                            {/* Target Student (If any) */}
                            {selectedRecord.target?.usn && (
                                <div style={{ background: 'var(--surface-low)', padding: '12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block' }}>Target Student</span>
                                        <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                            {selectedRecord.target.usn}
                                        </span>
                                        {selectedRecord.target.studentName && (
                                            <span style={{ fontSize: '12px', color: 'var(--tx-main)', marginLeft: '8px' }}>
                                                {selectedRecord.target.studentName}
                                            </span>
                                        )}
                                    </div>

                                    {onInspectStudent && selectedRecord.target?.studentInfo && (
                                        <button
                                            onClick={() => {
                                                onInspectStudent(selectedRecord.target.studentInfo);
                                                setSelectedRecord(null);
                                            }}
                                            style={{
                                                padding: '5px 10px',
                                                borderRadius: '6px',
                                                border: '1px solid var(--border)',
                                                background: 'var(--surface)',
                                                color: 'var(--primary)',
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                cursor: 'pointer',
                                            }}
                                        >
                                            View Student
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Action Performed / Exact Change */}
                            <div style={{ background: 'var(--surface-low)', padding: '14px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '13px' }}>bolt</span>
                                    Action Executed
                                </span>
                                <div style={{ fontSize: '13.5px', fontWeight: 800, color: 'var(--tx-main)', lineHeight: '1.4' }}>
                                    {selectedRecord.details || selectedRecord.what?.details || selectedRecord.why?.reason}
                                </div>
                                {renderEntityChips(selectedRecord)}
                            </div>

                            {/* Action Reason / Notes */}
                            <div style={{ background: 'var(--surface-low)', padding: '12px', borderRadius: '10px' }}>
                                <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Institutional Justification & Objective</span>
                                <div style={{ fontSize: '12.5px', color: 'var(--tx-muted)', lineHeight: '1.5' }}>
                                    {selectedRecord.why?.reason || selectedRecord.reason || 'Standard academic session activity.'}
                                </div>
                            </div>

                            {/* Structured Context Metadata */}
                            {selectedRecord.metadata && Object.keys(selectedRecord.metadata).length > 0 && (
                                <div style={{ background: 'var(--surface-low)', padding: '12px', borderRadius: '10px' }}>
                                    <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Contextual Metadata</span>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
                                        {Object.entries(selectedRecord.metadata).map(([k, v]) => {
                                            if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
                                            return (
                                                <div key={k} style={{ background: 'var(--surface)', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>{k.replace(/_/g, ' ')}</div>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)', wordBreak: 'break-all' }}>{String(v)}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Module & Origin Info */}
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                <div><strong>Location:</strong> {selectedRecord.where?.module}</div>
                                <div><strong>Client IP:</strong> {selectedRecord.where?.ip?.replace(' (Campus Intranet)', '')}</div>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div style={{
                            padding: '12px 20px',
                            borderTop: '1px solid var(--border)',
                            background: 'var(--surface-low)',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <button
                                onClick={() => handleCopyDetails(selectedRecord)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface)',
                                    color: copiedNote ? 'var(--green)' : 'var(--tx-main)',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>
                                    {copiedNote ? 'check' : 'content_copy'}
                                </span>
                                {copiedNote ? 'Copied' : 'Copy Info'}
                            </button>

                            <button
                                onClick={() => setSelectedRecord(null)}
                                style={{
                                    padding: '6px 16px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: 'var(--primary)',
                                    color: 'var(--bg)',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                }}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Quick Log Action Modal ────────────────────────────── */}
            {showLogModal && (
                <div style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 3500,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.5)',
                    backdropFilter: 'blur(3px)',
                    padding: '16px',
                }}
                    onClick={() => setShowLogModal(false)}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            width: 'min(460px, 95vw)',
                            background: 'var(--surface)',
                            border: '1px solid var(--border)',
                            borderRadius: '16px',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '14px',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                    Log Faculty Action
                                </h3>
                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                    Record an activity for auditing and tracking.
                                </p>
                            </div>
                            <button
                                onClick={() => setShowLogModal(false)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)' }}
                            >
                                <span className="material-icons-round">close</span>
                            </button>
                        </div>

                        {submitSuccess && (
                            <div style={{ padding: '8px 12px', borderRadius: '6px', background: 'var(--green-bg)', color: 'var(--green)', fontWeight: 700, fontSize: '12px' }}>
                                {submitSuccess}
                            </div>
                        )}

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                                    Operation
                                </label>
                                <select
                                    value={logAction}
                                    onChange={e => setLogAction(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface-low)',
                                        color: 'var(--tx-main)',
                                        fontSize: '13px',
                                    }}
                                >
                                    {Object.entries(ACTION_REGISTRY).map(([key, item]) => (
                                        <option key={key} value={key}>{item.title}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                                    Faculty Member
                                </label>
                                <select
                                    value={logFacultyId}
                                    onChange={e => setLogFacultyId(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface-low)',
                                        color: 'var(--tx-main)',
                                        fontSize: '13px',
                                    }}
                                >
                                    <option value="admin">Institution Administrator (Admin)</option>
                                    {(facultyList || []).map(f => (
                                        <option key={f.id} value={f.id}>{f.full_name} ({f.department || 'Faculty'})</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                                    Student USN (Optional)
                                </label>
                                <input
                                    list="quick-student-usns"
                                    placeholder="e.g. 2AB23CS038"
                                    value={logUsn}
                                    onChange={e => setLogUsn(e.target.value.toUpperCase())}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface-low)',
                                        color: 'var(--tx-main)',
                                        fontSize: '13px',
                                        fontFamily: 'monospace',
                                    }}
                                />
                                <datalist id="quick-student-usns">
                                    {(students || []).slice(0, 50).map(s => (
                                        <option key={s.usn} value={s.usn}>{s.name ? `${s.name} (${s.usn})` : s.usn}</option>
                                    ))}
                                </datalist>
                            </div>

                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
                                    Reason / Note (Optional)
                                </label>
                                <input
                                    placeholder="e.g. Verified student CIE marks ahead of cutoff"
                                    value={logNote}
                                    onChange={e => setLogNote(e.target.value)}
                                    style={{
                                        width: '100%',
                                        boxSizing: 'border-box',
                                        padding: '8px 10px',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface-low)',
                                        color: 'var(--tx-main)',
                                        fontSize: '13px',
                                    }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
                            <button
                                onClick={() => setShowLogModal(false)}
                                style={{
                                    padding: '7px 14px',
                                    borderRadius: '6px',
                                    border: '1px solid var(--border)',
                                    background: 'var(--surface-low)',
                                    color: 'var(--tx-muted)',
                                    fontSize: '12px',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleLogSubmit}
                                disabled={isSubmitting}
                                style={{
                                    padding: '7px 18px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: 'var(--primary)',
                                    color: 'var(--bg)',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                }}
                            >
                                {isSubmitting ? 'Saving...' : 'Save Action'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
