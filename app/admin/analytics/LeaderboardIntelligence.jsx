'use client';

import { Badge, Button, EmptyState, Select } from '../../../components/ui';
import styles from './AnalyticsTable.module.css';
import { SkeletonRows } from './AnalyticsShared';

const TAB_OPTIONS = [
    { id: 'overall', label: 'Overall (CGPA)', icon: 'military_tech' },
    { id: 'semester', label: 'Semester-Wise (SGPA)', icon: 'date_range' },
    { id: 'subject', label: 'Subject-Wise (Marks)', icon: 'menu_book' },
];

const MEDAL = {
    1: { icon: '🥇', label: '1st Place', color: '#B45309', bg: 'rgba(245, 158, 11, 0.12)' },
    2: { icon: '🥈', label: '2nd Place', color: '#4B5563', bg: 'rgba(107, 114, 128, 0.12)' },
    3: { icon: '🥉', label: '3rd Place', color: '#B45309', bg: 'rgba(217, 119, 6, 0.12)' },
};

function Podium({ rows, scoreLabel }) {
    const top3 = (rows || []).filter(r => typeof r.rank === 'number' && r.rank <= 3);
    if (top3.length === 0) return null;

    return (
        <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 'var(--space-4)', marginBottom: 'var(--space-5)'
        }}>
            {top3.map(row => {
                const medal = MEDAL[row.rank];
                return (
                    <div key={row.usn} style={{
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px',
                        padding: '16px 18px', boxShadow: row.rank === 1 ? '0 6px 16px rgba(217, 119, 6, 0.1)' : 'none'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                            <div style={{
                                fontSize: '1.5rem', width: '36px', height: '36px', borderRadius: '50%',
                                background: medal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}>
                                {medal.icon}
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: medal.color, textTransform: 'uppercase' }}>
                                {medal.label}
                            </span>
                        </div>
                        <div className={styles.studentName}>{row.name}</div>
                        <div className={styles.studentUsn}>{row.usn}</div>
                        <div style={{ marginTop: '8px', fontWeight: 800, color: medal.color }}>{scoreLabel(row)}</div>
                    </div>
                );
            })}
        </div>
    );
}

