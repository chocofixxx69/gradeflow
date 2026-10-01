'use client';

import AuthGuard from '@/components/AuthGuard';
import StudyMaterialsContent from '@/components/StudyMaterialsContent';

export default function StudyMaterialsPage() {
    return (
        <AuthGuard role="any">
            <StudyMaterialsContent initialRole="student" />
        </AuthGuard>
    );
}
