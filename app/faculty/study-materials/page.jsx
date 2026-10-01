'use client';

import AuthGuard from '@/components/AuthGuard';
import StudyMaterialsContent from '@/components/StudyMaterialsContent';

export default function FacultyStudyMaterialsPage() {
    return (
        <AuthGuard role="faculty">
            <StudyMaterialsContent initialRole="faculty" />
        </AuthGuard>
    );
}
