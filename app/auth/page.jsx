'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/Foundation';
import { Card, CardTitle } from '@/components/ui/Card';

export default function PortalEntry() {
    const s = {
        page: {
            minHeight: '100vh',
            background: 'var(--bg)',
            backgroundImage: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(23, 75, 77, 0.08) 0%, rgba(253, 246, 237, 0.5) 50%, transparent 85%)',
            display: 'flex',
            flexDirection: 'column',
        },
        nav: {
            padding: '0 var(--page-px)',
            height: '68px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(255, 255, 255, 0.92)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            position: 'sticky',
            top: 0,
            zIndex: 'var(--z-topbar)',
        },
        logo: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' },
        logoBox: {
            width: '36px',
            height: '36px',
            background: 'var(--primary)',
            borderRadius: 'var(--radius-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFFFFF',
            fontWeight: 900,
            fontSize: '17px',
            boxShadow: '0 2px 6px rgba(23, 75, 77, 0.2)',
        },
        logoText: { fontWeight: 800, fontSize: '17px', color: 'var(--tx-main)', letterSpacing: '-0.03em', lineHeight: 1.15 },
        logoBadge: { fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em' },

        main: {
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 'clamp(36px, 6vw, 64px) var(--page-px)',
        },
        container: { maxWidth: '960px', width: '100%' },

        eyebrow: {
            fontSize: '11px',
            fontWeight: 800,
            color: 'var(--primary)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            marginBottom: 'var(--space-3)',
            display: 'block',
            textAlign: 'center',
        },
        heading: {
            fontSize: 'clamp(28px, 5vw, 44px)',
            fontWeight: 900,
            color: 'var(--tx-main)',
            letterSpacing: '-0.04em',
            lineHeight: 1.08,
            textAlign: 'center',
            marginBottom: 'var(--space-3)',
        },
        subheading: {
            fontSize: 'clamp(14px, 2vw, 17px)',
            fontWeight: 500,
            color: 'var(--tx-muted)',
            textAlign: 'center',
            marginBottom: 'clamp(32px, 5vw, 48px)',
            lineHeight: 1.6,
            maxWidth: '560px',
            marginLeft: 'auto',
            marginRight: 'auto',
        },
        cardTag: {
            fontSize: '11px',
            fontWeight: 800,
            color: 'var(--primary)',
            background: 'var(--surface-low)',
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 'var(--space-4)',
            display: 'inline-block',
            alignSelf: 'flex-start',
        },
        cardDesc: {
            fontSize: '14px',
            fontWeight: 500,
            color: 'var(--tx-muted)',
            lineHeight: 1.65,
            marginBottom: 'var(--space-6)',
        },
        divider: { height: '1px', background: 'var(--border)', margin: 'var(--space-6) 0' },
    };

    return (
        <div style={s.page}>
            <nav style={s.nav}>
                <Link href="/" style={s.logo}>
                    <div style={s.logoBox}>G</div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={s.logoText}>GradeFlow</span>
                        <span style={s.logoBadge}>Academic Intelligence</span>
                    </div>
                </Link>
                <Link
                    href="/"
                    style={{
                        fontSize: '13px',
                        color: 'var(--primary)',
                        fontWeight: 700,
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 12px',
                        borderRadius: 'var(--radius-2)',
                        background: 'var(--surface-low)',
                        border: '1px solid var(--border)',
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                    <span>Back to Home</span>
                </Link>
            </nav>

            <main style={s.main} className="gf-fade-up">
                <div style={s.container}>
                    <span style={s.eyebrow}>Choose your role</span>
                    <h1 style={s.heading}>Where would you like to go?</h1>
                    <p style={s.subheading}>
                        Students can sign straight in with USN. Faculty members can access the institutional command center.
                    </p>

                    <div className="gf-auth-grid" style={{ alignItems: 'stretch' }}>
                        {/* Student Card */}
                        <Card style={{
                            padding: 'clamp(28px, 4vw, 44px)',
                            boxShadow: 'var(--shadow-base)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            height: '100%',
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <span style={s.cardTag}>For Students</span>
                                <CardTitle style={{
                                    fontSize: 'clamp(20px, 2.5vw, 24px)',
                                    marginBottom: 'var(--space-3)',
                                    lineHeight: 1.2,
                                    minHeight: '56px',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}>
                                    Your academic record awaits.
                                </CardTitle>
                                <p style={s.cardDesc}>
                                    Sign in with your official USN to view semester marks, calculate live SGPA & CGPA, and track your backlog clearance.
                                </p>
                            </div>
                            <div style={{ marginTop: 'auto' }}>
                                <div style={s.divider}></div>
                                <Button as={Link} href="/auth/student?mode=login" fullWidth variant="primary" iconEnd="arrow_forward">
                                    Sign in as student
                                </Button>
                                <Button as={Link} href="/auth/student?mode=activate" fullWidth variant="ghost" style={{ marginTop: 'var(--space-3)' }}>
                                    First time? Activate profile
                                </Button>
                            </div>
                        </Card>

                        {/* Faculty Card */}
                        <Card style={{
                            padding: 'clamp(28px, 4vw, 44px)',
                            boxShadow: 'var(--shadow-base)',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            height: '100%',
                        }}>
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                                <span style={s.cardTag}>For Faculty</span>
                                <CardTitle style={{
                                    fontSize: 'clamp(20px, 2.5vw, 24px)',
                                    marginBottom: 'var(--space-3)',
                                    lineHeight: 1.2,
                                    minHeight: '56px',
                                    display: 'flex',
                                    alignItems: 'center',
                                }}>
                                    Institutional faculty access.
                                </CardTitle>
                                <p style={s.cardDesc}>
                                    Instructors and proctors can sign in to view class averages, perform deep USN result lookups, and export student reports.
                                </p>
                            </div>
                            <div style={{ marginTop: 'auto' }}>
                                <div style={s.divider}></div>
                                <Button as={Link} href="/faculty/login" fullWidth variant="primary" iconEnd="login">
                                    Sign in as faculty
                                </Button>
                                <Button as={Link} href="/faculty/register" fullWidth variant="ghost" style={{ marginTop: 'var(--space-3)' }}>
                                    Request faculty access
                                </Button>
                            </div>
                        </Card>
                    </div>
                </div>
            </main>
        </div>
    );
}
