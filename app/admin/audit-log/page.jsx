'use client';
import AuthGuard from '../../../components/AuthGuard';
import { AuditLogContent } from '../../../components/AuditLogContent';

export default function AdminAuditLogPage() {
    return (
        <AuthGuard role="admin">
            <AuditLogContent />
        </AuthGuard>
    );
}
