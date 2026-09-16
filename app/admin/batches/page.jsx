'use client';
import AuthGuard from '../../../components/AuthGuard';
import { BatchesContent } from '../../../components/BatchesContent';

export default function BatchesPage() {
    return (
        <AuthGuard role="admin">
            <main style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
                <BatchesContent />
            </main>
        </AuthGuard>
    );
}
