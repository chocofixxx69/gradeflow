'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../../components/AuthGuard';
import { AuditLogContent } from '../../../components/AuditLogContent';

export default function AdminAuditLogPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/admin/terminal?tab=audit');
    }, [router]);

    return (
        <AuthGuard role="admin">
            <AuditLogContent />
        </AuthGuard>
    );
}
