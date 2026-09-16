'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }) {
    useEffect(() => {
        console.error('[App Error Boundary]', error);
    }, [error]);

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
                fontSize: '28px',
                marginBottom: '16px',
            }}>
                ⚠️
            </div>
            <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Something went wrong</h1>
            <p style={{ fontSize: '13px', color: 'var(--tx-muted, #64748b)', maxWidth: '420px', marginBottom: '20px' }}>
                An unexpected error occurred while rendering this page.
            </p>
            <button
                onClick={() => reset ? reset() : window.location.reload()}
                style={{
                    padding: '10px 22px',
                    background: 'var(--primary, #0f766e)',
                    color: '#fff',
                    borderRadius: '8px',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                }}
            >
                Try Again
            </button>
        </div>
    );
}
