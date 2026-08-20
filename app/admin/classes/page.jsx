'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../../components/AuthGuard';

export default function ClassesPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/terminal?tab=classes');
    }, [router]);
    return <AuthGuard role="admin"><div style={{ padding: '80px', textAlign: 'center', color: 'var(--tx-dim)' }}>Opening Classes…</div></AuthGuard>;
}
