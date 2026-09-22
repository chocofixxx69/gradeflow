import React, { useMemo } from 'react';
import styles from './AcademicProgressionNavigator.module.css';

/**
 * Academic Progression & Semester Navigator component
 * Renders horizontal cards for each semester with SGPA, trend delta, backlog badges,
 * and credits, matching the design in Image 2.
 */
export default function AcademicProgressionNavigator({
    sortedSemesters = [],
    semStats = {},
    sgpas = {},
    activeSemester = null,
    onSelectSemester = () => {}
}) {
    const progressionData = useMemo(() => {
        if (!sortedSemesters || sortedSemesters.length === 0) return [];

        // Always sort chronologically ascending (SEM 1, SEM 2, SEM 3...) for accurate trajectory deltas
        const chronological = [...sortedSemesters].sort((a, b) => Number(a[0]) - Number(b[0]));

        return chronological.map(([semStr, subjects], index) => {
            const semNum = Number(semStr);
            const stat = semStats[semStr] || {};
            const sgpa = Number(sgpas[semStr] || stat.sgpa || 0);

            let earnedCredits = stat.earnedCredits || 0;
            let totalCredits = stat.totalCredits || 0;
            if (!totalCredits && Array.isArray(subjects)) {
                totalCredits = subjects.reduce((sum, s) => sum + (Number(s.credits || s.credit || 3) || 3), 0);
                earnedCredits = subjects.filter(s => !s.isFailed && s.grade !== 'F' && s.grade !== 'FAIL').reduce((sum, s) => sum + (Number(s.credits || s.credit || 3) || 3), 0);
            }

            const semBacklogs = Array.isArray(subjects) ? subjects.filter(s => s.isFailed || s.grade === 'F' || s.grade === 'FAIL') : [];
            const backlogs = stat.backlogs != null ? stat.backlogs : semBacklogs.length;

            let delta = '0.00';
            let deltaType = 'neutral';
            if (index === 0) {
                delta = 'Baseline';
                deltaType = 'baseline';
            } else {
                const prevSemStr = chronological[index - 1][0];
                const prevStat = semStats[prevSemStr] || {};
                const prevSgpa = Number(sgpas[prevSemStr] || prevStat.sgpa || 0);
                const diff = sgpa - prevSgpa;
                if (diff > 0) {
                    delta = `+${diff.toFixed(2)} ↗`;
                    deltaType = 'positive';
                } else if (diff < 0) {
                    delta = `${diff.toFixed(2)} ↘`;
                    deltaType = 'negative';
                } else {
                    delta = '0.00';
                    deltaType = 'neutral';
                }
            }

            return {
                semNum,
                semStr,
                sgpa,
                earnedCredits,
                totalCredits,
                backlogs,
                delta,
                deltaType
            };
        });
    }, [sortedSemesters, semStats, sgpas]);

    const trajectoryBadge = useMemo(() => {
        if (!progressionData || progressionData.length < 2) return null;
        const last = progressionData[progressionData.length - 1];
        const prev = progressionData[progressionData.length - 2];
        const diff = last.sgpa - prev.sgpa;
        if (diff > 0) {
            return `↗ +${diff.toFixed(2)} in S${last.semNum} (Rebound from ${prev.sgpa.toFixed(2)})`;
        } else if (diff < 0) {
            return `↘ ${diff.toFixed(2)} in S${last.semNum} (vs S${prev.semNum} ${prev.sgpa.toFixed(2)})`;
        }
        return `S${last.semNum} SGPA: ${last.sgpa.toFixed(2)}`;
    }, [progressionData]);

    if (progressionData.length === 0) return null;

    return (
        <section className={styles.container} aria-label="Academic Progression and Semester Navigator">
            <div className={styles.header}>
                <div className={styles.titleGroup}>
                    <span className={`material-icons-round ${styles.titleIcon}`}>show_chart</span>
                    <span>Academic Progression &amp; Semester Navigator</span>
                </div>
                {trajectoryBadge && (
                    <div className={styles.trajectoryBadge}>
                        {trajectoryBadge}
                    </div>
                )}
            </div>

            <div className={styles.rail}>
                {progressionData.map(item => {
                    const hasBacklog = item.backlogs > 0;
                    const isSelected = activeSemester === item.semStr;

                    return (
                        <button
                            key={item.semStr}
                            type="button"
                            onClick={() => onSelectSemester(item.semStr)}
                            className={`${styles.card} ${isSelected ? styles.cardActive : ''} ${hasBacklog ? styles.cardBacklog : ''}`}
                            title={`Jump to Semester ${item.semNum}`}
                        >
                            <div className={styles.cardHeader}>
                                <span className={styles.semLabel}>
                                    SEM {item.semNum}
                                </span>
                                <span className={`${styles.delta} ${
                                    item.deltaType === 'positive'
                                        ? styles.deltaPositive
                                        : item.deltaType === 'negative'
                                            ? styles.deltaNegative
                                            : styles.deltaNeutral
                                }`}>
                                    {item.delta}
                                </span>
                            </div>

                            <div className={styles.sgpaRow}>
                                <span className={`${styles.sgpaValue} ${hasBacklog ? styles.sgpaValueBacklog : ''}`}>
                                    {item.sgpa > 0 ? item.sgpa.toFixed(2) : '0.00'}
                                </span>
                                <span className={styles.sgpaLabel}>
                                    SGPA
                                </span>
                            </div>

                            <div className={styles.footerRow}>
                                {hasBacklog ? (
                                    <span className={styles.statusPillBacklog}>
                                        {item.backlogs} Backlog
                                    </span>
                                ) : (
                                    <span className={styles.statusPillClear}>
                                        All Clear
                                    </span>
                                )}
                                <span className={styles.creditsText}>
                                    {item.earnedCredits}/{item.totalCredits || item.earnedCredits} Cr
                                </span>
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
