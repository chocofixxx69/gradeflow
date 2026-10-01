'use client';

import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { useAdminFaculty } from '../useAdminFaculty';
import { TeachingInsightsIntelligence } from '../TeachingInsightsIntelligence';

export default function AdminTeachingInsightsPage() {
    const { filters } = useAnalyticsFiltersContext();
    const { faculty, loading, error, isEmpty, refresh } = useAdminFaculty(filters);

    return (
        <TeachingInsightsIntelligence
            faculty={faculty}
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={refresh}
        />
    );
}
