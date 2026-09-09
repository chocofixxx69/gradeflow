'use client';

import AuthGuard from '@/components/AuthGuard';
import { FacultyPerformanceContent } from '@/components/FacultyPerformanceContent';

export default function AdminFacultyPerformancePage() {
    return (
        <AuthGuard role="admin">
            <main style={{ minHeight: '100vh', background: 'var(--bg)' }}>
                <FacultyPerformanceContent role="admin" embedded={false} />
            </main>
        </AuthGuard>
    );
}
