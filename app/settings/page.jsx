'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, getStudentAuthHeaders } from '@/lib/api/client';
import { supabase } from '@/lib/supabase';
import AuthGuard from '../../components/AuthGuard';
import { Button, Input } from '@/components/ui/Foundation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';

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
    const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'workload' | 'security' | 'preferences' | 'about'
    const [loading, setLoading] = useState(true);

    // Profile Form States
    const [profile, setProfile] = useState(null);
    const [stats, setStats] = useState({ assignedClasses: 0, assignedSubjects: 0, assignments: [] });
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [editDepartment, setEditDepartment] = useState('');
    const [editDesignation, setEditDesignation] = useState('');
    const [editEmployeeId, setEditEmployeeId] = useState('');
    const [editOfficeLocation, setEditOfficeLocation] = useState('');
    const [photoUrl, setPhotoUrl] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);

    // Student-specific states
    const [editBranch, setEditBranch] = useState('');
    const [recoveryPin, setRecoveryPin] = useState('');

    // Preferences
    const [theme, setTheme] = useState('system');
    const [notifications, setNotifications] = useState(true);
    const [compactMode, setCompactMode] = useState(false);

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
    const [toast, setToast] = useState(null); // { type: 'success'|'error', message: '' }

    // Track pristine state for Dirty/Unsaved Banner
    const [initialFormState, setInitialFormState] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4500);
    };

    // Load initial session and profile data
    useEffect(() => {
        const facSession = localStorage.getItem('faculty_session');
        const stuSession = localStorage.getItem('student_session');

        if (facSession) {
            try {
                const parsed = JSON.parse(facSession);
                setSession(parsed);
                setUserType('faculty');
                loadFacultySettings();
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
        } else {
            setLoading(false);
        }
    }, []);

    // 1. Fetch Faculty Settings via dedicated API
    const loadFacultySettings = async () => {
        setLoading(true);
        try {
            const res = await apiRequest('/api/faculty/settings');
            if (res && res.profile) {
                const p = res.profile;
                setProfile(p);
                setStats(res.stats || { assignedClasses: 0, assignedSubjects: 0, assignments: [] });
                setEditName(p.full_name || '');
                setEditEmail(p.email || '');
                setEditPhone(p.phone || '');
                setEditDepartment(p.department || '');
                setEditDesignation(p.designation || 'Faculty Member');
                setEditEmployeeId(p.employee_id || '');
                setEditOfficeLocation(p.office_location || '');
                setPhotoUrl(p.photo_url || null);
                setTheme(p.theme || 'system');
                setNotifications(p.notifications ?? true);
                setCompactMode(p.compact_mode ?? false);

                setInitialFormState({
                    name: p.full_name || '',
                    phone: p.phone || '',
                    department: p.department || '',
                    designation: p.designation || 'Faculty Member',
                    employeeId: p.employee_id || '',
                    officeLocation: p.office_location || '',
                    photo: p.photo_url || null,
                    theme: p.theme || 'system',
                    notifications: p.notifications ?? true,
                    compactMode: p.compact_mode ?? false,
                });
            }
        } catch (err) {
            console.error('Failed to load faculty settings:', err);
            showToast('Failed to load faculty profile settings.', 'error');
        } finally {
            setLoading(false);
        }
    };

    // 2. Fetch Student Settings
    const loadStudentSettings = async (usn) => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from('students')
                .select('*')
                .eq('usn', usn?.toUpperCase())
                .maybeSingle();

            if (data) {
                setProfile(data);
                setPhotoUrl(data.photo_url || null);
                setEditName(data.name || '');
                setEditBranch(data.branch || '');
                setEditEmail(data.email || '');
                setEditPhone(data.phone || '');
                setRecoveryPin(data.recovery_pin || '');

                setInitialFormState({
                    name: data.name || '',
                    branch: data.branch || '',
                    email: data.email || '',
                    phone: data.phone || '',
                    photo: data.photo_url || null,
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
        if (userType === 'faculty') {
            return (
                editName !== initialFormState.name ||
                editPhone !== initialFormState.phone ||
                editDepartment !== initialFormState.department ||
                editDesignation !== initialFormState.designation ||
                editEmployeeId !== initialFormState.employeeId ||
                editOfficeLocation !== initialFormState.officeLocation ||
                photoPreview !== null ||
                theme !== initialFormState.theme ||
                notifications !== initialFormState.notifications ||
                compactMode !== initialFormState.compactMode
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
        theme, notifications, compactMode, editBranch, editEmail
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
        if (userType === 'faculty') {
            setEditName(initialFormState.name);
            setEditPhone(initialFormState.phone);
            setEditDepartment(initialFormState.department);
            setEditDesignation(initialFormState.designation);
            setEditEmployeeId(initialFormState.employeeId);
            setEditOfficeLocation(initialFormState.officeLocation);
            setTheme(initialFormState.theme);
            setNotifications(initialFormState.notifications);
            setCompactMode(initialFormState.compactMode);
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
                const res = await apiRequest('/api/faculty/settings', {
                    method: 'PATCH',
                    body: JSON.stringify({
                        full_name: editName,
                        phone: editPhone,
                        department: editDepartment,
                        designation: editDesignation,
                        employee_id: editEmployeeId,
                        office_location: editOfficeLocation,
                        photo_url: finalPhotoUrl,
                        theme,
                        notifications,
                        compact_mode: compactMode,
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
                        theme,
                        notifications,
                        compactMode,
                    });

                    showToast('✓ Profile and preferences saved successfully!');
                }
            } else {
                // Student save
                await apiRequest('/api/student/settings', {
                    method: 'PATCH',
                    headers: getStudentAuthHeaders(session),
                    body: JSON.stringify({
                        full_name: editName,
                        email: editEmail,
                        phone: editPhone,
                        photo_url: finalPhotoUrl,
                    })
                });

                const updatedSession = { ...session, name: editName, email: editEmail, phone: editPhone, photo_url: finalPhotoUrl };
                localStorage.setItem('student_session', JSON.stringify(updatedSession));
                window.dispatchEvent(new Event('storage'));
                setPhotoUrl(finalPhotoUrl);
                setPhotoPreview(null);
                setInitialFormState({
                    name: editName,
                    branch: editBranch,
                    email: editEmail,
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
            const res = await apiRequest('/api/faculty/settings/change-password', {
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
        window.dispatchEvent(new Event('storage'));
        router.push(userType === 'faculty' ? '/faculty/login' : '/auth');
    };

    // User initials helper
    const userInitials = useMemo(() => {
        const name = (userType === 'student' ? session?.name : (profile?.full_name || session?.full_name)) || 'User';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }, [session, profile, userType]);

    // Active displayed photo
    const activePhoto = photoPreview || photoUrl;

    return (
        <div className="gf-page" style={{ maxWidth: '1060px', margin: '0 auto', paddingBottom: '100px' }}>
            {/* Header Area */}
            <div style={{ marginBottom: '24px' }}>
                <PageHeader>
                    <PageHeaderEyebrow>Account Settings</PageHeaderEyebrow>
                    <PageHeaderTitle>Institutional Profile & Settings</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Manage your professional identity, academic workload, security credentials, and application preferences.
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
                                {userType === 'student' ? (profile?.name || session?.name || 'Student') : (editName || profile?.full_name || session?.full_name || 'Faculty Member')}
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
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10B981' }} />
                                {userType === 'student' ? 'Student' : 'Faculty Member'}
                            </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>mail</span>
                                {editEmail || session?.email || '—'}
                            </span>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary)' }}>school</span>
                                {userType === 'student' ? (editBranch || 'Engineering') : (editDepartment || 'Department of Computer Science')}
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

            {/* Custom Tab Navigation */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    borderBottom: '1px solid var(--border)',
                    marginBottom: '28px',
                    overflowX: 'auto',
                    paddingBottom: '2px'
                }}
            >
                {[
                    { id: 'profile', label: 'Profile & Identity', icon: 'person' },
                    ...(userType === 'faculty' ? [{ id: 'workload', label: 'Academic & Teaching', icon: 'auto_stories' }] : []),
                    { id: 'security', label: 'Security & Credentials', icon: 'lock' },
                    { id: 'preferences', label: 'Display & Preferences', icon: 'tune' },
                    { id: 'about', label: 'About & System', icon: 'info' }
                ].map(tab => {
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
                                padding: '10px 18px',
                                borderRadius: '8px 8px 0 0',
                                border: 'none',
                                borderBottom: isSelected ? '3px solid var(--primary)' : '3px solid transparent',
                                background: isSelected ? 'var(--surface-low)' : 'transparent',
                                color: isSelected ? 'var(--primary)' : 'var(--tx-muted)',
                                fontWeight: isSelected ? 800 : 600,
                                fontSize: '14px',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                whiteSpace: 'nowrap'
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '18px', color: isSelected ? 'var(--primary)' : 'inherit' }}>
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
                                            value={editEmail}
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
                                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                                Department
                                            </label>
                                            <select
                                                value={editDepartment}
                                                onChange={e => setEditDepartment(e.target.value)}
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
                                                <option value="computer science">computer science</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
                                                Designation / Academic Title
                                            </label>
                                            <select
                                                value={editDesignation}
                                                onChange={e => setEditDesignation(e.target.value)}
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
                                                {FACULTY_DESIGNATIONS.map(des => (
                                                    <option key={des} value={des}>{des}</option>
                                                ))}
                                            </select>
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
                                            value={editBranch}
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
                                            <option value="CSE">Computer Science</option>
                                            <option value="AIML">AI & Machine Learning</option>
                                            <option value="ISE">Information Science</option>
                                            <option value="ECE">Electronics & Comm.</option>
                                            <option value="EEE">Electrical & Electronics</option>
                                            <option value="ME">Mechanical Engineering</option>
                                            <option value="CIVIL">Civil Engineering</option>
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

            {/* Tab 4: Display & Preferences */}
            {activeTab === 'preferences' && (
                <div style={{ display: 'grid', gap: '24px' }}>
                    <Card>
                        <CardHeader>
                            <CardTitle>Interface & Theme Preferences</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'grid', gap: '20px' }}>
                                {/* Theme Selector */}
                                <div>
                                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: '8px' }}>
                                        Appearance Theme
                                    </label>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                        {[
                                            { id: 'system', label: 'System Default', icon: 'settings_brightness' },
                                            { id: 'light', label: 'Natural Light', icon: 'light_mode' },
                                            { id: 'dark', label: 'Charcoal Dark', icon: 'dark_mode' }
                                        ].map(t => (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => setTheme(t.id)}
                                                style={{
                                                    flex: 1,
                                                    minWidth: '130px',
                                                    padding: '14px',
                                                    borderRadius: '10px',
                                                    border: theme === t.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                                    background: theme === t.id ? 'var(--surface-low)' : 'var(--surface)',
                                                    cursor: 'pointer',
                                                    textAlign: 'center',
                                                    color: 'var(--tx-main)',
                                                    fontWeight: 700,
                                                    fontSize: '13px',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    alignItems: 'center',
                                                    gap: '8px',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '24px', color: theme === t.id ? 'var(--primary)' : 'var(--tx-muted)' }}>
                                                    {t.icon}
                                                </span>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div style={{ height: '1px', background: 'var(--border)' }} />

                                {/* Compact Mode */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>Compact Table Density</div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-dim)' }}>Display more student and exam records per page with tighter row spacing.</div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={compactMode}
                                        onChange={e => setCompactMode(e.target.checked)}
                                        style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                    />
                                </div>

                                <div style={{ height: '1px', background: 'var(--border)' }} />

                                {/* Notifications */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--tx-main)' }}>Exam & Scraper Notifications</div>
                                        <div style={{ fontSize: '12px', color: 'var(--tx-dim)' }}>Receive real-time banners when university gazettes or marks are synchronized.</div>
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={notifications}
                                        onChange={e => setNotifications(e.target.checked)}
                                        style={{ width: '20px', height: '20px', accentColor: 'var(--primary)', cursor: 'pointer' }}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Tab 5: About & System */}
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
                        background: toast.type === 'error' ? '#991B1B' : 'var(--primary)',
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
                        {toast.type === 'error' ? 'error' : 'check_circle'}
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
