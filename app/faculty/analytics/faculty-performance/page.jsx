'use client';

import AuthGuard from '@/components/AuthGuard';
import { FacultyPerformanceContent } from '@/components/FacultyPerformanceContent';

export default function FacultyPerformancePage() {
    return (
        <AuthGuard role="faculty">
            <FacultyPerformanceContent role="faculty" />
        </AuthGuard>
    );
}
