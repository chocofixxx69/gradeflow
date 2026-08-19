'use client';

import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { useAdminSubjects } from '../useAdminSubjects';
import { SubjectIntelligence } from '../SubjectIntelligence';

export default function AdminSubjectsPage() {
    const { filters } = useAnalyticsFiltersContext();
    const { subjects, loading, error, isEmpty, refresh } = useAdminSubjects(filters);

    return (
        <SubjectIntelligence
            subjects={subjects}
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={refresh}
        />
    );
}
