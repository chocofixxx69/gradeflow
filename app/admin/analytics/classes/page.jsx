'use client';
import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { fetchAdminClasses } from '../../../../lib/api/analytics';
import { useAdminResource } from '../useAdminResource';
import { ClassIntelligence } from '../ClassIntelligence';
export default function AdminClassesAnalysisPage() { const { filters } = useAnalyticsFiltersContext(); const resource = useAdminResource(fetchAdminClasses, filters); const classes = resource.data?.classes || []; return <ClassIntelligence classes={classes} studentsByClass={[]} loading={resource.loading} error={resource.error} isEmpty={resource.isEmpty} onRetry={resource.refresh} />; }
