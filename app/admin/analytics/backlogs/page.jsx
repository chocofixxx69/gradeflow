'use client';

import dynamic from 'next/dynamic';
import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { useAdminBacklogs } from '../useAdminBacklogs';
import { LoadingState } from '../../../../components/ui';

// BacklogIntelligence pulls in recharts (a large charting library). Loading it
// on demand keeps that weight off every other /admin/analytics/* route that
// shares this section's webpack chunk group but never renders a chart.
const BacklogIntelligence = dynamic(
    () => import('../BacklogIntelligence').then(m => m.BacklogIntelligence || m.default || m),
    { loading: () => <LoadingState block label="Loading..." />, ssr: false }
);

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
