'use client';

import { useState } from 'react';
import { Button, EmptyState, Select } from '../../../components/ui';
import styles from './AnalyticsTable.module.css';
import { CoverageBar, SkeletonRows } from './AnalyticsShared';

const LIMIT_OPTIONS = [
    { label: 'Top/Bottom 10', value: 10 },
    { label: 'Top/Bottom 25', value: 25 },
    { label: 'Top/Bottom 50', value: 50 },
];

function RankPanel({ title, description, topRows, bottomRows, renderRow, columns, loading, error, emptyIcon }) {
    const [mode, setMode] = useState('top');
    const rows = mode === 'top' ? topRows : bottomRows;

    return (
        <section className={styles.section} aria-busy={loading}>
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Rankings</div>
                    <h2 className={styles.sectionTitle}>{title}</h2>
                    <p className={styles.sectionDesc}>{description}</p>
                </div>
                <div className={styles.headerControls}>
                    <Button
                        variant={mode === 'top' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setMode('top')}
                    >
                        Top
                    </Button>
                    <Button
                        variant={mode === 'bottom' ? 'primary' : 'secondary'}
                        size="sm"
                        onClick={() => setMode('bottom')}
                    >
                        Bottom
                    </Button>
                </div>
            </div>

            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} aria-label={`Loading ${title}`} role="status">
                        <table className={styles.table}>
                            <thead>
                                <tr className={styles.headerRow}>
                                    {columns.map(c => <th key={c} scope="col"><span className={styles.dimHeader}>{c}</span></th>)}
                                </tr>
                            </thead>
                            <tbody><SkeletonRows columns={columns.map(() => '50%')} count={5} /></tbody>
                        </table>
                    </div>
                )}

                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true">
                            <span className="material-icons-round">warning</span>
                        </div>
                        <h3 className={styles.errorTitle}>Ranking data unavailable</h3>
                        <p className={styles.errorText}>{error}</p>
                    </div>
                )}

                {!loading && !error && rows.length === 0 && (
                    <EmptyState
                        variant="inline"
                        density="compact"
                        icon={emptyIcon}
                        title="No data for this scope"
                        description="Rankings appear once results exist for the current filter scope."
                    />
                )}

                {!loading && !error && rows.length > 0 && (
                    <div className={styles.tableWrapper}>
                        <table className={styles.table}>
                            <thead>
                                <tr className={styles.headerRow}>
                                    {columns.map(c => <th key={c} scope="col"><span className={styles.dimHeader}>{c}</span></th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(renderRow)}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}

export function RankingsIntelligence({ rankings, loading, error, isEmpty, onRetry, limit, onLimitChange }) {
    if (!loading && !error && isEmpty) {
        return (
            <EmptyState
                icon="leaderboard"
                title="No rankings available"
                description="Rankings appear once students, subjects, and classes have recorded results for the current filter scope."
                actions={<Button variant="secondary" size="sm" iconStart="refresh" onClick={onRetry}>Retry</Button>}
            />
        );
    }

    return (
        <div className={styles.section} style={{ border: 'none', background: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)', maxWidth: 220 }}>
                <Select
                    label="Rows shown"
                    value={limit}
                    options={LIMIT_OPTIONS}
                    onChange={(e) => onLimitChange(Number(e.target.value))}
                />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                <RankPanel
                    title="Student Rankings"
                    description="Ranked by CGPA within the current filter scope."
                    topRows={rankings?.top_students || []}
                    bottomRows={rankings?.bottom_students || []}
                    loading={loading}
                    error={error}
                    emptyIcon="school"
                    columns={['Rank', 'Student', 'Branch / Sem', 'CGPA']}
                    renderRow={(row) => (
                        <tr key={row.usn} className={styles.dataRow}>
                            <td><span className={styles.countText}>#{row.rank}</span></td>
                            <td>
                                <span className={styles.studentName}>{row.name}</span>
                                <span className={styles.studentUsn}>{row.usn}</span>
                            </td>
                            <td><span className={styles.metaText}>{row.branch} / Sem {row.semester}</span></td>
                            <td><span className={styles.cgpaText}>{row.cgpa}</span></td>
                        </tr>
                    )}
                />

                <RankPanel
                    title="Subject Rankings"
                    description="Ranked by pass percentage within the current filter scope."
                    topRows={rankings?.top_subjects || []}
                    bottomRows={rankings?.lowest_subjects || []}
                    loading={loading}
                    error={error}
                    emptyIcon="menu_book"
                    columns={['Rank', 'Subject', 'Appeared', 'Pass %']}
                    renderRow={(row) => (
                        <tr key={row.subject_code} className={styles.dataRow}>
                            <td><span className={styles.countText}>#{row.rank}</span></td>
                            <td>
                                <span className={styles.className}>{row.subject_code}</span>
                                <div className={styles.metaText}>{row.subject_name}</div>
                            </td>
                            <td><span className={styles.countText}>{row.appeared}</span></td>
                            <td><CoverageBar percent={row.pass_percentage} /></td>
                        </tr>
                    )}
                />

                <RankPanel
                    title="Class Rankings"
                    description="Ranked by pass percentage within the current filter scope."
                    topRows={rankings?.top_classes || []}
                    bottomRows={rankings?.lowest_classes || []}
                    loading={loading}
                    error={error}
                    emptyIcon="groups"
                    columns={['Rank', 'Class', 'Appeared', 'Pass %']}
                    renderRow={(row) => (
                        <tr key={row.id} className={styles.dataRow}>
                            <td><span className={styles.countText}>#{row.rank}</span></td>
                            <td>
                                <span className={styles.className}>{row.name}</span>
                                <div className={styles.metaText}>{row.branch} / Sem {row.semester}</div>
                            </td>
                            <td><span className={styles.countText}>{row.appeared}</span></td>
                            <td><CoverageBar percent={row.pass_percentage} /></td>
                        </tr>
                    )}
                />
            </div>
        </div>
    );
}
