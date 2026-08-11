'use client';

import { useMemo, useState } from 'react';
import { Button, EmptyState, SearchInput } from '../../../components/ui';
import styles from './AnalyticsTable.module.css';
import { SkeletonRows, SortButton, StatusBadge, sortRows } from './AnalyticsShared';

// ---------------------------------------------------------------------------
// Pure helpers - no new API calls, no duplicate hook logic
// ---------------------------------------------------------------------------

export function deriveStudentRows(risk) {
    if (!Array.isArray(risk?.students)) return [];

    return risk.students.map(student => ({
        id: student.usn,
        usn: student.usn,
        name: student.name || '-',
        className: student.class_name || '-',
        branch: student.branch || '-',
        semester: student.semester || '-',
        cgpa: Number.isFinite(Number(student.cgpa)) ? Number(student.cgpa) : null,
        risk_level: student.risk_level,
        total_backlogs: Number(student.total_backlogs ?? 0),
    }));
}

function studentStatus(row) {
    if (row.risk_level === 'CRITICAL') return 'critical';
    if (row.risk_level === 'HIGH') return 'highRisk';
    if (row.risk_level === 'MODERATE') return 'moderateRisk';
    return 'healthy';
}

// ---------------------------------------------------------------------------
// Sorting & Filtering
// ---------------------------------------------------------------------------

const SORT_COLUMNS = [
    { key: 'name', label: 'Student Name' },
    { key: 'usn', label: 'USN' },
    { key: 'className', label: 'Class' },
    { key: 'cgpa', label: 'CGPA' },
    { key: 'total_backlogs', label: 'Backlogs' },
];

