'use client';

import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { useAdminFaculty } from '../useAdminFaculty';
import { FacultyIntelligence } from '../FacultyIntelligence';

export default function AdminFacultyPage() {
    const { filters } = useAnalyticsFiltersContext();
    const { faculty, loading, error, isEmpty, refresh } = useAdminFaculty(filters);

    return (
        <FacultyIntelligence
            faculty={faculty}
            loading={loading}
            error={error}
            isEmpty={isEmpty}
            onRetry={refresh}
        />
    );
}
