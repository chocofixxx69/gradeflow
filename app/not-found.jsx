'use client';

import Link from 'next/link';

export default function NotFound() {
    return (
        <div style={{
            minHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px',
            textAlign: 'center',
            fontFamily: 'inherit',
            background: 'var(--bg, #f8fafc)',
            color: 'var(--tx-main, #0f172a)',
        }}>
            <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '16px',
                background: 'rgba(239, 68, 68, 0.1)',
                color: '#ef4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '24px',
                fontWeight: 900,
                marginBottom: '16px',
            }}>
                404
            </div>
            <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '8px' }}>Page Not Found</h1>
            <p style={{ fontSize: '14px', color: 'var(--tx-muted, #64748b)', maxWidth: '400px', marginBottom: '24px' }}>
                The requested page could not be located. It may have moved or the link may be outdated.
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
                <Link
                    href="/dashboard"
                    style={{
                        padding: '10px 20px',
                        background: 'var(--primary, #0f766e)',
                        color: '#fff',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '13px',
                    }}
                >
                    Go to Dashboard
                </Link>
                <Link
                    href="/"

                    style={{
                        padding: '10px 20px',
                        background: 'var(--surface, #ffffff)',
                        border: '1px solid var(--border, #e2e8f0)',
                        color: 'var(--tx-main, #0f172a)',
                        borderRadius: '8px',
                        textDecoration: 'none',
                        fontWeight: 700,
                        fontSize: '13px',
                    }}
                >
                    Home
                </Link>
            </div>
        </div>
    );
}
