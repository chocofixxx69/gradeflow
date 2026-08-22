'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from '@/lib/api/client';
import AuthGuard from '../../components/AuthGuard';
import { Button, Input, Inline, Stack } from '@/components/ui/Foundation';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';

function SettingsContent() {
    const [session, setSession] = useState(null);
    const [userType, setUserType] = useState(null); // 'student' | 'faculty'
    const [profile, setProfile] = useState(null);
    const [photoUrl, setPhotoUrl] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [editName, setEditName] = useState('');
    const [editBranch, setEditBranch] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [editPhone, setEditPhone] = useState('');
    const [recoveryPin, setRecoveryPin] = useState('');
    const fileRef = useRef(null);
    const router = useRouter();

    useEffect(() => {
        const stuSession = localStorage.getItem('student_session');
        const facSession = localStorage.getItem('faculty_session');

        if (stuSession) {
            const parsed = JSON.parse(stuSession);
            setSession(parsed);
            setUserType('student');
            fetchStudentProfile(parsed.usn);
        } else if (facSession) {
            const parsed = JSON.parse(facSession);
            setSession(parsed);
            setUserType('faculty');
            setEditName(parsed.full_name || '');
            setEditEmail(parsed.email || '');
        }
        // AuthGuard handles the case where neither session exists
    }, []);

    const fetchStudentProfile = async (usn) => {
        try {
            const { data } = await supabase
                .from('students')
                .select('*')
                .eq('usn', usn.toUpperCase())
                .single();
            if (data) {
                setProfile(data);
                setPhotoUrl(data.photo_url || null);
                setEditName(data.name || '');
                setEditBranch(data.branch || '');
                setEditEmail(data.email || '');
                setEditPhone(data.phone || '');
                setRecoveryPin(data.recovery_pin || '');
            }
        } catch (e) {
            console.error('Profile fetch error:', e);
        }
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !session) return;

        // Validate — 25MB max
        if (file.size > 25 * 1024 * 1024) {
            setMessage('Photo must be under 25MB.');
            return;
        }
        if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'].includes(file.type)) {
            setMessage('Only JPG, PNG, WebP, GIF, or BMP files allowed.');
            return;
        }

        setUploading(true);
        setMessage('');

        try {
            const ext = file.name.split('.').pop();
            const identifier = userType === 'student' ? session.usn?.toLowerCase() : session.id || 'faculty';
            const path = `photos/${identifier}.${ext}`;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64 = ev.target.result;
                try {
                    await apiRequest('/api/student/settings', {
                        method: 'PATCH',
                        headers: { 'x-student-usn': session?.usn || '' },
                        body: JSON.stringify({ photo_url: base64 })
                    });
                    setPhotoUrl(base64);
                    const updated = { ...session, photo_url: base64 };
                    localStorage.setItem(userType === 'student' ? 'student_session' : 'faculty_session', JSON.stringify(updated));
                    setMessage('✓ Photo saved successfully!');
                    window.dispatchEvent(new Event('storage'));
                } catch {
                    setMessage('Upload failed. Try again.');
                }
            };
            reader.readAsDataURL(file);
        } catch (err) {
            console.error('Upload error:', err);
            setMessage('Upload failed. Try again.');
        } finally {
            setUploading(false);
        }
    };

    const saveProfile = async () => {
        if (!session) return;
        setSaving(true);
        setMessage('');

        try {
            await apiRequest('/api/student/settings', {
                method: 'PATCH',
                headers: { 'x-student-usn': session?.usn || '' },
                body: JSON.stringify({
                    full_name: editName,
                    email: editEmail,
                    branch: editBranch,
                    phone: editPhone
                })
            });

            const updatedSession = { ...session };
            if (userType === 'student') {
                updatedSession.name = editName;
                updatedSession.branch = editBranch;
                updatedSession.email = editEmail;
                updatedSession.phone = editPhone;
            } else {
                updatedSession.full_name = editName;
                updatedSession.name = editName;
                updatedSession.department = editBranch;
                updatedSession.email = editEmail;
            }

            localStorage.setItem(userType === 'student' ? 'student_session' : 'faculty_session', JSON.stringify(updatedSession));
            window.dispatchEvent(new Event('storage'));
            setMessage('✓ Profile saved successfully!');
        } catch (err) {
            console.error('Profile save error:', err);
            setMessage('Failed to save your profile. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('student_session');
        localStorage.removeItem('faculty_session');
        window.dispatchEvent(new Event('storage'));
        router.push('/auth');
    };

    const st = {
        row: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4) 0', borderBottom: '1px solid var(--border)' },
        rowLabel: { fontWeight: 700, fontSize: '14px', color: 'var(--tx-main)' },
        rowVal: { fontWeight: 600, fontSize: '14px', color: 'var(--tx-muted)' },
        photoContainer: { width: '100%' },
        avatar: {
            width: '80px', height: '80px', borderRadius: 'var(--radius-6)', objectFit: 'cover',
            background: 'var(--surface-low)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontSize: '32px', fontWeight: 900, color: 'var(--tx-dim)',
            border: '2px solid var(--border)', cursor: 'pointer', overflow: 'hidden',
            transition: 'border-color 0.15s',
        },
        msgBox: (ok) => ({
            padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-3)', fontSize: '13px', fontWeight: 700,
            background: ok ? 'var(--green-bg)' : 'var(--red-bg)',
            color: ok ? 'var(--green)' : 'var(--red)',
            border: `1px solid ${ok ? 'var(--green)' : 'var(--red)'}`,
            marginBottom: 'var(--space-5)',
        }),
    };

    return (
        <div className="gf-page gf-page-narrow gf-fade-up">
            <PageHeader>
                <PageHeaderEyebrow>Account</PageHeaderEyebrow>
                <PageHeaderTitle>Settings</PageHeaderTitle>
                <PageHeaderSubtitle>Manage your profile, photo, and application preferences.</PageHeaderSubtitle>
            </PageHeader>

            {message && <div style={st.msgBox(message.includes('✓'))}>{message}</div>}

            {/* Photo Upload — works for both student & faculty */}
            <Card style={{ marginBottom: 'var(--space-5)' }}>
                <CardHeader>
                    <CardTitle>Profile Photo</CardTitle>
                </CardHeader>
                <CardContent>
                    <Inline stackMobile style={st.photoContainer}>
                    <div
                        style={st.avatar}
                        role="button"
                        tabIndex={0}
                        aria-label="Upload profile photo"
                        onClick={() => fileRef.current?.click()}
                        onKeyDown={e => {
                            if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                fileRef.current?.click();
                            }
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--primary)'}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                    >
                        {photoUrl ? (
                            <img src={photoUrl} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                            <span>{(userType === 'student' ? session?.name : session?.full_name)?.charAt(0)?.toUpperCase() || 'U'}</span>
                        )}
                    </div>
                    <Stack size="sm">
                        <Button
                            onClick={() => fileRef.current?.click()}
                            disabled={uploading}
                            loading={uploading}
                            variant="primary"
                            style={{ width: 'auto' }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>upload</span>
                            {uploading ? 'Uploading...' : 'Upload Photo'}
                        </Button>
                        <p style={{ fontSize: '11px', color: 'var(--tx-dim)', marginTop: '8px' }}>JPG, PNG, WebP, GIF · Max 25MB</p>
                    </Stack>
                    </Inline>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} style={{ display: 'none' }} />
                </CardContent>
            </Card>

            {/* Profile Edit */}
            <Card style={{ marginBottom: 'var(--space-5)' }}>
                <CardHeader>
                    <CardTitle>Profile Information</CardTitle>
                </CardHeader>
                <CardContent>
                    <div style={{ display: 'grid', gap: 'var(--space-4)' }}>
                        <Input
                            label="Full Name"
                            value={editName}
                            onChange={e => setEditName(e.target.value)}
                            placeholder="Your full name"
                        />

                {userType === 'student' && (
                    <div style={{ marginTop: 'var(--space-4)' }}>
                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-1)' }}>Branch</label>
                        <select style={{ width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-3)', padding: 'var(--space-3) var(--space-4)', fontSize: '14px', fontWeight: 600, color: 'var(--tx-main)', outline: 'none', fontFamily: 'inherit', transition: 'border-color 0.15s' }} value={editBranch} onChange={e => setEditBranch(e.target.value)}>
                            <option value="">Select Branch</option>
                            <option value="CSE">Computer Science</option>
                            <option value="ISE">Information Science</option>
                            <option value="ECE">Electronics & Comm.</option>
                            <option value="EEE">Electrical & Electronics</option>
                            <option value="ME">Mechanical Engineering</option>
                            <option value="CIVIL">Civil Engineering</option>
                            <option value="AIML">AI & Machine Learning</option>
                            <option value="DS">Data Science</option>
                        </select>
                    </div>
                )}

                        <Input
                            label="Email"
                            value={editEmail}
                            onChange={e => setEditEmail(e.target.value)}
                            placeholder="your.email@example.com"
                            type="email"
                        />

                        {userType === 'student' && (
                            <Input
                                label="Phone"
                                value={editPhone}
                                onChange={e => setEditPhone(e.target.value)}
                                placeholder="+91 XXXXXXXXXX"
                                type="tel"
                            />
                        )}
                    </div>

                    <div style={{ marginTop: 'var(--space-6)' }}>
                        <Button onClick={saveProfile} disabled={saving} loading={saving} variant="primary" fullWidth>
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>save</span>
                            {saving ? 'Saving...' : 'Save Profile'}
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Read-Only Info */}
            <Card style={{ marginBottom: 'var(--space-5)' }}>
                <CardHeader>
                    <CardTitle>Account Details</CardTitle>
                </CardHeader>
                <CardContent>
                    <div style={st.row}>
                        <span style={st.rowLabel}>{userType === 'student' ? 'USN' : 'Role'}</span>
                        <span style={{ ...st.rowVal, fontFamily: 'monospace' }}>
                            {userType === 'student' ? (session?.usn || 'Not signed in') : 'Faculty'}
                        </span>
                    </div>
                    <div style={{ ...st.row, borderBottom: 'none' }}>
                        <span style={st.rowLabel}>Status</span>
                        <span style={{ ...st.rowVal, color: session ? '#059669' : '#d97706' }}>
                            {session ? 'Active' : 'Inactive'}
                        </span>
                    </div>
                </CardContent>
            </Card>

            {/* Recovery PIN Alert (Student Only) */}
            {userType === 'student' && recoveryPin && (
                <Card style={{ border: '1px solid var(--amber)', background: 'var(--amber-bg)', marginBottom: 'var(--space-5)' }}>
                    <CardContent>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <span className="material-icons-round" style={{ color: 'var(--amber)', fontSize: '24px' }}>vpn_key</span>
                            <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--amber)' }}>Recovery PIN</div>
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--tx-main)', fontWeight: 600, lineHeight: 1.5, marginBottom: '20px' }}>
                            This is your unique Recovery PIN. Please take a screenshot or write it down. You will need it to reset your password if you ever forget it.
                        </p>
                        <div style={{ background: 'var(--bg)', padding: '16px', borderRadius: '12px', textAlign: 'center', fontSize: 'clamp(22px, 8vw, 32px)', fontWeight: 900, letterSpacing: '0.12em', color: 'var(--tx-main)', border: '2px dashed var(--amber)', overflowWrap: 'anywhere' }}>
                            {recoveryPin}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* About & Engineering Team */}
            <Card style={{ marginBottom: 'var(--space-5)', border: '1px solid var(--border)' }}>
                <CardHeader>
                    <CardTitle>System & Engineering Team</CardTitle>
                </CardHeader>
                <CardContent>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div>
                            <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                                Developed & Maintained By
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'var(--surface-low)',
                                    border: '1px solid var(--border)',
                                    padding: '6px 12px',
                                    borderRadius: 'var(--radius-full)',
                                    fontWeight: 800,
                                    fontSize: '13px',
                                    color: 'var(--tx-main)'
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary)' }}>person</span>
                                    Mohammed Ainan Armar
                                </span>
                                <span style={{ color: 'var(--primary)', fontWeight: 900 }}>&</span>
                                <span style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    background: 'var(--surface-low)',
                                    border: '1px solid var(--border)',
                                    padding: '6px 12px',
                                    borderRadius: 'var(--radius-full)',
                                    fontWeight: 800,
                                    fontSize: '13px',
                                    color: 'var(--tx-main)'
                                }}>
                                    <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary)' }}>person</span>
                                    Rawahah Ruknuddin
                                </span>
                            </div>
                        </div>

                        <div style={{ height: '1px', background: 'var(--border)' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                Architecture & Engine
                            </span>
                            <span style={{ fontSize: '12px', color: 'var(--tx-main)', fontWeight: 700 }}>
                                GradeFlow v1.0 (VTU NEP Suite)
                            </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                            <span style={{ fontSize: '12px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                Infrastructure Partner
                            </span>
                            <a
                                href="https://automaticxai.online"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    fontSize: '12.5px',
                                    color: 'var(--primary)',
                                    fontWeight: 800,
                                    textDecoration: 'underline'
                                }}
                            >
                                automaticxai.online
                            </a>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Logout */}
            <Card style={{ marginBottom: 'var(--space-5)' }}>
                <CardHeader>
                    <CardTitle>Session</CardTitle>
                </CardHeader>
                <CardContent>
                    <Button onClick={handleLogout} variant="ghost" fullWidth style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>logout</span>
                        Sign Out
                    </Button>
                </CardContent>
            </Card>
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
