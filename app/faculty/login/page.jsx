'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@/components/ui/Foundation';
import { Card, CardContent } from '@/components/ui/Card';
import RaiseIssueModal from '@/components/RaiseIssueModal';

export default function FacultyLogin() {
    const router = useRouter();
    const [mode, setMode] = useState('login'); // 'login' | 'reset'

    // Login state
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);

    // Reset password state
    const [resetEmail, setResetEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [resetLoading, setResetLoading] = useState(false);

    // Feedback state
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setSuccess('');
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'faculty',
                    email: email.trim().toLowerCase(),
                    password,
                }),
            });
            const data = await res.json();

            if (!res.ok || !data.success || !data.session) {
                setError(data.error || 'Something went wrong. Please check your connection and try again.');
                return;
            }

            localStorage.removeItem('student_session');
            localStorage.setItem('faculty_session', JSON.stringify(data.session));
            window.dispatchEvent(new Event('storage'));
            router.push('/faculty/dashboard');
        } catch (err) {
            console.error('Faculty login error details:', err);
            setError('Something went wrong. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setError('');
        setSuccess('');

        const targetEmail = (resetEmail || email).trim().toLowerCase();
        if (!targetEmail) {
            setError('Please enter your institutional email.');
            return;
        }
        if (!newPassword || newPassword.length < 6) {
            setError('New password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setResetLoading(true);
        try {
            const res = await fetch('/api/faculty/reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: targetEmail,
                    password: newPassword,
                    confirmPassword: confirmPassword,
                }),
            });
            const data = await res.json();

            if (!res.ok || !data.success) {
                setError(data.error || 'Failed to reset password. Please verify your email.');
                return;
            }

            setSuccess('Password updated successfully! You can now sign in.');
            setEmail(targetEmail);
            setPassword('');
            setNewPassword('');
            setConfirmPassword('');

            // Automatically transition back to login view
            setTimeout(() => {
                setMode('login');
            }, 1600);
        } catch (err) {
            console.error('Faculty reset password error:', err);
            setError('Network error. Please check your connection and try again.');
        } finally {
            setResetLoading(false);
        }
    };

    const s = {
        page: {
            minHeight: '100dvh',
            background: 'var(--bg)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'var(--space-6)',
        },
        backLink: {
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            textDecoration: 'none',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--tx-muted)',
            marginBottom: 'var(--space-10)',
        },
        backButton: {
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--tx-muted)',
            marginBottom: 'var(--space-10)',
        },
        logoRow: {
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginBottom: 'var(--space-8)',
        },
        logoBox: {
            width: '36px',
            height: '36px',
            background: 'var(--primary)',
            borderRadius: 'var(--radius-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--bg)',
            fontWeight: 900,
            fontSize: '16px',
        },
        heading: {
            fontSize: '26px',
            fontWeight: 800,
            color: 'var(--tx-main)',
            letterSpacing: '-0.03em',
            marginBottom: 'var(--space-2)',
        },
        subtext: {
            fontSize: '14px',
            color: 'var(--tx-muted)',
            lineHeight: 1.6,
            marginBottom: 'var(--space-8)',
        },
        errorBox: {
            background: 'var(--red-bg)',
            border: '1px solid var(--red)',
            borderRadius: 'var(--radius-2)',
            padding: '12px 16px',
            fontSize: '13px',
            color: 'var(--red)',
            fontWeight: 600,
            marginBottom: 'var(--space-5)',
        },
        successBox: {
            background: 'var(--green-bg)',
            border: '1px solid var(--green)',
            borderRadius: 'var(--radius-2)',
            padding: '12px 16px',
            fontSize: '13px',
            color: 'var(--green)',
            fontWeight: 600,
            marginBottom: 'var(--space-5)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
        },
        divider: {
            height: '1px',
            background: 'var(--border)',
            margin: 'var(--space-7) 0',
        },
        requestLink: {
            textAlign: 'center',
            marginTop: 'var(--space-6)',
            fontSize: '13px',
            color: 'var(--tx-muted)',
            fontWeight: 600,
        },
        passwordRow: {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: '6px',
            marginBottom: 'var(--space-5)',
        },
        forgotBtn: {
            background: 'none',
            border: 'none',
            color: 'var(--primary)',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            padding: 0,
            transition: 'opacity var(--transition-fast)',
        },
    };

    return (
        <div style={s.page} className="gf-fade-up">
            <Card style={{ width: '100%', maxWidth: '440px', padding: 'clamp(var(--space-7), 5vw, var(--space-9))' }}>
                <CardContent>
                    {mode === 'login' ? (
                        <Link href="/auth" style={s.backLink}>
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                            Back to portal options
                        </Link>
                    ) : (
                        <button
                            type="button"
                            style={s.backButton}
                            onClick={() => {
                                setMode('login');
                                setError('');
                                setSuccess('');
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                            Back to Sign In
                        </button>
                    )}

                    <div style={s.logoRow}>
                        <div style={s.logoBox}>G</div>
                        <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>GradeFlow</span>
                    </div>

                    <h1 style={s.heading}>
                        {mode === 'login' ? 'Faculty sign in.' : 'Reset password.'}
                    </h1>
                    <p style={s.subtext}>
                        {mode === 'login'
                            ? 'Use your institutional email and the password you set during registration.'
                            : 'Enter your institutional email and set your new password.'}
                    </p>

                    {error && <div style={s.errorBox}>{error}</div>}
                    {success && (
                        <div style={s.successBox}>
                            <span className="material-icons-round" style={{ fontSize: '18px' }}>check_circle</span>
                            <span>{success}</span>
                        </div>
                    )}

                    {mode === 'login' ? (
                        /* LOGIN FORM */
                        <form onSubmit={handleLogin}>
                            <div style={{ marginBottom: 'var(--space-5)' }}>
                                <Input
                                    label="Institutional Email"
                                    type="email"
                                    placeholder="you@anjuman.edu.in"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: 'var(--space-2)' }}>
                                <Input
                                    label="Password"
                                    type="password"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    required
                                />
                            </div>

                            <div style={s.passwordRow}>
                                <span style={{ fontSize: '12px', color: 'var(--tx-dim)' }}>
                                    Faculty & Proctors
                                </span>
                                <button
                                    type="button"
                                    style={s.forgotBtn}
                                    onClick={() => {
                                        setMode('reset');
                                        setError('');
                                        setSuccess('');
                                        setResetEmail(email);
                                    }}
                                >
                                    Forgot password?
                                </button>
                            </div>

                            <div style={{ marginTop: 'var(--space-2)' }}>
                                <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>
                                    {loading ? 'Verifying...' : 'Sign in'}
                                </Button>
                            </div>
                        </form>
                    ) : (
                        /* RESET PASSWORD FORM (NO ACCESS KEY) */
                        <form onSubmit={handleResetPassword}>
                            <div style={{ marginBottom: 'var(--space-4)' }}>
                                <Input
                                    label="Institutional Email"
                                    type="email"
                                    placeholder="you@anjuman.edu.in"
                                    value={resetEmail}
                                    onChange={e => setResetEmail(e.target.value)}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: 'var(--space-4)' }}>
                                <Input
                                    label="New Password"
                                    type="password"
                                    placeholder="Minimum 6 characters"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    required
                                />
                            </div>

                            <div style={{ marginBottom: 'var(--space-5)' }}>
                                <Input
                                    label="Confirm New Password"
                                    type="password"
                                    placeholder="Re-enter new password"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    required
                                />
                            </div>

                            <Button type="submit" variant="primary" fullWidth loading={resetLoading} disabled={resetLoading}>
                                {resetLoading ? 'Updating Password...' : 'Reset Password'}
                            </Button>
                        </form>
                    )}

                    <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                        <button
                            type="button"
                            onClick={() => setIsIssueModalOpen(true)}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--tx-muted)',
                                fontSize: '12px',
                                fontWeight: 600,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px',
                            }}
                        >
                            <span className="material-icons-round" style={{ fontSize: '15px' }}>help_outline</span>
                            Having trouble? Raise issue to Admin
                        </button>
                    </div>

                    <div style={s.divider} />

                    <div style={s.requestLink}>
                        Don't have an account yet?{' '}
                        <Link href="/faculty/register" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                            Request faculty access
                        </Link>
                    </div>

                    <RaiseIssueModal
                        isOpen={isIssueModalOpen}
                        onClose={() => setIsIssueModalOpen(false)}
                        defaultUserType="faculty"
                        lockUserType={true}
                        defaultIdentifier={mode === 'login' ? email : resetEmail}
                    />
                </CardContent>
            </Card>
        </div>
    );
}
