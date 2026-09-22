'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@/components/ui/Foundation';
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
            localStorage.removeItem('admin_session');
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

    const alertStyle = {
        error: {
            background: 'var(--red-bg)',
            border: '1px solid var(--red-border)',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '13px',
            color: 'var(--red)',
            fontWeight: 600,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            lineHeight: 1.45,
        },
        success: {
            background: 'var(--green-bg)',
            border: '1px solid var(--green-border)',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '13px',
            color: 'var(--green)',
            fontWeight: 600,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            lineHeight: 1.45,
        }
    };

    return (
        <div className="gf-auth-page gf-fade-up">
            <div className="gf-auth-card">
                {mode === 'login' ? (
                    <Link href="/auth" className="gf-auth-back">
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>arrow_back</span>
                        <span>Back to portal options</span>
                    </Link>
                ) : (
                    <button
                        type="button"
                        className="gf-auth-back"
                        onClick={() => {
                            setMode('login');
                            setError('');
                            setSuccess('');
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '18px' }}>arrow_back</span>
                        <span>Back to Sign In</span>
                    </button>
                )}

                <div className="gf-auth-brand">
                    <div className="gf-auth-brand-logo">G</div>
                    <span className="gf-auth-brand-title">GradeFlow</span>
                    <span className="gf-auth-brand-badge">Faculty</span>
                </div>

                <h1 className="gf-auth-heading">
                    {mode === 'login' ? 'Faculty sign in.' : 'Reset password.'}
                </h1>
                <p className="gf-auth-subtext">
                    {mode === 'login'
                        ? 'Use your institutional email and the password you set during registration.'
                        : 'Enter your institutional email and set your new password.'}
                </p>

                {error && (
                    <div style={alertStyle.error}>
                        <span className="material-icons-round" style={{ fontSize: '18px', flexShrink: 0 }}>error_outline</span>
                        <span>{error}</span>
                    </div>
                )}
                {success && (
                    <div style={alertStyle.success}>
                        <span className="material-icons-round" style={{ fontSize: '18px', flexShrink: 0 }}>check_circle</span>
                        <span>{success}</span>
                    </div>
                )}

                {mode === 'login' ? (
                    /* LOGIN FORM */
                    <form onSubmit={handleLogin}>
                        <div style={{ marginBottom: '16px' }}>
                            <Input
                                label="Institutional Email"
                                type="email"
                                placeholder="you@anjuman.edu.in"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div style={{ marginBottom: '4px' }}>
                            <Input
                                label="Password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                autoComplete="current-password"
                            />
                        </div>

                        <div className="gf-auth-pwd-row">
                            <span style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                Faculty & Proctors
                            </span>
                            <button
                                type="button"
                                className="gf-auth-forgot-btn"
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

                        <div style={{ marginTop: '8px' }}>
                            <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading} size="lg">
                                {loading ? 'Verifying...' : 'Sign in'}
                            </Button>
                        </div>
                    </form>
                ) : (
                    /* RESET PASSWORD FORM (NO ACCESS KEY) */
                    <form onSubmit={handleResetPassword}>
                        <div style={{ marginBottom: '16px' }}>
                            <Input
                                label="Institutional Email"
                                type="email"
                                placeholder="you@anjuman.edu.in"
                                value={resetEmail}
                                onChange={e => setResetEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <Input
                                label="New Password"
                                type="password"
                                placeholder="Minimum 6 characters"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                        </div>

                        <div style={{ marginBottom: '20px' }}>
                            <Input
                                label="Confirm New Password"
                                type="password"
                                placeholder="Re-enter new password"
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                            />
                        </div>

                        <Button type="submit" variant="primary" fullWidth loading={resetLoading} disabled={resetLoading} size="lg">
                            {resetLoading ? 'Updating Password...' : 'Reset Password'}
                        </Button>
                    </form>
                )}

                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '16px' }}>
                    <button
                        type="button"
                        onClick={() => setIsIssueModalOpen(true)}
                        className="gf-auth-issue-btn"
                    >
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>help_outline</span>
                        <span>Having trouble? Raise issue to Admin</span>
                    </button>
                </div>

                <div className="gf-auth-divider" />

                <div className="gf-auth-footer-link">
                    Don't have an account yet?
                    <Link href="/faculty/register">
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
            </div>
        </div>
    );
}
