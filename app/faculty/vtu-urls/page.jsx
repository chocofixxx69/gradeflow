'use client';

import { useState, useEffect } from 'react';
import AuthGuard from '../../../components/AuthGuard';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import VtuUrlManager from '@/components/VtuUrlManager';

function VtuUrlManagerPageContent() {
    const [facultyId, setFacultyId] = useState(null);

    useEffect(() => {
        try {
            const facSession = JSON.parse(localStorage.getItem('faculty_session') || '{}');
            if (facSession.id) setFacultyId(facSession.id);
        } catch (e) {
            console.error('[VtuUrlManagerPage] session error', e);
        }
    }, []);

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1050px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
            <PageHeader>
                <PageHeaderEyebrow>Portal Configuration</PageHeaderEyebrow>
                <PageHeaderTitle>VTU Result Portals</PageHeaderTitle>
                <PageHeaderSubtitle>
                    Manage VTU result URLs segmented strictly by curriculum scheme. 2022 Scheme scans will only query 2022 portals, eliminating unnecessary scans against 2025 portals.
                </PageHeaderSubtitle>
            </PageHeader>

            <VtuUrlManager facultyId={facultyId} />
        </div>
    );
}

export default function VtuUrlManagerPage() {
    return (
        <AuthGuard role="faculty">
            <VtuUrlManagerPageContent />
        </AuthGuard>
    );
}
