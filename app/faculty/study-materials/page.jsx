'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function FacultyStudyMaterialsPage() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/faculty/dashboard');
    }, [router]);
    return null;
}
