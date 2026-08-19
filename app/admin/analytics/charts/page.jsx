'use client';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, LoadingState, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../../../components/ui';
import { useAnalyticsFiltersContext } from '../AnalyticsFiltersContext';
import { fetchAdminCharts } from '../../../../lib/api/analytics';
import { useAdminResource } from '../useAdminResource';
import styles from '../AnalyticsTable.module.css';
export default function AdminChartsPage() {
    const { filters } = useAnalyticsFiltersContext();
    const resource = useAdminResource(fetchAdminCharts, filters);
    const rows = resource.data?.subject_pass_percentage || [];
    return <section className={styles.section} aria-busy={resource.loading}>
        <div className={styles.sectionHeader}><div><div className={styles.eyebrow}>Charts</div><h1 className={styles.sectionTitle}>Subject Pass Performance</h1><p className={styles.sectionDesc}>Server-generated pass percentages for the active academic scope.</p></div></div>
        {resource.loading ? <LoadingState label="Loading chart data" /> : resource.error ? <div className={styles.errorState} role="alert"><h2 className={styles.errorTitle}>Chart data unavailable</h2><p className={styles.errorText}>{resource.error}</p></div> : resource.isEmpty ? <EmptyState variant="inline" icon="bar_chart" title="No chart data found" description="Result data is required to populate charts." /> : <>
            <div style={{ height: 320, minWidth: 0, marginBottom: 24 }} aria-label="Subject pass percentage chart">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={rows} margin={{ top: 12, right: 12, left: -16, bottom: 12 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="subject_code" /><YAxis domain={[0, 100]} unit="%" /><Tooltip formatter={(value) => `${value}%`} /><Bar dataKey="pass_percentage" name="Pass percentage" fill="var(--primary)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer>
            </div>
            <div className={styles.tableWrapper}><Table><TableHeader><TableRow><TableHead>Subject</TableHead><TableHead>Pass percentage</TableHead></TableRow></TableHeader><TableBody>{rows.map(row => <TableRow key={row.subject_code}><TableCell>{row.subject_code}</TableCell><TableCell>{row.pass_percentage}%</TableCell></TableRow>)}</TableBody></Table></div>
        </>}
    </section>;
}
