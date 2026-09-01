'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../../../lib/api/client';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthGuard from '../../../components/AuthGuard';
import { ClassesContent } from '../../../components/ClassesContent';
import { AuditLogContent } from '../../../components/AuditLogContent';
import { ConfirmDialog } from '../../../components/ui';
import { getGradePoint } from '../../../lib/vtuGrades';
import { normalizeSubjectResult } from '../../../lib/vtuAcademicEngine';
import { supabase } from '../../../lib/supabase';

function AdminPanelContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleResize = () => {
            const mobile = window.innerWidth < 1024;
            setIsMobile(mobile);
            if (!mobile) {
                setMobileMenuOpen(false);
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (isMobile && mobileMenuOpen) {
            document.body.classList.add('gf-drawer-open');
        } else {
            document.body.classList.remove('gf-drawer-open');
        }
        return () => {
            document.body.classList.remove('gf-drawer-open');
        };
    }, [isMobile, mobileMenuOpen]);

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && mobileMenuOpen) {
                setMobileMenuOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mobileMenuOpen]);
    const initialTab = searchParams?.get('tab') || 'overview';
    const [tab, setTab] = useState(initialTab);
    const [students, setStudents] = useState([]);
    const [requests, setRequests] = useState([]);
    const [activityLogs, setActivityLogs] = useState([]);
    const [activitySearch, setActivitySearch] = useState('');
    const [activityTypeFilter, setActivityTypeFilter] = useState('all');
    const [activityDateFilter, setActivityDateFilter] = useState('all');
    const [stats, setStats] = useState({ students: 0, pending: 0, faculty: 0, totalMarks: 0, activityToday: 0 });
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [actionId, setActionId] = useState(null);
    const [confirmingReject, setConfirmingReject] = useState(null);
    const [confirmingPasswordReset, setConfirmingPasswordReset] = useState(false);
    const [resettingPassword, setResettingPassword] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentDetails, setStudentDetails] = useState(null);
    const [detailTab, setDetailTab] = useState('marks');
    const [adminUser, setAdminUser] = useState(null);
    const [copiedKey, setCopiedKey] = useState(null);

    // Student Directory & Management States
    const [selectedUsns, setSelectedUsns] = useState(new Set());
    const [studentStatusFilter, setStudentStatusFilter] = useState('all');
    const [studentBranchFilter, setStudentBranchFilter] = useState('all');
    const [studentSemFilter, setStudentSemFilter] = useState('all');
    const [studentActionBusy, setStudentActionBusy] = useState(false);
    const [studentActionMsg, setStudentActionMsg] = useState('');
    const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
    const [confirmingBulkSuspend, setConfirmingBulkSuspend] = useState(false);
    const [confirmingSingleDelete, setConfirmingSingleDelete] = useState(null);
    const [confirmingSuspendStudent, setConfirmingSuspendStudent] = useState(null);
    const [suspendReasonInput, setSuspendReasonInput] = useState('');

    // System Settings States
    const [settingsProfile, setSettingsProfile] = useState({
        institution_name: 'Anjuman Institute of Technology and Management',
        institution_code: 'AITM',
        affiliation: 'Visvesvaraya Technological University (VTU)',
        academic_year: '2024-2025',
        default_scheme: '2022',
        environment: 'GradeFlow Intelligence Suite',
        primary_region: 'South Asia (VTU-HQ)',
    });
    const [settingsSecurity, setSettingsSecurity] = useState({
        system_access_token: 'GF-ADMIN-PROD',
        session_expiry_hours: 24,
    });
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState('');
    const [settingsError, setSettingsError] = useState('');
    const [editingToken, setEditingToken] = useState(false);
    const [tokenInput, setTokenInput] = useState('');
    const [reloadingData, setReloadingData] = useState(false);
    const [reloadDataSuccess, setReloadDataSuccess] = useState(false);

    const fetchSettings = useCallback(async () => {
        setSettingsLoading(true);
        try {
            const res = await apiRequest('/api/admin/settings');
            if (res?.settings) {
                if (res.settings.profile) setSettingsProfile(res.settings.profile);
                if (res.settings.security) setSettingsSecurity(res.settings.security);
            }
        } catch (err) {
            console.error('Failed to load settings:', err);
        } finally {
            setSettingsLoading(false);
        }
    }, []);

    useEffect(() => {
        const sessionStr = localStorage.getItem('admin_session');
        if (sessionStr) {
            setAdminUser(JSON.parse(sessionStr));
        }
        loadData();
        fetchSettings();
    }, []);

    const handleSaveSettings = async () => {
        setSettingsSaving(true);
        setSettingsMsg('');
        setSettingsError('');
        try {
            await apiRequest('/api/admin/settings', {
                method: 'POST',
                body: JSON.stringify({
                    profile: settingsProfile,
                    security: settingsSecurity,
                }),
            });
            setSettingsMsg('✓ System settings updated successfully!');
            setTimeout(() => setSettingsMsg(''), 4000);
        } catch (err) {
            setSettingsError('Failed to save settings: ' + (err.message || 'Unknown error'));
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleSaveToken = async () => {
        const newToken = tokenInput.trim().toUpperCase();
        if (!newToken) return;
        setSettingsSaving(true);
        setSettingsMsg('');
        setSettingsError('');
        try {
            await apiRequest('/api/admin/settings', {
                method: 'POST',
                body: JSON.stringify({
                    security: {
                        ...settingsSecurity,
                        system_access_token: newToken,
                    },
                }),
            });
            setSettingsSecurity(prev => ({ ...prev, system_access_token: newToken }));
            setEditingToken(false);
            setSettingsMsg(`✓ System Access Token updated to ${newToken}!`);
            setTimeout(() => setSettingsMsg(''), 4000);
        } catch (err) {
            setSettingsError('Failed to update token: ' + (err.message || 'Unknown error'));
        } finally {
            setSettingsSaving(false);
        }
    };

    const handleGenerateToken = () => {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 8; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setTokenInput(`GF-${code}`);
    };

    const handleReloadAllData = async () => {
        setReloadingData(true);
        setReloadDataSuccess(false);
        try {
            await Promise.all([
                loadData(),
                fetchSettings(),
            ]);
            setReloadDataSuccess(true);
            setTimeout(() => setReloadDataSuccess(false), 3000);
        } catch (e) {
            console.error(e);
        } finally {
            setReloadingData(false);
        }
    };

    const loadData = useCallback(async () => {
        setLoading(true);
        setLoadError('');
        try {
            const resData = await apiRequest('/api/admin/terminal/data');
            const s = resData?.students || [];
            const r = resData?.facultyOnboarding || [];
            const l = resData?.facultyActivity || [];
            const fList = resData?.facultyList || [];

            const facultyMap = {};
            fList.forEach(f => { facultyMap[f.id] = f; });
            const enrichedLogs = l.map(log => ({
                ...log,
                _faculty: facultyMap[log.faculty_id] || null,
            }));

            setStudents(s);
            setRequests(r);
            setActivityLogs(enrichedLogs);

            const todayStr = new Date().toISOString().slice(0, 10);
            const todayCount = l.filter(x => x.created_at?.startsWith(todayStr)).length;
            setStats({
                students: resData?.counts?.totalStudents || s.length,
                pending: r.filter(x => x.status === 'pending').length,
                faculty: r.filter(x => x.status === 'approved').length,
                totalMarks: resData?.counts?.totalMarksRecords || 0,
                activityToday: todayCount,
            });
        } catch (err) {
            console.error('Failed to load admin data:', err);
            setLoadError('Failed to load admin data. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    const openStudent = async (student) => {
        setSelectedStudent(student);
        setDetailTab('marks');
        try {
            const data = await apiRequest('/api/admin/terminal/data', { query: { student_id: student.id } });
            setStudentDetails({ marks: data?.marks || [], docs: data?.documents || [] });
        } catch (err) {
            console.error('Error fetching student details:', err);
            setStudentDetails({ marks: [], docs: [] });
        }
    };

    const approveRequest = async (id) => {
        setActionId(id);
        try {
            const res = await fetch('/api/admin/approve-faculty', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action: 'approve' }),
            });
            const data = await res.json();
            if (data.success) {
                await loadData();
            } else {
                alert(data.error || 'Failed to approve request.');
            }
        } catch (err) {
            console.error('Approve error:', err);
            alert('Failed to approve request.');
        } finally {
            setActionId(null);
        }
    };

    const rejectRequest = async (id) => {
        setActionId(id);
        try {
            const res = await fetch('/api/admin/approve-faculty', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, action: 'reject' }),
            });
            const data = await res.json();
            if (data.success) {
                await loadData();
            } else {
                alert(data.error || 'Failed to reject request.');
            }
        } catch (err) {
            console.error('Reject error:', err);
            alert('Failed to reject request.');
        } finally {
            setActionId(null);
            setConfirmingReject(null);
        }
    };

    const addStudent = async () => {
        if (!newStudent.usn || newStudent.usn.length < 5) {
            setAddError('Please enter a valid USN.'); return;
        }
        setAddError('');
        try {
            await apiRequest('/api/admin/terminal/data', {
                method: 'POST',
                body: JSON.stringify({
                    usn: newStudent.usn.toUpperCase(),
                    name: newStudent.name || newStudent.usn.toUpperCase(),
                    branch: newStudent.branch,
                    scheme: newStudent.scheme,
                    semester: newStudent.semester,
                })
            });
            setShowAddStudent(false);
            setNewStudent({ usn: '', name: '', branch: '', scheme: '2022', semester: 1 });
            await loadData();
        } catch (err) {
            console.error('Add student error:', err);
            setAddError('Failed to add student. Please check the details and try again.');
        }
    };

    const resetStudentCredentials = async () => {
        if (!selectedStudent) return;
        setResettingPassword(true);
        try {
            const { error } = await supabase
                .from('students')
                .update({ password_hash: null, recovery_pin: null })
                .eq('id', selectedStudent.id);

            if (error) throw error;

            alert(`✓ Credentials reset successfully for ${selectedStudent.usn}. They can now re-activate their account.`);
            await loadData();
            setSelectedStudent(prev => ({ ...prev, activated_at: null })); // Optionally update UI state directly
        } catch (err) {
            console.error('Reset error:', err);
            alert('❌ Failed to reset credentials.');
        } finally {
            setResettingPassword(false);
            setConfirmingPasswordReset(false);
        }
    };

    const deleteStudentEntirely = async () => {
        if (!selectedStudent) return;
        if (!confirm(`⚠️ PERMANENTLY DELETE student ${selectedStudent.name || selectedStudent.usn} from the entire database?\n\nThis removes ALL their data: marks, profile, class enrollments.\nThis CANNOT be undone.`)) return;
        
        try {
            const r = await fetch('/api/admin/delete-student', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usn: selectedStudent.usn }) });
            const j = await r.json();
            if (j.success) {
                setSelectedStudent(null);
                alert(`✓ Student ${selectedStudent.usn} permanently deleted.`);
                await loadData();
            } else {
                alert(j.error || 'Failed to delete student.');
            }
        } catch (err) {
            console.error('Delete error:', err);
            alert('❌ Failed to delete student.');
        }
    };

    const copyKey = (key) => {
        navigator.clipboard.writeText(key);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const handleToggleSuspendStudent = async (student, customReason = null) => {
        if (!student) return;
        setStudentActionBusy(true);
        setStudentActionMsg('');
        try {
            const res = await apiRequest('/api/admin/student-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'toggle_suspend',
                    usn: student.usn,
                    reason: customReason || (student.is_suspended ? '' : (suspendReasonInput || 'Account suspended by Institution Administrator.'))
                })
            });
            setStudentActionMsg(res.message || 'Student status updated.');
            await loadData();
            if (selectedStudent && selectedStudent.usn === student.usn) {
                setSelectedStudent(prev => ({
                    ...prev,
                    is_suspended: res.is_suspended,
                    suspended_at: res.is_suspended ? new Date().toISOString() : null,
                    suspended_reason: res.is_suspended ? (customReason || suspendReasonInput || 'Account suspended by Institution Administrator.') : null
                }));
            }
            setTimeout(() => setStudentActionMsg(''), 4000);
        } catch (err) {
            alert('Failed to update suspension status: ' + err.message);
        } finally {
            setStudentActionBusy(false);
            setConfirmingSuspendStudent(null);
            setSuspendReasonInput('');
        }
    };

    const handleBulkAction = async (action, reason = null) => {
        if (selectedUsns.size === 0) return;
        const usnList = Array.from(selectedUsns);
        setStudentActionBusy(true);
        setStudentActionMsg('');
        try {
            const res = await apiRequest('/api/admin/student-action', {
                method: 'POST',
                body: JSON.stringify({
                    action,
                    usns: usnList,
                    reason: reason || (action === 'bulk_suspend' ? (suspendReasonInput || 'Batch account suspension by Administrator.') : null)
                })
            });
            setStudentActionMsg(res.message || 'Bulk operation completed.');
            setSelectedUsns(new Set());
            await loadData();
            setTimeout(() => setStudentActionMsg(''), 4000);
        } catch (err) {
            alert('Bulk operation failed: ' + err.message);
        } finally {
            setStudentActionBusy(false);
            setConfirmingBulkDelete(false);
            setConfirmingBulkSuspend(false);
            setSuspendReasonInput('');
        }
    };

    const handleSelectAllStudents = (e) => {
        if (e.target.checked) {
            setSelectedUsns(new Set(filtered.map(s => s.usn)));
        } else {
            setSelectedUsns(new Set());
        }
    };

    const handleToggleStudentSelection = (usn, e) => {
        e.stopPropagation();
        setSelectedUsns(prev => {
            const next = new Set(prev);
            if (next.has(usn)) next.delete(usn);
            else next.add(usn);
            return next;
        });
    };

    const handleDeleteSingleStudent = async (student) => {
        if (!student) return;
        setStudentActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/student-action', {
                method: 'POST',
                body: JSON.stringify({ action: 'bulk_delete', usns: [student.usn] })
            });
            setStudentActionMsg(res.message || `Student ${student.usn} deleted.`);
            if (selectedStudent?.usn === student.usn) setSelectedStudent(null);
            setSelectedUsns(prev => { const n = new Set(prev); n.delete(student.usn); return n; });
            await loadData();
            setTimeout(() => setStudentActionMsg(''), 4000);
        } catch (err) {
            alert('Failed to delete student: ' + err.message);
        } finally {
            setStudentActionBusy(false);
            setConfirmingSingleDelete(null);
        }
    };

    const handleResetSingleStudentPin = async (student) => {
        if (!student) return;
        setStudentActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/student-action', {
                method: 'POST',
                body: JSON.stringify({ action: 'bulk_reset_pin', usns: [student.usn] })
            });
            setStudentActionMsg(res.message || `Credentials reset for ${student.usn}.`);
            await loadData();
            setTimeout(() => setStudentActionMsg(''), 4000);
        } catch (err) {
            alert('Failed to reset credentials: ' + err.message);
        } finally {
            setStudentActionBusy(false);
        }
    };

    const availableBranches = Array.from(new Set(students.map(s => (s.branch || '').toUpperCase()).filter(Boolean))).sort();

    const filtered = students.filter(s => {
        const q = search.toLowerCase();
        const matchSearch = !q || (s.usn || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
        if (!matchSearch) return false;

        if (studentStatusFilter === 'active') {
            if (!s.activated_at || s.is_suspended) return false;
        } else if (studentStatusFilter === 'pending') {
            if (s.activated_at || s.is_suspended) return false;
        } else if (studentStatusFilter === 'suspended') {
            if (!s.is_suspended) return false;
        }

        if (studentBranchFilter !== 'all') {
            if ((s.branch || '').toUpperCase() !== studentBranchFilter.toUpperCase()) return false;
        }

        if (studentSemFilter !== 'all') {
            if (Number(s.semester) !== Number(studentSemFilter)) return false;
        }

        return true;
    });

    // Calculate SGPA for student marks using canonical grade points and catalog credits
    const calcSGPA = (marks) => {
        if (!marks?.length) return '0.00';
        let pts = 0, cr = 0;
        marks.forEach(m => {
            const norm = normalizeSubjectResult(m, '2022');
            if (norm.isAudit || norm.isUnresolved) return;
            const c = norm.credits;
            if (c > 0) {
                pts += norm.weightedPoints;
                cr += c;
            }
        });
        return cr > 0 ? (pts / cr).toFixed(2) : '0.00';
    };

    const c = {
        layout: { display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: '100dvh', background: 'var(--bg)', fontFamily: "'Plus Jakarta Sans', sans-serif", minWidth: 0, width: '100%', maxWidth: '100vw', overflowX: 'hidden' },
        sidebar: isMobile ? {
            position: 'fixed', left: 0, top: 0, width: 'min(85vw, 320px)', height: '100dvh',
            background: 'var(--surface)', borderRight: '1px solid var(--border)',
            padding: 'max(var(--space-5), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-5), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left))',
            display: 'flex', flexDirection: 'column',
            transform: mobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            zIndex: 2500, boxShadow: 'var(--elevation-overlay)', overflow: 'hidden',
        } : {
            width: sidebarCollapsed ? '72px' : '260px',
            minWidth: sidebarCollapsed ? '72px' : '260px',
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            padding: sidebarCollapsed ? 'var(--space-4) var(--space-2)' : 'var(--space-6) var(--space-4)',
            display: 'flex', flexDirection: 'column',
            position: 'sticky', top: 0, height: '100dvh', overflow: 'hidden',
            transition: 'all 0.2s ease-in-out',
            zIndex: 100,
        },
        sidebarNavScroll: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' },
        logoRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '0 var(--space-2) var(--space-1)' },
        logoBox: {
            width: '36px', height: '36px', background: 'var(--primary)',
            borderRadius: 'var(--radius-4)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '17px',
        },
        adminTag: {
            fontSize: '9px', fontWeight: 800, color: 'var(--tx-dim)',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            padding: 'var(--space-1) var(--space-2) var(--space-4)',
        },
        sep: { height: '1px', background: 'var(--border)', margin: 'var(--space-2) 0 var(--space-4)' },
        navBtn: (active) => ({
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            width: '100%', padding: '11px 14px', borderRadius: 'var(--radius-5)',
            border: 'none', background: active ? 'var(--surface-low)' : 'transparent',
            color: active ? 'var(--tx-main)' : 'var(--tx-muted)',
            fontWeight: active ? 700 : 500, fontSize: '13px',
            cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
            transition: 'all 0.15s', marginBottom: '2px',
        }),
        main: { flex: 1, padding: isMobile ? 'var(--space-4)' : 'var(--page-py) var(--page-px)', overflowY: 'auto', minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' },
        pageLabel: { fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 'var(--space-2)' },
        pageTitle: { fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: 'var(--space-7)' },
        statGrid: {},
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: isMobile ? 'var(--space-4)' : 'var(--space-6)', minWidth: 0, boxSizing: 'border-box' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-3)' },
        statVal: { fontSize: 'clamp(28px, 6vw, 40px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', lineHeight: 1 },
        tableWrap: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-7)', overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch', width: '100%', maxWidth: '100%', boxSizing: 'border-box' },
        tableHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--border)', gap: 'var(--space-3)', flexWrap: 'wrap' },
        tableTitle: { fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)' },
        searchInput: {
            background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)',
            padding: '9px 14px', fontSize: '13px', color: 'var(--tx-main)',
            outline: 'none', width: 'min(240px, 100%)', fontFamily: 'inherit', fontWeight: 600, boxSizing: 'border-box',
        },
        th: { padding: '14px var(--space-6)', background: 'var(--surface-low)', fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border)' },
        td: { padding: '16px var(--space-6)', borderBottom: '1px solid var(--border)', fontSize: '13px', color: 'var(--tx-main)', fontWeight: 600, verticalAlign: 'middle' },
        badge: (status) => {
            const map = {
                pending: ['var(--amber-bg)', 'var(--amber)'],
                approved: ['var(--green-bg)', 'var(--green)'],
                rejected: ['var(--red-bg)', 'var(--red)'],
                active: ['var(--green-bg)', 'var(--green)'],
                suspended: ['var(--red-bg)', 'var(--red)'],
                banned: ['var(--red-bg)', 'var(--red)'],
            };
            const [bg, cl] = map[status] || ['var(--surface-low)', 'var(--tx-muted)'];
            return { display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: bg, color: cl };
        },
        avatar: { width: '36px', height: '36px', borderRadius: '50%', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 800, color: 'var(--tx-muted)', flexShrink: 0 },
        actionBtn: (filled) => ({
            padding: '7px 16px', borderRadius: 'var(--radius-3)', border: filled ? 'none' : '1px solid var(--border)',
            background: filled ? 'var(--primary)' : 'transparent',
            color: filled ? 'var(--bg)' : 'var(--tx-muted)',
            fontSize: '11px', fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.1s',
        }),
        overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 2000, display: 'flex', justifyContent: 'flex-end', backdropFilter: 'blur(4px)', paddingLeft: 'env(safe-area-inset-left)' },
        drawer: { width: 'min(100vw, 760px)', maxWidth: '100vw', background: 'var(--surface)', maxHeight: '100dvh', overflowY: 'auto', padding: 'max(var(--space-6), env(safe-area-inset-top)) clamp(var(--space-5), 4vw, var(--space-9)) max(var(--space-6), env(safe-area-inset-bottom))', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 'var(--space-7)', boxShadow: 'var(--shadow-lg)', boxSizing: 'border-box' },
        tabRow: { display: 'flex', gap: 'var(--space-1)', background: 'var(--surface-low)', padding: 'var(--space-1)', borderRadius: 'var(--radius-5)', width: '100%', maxWidth: 'fit-content', overflowX: 'auto' },
        tabBtn: (active) => ({
            padding: '8px var(--space-5)', borderRadius: 'var(--radius-3)', border: 'none',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--tx-main)' : 'var(--tx-muted)',
            fontWeight: active ? 700 : 600, fontSize: '12px',
            cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
        }),
        modal: {
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.4)', zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backdropFilter: 'blur(4px)',
            padding: 'max(var(--space-4), env(safe-area-inset-top)) max(var(--space-4), env(safe-area-inset-right)) max(var(--space-4), env(safe-area-inset-bottom)) max(var(--space-4), env(safe-area-inset-left))',
            overflowY: 'auto',
        },
        modalCard: {
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-8)', padding: 'clamp(var(--space-5), 4vw, var(--space-8))', width: 'min(100vw - 32px, 480px)', maxWidth: '480px', maxHeight: 'calc(100dvh - max(var(--space-8), env(safe-area-inset-top) + env(safe-area-inset-bottom)))', overflowY: 'auto', boxSizing: 'border-box',
        },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-4)', padding: '11px 14px', fontSize: '14px',
            fontWeight: 600, color: 'var(--tx-main)', outline: 'none',
            fontFamily: 'inherit', marginBottom: 'var(--space-4)', boxSizing: 'border-box',
        },
    };

    const nav = [
        { id: 'overview', label: 'Overview', icon: 'space_dashboard' },
        { id: 'students', label: 'Students', icon: 'school' },
        { id: 'classes', label: 'Classes', icon: 'groups' },
        { id: 'requests', label: 'Faculty Access', icon: 'verified_user' },
        { id: 'activity', label: 'Activity Log', icon: 'history' },
        { id: 'audit', label: 'System Audit', icon: 'security' },
        { id: 'settings', label: 'Settings', icon: 'settings_suggest' },
    ];

    // ── Activity helpers ──────────────────────────────────────
    const ACTION_COLORS = {
        SCRAPE: ['var(--blue-bg)','var(--blue)'], FETCH: ['var(--blue-bg)','var(--blue)'],
        CLASS_CREATE: ['var(--green-bg)','var(--green)'], CLASS_ADD_STUDENT: ['var(--green-bg)','var(--green)'],
        CLASS_BULK_IMPORT: ['var(--green-bg)','var(--green)'], CLASS_FETCH_VTU: ['var(--blue-bg)','var(--blue)'],
        CLASS_REMOVE_STUDENT: ['var(--amber-bg)','var(--amber)'], CLASS_DELETE: ['var(--red-bg)','var(--red)'],
        DELETE_STUDENT: ['var(--red-bg)','var(--red)'], URL_TOGGLE: ['var(--surface-low)','var(--tx-muted)'],
    };
    const getActionColor = (t) => ACTION_COLORS[t] || ['var(--surface-low)','var(--tx-muted)'];

    const filteredActivity = activityLogs.filter(l => {
        const searchMatch = !activitySearch ||
            (l.faculty_name||'').toLowerCase().includes(activitySearch.toLowerCase()) ||
            (l.target_usn||'').toLowerCase().includes(activitySearch.toLowerCase()) ||
            (l.action_type||'').toLowerCase().includes(activitySearch.toLowerCase());
        const typeMatch = activityTypeFilter === 'all' || l.action_type === activityTypeFilter;
        let dateMatch = true;
        if (activityDateFilter === 'today') {
            const todayStr = new Date().toISOString().slice(0,10);
            dateMatch = (l.created_at||'').startsWith(todayStr);
        } else if (activityDateFilter === '7d') {
            const cutoff = new Date(Date.now() - 7*24*60*60*1000).toISOString();
            dateMatch = (l.created_at||'') >= cutoff;
        }
        return searchMatch && typeMatch && dateMatch;
    });
    const uniqueTypes = [...new Set(activityLogs.map(l => l.action_type).filter(Boolean))];

    // Group marks by semester for drawer
    const groupedMarks = {};
    if (studentDetails?.marks) {
        studentDetails.marks.forEach(m => {
            const sem = m.semester || 1;
            if (!groupedMarks[sem]) groupedMarks[sem] = [];
            groupedMarks[sem].push(m);
        });
    }

    return (
        <div style={c.layout}>
            {isMobile && (
                <header style={{
                    position: 'sticky', top: 0, zIndex: 1000, height: '56px',
                    background: 'var(--surface)', borderBottom: '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 16px', width: '100%', boxSizing: 'border-box'
                }}>
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        aria-label="Open Navigation Menu"
                        style={{
                            background: 'transparent', border: 'none', color: 'var(--tx-main)',
                            minWidth: '44px', minHeight: '44px', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '26px' }}>menu</span>
                    </button>
                    <div style={{ textAlign: 'center', minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {nav.find(n => n.id === tab)?.label || 'Admin Console'}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                            Institutional Admin
                        </div>
                    </div>
                    <div style={c.logoBox}>G</div>
                </header>
            )}

            {isMobile && mobileMenuOpen && (
                <div
                    onClick={() => setMobileMenuOpen(false)}
                    style={{
                        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                        zIndex: 2400, backdropFilter: 'blur(2px)', touchAction: 'none'
                    }}
                />
            )}

            {/* Sidebar */}
            <aside style={c.sidebar}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'space-between', padding: '0 4px', marginBottom: '8px' }}>
                    {(!sidebarCollapsed || isMobile) ? (
                        <div style={{ ...c.logoRow, cursor: 'pointer' }} onClick={() => { setTab('overview'); if (isMobile) setMobileMenuOpen(false); }}>
                            <div style={c.logoBox}>G</div>
                            <span style={{ fontWeight: 800, fontSize: '17px', color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>GradeFlow</span>
                        </div>
                    ) : (
                        <div style={{ ...c.logoBox, cursor: 'pointer' }} onClick={() => { setTab('overview'); if (isMobile) setMobileMenuOpen(false); }}>G</div>
                    )}
                    {isMobile ? (
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            aria-label="Close navigation menu"
                            style={{ background: 'transparent', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', borderRadius: '6px' }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '24px' }}>close</span>
                        </button>
                    ) : (
                        <button
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
                            style={{ background: 'transparent', border: 'none', color: 'var(--tx-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', borderRadius: '6px' }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '20px' }}>menu</span>
                        </button>
                    )}
                </div>
                {(!sidebarCollapsed || isMobile) && <span style={c.adminTag}>Institutional Admin</span>}
                <div style={c.sep} />

                <nav style={c.sidebarNavScroll}>
                    {nav.map(n => (
                        <button
                            key={n.id}
                            style={{
                                ...c.navBtn(tab === n.id),
                                justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                                padding: (sidebarCollapsed && !isMobile) ? '12px 0' : '11px 14px'
                            }}
                            onClick={() => { setTab(n.id); if (isMobile) setMobileMenuOpen(false); }}
                            title={sidebarCollapsed && !isMobile ? n.label : undefined}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>{n.icon}</span>
                            {(!sidebarCollapsed || isMobile) && <span>{n.label}</span>}
                            {n.id === 'requests' && stats.pending > 0 && (
                                <span style={{ marginLeft: (sidebarCollapsed && !isMobile) ? '0' : 'auto', background: 'var(--amber)', color: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--radius-4)', fontSize: '10px', fontWeight: 900 }}>
                                    {stats.pending}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>

                <div style={{ ...c.sep, flexShrink: 0 }} />
                {(!sidebarCollapsed || isMobile) && (
                    <div style={{ padding: '0 8px 12px' }}>
                        <div style={{ padding: '14px', background: 'var(--surface-low)', borderRadius: '14px', border: '1px solid var(--border)' }}>
                            <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adminUser?.email || 'Admin Account'}</div>
                            <div style={{ fontSize: '9px', color: 'var(--tx-dim)', textTransform: 'uppercase', marginTop: '2px', fontWeight: 700 }}>Full Access Active</div>
                        </div>
                    </div>
                )}
                <button
                    style={{
                        ...c.navBtn(false),
                        color: 'var(--red)',
                        justifyContent: (sidebarCollapsed && !isMobile) ? 'center' : 'flex-start',
                        padding: (sidebarCollapsed && !isMobile) ? '12px 0' : '11px 14px'
                    }}
                    onClick={() => { localStorage.removeItem('admin_session'); if (isMobile) setMobileMenuOpen(false); router.push('/admin/gateway'); }}
                    title={sidebarCollapsed && !isMobile ? "Terminate Session" : undefined}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>logout</span>
                    {(!sidebarCollapsed || isMobile) && <span>Terminate Session</span>}
                </button>
            </aside>

            {/* Main */}
            <main style={c.main} className="gf-fade-up">
                {loadError && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap', padding: '14px 18px', borderRadius: 'var(--radius-5)', marginBottom: 'var(--space-6)', background: 'var(--red-bg)', border: '1px solid var(--red)' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--red)' }}>{loadError}</span>
                        <button style={c.actionBtn(false)} onClick={loadData}>
                            <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                            Retry
                        </button>
                    </div>
                )}

                {tab === 'overview' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>Institutional Overview</h1>

                    <div className="gf-stats-grid" style={{ marginBottom: '40px' }}>
                        {[
                            { label: 'Total Students', val: stats.students, icon: 'people' },
                            { label: 'Pending Access', val: stats.pending, warn: stats.pending > 0, icon: 'pending_actions' },
                            { label: 'Active Faculty', val: stats.faculty, icon: 'badge' },
                            { label: 'Academic Records', val: stats.totalMarks, icon: 'inventory_2' },
                            { label: 'Faculty Actions Today', val: stats.activityToday, icon: 'history', link: 'activity' },
                        ].map(st => (
                            <div key={st.label} style={{ ...c.statCard, cursor: st.link ? 'pointer' : 'default' }} onClick={() => st.link && setTab(st.link)}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={c.statLabel}>{st.label}</div>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--tx-dim)', opacity: 0.4 }}>{st.icon}</span>
                                </div>
                                <div style={{ ...c.statVal, color: st.warn ? 'var(--amber)' : 'var(--tx-main)' }}>{loading ? '—' : st.val}</div>
                            </div>
                        ))}
                    </div>

                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div style={c.tableTitle}>Recent Registrations</div>
                            <button style={c.actionBtn(true)} onClick={() => setTab('students')}>View All Students</button>
                        </div>
                        {!isMobile ? (
                            <table style={{ width: '100%', minWidth: '680px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>{['Student', 'USN', 'Branch', 'Scheme', 'Registered'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {students.slice(0, 5).map(s => (
                                        <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openStudent(s)} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={c.td}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={c.avatar}>{((s.name || s.usn || '?')[0]).toUpperCase()}</div>
                                                    <span style={{ fontWeight: 800 }}>{s.name || 'Student'}</span>
                                                </div>
                                            </td>
                                            <td style={{ ...c.td, fontFamily: 'monospace', fontSize: '12px', color: 'var(--tx-muted)' }}>{s.usn}</td>
                                            <td style={c.td}>{s.branch || '—'}</td>
                                            <td style={c.td}>{s.scheme || '2022'}</td>
                                            <td style={{ ...c.td, color: 'var(--tx-dim)', fontSize: '12px' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}</td>
                                        </tr>
                                    ))}
                                    {students.length === 0 && <tr><td colSpan="5" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students registered yet.</td></tr>}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                                {students.slice(0, 5).map(s => (
                                    <div
                                        key={s.id}
                                        onClick={() => openStudent(s)}
                                        style={{
                                            background: 'var(--surface-low)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '12px',
                                            padding: '12px 14px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                                            <div style={c.avatar}>{((s.name || s.usn || '?')[0]).toUpperCase()}</div>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || 'Student'}</div>
                                                <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-muted)' }}>{s.usn} · {s.branch || 'Unassigned'}</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
                                            <span style={c.badge(s.activated_at ? 'active' : 'pending')}>{s.activated_at ? 'Active' : 'Awaiting'}</span>
                                            <span style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>Sem {s.semester || '—'}</span>
                                        </div>
                                    </div>
                                ))}
                                {students.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No students registered yet.</div>}
                            </div>
                        )}
                    </div>
                </>}

                {tab === 'students' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                        <div>
                            <h1 style={{ ...c.pageTitle, marginBottom: '4px' }}>Student Directory & Access Control</h1>
                            <p style={{ fontSize: '12px', color: 'var(--tx-muted)', margin: 0 }}>
                                Manage enrolled students, monitor authentication status, reset student credentials, and impose or lift institutional access bans.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button style={c.actionBtn(true)} onClick={() => setShowAddStudent(true)}>
                                <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '4px' }}>person_add</span>
                                Add Student
                            </button>
                        </div>
                    </div>

                    {/* Action notification toast */}
                    {studentActionMsg && (
                        <div className="gf-fade-up" style={{ padding: '12px 16px', background: 'var(--surface-low)', border: '1px solid var(--primary)', borderRadius: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>
                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>info</span>
                            <span>{studentActionMsg}</span>
                        </div>
                    )}

                    {/* Batch Selection Action Bar */}
                    {selectedUsns.size > 0 && (
                        <div className="gf-fade-up" style={{
                            background: 'var(--surface-low)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                            padding: '12px 18px',
                            marginBottom: '16px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            boxShadow: 'var(--shadow-sm)'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>check_circle</span>
                                <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                    {selectedUsns.size} Student{selectedUsns.size > 1 ? 's' : ''} Selected
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <button
                                    style={{ ...c.actionBtn(false), borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => setConfirmingBulkSuspend(true)}
                                    disabled={studentActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>block</span>
                                    Ban / Suspend Selected
                                </button>
                                <button
                                    style={{ ...c.actionBtn(false), borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleBulkAction('bulk_unban')}
                                    disabled={studentActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>restore</span>
                                    Unban / Restore Selected
                                </button>
                                <button
                                    style={{ ...c.actionBtn(false), borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleBulkAction('bulk_reset_pin')}
                                    disabled={studentActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>lock_reset</span>
                                    Reset PINs
                                </button>
                                <button
                                    style={{ ...c.actionBtn(false), borderColor: 'var(--red)', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => setConfirmingBulkDelete(true)}
                                    disabled={studentActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>delete_forever</span>
                                    Delete Selected
                                </button>
                                <button
                                    style={{ ...c.actionBtn(false), padding: '6px 12px', fontSize: '11px' }}
                                    onClick={() => setSelectedUsns(new Set())}
                                >
                                    Deselect
                                </button>
                            </div>
                        </div>
                    )}

                    <div style={c.tableWrap}>
                        {/* Filters & Search Header */}
                        <div style={{ ...c.tableHead, gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', minWidth: '200px' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>search</span>
                                <input
                                    style={{ ...c.searchInput, width: '100%', flex: 1, border: 'none', background: 'transparent', padding: '6px 0' }}
                                    placeholder="Search by USN or Student Name..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                />
                                {search && (
                                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', display: 'flex', alignItems: 'center', padding: '2px' }} onClick={() => setSearch('')}>
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {/* Status Filter */}
                                <select
                                    value={studentStatusFilter}
                                    onChange={e => setStudentStatusFilter(e.target.value)}
                                    style={{ ...c.searchInput, width: 'auto', padding: '7px 12px', fontSize: '12px', cursor: 'pointer' }}
                                >
                                    <option value="all">All Statuses ({students.length})</option>
                                    <option value="active">🟢 Active ({students.filter(s => s.activated_at && !s.is_suspended).length})</option>
                                    <option value="pending">🟡 Awaiting Activation ({students.filter(s => !s.activated_at && !s.is_suspended).length})</option>
                                    <option value="suspended">🔴 Suspended / Banned ({students.filter(s => s.is_suspended).length})</option>
                                </select>

                                {/* Branch Filter */}
                                {availableBranches.length > 0 && (
                                    <select
                                        value={studentBranchFilter}
                                        onChange={e => setStudentBranchFilter(e.target.value)}
                                        style={{ ...c.searchInput, width: 'auto', padding: '7px 12px', fontSize: '12px', cursor: 'pointer' }}
                                    >
                                        <option value="all">All Branches</option>
                                        {availableBranches.map(b => (
                                            <option key={b} value={b}>{b}</option>
                                        ))}
                                    </select>
                                )}

                                {/* Semester Filter */}
                                <select
                                    value={studentSemFilter}
                                    onChange={e => setStudentSemFilter(e.target.value)}
                                    style={{ ...c.searchInput, width: 'auto', padding: '7px 12px', fontSize: '12px', cursor: 'pointer' }}
                                >
                                    <option value="all">All Semesters</option>
                                    {[1, 2, 3, 4, 5, 6, 7, 8].map(sm => (
                                        <option key={sm} value={sm}>Semester {sm}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Desktop Table */}
                        {!isMobile ? (
                            <table style={{ width: '100%', minWidth: '780px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...c.th, width: '40px', padding: '14px 16px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={filtered.length > 0 && selectedUsns.size === filtered.length}
                                                onChange={handleSelectAllStudents}
                                                style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                                title="Select / Deselect all matching students"
                                            />
                                        </th>
                                        <th style={c.th}>Student</th>
                                        <th style={c.th}>USN</th>
                                        <th style={c.th}>Semester</th>
                                        <th style={c.th}>Branch</th>
                                        <th style={c.th}>Access Status</th>
                                        <th style={{ ...c.th, textAlign: 'right', paddingRight: '20px' }}>Administrative Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.map(s => {
                                        const isSelected = selectedUsns.has(s.usn);
                                        return (
                                            <tr
                                                key={s.id}
                                                style={{
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'var(--surface-low)' : (s.is_suspended ? 'rgba(239, 68, 68, 0.03)' : 'transparent'),
                                                    transition: 'background 0.12s ease'
                                                }}
                                                onClick={() => openStudent(s)}
                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-low)'; }}
                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = s.is_suspended ? 'rgba(239, 68, 68, 0.03)' : 'transparent'; }}
                                            >
                                                <td style={{ ...c.td, width: '40px', padding: '16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={e => handleToggleStudentSelection(s.usn, e)}
                                                        style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                                    />
                                                </td>
                                                <td style={c.td}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={{
                                                            ...c.avatar,
                                                            border: s.is_suspended ? '2px solid var(--red)' : 'none'
                                                        }}>
                                                            {((s.name || s.usn || '?')[0]).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 800, color: s.is_suspended ? 'var(--red)' : 'var(--tx-main)' }}>
                                                                {s.name || 'Student'}
                                                            </div>
                                                            {s.lateral_entry && (
                                                                <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Lateral Entry</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ ...c.td, fontFamily: 'monospace', color: 'var(--tx-muted)' }}>
                                                    {s.usn}
                                                </td>
                                                <td style={c.td}>Sem {s.semester || '—'}</td>
                                                <td style={c.td}>{s.branch || '—'}</td>
                                                <td style={c.td}>
                                                    {s.is_suspended ? (
                                                        <span style={c.badge('suspended')}>🔴 Suspended</span>
                                                    ) : s.activated_at ? (
                                                        <span style={c.badge('active')}>🟢 Active</span>
                                                    ) : (
                                                        <span style={c.badge('pending')}>🟡 Awaiting</span>
                                                    )}
                                                </td>
                                                <td style={{ ...c.td, textAlign: 'right', paddingRight: '20px' }} onClick={e => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                        {/* Quick Inspect Drawer */}
                                                        <button
                                                            style={{ ...c.actionBtn(false), padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            onClick={() => openStudent(s)}
                                                            title="Inspect Academic Marks & Profile"
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>visibility</span>
                                                            Inspect
                                                        </button>

                                                        {/* Suspend / Unban Toggle */}
                                                        {s.is_suspended ? (
                                                            <button
                                                                style={{ ...c.actionBtn(false), padding: '6px 10px', borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                onClick={() => handleToggleSuspendStudent(s)}
                                                                disabled={studentActionBusy}
                                                                title="Unban & Restore Student Portal Access"
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>restore</span>
                                                                Unban
                                                            </button>
                                                        ) : (
                                                            <button
                                                                style={{ ...c.actionBtn(false), padding: '6px 10px', borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                onClick={() => setConfirmingSuspendStudent(s)}
                                                                disabled={studentActionBusy}
                                                                title="Ban / Suspend Student Portal Access"
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>block</span>
                                                                Ban
                                                            </button>
                                                        )}

                                                        {/* Reset PIN */}
                                                        <button
                                                            style={{ ...c.actionBtn(false), padding: '6px 10px', borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            onClick={() => handleResetSingleStudentPin(s)}
                                                            disabled={studentActionBusy}
                                                            title="Reset Password & Recovery PIN"
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>lock_reset</span>
                                                        </button>

                                                        {/* Delete Student */}
                                                        <button
                                                            style={{ ...c.actionBtn(false), padding: '6px 10px', borderColor: 'var(--border)', color: 'var(--tx-dim)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            onClick={() => setConfirmingSingleDelete(s)}
                                                            disabled={studentActionBusy}
                                                            title="Delete Student from Database"
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>delete_outline</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filtered.length === 0 && (
                                        <tr>
                                            <td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)', fontStyle: 'italic' }}>
                                                No students matching your filter criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            /* Mobile Student Cards */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                                {filtered.map(s => {
                                    const isSelected = selectedUsns.has(s.usn);
                                    return (
                                        <div
                                            key={s.id}
                                            style={{
                                                background: isSelected ? 'var(--surface)' : 'var(--surface-low)',
                                                border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border)',
                                                borderRadius: '12px',
                                                padding: '14px',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                gap: '12px',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => openStudent(s)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={e => handleToggleStudentSelection(s.usn, e)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ cursor: 'pointer', width: '16px', height: '16px', flexShrink: 0 }}
                                                    />
                                                    <div style={c.avatar}>{((s.name || s.usn || '?')[0]).toUpperCase()}</div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name || 'Student'}</div>
                                                        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-muted)' }}>{s.usn} · {s.branch || 'Unassigned'} · Sem {s.semester || '—'}</div>
                                                    </div>
                                                </div>
                                                <div>
                                                    {s.is_suspended ? (
                                                        <span style={c.badge('suspended')}>🔴 Suspended</span>
                                                    ) : s.activated_at ? (
                                                        <span style={c.badge('active')}>🟢 Active</span>
                                                    ) : (
                                                        <span style={c.badge('pending')}>🟡 Awaiting</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Mobile Card Action Buttons */}
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '10px' }} onClick={e => e.stopPropagation()}>
                                                <button style={{ ...c.actionBtn(false), flex: 1, padding: '6px 8px', fontSize: '11px', textAlign: 'center' }} onClick={() => openStudent(s)}>
                                                    Inspect
                                                </button>
                                                {s.is_suspended ? (
                                                    <button style={{ ...c.actionBtn(false), flex: 1, padding: '6px 8px', fontSize: '11px', borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)' }} onClick={() => handleToggleSuspendStudent(s)}>
                                                        Unban
                                                    </button>
                                                ) : (
                                                    <button style={{ ...c.actionBtn(false), flex: 1, padding: '6px 8px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)' }} onClick={() => setConfirmingSuspendStudent(s)}>
                                                        Ban
                                                    </button>
                                                )}
                                                <button style={{ ...c.actionBtn(false), padding: '6px 10px', fontSize: '11px', borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)' }} onClick={() => handleResetSingleStudentPin(s)} title="Reset PIN">
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>lock_reset</span>
                                                </button>
                                                <button style={{ ...c.actionBtn(false), padding: '6px 10px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => setConfirmingSingleDelete(s)} title="Delete">
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {filtered.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px', fontStyle: 'italic' }}>No matching students found.</div>}
                            </div>
                        )}
                    </div>
                </>}

                {tab === 'requests' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>Faculty Onboarding</h1>
                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div style={c.tableTitle}>Verification Queue</div>
                        </div>
                        {!isMobile ? (
                            <table style={{ width: '100%', minWidth: '760px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>{['Faculty Member', 'Employee ID', 'Department', 'Access Key', 'Action'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {requests.map(r => (
                                        <tr key={r.id}>
                                            <td style={c.td}>
                                                <div style={{ fontWeight: 800 }}>{r.full_name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{r.email}</div>
                                            </td>
                                            <td style={c.td}>{r.employee_id || 'ID PENDING'}</td>
                                            <td style={c.td}>{r.department}</td>
                                            <td style={{ ...c.td, fontFamily: 'monospace', fontSize: '11px', color: 'var(--tx-muted)' }}>
                                                {r.generated_access_key ? (
                                                    <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }} onClick={() => copyKey(r.generated_access_key)}>
                                                        {r.generated_access_key}
                                                        <span className="material-icons-round" style={{ fontSize: '14px', color: copiedKey === r.generated_access_key ? '#16A34A' : 'var(--tx-dim)' }}>
                                                            {copiedKey === r.generated_access_key ? 'check' : 'content_copy'}
                                                        </span>
                                                    </span>
                                                ) : '—'}
                                            </td>
                                            <td style={c.td}>
                                                {r.status === 'pending' ? (
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        <button style={c.actionBtn(true)} onClick={() => approveRequest(r.id)} disabled={actionId === r.id}>
                                                            {actionId === r.id ? '...' : 'Approve'}
                                                        </button>
                                                        <button style={c.actionBtn(false)} onClick={() => setConfirmingReject(r)}>Decline</button>
                                                    </div>
                                                ) : (
                                                    <span style={c.badge(r.status)}>{r.status?.toUpperCase()}</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                    {requests.length === 0 && <tr><td colSpan="5" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No faculty requests yet.</td></tr>}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                                {requests.map(r => (
                                    <div key={r.id} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.full_name || 'Faculty Member'}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', wordBreak: 'break-all' }}>{r.email}</div>
                                            </div>
                                            <span style={c.badge(r.status)}>{r.status?.toUpperCase() || 'PENDING'}</span>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--surface)', padding: '8px 10px', borderRadius: '8px', fontSize: '11px', border: '1px solid var(--border)' }}>
                                            <div><span style={{ color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase', fontSize: '9px' }}>Dept:</span> {r.department || '—'}</div>
                                            <div><span style={{ color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase', fontSize: '9px' }}>Emp ID:</span> {r.employee_id || 'PENDING'}</div>
                                        </div>
                                        {r.status === 'pending' && (
                                            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                                <button style={{ ...c.actionBtn(true), flex: 1, padding: '9px' }} onClick={() => approveRequest(r.id)} disabled={actionId === r.id}>
                                                    {actionId === r.id ? '...' : 'Approve Access'}
                                                </button>
                                                <button style={{ ...c.actionBtn(false), flex: 1, padding: '9px', borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => setConfirmingReject(r)}>Decline</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {requests.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No faculty requests yet.</div>}
                            </div>
                        )}
                    </div>

                    <ConfirmDialog
                        open={Boolean(confirmingReject)}
                        title="Decline faculty request?"
                        description={`${confirmingReject?.full_name || 'This applicant'} will need to submit a new registration request to gain access.`}
                        confirmLabel="Decline"
                        busy={actionId === confirmingReject?.id}
                        onCancel={() => setConfirmingReject(null)}
                        onConfirm={() => rejectRequest(confirmingReject.id)}
                    />
                </>}

                {tab === 'activity' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>Faculty Activity Log</h1>

                    {/* Filters */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px', alignItems: 'center' }}>
                        <input
                            style={{ ...c.searchInput, flex: 1, minWidth: '200px' }}
                            placeholder="Search faculty, USN, action..."
                            value={activitySearch}
                            onChange={e => setActivitySearch(e.target.value)}
                        />
                        <select
                            style={{ ...c.searchInput, width: 'auto', minWidth: '150px', flex: '1 1 150px', cursor: 'pointer' }}
                            value={activityTypeFilter}
                            onChange={e => setActivityTypeFilter(e.target.value)}
                        >
                            <option value="all">All Actions</option>
                            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                        <select
                            style={{ ...c.searchInput, width: 'auto', minWidth: '150px', flex: '1 1 150px', cursor: 'pointer' }}
                            value={activityDateFilter}
                            onChange={e => setActivityDateFilter(e.target.value)}
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="7d">Last 7 Days</option>
                        </select>
                        <button style={c.actionBtn(false)} onClick={loadData}>
                            <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                            Refresh
                        </button>
                    </div>

                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div style={c.tableTitle}>All Faculty Actions</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 600 }}>{filteredActivity.length} records</div>
                        </div>
                        {!isMobile ? (
                            <table style={{ width: '100%', minWidth: '840px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>{['Timestamp', 'Faculty', 'Dept', 'Action', 'Target / Detail', 'Status'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {filteredActivity.map((log, i) => {
                                        const [bg, col] = getActionColor(log.action_type);
                                        const ts = log.created_at ? new Date(log.created_at) : null;
                                        const facultyInfo = log._faculty || {};
                                        return (
                                            <tr key={log.id || i} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                <td style={{ ...c.td, fontSize: '11px', color: 'var(--tx-dim)', whiteSpace: 'nowrap' }}>
                                                    {ts ? ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                                                    <div style={{ fontSize: '10px', marginTop: '2px' }}>{ts ? ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : ''}</div>
                                                </td>
                                                <td style={c.td}>
                                                    <div style={{ fontWeight: 800, fontSize: '13px' }}>{log.faculty_name || facultyInfo.full_name || 'Faculty'}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{facultyInfo.email || ''}</div>
                                                </td>
                                                <td style={{ ...c.td, fontSize: '12px', color: 'var(--tx-muted)' }}>{facultyInfo.department || '—'}</td>
                                                <td style={c.td}>
                                                    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: bg, color: col }}>
                                                        {log.action_type || 'ACTION'}
                                                    </span>
                                                </td>
                                                <td style={{ ...c.td, fontFamily: 'monospace', fontSize: '12px', color: 'var(--tx-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {log.target_usn || '—'}
                                                </td>
                                                <td style={c.td}>
                                                    <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: log.sync_status === 'SUCCESS' ? 'var(--green-bg)' : 'var(--red-bg)', color: log.sync_status === 'SUCCESS' ? 'var(--green)' : 'var(--red)' }}>
                                                        {log.sync_status || 'OK'}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredActivity.length === 0 && (
                                        <tr><td colSpan="6" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No activity logs match your filters.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                                {filteredActivity.map((log, i) => {
                                    const [bg, col] = getActionColor(log.action_type);
                                    const ts = log.created_at ? new Date(log.created_at) : null;
                                    const facultyInfo = log._faculty || {};
                                    return (
                                        <div key={log.id || i} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: bg, color: col }}>
                                                    {log.action_type || 'ACTION'}
                                                </span>
                                                <span style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>
                                                    {ts ? ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ' + ts.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </span>
                                            </div>
                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>
                                                {log.faculty_name || facultyInfo.full_name || 'Faculty Member'}
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)', wordBreak: 'break-word' }}>
                                                {log.details || log.target_usn || '—'}
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredActivity.length === 0 && (
                                    <div style={{ padding: '30px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No activity records found.</div>
                                )}
                            </div>
                        )}
                    </div>
                </>}

                {tab === 'classes' && <ClassesContent embedded={true} />}

                {tab === 'audit' && <AuditLogContent />}

                {tab === 'settings' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <h1 style={c.pageTitle}>System Settings & Administration</h1>

                    {settingsMsg && (
                        <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: 700, fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>check_circle</span>
                            {settingsMsg}
                        </div>
                    )}

                    {settingsError && (
                        <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid var(--red)', fontWeight: 700, fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>error</span>
                            {settingsError}
                        </div>
                    )}

                    {reloadDataSuccess && (
                        <div style={{ padding: '12px 16px', borderRadius: '10px', background: 'var(--green-bg)', color: 'var(--green)', border: '1px solid var(--green)', fontWeight: 700, fontSize: '13px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>sync</span>
                            ✓ All system records, student profiles, faculty data, and configurations reloaded!
                        </div>
                    )}

                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.4fr) minmax(0, 1fr)',
                        gap: '24px',
                        alignItems: 'start',
                        width: '100%',
                    }}>
                        {/* ── LEFT COLUMN: Primary Configuration & Security ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Institutional Profile */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>Institutional Profile</h3>
                                        <p style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px', margin: 0 }}>Configure college details, active academic year, and default syllabus scheme.</p>
                                    </div>
                                    <span className="material-icons-round" style={{ fontSize: '24px', color: 'var(--primary)' }}>school</span>
                                </div>

                                {/* Live Profile Summary Banner */}
                                <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--tx-main)' }}>
                                            [{settingsProfile.institution_code || 'AITM'}] {settingsProfile.institution_name || 'Institution Name'}
                                        </div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>
                                            {settingsProfile.affiliation || 'VTU Affiliated'}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: 'var(--primary)', color: 'var(--bg)' }}>
                                            {settingsProfile.academic_year}
                                        </span>
                                        <span style={{ display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: 'var(--surface)', color: 'var(--tx-main)', border: '1px solid var(--border)' }}>
                                            {settingsProfile.default_scheme} Scheme
                                        </span>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    <div>
                                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.05em' }}>Institution Name</label>
                                        <input
                                            style={{ ...c.searchInput, width: '100%', boxSizing: 'border-box' }}
                                            value={settingsProfile.institution_name}
                                            onChange={e => setSettingsProfile(prev => ({ ...prev, institution_name: e.target.value }))}
                                            placeholder="e.g. Anjuman Institute of Technology and Management"
                                        />
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.05em' }}>Institution Code</label>
                                            <input
                                                style={{ ...c.searchInput, width: '100%', boxSizing: 'border-box' }}
                                                value={settingsProfile.institution_code}
                                                onChange={e => setSettingsProfile(prev => ({ ...prev, institution_code: e.target.value.toUpperCase() }))}
                                                placeholder="e.g. AITM"
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.05em' }}>Affiliation / University</label>
                                            <input
                                                style={{ ...c.searchInput, width: '100%', boxSizing: 'border-box' }}
                                                value={settingsProfile.affiliation}
                                                onChange={e => setSettingsProfile(prev => ({ ...prev, affiliation: e.target.value }))}
                                                placeholder="e.g. Visvesvaraya Technological University (VTU)"
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.05em' }}>Academic Year</label>
                                            <select
                                                style={{ ...c.searchInput, width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}
                                                value={settingsProfile.academic_year}
                                                onChange={e => setSettingsProfile(prev => ({ ...prev, academic_year: e.target.value }))}
                                            >
                                                <option value="2025-2026">2025-2026</option>
                                                <option value="2024-2025">2024-2025</option>
                                                <option value="2023-2024">2023-2024</option>
                                                <option value="2022-2023">2022-2023</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.05em' }}>Default Syllabus Scheme</label>
                                            <select
                                                style={{ ...c.searchInput, width: '100%', boxSizing: 'border-box', cursor: 'pointer' }}
                                                value={settingsProfile.default_scheme}
                                                onChange={e => setSettingsProfile(prev => ({ ...prev, default_scheme: e.target.value }))}
                                            >
                                                <option value="2022">2022 Scheme (NEP)</option>
                                                <option value="2025">2025 Scheme (NEP)</option>
                                                <option value="2018">2018 Scheme (CBCS)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.05em' }}>Environment</label>
                                            <input
                                                style={{ ...c.searchInput, width: '100%', boxSizing: 'border-box' }}
                                                value={settingsProfile.environment}
                                                onChange={e => setSettingsProfile(prev => ({ ...prev, environment: e.target.value }))}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '6px', display: 'block', letterSpacing: '0.05em' }}>Primary Region</label>
                                            <input
                                                style={{ ...c.searchInput, width: '100%', boxSizing: 'border-box' }}
                                                value={settingsProfile.primary_region}
                                                onChange={e => setSettingsProfile(prev => ({ ...prev, primary_region: e.target.value }))}
                                            />
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                                        <button
                                            style={{ ...c.actionBtn(true), display: 'flex', alignItems: 'center', gap: '6px' }}
                                            onClick={handleSaveSettings}
                                            disabled={settingsSaving}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '16px' }}>{settingsSaving ? 'hourglass_top' : 'save'}</span>
                                            {settingsSaving ? 'Saving Changes…' : 'Save Profile Changes'}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Security & Authentication */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>Security & Gatekeeper</h3>
                                        <p style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px', margin: 0 }}>
                                            Administrator access is secured with encrypted credentials, role-based access control, and a System Access Token.
                                        </p>
                                    </div>
                                    <span className="material-icons-round" style={{ fontSize: '24px', color: 'var(--amber)' }}>security</span>
                                </div>

                                {/* System Access Token Section */}
                                <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>System Access Token</label>
                                        {!editingToken && (
                                            <button
                                                onClick={() => { setTokenInput(settingsSecurity.system_access_token); setEditingToken(true); }}
                                                style={{ ...c.actionBtn(false), padding: '4px 10px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '13px' }}>edit</span>
                                                Edit Token
                                            </button>
                                        )}
                                    </div>

                                    {!editingToken ? (
                                        <>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                <code style={{ fontSize: '16px', fontWeight: 800, color: 'var(--primary)', letterSpacing: '0.08em', background: 'var(--surface)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                    {settingsSecurity.system_access_token}
                                                </code>
                                                <button
                                                    onClick={() => copyKey(settingsSecurity.system_access_token)}
                                                    style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', color: copiedKey === settingsSecurity.system_access_token ? 'var(--green)' : 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700 }}
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>{copiedKey === settingsSecurity.system_access_token ? 'check' : 'content_copy'}</span>
                                                    {copiedKey === settingsSecurity.system_access_token ? 'Copied' : 'Copy'}
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '8px' }}>
                                                Use this token at the Admin Gateway to authenticate.
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                                <input
                                                    style={{ ...c.searchInput, flex: 1, minWidth: '200px', fontWeight: 800, letterSpacing: '0.05em' }}
                                                    value={tokenInput}
                                                    onChange={e => setTokenInput(e.target.value.toUpperCase())}
                                                    placeholder="Enter new token (e.g. GF-ADMIN-PROD)"
                                                />
                                                <button
                                                    onClick={handleGenerateToken}
                                                    style={{ ...c.actionBtn(false), padding: '8px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    title="Generate Random Secure Token"
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>casino</span>
                                                    Generate Key
                                                </button>
                                            </div>
                                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                                <button
                                                    onClick={() => setEditingToken(false)}
                                                    style={{ ...c.actionBtn(false), padding: '6px 12px', fontSize: '12px' }}
                                                    disabled={settingsSaving}
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={handleSaveToken}
                                                    style={{ ...c.actionBtn(true), padding: '6px 14px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                    disabled={settingsSaving || !tokenInput.trim()}
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>check</span>
                                                    {settingsSaving ? 'Updating…' : 'Save New Token'}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* System Reload Action */}
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>Synchronize & Reload System Data</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>Re-fetches all database tables, student metrics, and server settings.</div>
                                    </div>
                                    <button
                                        style={{ ...c.actionBtn(false), display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-low)' }}
                                        onClick={handleReloadAllData}
                                        disabled={reloadingData}
                                    >
                                        <span
                                            className="material-icons-round"
                                            style={{
                                                fontSize: '16px',
                                                animation: reloadingData ? 'spin 1s linear infinite' : 'none'
                                            }}
                                        >
                                            refresh
                                        </span>
                                        {reloadingData ? 'Reloading…' : 'Reload Data'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ── RIGHT COLUMN: Telemetry, Metrics Snapshot & Operations ── */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Live System Infrastructure Status */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>System Telemetry & Health</h3>
                                        <p style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px', margin: 0 }}>Live health status of GradeFlow services.</p>
                                    </div>
                                    <span className="material-icons-round" style={{ fontSize: '22px', color: 'var(--green)' }}>sensors</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)' }} />
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Database (Supabase PostgreSQL)</span>
                                        </div>
                                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--green)' }}>Operational</span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)' }} />
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>VTU Academic & CGPA Engine</span>
                                        </div>
                                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--green)' }}>Active</span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--green)' }} />
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Result Sync & Scraper Queue</span>
                                        </div>
                                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--green)' }}>Ready</span>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }} />
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Active Session Role</span>
                                        </div>
                                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)' }}>Super Admin</span>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Metrics Snapshot */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>Institutional Data Snapshot</h3>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--tx-dim)' }}>insights</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div style={{ padding: '12px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Students</div>
                                        <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{stats.students}</div>
                                    </div>
                                    <div style={{ padding: '12px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Faculty</div>
                                        <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{stats.faculty}</div>
                                    </div>
                                    <div style={{ padding: '12px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Marks Records</div>
                                        <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{stats.totalMarks}</div>
                                    </div>
                                    <div style={{ padding: '12px', background: 'var(--surface-low)', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Today's Activity</div>
                                        <div style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{stats.activityToday}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Quick Administrative Shortcuts */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <h3 style={{ fontSize: '15px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>Quick Administrative Portals</h3>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--tx-dim)' }}>bolt</span>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button
                                        onClick={() => setTab('requests')}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--amber)' }}>verified_user</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Faculty Access Requests</span>
                                        </div>
                                        {stats.pending > 0 ? (
                                            <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'var(--amber-bg)', color: 'var(--amber)', fontSize: '10px', fontWeight: 800 }}>{stats.pending} Pending</span>
                                        ) : (
                                            <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>chevron_right</span>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => setTab('students')}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>school</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Student Directory & Marks</span>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>chevron_right</span>
                                    </button>

                                    <button
                                        onClick={() => setTab('classes')}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--green)' }}>groups</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Class & Section Management</span>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>chevron_right</span>
                                    </button>

                                    <button
                                        onClick={() => router.push('/admin/analytics')}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--blue)' }}>analytics</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Institutional Analytics</span>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>open_in_new</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </>}
            </main>

            {/* STUDENT DETAIL DRAWER */}
            {selectedStudent && (
                <div style={c.overlay} onClick={e => { if (e.target === e.currentTarget) setSelectedStudent(null); }}>
                    <div style={c.drawer} className="gf-fade-up">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '20px', minWidth: 0, flex: 1 }}>
                                <div style={{ ...c.avatar, width: isMobile ? '48px' : '64px', height: isMobile ? '48px' : '64px', fontSize: isMobile ? '18px' : '22px', borderRadius: '14px' }}>
                                    {((selectedStudent.name || selectedStudent.usn || '?')[0]).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <h2 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedStudent.name || 'Student'}</h2>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                                        {selectedStudent.usn} · {selectedStudent.branch || 'Unassigned'} · Sem {selectedStudent.semester || '—'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                        Status: {selectedStudent.is_suspended ? (
                                            <span style={c.badge('suspended')}>🔴 Suspended (Banned)</span>
                                        ) : selectedStudent.activated_at ? (
                                            <span style={c.badge('active')}>🟢 Active</span>
                                        ) : (
                                            <span style={c.badge('pending')}>🟡 Awaiting Activation</span>
                                        )}
                                    </div>
                                    {selectedStudent.is_suspended && (
                                        <div style={{ fontSize: '11px', color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: '8px', marginTop: '6px', border: '1px solid var(--red)' }}>
                                            <strong>Ban Reason:</strong> {selectedStudent.suspended_reason || 'Administrative lock.'}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', flexShrink: 0 }} onClick={() => setSelectedStudent(null)}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>close</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                            {selectedStudent.is_suspended ? (
                                <button
                                    style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)', flex: isMobile ? '1 1 100%' : 'initial', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleToggleSuspendStudent(selectedStudent)}
                                    disabled={studentActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>restore</span>
                                    Unban & Restore Access
                                </button>
                            ) : (
                                <button
                                    style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)', flex: isMobile ? '1 1 100%' : 'initial', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => setConfirmingSuspendStudent(selectedStudent)}
                                    disabled={studentActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>block</span>
                                    Ban / Suspend Student
                                </button>
                            )}
                            <button
                                style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)', flex: isMobile ? '1 1 calc(50% - 4px)' : 'initial', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => setConfirmingPasswordReset(true)}
                            >
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>lock_reset</span>
                                Reset Credentials
                            </button>
                            <button
                                style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)', background: 'transparent', flex: isMobile ? '1 1 calc(50% - 4px)' : 'initial', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => setConfirmingSingleDelete(selectedStudent)}
                            >
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>delete_forever</span>
                                Delete Student
                            </button>
                        </div>

                        <ConfirmDialog
                            open={confirmingPasswordReset}
                            title="Reset password and Recovery PIN?"
                            description={`This will reset the password and Recovery PIN for ${selectedStudent?.name || selectedStudent?.usn}. They will need to 'Activate' their account again.`}
                            confirmLabel="Reset"
                            busy={resettingPassword}
                            onCancel={() => setConfirmingPasswordReset(false)}
                            onConfirm={resetStudentCredentials}
                        />

                        <div style={c.tabRow}>
                            {['marks', 'documents'].map(t => (
                                <button key={t} style={c.tabBtn(detailTab === t)} onClick={() => setDetailTab(t)}>
                                    {t === 'marks' ? 'Academic Records' : 'Documents'}
                                </button>
                            ))}
                        </div>

                        {detailTab === 'marks' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {Object.keys(groupedMarks).length > 0 ? (
                                    Object.entries(groupedMarks).sort(([a], [b]) => a - b).map(([sem, marks]) => (
                                        <div key={sem}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                                <div style={{ fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)' }}>Semester {sem}</div>
                                                <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)' }}>SGPA: {calcSGPA(marks)}</div>
                                            </div>
                                            {!isMobile ? (
                                                <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                                    <table style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
                                                        <thead>
                                                            <tr>{['Subject', 'CIE', 'SEE', 'Total', 'Grade'].map(h => <th key={h} style={{ ...c.th, padding: '10px 16px' }}>{h}</th>)}</tr>
                                                        </thead>
                                                        <tbody>
                                                            {marks.map(m => (
                                                                <tr key={m.id}>
                                                                    <td style={{ ...c.td, padding: '12px 16px' }}>
                                                                        <div style={{ fontWeight: 700, fontSize: '12px' }}>{m.subject_name}</div>
                                                                        <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{m.subject_code}</div>
                                                                    </td>
                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center' }}>{m.cie_marks ?? m.internal ?? '—'}</td>
                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center' }}>{m.see_marks ?? m.external ?? '—'}</td>
                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center', fontWeight: 800 }}>{m.total_marks ?? m.total ?? '—'}</td>
                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center' }}>
                                                                        <span style={c.badge(m.grade === 'F' ? 'rejected' : 'approved')}>{m.grade}</span>
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    {marks.map(m => (
                                                        <div key={m.id} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                            <div>
                                                                <div style={{ fontWeight: 700, fontSize: '12px' }}>{m.subject_name}</div>
                                                                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{m.subject_code}</div>
                                                            </div>
                                                            <div style={{ textAlign: 'right' }}>
                                                                <div style={{ fontSize: '12px', fontWeight: 800 }}>Total: {m.total_marks ?? m.total ?? '—'}</div>
                                                                <span style={c.badge(m.grade === 'F' ? 'rejected' : 'approved')}>{m.grade}</span>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No marks synced for this student.</div>
                                )}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {(studentDetails?.docs || []).map(d => (
                                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '16px 20px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '14px', flexWrap: 'wrap' }}>
                                        <span className="material-icons-round" style={{ color: 'var(--tx-main)' }}>description</span>
                                        <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                                            <div style={{ fontSize: '14px', fontWeight: 800, overflowWrap: 'anywhere' }}>{d.file_name}</div>
                                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{d.file_size ? (d.file_size / 1024 / 1024).toFixed(2) + ' MB' : ''} · Added {new Date(d.created_at).toLocaleDateString()}</div>
                                        </div>
                                        {d.file_url && <a href={d.file_url} target="_blank" rel="noreferrer" style={c.actionBtn(true)}>View</a>}
                                    </div>
                                ))}
                                {(!studentDetails?.docs || studentDetails.docs.length === 0) && <div style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No documents in vault.</div>}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* SUSPEND STUDENT MODAL */}
            {confirmingSuspendStudent && (
                <div style={c.modal} onClick={e => { if (e.target === e.currentTarget) setConfirmingSuspendStudent(null); }}>
                    <div style={c.modalCard} className="gf-fade-up">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                            <span className="material-icons-round" style={{ fontSize: '28px', color: 'var(--red)' }}>block</span>
                            <h2 style={{ fontSize: '20px', fontWeight: 900, color: 'var(--tx-main)', margin: 0, letterSpacing: '-0.03em' }}>
                                Ban / Suspend Student Access
                            </h2>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '16px', lineHeight: 1.6 }}>
                            Are you sure you want to suspend access for <strong>{confirmingSuspendStudent.name || confirmingSuspendStudent.usn}</strong> ({confirmingSuspendStudent.usn})?
                            They will be immediately blocked from logging into the Student Portal.
                        </p>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>
                            Reason for Suspension (Visible to Student upon login attempt)
                        </label>
                        <input
                            style={{ ...c.input, marginBottom: '20px' }}
                            placeholder="e.g. Disciplinary action, Pending clearance, Examination suspension"
                            value={suspendReasonInput}
                            onChange={e => setSuspendReasonInput(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                                style={{ ...c.actionBtn(true), background: 'var(--red)', color: '#FFF', padding: '10px 20px', fontSize: '13px' }}
                                onClick={() => handleToggleSuspendStudent(confirmingSuspendStudent, suspendReasonInput)}
                                disabled={studentActionBusy}
                            >
                                {studentActionBusy ? 'Suspending…' : 'Confirm Suspension'}
                            </button>
                            <button
                                style={{ ...c.actionBtn(false), padding: '10px 20px', fontSize: '13px' }}
                                onClick={() => { setConfirmingSuspendStudent(null); setSuspendReasonInput(''); }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* SINGLE DELETE CONFIRM DIALOG */}
            <ConfirmDialog
                open={Boolean(confirmingSingleDelete)}
                title="Permanently Delete Student?"
                description={`Are you sure you want to delete ${confirmingSingleDelete?.name || confirmingSingleDelete?.usn} (${confirmingSingleDelete?.usn})? This will permanently remove their records, marks, and enrollments.`}
                confirmLabel="Delete Student"
                busy={studentActionBusy}
                onCancel={() => setConfirmingSingleDelete(null)}
                onConfirm={() => handleDeleteSingleStudent(confirmingSingleDelete)}
            />

            {/* BULK DELETE CONFIRM DIALOG */}
            <ConfirmDialog
                open={confirmingBulkDelete}
                title={`Permanently Delete ${selectedUsns.size} Student(s)?`}
                description={`This action CANNOT be undone. All selected student profiles, marks data, and class enrollments will be wiped from the system.`}
                confirmLabel={`Delete ${selectedUsns.size} Students`}
                busy={studentActionBusy}
                onCancel={() => setConfirmingBulkDelete(false)}
                onConfirm={() => handleBulkAction('bulk_delete')}
            />

            {/* BULK SUSPEND CONFIRM DIALOG */}
            <ConfirmDialog
                open={confirmingBulkSuspend}
                title={`Suspend & Ban ${selectedUsns.size} Student(s)?`}
                description={`All selected students will be blocked from logging into the Student Portal until an administrator restores their access.`}
                confirmLabel={`Suspend ${selectedUsns.size} Students`}
                busy={studentActionBusy}
                onCancel={() => setConfirmingBulkSuspend(false)}
                onConfirm={() => handleBulkAction('bulk_suspend')}
            />

            {/* ADD STUDENT MODAL */}
            {showAddStudent && (
                <div style={c.modal} onClick={e => { if (e.target === e.currentTarget) setShowAddStudent(false); }}>
                    <div style={c.modalCard} className="gf-fade-up">
                        <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '8px', letterSpacing: '-0.03em' }}>Add New Student</h2>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
                            Create a student profile. When this student logs in with this USN, they will connect to this record automatically.
                        </p>
                        {addError && <div style={{ padding: '10px 14px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px', fontSize: '12px', color: 'var(--red)', fontWeight: 600, marginBottom: '16px' }}>{addError}</div>}
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>USN *</label>
                        <input style={c.input} placeholder="e.g. 4AB22CS001" value={newStudent.usn} onChange={e => setNewStudent(p => ({ ...p, usn: e.target.value.toUpperCase() }))} />
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Student Name</label>
                        <input style={c.input} placeholder="Full Name" value={newStudent.name} onChange={e => setNewStudent(p => ({ ...p, name: e.target.value }))} />
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Branch</label>
                        <input style={c.input} placeholder="e.g. CSE, ISE, ECE" value={newStudent.branch} onChange={e => setNewStudent(p => ({ ...p, branch: e.target.value }))} />
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button style={{ ...c.actionBtn(true), padding: '12px 24px', fontSize: '13px' }} onClick={addStudent}>Create Student</button>
                            <button style={{ ...c.actionBtn(false), padding: '12px 24px', fontSize: '13px' }} onClick={() => setShowAddStudent(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function AdminPanel() {
    return (
        <AuthGuard role="admin">
            <AdminPanelContent />
        </AuthGuard>
    );
}
