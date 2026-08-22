'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Foundation';
import { Card, CardTitle } from '@/components/ui/Card';

export default function PortalEntry() {
    const s = {
        page: {
            minHeight: '100vh', background: 'var(--bg)',
            display: 'flex', flexDirection: 'column',
        },
        nav: {
            padding: '0 var(--page-px)', height: '72px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
        },
        logo: { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', textDecoration: 'none' },
        logoBox: {
            width: '34px', height: '34px', background: 'var(--primary)',
            borderRadius: 'var(--radius-3)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: 'var(--bg)', fontWeight: 900, fontSize: '16px',
        },
        logoText: { fontWeight: 800, fontSize: '18px', color: 'var(--tx-main)', letterSpacing: '-0.03em' },

        main: {
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 'var(--space-10) var(--page-px)',
        },
        container: { maxWidth: '960px', width: '100%' },

        eyebrow: {
            fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)',
            textTransform: 'uppercase', letterSpacing: '0.12em',
            marginBottom: 'var(--space-5)', display: 'block', textAlign: 'center',
        },
        heading: {
            fontSize: 'clamp(28px, 6vw, 48px)', fontWeight: 900, color: 'var(--tx-main)',
            letterSpacing: '-0.04em', lineHeight: 1.05,
            textAlign: 'center', marginBottom: 'var(--space-3)',
        },
        subheading: {
            fontSize: 'clamp(14px, 2.5vw, 17px)', fontWeight: 500, color: 'var(--tx-muted)',
            textAlign: 'center', marginBottom: 'var(--space-8)', lineHeight: 1.6,
        },
        cardTag: {
            fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)',
            textTransform: 'uppercase', letterSpacing: '0.1em',
            marginBottom: 'var(--space-4)', display: 'block',
        },
        cardDesc: {
            fontSize: '14px', fontWeight: 500, color: 'var(--tx-muted)',
            lineHeight: 1.6, marginBottom: 'var(--space-6)',
        },
        divider: { height: '1px', background: 'var(--border)', margin: 'var(--space-6) 0' },
        footer: {
            padding: 'var(--space-6) var(--page-px)',
            textAlign: 'center',
            borderTop: '1px solid var(--border)',
        },
        footerText: { fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500 },
    };

    return (
        <div style={s.page}>
            <nav style={s.nav}>
                <a href="/" style={s.logo}>
                    <div style={s.logoBox}>G</div>
                    <span style={s.logoText}>GradeFlow</span>
                </a>
                <span style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                    Academic Intelligence System
                </span>
            </nav>

            <main style={s.main} className="gf-fade-up">
                <div style={s.container}>
                    <span style={s.eyebrow}>Choose your role</span>
                    <h1 style={s.heading}>Where would you like to go?</h1>
                    <p style={s.subheading}>
                        Students can sign straight in. Faculty members can request access and we'll review it personally.
                    </p>

                    <div className="gf-auth-grid">
                        {/* Student Card */}
                        <Card style={{ padding: 'clamp(28px, 4vw, 48px)', boxShadow: 'var(--shadow-base)' }}>
                            <span style={s.cardTag}>For Students</span>
                            <CardTitle style={{ fontSize: 'clamp(20px, 3vw, 26px)', marginBottom: 'var(--space-2)' }}>Your academic record awaits.</CardTitle>
                            <p style={s.cardDesc}>
                                Sign in with your official @anjuman.edu.in email to view marks, calculate your SGPA, and track your semester progress.
                            </p>
                            <div style={s.divider}></div>
                            <Button as={Link} href="/auth/student?mode=login" fullWidth variant="primary">
                                Sign in as a student
                            </Button>
                            <Button as={Link} href="/auth/student?mode=activate" fullWidth variant="ghost" style={{ marginTop: 'var(--space-3)' }}>
                                First time? Activate your profile
                            </Button>
                        </Card>

                        {/* Faculty Card */}
                        <Card style={{ padding: 'clamp(28px, 4vw, 48px)', boxShadow: 'var(--shadow-base)' }}>
                            <span style={s.cardTag}>For Faculty</span>
                            <CardTitle style={{ fontSize: 'clamp(20px, 3vw, 26px)', marginBottom: 'var(--space-2)' }}>Institutional faculty access.</CardTitle>
                            <p style={s.cardDesc}>
                                Faculty members can sign in once approved, or send a request if you're joining for the first time. We review every request personally.
                            </p>
                            <div style={s.divider}></div>
                            <Button as={Link} href="/faculty/login" fullWidth variant="primary">
                                Sign in as faculty
                            </Button>
                            <Button as={Link} href="/faculty/register" fullWidth variant="ghost" style={{ marginTop: 'var(--space-3)' }}>
                                Request faculty access
                            </Button>
                        </Card>
                    </div>
                </div>
            </main>

            <footer style={{
                textAlign: 'center',
                padding: '24px 20px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px'
            }}>
                <div style={{
                    display: 'inline-flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px 10px',
                    fontSize: '12px',
                    color: 'var(--tx-muted)',
                    fontWeight: 600
                }}>
                    <span>Developed by</span>
                    <strong style={{ color: 'var(--tx-main)' }}>Mohammed Ainan Armar</strong>
                    <span style={{ color: 'var(--primary)' }}>&</span>
                    <strong style={{ color: 'var(--tx-main)' }}>Rawahah Ruknuddin</strong>
                    <span>· Powered by</span>
                    <a
                        href="https://automaticxai.online"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: 'var(--primary)', fontWeight: 800, textDecoration: 'underline' }}
                    >
                        automaticxai.online
                    </a>
                </div>
            </footer>
        </div>
    );
}