function filterRows(rows, searchQuery) {
    if (!searchQuery) return rows;
    const lowerQuery = searchQuery.toLowerCase();
    return rows.filter(row =>
        row.name.toLowerCase().includes(lowerQuery) ||
        row.usn.toLowerCase().includes(lowerQuery) ||
        row.className.toLowerCase().includes(lowerQuery)
    );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function StudentIntelligenceTable({ rows, sortKey, sortDir, onSort, page, pageSize, onPageChange, onPageSizeChange }) {
    const totalRows = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const startIndex = (page - 1) * pageSize;
    const paginatedRows = rows.slice(startIndex, startIndex + pageSize);

    function getAriaSort(key) {
        return sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    }

    return (
        <div id="student-table" className={styles.tableWrapper} role="region" aria-label="Student Intelligence data">
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
                        <th scope="col" aria-sort={getAriaSort('className')}>
                            <SortButton
                                column={SORT_COLUMNS[2]}
                                active={sortKey === 'className'}
                                direction={sortDir}
                                onClick={() => onSort('className')}
                            />
                        </th>
                        <th scope="col" className={styles.dimHeader}>Branch</th>
                        <th scope="col" className={styles.dimHeader}>Sem</th>
                        <th scope="col" aria-sort={getAriaSort('cgpa')}>
                            <SortButton
                                column={SORT_COLUMNS[3]}
                                active={sortKey === 'cgpa'}
                                direction={sortDir}
                                onClick={() => onSort('cgpa')}
                            />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('total_backlogs')}>
                            <SortButton
                                column={SORT_COLUMNS[4]}
                                active={sortKey === 'total_backlogs'}
                                direction={sortDir}
                                onClick={() => onSort('total_backlogs')}
                            />
                        </th>
                        <th scope="col" className={styles.dimHeader}>Status</th>
                    </tr>
                </thead>
                <tbody>
                    {paginatedRows.length === 0 ? (
                        <tr>
                            <td colSpan="7" style={{ textAlign: 'center', padding: '32px' }}>
                                <span className={styles.dimText}>No students match the current filters.</span>
                            </td>
                        </tr>
                    ) : (
                        paginatedRows.map(row => (
                            <tr key={row.id} className={styles.dataRow}>
                                <td>
                                    <span className={styles.studentName}>{row.name}</span>
                                    <span className={styles.studentUsn}>{row.usn}</span>
                                </td>
                                <td>
                                    <span className={styles.metaText}>{row.className}</span>
                                </td>
                                <td>
                                    <span className={styles.metaText}>{row.branch}</span>
                                </td>
                                <td>
                                    <span className={styles.metaText}>
                                        {row.semester !== '-' ? `Sem ${row.semester}` : '-'}
                                    </span>
                                </td>
                                <td>
                                    {row.cgpa !== null
                                        ? <span className={styles.cgpaText}>{row.cgpa.toFixed(2)}</span>
                                        : <span className={styles.dimText}>-</span>
                                    }
                                </td>
                                <td>
                                    {row.total_backlogs > 0
                                        ? <span className={styles.backlogText}>{row.total_backlogs}</span>
                                        : <span className={styles.dimText}>0</span>
                                    }
                                </td>
                                <td>
                                    <StatusBadge status={studentStatus(row)} />
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            <div className={styles.pagination}>
                <div className={styles.paginationMeta}>
                    Showing {totalRows === 0 ? 0 : startIndex + 1} to {Math.min(startIndex + pageSize, totalRows)} of {totalRows} students
                </div>
                <div className={styles.headerControls}>
                    <select
                        className={styles.selectInput}
                        value={pageSize}
                        onChange={(e) => onPageSizeChange(Number(e.target.value))}
                        aria-label="Rows per page"
                    >
                        <option value={10}>10 rows</option>
                        <option value={25}>25 rows</option>
                        <option value={50}>50 rows</option>
                    </select>
                    <div className={styles.paginationControls}>
                        <button
                            className={styles.pageBtn}
                            disabled={page === 1}
                            onClick={() => onPageChange(page - 1)}
                            aria-label="Previous page"
                        >
                            <span className="material-icons-round" style={{ fontSize: 18 }}>chevron_left</span>
                        </button>
                        <button
                            className={styles.pageBtn}
                            disabled={page === totalPages || totalRows === 0}
                            onClick={() => onPageChange(page + 1)}
                            aria-label="Next page"
                        >
                            <span className="material-icons-round" style={{ fontSize: 18 }}>chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/**
 * StudentIntelligence
 */
export function StudentIntelligence({ classes, loading, error, isEmpty, onRetry, risk }) {
    const [sortKey, setSortKey] = useState('name');
    const [sortDir, setSortDir] = useState('asc');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);

    const rows = useMemo(
        () => deriveStudentRows(risk),
        [risk]
    );

    const filteredRows = useMemo(
        () => filterRows(rows, searchQuery),
        [rows, searchQuery]
    );

    const sortedRows = useMemo(
        () => sortRows(filteredRows, sortKey, sortDir),
        [filteredRows, sortKey, sortDir]
    );

    function handleSort(key) {
        if (key === sortKey) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir('asc');
        }
        setPage(1);
    }

    function handleSearch(val) {
        setSearchQuery(val);
        setPage(1);
    }

    function handlePageSizeChange(newSize) {
        setPageSize(newSize);
        setPage(1);
    }

    const sectionId = 'student-intelligence-title';

    return (
        <section
            className={styles.section}
            aria-labelledby={sectionId}
            aria-busy={loading}
        >
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Student Intelligence</div>
                    <h2 id={sectionId} className={styles.sectionTitle}>Priority Attention</h2>
                    <p className={styles.sectionDesc}>
                        Identify students who require academic attention based on backlogs and CGPA data.
                    </p>
                </div>
                {!loading && !error && rows.length > 0 && (
                    <div className={styles.headerControls}>
                        <SearchInput
                            className={styles.searchInput}
                            placeholder="Search by name, USN, or class..."
                            value={searchQuery}
                            onChange={handleSearch}
                            aria-controls="student-table"
                            aria-label="Search students"
                        />
                    </div>
                )}
            </div>

            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} aria-label="Loading student data" role="status">
                        <table className={styles.table}>
                            <thead>
                                <tr className={styles.headerRow}>
                                    {['Student Name', 'Class', 'Branch', 'Sem', 'CGPA', 'Backlogs', 'Status'].map(h => (
                                        <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody><SkeletonRows columns={['double', '70%', '60%', '40%', '50%', '30%', '80%']} count={5} /></tbody>
                        </table>
                    </div>
                )}

                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true">
                            <span className="material-icons-round">warning</span>
                        </div>
                        <h3 className={styles.errorTitle}>Student data unavailable</h3>
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
                        icon="people"
                        title="No students found"
                        description="Add students to your classes to start seeing Student Intelligence metrics."
                    />
                )}

                {!loading && !error && !isEmpty && rows.length === 0 && (
                    <EmptyState
                        variant="inline"
                        density="compact"
                        icon="people"
                        title="No students found"
                        description="Add students to your classes to start seeing Student Intelligence metrics."
                    />
                )}

                {!loading && !error && !isEmpty && rows.length > 0 && (
                    <StudentIntelligenceTable
                        rows={sortedRows}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        page={page}
                        pageSize={pageSize}
                        onPageChange={setPage}
                        onPageSizeChange={handlePageSizeChange}
                    />
                )}
            </div>
        </section>
    );
}
