import { SignIn } from "@clerk/nextjs";
import Link from 'next/link';

export default function SignInPage() {
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
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 'var(--space-10) var(--page-px)', position: 'relative', overflow: 'hidden'
        },
        backgroundMesh: {
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            background: 'radial-gradient(at 0% 0%, rgba(28, 25, 23, 0.03) 0, transparent 50%), radial-gradient(at 100% 100%, rgba(120, 113, 108, 0.05) 0, transparent 50%)',
            zIndex: 0
        },
        contentWrap: {
            position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '440px'
        },
        headerText: {
            textAlign: 'center', marginBottom: 'var(--space-6)'
        },
        tag: {
            display: 'inline-block', padding: '6px 14px', background: 'var(--surface-low)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-full)', fontSize: '11px',
            fontWeight: 800, color: 'var(--tx-muted)', letterSpacing: '0.08em', textTransform: 'uppercase',
            marginBottom: 'var(--space-4)'
        },
        title: {
            fontSize: 'clamp(28px, 5vw, 36px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: 'var(--space-3)', lineHeight: 1.1
        },
        subtitle: {
             fontSize: '15px', color: 'var(--tx-muted)', fontWeight: 500, lineHeight: 1.6
        }
    };

    return (
        <div style={s.page}>
             <nav style={s.nav}>
                 <Link href="/auth" style={s.logo}>
                        <div style={s.logoBox}>G</div>
                        <span style={s.logoText}>GradeFlow</span>
                  </Link>
                 <span style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                        Student Authentication
                 </span>
            </nav>
            <main style={s.main} className="gf-fade-up">
                <div style={s.backgroundMesh} />
                 <div style={s.contentWrap}>
                     <div style={s.headerText}>
                        <span style={s.tag}>Secure Portal</span>
                        <h1 style={s.title}>Welcome back.</h1>
                        <p style={s.subtitle}>Sign in with your official @anjuman.edu.in email (e.g. 2ab23cs001@anjuman.edu.in) to access your personalized academic dashboard.</p>
                     </div>
                     
                     <SignIn appearance={{ 
                          layout: {
                              socialButtonsPlacement: 'bottom',
                              logoPlacement: 'none',
                          },
                          elements: { 
                               rootBox: { width: '100%' },
                               card: { width: '100%', boxShadow: 'var(--shadow-lg)', borderRadius: 'var(--radius-4)', border: '1px solid var(--border)', background: 'var(--surface)', padding: 'var(--space-5) var(--space-2)' },
                               headerTitle: { color: 'var(--tx-main)', fontSize: '20px', fontWeight: 800, display: 'none' },
                               headerSubtitle: { display: 'none' },
                               socialButtonsBlockButton: { border: '1px solid var(--border)', borderRadius: 'var(--radius-2)', padding: '12px' },
                               socialButtonsBlockButtonText: { fontWeight: 600, color: 'var(--tx-main)' },
                               dividerLine: { background: 'var(--border)' },
                               dividerText: { color: 'var(--tx-muted)', fontSize: '12px', fontWeight: 600 },
                               formFieldLabel: { color: 'var(--tx-muted)', fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.04em' },
                               formFieldInput: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-2)', padding: '14px 16px', color: 'var(--tx-main)', fontWeight: 600, fontSize: '14px', outline: 'none' },
                               formButtonPrimary: { background: 'var(--primary)', color: 'var(--bg)', borderRadius: 'var(--radius-2)', padding: '14px', fontWeight: 700, fontSize: '14px', transition: 'opacity 0.2s', textTransform: 'none', boxShadow: 'none' },
                               footerActionText: { color: 'var(--tx-muted)', fontWeight: 500 },
                               footerActionLink: { color: 'var(--primary)', fontWeight: 800 },
                               identityPreview: { background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: 'var(--radius-2)' },
                               identityPreviewText: { color: 'var(--tx-main)', fontWeight: 600 },
                               identityPreviewEditButtonIcon: { color: 'var(--tx-muted)' }
                          }
                     }} />
                 </div>
            </main>
        </div>
    );
}
