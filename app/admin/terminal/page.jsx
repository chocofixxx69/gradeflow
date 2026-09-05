'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest } from '../../../lib/api/client';
import { useRouter, useSearchParams } from 'next/navigation';
import AuthGuard from '../../../components/AuthGuard';
import { ClassesContent } from '../../../components/ClassesContent';
import { AuditLogContent } from '../../../components/AuditLogContent';
import { SupportTicketsContent } from '../../../components/SupportTicketsContent';
import { FacultyAssignmentsContent } from '../../../components/FacultyAssignmentsContent';
import { ConfirmDialog } from '../../../components/ui';
import AdminAnalyticsPage from '../analytics/page.jsx';
import { AnalyticsFiltersProvider } from '../analytics/AnalyticsFiltersContext';
import { getGradePoint } from '../../../lib/vtuGrades';
import { normalizeSubjectResult } from '../../../lib/vtuAcademicEngine';
import { supabase } from '../../../lib/supabase';

const TAB_METADATA = {
    overview: { label: 'Institutional Overview', icon: 'dashboard', shortLabel: 'Overview' },
    students: { label: 'Student Directory & Access Control', icon: 'school', shortLabel: 'Students' },
    classes: { label: 'Classes & Academic Structure', icon: 'groups', shortLabel: 'Classes' },
    assignments: { label: 'Faculty Subject Assignments & Mapping', icon: 'assignment_ind', shortLabel: 'Subject Assignments' },
    requests: { label: 'Faculty Access & Credentials', icon: 'verified_user', shortLabel: 'Faculty Access' },
    support: { label: 'Institutional Support Tickets', icon: 'support_agent', shortLabel: 'Support' },
    activity: { label: 'Faculty Pedagogical & Activity Log', icon: 'history', shortLabel: 'Activity Log' },
    audit: { label: 'System Health & Security Audit', icon: 'security', shortLabel: 'System Audit' },
    system: { label: 'System Health & Security Audit', icon: 'security', shortLabel: 'System Audit' },
    analytics: { label: 'Institutional Analytics', icon: 'analytics', shortLabel: 'Analytics' },
    settings: { label: 'Institutional Settings & Security', icon: 'settings', shortLabel: 'Settings' },
};

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

    const initialTab = searchParams?.get('tab') || 'overview';
    const [tab, setTab] = useState(initialTab);
    const [tabHistory, setTabHistory] = useState([]);
    const [navigationOrigin, setNavigationOrigin] = useState(null);
    const [students, setStudents] = useState([]);
    const [requests, setRequests] = useState([]);
    const [activityLogs, setActivityLogs] = useState([]);
    const [activitySearch, setActivitySearch] = useState('');
    const [activityTypeFilter, setActivityTypeFilter] = useState('all');
    const [activityDateFilter, setActivityDateFilter] = useState('all');
    const [stats, setStats] = useState({ students: 0, pending: 0, faculty: 0, totalMarks: 0, activityToday: 0 });
    const [openTicketsCount, setOpenTicketsCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [actionId, setActionId] = useState(null);
    const [confirmingReject, setConfirmingReject] = useState(null);
    const [confirmingPasswordReset, setConfirmingPasswordReset] = useState(false);
    const [resettingPassword, setResettingPassword] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [studentDetails, setStudentDetails] = useState(null);
    const [detailError, setDetailError] = useState('');
    const [detailTab, setDetailTab] = useState('marks');
    const [adminUser, setAdminUser] = useState(null);
    const [copiedKey, setCopiedKey] = useState(null);

    // Student Directory & Management States
    const [selectedUsns, setSelectedUsns] = useState(new Set());
    const [studentStatusFilter, setStudentStatusFilter] = useState('all');
    const [studentBranchFilter, setStudentBranchFilter] = useState('all');
    const [studentSemFilter, setStudentSemFilter] = useState('all');
    const [studentBatchFilter, setStudentBatchFilter] = useState('all');
    const [studentActionBusy, setStudentActionBusy] = useState(false);
    const [studentActionMsg, setStudentActionMsg] = useState('');
    const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);
    const [confirmingBulkSuspend, setConfirmingBulkSuspend] = useState(false);
    const [confirmingSingleDelete, setConfirmingSingleDelete] = useState(null);
    const [confirmingSuspendStudent, setConfirmingSuspendStudent] = useState(null);
    const [suspendReasonInput, setSuspendReasonInput] = useState('');
    const [syncingSemesters, setSyncingSemesters] = useState(false);

    const [sortField, setSortField] = useState('usn');
    const [sortDirection, setSortDirection] = useState('asc');

    // New Student creation form
    const [showAddStudent, setShowAddStudent] = useState(false);
    const [newStudent, setNewStudent] = useState({ usn: '', name: '', branch: '', scheme: '2022', semester: 1 });
    const [addError, setAddError] = useState('');
    const [addingStudent, setAddingStudent] = useState(false);
    // Faculty Management States
    const [classesList, setClassesList] = useState([]);
    const [facultySearch, setFacultySearch] = useState('');
    const [facultyStatusFilter, setFacultyStatusFilter] = useState('all');
    const [facultyDeptFilter, setFacultyDeptFilter] = useState('all');
    const [facultySortField, setFacultySortField] = useState('full_name');
    const [facultySortDirection, setFacultySortDirection] = useState('asc');
    const [selectedFacultyIds, setSelectedFacultyIds] = useState(new Set());
    const [selectedFaculty, setSelectedFaculty] = useState(null);
    const [facultyDrawerTab, setFacultyDrawerTab] = useState('classes');
    const [showAddFaculty, setShowAddFaculty] = useState(false);
    const [newFaculty, setNewFaculty] = useState({
        full_name: '',
        email: '',
        department: 'Computer Science',
        designation: 'Assistant Professor',
        employee_id: '',
        phone: '',
    });
    const [editingFaculty, setEditingFaculty] = useState(null);
    const [createdFacultyResult, setCreatedFacultyResult] = useState(null);
    const [confirmingSuspendFaculty, setConfirmingSuspendFaculty] = useState(null);
    const [facultySuspendReason, setFacultySuspendReason] = useState('');
    const [confirmingDeleteFaculty, setConfirmingDeleteFaculty] = useState(null);
    const [confirmingBulkSuspendFaculty, setConfirmingBulkSuspendFaculty] = useState(false);
    const [confirmingBulkDeleteFaculty, setConfirmingBulkDeleteFaculty] = useState(false);
    const [confirmingRegenKeyFaculty, setConfirmingRegenKeyFaculty] = useState(null);
    const [facultyActionBusy, setFacultyActionBusy] = useState(false);
    const [facultyActionMsg, setFacultyActionMsg] = useState('');

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

    const switchTab = useCallback((newTab, origin = null) => {
        if (newTab === tab && !origin) return;
        setTabHistory(prev => {
            const filtered = prev.filter(t => t !== tab);
            return [...filtered, tab];
        });
        if (origin) {
            setNavigationOrigin(origin);
        } else if (newTab === 'overview') {
            setNavigationOrigin(null);
        }
        setTab(newTab);
        if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('tab', newTab);
            window.history.pushState({ tab: newTab }, '', url.toString());
        }
    }, [tab]);

    const goBack = useCallback(() => {
        // Priority 1: Close active drawers or modals
        if (selectedStudent) {
            setSelectedStudent(null);
            return;
        }
        if (selectedFaculty) {
            setSelectedFaculty(null);
            return;
        }
        if (showAddStudent) {
            setShowAddStudent(false);
            return;
        }
        if (showAddFaculty) {
            setShowAddFaculty(false);
            return;
        }
        if (editingFaculty) {
            setEditingFaculty(null);
            return;
        }

        // Priority 2: In Students tab with active cohort/branch/batch filter, clear filter and return to Overview
        if (tab === 'students' && (studentSemFilter !== 'all' || studentBranchFilter !== 'all' || studentBatchFilter !== 'all')) {
            setStudentSemFilter('all');
            setStudentBranchFilter('all');
            setStudentBatchFilter('all');
            if (navigationOrigin?.from === 'overview' || tabHistory[tabHistory.length - 1] === 'overview') {
                setTab('overview');
                setNavigationOrigin(null);
                if (typeof window !== 'undefined') {
                    const url = new URL(window.location.href);
                    url.searchParams.set('tab', 'overview');
                    window.history.pushState({ tab: 'overview' }, '', url.toString());
                }
                return;
            }
        }

        // Priority 3: Pop from tabHistory if available
        if (tabHistory.length > 0) {
            const previous = tabHistory[tabHistory.length - 1];
            setTabHistory(prev => prev.slice(0, -1));
            setTab(previous);
            if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', previous);
                window.history.pushState({ tab: previous }, '', url.toString());
            }
            return;
        }

        // Priority 4: Default fallback: return to overview
        if (tab !== 'overview') {
            setTab('overview');
            setNavigationOrigin(null);
            if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', 'overview');
                window.history.pushState({ tab: 'overview' }, '', url.toString());
            }
        }
    }, [selectedStudent, selectedFaculty, showAddStudent, showAddFaculty, editingFaculty, tab, studentSemFilter, studentBranchFilter, navigationOrigin, tabHistory]);

    // Handle browser Back and Forward buttons (popstate)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handlePopState = (e) => {
            if (selectedStudent) {
                setSelectedStudent(null);
                return;
            }
            if (selectedFaculty) {
                setSelectedFaculty(null);
                return;
            }
            if (showAddStudent) {
                setShowAddStudent(false);
                return;
            }
            if (showAddFaculty) {
                setShowAddFaculty(false);
                return;
            }
            if (editingFaculty) {
                setEditingFaculty(null);
                return;
            }
            const currentTab = e.state?.tab || new URLSearchParams(window.location.search).get('tab') || 'overview';
            setTab(currentTab);
        };
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
    }, [selectedStudent, selectedFaculty, showAddStudent, showAddFaculty, editingFaculty]);

    // Enhanced Escape key handler to close any active drawer or modal
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                if (mobileMenuOpen) setMobileMenuOpen(false);
                if (selectedStudent) setSelectedStudent(null);
                if (selectedFaculty) setSelectedFaculty(null);
                if (showAddStudent) setShowAddStudent(false);
                if (showAddFaculty) setShowAddFaculty(false);
                if (editingFaculty) setEditingFaculty(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [mobileMenuOpen, selectedStudent, selectedFaculty, showAddStudent, showAddFaculty, editingFaculty]);

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
            // Proactively ensure admin session cookies are active and aligned
            if (typeof window !== 'undefined') {
                try {
                    const admStr = localStorage.getItem('admin_session');
                    if (admStr) {
                        const adm = JSON.parse(admStr);
                        if (adm?.token) {
                            await fetch('/api/auth/session/sync', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ role: 'admin', token: adm.token, email: adm.email }),
                            }).then(r => r.json()).then(res => {
                                if (res?.sessionToken && adm.sessionToken !== res.sessionToken) {
                                    adm.sessionToken = res.sessionToken;
                                    localStorage.setItem('admin_session', JSON.stringify(adm));
                                }
                            }).catch(() => {});
                        }
                    }
                } catch {}
            }

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
            setClassesList(resData?.classes || []);

            const todayStr = new Date().toISOString().slice(0, 10);
            const todayCount = l.filter(x => x.created_at?.startsWith(todayStr)).length;
            setStats({
                students: resData?.counts?.totalStudents || s.length,
                pending: r.filter(x => x.status === 'pending').length,
                faculty: r.filter(x => x.status === 'approved').length,
                totalMarks: resData?.counts?.totalMarksRecords || 0,
                activityToday: todayCount,
            });

            apiRequest('/api/admin/support/tickets').then(tRes => {
                if (tRes?.stats?.open !== undefined) setOpenTicketsCount(tRes.stats.open);
            }).catch(() => {});
        } catch (err) {
            console.error('Failed to load admin data:', err);
            setLoadError('Failed to load admin data. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    }, []);

    const openStudent = async (student) => {
        setSelectedStudent(student);
        setStudentDetails(null);
        setDetailError('');
        setDetailTab('marks');
        try {
            const data = await apiRequest('/api/admin/terminal/data', { query: { student_id: student.id, usn: student.usn } });
            setStudentDetails({
                marks: data?.marks || [],
                docs: data?.documents || [],
                academic: data?.academic || null,
                student: data?.student || student
            });
        } catch (err) {
            console.error('Error fetching student details:', err);
            setDetailError(err?.message || 'Failed to load this student\'s records. Please retry.');
            setStudentDetails(null);
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

    const addStudent = async () => {
        const cleanUsn = String(newStudent.usn || '').toUpperCase().trim();
        if (!cleanUsn) {
            setAddError('USN is required.');
            return;
        }
        setAddError('');
        setAddingStudent(true);
        try {
            const res = await apiRequest('/api/admin/student-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'create_student',
                    usn: cleanUsn,
                    name: newStudent.name.trim(),
                    branch: (newStudent.branch || '').toUpperCase().trim(),
                    scheme: newStudent.scheme || '2022',
                    semester: Number(newStudent.semester) || 1
                })
            });
            setStudentActionMsg(res.message || `Student ${cleanUsn} created successfully.`);
            setShowAddStudent(false);
            setNewStudent({ usn: '', name: '', branch: '', scheme: '2022', semester: 1 });
            await loadData();
            setTimeout(() => setStudentActionMsg(''), 4000);
        } catch (err) {
            setAddError(err.message || 'Failed to create student.');
        } finally {
            setAddingStudent(false);
        }
    };

    const handleSyncAllSemesters = async () => {
        setSyncingSemesters(true);
        setStudentActionMsg('');
        try {
            const res = await apiRequest('/api/admin/student-action', {
                method: 'POST',
                body: JSON.stringify({ action: 'sync_semesters' })
            });
            setStudentActionMsg(res.message || 'Semesters synchronized.');
            await loadData();
            setTimeout(() => setStudentActionMsg(''), 5000);
        } catch (err) {
            alert('Failed to sync semesters: ' + err.message);
        } finally {
            setSyncingSemesters(false);
        }
    };

    const handleUpdateStudentSemester = async (student, newSem) => {
        if (!student) return;
        setStudentActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/student-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'update_student_semester',
                    usn: student.usn,
                    semester: Number(newSem)
                })
            });
            setStudentActionMsg(res.message || `Student semester updated.`);
            setSelectedStudent(prev => prev ? ({ ...prev, semester: Number(newSem) }) : null);
            await loadData();
            setTimeout(() => setStudentActionMsg(''), 4000);
        } catch (err) {
            alert('Failed to update semester: ' + err.message);
        } finally {
            setStudentActionBusy(false);
        }
    };

    // ── Faculty Action Handlers ──────────────────────────────
    const handleCreateFaculty = async () => {
        if (!newFaculty.full_name?.trim() || !newFaculty.email?.trim()) {
            alert('Full Name and Institutional Email are required.');
            return;
        }
        setFacultyActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/faculty-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'create_faculty',
                    ...newFaculty
                })
            });
            setCreatedFacultyResult({
                ...newFaculty,
                access_key: res.access_key
            });
            setShowAddFaculty(false);
            setNewFaculty({ full_name: '', email: '', department: 'Computer Science', designation: 'Assistant Professor', employee_id: '', phone: '' });
            setFacultyActionMsg(res.message || 'Faculty member onboarded successfully.');
            await loadData();
            setTimeout(() => setFacultyActionMsg(''), 6000);
        } catch (err) {
            alert('Failed to onboard faculty: ' + err.message);
        } finally {
            setFacultyActionBusy(false);
        }
    };

    const handleToggleSuspendFaculty = async (faculty, customReason) => {
        if (!faculty) return;
        setFacultyActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/faculty-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'toggle_suspend',
                    id: faculty.id,
                    reason: customReason || facultySuspendReason || 'Account suspended by Administrator.'
                })
            });
            setFacultyActionMsg(res.message || 'Faculty status updated.');
            if (selectedFaculty?.id === faculty.id) {
                setSelectedFaculty(prev => prev ? ({ ...prev, status: res.status }) : null);
            }
            await loadData();
            setTimeout(() => setFacultyActionMsg(''), 4000);
        } catch (err) {
            alert('Failed to update faculty status: ' + err.message);
        } finally {
            setFacultyActionBusy(false);
            setConfirmingSuspendFaculty(null);
            setFacultySuspendReason('');
        }
    };

    const handleRegenerateFacultyKey = async (faculty) => {
        if (!faculty) return;
        setFacultyActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/faculty-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'regenerate_key',
                    id: faculty.id
                })
            });
            setCreatedFacultyResult({
                full_name: faculty.full_name,
                email: faculty.email,
                access_key: res.generated_access_key
            });
            setFacultyActionMsg(res.message || 'New access key generated.');
            if (selectedFaculty?.id === faculty.id) {
                setSelectedFaculty(prev => prev ? ({ ...prev, generated_access_key: res.generated_access_key, status: 'approved' }) : null);
            }
            await loadData();
            setTimeout(() => setFacultyActionMsg(''), 6000);
        } catch (err) {
            alert('Failed to regenerate key: ' + err.message);
        } finally {
            setFacultyActionBusy(false);
            setConfirmingRegenKeyFaculty(null);
        }
    };

    const handleEditFaculty = async () => {
        if (!editingFaculty) return;
        setFacultyActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/faculty-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'edit_faculty',
                    ...editingFaculty
                })
            });
            setFacultyActionMsg(res.message || 'Faculty profile updated.');
            if (selectedFaculty?.id === editingFaculty.id) {
                setSelectedFaculty(prev => prev ? ({ ...prev, ...editingFaculty }) : null);
            }
            setEditingFaculty(null);
            await loadData();
            setTimeout(() => setFacultyActionMsg(''), 4000);
        } catch (err) {
            alert('Failed to update faculty: ' + err.message);
        } finally {
            setFacultyActionBusy(false);
        }
    };

    const handleDeleteSingleFaculty = async (faculty) => {
        if (!faculty) return;
        setFacultyActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/faculty-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'delete_faculty',
                    id: faculty.id
                })
            });
            setFacultyActionMsg(res.message || 'Faculty member removed.');
            if (selectedFaculty?.id === faculty.id) setSelectedFaculty(null);
            setSelectedFacultyIds(prev => { const n = new Set(prev); n.delete(faculty.id); return n; });
            await loadData();
            setTimeout(() => setFacultyActionMsg(''), 4000);
        } catch (err) {
            alert('Failed to remove faculty: ' + err.message);
        } finally {
            setFacultyActionBusy(false);
            setConfirmingDeleteFaculty(null);
        }
    };

    const handleBulkFacultyAction = async (actionType) => {
        if (selectedFacultyIds.size === 0) return;
        setFacultyActionBusy(true);
        try {
            const res = await apiRequest('/api/admin/faculty-action', {
                method: 'POST',
                body: JSON.stringify({
                    action: actionType,
                    ids: Array.from(selectedFacultyIds),
                    reason: facultySuspendReason || 'Batch suspension by Administrator.'
                })
            });
            setFacultyActionMsg(res.message || 'Batch operation completed.');
            setSelectedFacultyIds(new Set());
            await loadData();
            setTimeout(() => setFacultyActionMsg(''), 4000);
        } catch (err) {
            alert('Failed batch faculty action: ' + err.message);
        } finally {
            setFacultyActionBusy(false);
            setConfirmingBulkSuspendFaculty(false);
            setConfirmingBulkDeleteFaculty(false);
            setFacultySuspendReason('');
        }
    };

    const handleSortFaculty = (field) => {
        if (facultySortField === field) {
            setFacultySortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setFacultySortField(field);
            setFacultySortDirection('asc');
        }
    };

    const handleToggleFacultySelection = (id, e) => {
        if (e) e.stopPropagation();
        setSelectedFacultyIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelectAllFaculty = () => {
        if (selectedFacultyIds.size === filteredFaculty.length) {
            setSelectedFacultyIds(new Set());
        } else {
            setSelectedFacultyIds(new Set(filteredFaculty.map(f => f.id)));
        }
    };

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const availableBranches = useMemo(() => {
        return Array.from(new Set(students.map(s => (s.branch || '').toUpperCase()).filter(Boolean))).sort();
    }, [students]);

    const branchBreakdown = useMemo(() => {
        const map = {};
        students.forEach(s => {
            const b = (s.branch || 'Unassigned').trim();
            map[b] = (map[b] || 0) + 1;
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }, [students]);

    const semesterBreakdown = useMemo(() => {
        const map = {};
        students.forEach(s => {
            const sem = Number(s.semester) || 1;
            map[sem] = (map[sem] || 0) + 1;
        });
        return Object.entries(map).sort(([a], [b]) => Number(a) - Number(b));
    }, [students]);

    // Academic Batches (Graduating Classes derived from USN 2ABxx)
    const batchBreakdown = useMemo(() => {
        const counts = {
            '2023': { label: 'Class of 2027 (Final Year)', code: '2023', count: 0, sem: 'Semester 7', academicYear: '4th Year' },
            '2024': { label: 'Class of 2028 (3rd Year)', code: '2024', count: 0, sem: 'Semester 5', academicYear: '3rd Year' },
            '2025': { label: 'Class of 2029 (2nd Year)', code: '2025', count: 0, sem: 'Semester 3', academicYear: '2nd Year' },
        };
        let lateralCount = 0;

        students.forEach(s => {
            const u = (s.usn || '').toUpperCase();
            if (u.includes('2AB23')) counts['2023'].count++;
            else if (u.includes('2AB24')) counts['2024'].count++;
            else if (u.includes('2AB25')) counts['2025'].count++;

            const m = u.match(/2AB\d{2}[A-Z]{2}(\d{3})/);
            if (m && parseInt(m[1], 10) >= 400) lateralCount++;
        });

        return { batches: Object.values(counts), lateralCount };
    }, [students]);

    // Base scoped students matching search, branch, semester, and batch
    const baseScopedStudents = useMemo(() => {
        const q = (search || '').toLowerCase().trim();
        return students.filter(s => {
            const matchSearch = !q || (s.usn || '').toLowerCase().includes(q) || (s.name || '').toLowerCase().includes(q);
            if (!matchSearch) return false;

            if (studentBranchFilter !== 'all') {
                if ((s.branch || '').toUpperCase() !== studentBranchFilter.toUpperCase()) return false;
            }

            if (studentSemFilter !== 'all') {
                if (Number(s.semester) !== Number(studentSemFilter)) return false;
            }

            if (studentBatchFilter !== 'all') {
                const u = (s.usn || '').toUpperCase();
                if (studentBatchFilter === '2023' && !u.includes('2AB23')) return false;
                if (studentBatchFilter === '2024' && !u.includes('2AB24')) return false;
                if (studentBatchFilter === '2025' && !u.includes('2AB25')) return false;
                if (studentBatchFilter === 'lateral') {
                    const m = u.match(/2AB\d{2}[A-Z]{2}(\d{3})/);
                    if (!m || parseInt(m[1], 10) < 400) return false;
                }
            }

            return true;
        });
    }, [students, search, studentBranchFilter, studentSemFilter, studentBatchFilter]);

    const statusCounts = useMemo(() => ({
        all: baseScopedStudents.length,
        active: baseScopedStudents.filter(s => s.activated_at && !s.is_suspended).length,
        pending: baseScopedStudents.filter(s => !s.activated_at && !s.is_suspended).length,
        suspended: baseScopedStudents.filter(s => s.is_suspended).length,
    }), [baseScopedStudents]);

    const filtered = useMemo(() => {
        return baseScopedStudents.filter(s => {
            if (studentStatusFilter === 'active') {
                if (!s.activated_at || s.is_suspended) return false;
            } else if (studentStatusFilter === 'pending') {
                if (s.activated_at || s.is_suspended) return false;
            } else if (studentStatusFilter === 'suspended') {
                if (!s.is_suspended) return false;
            }
            return true;
        }).sort((a, b) => {
            let cmp = 0;
            if (sortField === 'name') {
                const valA = (a.name || a.usn || '').toLowerCase();
                const valB = (b.name || b.usn || '').toLowerCase();
                cmp = valA.localeCompare(valB);
            } else if (sortField === 'semester') {
                const valA = Number(a.semester) || 0;
                const valB = Number(b.semester) || 0;
                cmp = valA - valB;
            } else if (sortField === 'branch') {
                const valA = (a.branch || '').toLowerCase();
                const valB = (b.branch || '').toLowerCase();
                cmp = valA.localeCompare(valB);
            } else if (sortField === 'status') {
                const getScore = s => (s.is_suspended ? 3 : s.activated_at ? 1 : 2);
                cmp = getScore(a) - getScore(b);
            } else {
                // Default: Natural USN order (e.g. 2AB23CD001, 2AB23CD002... 2AB23CS001...)
                const valA = (a.usn || '').toUpperCase();
                const valB = (b.usn || '').toUpperCase();
                cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
            }
            return sortDirection === 'asc' ? cmp : -cmp;
        });
    }, [baseScopedStudents, studentStatusFilter, sortField, sortDirection]);

    // ── Faculty Scope & Filtering ────────────────────────────
    const availableFacultyDepts = useMemo(() => {
        return Array.from(
            new Set(requests.map(r => (r.department || '').trim()).filter(Boolean))
        ).sort();
    }, [requests]);

    const baseScopedFaculty = useMemo(() => {
        const q = (facultySearch || '').toLowerCase().trim();
        return requests.filter(r => {
            const matchSearch = !q ||
                (r.full_name || '').toLowerCase().includes(q) ||
                (r.email || '').toLowerCase().includes(q) ||
                (r.department || '').toLowerCase().includes(q) ||
                (r.employee_id || '').toLowerCase().includes(q) ||
                (r.designation || '').toLowerCase().includes(q);
            if (!matchSearch) return false;

            if (facultyDeptFilter !== 'all') {
                if ((r.department || '').toLowerCase() !== facultyDeptFilter.toLowerCase()) return false;
            }

            return true;
        });
    }, [requests, facultySearch, facultyDeptFilter]);

    const statusCountsFaculty = useMemo(() => ({
        all: baseScopedFaculty.length,
        approved: baseScopedFaculty.filter(r => r.status === 'approved').length,
        pending: baseScopedFaculty.filter(r => r.status === 'pending').length,
        suspended: baseScopedFaculty.filter(r => r.status === 'suspended').length,
    }), [baseScopedFaculty]);

    const filteredFaculty = useMemo(() => {
        return baseScopedFaculty.filter(r => {
            if (facultyStatusFilter === 'approved') return r.status === 'approved';
            if (facultyStatusFilter === 'pending') return r.status === 'pending';
            if (facultyStatusFilter === 'suspended') return r.status === 'suspended';
            return true;
        }).sort((a, b) => {
            let cmp = 0;
            if (facultySortField === 'full_name') {
                cmp = (a.full_name || '').localeCompare(b.full_name || '');
            } else if (facultySortField === 'department') {
                cmp = (a.department || '').localeCompare(b.department || '');
            } else if (facultySortField === 'employee_id') {
                cmp = (a.employee_id || '').localeCompare(b.employee_id || '');
            } else if (facultySortField === 'status') {
                const score = s => (s.status === 'suspended' ? 3 : s.status === 'pending' ? 2 : 1);
                cmp = score(a) - score(b);
            } else if (facultySortField === 'created_at') {
                cmp = new Date(b.created_at || 0) - new Date(a.created_at || 0);
            }
            return facultySortDirection === 'asc' ? cmp : -cmp;
        });
    }, [baseScopedFaculty, facultyStatusFilter, facultySortField, facultySortDirection]);

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
        layout: {
            display: 'flex',
            flexDirection: isMobile ? 'column' : 'row',
            height: '100dvh',
            maxHeight: '100dvh',
            background: 'var(--bg)',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            minWidth: 0,
            width: '100%',
            maxWidth: '100vw',
            overflow: 'hidden',
        },
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
            maxWidth: sidebarCollapsed ? '72px' : '260px',
            flexShrink: 0,
            background: 'var(--surface)',
            borderRight: '1px solid var(--border)',
            padding: sidebarCollapsed ? 'var(--space-4) var(--space-2)' : 'var(--space-6) var(--space-4)',
            display: 'flex', flexDirection: 'column',
            height: '100dvh',
            overflow: 'hidden',
            boxSizing: 'border-box',
            transition: 'width 0.2s ease-in-out, min-width 0.2s ease-in-out, max-width 0.2s ease-in-out, padding 0.2s ease-in-out',
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
        main: {
            flex: 1,
            height: isMobile ? 'calc(100dvh - 56px)' : '100dvh',
            maxHeight: isMobile ? 'calc(100dvh - 56px)' : '100dvh',
            padding: isMobile ? 'var(--space-4)' : 'var(--page-py) var(--page-px)',
            overflowY: 'auto',
            overflowX: 'hidden',
            minWidth: 0,
            width: '100%',
            maxWidth: '100%',
            boxSizing: 'border-box',
            WebkitOverflowScrolling: 'touch',
        },
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
        { id: 'assignments', label: 'Subject Assignments', icon: 'assignment_ind' },
        { id: 'requests', label: 'Faculty Access', icon: 'verified_user' },
        { id: 'support', label: 'Support & Issues', icon: 'support_agent' },
        { id: 'activity', label: 'Activity Log', icon: 'history' },
        { id: 'audit', label: 'System Audit', icon: 'security' },
        { id: 'analytics', label: 'Institutional Analytics', icon: 'analytics' },
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
    const activeFacultyCount = useMemo(() => new Set(activityLogs.map(l => l.faculty_name || l._faculty?.full_name).filter(Boolean)).size, [activityLogs]);
    const successRate = useMemo(() => activityLogs.length > 0 ? Math.round((activityLogs.filter(l => (l.sync_status || 'SUCCESS') === 'SUCCESS').length / activityLogs.length) * 100) : 100, [activityLogs]);

    const handleExportFacultyCSV = () => {
        if (!filteredActivity.length) {
            alert('No faculty activity records to export.');
            return;
        }
        const headers = ['Timestamp', 'Faculty Name', 'Faculty Email', 'Department', 'Action Type', 'Target USN / Details', 'Sync Status'];
        const rows = filteredActivity.map(l => {
            const fac = l._faculty || {};
            return [
                `"${l.created_at || ''}"`,
                `"${(l.faculty_name || fac.full_name || 'Faculty').replace(/"/g, '""')}"`,
                `"${fac.email || ''}"`,
                `"${fac.department || ''}"`,
                `"${l.action_type || ''}"`,
                `"${(l.target_usn || l.details || '').replace(/"/g, '""')}"`,
                `"${l.sync_status || 'SUCCESS'}"`
            ];
        });
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `faculty_activity_log_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

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
                        <div style={{ ...c.logoRow, cursor: 'pointer' }} onClick={() => { switchTab('overview'); if (isMobile) setMobileMenuOpen(false); }}>
                            <div style={c.logoBox}>G</div>
                            <span style={{ fontWeight: 800, fontSize: '17px', color: 'var(--tx-main)', letterSpacing: '-0.02em' }}>GradeFlow</span>
                        </div>
                    ) : (
                        <div style={{ ...c.logoBox, cursor: 'pointer' }} onClick={() => { switchTab('overview'); if (isMobile) setMobileMenuOpen(false); }}>G</div>
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
                            onClick={() => { switchTab(n.id); if (isMobile) setMobileMenuOpen(false); }}
                            title={sidebarCollapsed && !isMobile ? n.label : undefined}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>{n.icon}</span>
                            {(!sidebarCollapsed || isMobile) && <span>{n.label}</span>}
                            {n.id === 'requests' && stats.pending > 0 && (
                                <span style={{ marginLeft: (sidebarCollapsed && !isMobile) ? '0' : 'auto', background: 'var(--amber)', color: 'var(--bg)', padding: '2px 6px', borderRadius: 'var(--radius-4)', fontSize: '10px', fontWeight: 900 }}>
                                    {stats.pending}
                                </span>
                            )}
                            {n.id === 'support' && openTicketsCount > 0 && (
                                <span style={{ marginLeft: (sidebarCollapsed && !isMobile) ? '0' : 'auto', background: '#b91c1c', color: '#ffffff', padding: '2px 6px', borderRadius: 'var(--radius-4)', fontSize: '10px', fontWeight: 900 }}>
                                    {openTicketsCount}
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

                {/* Global Top Breadcrumbs & Back Navigation Bar for all non-overview tabs */}
                {tab !== 'overview' && (
                    <div
                        className="gf-fade-up"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            marginBottom: '20px',
                            padding: '10px 16px',
                            background: 'var(--surface-low)',
                            border: '1px solid var(--border)',
                            borderRadius: '12px',
                        }}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <button
                                onClick={goBack}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '7px 14px',
                                    borderRadius: '8px',
                                    background: 'var(--surface)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--tx-main)',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--primary)';
                                    e.currentTarget.style.color = 'var(--primary)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.color = 'var(--tx-main)';
                                }}
                                title="Go back to previous view or overview"
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                                <span>Back {tabHistory.length > 0 ? `to ${TAB_METADATA[tabHistory[tabHistory.length - 1]]?.shortLabel || 'Previous'}` : 'to Overview'}</span>
                            </button>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--tx-dim)' }}>
                                <span
                                    style={{ color: 'var(--tx-muted)', cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => switchTab('overview')}
                                    onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                                    onMouseLeave={e => e.currentTarget.style.color = 'var(--tx-muted)'}
                                    title="Return to Institutional Overview"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>dashboard</span>
                                    Overview
                                </span>
                                <span>›</span>
                                <span style={{ color: 'var(--tx-main)', fontWeight: 800 }}>
                                    {TAB_METADATA[tab]?.shortLabel || tab}
                                </span>
                                {tab === 'students' && studentSemFilter !== 'all' && (
                                    <>
                                        <span>›</span>
                                        <span style={{ color: 'var(--primary)', fontWeight: 800, background: 'rgba(37,99,235,0.08)', padding: '2px 8px', borderRadius: '6px' }}>
                                            Semester {studentSemFilter} Cohort
                                        </span>
                                    </>
                                )}
                                {tab === 'students' && studentBranchFilter !== 'all' && (
                                    <>
                                        <span>›</span>
                                        <span style={{ color: 'var(--primary)', fontWeight: 800, background: 'rgba(37,99,235,0.08)', padding: '2px 8px', borderRadius: '6px' }}>
                                            {studentBranchFilter}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Direct return to Overview shortcut */}
                        <button
                            onClick={() => switchTab('overview')}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                                padding: '6px 12px',
                                borderRadius: '8px',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--tx-muted)',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--primary)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--tx-muted)'}
                            title="Jump directly to Institutional Overview"
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>home</span>
                            <span>Institutional Overview</span>
                        </button>
                    </div>
                )}

                {tab === 'overview' && <>
                    <div style={c.pageLabel}>Admin Control Panel</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                        <div>
                            <h1 style={{ ...c.pageTitle, marginBottom: '4px' }}>Institutional Overview & Telemetry</h1>
                            <p style={{ fontSize: '13px', color: 'var(--tx-muted)', margin: 0 }}>
                                Real-time academic health, student distribution, faculty engagement logs, and VTU exam synchronization for Anjuman Institute of Technology & Management.
                            </p>
                        </div>
                        <button style={{ ...c.actionBtn(false), display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-low)' }} onClick={handleReloadAllData} disabled={reloadingData}>
                            <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)', animation: reloadingData ? 'spin 1s linear infinite' : 'none' }}>refresh</span>
                            {reloadingData ? 'Reloading…' : 'Sync All Datasets'}
                        </button>
                    </div>

                    {/* Executive Metric Cards */}
                    <div className="gf-stats-grid" style={{ marginBottom: '32px' }}>
                        {[
                            { label: 'Total Enrolled Students', val: stats.students, sub: `${statusCounts.active} Active · ${statusCounts.pending} Awaiting`, icon: 'people', link: 'students' },
                            { label: 'VTU Academic Records', val: stats.totalMarks, sub: 'Synced University Results', icon: 'inventory_2', link: 'students' },
                            { label: 'Verified Teaching Faculty', val: stats.faculty, sub: `${requests.length} Registered Staff`, icon: 'badge', link: 'requests' },
                            { label: 'Monitored Classes', val: classesList.length, sub: 'Active Class Sections', icon: 'groups', link: 'classes' },
                            { label: 'Faculty Activity Logs', val: activityLogs.length, sub: `${stats.activityToday} Action(s) Today`, icon: 'history', link: 'activity' },
                            { label: 'Open Support Issues', val: openTicketsCount, warn: openTicketsCount > 0, sub: 'Pending Admin Inquiries', icon: 'support_agent', link: 'support' },
                        ].map(st => (
                            <div key={st.label} style={{ ...c.statCard, cursor: st.link ? 'pointer' : 'default', transition: 'all 0.15s ease' }} onClick={() => st.link && switchTab(st.link, { from: 'overview', title: 'Institutional Overview' })}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={c.statLabel}>{st.label}</div>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--tx-dim)', opacity: 0.4 }}>{st.icon}</span>
                                </div>
                                <div style={{ ...c.statVal, color: st.warn ? 'var(--amber)' : 'var(--tx-main)' }}>{loading ? '—' : st.val}</div>
                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '8px', fontWeight: 600 }}>{st.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* ── TWO-COLUMN ANALYTICS SECTION: Branch Matrix, Batches & Academic Telemetry ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: '24px', marginBottom: '32px', alignItems: 'start' }}>
                        
                        {/* Left Column: Department Matrix + Academic Admission Batches */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Branch Distribution Matrix */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: 900, color: 'var(--tx-main)', margin: 0, letterSpacing: '-0.02em' }}>Department & Branch Enrollment</h3>
                                        <p style={{ fontSize: '11px', color: 'var(--tx-muted)', margin: '4px 0 0 0' }}>Real student enrollment breakdown across 8 active engineering departments (559 Enrolled).</p>
                                    </div>
                                    <button style={{ ...c.actionBtn(false), padding: '6px 12px', fontSize: '11px' }} onClick={() => { setStudentBranchFilter('all'); setStudentBatchFilter('all'); setStudentSemFilter('all'); switchTab('students', { from: 'overview', title: 'Institutional Overview' }); }}>
                                        View All
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {branchBreakdown.map(([branch, count]) => {
                                        const pct = stats.students > 0 ? ((count / stats.students) * 100).toFixed(1) : 0;
                                        const code = branch.includes('Computer Science & Engineering') ? 'CSE'
                                            : branch.includes('AI & Machine Learning') ? 'AIML'
                                            : branch.includes('Data Science') ? 'DS'
                                            : branch.includes('Electronics & Communication') ? 'ECE'
                                            : branch.includes('Robotics') ? 'RAI'
                                            : branch.includes('Civil') ? 'CIVIL'
                                            : branch.includes('Electrical') ? 'EEE'
                                            : branch.includes('Mechanical') ? 'MECH' : 'ENG';

                                        return (
                                            <div
                                                key={branch}
                                                onClick={() => { setStudentBranchFilter(branch); switchTab('students', { from: 'overview', title: 'Institutional Overview', reason: branch }); }}
                                                style={{
                                                    background: 'var(--surface-low)',
                                                    border: '1px solid var(--border)',
                                                    borderRadius: '10px',
                                                    padding: '10px 14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.12s ease'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                            >
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{
                                                            fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                                                            background: 'rgba(23, 75, 77, 0.1)', color: 'var(--primary)'
                                                        }}>
                                                            {code}
                                                        </span>
                                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{branch}</div>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '13px', fontWeight: 900, color: 'var(--tx-main)' }}>{count}</span>
                                                        <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>({pct}%)</span>
                                                    </div>
                                                </div>
                                                <div style={{ width: '100%', height: '6px', background: 'var(--surface)', borderRadius: '999px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${pct}%`, height: '100%', background: 'var(--primary)', borderRadius: '999px' }} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Graduating Batches & Admission Cohorts */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '15px', fontWeight: 900, color: 'var(--tx-main)', margin: 0 }}>Academic Admission Batches</h3>
                                        <p style={{ fontSize: '11px', color: 'var(--tx-muted)', margin: '2px 0 0 0' }}>Graduating class standing derived from verified university enrollment.</p>
                                    </div>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>school</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
                                    {batchBreakdown.batches.map(b => (
                                        <div
                                            key={b.code}
                                            onClick={() => { setStudentBatchFilter(b.code); switchTab('students', { from: 'overview', title: 'Institutional Overview', reason: b.label }); }}
                                            style={{
                                                background: 'var(--surface-low)', border: '1px solid var(--border)',
                                                borderRadius: '10px', padding: '12px', cursor: 'pointer', transition: 'all 0.12s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                        >
                                            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>{b.academicYear} · {b.sem}</div>
                                            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{b.count} Students</div>
                                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>{b.label}</div>
                                        </div>
                                    ))}

                                    <div
                                        onClick={() => { setStudentBatchFilter('lateral'); switchTab('students', { from: 'overview', title: 'Institutional Overview', reason: 'Diploma Lateral Entry Cohort' }); }}
                                        style={{
                                            background: 'rgba(180, 83, 9, 0.05)', border: '1px solid rgba(180, 83, 9, 0.25)',
                                            borderRadius: '10px', padding: '12px', cursor: 'pointer', transition: 'all 0.12s ease'
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.borderColor = '#b45309'}
                                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(180, 83, 9, 0.25)'}
                                    >
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase' }}>Direct 2nd Year Entry</div>
                                        <div style={{ fontSize: '18px', fontWeight: 900, color: '#b45309', marginTop: '2px' }}>{batchBreakdown.lateralCount} Students</div>
                                        <div style={{ fontSize: '11px', fontWeight: 700, color: '#b45309', marginTop: '4px' }}>Diploma Lateral Cohort</div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Semesters, VTU Performance Telemetry & Faculty Stream */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Academic Semester Cohorts */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '16px', fontWeight: 900, color: 'var(--tx-main)', margin: 0, letterSpacing: '-0.02em' }}>Academic Semester Cohorts</h3>
                                        <p style={{ fontSize: '11px', color: 'var(--tx-muted)', margin: '4px 0 0 0' }}>Current student distribution per semester standing.</p>
                                    </div>
                                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>groups</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px' }}>
                                    {semesterBreakdown.map(([sem, count]) => (
                                        <div
                                            key={sem}
                                            onClick={() => { setStudentSemFilter(String(sem)); switchTab('students', { from: 'overview', title: 'Institutional Overview', reason: `Semester ${sem}` }); }}
                                            style={{
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '10px',
                                                padding: '12px 10px',
                                                textAlign: 'center',
                                                cursor: 'pointer',
                                                transition: 'all 0.12s ease'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                                            onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                                        >
                                            <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Semester {sem}</div>
                                            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px' }}>{count}</div>
                                            <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--primary)', marginTop: '4px' }}>View Students →</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* VTU Exam Academic Merit & Performance Telemetry (Real Verified Results) */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <h3 style={{ fontSize: '15px', fontWeight: 900, color: 'var(--tx-main)', margin: 0 }}>VTU Exam Performance Telemetry</h3>
                                            <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.1)', color: '#047857' }}>
                                                VERIFIED
                                            </span>
                                        </div>
                                        <p style={{ fontSize: '11px', color: 'var(--tx-muted)', margin: '2px 0 0 0' }}>
                                            Based on 3,505 university exam results & 16,951 subject marks.
                                        </p>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Inst. Avg SGPA</div>
                                        <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>6.53</div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div style={{ background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: '10px', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>Distinction (≥ 8.0)</div>
                                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#047857', marginTop: '2px' }}>152 <span style={{ fontSize: '11px', fontWeight: 600 }}> (27.2%)</span></div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-muted)', marginTop: '2px' }}>Dean's Honor Standing</div>
                                    </div>

                                    <div style={{ background: 'rgba(37, 99, 235, 0.06)', border: '1px solid rgba(37, 99, 235, 0.25)', borderRadius: '10px', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#1d4ed8', textTransform: 'uppercase' }}>First Class (6.75 - 7.99)</div>
                                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#1d4ed8', marginTop: '2px' }}>132 <span style={{ fontSize: '11px', fontWeight: 600 }}> (23.6%)</span></div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-muted)', marginTop: '2px' }}>Good Academic Standing</div>
                                    </div>

                                    <div style={{ background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.25)', borderRadius: '10px', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase' }}>Second Class (5.0 - 6.74)</div>
                                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#b45309', marginTop: '2px' }}>98 <span style={{ fontSize: '11px', fontWeight: 600 }}> (17.5%)</span></div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-muted)', marginTop: '2px' }}>Satisfactory Progress</div>
                                    </div>

                                    <div style={{ background: 'rgba(239, 68, 68, 0.06)', border: '1px solid rgba(239, 68, 68, 0.25)', borderRadius: '10px', padding: '10px 12px' }}>
                                        <div style={{ fontSize: '10px', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase' }}>Remedial Watch (&lt; 5.0)</div>
                                        <div style={{ fontSize: '16px', fontWeight: 900, color: '#b91c1c', marginTop: '2px' }}>109 <span style={{ fontSize: '11px', fontWeight: 600 }}> (19.5%)</span></div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-muted)', marginTop: '2px' }}>Backlog Remediation Alert</div>
                                    </div>
                                </div>
                            </div>

                            {/* Live Faculty Audit Telemetry Stream */}
                            <div style={c.statCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                    <div>
                                        <h3 style={{ fontSize: '15px', fontWeight: 900, color: 'var(--tx-main)', margin: 0 }}>Recent Faculty Activity</h3>
                                        <p style={{ fontSize: '11px', color: 'var(--tx-muted)', margin: '2px 0 0 0' }}>Real-time audit log of staff interactions.</p>
                                    </div>
                                    <button style={{ ...c.actionBtn(false), padding: '4px 10px', fontSize: '11px' }} onClick={() => switchTab('activity', { from: 'overview', title: 'Institutional Overview' })}>
                                        Full Log ({activityLogs.length})
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {activityLogs.slice(0, 4).map((log, i) => {
                                        const [bg, col] = getActionColor(log.action_type);
                                        const ts = log.created_at ? new Date(log.created_at) : null;
                                        return (
                                            <div key={log.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'var(--surface-low)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                                    <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: 800, background: bg, color: col, flexShrink: 0 }}>
                                                        {log.action_type}
                                                    </span>
                                                    <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {log.target_usn ? `${log.target_usn}` : (log.faculty_name || 'Faculty')}
                                                    </div>
                                                </div>
                                                <span style={{ fontSize: '10px', color: 'var(--tx-dim)', flexShrink: 0 }}>
                                                    {ts ? ts.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {activityLogs.length === 0 && (
                                        <div style={{ fontSize: '12px', color: 'var(--tx-dim)', textAlign: 'center', padding: '16px' }}>No faculty activity logged yet.</div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Recent Student Registrations Table */}
                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div>
                                <div style={c.tableTitle}>Recent Student Registrations & Dossiers</div>
                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>Showing latest students registered in the institution database.</div>
                            </div>
                            <button style={c.actionBtn(true)} onClick={() => switchTab('students', { from: 'overview', title: 'Institutional Overview' })}>View All {students.length} Students</button>
                        </div>
                        {!isMobile ? (
                            <table style={{ width: '100%', minWidth: '720px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>{['Student', 'USN', 'Branch', 'Semester', 'Scheme', 'Status', 'Action'].map(h => <th key={h} style={c.th}>{h}</th>)}</tr>
                                </thead>
                                <tbody>
                                    {students.slice(0, 6).map(s => (
                                        <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => openStudent(s)} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <td style={c.td}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <div style={c.avatar}>{((s.name || s.usn || '?')[0]).toUpperCase()}</div>
                                                    <span style={{ fontWeight: 800 }}>{s.name || 'Student'}</span>
                                                </div>
                                            </td>
                                            <td style={{ ...c.td, fontFamily: 'monospace', fontSize: '12px', color: 'var(--tx-muted)' }}>{s.usn}</td>
                                            <td style={c.td}>{s.branch || '—'}</td>
                                            <td style={c.td}>Semester {s.semester || '1'}</td>
                                            <td style={c.td}>{s.scheme || '2022'}</td>
                                            <td style={c.td}>
                                                {s.is_suspended ? (
                                                    <span style={c.badge('suspended')}>🔴 Suspended</span>
                                                ) : s.activated_at ? (
                                                    <span style={c.badge('active')}>🟢 Active</span>
                                                ) : (
                                                    <span style={c.badge('pending')}>🟡 Awaiting</span>
                                                )}
                                            </td>
                                            <td style={{ ...c.td, textAlign: 'right' }}>
                                                <button style={{ ...c.actionBtn(false), padding: '4px 10px', fontSize: '11px' }} onClick={e => { e.stopPropagation(); openStudent(s); }}>
                                                    Inspect Dossier
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {students.length === 0 && <tr><td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students registered yet.</td></tr>}
                                </tbody>
                            </table>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                                {students.slice(0, 6).map(s => (
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
                            <button
                                style={{ ...c.actionBtn(false), display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-low)' }}
                                onClick={handleSyncAllSemesters}
                                disabled={syncingSemesters}
                                title="Automatically synchronize and promote all students based on their latest VTU marks"
                            >
                                <span
                                    className="material-icons-round"
                                    style={{ fontSize: '16px', color: 'var(--primary)', animation: syncingSemesters ? 'spin 1s linear infinite' : 'none' }}
                                >
                                    sync
                                </span>
                                {syncingSemesters ? 'Syncing Semesters…' : 'Sync Semesters from Results'}
                            </button>
                            <button style={c.actionBtn(true)} onClick={() => setShowAddStudent(true)}>
                                <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '4px' }}>person_add</span>
                                Add Student
                            </button>
                        </div>
                    </div>

                    {/* Active Cohort / Branch / Batch Drill-down Banner */}
                    {(studentSemFilter !== 'all' || studentBranchFilter !== 'all' || studentBatchFilter !== 'all') && (
                        <div
                            className="gf-fade-up"
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'rgba(37, 99, 235, 0.07)',
                                border: '1px solid rgba(37, 99, 235, 0.28)',
                                borderRadius: '12px',
                                padding: '12px 18px',
                                marginBottom: '20px',
                                flexWrap: 'wrap',
                                gap: '12px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}>
                                    <span className="material-icons-round" style={{ fontSize: '20px' }}>filter_alt</span>
                                </div>
                                <div>
                                    <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>
                                        Active Cohort: {studentSemFilter !== 'all' ? `Semester ${studentSemFilter} Students` : ''} {studentBranchFilter !== 'all' ? `· ${studentBranchFilter}` : ''} {studentBatchFilter !== 'all' ? `· ${studentBatchFilter === 'lateral' ? 'Diploma Lateral Entries' : `Batch ${studentBatchFilter}`}` : ''}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                        Showing {filtered.length} student{filtered.length === 1 ? '' : 's'} matching current filter selection.
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => {
                                        setStudentSemFilter('all');
                                        setStudentBranchFilter('all');
                                        setStudentBatchFilter('all');
                                    }}
                                    style={{
                                        ...c.actionBtn(false),
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12px',
                                        padding: '7px 14px',
                                        background: 'var(--surface)',
                                    }}
                                    title="Reset filters and show all students in directory"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>clear</span>
                                    Show All Students
                                </button>
                                <button
                                    onClick={() => {
                                        setStudentSemFilter('all');
                                        setStudentBranchFilter('all');
                                        setStudentBatchFilter('all');
                                        switchTab('overview');
                                    }}
                                    style={{
                                        ...c.actionBtn(true),
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '12px',
                                        padding: '7px 14px',
                                    }}
                                    title="Clear cohort filter and return to Overview dashboard"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>arrow_back</span>
                                    Back to Overview
                                </button>
                            </div>
                        </div>
                    )}

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
                                    style={{ ...c.actionBtn(false), borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleBulkAction('bulk_promote')}
                                    disabled={studentActionBusy}
                                    title="Promote selected students by +1 Semester"
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>school</span>
                                    Promote (+1 Sem)
                                </button>
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
                                    style={{ ...c.searchInput, width: 'auto', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
                                >
                                    <option value="all">All Statuses ({statusCounts.all})</option>
                                    <option value="active">🟢 Active ({statusCounts.active})</option>
                                    <option value="pending">🟡 Awaiting Activation ({statusCounts.pending})</option>
                                    <option value="suspended">🔴 Suspended / Banned ({statusCounts.suspended})</option>
                                </select>

                                {/* Branch Filter */}
                                {availableBranches.length > 0 && (
                                    <select
                                        value={studentBranchFilter}
                                        onChange={e => setStudentBranchFilter(e.target.value)}
                                        style={{ ...c.searchInput, width: 'auto', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
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
                                    style={{ ...c.searchInput, width: 'auto', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
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
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('name')} title="Sort by Student Name">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Student
                                                {sortField === 'name' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('usn')} title="Sort by USN">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                USN
                                                {sortField === 'usn' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('semester')} title="Sort by Semester">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Semester
                                                {sortField === 'semester' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('branch')} title="Sort by Branch">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Branch
                                                {sortField === 'branch' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSort('status')} title="Sort by Status">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Access Status
                                                {sortField === 'status' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {sortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                        <div>
                            <h1 style={{ ...c.pageTitle, marginBottom: '4px' }}>Faculty Directory & Access Control</h1>
                            <p style={{ fontSize: '12px', color: 'var(--tx-muted)', margin: 0 }}>
                                Manage teaching staff credentials, monitor verification status, assign departments, reset access keys, and impose or lift institutional access bans.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button style={{ ...c.actionBtn(false), display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-low)' }} onClick={loadData} disabled={loading}>
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)', animation: loading ? 'spin 1s linear infinite' : 'none' }}>refresh</span>
                                {loading ? 'Reloading…' : 'Reload'}
                            </button>
                            <button style={{ ...c.actionBtn(false), display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--surface-low)' }} onClick={() => switchTab('assignments')}>
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>assignment_ind</span>
                                Subject Assignments
                            </button>
                            <button style={c.actionBtn(true)} onClick={() => setShowAddFaculty(true)}>
                                <span className="material-icons-round" style={{ fontSize: '15px', verticalAlign: 'middle', marginRight: '4px' }}>person_add</span>
                                Onboard Faculty Member
                            </button>
                        </div>
                    </div>

                    {/* Faculty KPI Metric Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                        <div style={c.statCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Total Faculty</span>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>groups</span>
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '6px' }}>{requests.length}</div>
                        </div>
                        <div style={c.statCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--green)', textTransform: 'uppercase' }}>Active / Approved</span>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--green)' }}>verified</span>
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--green)', marginTop: '6px' }}>{statusCountsFaculty.approved}</div>
                        </div>
                        <div style={c.statCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--amber)', textTransform: 'uppercase' }}>Pending Verification</span>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--amber)' }}>pending_actions</span>
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--amber)', marginTop: '6px' }}>{statusCountsFaculty.pending}</div>
                        </div>
                        <div style={c.statCard}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--red)', textTransform: 'uppercase' }}>Suspended / Frozen</span>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--red)' }}>block</span>
                            </div>
                            <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--red)', marginTop: '6px' }}>{statusCountsFaculty.suspended}</div>
                        </div>
                    </div>

                    {/* Action notification toast */}
                    {facultyActionMsg && (
                        <div className="gf-fade-up" style={{ padding: '12px 16px', background: 'var(--surface-low)', border: '1px solid var(--primary)', borderRadius: '12px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>
                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>info</span>
                            <span>{facultyActionMsg}</span>
                        </div>
                    )}

                    {/* Batch Selection Action Bar */}
                    {selectedFacultyIds.size > 0 && (
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
                                    {selectedFacultyIds.size} Faculty Member{selectedFacultyIds.size > 1 ? 's' : ''} Selected
                                </span>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                <button
                                    style={{ ...c.actionBtn(false), borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => setConfirmingBulkSuspendFaculty(true)}
                                    disabled={facultyActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>block</span>
                                    Ban / Suspend Selected
                                </button>
                                <button
                                    style={{ ...c.actionBtn(false), borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleBulkFacultyAction('bulk_restore')}
                                    disabled={facultyActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>restore</span>
                                    Approve / Restore Selected
                                </button>
                                <button
                                    style={{ ...c.actionBtn(false), borderColor: 'var(--red)', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => setConfirmingBulkDeleteFaculty(true)}
                                    disabled={facultyActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>delete_forever</span>
                                    Delete Selected
                                </button>
                                <button
                                    style={{ ...c.actionBtn(false), padding: '6px 12px', fontSize: '11px' }}
                                    onClick={() => setSelectedFacultyIds(new Set())}
                                >
                                    Deselect
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Table Wrap */}
                    <div style={c.tableWrap}>
                        {/* Filters & Search Header */}
                        <div style={{ ...c.tableHead, gap: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1 1 240px', minWidth: '200px' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>search</span>
                                <input
                                    style={{ ...c.searchInput, width: '100%', flex: 1, border: 'none', background: 'transparent', padding: '6px 0' }}
                                    placeholder="Search by Faculty Name, Email, Employee ID..."
                                    value={facultySearch}
                                    onChange={e => setFacultySearch(e.target.value)}
                                />
                                {facultySearch && (
                                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-dim)', display: 'flex', alignItems: 'center', padding: '2px' }} onClick={() => setFacultySearch('')}>
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                                    </button>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                                {/* Status Filter */}
                                <select
                                    value={facultyStatusFilter}
                                    onChange={e => setFacultyStatusFilter(e.target.value)}
                                    style={{ ...c.searchInput, width: 'auto', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
                                >
                                    <option value="all">All Statuses ({statusCountsFaculty.all})</option>
                                    <option value="approved">🟢 Approved / Active ({statusCountsFaculty.approved})</option>
                                    <option value="pending">🟡 Pending Verification ({statusCountsFaculty.pending})</option>
                                    <option value="suspended">🔴 Suspended / Frozen ({statusCountsFaculty.suspended})</option>
                                </select>

                                {/* Department Filter */}
                                {availableFacultyDepts.length > 0 && (
                                    <select
                                        value={facultyDeptFilter}
                                        onChange={e => setFacultyDeptFilter(e.target.value)}
                                        style={{ ...c.searchInput, width: 'auto', padding: '7px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 700 }}
                                    >
                                        <option value="all">All Departments</option>
                                        {availableFacultyDepts.map(d => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                        </div>

                        {/* Desktop Table */}
                        {!isMobile ? (
                            <table style={{ width: '100%', minWidth: '820px', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ ...c.th, width: '40px', padding: '14px 16px', textAlign: 'center' }}>
                                            <input
                                                type="checkbox"
                                                checked={filteredFaculty.length > 0 && selectedFacultyIds.size === filteredFaculty.length}
                                                onChange={handleSelectAllFaculty}
                                                style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                                title="Select / Deselect all matching faculty"
                                            />
                                        </th>
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSortFaculty('full_name')} title="Sort by Name">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Faculty Member
                                                {facultySortField === 'full_name' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {facultySortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSortFaculty('department')} title="Sort by Department">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Department & Role
                                                {facultySortField === 'department' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {facultySortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSortFaculty('employee_id')} title="Sort by Employee ID">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Employee ID
                                                {facultySortField === 'employee_id' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {facultySortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                        <th style={c.th}>Access Key</th>
                                        <th style={{ ...c.th, cursor: 'pointer', userSelect: 'none' }} onClick={() => handleSortFaculty('status')} title="Sort by Status">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                Access Status
                                                {facultySortField === 'status' && (
                                                    <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>
                                                        {facultySortDirection === 'asc' ? 'arrow_upward' : 'arrow_downward'}
                                                    </span>
                                                )}
                                            </div>
                                        </th>
                                        <th style={{ ...c.th, textAlign: 'right', paddingRight: '20px' }}>Administrative Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredFaculty.map(r => {
                                        const isSelected = selectedFacultyIds.has(r.id);
                                        return (
                                            <tr
                                                key={r.id}
                                                style={{
                                                    cursor: 'pointer',
                                                    background: isSelected ? 'var(--surface-low)' : (r.status === 'suspended' ? 'rgba(239, 68, 68, 0.03)' : 'transparent'),
                                                    transition: 'background 0.12s ease'
                                                }}
                                                onClick={() => setSelectedFaculty(r)}
                                                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-low)'; }}
                                                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = r.status === 'suspended' ? 'rgba(239, 68, 68, 0.03)' : 'transparent'; }}
                                            >
                                                <td style={{ ...c.td, width: '40px', padding: '16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={e => handleToggleFacultySelection(r.id, e)}
                                                        style={{ cursor: 'pointer', width: '15px', height: '15px' }}
                                                    />
                                                </td>
                                                <td style={c.td}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <div style={c.avatar}>{((r.full_name || '?')[0]).toUpperCase()}</div>
                                                        <div>
                                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{r.full_name}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)' }}>{r.email}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={c.td}>
                                                    <div style={{ fontWeight: 700, fontSize: '12px' }}>{r.department || 'General'}</div>
                                                    <div style={{ fontSize: '10px', color: 'var(--tx-muted)', textTransform: 'uppercase', fontWeight: 800 }}>{r.designation || 'Faculty'}</div>
                                                </td>
                                                <td style={c.td}>
                                                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: r.employee_id ? 'var(--tx-main)' : 'var(--tx-dim)', fontWeight: r.employee_id ? 700 : 400 }}>
                                                        {r.employee_id || 'ID PENDING'}
                                                    </span>
                                                </td>
                                                <td style={{ ...c.td, fontFamily: 'monospace', fontSize: '11px' }} onClick={e => e.stopPropagation()}>
                                                    {r.generated_access_key ? (
                                                        <button
                                                            style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'monospace', fontSize: '11px', color: 'var(--tx-main)' }}
                                                            onClick={() => copyKey(r.generated_access_key)}
                                                            title="Click to copy access key"
                                                        >
                                                            {r.generated_access_key}
                                                            <span className="material-icons-round" style={{ fontSize: '13px', color: copiedKey === r.generated_access_key ? '#16A34A' : 'var(--tx-dim)' }}>
                                                                {copiedKey === r.generated_access_key ? 'check' : 'content_copy'}
                                                            </span>
                                                        </button>
                                                    ) : (
                                                        <span style={{ color: 'var(--tx-dim)' }}>—</span>
                                                    )}
                                                </td>
                                                <td style={c.td}>
                                                    {r.status === 'suspended' ? (
                                                        <span style={c.badge('suspended')}>🔴 Suspended</span>
                                                    ) : r.status === 'approved' ? (
                                                        <span style={c.badge('approved')}>🟢 Approved</span>
                                                    ) : (
                                                        <span style={c.badge('pending')}>🟡 Pending</span>
                                                    )}
                                                </td>
                                                <td style={{ ...c.td, textAlign: 'right', paddingRight: '20px' }} onClick={e => e.stopPropagation()}>
                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                                                        {/* Inspect */}
                                                        <button
                                                            style={{ ...c.actionBtn(false), padding: '6px 10px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            onClick={() => setSelectedFaculty(r)}
                                                            title="Inspect Faculty Profile & Assigned Classes"
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>visibility</span>
                                                            Inspect
                                                        </button>

                                                        {/* Suspend / Restore */}
                                                        {r.status === 'suspended' ? (
                                                            <button
                                                                style={{ ...c.actionBtn(false), padding: '6px 10px', borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                onClick={() => handleToggleSuspendFaculty(r)}
                                                                disabled={facultyActionBusy}
                                                                title="Restore Faculty Access"
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>restore</span>
                                                                Unban
                                                            </button>
                                                        ) : r.status === 'pending' ? (
                                                            <button
                                                                style={{ ...c.actionBtn(true), padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                onClick={() => handleToggleSuspendFaculty(r, 'Account approved.')}
                                                                disabled={facultyActionBusy}
                                                                title="Approve Faculty Access"
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>check_circle</span>
                                                                Approve
                                                            </button>
                                                        ) : (
                                                            <button
                                                                style={{ ...c.actionBtn(false), padding: '6px 10px', borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                                onClick={() => setConfirmingSuspendFaculty(r)}
                                                                disabled={facultyActionBusy}
                                                                title="Suspend / Ban Faculty Access"
                                                            >
                                                                <span className="material-icons-round" style={{ fontSize: '15px' }}>block</span>
                                                                Ban
                                                            </button>
                                                        )}

                                                        {/* Regen Key */}
                                                        <button
                                                            style={{ ...c.actionBtn(false), padding: '6px 8px', borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            onClick={() => setConfirmingRegenKeyFaculty(r)}
                                                            disabled={facultyActionBusy}
                                                            title="Regenerate Access Key & Reset Password"
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>key</span>
                                                        </button>

                                                        {/* Edit */}
                                                        <button
                                                            style={{ ...c.actionBtn(false), padding: '6px 8px', borderColor: 'var(--border)', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            onClick={() => setEditingFaculty({ ...r })}
                                                            disabled={facultyActionBusy}
                                                            title="Edit Faculty Profile"
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>edit</span>
                                                        </button>

                                                        {/* Delete */}
                                                        <button
                                                            style={{ ...c.actionBtn(false), padding: '6px 8px', borderColor: 'var(--border)', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                                            onClick={() => setConfirmingDeleteFaculty(r)}
                                                            disabled={facultyActionBusy}
                                                            title="Delete Faculty Member"
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '15px' }}>delete_outline</span>
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredFaculty.length === 0 && (
                                        <tr>
                                            <td colSpan="7" style={{ padding: '60px', textAlign: 'center', color: 'var(--tx-dim)', fontStyle: 'italic' }}>
                                                No faculty members matching your filter criteria.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            /* Mobile Cards */
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '12px' }}>
                                {filteredFaculty.map(r => {
                                    const isSelected = selectedFacultyIds.has(r.id);
                                    return (
                                        <div
                                            key={r.id}
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
                                            onClick={() => setSelectedFaculty(r)}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={e => handleToggleFacultySelection(r.id, e)}
                                                        onClick={e => e.stopPropagation()}
                                                        style={{ cursor: 'pointer', width: '16px', height: '16px', flexShrink: 0 }}
                                                    />
                                                    <div style={c.avatar}>{((r.full_name || '?')[0]).toUpperCase()}</div>
                                                    <div style={{ minWidth: 0 }}>
                                                        <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.full_name}</div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', wordBreak: 'break-all' }}>{r.email}</div>
                                                    </div>
                                                </div>
                                                <span style={c.badge(r.status)}>{r.status?.toUpperCase()}</span>
                                            </div>

                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--surface)', padding: '8px 10px', borderRadius: '8px', fontSize: '11px', border: '1px solid var(--border)' }}>
                                                <div><span style={{ color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase', fontSize: '9px' }}>Dept:</span> {r.department || '—'}</div>
                                                <div><span style={{ color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase', fontSize: '9px' }}>Emp ID:</span> {r.employee_id || 'PENDING'}</div>
                                            </div>

                                            {/* Mobile Card Action Buttons */}
                                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', borderTop: '1px solid var(--border)', paddingTop: '10px' }} onClick={e => e.stopPropagation()}>
                                                <button style={{ ...c.actionBtn(false), flex: 1, padding: '6px 8px', fontSize: '11px', textAlign: 'center' }} onClick={() => setSelectedFaculty(r)}>
                                                    Inspect
                                                </button>
                                                {r.status === 'suspended' ? (
                                                    <button style={{ ...c.actionBtn(false), flex: 1, padding: '6px 8px', fontSize: '11px', borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)' }} onClick={() => handleToggleSuspendFaculty(r)}>
                                                        Unban
                                                    </button>
                                                ) : r.status === 'pending' ? (
                                                    <button style={{ ...c.actionBtn(true), flex: 1, padding: '6px 8px', fontSize: '11px' }} onClick={() => handleToggleSuspendFaculty(r, 'Approved.')}>
                                                        Approve
                                                    </button>
                                                ) : (
                                                    <button style={{ ...c.actionBtn(false), flex: 1, padding: '6px 8px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)' }} onClick={() => setConfirmingSuspendFaculty(r)}>
                                                        Ban
                                                    </button>
                                                )}
                                                <button style={{ ...c.actionBtn(false), padding: '6px 10px', fontSize: '11px', borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)' }} onClick={() => setConfirmingRegenKeyFaculty(r)} title="Regen Key">
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>key</span>
                                                </button>
                                                <button style={{ ...c.actionBtn(false), padding: '6px 10px', fontSize: '11px', borderColor: 'var(--border)', color: 'var(--tx-muted)' }} onClick={() => setEditingFaculty({ ...r })} title="Edit">
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>edit</span>
                                                </button>
                                                <button style={{ ...c.actionBtn(false), padding: '6px 10px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)' }} onClick={() => setConfirmingDeleteFaculty(r)} title="Delete">
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                                {filteredFaculty.length === 0 && <div style={{ padding: '30px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px', fontStyle: 'italic' }}>No matching faculty members found.</div>}
                            </div>
                        )}
                    </div>
                </>}

                {tab === 'activity' && <>
                    <div style={c.pageLabel}>Faculty Academic Operations</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                        <div>
                            <h1 style={{ ...c.pageTitle, marginBottom: '4px' }}>Faculty Activity Log</h1>
                            <p style={{ margin: 0, fontSize: '13px', color: 'var(--tx-muted)' }}>
                                Real-time pedagogical audit trail of faculty marks uploads, attendance entries, student profile lookups, and class roster syncs.
                            </p>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                style={{ ...c.actionBtn(false), display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                                onClick={handleExportFacultyCSV}
                                title="Download faculty activity report as CSV"
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>file_download</span>
                                Export CSV
                            </button>
                            <button style={c.actionBtn(false)} onClick={loadData}>
                                <span className="material-icons-round" style={{ fontSize: '14px', verticalAlign: 'middle', marginRight: '4px' }}>refresh</span>
                                Refresh
                            </button>
                        </div>
                    </div>

                    {/* KPI Stat Overview Cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Total Actions Logged</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--tx-main)', marginTop: '2px' }}>{filteredActivity.length}</div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>All recorded faculty interactions</div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--primary)', textTransform: 'uppercase' }}>Actions Today</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>{stats.activityToday || 0}</div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>Activity in current 24h window</div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#b45309', textTransform: 'uppercase' }}>Active Faculty</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#b45309', marginTop: '2px' }}>{activeFacultyCount}</div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>Contributing instructors</div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 16px' }}>
                            <div style={{ fontSize: '11px', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>Sync Success Rate</div>
                            <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#047857', marginTop: '2px' }}>{successRate}%</div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '2px' }}>Operational sync health</div>
                        </div>
                    </div>

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
                        {(activitySearch || activityTypeFilter !== 'all' || activityDateFilter !== 'all') && (
                            <button
                                style={{ ...c.actionBtn(false), padding: '6px 12px', fontSize: '12px' }}
                                onClick={() => {
                                    setActivitySearch('');
                                    setActivityTypeFilter('all');
                                    setActivityDateFilter('all');
                                }}
                            >
                                ✕ Reset
                            </button>
                        )}
                    </div>

                    <div style={c.tableWrap}>
                        <div style={c.tableHead}>
                            <div style={c.tableTitle}>Faculty Pedagogical Action Records</div>
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

                {tab === 'assignments' && <FacultyAssignmentsContent embedded={true} />}

                {tab === 'support' && <SupportTicketsContent onStatsUpdate={(s) => setOpenTicketsCount(s?.open || 0)} />}

                {tab === 'audit' && <AuditLogContent />}

                {tab === 'analytics' && (
                    <AnalyticsFiltersProvider>
                        <AdminAnalyticsPage />
                    </AnalyticsFiltersProvider>
                )}

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
                                        onClick={() => switchTab('requests', { from: 'settings', title: 'Settings' })}
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
                                        onClick={() => switchTab('students', { from: 'settings', title: 'Settings' })}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>school</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Student Directory & Marks</span>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>chevron_right</span>
                                    </button>

                                    <button
                                        onClick={() => switchTab('classes', { from: 'settings', title: 'Settings' })}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--green)' }}>groups</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Class & Section Management</span>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>chevron_right</span>
                                    </button>

                                    <button
                                        onClick={() => switchTab('analytics', { from: 'settings', title: 'Settings' })}
                                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', transition: 'all 0.15s' }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--blue)' }}>analytics</span>
                                            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>Institutional Analytics</span>
                                        </div>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>chevron_right</span>
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
                        {/* Drawer Top Navigation Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border)', width: '100%' }}>
                            <button
                                onClick={() => setSelectedStudent(null)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    background: 'var(--surface-low)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--tx-main)',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--primary)';
                                    e.currentTarget.style.color = 'var(--primary)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.color = 'var(--tx-main)';
                                }}
                                title="Close dossier and return to student directory"
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                                <span>Back to Student Directory</span>
                            </button>
                            <button
                                onClick={() => setSelectedStudent(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
                                title="Close (Esc)"
                            >
                                <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '20px', minWidth: 0, flex: 1 }}>
                                <div style={{ ...c.avatar, width: isMobile ? '48px' : '64px', height: isMobile ? '48px' : '64px', fontSize: isMobile ? '18px' : '22px', borderRadius: '14px' }}>
                                    {((selectedStudent.name || selectedStudent.usn || '?')[0]).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <h2 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedStudent.name || 'Student'}</h2>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                                        {selectedStudent.usn} · {selectedStudent.branch || 'Unassigned'}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Current Semester:</span>
                                        <select
                                            value={selectedStudent.semester || 1}
                                            onChange={e => handleUpdateStudentSemester(selectedStudent, e.target.value)}
                                            style={{ ...c.searchInput, width: 'auto', padding: '4px 10px', fontSize: '12px', fontWeight: 800, cursor: 'pointer' }}
                                        >
                                            {[1, 2, 3, 4, 5, 6, 7, 8].map(sm => (
                                                <option key={sm} value={sm}>Semester {sm}</option>
                                            ))}
                                        </select>
                                        <button
                                            style={{ ...c.actionBtn(false), padding: '4px 10px', fontSize: '11px', borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', gap: '3px' }}
                                            onClick={() => handleUpdateStudentSemester(selectedStudent, Math.min((Number(selectedStudent.semester) || 1) + 1, 8))}
                                            disabled={Number(selectedStudent.semester) >= 8 || studentActionBusy}
                                            title="Promote student to next academic semester"
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '13px' }}>school</span>
                                            +1 Promote
                                        </button>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '6px' }}>
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
                                {detailError ? (
                                    <div style={{ padding: '60px 20px', textAlign: 'center' }}>
                                        <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--red)' }}>error_outline</span>
                                        <div style={{ marginTop: '12px', fontSize: '14px', fontWeight: 800, color: 'var(--red)' }}>Failed to load academic records</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '4px' }}>{detailError}</div>
                                        <button
                                            style={{ ...c.actionBtn(false), marginTop: '16px' }}
                                            onClick={() => openStudent(selectedStudent)}
                                        >
                                            Retry
                                        </button>
                                    </div>
                                ) : !studentDetails ? (
                                    <div style={{ padding: '60px 20px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                        <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--primary)', animation: 'spin 1s linear infinite' }}>sync</span>
                                        <div style={{ marginTop: '12px', fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>Compiling VTU Academic Dossier…</div>
                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '4px' }}>Calculating cumulative GPA, earned credits, and active standing</div>
                                    </div>
                                ) : (
                                    <>
                                        {/* Academic Intelligence Dossier Summary */}
                                        {studentDetails.academic && (
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)',
                                                gap: '12px',
                                                width: '100%',
                                                boxSizing: 'border-box'
                                            }}>
                                                <div style={{ ...c.statCard, padding: '14px 16px', background: 'var(--surface-low)' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cumulative GPA</div>
                                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginTop: '4px' }}>
                                                        <span style={{ fontSize: '24px', fontWeight: 900, color: studentDetails.academic.cgpa >= 7.75 ? 'var(--green)' : studentDetails.academic.cgpa >= 6.75 ? 'var(--primary)' : studentDetails.academic.cgpa >= 5.0 ? 'var(--amber)' : 'var(--red)' }}>
                                                            {studentDetails.academic.cgpa.toFixed(2)}
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 700 }}>/ 10.0</span>
                                                    </div>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, marginTop: '4px', color: studentDetails.academic.cgpa >= 7.75 ? 'var(--green)' : studentDetails.academic.cgpa >= 6.75 ? 'var(--primary)' : 'var(--tx-muted)' }}>
                                                        {studentDetails.academic.cgpa >= 7.75 ? '⭐ First Class Distinction' : studentDetails.academic.cgpa >= 6.75 ? '✓ First Class' : studentDetails.academic.cgpa >= 5.75 ? 'Second Class' : 'Pass Standing'}
                                                    </div>
                                                </div>

                                                <div style={{ ...c.statCard, padding: '14px 16px', background: 'var(--surface-low)' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Active Backlogs</div>
                                                    <div style={{ fontSize: '24px', fontWeight: 900, color: studentDetails.academic.totalActiveBacklogs === 0 ? 'var(--green)' : 'var(--red)', marginTop: '4px' }}>
                                                        {studentDetails.academic.totalActiveBacklogs}
                                                    </div>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, marginTop: '4px', color: studentDetails.academic.totalActiveBacklogs === 0 ? 'var(--green)' : 'var(--red)' }}>
                                                        {studentDetails.academic.totalActiveBacklogs === 0 ? '🟢 Clean Standing' : `⚠️ ${studentDetails.academic.totalActiveBacklogs} Failed Course(s)`}
                                                    </div>
                                                </div>

                                                <div style={{ ...c.statCard, padding: '14px 16px', background: 'var(--surface-low)' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Credits Earned</div>
                                                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '4px' }}>
                                                        {studentDetails.academic.totalEarnedCredits} <span style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 600 }}>/ {studentDetails.academic.totalRegisteredCredits}</span>
                                                    </div>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, marginTop: '4px', color: 'var(--tx-dim)' }}>
                                                        {studentDetails.academic.totalRegisteredCredits > 0 ? `${((studentDetails.academic.totalEarnedCredits / studentDetails.academic.totalRegisteredCredits) * 100).toFixed(0)}% Completed` : 'N/A'}
                                                    </div>
                                                </div>

                                                <div style={{ ...c.statCard, padding: '14px 16px', background: 'var(--surface-low)' }}>
                                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Curriculum Records</div>
                                                    <div style={{ fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)', marginTop: '4px' }}>
                                                        {studentDetails.marks.length}
                                                    </div>
                                                    <div style={{ fontSize: '10px', fontWeight: 700, marginTop: '4px', color: 'var(--tx-dim)' }}>
                                                        {Object.keys(groupedMarks).length} Semesters Synced
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Backlog subjects alert banner */}
                                        {studentDetails.academic?.activeBacklogSubjects?.length > 0 && (
                                            <div style={{ padding: '12px 16px', background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: '10px', marginBottom: '8px' }}>
                                                <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span className="material-icons-round" style={{ fontSize: '16px' }}>error</span>
                                                    Active Backlog Courses Requiring Re-examination:
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                                                    {studentDetails.academic.activeBacklogSubjects.map(s => (
                                                        <span key={s.subjectCode || s.subject_code} style={{ background: 'var(--surface)', border: '1px solid var(--red)', padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 700, color: 'var(--red)', fontFamily: 'monospace' }}>
                                                            {s.subjectCode || s.subject_code} ({s.subjectName || s.subject_name || 'Course'}) · Sem {s.semester}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Semester Breakdown Cards */}
                                        {Object.keys(groupedMarks).length > 0 ? (
                                            Object.entries(groupedMarks).sort(([a], [b]) => Number(a) - Number(b)).map(([sem, marks]) => {
                                                const semStat = studentDetails.academic?.semStats?.[sem];
                                                const semSgpa = semStat?.sgpa !== undefined ? semStat.sgpa.toFixed(2) : calcSGPA(marks);
                                                const backlogsInSem = semStat ? semStat.backlogs : marks.filter(m => (m.grade || '').toUpperCase() === 'F').length;

                                                return (
                                                    <div key={sem} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', overflow: 'hidden' }}>
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 18px', background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: '10px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                <span style={{ fontSize: '14px', fontWeight: 900, color: 'var(--tx-main)' }}>Semester {sem}</span>
                                                                <span style={c.badge(backlogsInSem === 0 ? 'approved' : 'rejected')}>
                                                                    {backlogsInSem === 0 ? 'ALL CLEAR' : `${backlogsInSem} BACKLOG(S)`}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                                                {semStat && (
                                                                    <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 700 }}>
                                                                        Credits: <strong>{semStat.earnedCredits} / {semStat.totalCredits}</strong>
                                                                    </span>
                                                                )}
                                                                <div style={{ fontSize: '13px', fontWeight: 900, color: 'var(--primary)', background: 'var(--surface)', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: '8px' }}>
                                                                    SGPA: {semSgpa}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {!isMobile ? (
                                                            <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                                                <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse' }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={{ ...c.th, padding: '10px 16px' }}>Subject</th>
                                                                            <th style={{ ...c.th, padding: '10px 16px', textAlign: 'center' }}>Credits</th>
                                                                            <th style={{ ...c.th, padding: '10px 16px', textAlign: 'center' }}>CIE</th>
                                                                            <th style={{ ...c.th, padding: '10px 16px', textAlign: 'center' }}>SEE</th>
                                                                            <th style={{ ...c.th, padding: '10px 16px', textAlign: 'center' }}>Total</th>
                                                                            <th style={{ ...c.th, padding: '10px 16px', textAlign: 'center' }}>Grade</th>
                                                                            <th style={{ ...c.th, padding: '10px 16px', textAlign: 'center' }}>Points</th>
                                                                            <th style={{ ...c.th, padding: '10px 16px', textAlign: 'center' }}>Result</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {marks.map(m => {
                                                                            const isFail = (m.grade || '').toUpperCase() === 'F';
                                                                            return (
                                                                                <tr key={m.id || m.subject_code} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-low)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                                                                    <td style={{ ...c.td, padding: '12px 16px' }}>
                                                                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{m.subject_name || m.subjectCode}</div>
                                                                                        <div style={{ fontSize: '11px', fontFamily: 'monospace', color: 'var(--tx-muted)', marginTop: '2px' }}>{m.subject_code || m.subjectCode}</div>
                                                                                    </td>
                                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center', fontWeight: 700, color: 'var(--tx-muted)' }}>
                                                                                        {m.credits ?? '—'}
                                                                                    </td>
                                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center', fontFamily: 'monospace' }}>
                                                                                        {m.cie_marks ?? m.internal ?? '—'}
                                                                                    </td>
                                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center', fontFamily: 'monospace' }}>
                                                                                        {m.see_marks ?? m.external ?? '—'}
                                                                                    </td>
                                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center', fontWeight: 800, fontFamily: 'monospace' }}>
                                                                                        {m.total_marks ?? m.total ?? '—'}
                                                                                    </td>
                                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center' }}>
                                                                                        <span style={c.badge(isFail ? 'rejected' : 'approved')}>
                                                                                            {m.grade || '—'}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center', fontWeight: 800, color: isFail ? 'var(--red)' : 'var(--tx-main)' }}>
                                                                                        {m.grade_points ?? (m.gradePoint !== undefined ? m.gradePoint : '—')}
                                                                                    </td>
                                                                                    <td style={{ ...c.td, padding: '12px 16px', textAlign: 'center' }}>
                                                                                        <span style={{ fontSize: '11px', fontWeight: 800, color: isFail ? 'var(--red)' : 'var(--green)' }}>
                                                                                            {isFail ? 'FAIL' : 'PASS'}
                                                                                        </span>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px' }}>
                                                                {marks.map(m => {
                                                                    const isFail = (m.grade || '').toUpperCase() === 'F';
                                                                    return (
                                                                        <div key={m.id || m.subject_code} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                                                                            <div style={{ minWidth: 0 }}>
                                                                                <div style={{ fontWeight: 800, fontSize: '12px', color: 'var(--tx-main)' }}>{m.subject_name || m.subjectCode}</div>
                                                                                <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-muted)', marginTop: '2px' }}>{m.subject_code || m.subjectCode} · Cr: {m.credits ?? '—'}</div>
                                                                                <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '2px' }}>CIE: {m.cie_marks ?? m.internal ?? '—'} | SEE: {m.see_marks ?? m.external ?? '—'}</div>
                                                                            </div>
                                                                            <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                                <div style={{ fontSize: '13px', fontWeight: 900 }}>{m.total_marks ?? m.total ?? '—'}</div>
                                                                                <span style={c.badge(isFail ? 'rejected' : 'approved')}>{m.grade || '—'}</span>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        ) : (
                                            <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>No marks synced for this student.</div>
                                        )}
                                    </>
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
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', margin: 0, letterSpacing: '-0.03em' }}>Add New Student</h2>
                            <button
                                onClick={() => setShowAddStudent(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}
                                title="Close (Esc)"
                            >
                                <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                            </button>
                        </div>
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

            {/* ══════════════════════════════════════════════════════
                FACULTY DETAIL DRAWER & MODALS
            ══════════════════════════════════════════════════════ */}

            {/* FACULTY DETAIL DRAWER */}
            {selectedFaculty && (
                <div style={c.overlay} onClick={e => { if (e.target === e.currentTarget) setSelectedFaculty(null); }}>
                    <div style={c.drawer} className="gf-fade-up">
                        {/* Faculty Drawer Top Navigation Bar */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '14px', borderBottom: '1px solid var(--border)', width: '100%' }}>
                            <button
                                onClick={() => setSelectedFaculty(null)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '6px 14px',
                                    borderRadius: '8px',
                                    background: 'var(--surface-low)',
                                    border: '1px solid var(--border)',
                                    color: 'var(--tx-main)',
                                    fontSize: '12px',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                }}
                                onMouseEnter={e => {
                                    e.currentTarget.style.borderColor = 'var(--primary)';
                                    e.currentTarget.style.color = 'var(--primary)';
                                }}
                                onMouseLeave={e => {
                                    e.currentTarget.style.borderColor = 'var(--border)';
                                    e.currentTarget.style.color = 'var(--tx-main)';
                                }}
                                title="Close dossier and return to faculty directory"
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                                <span>Back to Faculty Directory</span>
                            </button>
                            <button
                                onClick={() => setSelectedFaculty(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', padding: '6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}
                                title="Close (Esc)"
                            >
                                <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', width: '100%', boxSizing: 'border-box' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '20px', minWidth: 0, flex: 1 }}>
                                <div style={{ ...c.avatar, width: isMobile ? '48px' : '64px', height: isMobile ? '48px' : '64px', fontSize: isMobile ? '18px' : '22px', borderRadius: '14px' }}>
                                    {((selectedFaculty.full_name || '?')[0]).toUpperCase()}
                                </div>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                    <h2 style={{ fontSize: 'clamp(18px, 4vw, 24px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {selectedFaculty.full_name}
                                    </h2>
                                    <div style={{ fontSize: '12px', color: 'var(--tx-muted)', fontFamily: 'monospace', overflowWrap: 'anywhere' }}>
                                        {selectedFaculty.email} · {selectedFaculty.department || 'General'}
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span>Role: <strong>{selectedFaculty.designation || 'Assistant Professor'}</strong></span>
                                        <span>•</span>
                                        <span>Emp ID: <strong>{selectedFaculty.employee_id || 'ID PENDING'}</strong></span>
                                        <span>•</span>
                                        <span>
                                            {selectedFaculty.status === 'suspended' ? (
                                                <span style={c.badge('suspended')}>🔴 Suspended</span>
                                            ) : selectedFaculty.status === 'approved' ? (
                                                <span style={c.badge('approved')}>🟢 Approved</span>
                                            ) : (
                                                <span style={c.badge('pending')}>🟡 Pending Verification</span>
                                            )}
                                        </span>
                                    </div>
                                    {selectedFaculty.status === 'suspended' && (
                                        <div style={{ fontSize: '11px', color: 'var(--red)', background: 'var(--red-bg)', padding: '6px 10px', borderRadius: '8px', marginTop: '6px', border: '1px solid var(--red)' }}>
                                            <strong>Suspension Reason:</strong> {selectedFaculty.suspended_reason || 'Administrative access freeze.'}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: '44px', minHeight: '44px', flexShrink: 0 }} onClick={() => setSelectedFaculty(null)}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>close</span>
                            </button>
                        </div>

                        {/* Access Key Display Card */}
                        <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Institutional Access Key</div>
                                <div style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: 900, color: 'var(--tx-main)', marginTop: '2px', letterSpacing: '0.05em' }}>
                                    {selectedFaculty.generated_access_key || 'NO KEY ASSIGNED'}
                                </div>
                            </div>
                            {selectedFaculty.generated_access_key && (
                                <button
                                    style={{ ...c.actionBtn(false), display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }}
                                    onClick={() => copyKey(selectedFaculty.generated_access_key)}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: copiedKey === selectedFaculty.generated_access_key ? 'var(--green)' : 'var(--tx-main)' }}>
                                        {copiedKey === selectedFaculty.generated_access_key ? 'check' : 'content_copy'}
                                    </span>
                                    {copiedKey === selectedFaculty.generated_access_key ? 'Copied!' : 'Copy Key'}
                                </button>
                            )}
                        </div>

                        {/* Drawer Actions Row */}
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', width: '100%' }}>
                            {selectedFaculty.status === 'suspended' ? (
                                <button
                                    style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--green)', color: 'var(--green)', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleToggleSuspendFaculty(selectedFaculty)}
                                    disabled={facultyActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>restore</span>
                                    Restore Access
                                </button>
                            ) : selectedFaculty.status === 'pending' ? (
                                <button
                                    style={{ ...c.actionBtn(true), padding: '8px 14px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => handleToggleSuspendFaculty(selectedFaculty, 'Account approved.')}
                                    disabled={facultyActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>check_circle</span>
                                    Approve Faculty
                                </button>
                            ) : (
                                <button
                                    style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)', background: 'var(--red-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                    onClick={() => setConfirmingSuspendFaculty(selectedFaculty)}
                                    disabled={facultyActionBusy}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '15px' }}>block</span>
                                    Suspend Access
                                </button>
                            )}
                            <button
                                style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--amber)', color: 'var(--amber)', background: 'var(--amber-bg)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => setConfirmingRegenKeyFaculty(selectedFaculty)}
                                disabled={facultyActionBusy}
                            >
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>key</span>
                                Regenerate Key & Reset Password
                            </button>
                            <button
                                style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--border)', color: 'var(--tx-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => setEditingFaculty({ ...selectedFaculty })}
                                disabled={facultyActionBusy}
                            >
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>edit</span>
                                Edit Profile
                            </button>
                            <button
                                style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--primary)', color: 'var(--primary)', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => {
                                    setSelectedFaculty(null);
                                    switchTab('assignments');
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '15px' }}>assignment_ind</span>
                                Assign Subjects
                            </button>
                            <button
                                style={{ ...c.actionBtn(false), padding: '8px 14px', fontSize: '11px', borderColor: 'var(--red)', color: 'var(--red)', background: 'transparent', display: 'flex', alignItems: 'center', gap: '4px' }}
                                onClick={() => setConfirmingDeleteFaculty(selectedFaculty)}
                                disabled={facultyActionBusy}
                            >
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>delete_forever</span>
                                Delete Faculty
                            </button>
                        </div>

                        {/* Tab navigation */}
                        <div style={c.tabRow}>
                            <button style={c.tabBtn(facultyDrawerTab === 'classes')} onClick={() => setFacultyDrawerTab('classes')}>
                                Assigned Classes ({classesList.filter(cl => cl.faculty_id === selectedFaculty.id).length})
                            </button>
                            <button style={c.tabBtn(facultyDrawerTab === 'activity')} onClick={() => setFacultyDrawerTab('activity')}>
                                Activity History ({activityLogs.filter(l => l.faculty_id === selectedFaculty.id).length})
                            </button>
                        </div>

                        {/* Tab 1: Assigned Classes */}
                        {facultyDrawerTab === 'classes' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {classesList.filter(cl => cl.faculty_id === selectedFaculty.id).length > 0 ? (
                                    classesList.filter(cl => cl.faculty_id === selectedFaculty.id).map(cl => (
                                        <div key={cl.id} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <div style={{ fontWeight: 800, fontSize: '14px', color: 'var(--tx-main)' }}>{cl.name}</div>
                                                <div style={{ fontSize: '11px', color: 'var(--tx-muted)', marginTop: '2px' }}>
                                                    {cl.branch || '—'} · Sem {cl.semester || '—'} {cl.section ? `· Sec ${cl.section}` : ''}
                                                    {cl.subject_code ? ` · ${cl.subject_code}` : ''}
                                                </div>
                                            </div>
                                            <span style={c.badge('approved')}>ACTIVE CLASS</span>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>
                                        No active classes assigned to this faculty member yet.
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab 2: Activity Logs */}
                        {facultyDrawerTab === 'activity' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {activityLogs.filter(l => l.faculty_id === selectedFaculty.id).length > 0 ? (
                                    activityLogs.filter(l => l.faculty_id === selectedFaculty.id).slice(0, 50).map(l => {
                                        const [bg, clr] = getActionColor(l.action_type);
                                        return (
                                            <div key={l.id} style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: 800, background: bg, color: clr }}>
                                                            {l.action_type}
                                                        </span>
                                                        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                            {l.target_usn ? `Target USN: ${l.target_usn}` : (l.details || 'Faculty Action')}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                                        {l.created_at ? new Date(l.created_at).toLocaleString() : '—'}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>
                                        No recorded activity logs for this faculty member.
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ONBOARD FACULTY MODAL */}
            {showAddFaculty && (
                <div style={c.modal} onClick={e => { if (e.target === e.currentTarget) setShowAddFaculty(false); }}>
                    <div style={c.modalCard} className="gf-fade-up">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', margin: 0, letterSpacing: '-0.03em' }}>Onboard Faculty Member</h2>
                            <button
                                onClick={() => setShowAddFaculty(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)', padding: '4px', display: 'flex', alignItems: 'center' }}
                                title="Close (Esc)"
                            >
                                <span className="material-icons-round" style={{ fontSize: '22px' }}>close</span>
                            </button>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '24px', lineHeight: 1.6 }}>
                            Register a new faculty member. A secure institutional Access Key will be automatically generated for them to link their GradeFlow account.
                        </p>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Full Name *</label>
                        <input style={c.input} placeholder="e.g. Dr. Ramesh Kumar" value={newFaculty.full_name} onChange={e => setNewFaculty(p => ({ ...p, full_name: e.target.value }))} />
                        
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Institutional Email *</label>
                        <input style={c.input} type="email" placeholder="e.g. ramesh@anjuman.edu.in" value={newFaculty.email} onChange={e => setNewFaculty(p => ({ ...p, email: e.target.value }))} />
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Department</label>
                                <input style={c.input} placeholder="e.g. Computer Science" value={newFaculty.department} onChange={e => setNewFaculty(p => ({ ...p, department: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Designation</label>
                                <input style={c.input} placeholder="e.g. Assistant Professor" value={newFaculty.designation} onChange={e => setNewFaculty(p => ({ ...p, designation: e.target.value }))} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Employee ID</label>
                                <input style={c.input} placeholder="e.g. AITM-CS-042" value={newFaculty.employee_id} onChange={e => setNewFaculty(p => ({ ...p, employee_id: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Phone (Optional)</label>
                                <input style={c.input} placeholder="+91 98765 43210" value={newFaculty.phone} onChange={e => setNewFaculty(p => ({ ...p, phone: e.target.value }))} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
                            <button style={{ ...c.actionBtn(true), padding: '12px 24px', fontSize: '13px' }} onClick={handleCreateFaculty} disabled={facultyActionBusy}>
                                {facultyActionBusy ? 'Onboarding…' : 'Onboard & Generate Key'}
                            </button>
                            <button style={{ ...c.actionBtn(false), padding: '12px 24px', fontSize: '13px' }} onClick={() => setShowAddFaculty(false)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* EDIT FACULTY MODAL */}
            {editingFaculty && (
                <div style={c.modal} onClick={e => { if (e.target === e.currentTarget) setEditingFaculty(null); }}>
                    <div style={c.modalCard} className="gf-fade-up">
                        <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '8px', letterSpacing: '-0.03em' }}>Edit Faculty Profile</h2>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '24px' }}>
                            Update institutional details and role assignments for {editingFaculty.full_name}.
                        </p>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Full Name</label>
                        <input style={c.input} value={editingFaculty.full_name || ''} onChange={e => setEditingFaculty(p => ({ ...p, full_name: e.target.value }))} />
                        
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Institutional Email</label>
                        <input style={c.input} value={editingFaculty.email || ''} onChange={e => setEditingFaculty(p => ({ ...p, email: e.target.value }))} />

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Department</label>
                                <input style={c.input} value={editingFaculty.department || ''} onChange={e => setEditingFaculty(p => ({ ...p, department: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Designation</label>
                                <input style={c.input} value={editingFaculty.designation || ''} onChange={e => setEditingFaculty(p => ({ ...p, designation: e.target.value }))} />
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Employee ID</label>
                                <input style={c.input} value={editingFaculty.employee_id || ''} onChange={e => setEditingFaculty(p => ({ ...p, employee_id: e.target.value }))} />
                            </div>
                            <div>
                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Phone</label>
                                <input style={c.input} value={editingFaculty.phone || ''} onChange={e => setEditingFaculty(p => ({ ...p, phone: e.target.value }))} />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '12px' }}>
                            <button style={{ ...c.actionBtn(true), padding: '12px 24px', fontSize: '13px' }} onClick={handleEditFaculty} disabled={facultyActionBusy}>
                                {facultyActionBusy ? 'Saving…' : 'Save Changes'}
                            </button>
                            <button style={{ ...c.actionBtn(false), padding: '12px 24px', fontSize: '13px' }} onClick={() => setEditingFaculty(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* KEY GENERATED SUCCESS DIALOG */}
            {createdFacultyResult && (
                <div style={c.modal} onClick={e => { if (e.target === e.currentTarget) setCreatedFacultyResult(null); }}>
                    <div style={c.modalCard} className="gf-fade-up">
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                            <span className="material-icons-round" style={{ fontSize: '28px', color: 'var(--green)' }}>check_circle</span>
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '8px' }}>Faculty Access Key Generated</h2>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
                            Provide this access key to <strong>{createdFacultyResult.full_name}</strong> ({createdFacultyResult.email}). They will use it to activate or access their Faculty Portal.
                        </p>

                        <div style={{ background: 'var(--surface-low)', border: '1.5px dashed var(--primary)', borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                            <div>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase' }}>Access Key</div>
                                <div style={{ fontSize: '18px', fontFamily: 'monospace', fontWeight: 900, color: 'var(--primary)', letterSpacing: '0.06em', marginTop: '2px' }}>
                                    {createdFacultyResult.access_key}
                                </div>
                            </div>
                            <button
                                style={{ ...c.actionBtn(true), padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                                onClick={() => copyKey(createdFacultyResult.access_key)}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>
                                    {copiedKey === createdFacultyResult.access_key ? 'check' : 'content_copy'}
                                </span>
                                {copiedKey === createdFacultyResult.access_key ? 'Copied' : 'Copy'}
                            </button>
                        </div>

                        <button style={{ ...c.actionBtn(true), width: '100%', padding: '12px', fontSize: '13px' }} onClick={() => setCreatedFacultyResult(null)}>
                            Done
                        </button>
                    </div>
                </div>
            )}

            {/* FACULTY SUSPEND WITH REASON DIALOG */}
            {confirmingSuspendFaculty && (
                <div style={c.modal} onClick={e => { if (e.target === e.currentTarget) setConfirmingSuspendFaculty(null); }}>
                    <div style={c.modalCard} className="gf-fade-up">
                        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--red-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                            <span className="material-icons-round" style={{ fontSize: '28px', color: 'var(--red)' }}>block</span>
                        </div>
                        <h2 style={{ fontSize: '22px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '8px' }}>Suspend Faculty Access?</h2>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', marginBottom: '20px', lineHeight: 1.6 }}>
                            Are you sure you want to suspend access for <strong>{confirmingSuspendFaculty.full_name}</strong> ({confirmingSuspendFaculty.email})? They will be immediately blocked from logging into the Faculty Portal.
                        </p>
                        <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', display: 'block', marginBottom: '6px' }}>Suspension Reason (Optional)</label>
                        <input
                            style={c.input}
                            placeholder="e.g. Term ended / Administrative review"
                            value={facultySuspendReason}
                            onChange={e => setFacultySuspendReason(e.target.value)}
                        />
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                            <button
                                style={{ ...c.actionBtn(true), background: 'var(--red)', color: '#fff', padding: '12px 24px', fontSize: '13px' }}
                                onClick={() => handleToggleSuspendFaculty(confirmingSuspendFaculty, facultySuspendReason)}
                                disabled={facultyActionBusy}
                            >
                                {facultyActionBusy ? 'Suspending…' : 'Suspend Faculty Access'}
                            </button>
                            <button style={{ ...c.actionBtn(false), padding: '12px 24px', fontSize: '13px' }} onClick={() => setConfirmingSuspendFaculty(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}

            {/* FACULTY SINGLE DELETE CONFIRM */}
            <ConfirmDialog
                open={Boolean(confirmingDeleteFaculty)}
                title="Permanently Remove Faculty Member?"
                description={`Are you sure you want to delete ${confirmingDeleteFaculty?.full_name} (${confirmingDeleteFaculty?.email})? Any classes assigned to this professor will be unlinked safely.`}
                confirmLabel="Delete Faculty"
                busy={facultyActionBusy}
                onCancel={() => setConfirmingDeleteFaculty(null)}
                onConfirm={() => handleDeleteSingleFaculty(confirmingDeleteFaculty)}
            />

            {/* FACULTY BULK DELETE CONFIRM */}
            <ConfirmDialog
                open={confirmingBulkDeleteFaculty}
                title={`Permanently Remove ${selectedFacultyIds.size} Faculty Members?`}
                description={`This will permanently remove the selected faculty accounts and unlink their class assignments.`}
                confirmLabel={`Delete ${selectedFacultyIds.size} Members`}
                busy={facultyActionBusy}
                onCancel={() => setConfirmingBulkDeleteFaculty(false)}
                onConfirm={() => handleBulkFacultyAction('bulk_delete')}
            />

            {/* FACULTY BULK SUSPEND CONFIRM */}
            <ConfirmDialog
                open={confirmingBulkSuspendFaculty}
                title={`Suspend ${selectedFacultyIds.size} Faculty Accounts?`}
                description={`All selected faculty members will be immediately blocked from accessing the Faculty Portal.`}
                confirmLabel={`Suspend ${selectedFacultyIds.size} Faculty`}
                busy={facultyActionBusy}
                onCancel={() => setConfirmingBulkSuspendFaculty(false)}
                onConfirm={() => handleBulkFacultyAction('bulk_suspend')}
            />

            {/* FACULTY REGEN KEY CONFIRM */}
            <ConfirmDialog
                open={Boolean(confirmingRegenKeyFaculty)}
                title="Regenerate Access Key & Reset Password?"
                description={`A new access key will be generated for ${confirmingRegenKeyFaculty?.full_name}. Their previous password will be invalidated until they log in with the new key.`}
                confirmLabel="Regenerate Key"
                busy={facultyActionBusy}
                onCancel={() => setConfirmingRegenKeyFaculty(null)}
                onConfirm={() => handleRegenerateFacultyKey(confirmingRegenKeyFaculty)}
            />
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
