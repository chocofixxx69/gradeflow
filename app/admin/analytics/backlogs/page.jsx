'use client';

import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { useAdminBacklogs } from '../useAdminBacklogs';
import { BacklogIntelligence } from '../BacklogIntelligence';

export default function AdminBacklogsPage() {
    const { filters } = useAnalyticsFiltersContext();
    const { backlogs, loading, error, isEmpty, refresh } = useAdminBacklogs(filters);

    return (
        <BacklogIntelligence
            backlogs={backlogs}
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={refresh}
        />
    );
}
