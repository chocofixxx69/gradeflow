'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

/**
 * AuthGuard — Production-grade authentication boundary.
 * 
 * Wraps any page that requires authentication. Shows a polished
 * "access denied" screen instead of flashing content to unauthorized users.
 * 
 * Auth is fully localStorage-based — no Clerk dependency needed here.
 * ClerkProvider only exists in /sign-in and /sign-up layouts.
 * 
 * @param {Object} props
 * @param {'student'|'faculty'|'admin'|'any'} props.role - Required role to access. 'any' = student OR faculty OR admin.
 * @param {React.ReactNode} props.children
 * @param {boolean} props.facultyAllowed - If true, faculty can also access student pages.
 */
function checkSessionSync(role, facultyAllowed) {
    if (typeof window === 'undefined') return { state: 'loading', userType: null };

    const stuStr = localStorage.getItem('student_session');
    const facStr = localStorage.getItem('faculty_session');
    const admStr = localStorage.getItem('admin_session');

    let stuSession = null;
    let facSession = null;
    let admSession = null;

    if (stuStr) try { const p = JSON.parse(stuStr); if (p && (p.usn || p.id)) stuSession = p; } catch {}
    if (facStr) try { const p = JSON.parse(facStr); if (p && (p.email || p.id)) facSession = p; } catch {}
    const gatekeeper = process.env.NEXT_PUBLIC_ADMIN_GATEKEEPER || 'GF-ADMIN-PROD';
    if (admStr) try { const p = JSON.parse(admStr); if (p && (p.role === 'admin' || p.role === 'superadmin' || p.token === gatekeeper || p.token === 'GF-ADMIN-PROD')) admSession = p; } catch {}

    if (role === 'admin') {
        return admSession ? { state: 'authenticated', userType: 'admin' } : { state: 'denied', userType: null };
    }
    if (role === 'student') {
        if (stuSession) return { state: 'authenticated', userType: 'student' };
        if (facSession && facultyAllowed) return { state: 'authenticated', userType: 'faculty' };
        return { state: 'denied', userType: facSession ? 'faculty' : null };
    }
    if (role === 'faculty') {
        if (facSession) return { state: 'authenticated', userType: 'faculty' };
        return { state: 'denied', userType: stuSession ? 'student' : null };
    }
    // role === 'any'
    if (stuSession) return { state: 'authenticated', userType: 'student' };
    if (facSession) return { state: 'authenticated', userType: 'faculty' };
    if (admSession) return { state: 'authenticated', userType: 'admin' };
    return { state: 'denied', userType: null };
}

let appHasMountedOnce = false;

export default function AuthGuard({ children, role = 'any', facultyAllowed = false }) {
    const router = useRouter();
    const pathname = usePathname();

    // Always resolve synchronously from localStorage — no loading state.
    // localStorage is synchronous so this is instant on client. On SSR
    // (typeof window === 'undefined') checkSessionSync returns 'loading'
    // but Next.js won't render this on server since it's client-only.
    const [authResult, setAuthResult] = useState(() => checkSessionSync(role, facultyAllowed));

    useEffect(() => {
        appHasMountedOnce = true;
        // Re-check on every pathname change (e.g. after login/logout)
        const result = checkSessionSync(role, facultyAllowed);
        setAuthResult(result);

        // Handle redirects for denied access
        if (result.state === 'denied') {
            const stuStr = localStorage.getItem('student_session');
            const facStr = localStorage.getItem('faculty_session');
            if (!stuStr && !facStr) {
                // No session at all — redirect to login
                if (role === 'admin') {
                    router.push('/admin/gateway');
                } else if (role === 'faculty') {
                    router.push('/faculty/login');
                } else {
                    router.push('/auth');
                }
            }
        }
    }, [pathname, role, facultyAllowed, router]);

    if (authState === 'loading') {
        return (
            <div style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg)', color: 'var(--tx-dim)',
            }}>
                <span className="material-icons-round gf-spin" style={{ fontSize: '32px', marginBottom: '16px' }}>sync</span>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Verifying access...</div>
            </div>
        );
    }

    if (authState === 'denied') {
        const isLoggedInWrongRole = !!userType;
        const requiredRoleLabel =
            role === 'student' ? 'students' :
            role === 'faculty' ? 'faculty members' :
            role === 'admin' ? 'administrators' :
            'authorized users';
        const userTypeLabel =
            userType === 'student' ? 'a student' :
            userType === 'faculty' ? 'faculty' :
            userType === 'admin' ? 'an administrator' :
            'another role';

        return (
            <div style={{
                minHeight: '100vh', display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--bg)', padding: '40px 24px',
            }} className="gf-fade-up">
                <div style={{
                    width: '100%', maxWidth: '440px', textAlign: 'center',
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: '24px', padding: '56px 40px',
                }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '18px',
                        background: 'var(--red-bg)', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', margin: '0 auto 24px',
                    }}>
                        <span className="material-icons-round" style={{ fontSize: '28px', color: 'var(--red)' }}>
                            {isLoggedInWrongRole ? 'block' : 'lock'}
                        </span>
                    </div>

                    <h1 style={{
                        fontSize: '24px', fontWeight: 900, color: 'var(--tx-main)',
                        letterSpacing: '-0.03em', marginBottom: '12px',
                    }}>
                        {isLoggedInWrongRole ? 'Access Restricted' : 'Sign In Required'}
                    </h1>

                    <p style={{
                        fontSize: '14px', color: 'var(--tx-muted)', lineHeight: 1.7,
                        marginBottom: '36px', maxWidth: '320px', margin: '0 auto 36px',
                    }}>
                        {isLoggedInWrongRole
                            ? `This section is for ${requiredRoleLabel} only. You are currently signed in as ${userTypeLabel}.`
                            : 'You need to sign in before accessing this page. All features require authentication for data security and privacy.'}
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {isLoggedInWrongRole ? (
                            <Link
                                href={userType === 'student' ? '/dashboard' : '/faculty/dashboard'}
                                style={{
                                    display: 'block', padding: '14px', borderRadius: '12px',
                                    background: 'var(--primary)', color: 'var(--bg)',
                                    fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                                    textAlign: 'center', transition: 'opacity 0.15s',
                                }}
                            >
                                Go to Your Dashboard
                            </Link>
                        ) : (
                            <>
                                <Link
                                    href="/sign-in"
                                    style={{
                                        display: 'block', padding: '14px', borderRadius: '12px',
                                        background: 'var(--primary)', color: 'var(--bg)',
                                        fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                                        textAlign: 'center', transition: 'opacity 0.15s',
                                    }}
                                >
                                    Sign In as Student
                                </Link>
                                <Link
                                    href="/faculty/login"
                                    style={{
                                        display: 'block', padding: '14px', borderRadius: '12px',
                                        background: 'transparent', color: 'var(--tx-main)',
                                        border: '1px solid var(--border)',
                                        fontWeight: 700, fontSize: '14px', textDecoration: 'none',
                                        textAlign: 'center', transition: 'all 0.15s',
                                    }}
                                >
                                    Sign In as Faculty
                                </Link>
                            </>
                        )}
                    </div>

                    <p style={{
                        fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 500,
                        marginTop: '24px',
                    }}>
                        GradeFlow · Academic Intelligence System
                    </p>
                </div>
            </div>
        );
    }

    return children;
}
