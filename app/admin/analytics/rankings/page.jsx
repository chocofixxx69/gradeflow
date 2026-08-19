'use client';

import { useState } from 'react';
import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { useAdminRankings } from '../useAdminRankings';
import { RankingsIntelligence } from '../RankingsIntelligence';

export default function AdminRankingsPage() {
    const { filters } = useAnalyticsFiltersContext();
    const [limit, setLimit] = useState(10);
    const { rankings, loading, error, isEmpty, refresh } = useAdminRankings(filters, limit);

    return (
        <RankingsIntelligence
            rankings={rankings}
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={refresh}
            limit={limit}
            onLimitChange={setLimit}
        />
    );
}
