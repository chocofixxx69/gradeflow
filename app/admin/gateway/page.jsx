'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [systemToken, setSystemToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        const trimmedEmail = email.trim().toLowerCase();
        const trimmedPassword = password.trim();

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    role: 'admin',
                    email: trimmedEmail,
                    password: trimmedPassword,
                    systemToken,
                }),
            });
            const data = await res.json();

            if (!res.ok || !data.success || !data.session) {
                setError(data.error || 'Those credentials are not recognised.');
                return;
            }

            localStorage.setItem('admin_session', JSON.stringify(data.session));
            router.push('/admin/terminal');
        } catch (err) {
            setError('System error. Please try again later.');
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const s = {
        page: {
            minHeight: '100dvh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 'var(--space-5)',
        },
        card: {
            width: '100%', maxWidth: '420px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-7)', padding: 'var(--space-8)',
        },
        logoRow: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-6)' },
        logoBox: {
            width: '34px', height: '34px', background: 'var(--primary)',
            borderRadius: 'var(--radius-3)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '16px',
        },
        eyebrow: {
            fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            marginBottom: 'var(--space-2)', display: 'block',
        },
        heading: { fontSize: '26px', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: 'var(--space-2)' },
        subtext: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: 'var(--space-6)' },
        label: { display: 'block', fontSize: '12px', fontWeight: 700, color: 'var(--tx-muted)', marginBottom: 'var(--space-2)' },
        errorBox: {
            background: 'var(--red-bg)', border: '1px solid var(--red)', borderRadius: 'var(--radius-4)',
            padding: 'var(--space-3) var(--space-4)', fontSize: '13px', color: 'var(--red)',
            fontWeight: 600, marginBottom: 'var(--space-5)',
        },
        hintBox: {
            background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-4)',
            padding: 'var(--space-3) var(--space-4)', fontSize: '12px', color: 'var(--tx-muted)',
            fontWeight: 500, marginBottom: 'var(--space-5)', lineHeight: 1.6,
        },
        backRow: { textAlign: 'center', marginTop: 'var(--space-5)', fontSize: '13px' },
    };

    return (
        <div style={s.page} className="gf-fade-up">
            <div style={s.card}>
                <div style={s.logoRow}>
                    <div style={s.logoBox}>G</div>
                    <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>GradeFlow</span>
                </div>

                <span style={s.eyebrow}>Restricted Access</span>
                <h1 style={s.heading}>Admin panel.</h1>
                <p style={s.subtext}>This area is for platform administrators only.</p>



                {error && <div style={s.errorBox}>{error}</div>}

                <form onSubmit={handleLogin}>
                    <label style={s.label}>System Access Token</label>
                    <input
                        className="gf-input"
                        style={{ marginBottom: 'var(--space-5)', background: 'var(--surface-low)' }}
                        type="password"
                        placeholder="Private system key"
                        value={systemToken}
                        onChange={e => setSystemToken(e.target.value)}
                        required
                    />

                    <label style={s.label}>Admin Email</label>
                    <input
                        className="gf-input"
                        style={{ marginBottom: 'var(--space-5)', background: 'var(--surface-low)' }}
                        type="email"
                        placeholder="admin@gradeflow.in"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />

                    <label style={s.label}>Password</label>
                    <input
                        className="gf-input"
                        style={{ marginBottom: 'var(--space-5)', background: 'var(--surface-low)' }}
                        type="password"
                        placeholder="Admin password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        autoComplete="current-password"
                    />

                    <button
                        className="gf-btn gf-btn-primary"
                        style={{ width: '100%', marginTop: 'var(--space-1)', opacity: loading ? 0.7 : 1 }}
                        type="submit"
                        disabled={loading}
                    >
                        {loading ? 'Checking...' : 'Enter console'}
                    </button>
                </form>

                <div style={s.backRow}>
                    <Link href="/auth" style={{ color: 'var(--tx-muted)', fontWeight: 600, textDecoration: 'none', fontSize: '13px' }}>
                        ← Back to portal
                    </Link>
                </div>
            </div>
        </div>
    );
}
