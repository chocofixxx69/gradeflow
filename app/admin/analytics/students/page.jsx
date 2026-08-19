'use client';
import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { fetchAdminStudents } from '../../../../lib/api/analytics';
import { useAdminResource } from '../useAdminResource';
import { StudentIntelligence } from '../StudentIntelligence';
export default function AdminStudentsPage() { const { filters } = useAnalyticsFiltersContext(); const resource = useAdminResource(fetchAdminStudents, filters); const students = resource.data?.students || []; return <StudentIntelligence students={students} loading={resource.loading} error={resource.error} isEmpty={resource.isEmpty} onRetry={resource.refresh} />; }
