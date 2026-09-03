'use client';

import { useState } from 'react';
import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { useAdminLeaderboard } from '../useAdminLeaderboard';
import { LeaderboardIntelligence } from '../LeaderboardIntelligence';

export default function AdminLeaderboardPage() {
    const { filters } = useAnalyticsFiltersContext();
    const [activeTab, setActiveTab] = useState('overall');
    const [viewSemester, setViewSemester] = useState(null);
    const [subjectCode, setSubjectCode] = useState(null);

    const { data, loading, error, isEmpty, refresh } = useAdminLeaderboard(filters, { viewSemester, subjectCode });

    return (
        <LeaderboardIntelligence
            data={data}
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={refresh}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            viewSemester={viewSemester}
            onViewSemesterChange={setViewSemester}
            subjectCode={subjectCode}
            onSubjectCodeChange={setSubjectCode}
        />
    );
}
