'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * FacultyPresenceHeartbeat — Real-time faculty session presence daemon.
 * 
 * - Emits a presence heartbeat every 20 seconds while a faculty member is in the portal.
 * - Immediately transmits a disconnect beacon (navigator.sendBeacon) on pagehide/beforeunload
 *   when the faculty closes the tab, browser, or navigates away.
 * - Zero delay, non-blocking, fail-safe.
 */
export default function FacultyPresenceHeartbeat() {
    const pathname = usePathname();
    const lastPingRef = useRef(0);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        function getFacultySession() {
            try {
                const facStr = localStorage.getItem('faculty_session');
                if (!facStr) return null;
                const parsed = JSON.parse(facStr);
                if (parsed && (parsed.id || parsed.email)) {
                    return parsed;
                }
            } catch {
                return null;
            }
            return null;
        }

        const faculty = getFacultySession();
        if (!faculty?.id) return;

        const facultyId = faculty.id;
        const facultyName = faculty.full_name || faculty.name || faculty.email || 'Faculty Member';

        const sendHeartbeat = async () => {
            // Throttle to at most once per 8 seconds even on rapid tab toggling
            const now = Date.now();
            if (now - lastPingRef.current < 8000) return;
            lastPingRef.current = now;

            try {
                await fetch('/api/faculty/presence', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'heartbeat',
                        faculty_id: facultyId,
                        faculty_name: facultyName,
                        page: window.location.pathname || pathname,
                    }),
                    keepalive: true,
                });
            } catch {
                // non-blocking
            }
        };

        const sendOfflineBeacon = () => {
            try {
                const payload = JSON.stringify({
                    action: 'offline',
                    faculty_id: facultyId,
                    faculty_name: facultyName,
                    reason: 'Tab closed or navigated away',
                });

                if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
                    const blob = new Blob([payload], { type: 'application/json' });
                    navigator.sendBeacon('/api/faculty/presence', blob);
                } else {
                    fetch('/api/faculty/presence', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: payload,
                        keepalive: true,
                    }).catch(() => {});
                }
            } catch {
                // non-blocking
            }
        };

        // 1. Immediate initial ping on mount
        sendHeartbeat();

        // 2. Periodic heartbeat every 20 seconds
        const intervalId = setInterval(sendHeartbeat, 20000);

        // 3. Tab visibility / window focus triggers immediate ping
        const handleVisibilityOrFocus = () => {
            if (typeof document !== 'undefined' && !document.hidden) {
                sendHeartbeat();
            }
        };
        window.addEventListener('focus', handleVisibilityOrFocus);
        document.addEventListener('visibilitychange', handleVisibilityOrFocus);

        // 4. Tab close / unload triggers offline beacon
        window.addEventListener('pagehide', sendOfflineBeacon);
        window.addEventListener('beforeunload', sendOfflineBeacon);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleVisibilityOrFocus);
            document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
            window.removeEventListener('pagehide', sendOfflineBeacon);
            window.removeEventListener('beforeunload', sendOfflineBeacon);
        };
    }, [pathname]);

    return null;
}
