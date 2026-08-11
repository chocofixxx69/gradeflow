'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function LandingPage() {
    const [dark, setDark] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem('theme');
        if (stored === 'dark') { setDark(true); document.documentElement.setAttribute('data-theme', 'dark'); }
    }, []);

    const toggleTheme = () => {
        const next = dark ? 'light' : 'dark';
        setDark(!dark);
        localStorage.setItem('theme', next);
        document.documentElement.setAttribute('data-theme', next);
    };

    const bg = dark ? '#171412' : '#FAFAF8';
    const border = dark ? '#2A2623' : '#E7E5E4';
    const txt = dark ? '#E8E3DF' : '#1C1917';
    const muted = dark ? '#6B6560' : '#78716C';
    const featureBg = dark ? '#171412' : '#FAFAF8';

    const s = {
        page: { minHeight: '100vh', background: bg, display: 'flex', flexDirection: 'column', color: txt, transition: 'background 0.3s, color 0.3s' },
        logo: { display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' },
        logoBox: {
            width: '34px', height: '34px', background: txt,
            borderRadius: '9px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: bg, fontWeight: 900, fontSize: '16px',
        },
        logoText: { fontWeight: 800, fontSize: '18px', color: txt, letterSpacing: '-0.03em' },

        navRight: { display: 'flex', alignItems: 'center', gap: '6px' },
        themeToggle: {
            background: 'none', border: 'none', cursor: 'pointer',
            color: muted, fontSize: '13px', padding: '8px', borderRadius: '8px',
            transition: 'color 0.2s', lineHeight: 1,
        },
        ghostBtn: {
            padding: '9px 20px', borderRadius: '10px', background: 'transparent',
            border: `1px solid ${border}`, fontWeight: 700, fontSize: '13px',
            color: txt, textDecoration: 'none', transition: 'all 0.15s',
        },

        hero: {
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            padding: '80px 24px', textAlign: 'center',
        },
        eyebrow: {
            fontSize: '11px', fontWeight: 800, color: muted,
            textTransform: 'uppercase', letterSpacing: '0.14em',
            marginBottom: '24px', display: 'block',
        },
        subtitle: {
            fontSize: 'clamp(15px, 3vw, 19px)', fontWeight: 500, color: muted,
            lineHeight: 1.6, maxWidth: '540px', marginBottom: '48px',
        },
        ctaRow: { display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' },
        mainCta: {
            padding: '14px 36px', background: txt, color: bg,
            borderRadius: '12px', fontWeight: 700, fontSize: '15px',
            textDecoration: 'none', transition: 'opacity 0.15s',
        },
        secondCta: {
            padding: '14px 36px', background: 'transparent', color: muted,
            border: `1px solid ${border}`, borderRadius: '12px',
            fontWeight: 700, fontSize: '15px', textDecoration: 'none',
            transition: 'all 0.15s',
        },

        featureCell: (hasBorder) => ({
            background: featureBg, padding: 'clamp(32px, 5vw, 56px) clamp(24px, 4vw, 48px)',
            borderLeft: hasBorder ? `1px solid ${border}` : 'none',
        }),
        featureNum: { fontSize: '11px', fontWeight: 800, color: muted, letterSpacing: '0.1em', marginBottom: '24px', display: 'block' },
        featureTitle: { fontSize: '20px', fontWeight: 800, color: txt, letterSpacing: '-0.02em', marginBottom: '12px' },
        featureText: { fontSize: '14px', color: muted, lineHeight: 1.8, fontWeight: 500 },

        footer: { textAlign: 'center', padding: '32px 24px', borderTop: `1px solid ${border}` },
        footerText: { fontSize: '12px', color: muted, fontWeight: 500 },
    };

    return (
        <div style={s.page}>
            <nav className="gf-landing-nav" style={{ borderBottom: `1px solid ${border}` }}>
                <a href="/" style={s.logo}>
                    <div style={s.logoBox}>G</div>
                    <span style={s.logoText}>GradeFlow</span>
                </a>
                <div style={s.navRight}>
                    <button
                        style={s.themeToggle}
                        onClick={toggleTheme}
                        title={dark ? 'Switch to light' : 'Switch to dark'}
                        aria-label="Toggle theme"
                    >
                        <span className="material-icons-round" style={{ fontSize: '17px', display: 'block' }}>
                            {dark ? 'light_mode' : 'dark_mode'}
                        </span>
                    </button>

                    <Link href="/auth" style={s.ghostBtn}>Sign in</Link>
                </div>
            </nav>

            <section style={s.hero} className="gf-fade-up">
                <span style={s.eyebrow}>VTU CGPA · SGPA · Student Progress Tracker</span>
                <h1 className="gf-hero-title" style={{ color: txt, marginBottom: '24px', maxWidth: '800px' }}>
                    Track it.<br />Understand it.
                </h1>
                <p style={s.subtitle}>
                    GradeFlow calculates your SGPA and CGPA semester by semester, surfaces every pending backlog, and gives you an honest, data-backed picture of your academic standing. Built for VTU students and faculty.
                </p>
                <div style={s.ctaRow}>
                    <Link href="/auth/student" style={s.mainCta}>
                        Sign in as student
                    </Link>
                    <Link href="/faculty/login" style={s.secondCta}>
                        Faculty access
                    </Link>
                </div>
            </section>

            <section className="gf-features-grid" style={{ borderTop: `1px solid ${border}` }}>
                <div style={s.featureCell(false)}>
                    <span style={s.featureNum}>01</span>
                    <h3 style={s.featureTitle}>Live CGPA & SGPA, every semester.</h3>
                    <p style={s.featureText}>Automatically calculates your SGPA per semester and your cumulative CGPA across all semesters, using the official VTU credit-based grading system. No formulas to memorise.</p>
                </div>
                <div style={s.featureCell(true)}>
                    <span style={s.featureNum}>02</span>
                    <h3 style={s.featureTitle}>Your academic reality check.</h3>
                    <p style={s.featureText}>Every failed or absent subject is flagged across all semesters, so nothing slips through undetected before the next exam cycle. Know what you owe before it catches you off guard.</p>
                </div>
                <div style={s.featureCell(true)}>
                    <span style={s.featureNum}>03</span>
                    <h3 style={s.featureTitle}>Full institutional dashboard for faculty.</h3>
                    <p style={s.featureText}>Faculty get a class-wide view of student performance: semester scores, pending subjects, and progress trends, all auto-scraped from VTU results. No spreadsheets, no manual entry.</p>
                </div>
            </section>

            <footer style={s.footer}>
                <p style={s.footerText}>© 2026 GradeFlow · Academic Intelligence System · Private Institutional Network</p>
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <p style={{ ...s.footerText, fontSize: '11px', opacity: 0.7 }}>
                        Developed by <strong>Mohammed Ainan Armar</strong> & <strong>Rawahah Ruknuddin</strong>
                    </p>
                    <p style={{ ...s.footerText, opacity: 0.9 }}>
                        Powered by{' '}
                        <a href="https://automaticxai.online" target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'underline', fontWeight: 800 }}>
                            automaticxai.online
                        </a>
                    </p>
                </div>
            </footer>
        </div>
    );
}
