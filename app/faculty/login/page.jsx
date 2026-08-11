'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button, Input } from '@/components/ui/Foundation';
import { Card, CardContent } from '@/components/ui/Card';

export default function FacultyLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const router = useRouter();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'faculty',
                    email,
                    password,
                }),
            });
            const data = await res.json();

            if (!res.ok || !data.success || !data.session) {
                setError(data.error || 'Something went wrong. Please check your connection and try again.');
                return;
            }

            localStorage.removeItem('student_session'); // Ensure no conflicting sessions
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

    const s = {
        page: {
            minHeight: '100vh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 'var(--space-6)',
        },
        backLink: {
            display: 'flex', alignItems: 'center', gap: 'var(--space-1)',
            textDecoration: 'none', fontSize: '13px', fontWeight: 600,
            color: 'var(--tx-muted)', marginBottom: 'var(--space-10)',
        },
        logoRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-8)' },
        logoBox: {
            width: '36px', height: '36px', background: 'var(--primary)',
            borderRadius: 'var(--radius-3)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '16px',
        },
        heading: { fontSize: '26px', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: 'var(--space-2)' },
        subtext: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: 'var(--space-8)' },
        errorBox: {
            background: 'var(--red-bg)', border: '1px solid var(--red)',
            borderRadius: 'var(--radius-2)', padding: '12px 16px',
            fontSize: '13px', color: 'var(--red)', fontWeight: 600, marginBottom: 'var(--space-5)',
        },
        divider: { height: '1px', background: 'var(--border)', margin: 'var(--space-7) 0' },
        requestLink: {
            textAlign: 'center', marginTop: 'var(--space-6)',
            fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600,
        },
    };

    return (
        <div style={s.page} className="gf-fade-up">
            <Card style={{ width: '100%', maxWidth: '440px', padding: 'clamp(var(--space-7), 5vw, var(--space-9))' }}>
                <CardContent>
                    <Link href="/auth" style={s.backLink}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                        Back to portal options
                    </Link>

                    <div style={s.logoRow}>
                        <div style={s.logoBox}>G</div>
                        <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>GradeFlow</span>
                    </div>

                    <h1 style={s.heading}>Faculty sign in.</h1>
                    <p style={s.subtext}>
                        Use your institutional email and the password you set during registration.
                    </p>

                    {error && <div style={s.errorBox}>{error}</div>}

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

                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <Input
                                label="Password"
                                type="password"
                                placeholder="••••••••"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                            />
                        </div>

                        <div style={{ marginTop: 'var(--space-2)' }}>
                            <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>
                                {loading ? 'Verifying...' : 'Sign in'}
                            </Button>
                        </div>
                    </form>

                    <div style={s.divider} />

                    <div style={s.requestLink}>
                        Don't have an account yet?{' '}
                        <Link href="/faculty/register" style={{ color: 'var(--primary)', fontWeight: 700 }}>
                            Request faculty access
                        </Link>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
