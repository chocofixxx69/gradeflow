'use client';

import { Fragment, useMemo, useState } from 'react';
import { Button, EmptyState } from '../../../components/ui';
import styles from './AnalyticsTable.module.css';
import { CoverageBar, SkeletonRows, SortButton, sortRows } from './AnalyticsShared';

const SORT_COLUMNS = [
    { key: 'faculty_name', label: 'Faculty' },
    { key: 'classes', label: 'Classes' },
    { key: 'students_appeared', label: 'Appeared' },
    { key: 'pass_percentage', label: 'Pass %' },
];

function FacultyTable({ rows, sortKey, sortDir, onSort, expanded, onToggle }) {
    function getAriaSort(key) {
        return sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    }

    return (
        <div className={styles.tableWrapper} role="region" aria-label="Faculty Intelligence data">
            <table className={styles.table}>
                <thead>
                    <tr className={styles.headerRow}>
                        <th scope="col" aria-sort={getAriaSort('faculty_name')}>
                            <SortButton column={SORT_COLUMNS[0]} active={sortKey === 'faculty_name'} direction={sortDir} onClick={() => onSort('faculty_name')} />
                        </th>
                        <th scope="col" className={styles.dimHeader}>Department</th>
                        <th scope="col" aria-sort={getAriaSort('classes')}>
                            <SortButton column={SORT_COLUMNS[1]} active={sortKey === 'classes'} direction={sortDir} onClick={() => onSort('classes')} />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('students_appeared')}>
                            <SortButton column={SORT_COLUMNS[2]} active={sortKey === 'students_appeared'} direction={sortDir} onClick={() => onSort('students_appeared')} />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('pass_percentage')}>
                            <SortButton column={SORT_COLUMNS[3]} active={sortKey === 'pass_percentage'} direction={sortDir} onClick={() => onSort('pass_percentage')} />
                        </th>
                        <th scope="col" className={styles.dimHeader}>Subject Avg</th>
                        <th scope="col" className={styles.dimHeader}></th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const isExpanded = expanded.has(row.faculty_id ?? 'unassigned');
                        return (
                            <Fragment key={row.faculty_id ?? 'unassigned'}>
                                <tr className={styles.dataRow}>
                                    <td><span className={styles.className}>{row.faculty_name}</span></td>
                                    <td><span className={styles.metaText}>{row.department || '—'}</span></td>
                                    <td><span className={styles.countText}>{row.classes}</span></td>
                                    <td><span className={styles.countText}>{row.students_appeared}</span></td>
                                    <td><CoverageBar percent={row.pass_percentage} /></td>
                                    <td><span className={styles.cgpaText}>{row.subject_average ?? '—'}</span></td>
                                    <td>
                                        {row.subjects?.length > 0 && (
                                            <button
                                                type="button"
                                                className={styles.sortBtn}
                                                onClick={() => onToggle(row.faculty_id ?? 'unassigned')}
                                                aria-expanded={isExpanded}
                                            >
                                                {isExpanded ? 'Hide' : 'Subjects'}
                                                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: 14 }}>
                                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                                </span>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                                {isExpanded && row.subjects?.length > 0 && (
                                    <tr className={styles.dataRow}>
                                        <td colSpan={7} style={{ padding: 0 }}>
                                            <table className={styles.table} style={{ minWidth: 0 }}>
                                                <thead>
                                                    <tr className={styles.headerRow}>
                                                        <th scope="col" className={styles.dimHeader}>Subject</th>
                                                        <th scope="col" className={styles.dimHeader}>Appeared</th>
                                                        <th scope="col" className={styles.dimHeader}>Passed</th>
                                                        <th scope="col" className={styles.dimHeader}>Pass %</th>
                                                        <th scope="col" className={styles.dimHeader}>Avg</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {row.subjects.map(s => (
                                                        <tr key={s.subject_code} className={styles.dataRow}>
                                                            <td>
                                                                <span className={styles.metaText}>{s.subject_code} — {s.subject_name}</span>
                                                            </td>
                                                            <td><span className={styles.countText}>{s.appeared}</span></td>
                                                            <td><span className={styles.countText}>{s.passed}</span></td>
                                                            <td><CoverageBar percent={s.pass_percentage} /></td>
                                                            <td><span className={styles.cgpaText}>{s.subject_average ?? '—'}</span></td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

export function FacultyIntelligence({ faculty, loading, error, isEmpty, onRetry }) {
    const [sortKey, setSortKey] = useState('faculty_name');
    const [sortDir, setSortDir] = useState('asc');
    const [expanded, setExpanded] = useState(new Set());

    const rows = useMemo(() => (Array.isArray(faculty?.faculty) ? faculty.faculty : []), [faculty]);
    const sortedRows = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

    function handleSort(key) {
        if (key === sortKey) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }

    function handleToggle(id) {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    const sectionId = 'faculty-intelligence-title';

    return (
        <section className={styles.section} aria-labelledby={sectionId} aria-busy={loading}>
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Faculty Intelligence</div>
                    <h2 id={sectionId} className={styles.sectionTitle}>Faculty Performance</h2>
                    <p className={styles.sectionDesc}>
                        Pass rate and subject averages per faculty member, attributed via subject assignments.
                    </p>
                </div>
                {!loading && !error && rows.length > 0 && (
                    <div className={styles.headerMeta} aria-live="polite">
                        <span className={styles.rowCount}>{rows.length} faculty</span>
                    </div>
                )}
            </div>

            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} aria-label="Loading faculty data" role="status">
                        <table className={styles.table}>
                            <thead>
                                <tr className={styles.headerRow}>
                                    {['Faculty', 'Department', 'Classes', 'Appeared', 'Pass %', 'Subject Avg'].map(h => (
                                        <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody><SkeletonRows columns={['60%', '50%', '30%', '30%', '80%', '30%']} count={5} /></tbody>
                        </table>
                    </div>
                )}

                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true">
                            <span className="material-icons-round">warning</span>
                        </div>
                        <h3 className={styles.errorTitle}>Faculty data unavailable</h3>
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
                        icon="groups"
                        title="No faculty data found"
                        description="Faculty analysis appears once subject assignments and marks exist for the current filter scope."
                    />
                )}

                {!loading && !error && !isEmpty && rows.length > 0 && (
                    <FacultyTable rows={sortedRows} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} expanded={expanded} onToggle={handleToggle} />
                )}
            </div>
        </section>
    );
}
