'use client';

import { useMemo, useState } from 'react';
import { Button, EmptyState } from '../../../components/ui';
import styles from './AnalyticsTable.module.css';
import { CoverageBar, SkeletonRows, SortButton, sortRows } from './AnalyticsShared';

// Pure presentation helper — data.subjects[] is rendered verbatim, no aggregation.
function gradeSummary(distribution) {
    if (!distribution) return '—';
    const entries = Object.entries(distribution).filter(([, count]) => count > 0);
    if (!entries.length) return '—';
    return entries.map(([grade, count]) => `${grade}:${count}`).join(' ');
}

const SORT_COLUMNS = [
    { key: 'subject_code', label: 'Subject' },
    { key: 'appeared', label: 'Appeared' },
    { key: 'pass_percentage', label: 'Pass %' },
    { key: 'total_average', label: 'Total Avg' },
];

function SubjectTable({ rows, sortKey, sortDir, onSort }) {
    function getAriaSort(key) {
        return sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    }

    return (
        <div className={styles.tableWrapper} role="region" aria-label="Subject Intelligence data">
            <table className={styles.table}>
                <thead>
                    <tr className={styles.headerRow}>
                        <th scope="col" aria-sort={getAriaSort('subject_code')}>
                            <SortButton column={SORT_COLUMNS[0]} active={sortKey === 'subject_code'} direction={sortDir} onClick={() => onSort('subject_code')} />
                        </th>
                        <th scope="col" className={styles.dimHeader}>Faculty</th>
                        <th scope="col" className={styles.dimHeader}>Branch / Sem</th>
                        <th scope="col" aria-sort={getAriaSort('appeared')}>
                            <SortButton column={SORT_COLUMNS[1]} active={sortKey === 'appeared'} direction={sortDir} onClick={() => onSort('appeared')} />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('pass_percentage')}>
                            <SortButton column={SORT_COLUMNS[2]} active={sortKey === 'pass_percentage'} direction={sortDir} onClick={() => onSort('pass_percentage')} />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('total_average')}>
                            <SortButton column={SORT_COLUMNS[3]} active={sortKey === 'total_average'} direction={sortDir} onClick={() => onSort('total_average')} />
                        </th>
                        <th scope="col" className={styles.dimHeader}>High / Low</th>
                        <th scope="col" className={styles.dimHeader}>Grades</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.subject_code} className={styles.dataRow}>
                            <td>
                                <span className={styles.className}>{row.subject_code}</span>
                                <div className={styles.metaText}>{row.subject_name}</div>
                            </td>
                            <td><span className={styles.metaText}>{row.faculty || '—'}</span></td>
                            <td><span className={styles.metaText}>{row.branch || '—'}{row.semester ? ` / Sem ${row.semester}` : ''}</span></td>
                            <td><span className={styles.countText}>{row.appeared}</span></td>
                            <td><CoverageBar percent={row.pass_percentage} /></td>
                            <td><span className={styles.cgpaText}>{row.total_average ?? '—'}</span></td>
                            <td>
                                <span className={styles.dimText}>
                                    {row.highest_marks ?? '—'} / {row.lowest_marks ?? '—'}
                                </span>
                            </td>
                            <td><span className={styles.dimText}>{gradeSummary(row.grade_distribution)}</span></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function SubjectIntelligence({ subjects, loading, error, isEmpty, onRetry }) {
    const [sortKey, setSortKey] = useState('subject_code');
    const [sortDir, setSortDir] = useState('asc');

    const rows = useMemo(() => (Array.isArray(subjects?.subjects) ? subjects.subjects : []), [subjects]);
    const sortedRows = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

    function handleSort(key) {
        if (key === sortKey) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }

    const sectionId = 'subject-intelligence-title';

    return (
        <section className={styles.section} aria-labelledby={sectionId} aria-busy={loading}>
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Subject Intelligence</div>
                    <h2 id={sectionId} className={styles.sectionTitle}>Subject Analysis</h2>
                    <p className={styles.sectionDesc}>
                        Per-subject pass rate, averages, and faculty attribution across the current filter scope.
                    </p>
                </div>
                {!loading && !error && rows.length > 0 && (
                    <div className={styles.headerMeta} aria-live="polite">
                        <span className={styles.rowCount}>{rows.length} subject{rows.length !== 1 ? 's' : ''}</span>
                    </div>
                )}
            </div>

            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} aria-label="Loading subject data" role="status">
                        <table className={styles.table}>
                            <thead>
                                <tr className={styles.headerRow}>
                                    {['Subject', 'Faculty', 'Branch / Sem', 'Appeared', 'Pass %', 'Total Avg', 'High / Low', 'Grades'].map(h => (
                                        <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody><SkeletonRows columns={['double', '50%', '50%', '30%', '80%', '30%', '40%', '60%']} count={5} /></tbody>
                        </table>
                    </div>
                )}

                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true">
                            <span className="material-icons-round">warning</span>
                        </div>
                        <h3 className={styles.errorTitle}>Subject data unavailable</h3>
                        <p className={styles.errorText}>{error}</p>
                        <div className={styles.errorActions}>
                            <Button variant="secondary" size="sm" iconStart="refresh" onClick={onRetry}>Retry</Button>
                        </div>
                    </div>
                )}

                {!loading && !error && isEmpty && (
                    <EmptyState
                        variant="inline"
                        density="compact"
                        icon="menu_book"
                        title="No subject data found"
                        description="Subject analysis appears once marks are recorded for the current filter scope."
                    />
                )}

                {!loading && !error && !isEmpty && rows.length > 0 && (
                    <SubjectTable rows={sortedRows} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                )}
            </div>
        </section>
    );
}
