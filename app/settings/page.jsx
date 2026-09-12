'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, getStudentAuthHeaders } from '@/lib/api/client';
import { supabase } from '@/lib/supabase';
import AuthGuard from '../../components/AuthGuard';
import { Button, Input } from '@/components/ui/Foundation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { getStudentDefaultEmail, extractBranchFromUsn } from '@/lib/semester-utils';
import { canonicalBranch, branchLabelFor, listBranches } from '@/lib/vtu-identity';

const CANONICAL_DEPARTMENTS = [
    { code: 'CS', name: 'Computer Science & Engineering' },
    { code: 'AI', name: 'Artificial Intelligence & Machine Learning (AIML)' },
    { code: 'IS', name: 'Information Science & Engineering' },
    { code: 'EC', name: 'Electronics & Communication Engineering' },
    { code: 'EE', name: 'Electrical & Electronics Engineering' },
    { code: 'ME', name: 'Mechanical Engineering' },
    { code: 'CV', name: 'Civil Engineering' },
    { code: 'CD', name: 'Computer Science & Design' },
    { code: 'BS', name: 'Basic Science & Humanities' },
];

const FACULTY_DESIGNATIONS = [
    'Assistant Professor',
    'Associate Professor',
    'Professor',
    'Head of Department (HOD)',
    'Senior Lecturer',
    'Lecturer',
    'Dean / Academic Director',
    'Visiting Faculty',
    'Adjunct Professor'
];

