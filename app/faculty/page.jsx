'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Faculty Index Route — Smart redirect based on session state.
 * 
 * If faculty is logged in → redirect to faculty dashboard
 * If student is logged in → redirect to student dashboard  
 * If no session → redirect to faculty login
 */
export default function FacultyPage() {
    const router = useRouter();

    useEffect(() => {
        const facSession = localStorage.getItem('faculty_session');
        const stuSession = localStorage.getItem('student_session');

        if (facSession) {
            router.replace('/faculty/dashboard');
        } else if (stuSession) {
            router.replace('/dashboard');
        } else {
            router.replace('/faculty/login');
        }
    }, [router]);

    return (
        <div style={{
            minHeight: '100vh', display: 'flex', alignItems: 'center',
            justifyContent: 'center', background: 'var(--bg)',
        }}>
            <div style={{ textAlign: 'center', color: 'var(--tx-dim)' }}>
                <span className="material-icons-round gf-spin" style={{ fontSize: '32px', marginBottom: '16px', display: 'block' }}>sync</span>
                <div style={{ fontWeight: 700, fontSize: '14px' }}>Redirecting...</div>
            </div>
        </div>
    );
}
