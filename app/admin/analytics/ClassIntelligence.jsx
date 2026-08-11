'use client';

import { useMemo, useState } from 'react';
import { Button, EmptyState } from '../../../components/ui';
import styles from './AnalyticsTable.module.css';
import { CoverageBar, SkeletonRows, SortButton, StatusBadge, sortRows } from './AnalyticsShared';

// ---------------------------------------------------------------------------
// Pure helpers — no new API calls, no duplicate hook logic
// ---------------------------------------------------------------------------

export function deriveClassRows(classes, studentsByClass) {
    const byClassId = new Map(
        studentsByClass.map(entry => [
            entry.classId,
            { students: entry.students ?? [], hasError: Boolean(entry.error) },
        ])
    );

    return classes.map(cls => {
        const entry = byClassId.get(cls.id) ?? { students: [], hasError: false };
        const students = entry.students;

        const studentCount = students.length > 0
            ? students.length
            : Number(cls.student_count ?? 0);

        const cgpaStudents = students.filter(s => Number.isFinite(Number(s.cgpa)));
        const avgCgpa = cgpaStudents.length
            ? cgpaStudents.reduce((sum, s) => sum + Number(s.cgpa), 0) / cgpaStudents.length
            : Number(cls.average_cgpa || 0) > 0
                ? Number(cls.average_cgpa)
                : null;

        const backlogCount = students.length > 0
            ? students.filter(s => Number(s.total_backlogs ?? 0) > 0).length
            : Number(cls.total_backlogs ?? 0);

        const dataCoverage =
            students.length > 0
                ? Math.round((cgpaStudents.length / students.length) * 100)
                : null;

        const isEmpty = studentCount === 0;

        const hasPartialData =
            !isEmpty &&
            students.length > 0 &&
            cgpaStudents.length < students.length;

        const hasFetchError = entry.hasError;

        return {
            id: cls.id,
            name: cls.name ?? '—',
            branch: cls.branch ?? '—',
            semester: cls.semester ?? '—',
            studentCount,
            avgCgpa,
            backlogCount,
            dataCoverage,
            isEmpty,
            hasPartialData,
            hasFetchError,
        };
    });
}

function classStatus(row) {
    if (row.hasFetchError) return 'error';
    if (row.isEmpty) return 'empty';
    if (row.backlogCount > 0) return 'attention';
    if (row.hasPartialData) return 'partial';
    return 'healthy';
}

const SORT_COLUMNS = [
    { key: 'name', label: 'Class Name' },
    { key: 'studentCount', label: 'Students' },
    { key: 'avgCgpa', label: 'Avg CGPA' },
    { key: 'backlogCount', label: 'Backlogs' },
];


// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ClassIntelligenceTable({ rows, sortKey, sortDir, onSort }) {
    function getAriaSort(key) {
        return sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    }

    return (
        <div className={styles.tableWrapper} role="region" aria-label="Class Intelligence data">
            <table className={styles.table}>
                <thead>
                    <tr className={styles.headerRow}>
                        <th scope="col" aria-sort={getAriaSort('name')}>
                            <SortButton
                                column={SORT_COLUMNS[0]}
                                active={sortKey === 'name'}
                                direction={sortDir}
                                onClick={() => onSort('name')}
                            />
                        </th>
                        <th scope="col" className={styles.dimHeader}>Branch</th>
                        <th scope="col" className={styles.dimHeader}>Sem</th>
                        <th scope="col" aria-sort={getAriaSort('studentCount')}>
                            <SortButton
                                column={SORT_COLUMNS[1]}
                                active={sortKey === 'studentCount'}
                                direction={sortDir}
                                onClick={() => onSort('studentCount')}
                            />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('avgCgpa')}>
                            <SortButton
                                column={SORT_COLUMNS[2]}
                                active={sortKey === 'avgCgpa'}
                                direction={sortDir}
                                onClick={() => onSort('avgCgpa')}
                            />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('backlogCount')}>
                            <SortButton
                                column={SORT_COLUMNS[3]}
                                active={sortKey === 'backlogCount'}
                                direction={sortDir}
                                onClick={() => onSort('backlogCount')}
                            />
                        </th>
                        <th scope="col" className={styles.dimHeader}>Coverage</th>
                        <th scope="col" className={styles.dimHeader}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => (
                        <tr key={row.id} className={styles.dataRow}>
                            <td>
                                <span className={styles.className}>{row.name}</span>
                            </td>
                            <td>
                                <span className={styles.metaText}>{row.branch}</span>
                            </td>
                            <td>
                                <span className={styles.metaText}>
                                    {row.semester !== '—' ? `Sem ${row.semester}` : '—'}
                                </span>
                            </td>
                            <td>
                                <span className={row.isEmpty ? styles.emptyCount : styles.countText}>
                                    {row.isEmpty ? 'Empty' : row.studentCount}
                                </span>
                            </td>
                            <td>
                                {row.avgCgpa !== null
                                    ? <span className={styles.cgpaText}>{row.avgCgpa.toFixed(2)}</span>
                                    : <span className={styles.dimText}>—</span>
                                }
                            </td>
                            <td>
                                {row.backlogCount > 0
                                    ? <span className={styles.backlogText}>{row.backlogCount}</span>
                                    : <span className={styles.dimText}>{row.isEmpty ? '—' : '0'}</span>
                                }
                            </td>
                            <td>
                                <CoverageBar percent={row.dataCoverage} />
                            </td>
                            <td>
                                <StatusBadge status={classStatus(row)} />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function ClassIntelligence({ classes, studentsByClass, loading, error, isEmpty, onRetry }) {
    const [sortKey, setSortKey] = useState('name');
    const [sortDir, setSortDir] = useState('asc');

    const rows = useMemo(
        () => deriveClassRows(classes, studentsByClass),
        [classes, studentsByClass]
    );

    const sortedRows = useMemo(
        () => sortRows(rows, sortKey, sortDir),
        [rows, sortKey, sortDir]
    );

    function handleSort(key) {
        if (key === sortKey) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
    }

    const sectionId = 'class-intelligence-title';

    return (
        <section
            className={styles.section}
            aria-labelledby={sectionId}
            aria-busy={loading}
        >
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Class Intelligence</div>
                    <h2 id={sectionId} className={styles.sectionTitle}>Class Comparison</h2>
                    <p className={styles.sectionDesc}>
                        Class health at a glance — student roster, academic performance, backlog risk, and data coverage.
                    </p>
                </div>
                {!loading && !error && rows.length > 0 && (
                    <div className={styles.headerMeta} aria-live="polite">
                        <span className={styles.rowCount}>{rows.length} class{rows.length !== 1 ? 'es' : ''}</span>
                    </div>
                )}
            </div>

            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} aria-label="Loading class data" role="status">
                        <table className={styles.table}>
                            <thead>
                                <tr className={styles.headerRow}>
                                    {['Class Name', 'Branch', 'Sem', 'Students', 'Avg CGPA', 'Backlogs', 'Coverage', 'Status'].map(h => (
                                        <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody><SkeletonRows columns={['60%', '40%', '30%', '50%', '40%', '35%', '80%']} count={4} /></tbody>
                        </table>
                    </div>
                )}

                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true">
                            <span className="material-icons-round">warning</span>
                        </div>
                        <h3 className={styles.errorTitle}>Class data unavailable</h3>
                        <p className={styles.errorText}>{error}</p>
                        <div className={styles.errorActions}>
                            <Button variant="secondary" size="sm" iconStart="refresh" onClick={onRetry}>
                                Retry
                            </Button>
                        </div>
                    </div>
                )}

                {!loading && !error && isEmpty && (
                    <EmptyState
                        variant="inline"
                        density="compact"
                        icon="school"
                        title="No classes found"
                        description="Create a class and add students to start seeing Class Intelligence metrics."
                    />
                )}

                {!loading && !error && !isEmpty && rows.length > 0 && (
                    <ClassIntelligenceTable
                        rows={sortedRows}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                    />
                )}
            </div>
        </section>
    );
}
