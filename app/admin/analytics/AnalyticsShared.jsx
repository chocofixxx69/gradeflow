import { Badge, Skeleton } from '../../../components/ui';
import styles from './AnalyticsTable.module.css';

export function SortButton({ column, active, direction, onClick }) {
    const icon = !active ? 'unfold_more' : direction === 'asc' ? 'arrow_upward' : 'arrow_downward';

    return (
        <button
            className={`${styles.sortBtn} ${active ? styles.sortBtnActive : ''}`}
            aria-label={`Sort by ${column.label}`}
            onClick={onClick}
            type="button"
        >
            {column.label}
            <span className="material-icons-round" aria-hidden="true" style={{ fontSize: 14 }}>
                {icon}
            </span>
        </button>
    );
}

const STATUS_CONFIG = {
    healthy: { label: 'Healthy', tone: 'success', icon: 'check_circle' },
    attention: { label: 'Needs Attention', tone: 'warning', icon: 'warning' },
    critical: { label: 'Critical Risk', tone: 'danger', icon: 'priority_high' },
    highRisk: { label: 'High Risk', tone: 'danger', icon: 'warning' },
    moderateRisk: { label: 'Moderate Risk', tone: 'warning', icon: 'report_problem' },
    missing: { label: 'Missing Data', tone: 'neutral', icon: 'help_outline' },
    partial: { label: 'Partial Data', tone: 'warning', icon: 'help_outline' },
    empty: { label: 'Empty', tone: 'neutral', icon: 'inbox' },
    error: { label: 'Load Error', tone: 'danger', icon: 'error_outline' },
};

export function StatusBadge({ status }) {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.error;
    return (
        <Badge tone={config.tone} size="sm" icon={config.icon}>
            {config.label}
        </Badge>
    );
}

export function CoverageBar({ percent }) {
    if (percent === null) return <span className={styles.dimText}>—</span>;
    const clamped = Math.min(100, Math.max(0, percent));
    const barColor =
        clamped >= 80 ? 'var(--green)' :
        clamped >= 50 ? 'var(--amber)' :
        'var(--red)';

    return (
        <div className={styles.coverageCell}>
            <div className={styles.coverageBarTrack} aria-hidden="true">
                <div
                    className={styles.coverageBarFill}
                    style={{ width: `${clamped}%`, background: barColor }}
                />
            </div>
            <span className={styles.coverageLabel}>{clamped}%</span>
        </div>
    );
}

export function SkeletonRows({ columns, count = 5 }) {
    return (
        <>
            {Array.from({ length: count }).map((_, i) => (
                <tr key={i} className={styles.skeletonRow} aria-hidden="true">
                    {columns.map((col, j) => (
                        <td key={j}>
                            {col === 'double' ? (
                                <>
                                    <Skeleton height="16px" width="60%" />
                                    <div style={{ marginTop: '4px' }}><Skeleton height="12px" width="40%" /></div>
                                </>
                            ) : (
                                <Skeleton height="16px" width={col} />
                            )}
                        </td>
                    ))}
                </tr>
            ))}
        </>
    );
}

export function sortRows(rows, sortKey, sortDir) {
    return [...rows].sort((a, b) => {
        let av = a[sortKey];
        let bv = b[sortKey];

        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;

        if (typeof av === 'string') {
            const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: 'base' });
            return sortDir === 'asc' ? cmp : -cmp;
        }

        return sortDir === 'asc' ? av - bv : bv - av;
    });
}

