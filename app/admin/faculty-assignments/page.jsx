'use client';

import AuthGuard from '../../../components/AuthGuard';
import { FacultyAssignmentsContent } from '../../../components/FacultyAssignmentsContent';

export default function FacultyAssignmentsPage() {
    return (
        <AuthGuard role="admin">
            <main style={{ padding: 'var(--page-py) var(--page-px)', minHeight: '100vh', background: 'var(--bg)' }}>
                <FacultyAssignmentsContent embedded={false} />
            </main>
        </AuthGuard>
    );
}
