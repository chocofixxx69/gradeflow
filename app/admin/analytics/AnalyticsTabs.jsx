'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './AdminAnalytics.module.css';

const TABS = [
    { href: '/admin/analytics', label: 'Overview' },
    { href: '/admin/analytics/students', label: 'Students' },
    { href: '/admin/analytics/classes', label: 'Classes' },
    { href: '/admin/analytics/subjects', label: 'Subjects' },
    { href: '/admin/analytics/faculty', label: 'Faculty' },
    { href: '/admin/analytics/rankings', label: 'Rankings' },
    { href: '/admin/analytics/backlogs', label: 'Backlogs' },
    { href: '/admin/analytics/charts', label: 'Charts' },
];

export function AnalyticsTabs() {
    const pathname = usePathname();

    return (
        <nav className={styles.tabBar} aria-label="Result Analysis sections">
            {TABS.map(tab => {
                const isActive = tab.href === '/admin/analytics'
                    ? pathname === tab.href
                    : pathname.startsWith(tab.href);

                return (
                    <Link
                        key={tab.href}
                        href={tab.href}
                        className={`${styles.tabLink} ${isActive ? styles.tabLinkActive : ''}`}
                        aria-current={isActive ? 'page' : undefined}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </nav>
    );
}
