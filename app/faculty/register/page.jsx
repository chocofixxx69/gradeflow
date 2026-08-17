'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, Input } from '@/components/ui/Foundation';
import { Card, CardContent } from '@/components/ui/Card';

export default function FacultyRegister() {
    const [form, setForm] = useState({ full_name: '', email: '', department: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true); setError('');
        try {
            // Use API route to bypass any client-side RLS / anon key restrictions
            const res = await fetch('/api/faculty/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    full_name: form.full_name.trim(),
                    email: form.email.trim().toLowerCase(),
                    department: form.department.trim(),
                    password: form.password,
                }),
            });

            const json = await res.json();

            if (!res.ok) {
                if (json.code === 'DUPLICATE_EMAIL') {
                    setError('A request with this email is already on file.');
                } else {
                    setError(json.error || 'Something went wrong. Please try again.');
                }
                return;
            }

            setSubmitted(true);
        } catch (err) {
            console.error('Faculty registration network error:', err);
            setError('Network error. Please check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    const s = {
        page: {
            minHeight: '100dvh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: 'var(--space-10) var(--page-px)',
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
        subtext: { fontSize: '14px', color: 'var(--tx-muted)', fontWeight: 500, lineHeight: 1.6, marginBottom: 'var(--space-8)' },
        errorBox: {
            background: 'var(--red-bg)', border: '1px solid var(--red)',
            borderRadius: 'var(--radius-2)', padding: '12px 16px',
            fontSize: '13px', color: 'var(--red)', fontWeight: 600, marginBottom: 'var(--space-5)',
        },
        divider: { height: '1px', background: 'var(--border)', margin: 'var(--space-7) 0' },
        footer: { textAlign: 'center', marginTop: 'var(--space-6)', fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500 },
        successIcon: {
            width: '56px', height: '56px', background: 'var(--surface-low)',
            borderRadius: 'var(--radius-4)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--tx-main)', marginBottom: 'var(--space-6)',
        },
        successHeading: { fontSize: '24px', fontWeight: 800, color: 'var(--tx-main)', letterSpacing: '-0.03em', marginBottom: 'var(--space-3)' },
        successText: { fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.6, marginBottom: 'var(--space-8)' },
    };

    if (submitted) {
        return (
            <div style={s.page} className="gf-fade-up">
                <Card style={{ width: '100%', maxWidth: '520px', padding: 'clamp(var(--space-7), 5vw, var(--space-9))' }}>
                    <CardContent>
                        <div style={s.successIcon}>
                            <span className="material-icons-round" style={{ fontSize: '28px' }}>mark_email_read</span>
                        </div>
                        <h1 style={s.successHeading}>Your request has been received.</h1>
                        <p style={s.successText}>
                            We review every faculty application personally. You will hear from us within 24 hours on the email address you provided.
                        </p>
                        <Link href="/auth" style={{ textDecoration: 'none' }}>
                            <Button fullWidth variant="primary" as="span">
                                Back to portal
                            </Button>
                        </Link>
                        <p style={{ ...s.footer, marginTop: '20px' }}>Requests are reviewed by the platform administrator.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div style={s.page} className="gf-fade-up">
            <Card style={{ width: '100%', maxWidth: '520px', padding: 'clamp(var(--space-7), 5vw, var(--space-9))' }}>
                <CardContent>
                    <Link href="/auth" style={s.backLink}>
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                        Back to portal options
                    </Link>

                    <div style={s.logoRow}>
                        <div style={s.logoBox}>G</div>
                        <span style={{ fontWeight: 800, fontSize: '16px', color: 'var(--tx-main)' }}>GradeFlow</span>
                    </div>

                    <h1 style={s.heading}>Request faculty access.</h1>
                    <p style={s.subtext}>
                        We review every request personally. You will hear back within 24 hours. Fill in the form accurately — we use it to verify your institutional role.
                    </p>

                    {error && <div style={s.errorBox}>{error}</div>}

                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <Input
                                label="Full Name"
                                placeholder="Dr. Priya Nair"
                                value={form.full_name}
                                onChange={handleChange('full_name')}
                                required
                            />
                        </div>

                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <Input
                                label="Institutional Email"
                                type="email"
                                placeholder="priya@anjuman.edu.in"
                                value={form.email}
                                onChange={handleChange('email')}
                                required
                            />
                        </div>

                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <Input
                                label="Department"
                                placeholder="Computer Science & Engineering"
                                value={form.department}
                                onChange={handleChange('department')}
                                required
                            />
                        </div>

                        <div style={{ marginBottom: 'var(--space-5)' }}>
                            <Input
                                label="Account Password"
                                type="password"
                                placeholder="••••••••"
                                value={form.password}
                                onChange={handleChange('password')}
                                required
                            />
                        </div>

                        <div style={s.divider} />

                        <Button type="submit" variant="primary" fullWidth loading={loading} disabled={loading}>
                            {loading ? 'Submitting...' : 'Submit Request'}
                        </Button>
                    </form>
                    <p style={s.footer}>Requests are reviewed by the platform administrator.</p>
                </CardContent>
            </Card>
        </div>
    );
}
