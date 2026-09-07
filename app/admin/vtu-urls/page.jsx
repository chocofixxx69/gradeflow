'use client';

import AuthGuard from '../../../components/AuthGuard';
import { AdminVtuUrlsContent } from '../../../components/AdminVtuUrlsContent';

export default function AdminVtuUrlManagerPage() {
    return (
        <AuthGuard role="admin">
            <AdminVtuUrlsContent />
        </AuthGuard>
    );
}
