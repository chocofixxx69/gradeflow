'use client';
import dynamic from 'next/dynamic';
import { EmptyState, LoadingState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui';
import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { fetchAdminCharts } from '../../../../lib/api/analytics';
import { useAdminResource } from '../useAdminResource';
import styles from '../AnalyticsTable.module.css';

// Recharts is a large charting library — load it only when this route actually
// renders, instead of shipping it in every /admin/analytics/* route's shared chunk.
const SubjectPassChart = dynamic(() => import('./SubjectPassChart'), { loading: () => <LoadingState label="Loading chart data" />, ssr: false });
export default function AdminChartsPage() {
    const { filters } = useAnalyticsFiltersContext();
    const resource = useAdminResource(fetchAdminCharts, filters);
    const rows = resource.data?.subject_pass_percentage || [];
    return <section className={styles.section} aria-busy={resource.loading}>
        <div className={styles.sectionHeader}><div><div className={styles.eyebrow}>Charts</div><h1 className={styles.sectionTitle}>Subject Pass Performance</h1><p className={styles.sectionDesc}>Server-generated pass percentages for the active academic scope.</p></div></div>
        {resource.loading ? <LoadingState label="Loading chart data" /> : resource.error ? <div className={styles.errorState} role="alert"><h2 className={styles.errorTitle}>Chart data unavailable</h2><p className={styles.errorText}>{resource.error}</p></div> : resource.isEmpty ? <EmptyState variant="inline" icon="bar_chart" title="No chart data found" description="Result data is required to populate charts." /> : <>
            <SubjectPassChart rows={rows} />
            <div className={styles.tableWrapper}><Table><TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Pass percentage</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.subject_code}><TableCell>{row.subject_code}</TableCell><TableCell>{row.pass_percentage}%</TableCell></TableRow>)}</TableBody></Table></div>
        </>}
    </section>;
}
