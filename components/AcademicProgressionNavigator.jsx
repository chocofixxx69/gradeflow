import React, { useMemo } from 'react';

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
        <section style={{
            background: 'var(--surface-low, #FFFBF5)',
            border: '1px solid var(--border)',
            borderRadius: '16px',
            padding: '16px 20px',
            marginBottom: '24px',
            width: '100%',
            boxSizing: 'border-box'
        }}>
            <div style={{
                display: 'flex',
                justify: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '14px'
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '15px',
                    fontWeight: 800,
                    color: 'var(--tx-main)'
                }}>
                    <span className="material-icons-round" style={{ fontSize: '20px', color: 'var(--primary)' }}>show_chart</span>
                    Academic Progression &amp; Semester Navigator
                </div>
                {trajectoryBadge && (
                    <div style={{
                        background: 'rgba(16, 185, 129, 0.08)',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        color: '#059669',
                        fontSize: '11.5px',
                        fontWeight: 700,
                        padding: '3px 10px',
                        borderRadius: '20px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                    }}>
                        {trajectoryBadge}
                    </div>
                )}
            </div>

            <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fit, minmax(140px, 1fr))`,
                gap: '12px',
                width: '100%',
                boxSizing: 'border-box'
            }}>
                {progressionData.map(item => {
                    const hasBacklog = item.backlogs > 0;
                    const isSelected = activeSemester === item.semStr;

                    return (
                        <button
                            key={item.semStr}
                            type="button"
                            onClick={() => onSelectSemester(item.semStr)}
                            style={{
                                background: isSelected
                                    ? 'rgba(59, 130, 246, 0.06)'
                                    : hasBacklog
                                        ? 'rgba(239, 68, 68, 0.04)'
                                        : 'var(--surface, #FFFFFF)',
                                border: isSelected
                                    ? '2px solid var(--primary)'
                                    : hasBacklog
                                        ? '1px solid rgba(239, 68, 68, 0.35)'
                                        : '1px solid var(--border)',
                                borderRadius: '10px',
                                padding: '10px 12px',
                                textAlign: 'left',
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '6px',
                                boxSizing: 'border-box',
                                outline: 'none'
                            }}
                        >
                            <div style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                fontSize: '11px',
                                fontWeight: 800
                            }}>
                                <span style={{ color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    SEM {item.semNum}
                                </span>
                                <span style={{
                                    fontSize: '10.5px',
                                    fontWeight: 700,
                                    color: item.deltaType === 'positive' ? '#059669' : item.deltaType === 'negative' ? '#DC2626' : 'var(--tx-dim)'
                                }}>
                                    {item.delta}
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                                <span style={{
                                    fontSize: '22px',
                                    fontWeight: 900,
                                    color: hasBacklog ? '#DC2626' : 'var(--tx-main)',
                                    lineHeight: 1.1
                                }}>
                                    {item.sgpa > 0 ? item.sgpa.toFixed(2) : '0.00'}
                                </span>
                                <span style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--tx-dim)' }}>
                                    SGPA
                                </span>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px', fontSize: '10px' }}>
                                {hasBacklog ? (
                                    <span style={{
                                        background: 'rgba(239, 68, 68, 0.12)',
                                        color: '#DC2626',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 800
                                    }}>
                                        {item.backlogs} Backlog
                                    </span>
                                ) : (
                                    <span style={{
                                        background: 'rgba(16, 185, 129, 0.12)',
                                        color: '#059669',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                        fontWeight: 800
                                    }}>
                                        All Clear
                                    </span>
                                )}
                                <span style={{ color: 'var(--tx-dim)', fontWeight: 700 }}>
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