function SettingsContent() {
    const router = useRouter();
    const fileRef = useRef(null);

    // Identity & Session States
    const [session, setSession] = useState(null);
    const [userType, setUserType] = useState(null); // 'faculty' | 'student'
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'workload' | 'security' | 'about'
    const [loading, setLoading] = useState(true);

    // Profile Form States
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState({ assignedClasses: 0, assignedSubjects: 0, assignments: [] });
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editDepartment, setEditDepartment] = useState('');
    const [editDesignation, setEditDesignation] = useState('');
    const [customDesignationMode, setCustomDesignationMode] = useState(false);
    const [customDepartmentMode, setCustomDepartmentMode] = useState(false);
    const [editEmployeeId, setEditEmployeeId] = useState('');
    const [editOfficeLocation, setEditOfficeLocation] = useState('');
    const [photoUrl, setPhotoUrl] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);

    // Student-specific states
    const [editBranch, setEditBranch] = useState('');
    const [recoveryPin, setRecoveryPin] = useState('');

    // Password Security States
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordMsg, setPasswordMsg] = useState({ type: '', text: '' });

    // Action States
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [toast, setToast] = useState(null); // { type: 'success'|'error'|'info', message: '' }

    // Track pristine state for Dirty/Unsaved Banner
    const [initialFormState, setInitialFormState] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Load initial session and profile data
    useEffect(() => {
        const facSession = localStorage.getItem('faculty_session');
        const stuSession = localStorage.getItem('student_session');
        const admSession = localStorage.getItem('admin_session');

        if (facSession) {
            try {
                const parsed = JSON.parse(facSession);
                setSession(parsed);
                setUserType('faculty');
                loadFacultySettings(parsed);
            } catch (err) {
                console.error('Failed to parse faculty session:', err);
                setLoading(false);
            }
        } else if (stuSession) {
            try {
                const parsed = JSON.parse(stuSession);
                setSession(parsed);
                setUserType('student');
                loadStudentSettings(parsed.usn);
            } catch (err) {
                console.error('Failed to parse student session:', err);
                setLoading(false);
            }
        } else if (admSession) {
            try {
                const parsed = JSON.parse(admSession);
                setSession(parsed);
                setUserType('admin');
                loadAdminSettings(parsed);
            } catch (err) {
                console.error('Failed to parse admin session:', err);
                setLoading(false);
            }
        } else {
            setLoading(false);
        }
    }, []);

    // 1. Fetch Faculty Settings via dedicated API (strictly scoped to faculty)
    const loadFacultySettings = async (fac) => {
        setLoading(true);
        try {
            const facEmail = fac?.email || session?.email || '';
            const facId = fac?.id || session?.id || '';
            const params = new URLSearchParams();
            if (facEmail) params.set('email', facEmail);
            if (facId) params.set('faculty_id', facId);
            const qs = params.toString();
            const url = `/api/faculty/settings${qs ? `?${qs}` : ''}`;

            const res = await apiRequest(url);
            if (res && res.profile) {
                const p = res.profile;
                setProfile(p);
                setStats(res.stats || { assignedClasses: 0, assignedSubjects: 0, assignments: [] });
                setEditName(p.full_name || fac?.name || fac?.full_name || '');
                setEditEmail(p.email || fac?.email || '');
                const des = p.designation || 'Faculty Member';
                setEditDesignation(des);
                if (des && !FACULTY_DESIGNATIONS.includes(des)) {
                    setCustomDesignationMode(true);
                }
                const dept = p.department || fac?.department || '';
                setEditDepartment(dept);
                if (dept && !CANONICAL_DEPARTMENTS.some(d => d.name.toLowerCase() === dept.toLowerCase() || d.code.toLowerCase() === dept.toLowerCase())) {
                    setCustomDepartmentMode(true);
                }

                setEditEmployeeId(p.employee_id || '');
                setEditOfficeLocation(p.office_location || '');
                setPhotoUrl(p.photo_url || null);

                setInitialFormState({
                    name: p.full_name || fac?.name || fac?.full_name || '',
                    phone: p.phone || '',
                    department: dept,
                    designation: des,
                    employeeId: p.employee_id || '',
                    officeLocation: p.office_location || '',
                    photo: p.photo_url || null,
                });
            } else if (fac) {
                // Fallback to local session if profile endpoint was inaccessible
                setProfile({
                    full_name: fac.name || fac.full_name,
                    email: fac.email,
                    department: fac.department || 'Computer Science',
                    designation: 'Faculty Member',
                });
                setEditName(fac.name || fac.full_name || '');
                setEditEmail(fac.email || '');
                setEditDepartment(fac.department || '');
            }
        } catch (err) {
            console.error('Failed to load faculty settings:', err);
            if (fac) {
                setProfile({
                    full_name: fac.name || fac.full_name,
                    email: fac.email,
                    department: fac.department || 'Computer Science',
                    designation: 'Faculty Member',
                });
                setEditName(fac.name || fac.full_name || '');
                setEditEmail(fac.email || '');
                setEditDepartment(fac.department || '');
            }
            showToast('Failed to load full faculty profile from server.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // 2. Fetch Admin Settings
    const loadAdminSettings = async (adm) => {
        setLoading(true);
        try {
            const p = {
                full_name: adm?.name || 'Administrator',
                email: adm?.email || 'admin@anjuman.com',
                department: 'Institutional Administration',
                designation: 'System Administrator',
                employee_id: 'ADMIN-01',
                phone: '',
                office_location: 'Admin Directorate',
                role: 'admin'
            };
            setProfile(p);
            setStats({ assignedClasses: 0, assignedSubjects: 0, assignments: [] });
            setEditName(p.full_name);
            setEditEmail(p.email);
            setEditPhone('');
            setEditDepartment(p.department);
            setEditDesignation(p.designation);
            setEditEmployeeId(p.employee_id);
            setEditOfficeLocation(p.office_location);
            setPhotoUrl(null);

            setInitialFormState({
                name: p.full_name,
                phone: '',
                department: p.department,
                designation: p.designation,
                employeeId: p.employee_id,
                officeLocation: p.office_location,
                photo: null,
            });
        } finally {
            setLoading(false);
        }
    };

    // 2. Fetch Student Settings
    const loadStudentSettings = async (usn) => {
        setLoading(true);
        try {
            const cleanUsn = usn?.toUpperCase()?.trim();
            const { data } = await supabase
                .from('students')
                .select('*')
                .eq('usn', cleanUsn)
                .maybeSingle();

            if (data) {
                setProfile(data);
                setPhotoUrl(data.photo_url || null);
                setEditName(data.name || '');
                const branchCode = canonicalBranch(data.branch_code || data.branch || extractBranchFromUsn(cleanUsn)) || 'CS';
                setEditBranch(branchCode);
                const defaultEmail = data.email || getStudentDefaultEmail(data.usn || cleanUsn);
                setEditEmail(defaultEmail);
                setEditPhone(data.phone || '');
                setRecoveryPin(data.recovery_pin || '');

                setInitialFormState({
                    name: data.name || '',
                    branch: branchCode,
                    email: defaultEmail,
                    phone: data.phone || '',
                    photo: data.photo_url || null,
                });
            } else if (cleanUsn) {
                const branchCode = canonicalBranch(extractBranchFromUsn(cleanUsn)) || 'CS';
                const defaultEmail = getStudentDefaultEmail(cleanUsn);
                setEditBranch(branchCode);
                setEditEmail(defaultEmail);
                setEditPhone('');
                setInitialFormState({
                    name: '',
                    branch: branchCode,
                    email: defaultEmail,
                    phone: '',
                    photo: null,
                });
            }
        } catch (err) {
            console.error('Failed to load student profile:', err);
        } finally {
            setLoading(false);
        }
    };

    // Dirty state check
    const isDirty = useMemo(() => {
        if (!initialFormState) return false;
        if (userType === 'faculty' || userType === 'admin') {
            return (
                editName !== initialFormState.name ||
                editPhone !== initialFormState.phone ||
                editDepartment !== initialFormState.department ||
                editDesignation !== initialFormState.designation ||
                (userType === 'faculty' && editEmployeeId !== initialFormState.employeeId) ||
                editOfficeLocation !== initialFormState.officeLocation ||
                photoPreview !== null
            );
        } else {
            return (
                editName !== initialFormState.name ||
                editBranch !== initialFormState.branch ||
                editEmail !== initialFormState.email ||
                editPhone !== initialFormState.phone ||
                photoPreview !== null
            );
        }
    }, [
        initialFormState, userType, editName, editPhone, editDepartment,
        editDesignation, editEmployeeId, editOfficeLocation, photoPreview,
        editBranch, editEmail
    ]);

    // Handle avatar photo selection
    const handlePhotoSelect = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 25 * 1024 * 1024) {
            showToast('Photo must be under 25MB.', 'error');
            return;
        }

        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) {
            showToast('Only JPG, PNG, WebP, GIF, or BMP image files are allowed.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = (ev) => {
            setPhotoPreview(ev.target.result);
        };
        reader.readAsDataURL(file);
    };

    // Remove photo
    const handleRemovePhoto = () => {
        setPhotoPreview(null);
        setPhotoUrl(null);
        if (fileRef.current) fileRef.current.value = '';
    };

    // Discard unsaved changes
    const handleDiscardChanges = () => {
        if (!initialFormState) return;
        if (userType === 'faculty' || userType === 'admin') {
            setEditName(initialFormState.name);
            setEditPhone(initialFormState.phone);
            setEditDepartment(initialFormState.department);
            setEditDesignation(initialFormState.designation);
            setEditEmployeeId(initialFormState.employeeId || '');
            setEditOfficeLocation(initialFormState.officeLocation);
            setCustomDesignationMode(Boolean(initialFormState.designation && !FACULTY_DESIGNATIONS.includes(initialFormState.designation)));
            setCustomDepartmentMode(Boolean(initialFormState.department && !CANONICAL_DEPARTMENTS.some(d => d.name.toLowerCase() === initialFormState.department.toLowerCase() || d.code.toLowerCase() === initialFormState.department.toLowerCase())));
        } else {
            setEditName(initialFormState.name);
            setEditBranch(initialFormState.branch);
            setEditEmail(initialFormState.email);
            setEditPhone(initialFormState.phone);
        }
        setPhotoPreview(null);
        setPhotoUrl(initialFormState.photo);
        showToast('Changes discarded.', 'info');
    };

    // Save profile updates
    const handleSaveProfile = async () => {
        if (!session) return;
        setSaving(true);
        try {
            const finalPhotoUrl = photoPreview !== null ? photoPreview : photoUrl;

            if (userType === 'faculty') {
                const facEmail = session?.email || editEmail || '';
                const facId = session?.id || profile?.id || '';
                const params = new URLSearchParams();
                if (facEmail) params.set('email', facEmail);
                if (facId) params.set('faculty_id', facId);
                const qs = params.toString();
                const url = `/api/faculty/settings${qs ? `?${qs}` : ''}`;

                const res = await apiRequest(url, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        full_name: editName,
                        phone: editPhone,
                        department: editDepartment,
                        designation: editDesignation,
                        employee_id: editEmployeeId,
                        office_location: editOfficeLocation,
                        photo_url: finalPhotoUrl,
                    })
                });

                if (res?.profile) {
                    setProfile(res.profile);
                    setPhotoUrl(res.profile.photo_url || null);
                    setPhotoPreview(null);

                    // Sync local session
                    const updatedSession = {
                        ...session,
                        name: editName,
                        full_name: editName,
                        department: editDepartment,
                        photo_url: finalPhotoUrl
                    };
                    localStorage.setItem('faculty_session', JSON.stringify(updatedSession));
                    window.dispatchEvent(new Event('storage'));

                    setInitialFormState({
                        name: editName,
                        phone: editPhone,
                        department: editDepartment,
                        designation: editDesignation,
                        employeeId: editEmployeeId,
                        officeLocation: editOfficeLocation,
                        photo: finalPhotoUrl,
                    });

                    showToast('✓ Profile updated successfully!');
                }
            } else if (userType === 'admin') {
                const updatedSession = {
                    ...session,
                    name: editName,
                    full_name: editName,
                    department: editDepartment,
                    designation: editDesignation,
                    photo_url: finalPhotoUrl
                };
                localStorage.setItem('admin_session', JSON.stringify(updatedSession));
                window.dispatchEvent(new Event('storage'));
                setProfile(prev => ({
                    ...prev,
                    full_name: editName,
                    department: editDepartment,
                    designation: editDesignation,
                    photo_url: finalPhotoUrl,
                    office_location: editOfficeLocation
                }));
                setInitialFormState({
                    name: editName,
                    phone: editPhone,
                    department: editDepartment,
                    designation: editDesignation,
                    employeeId: editEmployeeId,
                    officeLocation: editOfficeLocation,
                    photo: finalPhotoUrl,
                });
                showToast('✓ Administrator profile updated!');
            } else {
                // Student save
                const branchCode = canonicalBranch(editBranch) || 'CS';
                const branchLabel = branchLabelFor(branchCode) || editBranch;
                const studentEmail = editEmail || getStudentDefaultEmail(session?.usn);

                // Update via API route
                await apiRequest('/api/student/settings', {
                    method: 'PATCH',
                    headers: getStudentAuthHeaders(session),
                    body: JSON.stringify({
                        full_name: editName,
                        email: studentEmail,
                        phone: editPhone,
                        branch: branchLabel,
                        branch_code: branchCode,
                        photo_url: finalPhotoUrl,
                    })
                });

                // Also directly sync to Supabase students table
                if (session?.usn) {
                    await supabase
                        .from('students')
                        .update({
                            name: editName,
                            email: studentEmail,
                            phone: editPhone,
                            branch: branchLabel,
                            branch_code: branchCode,
                            photo_url: finalPhotoUrl,
                            updated_at: new Date().toISOString()
                        })
                        .eq('usn', session.usn.toUpperCase());
                }

                const updatedSession = {
                    ...session,
                    name: editName,
                    email: studentEmail,
                    phone: editPhone,
                    branch: branchLabel,
                    branch_code: branchCode,
                    photo_url: finalPhotoUrl
                };
                localStorage.setItem('student_session', JSON.stringify(updatedSession));
                window.dispatchEvent(new Event('storage'));
                setPhotoUrl(finalPhotoUrl);
                setPhotoPreview(null);
                setInitialFormState({
                    name: editName,
                    branch: branchCode,
                    email: studentEmail,
                    phone: editPhone,
                    photo: finalPhotoUrl,
                });
                showToast('✓ Profile saved successfully!');
            }
        } catch (err) {
            console.error('Failed to save profile:', err);
            showToast('Failed to save profile: ' + (err.message || 'Please try again'), 'error');
        } finally {
            setSaving(false);
        }
    };

    // Keyboard shortcut (Ctrl+S / Cmd+S)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (isDirty && !saving) {
                    handleSaveProfile();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isDirty, saving, handleSaveProfile]);

    // Password change handler
    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPasswordMsg({ type: '', text: '' });

        if (!currentPassword) {
            setPasswordMsg({ type: 'error', text: 'Please enter your current password.' });
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            setPasswordMsg({ type: 'error', text: 'New password must be at least 6 characters.' });
            return;
        }
        if (newPassword !== confirmPassword) {
            setPasswordMsg({ type: 'error', text: 'New password and confirmation do not match.' });
            return;
        }

        setPasswordLoading(true);
        try {
            const facEmail = session?.email || editEmail || '';
            const facId = session?.id || profile?.id || '';
            const params = new URLSearchParams();
            if (facEmail) params.set('email', facEmail);
            if (facId) params.set('faculty_id', facId);
            const qs = params.toString();
            const url = `/api/faculty/settings/change-password${qs ? `?${qs}` : ''}`;

            const res = await apiRequest(url, {
                method: 'POST',
                body: JSON.stringify({
                    currentPassword,
                    newPassword,
                    confirmPassword
                })
            });

            setPasswordMsg({
                type: 'success',
                text: res?.message || 'Password changed successfully! Keep your new password safe.'
            });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (err) {
            console.error('Password change error:', err);
            setPasswordMsg({
                type: 'error',
                text: err?.message || 'Failed to change password. Please verify your current credentials.'
            });
        } finally {
            setPasswordLoading(false);
        }
    };

    // Password strength computation
    const passwordStrength = useMemo(() => {
        if (!newPassword) return 0;
        let score = 0;
        if (newPassword.length >= 6) score += 25;
        if (newPassword.length >= 10) score += 25;
        if (/[A-Z]/.test(newPassword) && /[a-z]/.test(newPassword)) score += 25;
        if (/[0-9]/.test(newPassword) || /[^A-Za-z0-9]/.test(newPassword)) score += 25;
        return score;
    }, [newPassword]);

    const passwordStrengthLabel = useMemo(() => {
        if (passwordStrength <= 25) return { text: 'Weak', color: '#EF4444' };
        if (passwordStrength <= 50) return { text: 'Fair', color: '#F59E0B' };
        if (passwordStrength <= 75) return { text: 'Good', color: '#3B82F6' };
        return { text: 'Strong', color: '#10B981' };
    }, [passwordStrength]);

    // Sign out handler
    const handleLogout = async () => {
        if (userType === 'faculty') {
            try {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        faculty_id: profile?.id || null,
                        faculty_name: profile?.name || profile?.full_name || null,
                    }),
                });
            } catch { /* ignored */ }
        }
        localStorage.removeItem('student_session');
        localStorage.removeItem('faculty_session');
        localStorage.removeItem('admin_session');
        window.dispatchEvent(new Event('storage'));
        router.push(userType === 'faculty' ? '/faculty/login' : (userType === 'admin' ? '/admin/gateway' : '/auth'));
    };

    // User initials helper
    const userInitials = useMemo(() => {
        const name = (userType === 'student' ? (profile?.name || session?.name) : (editName || profile?.full_name || session?.full_name || session?.name)) || 'User';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }, [session, profile, editName, userType]);

    // Active displayed photo
    const activePhoto = photoPreview || photoUrl;

    // Available tabs (Theme/Preferences removed as requested)
    const TABS = useMemo(() => [
        { id: 'profile', label: 'Profile & Identity', icon: 'person' },
        ...(userType === 'faculty' ? [{ id: 'workload', label: 'Academic & Workload', icon: 'auto_stories' }] : []),
        { id: 'security', label: 'Security & Password', icon: 'lock' },
        { id: 'about', label: 'About & System', icon: 'info' }
    ], [userType]);

    return (
        <div className="gf-page" style={{ maxWidth: '1060px', margin: '0 auto', paddingBottom: '100px' }}>
            {/* Header Area */}
            <div style={{ marginBottom: '24px' }}>
                <PageHeader>
                    <PageHeaderEyebrow>Account Settings</PageHeaderEyebrow>
                    <PageHeaderTitle>Institutional Profile & Settings</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Manage your professional identity, academic workload, and security credentials.
                    </PageHeaderSubtitle>
                </PageHeader>
            </div>

            {/* Profile Overview Hero Card */}
            <div
                style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '16px',
                    padding: '24px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '20px',
                    marginBottom: '24px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                {/* Decorative top accent line */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: 'linear-gradient(90deg, var(--primary) 0%, #3A6A6D 50%, #789397 100%)' }} />

                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', minWidth: '280px' }}>
                    {/* Hero Avatar with Quick Upload Trigger */}
                    <div
                        role="button"
                        tabIndex={0}
                        aria-label="Change profile photo"
                        onClick={() => fileRef.current?.click()}
                        style={{
                            width: '84px',
                            height: '84px',
                            borderRadius: '50%',
                            background: 'var(--surface-low)',
                            border: '3px solid var(--primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '28px',
                            fontWeight: 800,
                            color: 'var(--primary)',
                            overflow: 'hidden',
                            position: 'relative',
                            cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(23, 75, 77, 0.15)',
                            flexShrink: 0
                        }}
                        title="Click to change photo"
                    >
                        {activePhoto ? (
                            <img src={activePhoto} alt="Profile Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span>{userInitials}</span>
                        )}
                        <div
                            style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'rgba(0, 0, 0, 0.45)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#FFFFFF',
                                opacity: 0,
                                transition: 'opacity 0.2s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                            onMouseLeave={e => e.currentTarget.style.opacity = '0'}
                        >
                            <span className="material-icons-round" style={{ fontSize: '24px' }}>photo_camera</span>
                        </div>
                    </div>

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                            <h2 style={{ fontSize: '20px', fontWeight: 800, color: 'var(--tx-main)', margin: 0 }}>
                                {userType === 'student'
                                    ? (profile?.name || session?.name || 'Student')
                                    : (userType === 'admin'
                                        ? (editName || profile?.full_name || session?.name || 'Administrator')
                                        : (editName || profile?.full_name || session?.full_name || session?.name || 'Faculty Member')
                                      )}
                            </h2>
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    padding: '3px 9px',
                                    borderRadius: '12px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    background: 'var(--surface-low)',
                                    color: 'var(--primary)',
                                    border: '1px solid var(--border)'
                                }}
                            >
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: userType === 'admin' ? '#2563EB' : '#10B981' }} />
                                {userType === 'student' ? 'Student' : (userType === 'admin' ? 'Institutional Administrator' : 'Faculty Member')}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>mail</span>
                                {editEmail || (userType === 'student' ? getStudentDefaultEmail(session?.usn) : session?.email) || '—'}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>school</span>
                                {userType === 'student'
                                    ? (branchLabelFor(canonicalBranch(editBranch || profile?.branch || profile?.branch_code || profile?.usn)) || editBranch || 'Computer Science & Engineering')
                                    : (userType === 'admin'
                                        ? (editDepartment || 'Institutional Administration')
                                        : (editDepartment || profile?.department || 'Department Member'))}
                            </span>
                            {editDesignation && (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>badge</span>
                                    {editDesignation}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right side stats pill */}
                {userType === 'faculty' && (
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 16px', textAlign: 'center', minWidth: '90px' }}>
                            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>{stats.assignedSubjects}</div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Subjects</div>
                        </div>
                        <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '10px 16px', textAlign: 'center', minWidth: '90px' }}>
                            <div style={{ fontSize: '18px', fontWeight: 900, color: 'var(--primary)' }}>{stats.assignedClasses}</div>
                            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Classes</div>
                        </div>
                    </div>
                )}
            </div>

            {/* Segmented Pill Tab Navigation (Fixes truncation & cutoffs) */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    padding: '6px',
                    marginBottom: '28px',
                    flexWrap: 'wrap',
                    width: '100%',
                    boxSizing: 'border-box',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
                }}
            >
                {TABS.map(tab => {
                    const isSelected = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '10px 20px',
                                borderRadius: '8px',
                                border: 'none',
                                background: isSelected ? 'var(--primary)' : 'transparent',
                                color: isSelected ? '#FFFFFF' : 'var(--tx-muted)',
                                fontWeight: isSelected ? 800 : 600,
                                fontSize: '13.5px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap',
                                boxShadow: isSelected ? '0 2px 8px rgba(23, 75, 77, 0.25)' : 'none'
                            }}
                            onMouseEnter={e => {
                                if (!isSelected) {
                                    e.currentTarget.style.background = 'var(--surface-low)';
                                    e.currentTarget.style.color = 'var(--primary)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isSelected) {
                                    e.currentTarget.style.background = 'transparent';
                                    e.currentTarget.style.color = 'var(--tx-muted)';
                                }
                            }}
                        >
                            <span
                                className="material-icons-round"
                                style={{
                                    fontSize: '18px',
                                    color: isSelected ? '#FFFFFF' : 'inherit'
                                }}
                            >
                                {tab.icon}
                            </span>
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab 1: Profile & Identity */}
            {activeTab === 'profile' && (
                <div style={{ display: 'grid', gap: '24px' }}>
                    {/* Avatar Studio Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Avatar & Visual Identity</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                                <div
                                    style={{
                                        width: '100px',
                                        height: '100px',
                                        borderRadius: '20px',
                                        background: 'var(--surface-low)',
                                        border: '2px solid var(--border)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '36px',
                                        fontWeight: 900,
                                        color: 'var(--primary)',
                                        overflow: 'hidden',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                        flexShrink: 0
                                    }}
                                >
                                    {activePhoto ? (
                                        <img src={activePhoto} alt="Profile Photo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                        <span>{userInitials}</span>
                                    )}
                                </div>

                                <div style={{ flex: 1, minWidth: '240px' }}>
                                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                        <Button
                                            variant="primary"
                                            onClick={() => fileRef.current?.click()}
                                            disabled={uploading}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>upload</span>
                                            Choose New Photo
                                        </Button>

                                        {activePhoto && (
                                            <Button
                                                variant="outline"
                                                onClick={handleRemovePhoto}
                                                style={{ borderColor: 'var(--border)' }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--destructive)' }}>delete</span>
                                                Remove Photo
                                            </Button>
                                        )}
                                    </div>
                                    <p style={{ fontSize: '12px', color: 'var(--tx-dim)', margin: 0 }}>
                                        Supported formats: <strong>JPG, PNG, WebP, GIF</strong> · Maximum file size: <strong>25MB</strong>.
                                    </p>
                                    <input
                                        ref={fileRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handlePhotoSelect}
                                        style={{ display: 'none' }}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Personal & Academic Details Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Personal & Academic Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                                <div>
                                    <Input
                                        label="Full Name"
                                        value={editName}
                                        onChange={e => setEditName(e.target.value)}
                                        placeholder="Enter your full legal name"
                                    />
                                </div>

                                <div>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        Institutional Email (Verified)
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type="email"
                                            value={editEmail || (userType === 'student' ? getStudentDefaultEmail(session?.usn) : '')}
                                            readOnly
                                            style={{
                                                width: '100%',
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px',
                                                padding: '10px 14px 10px 38px',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: 'var(--tx-main)',
                                                fontFamily: 'inherit',
                                                cursor: 'not-allowed',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        <span className="material-icons-round" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', color: 'var(--primary)' }}>
                                            verified
                                        </span>
                                    </div>
                                    <span style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '4px', display: 'block' }}>
                                        Institutional emails are managed by college IT administrators.
                                    </span>
                                </div>

                                {userType === 'faculty' && (
                                    <>
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Department
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomDepartmentMode(!customDepartmentMode)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 700,
                                                        color: 'var(--primary)',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>
                                                        {customDepartmentMode ? 'view_list' : 'edit_note'}
                                                    </span>
                                                    {customDepartmentMode ? 'Choose from list' : 'Write manually'}
                                                </button>
                                            </div>

                                            {customDepartmentMode ? (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <Input
                                                            value={editDepartment}
                                                            onChange={e => setEditDepartment(e.target.value)}
                                                            placeholder="Enter department name (e.g. Computer Science & Engineering)"
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => setCustomDepartmentMode(false)}
                                                        title="Switch back to list"
                                                        style={{ padding: '0 12px', height: '42px', marginTop: 0 }}
                                                    >
                                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>list</span>
                                                    </Button>
                                                </div>
                                            ) : (
                                                <select
                                                    value={CANONICAL_DEPARTMENTS.some(d => d.name === editDepartment || d.code === editDepartment) ? editDepartment : (editDepartment ? '__custom__' : '')}
                                                    onChange={e => {
                                                        if (e.target.value === '__custom__') {
                                                            setCustomDepartmentMode(true);
                                                        } else {
                                                            setEditDepartment(e.target.value);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        background: 'var(--surface-low)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '8px',
                                                        padding: '10px 14px',
                                                        fontSize: '14px',
                                                        fontWeight: 600,
                                                        color: 'var(--tx-main)',
                                                        outline: 'none',
                                                        fontFamily: 'inherit'
                                                    }}
                                                >
                                                    <option value="">Select Department</option>
                                                    {CANONICAL_DEPARTMENTS.map(d => (
                                                        <option key={d.code} value={d.name}>
                                                            {d.name} ({d.code})
                                                        </option>
                                                    ))}
                                                    <option value="__custom__">✏️ Other (Write manually)...</option>
                                                </select>
                                            )}
                                        </div>

                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <label style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                    Designation / Academic Title
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setCustomDesignationMode(!customDesignationMode)}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '11.5px',
                                                        fontWeight: 700,
                                                        color: 'var(--primary)',
                                                        cursor: 'pointer',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <span className="material-icons-round" style={{ fontSize: '14px' }}>
                                                        {customDesignationMode ? 'view_list' : 'edit_note'}
                                                    </span>
                                                    {customDesignationMode ? 'Choose from list' : 'Write manually'}
                                                </button>
                                            </div>

                                            {customDesignationMode ? (
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <Input
                                                            value={editDesignation}
                                                            onChange={e => setEditDesignation(e.target.value)}
                                                            placeholder="Enter custom designation (e.g. Assistant Professor & Tech Lead)"
                                                            autoFocus
                                                        />
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => setCustomDesignationMode(false)}
                                                        title="Switch back to list"
                                                        style={{ padding: '0 12px', height: '42px', marginTop: 0 }}
                                                    >
                                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>list</span>
                                                    </Button>
                                                </div>
                                            ) : (
                                                <select
                                                    value={FACULTY_DESIGNATIONS.includes(editDesignation) ? editDesignation : (editDesignation ? '__custom__' : '')}
                                                    onChange={e => {
                                                        if (e.target.value === '__custom__') {
                                                            setCustomDesignationMode(true);
                                                        } else {
                                                            setEditDesignation(e.target.value);
                                                        }
                                                    }}
                                                    style={{
                                                        width: '100%',
                                                        background: 'var(--surface-low)',
                                                        border: '1px solid var(--border)',
                                                        borderRadius: '8px',
                                                        padding: '10px 14px',
                                                        fontSize: '14px',
                                                        fontWeight: 600,
                                                        color: 'var(--tx-main)',
                                                        outline: 'none',
                                                        fontFamily: 'inherit'
                                                    }}
                                                >
                                                    <option value="">Select Designation</option>
                                                    {FACULTY_DESIGNATIONS.map(des => (
                                                        <option key={des} value={des}>{des}</option>
                                                    ))}
                                                    <option value="__custom__">✏️ Other (Write manually)...</option>
                                                </select>
                                            )}
                                        </div>

                                        <div>
                                            <Input
                                                label="Employee ID / Faculty Code"
                                                value={editEmployeeId}
                                                onChange={e => setEditEmployeeId(e.target.value)}
                                                placeholder="e.g. FAC-CSE-042"
                                            />
                                        </div>

                                        <div>
                                            <Input
                                                label="Office / Cabin Location"
                                                value={editOfficeLocation}
                                                onChange={e => setEditOfficeLocation(e.target.value)}
                                                placeholder="e.g. CS Block, 2nd Floor, Room 204"
                                            />
                                        </div>
                                    </>
                                )}

                                {userType === 'admin' && (
                                    <>
                                        <div>
                                            <Input
                                                label="Department / Directorate"
                                                value={editDepartment}
                                                onChange={e => setEditDepartment(e.target.value)}
                                                placeholder="Institutional Administration"
                                            />
                                        </div>

                                        <div>
                                            <Input
                                                label="Designation / Administrative Role"
                                                value={editDesignation}
                                                onChange={e => setEditDesignation(e.target.value)}
                                                placeholder="System Administrator"
                                            />
                                        </div>

                                        <div>
                                            <Input
                                                label="Office / Directorate Location"
                                                value={editOfficeLocation}
                                                onChange={e => setEditOfficeLocation(e.target.value)}
                                                placeholder="Admin Directorate, Main Block"
                                            />
                                        </div>
                                    </>
                                )}

                                <div>
                                    <Input
                                        label="Contact Phone Number"
                                        value={editPhone}
                                        onChange={e => setEditPhone(e.target.value)}
                                        placeholder="+91 98765 43210"
                                        type="tel"
                                    />
                                </div>

                                {userType === 'student' && (
                                    <div>
                                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                            Branch
                                        </label>
                                        <select
                                            value={canonicalBranch(editBranch) || editBranch || 'CS'}
                                            onChange={e => setEditBranch(e.target.value)}
                                            style={{
                                                width: '100%',
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px',
                                                padding: '10px 14px',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: 'var(--tx-main)',
                                                outline: 'none',
                                                fontFamily: 'inherit'
                                            }}
                                        >
                                            <option value="">Select Branch</option>
                                            {listBranches().map(b => (
                                                <option key={b.code} value={b.code}>
                                                    {b.label} ({b.code})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>

                            {/* Standard Save button inside the card as well */}
                            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                    variant="primary"
                                    onClick={handleSaveProfile}
                                    disabled={saving || !isDirty}
                                    loading={saving}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '18px' }}>save</span>
                                    {saving ? 'Saving...' : 'Save Profile Changes'}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Tab 2: Academic & Teaching Workload (Faculty exclusive) */}
            {activeTab === 'workload' && userType === 'faculty' && (
                <div style={{ display: 'grid', gap: '24px' }}>
                    {/* Workload KPIs */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)', marginBottom: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>library_books</span>
                                <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Assigned Subjects</span>
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{stats.assignedSubjects}</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>Curriculum teaching quota</div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)', marginBottom: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>groups</span>
                                <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Classes</span>
                            </div>
                            <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{stats.assignedClasses}</div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>Class sections under mentorship</div>
                        </div>

                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '20px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--primary)', marginBottom: '8px' }}>
                                <span className="material-icons-round" style={{ fontSize: '24px' }}>verified</span>
                                <span style={{ fontSize: '13px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Status</span>
                            </div>
                            <div style={{ fontSize: '20px', fontWeight: 900, color: '#10B981', textTransform: 'capitalize' }}>
                                {profile?.status || 'Approved'}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--tx-dim)', marginTop: '4px' }}>Institutional VTU Engine Access</div>
                        </div>
                    </div>

                    {/* Workload Roster Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Teaching Assignments & Class Rosters</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {stats.assignments && stats.assignments.length > 0 ? (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid var(--border)', color: 'var(--tx-dim)' }}>
                                                <th style={{ padding: '10px' }}>Subject Code</th>
                                                <th style={{ padding: '10px' }}>Branch</th>
                                                <th style={{ padding: '10px' }}>Semester</th>
                                                <th style={{ padding: '10px' }}>Class / Section</th>
                                                <th style={{ padding: '10px', textAlign: 'right' }}>Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.assignments.map((a, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--tx-main)' }}>{a.subject_code}</td>
                                                    <td style={{ padding: '12px 10px' }}>{a.branch}</td>
                                                    <td style={{ padding: '12px 10px' }}>Semester {a.semester}</td>
                                                    <td style={{ padding: '12px 10px' }}>{a.class_name || `${a.branch}-${a.section || 'A'}`}</td>
                                                    <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => router.push(`/faculty/analytics/subject?code=${a.subject_code}`)}
                                                        >
                                                            Analytics
                                                        </Button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '36px 16px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                                    <span className="material-icons-round" style={{ fontSize: '40px', color: 'var(--tx-dim)', marginBottom: '8px' }}>
                                        assignment_turned_in
                                    </span>
                                    <h4 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', margin: '0 0 4px 0' }}>
                                        No Specific Course Sections Assigned
                                    </h4>
                                    <p style={{ fontSize: '13px', color: 'var(--tx-muted)', maxWidth: '440px', margin: '0 auto 16px auto' }}>
                                        You currently have unrestricted faculty access across all department classes, results hubs, and student directories.
                                    </p>
                                    <Button
                                        variant="outline"
                                        onClick={() => router.push('/faculty/classes')}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>groups</span>
                                        Manage Classes
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Tab 3: Security & Credentials */}
            {activeTab === 'security' && (
                <div style={{ display: 'grid', gap: '24px' }}>
                    {/* Change Password Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Change Password</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleChangePassword} style={{ maxWidth: '520px' }}>
                                {passwordMsg.text && (
                                    <div
                                        style={{
                                            padding: '12px 16px',
                                            borderRadius: '8px',
                                            fontSize: '13px',
                                            fontWeight: 700,
                                            marginBottom: '18px',
                                            background: passwordMsg.type === 'success' ? '#ECFDF5' : '#FEF2F2',
                                            color: passwordMsg.type === 'success' ? '#065F46' : '#991B1B',
                                            border: `1px solid ${passwordMsg.type === 'success' ? '#A7F3D0' : '#FECACA'}`,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                            {passwordMsg.type === 'success' ? 'check_circle' : 'error'}
                                        </span>
                                        {passwordMsg.text}
                                    </div>
                                )}

                                {/* Current Password */}
                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        Current Password
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showCurrentPassword ? 'text' : 'password'}
                                            value={currentPassword}
                                            onChange={e => setCurrentPassword(e.target.value)}
                                            placeholder="Enter your current password"
                                            required
                                            style={{
                                                width: '100%',
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px',
                                                padding: '10px 40px 10px 14px',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: 'var(--tx-main)',
                                                fontFamily: 'inherit',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                                {showCurrentPassword ? 'visibility_off' : 'visibility'}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* New Password */}
                                <div style={{ marginBottom: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        New Password
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showNewPassword ? 'text' : 'password'}
                                            value={newPassword}
                                            onChange={e => setNewPassword(e.target.value)}
                                            placeholder="Minimum 6 characters"
                                            required
                                            style={{
                                                width: '100%',
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                borderRadius: '8px',
                                                padding: '10px 40px 10px 14px',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: 'var(--tx-main)',
                                                fontFamily: 'inherit',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowNewPassword(!showNewPassword)}
                                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                                {showNewPassword ? 'visibility_off' : 'visibility'}
                                            </span>
                                        </button>
                                    </div>
                                </div>

                                {/* Password Strength Meter */}
                                {newPassword && (
                                    <div style={{ marginBottom: '16px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', marginBottom: '4px' }}>
                                            <span style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Strength</span>
                                            <span style={{ color: passwordStrengthLabel.color, fontWeight: 800 }}>{passwordStrengthLabel.text}</span>
                                        </div>
                                        <div style={{ width: '100%', height: '5px', background: 'var(--border)', borderRadius: '3px', overflow: 'hidden' }}>
                                            <div
                                                style={{
                                                    width: `${passwordStrength}%`,
                                                    height: '100%',
                                                    background: passwordStrengthLabel.color,
                                                    transition: 'all 0.3s ease'
                                                }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Confirm New Password */}
                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                        Confirm New Password
                                    </label>
                                    <div style={{ position: 'relative' }}>
                                        <input
                                            type={showConfirmPassword ? 'text' : 'password'}
                                            value={confirmPassword}
                                            onChange={e => setConfirmPassword(e.target.value)}
                                            placeholder="Re-type your new password"
                                            required
                                            style={{
                                                width: '100%',
                                                background: 'var(--surface-low)',
                                                border: `1px solid ${confirmPassword && newPassword === confirmPassword ? '#10B981' : 'var(--border)'}`,
                                                borderRadius: '8px',
                                                padding: '10px 40px 10px 14px',
                                                fontSize: '14px',
                                                fontWeight: 600,
                                                color: 'var(--tx-main)',
                                                fontFamily: 'inherit',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                            style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tx-muted)' }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px' }}>
                                                {showConfirmPassword ? 'visibility_off' : 'visibility'}
                                            </span>
                                        </button>
                                    </div>
                                    {confirmPassword && newPassword === confirmPassword && (
                                        <span style={{ fontSize: '11px', color: '#10B981', fontWeight: 700, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px' }}>check</span> Passwords match
                                        </span>
                                    )}
                                </div>

                                <Button
                                    type="submit"
                                    variant="primary"
                                    disabled={passwordLoading || !currentPassword || !newPassword || newPassword !== confirmPassword}
                                    loading={passwordLoading}
                                >
                                    <span className="material-icons-round" style={{ fontSize: '18px' }}>lock_reset</span>
                                    {passwordLoading ? 'Updating Password...' : 'Update Password'}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>

                    {/* Active Session & Security Inspection */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Session & Security Details</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'grid', gap: '14px', fontSize: '13px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Active Role</span>
                                    <span style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{userType === 'student' ? 'Undergraduate Student' : 'Institutional Faculty'}</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Last Login IP</span>
                                    <span style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                        {profile?.last_login_ip || '127.0.0.1 (Local Session)'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Last Active Timestamp</span>
                                    <span style={{ fontWeight: 600, color: 'var(--tx-muted)' }}>
                                        {profile?.last_login_at ? new Date(profile.last_login_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'Current Session'}
                                    </span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid var(--border)' }}>
                                    <span style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>Token Architecture</span>
                                    <span style={{ fontWeight: 700, color: 'var(--tx-main)' }}>Signed HMAC SHA-256 (HTTP-Only Cookie + Local Storage)</span>
                                </div>

                                <div style={{ paddingTop: '8px', display: 'flex', justifyContent: 'flex-start' }}>
                                    <Button
                                        variant="outline"
                                        onClick={handleLogout}
                                        style={{ borderColor: 'var(--destructive)', color: 'var(--destructive)' }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>logout</span>
                                        Sign Out of This Device
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Student Recovery PIN */}
                    {userType === 'student' && recoveryPin && (
                        <Card style={{ border: '1px solid var(--amber)', background: 'var(--amber-bg)' }}>
                            <CardContent>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                                    <span className="material-icons-round" style={{ color: 'var(--amber)', fontSize: '24px' }}>vpn_key</span>
                                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--amber)' }}>Recovery PIN</div>
                                </div>
                                <p style={{ fontSize: '13px', color: 'var(--tx-main)', fontWeight: 600, marginBottom: '16px' }}>
                                    This is your unique Recovery PIN. Keep it confidential. You will need it if you ever forget your password.
                                </p>
                                <div style={{ background: 'var(--bg)', padding: '14px', borderRadius: '10px', textAlign: 'center', fontSize: '26px', fontWeight: 900, letterSpacing: '0.12em', color: 'var(--tx-main)', border: '2px dashed var(--amber)' }}>
                                    {recoveryPin}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* Tab 4: About & System */}
            {activeTab === 'about' && (
                <div style={{ display: 'grid', gap: '24px' }}>
                    <Card>
                        <CardHeader>
                            <CardTitle>System & Institutional Governance</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                                        Engineering & AI Architecture Team
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
                                        <a
                                            href="https://ainanai.vercel.app/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="Mohammed Ainan — AI Engineer & Full Stack Developer"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                padding: '8px 16px',
                                                borderRadius: '24px',
                                                fontWeight: 800,
                                                fontSize: '13px',
                                                color: 'var(--tx-main)',
                                                textDecoration: 'none',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tx-main)'; }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>person</span>
                                            Mohammed Ainan Armar
                                        </a>
                                        <span style={{ color: 'var(--primary)', fontWeight: 900 }}>&</span>
                                        <a
                                            href="https://rawahahruknuddin.vercel.app/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            title="Rawahah Ruknuddin — AI Product Engineer"
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '8px',
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                padding: '8px 16px',
                                                borderRadius: '24px',
                                                fontWeight: 800,
                                                fontSize: '13px',
                                                color: 'var(--tx-main)',
                                                textDecoration: 'none',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary)'; e.currentTarget.style.color = 'var(--primary)'; }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--tx-main)'; }}
                                        >
                                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>person</span>
                                            Rawahah Ruknuddin
                                        </a>
                                    </div>
                                </div>

                                <div style={{ height: '1px', background: 'var(--border)' }} />

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600 }}>Affiliated Institution</span>
                                    <span style={{ fontSize: '13px', color: 'var(--tx-main)', fontWeight: 800 }}>Anjuman Institute of Technology & Management (AITM), Bhatkal</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600 }}>University Engine</span>
                                    <span style={{ fontSize: '13px', color: 'var(--tx-main)', fontWeight: 800 }}>VTU NEP Academic Engine (Autonomous & Affiliated Standard)</span>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <span style={{ fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600 }}>GradeFlow Version</span>
                                    <span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 800 }}>v2.4 Institutional Release</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Floating Unsaved Changes Bar ("Make it Ezy") */}
            {isDirty && (
                <div
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--tx-main)',
                        color: '#FFFFFF',
                        padding: '12px 24px',
                        borderRadius: '40px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px',
                        boxShadow: '0 8px 30px rgba(0,0,0,0.3)',
                        zIndex: 9999,
                        maxWidth: '90%',
                        animation: 'fadeInUp 0.25s ease-out'
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700 }}>
                        <span className="material-icons-round" style={{ fontSize: '20px', color: '#F59E0B' }}>warning</span>
                        You have unsaved changes
                        <span style={{ opacity: 0.6, fontSize: '11px', display: 'none' }} className="gf-desktop-only">
                            (Ctrl+S to save)
                        </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={handleDiscardChanges}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(255,255,255,0.3)',
                                color: '#FFFFFF',
                                padding: '6px 14px',
                                borderRadius: '20px',
                                fontSize: '12px',
                                fontWeight: 700,
                                cursor: 'pointer'
                            }}
                        >
                            Discard
                        </button>
                        <button
                            type="button"
                            onClick={handleSaveProfile}
                            disabled={saving}
                            style={{
                                background: 'var(--primary)',
                                border: 'none',
                                color: '#FFFFFF',
                                padding: '7px 18px',
                                borderRadius: '20px',
                                fontSize: '13px',
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>save</span>
                            {saving ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div
                    style={{
                        position: 'fixed',
                        top: '24px',
                        right: '24px',
                        background: toast.type === 'error' ? '#991B1B' : (toast.type === 'info' ? '#3A6A6D' : 'var(--primary)'),
                        color: '#FFFFFF',
                        padding: '12px 20px',
                        borderRadius: '10px',
                        fontSize: '13px',
                        fontWeight: 700,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        zIndex: 10000,
                        animation: 'fadeInDown 0.25s ease-out'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '20px' }}>
                        {toast.type === 'error' ? 'error' : (toast.type === 'info' ? 'info' : 'check_circle')}
                    </span>
                    {toast.message}
                </div>
            )}
        </div>
    );
}

export default function SettingsPage() {
    return (
        <AuthGuard role="any">
            <SettingsContent />
        </AuthGuard>
    );
}
