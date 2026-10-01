'use client';

import { Fragment, useMemo, useState } from 'react';
import { Button, EmptyState } from '../../../components/ui';
import styles from './AnalyticsTable.module.css';
import { CoverageBar, SkeletonRows, SortButton, sortRows } from './AnalyticsShared';

const SORT_COLUMNS = [
    { key: 'faculty_name', label: 'Instructor' },
    { key: 'classes', label: 'Classes' },
    { key: 'students_appeared', label: 'Appeared' },
    { key: 'pass_percentage', label: 'Pass %' },
    { key: 'subject_average', label: 'Avg Score' },
];

function TeachingTable({ rows, sortKey, sortDir, onSort, expanded, onToggle }) {
    function getAriaSort(key) {
        return sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none';
    }

    return (
        <div className={styles.tableWrapper} role="region" aria-label="Teaching Insights Data">
            <table className={styles.table}>
                <thead>
                    <tr className={styles.headerRow}>
                        <th scope="col" aria-sort={getAriaSort('faculty_name')}>
                            <SortButton column={SORT_COLUMNS[0]} active={sortKey === 'faculty_name'} direction={sortDir} onClick={() => onSort('faculty_name')} />
                        </th>
                        <th scope="col" className={styles.dimHeader}>Department</th>
                        <th scope="col" className={styles.dimHeader}>Assigned Subjects</th>
                        <th scope="col" aria-sort={getAriaSort('classes')}>
                            <SortButton column={SORT_COLUMNS[1]} active={sortKey === 'classes'} direction={sortDir} onClick={() => onSort('classes')} />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('students_appeared')}>
                            <SortButton column={SORT_COLUMNS[2]} active={sortKey === 'students_appeared'} direction={sortDir} onClick={() => onSort('students_appeared')} />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('pass_percentage')}>
                            <SortButton column={SORT_COLUMNS[3]} active={sortKey === 'pass_percentage'} direction={sortDir} onClick={() => onSort('pass_percentage')} />
                        </th>
                        <th scope="col" aria-sort={getAriaSort('subject_average')}>
                            <SortButton column={SORT_COLUMNS[4]} active={sortKey === 'subject_average'} direction={sortDir} onClick={() => onSort('subject_average')} />
                        </th>
                        <th scope="col" className={styles.dimHeader} style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map(row => {
                        const isExpanded = expanded.has(row.faculty_id ?? 'unassigned');
                        const subjectCount = row.subjects?.length || 0;

                        return (
                            <Fragment key={row.faculty_id ?? 'unassigned'}>
                                <tr className={styles.dataRow}>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                width: '28px',
                                                height: '28px',
                                                borderRadius: '50%',
                                                background: 'var(--surface-low)',
                                                border: '1px solid var(--border)',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                fontSize: '11px',
                                                fontWeight: 800,
                                                color: 'var(--primary)',
                                                flexShrink: 0
                                            }}>
                                                {((row.faculty_name || 'U')[0]).toUpperCase()}
                                            </span>
                                            <div>
                                                <span className={styles.className}>{row.faculty_name}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td><span className={styles.metaText}>{row.department || '—'}</span></td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap' }}>
                                            {subjectCount > 0 ? (
                                                row.subjects.slice(0, 2).map(s => (
                                                    <span key={s.subject_code} style={{
                                                        fontSize: '10px',
                                                        fontWeight: 700,
                                                        background: 'rgba(37, 99, 235, 0.08)',
                                                        color: 'var(--primary)',
                                                        border: '1px solid rgba(37, 99, 235, 0.2)',
                                                        borderRadius: '4px',
                                                        padding: '1px 5px'
                                                    }}>
                                                        {s.subject_code}
                                                    </span>
                                                ))
                                            ) : (
                                                <span className={styles.dimText}>—</span>
                                            )}
                                            {subjectCount > 2 && (
                                                <span style={{ fontSize: '10px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                    +{subjectCount - 2} more
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td><span className={styles.countText}>{row.classes}</span></td>
                                    <td><span className={styles.countText}>{row.students_appeared}</span></td>
                                    <td><CoverageBar percent={row.pass_percentage} /></td>
                                    <td><span className={styles.cgpaText}>{row.subject_average ?? '—'}</span></td>
                                    <td style={{ textAlign: 'right' }}>
                                        {subjectCount > 0 && (
                                            <button
                                                type="button"
                                                className={styles.sortBtn}
                                                onClick={() => onToggle(row.faculty_id ?? 'unassigned')}
                                                aria-expanded={isExpanded}
                                                style={{ marginLeft: 'auto' }}
                                            >
                                                {isExpanded ? 'Hide' : `${subjectCount} Subject${subjectCount > 1 ? 's' : ''}`}
                                                <span className="material-icons-round" aria-hidden="true" style={{ fontSize: 14 }}>
                                                    {isExpanded ? 'expand_less' : 'expand_more'}
                                                </span>
                                            </button>
                                        )}
                                    </td>
                                </tr>
                                {isExpanded && subjectCount > 0 && (
                                    <tr className={styles.dataRow}>
                                        <td colSpan={8} style={{ padding: 0, background: 'var(--surface-low)' }}>
                                            <div style={{ padding: '12px 16px', borderTop: '1px dashed var(--border)', borderBottom: '1px dashed var(--border)' }}>
                                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                                                    Course Instruction Breakdown for {row.faculty_name}
                                                </div>
                                                <table className={styles.table} style={{ minWidth: 0, background: 'var(--surface)', borderRadius: '6px', overflow: 'hidden' }}>
                                                    <thead>
                                                        <tr className={styles.headerRow}>
                                                            <th scope="col" className={styles.dimHeader}>Course Code & Name</th>
                                                            <th scope="col" className={styles.dimHeader}>Students Appeared</th>
                                                            <th scope="col" className={styles.dimHeader}>Passed</th>
                                                            <th scope="col" className={styles.dimHeader}>Pass Rate</th>
                                                            <th scope="col" className={styles.dimHeader}>Subject Avg</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {row.subjects.map(s => (
                                                            <tr key={s.subject_code} className={styles.dataRow}>
                                                                <td>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: '11.5px', color: 'var(--primary)' }}>
                                                                            {s.subject_code}
                                                                        </span>
                                                                        <span className={styles.metaText}>{s.subject_name}</span>
                                                                    </div>
                                                                </td>
                                                                <td><span className={styles.countText}>{s.appeared}</span></td>
                                                                <td><span className={styles.countText}>{s.passed}</span></td>
                                                                <td><CoverageBar percent={s.pass_percentage} /></td>
                                                                <td><span className={styles.cgpaText}>{s.subject_average ?? '—'}</span></td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
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

export function TeachingInsightsIntelligence({ faculty, loading, error, isEmpty, onRetry }) {
    const [sortKey, setSortKey] = useState('pass_percentage');
    const [sortDir, setSortDir] = useState('desc');
    const [expanded, setExpanded] = useState(new Set());
    const [search, setSearch] = useState('');

    const rawRows = useMemo(() => (Array.isArray(faculty?.faculty) ? faculty.faculty : []), [faculty]);

    const filteredRows = useMemo(() => {
        if (!search.trim()) return rawRows;
        const q = search.trim().toLowerCase();
        return rawRows.filter(r =>
            (r.faculty_name || '').toLowerCase().includes(q) ||
            (r.department || '').toLowerCase().includes(q) ||
            (r.subjects || []).some(s =>
                (s.subject_code || '').toLowerCase().includes(q) ||
                (s.subject_name || '').toLowerCase().includes(q)
            )
        );
    }, [rawRows, search]);

    const sortedRows = useMemo(() => sortRows(filteredRows, sortKey, sortDir), [filteredRows, sortKey, sortDir]);

    function handleSort(key) {
        if (key === sortKey) {
            setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortKey(key);
            setSortDir(key === 'pass_percentage' || key === 'students_appeared' || key === 'classes' ? 'desc' : 'asc');
        }
    }

    function handleToggle(id) {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }

    const sectionId = 'teaching-insights-title';

    return (
        <section className={styles.section} aria-labelledby={sectionId} aria-busy={loading}>
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Teaching Intelligence</div>
                    <h2 id={sectionId} className={styles.sectionTitle}>Teaching Insights</h2>
                    <p className={styles.sectionDesc}>
                        Pedagogical pass rates, subject averages, and classroom attribution per faculty member across the current filter scope.
                    </p>
                </div>

                <div className={styles.headerControls}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'var(--surface-low)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-2)',
                        padding: '4px 10px',
                    }}>
                        <span className="material-icons-round" style={{ fontSize: 16, color: 'var(--tx-dim)' }}>search</span>
                        <input
                            type="text"
                            placeholder="Search instructor or subject..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                border: 'none',
                                background: 'transparent',
                                fontSize: '12px',
                                color: 'var(--tx-main)',
                                outline: 'none',
                                width: '180px'
                            }}
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--tx-dim)' }}
                            >
                                <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
                            </button>
                        )}
                    </div>

                    {!loading && !error && rawRows.length > 0 && (
                        <div className={styles.headerMeta} aria-live="polite">
                            <span className={styles.rowCount}>
                                {filteredRows.length} instructor{filteredRows.length === 1 ? '' : 's'}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} aria-label="Loading teaching insights" role="status">
                        <table className={styles.table}>
                            <thead>
                                <tr className={styles.headerRow}>
                                    {['Instructor', 'Department', 'Assigned Subjects', 'Classes', 'Appeared', 'Pass %', 'Avg Score', 'Actions'].map(h => (
                                        <th key={h} scope="col"><span className={styles.dimHeader}>{h}</span></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody><SkeletonRows columns={['30%', '20%', '20%', '10%', '10%', '20%', '10%', '10%']} count={5} /></tbody>
                        </table>
                    </div>
                )}

                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true">
                            <span className="material-icons-round">warning</span>
                        </div>
                        <h3 className={styles.errorTitle}>Teaching insights data unavailable</h3>
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
                        icon="school"
                        title="No teaching insights found"
                        description="Teaching insights appear once subject assignments and student marks exist for the current filter scope."
                    />
                )}

                {!loading && !error && !isEmpty && sortedRows.length === 0 && search && (
                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--tx-muted)', fontSize: '13px' }}>
                        No instructors matching &quot;{search}&quot;.
                    </div>
                )}

                {!loading && !error && !isEmpty && sortedRows.length > 0 && (
                    <TeachingTable
                        rows={sortedRows}
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        expanded={expanded}
                        onToggle={handleToggle}
                    />
                )}
            </div>
        </section>
    );
}