export function LeaderboardIntelligence({
    data, loading, error, isEmpty, onRetry,
    activeTab, onTabChange,
    viewSemester, onViewSemesterChange,
    subjectCode, onSubjectCodeChange,
}) {
    if (!loading && !error && isEmpty) {
        return (
            <EmptyState
                icon="emoji_events"
                title="No leaderboard data available"
                description="Rankings appear once students in the current filter scope have recorded results."
                actions={<Button variant="secondary" size="sm" iconStart="refresh" onClick={onRetry}>Retry</Button>}
            />
        );
    }

    const semesterOptions = (data?.availableSemesters || []).map(s => ({ label: `Semester ${s}`, value: s }));
    const subjectOptions = (data?.availableSubjects || [])
        .filter(s => !viewSemester || s.semester === viewSemester)
        .map(s => ({ label: `${s.subject_code} — ${s.subject_name}`, value: s.subject_code }));

    const rows = activeTab === 'overall'
        ? (data?.overallLeaderboard || [])
        : activeTab === 'semester'
            ? (data?.allSemestersLeaderboard?.[viewSemester || data?.targetSemester] || [])
            : (data?.subjectLeaderboard || []);

    return (
        <section className={styles.section} style={{ border: 'none', background: 'none' }} aria-busy={loading}>
            <div className={styles.sectionHeader}>
                <div>
                    <div className={styles.eyebrow}>Rankings</div>
                    <h2 className={styles.sectionTitle}>Class Leaderboard &amp; Toppers</h2>
                    <p className={styles.sectionDesc}>
                        {data ? `${data.totalStudents} students` : 'Loading…'}
                        {data?.lateralCount > 0 && ` (${data.regularCount} regular + ${data.lateralCount} lateral entry)`}
                        {' — ranked within the current filter scope.'}
                    </p>
                </div>
                <div className={styles.headerControls} style={{ gap: 'var(--space-2)' }}>
                    {TAB_OPTIONS.map(t => (
                        <Button
                            key={t.id}
                            variant={activeTab === t.id ? 'primary' : 'secondary'}
                            size="sm"
                            iconStart={t.icon}
                            onClick={() => onTabChange(t.id)}
                        >
                            {t.label}
                        </Button>
                    ))}
                </div>
            </div>

            {(activeTab === 'semester' || activeTab === 'subject') && (
                <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)', maxWidth: 480 }}>
                    <Select
                        label="Semester"
                        value={viewSemester || data?.targetSemester || ''}
                        options={semesterOptions}
                        onChange={(e) => onViewSemesterChange(Number(e.target.value))}
                    />
                    {activeTab === 'subject' && (
                        <Select
                            label="Subject"
                            value={subjectCode || data?.currentSubject?.subject_code || ''}
                            options={subjectOptions}
                            onChange={(e) => onSubjectCodeChange(e.target.value)}
                        />
                    )}
                </div>
            )}

            <div className={styles.body}>
                {loading && (
                    <div className={styles.tableWrapper} role="status" aria-label="Loading leaderboard">
                        <table className={styles.table}>
                            <thead>
                                <tr className={styles.headerRow}>
                                    <th><span className={styles.dimHeader}>Rank</span></th>
                                    <th><span className={styles.dimHeader}>Student</span></th>
                                    <th><span className={styles.dimHeader}>Score</span></th>
                                </tr>
                            </thead>
                            <tbody><SkeletonRows columns={['10%', '50%', '20%']} count={6} /></tbody>
                        </table>
                    </div>
                )}

                {!loading && error && (
                    <div className={styles.errorState} role="alert">
                        <div className={styles.errorIcon} aria-hidden="true"><span className="material-icons-round">warning</span></div>
                        <h3 className={styles.errorTitle}>Leaderboard unavailable</h3>
                        <p className={styles.errorText}>{error}</p>
                    </div>
                )}

                {!loading && !error && (
                    <>
                        {activeTab === 'overall' && <Podium rows={rows} scoreLabel={r => `CGPA ${r.cgpa?.toFixed(2)}`} />}
                        {activeTab === 'semester' && <Podium rows={rows} scoreLabel={r => `SGPA ${r.sgpa?.toFixed(2)}`} />}
                        {activeTab === 'subject' && <Podium rows={rows} scoreLabel={r => `${r.total}/100`} />}

                        <div className={styles.tableWrapper}>
                            <table className={styles.table}>
                                <thead>
                                    <tr className={styles.headerRow}>
                                        <th><span className={styles.dimHeader}>Rank</span></th>
                                        <th><span className={styles.dimHeader}>Student</span></th>
                                        {activeTab === 'overall' && (<>
                                            <th><span className={styles.dimHeader}>CGPA</span></th>
                                            <th><span className={styles.dimHeader}>Semesters</span></th>
                                            <th><span className={styles.dimHeader}>Backlogs</span></th>
                                        </>)}
                                        {activeTab === 'semester' && (<>
                                            <th><span className={styles.dimHeader}>SGPA</span></th>
                                            <th><span className={styles.dimHeader}>Credits</span></th>
                                        </>)}
                                        {activeTab === 'subject' && (<>
                                            <th><span className={styles.dimHeader}>CIE</span></th>
                                            <th><span className={styles.dimHeader}>SEE</span></th>
                                            <th><span className={styles.dimHeader}>Total</span></th>
                                            <th><span className={styles.dimHeader}>Grade</span></th>
                                        </>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.length === 0 && (
                                        <tr><td colSpan={6} className={styles.emptyCount}>No data for this scope.</td></tr>
                                    )}
                                    {rows.map(row => (
                                        <tr key={row.usn} className={styles.dataRow}>
                                            <td>
                                                {typeof row.rank === 'number' && row.rank <= 3
                                                    ? <span>{MEDAL[row.rank].icon}</span>
                                                    : <span className={styles.countText}>#{row.rank}</span>}
                                            </td>
                                            <td>
                                                <span className={styles.studentName}>{row.name}</span>
                                                {row.isLateral && <Badge tone="warning" size="sm" style={{ marginLeft: 6 }}>Lateral</Badge>}
                                                <div className={styles.studentUsn}>{row.usn}</div>
                                            </td>

                                            {activeTab === 'overall' && (<>
                                                <td><span className={styles.cgpaText}>{row.cgpa ? row.cgpa.toFixed(2) : '—'}</span></td>
                                                <td><span className={styles.metaText}>{row.semestersTracked} Sems</span></td>
                                                <td>
                                                    <Badge tone={row.totalBacklogs > 0 ? 'danger' : 'success'} size="sm">
                                                        {row.totalBacklogs === 0 ? 'All Clear' : `${row.totalBacklogs} Backlog`}
                                                    </Badge>
                                                </td>
                                            </>)}

                                            {activeTab === 'semester' && (<>
                                                <td>
                                                    {row.hasAppeared
                                                        ? <span className={styles.cgpaText}>{row.sgpa.toFixed(2)}</span>
                                                        : <span className={styles.metaText}>Not appeared</span>}
                                                </td>
                                                <td><span className={styles.metaText}>{row.hasAppeared ? row.credits : '—'}</span></td>
                                            </>)}

                                            {activeTab === 'subject' && (<>
                                                <td><span className={styles.metaText}>{row.internal}</span></td>
                                                <td><span className={styles.metaText}>{row.external}</span></td>
                                                <td><span className={styles.cgpaText}>{row.total}</span></td>
                                                <td>
                                                    <Badge tone={row.passed ? 'success' : 'danger'} size="sm">{row.grade || '—'}</Badge>
                                                </td>
                                            </>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </section>
    );
}
