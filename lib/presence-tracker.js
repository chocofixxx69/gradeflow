import { getAdminClient } from './analytics-data';

// Singleton in-memory map attached to globalThis to survive Next.js dev reloads and API calls
if (!globalThis.__gradeflow_faculty_presence) {
    globalThis.__gradeflow_faculty_presence = new Map();
}

const presenceMap = globalThis.__gradeflow_faculty_presence;

// Throttle DB sync so we don't bombard Supabase every 20s for every tab
const lastDbSyncMap = new Map();

/**
 * Record a live heartbeat from a faculty browser session.
 */
export async function recordFacultyHeartbeat({
    faculty_id,
    faculty_name,
    ip_address = null,
    user_agent = null,
    page = null,
} = {}) {
    if (!faculty_id) return null;

    const now = new Date();
    const nowIso = now.toISOString();

    const existing = presenceMap.get(faculty_id) || {};
    const updated = {
        ...existing,
        faculty_id,
        faculty_name: faculty_name || existing.faculty_name || 'Faculty Member',
        status: 'online',
        last_seen_at: nowIso,
        login_at: existing.login_at || nowIso,
        logout_at: null,
        ip_address: ip_address || existing.ip_address || null,
        user_agent: user_agent || existing.user_agent || null,
        last_page: page || existing.last_page || null,
    };
    presenceMap.set(faculty_id, updated);

    // Throttle DB update to once per 30 seconds
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isValidUuid = uuidRegex.test(String(faculty_id).trim());

    const lastSync = lastDbSyncMap.get(faculty_id) || 0;
    if (isValidUuid && Date.now() - lastSync > 30000) {
        lastDbSyncMap.set(faculty_id, Date.now());
        try {
            const supabase = getAdminClient();
            await supabase.from('faculty_onboarding').update({
                last_login_at: nowIso,
                last_login_ip: ip_address || null,
            }).eq('id', faculty_id);
        } catch {
            // non-fatal
        }
    }

    return updated;
}

/**
 * Record an explicit login event.
 */
export function recordFacultyLogin({
    faculty_id,
    faculty_name,
    ip_address = null,
    user_agent = null,
} = {}) {
    if (!faculty_id) return null;

    const nowIso = new Date().toISOString();
    const updated = {
        faculty_id,
        faculty_name: faculty_name || 'Faculty Member',
        status: 'online',
        last_seen_at: nowIso,
        login_at: nowIso,
        logout_at: null,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
    };
    presenceMap.set(faculty_id, updated);
    lastDbSyncMap.set(faculty_id, Date.now());
    return updated;
}

/**
 * Record an explicit logout event (e.g. from /api/auth/logout).
 */
export function recordFacultyLogout({
    faculty_id,
    faculty_name,
    ip_address = null,
    user_agent = null,
} = {}) {
    if (!faculty_id) return null;

    const nowIso = new Date().toISOString();
    const existing = presenceMap.get(faculty_id) || {};
    const updated = {
        ...existing,
        faculty_id,
        faculty_name: faculty_name || existing.faculty_name || 'Faculty Member',
        status: 'logged_out',
        last_seen_at: nowIso,
        logout_at: nowIso,
        ip_address: ip_address || existing.ip_address || null,
        user_agent: user_agent || existing.user_agent || null,
    };
    presenceMap.set(faculty_id, updated);
    return updated;
}

/**
 * Record a tab-close / disconnect event (e.g. from pagehide navigator.sendBeacon).
 */
export async function recordFacultyOffline({
    faculty_id,
    faculty_name,
    ip_address = null,
    user_agent = null,
    reason = 'Tab closed / window navigated away',
} = {}) {
    if (!faculty_id) return null;

    const now = new Date();
    const nowIso = now.toISOString();
    const existing = presenceMap.get(faculty_id) || {};

    const loginTime = existing.login_at ? new Date(existing.login_at).getTime() : null;
    const durationMs = loginTime ? (now.getTime() - loginTime) : null;
    const durationMins = durationMs ? Math.max(1, Math.round(durationMs / 60000)) : null;

    const updated = {
        ...existing,
        faculty_id,
        faculty_name: faculty_name || existing.faculty_name || 'Faculty Member',
        status: 'offline',
        last_seen_at: nowIso,
        logout_at: nowIso,
        ip_address: ip_address || existing.ip_address || null,
        user_agent: user_agent || existing.user_agent || null,
    };
    presenceMap.set(faculty_id, updated);

    // Persist a FACULTY_OFFLINE audit record in faculty_activity
    try {
        const timeFormatted = now.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        });
        const durationText = durationMins ? ` after ${durationMins}m session` : '';

        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        const validFacultyId = uuidRegex.test(String(faculty_id).trim()) ? String(faculty_id).trim() : null;

        const supabase = getAdminClient();
        await supabase.from('faculty_activity').insert({
            faculty_id: validFacultyId,
            faculty_name: faculty_name || existing.faculty_name || 'Faculty Member',
            action_type: 'FACULTY_OFFLINE',
            sync_status: 'SUCCESS',
            context_module: 'Faculty Portal > Session Management',
            reason: reason || 'Instructor closed browser tab or disconnected from portal.',
            method: 'Browser Beacon / Disconnect Tracker',
            details: `${faculty_name || 'Faculty Member'} went offline at ${timeFormatted}${durationText}.`,
            ip_address: ip_address || null,
            user_agent: user_agent || null,
            metadata: {
                offline_at: nowIso,
                login_at: existing.login_at || null,
                duration_ms: durationMs,
                duration_minutes: durationMins,
            }
        });
    } catch {
        // non-fatal
    }

    return updated;
}

/**
 * Return live presence for all registered faculty members.
 * Threshold: 75 seconds. If status is online but last_seen_at was > 75s ago,
 * it is automatically considered offline.
 */
export function getAllFacultyPresence() {
    const now = Date.now();
    const result = {};
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    for (const [id, pres] of presenceMap.entries()) {
        if (!uuidRegex.test(String(id).trim())) continue;

        const diffMs = pres.last_seen_at ? (now - new Date(pres.last_seen_at).getTime()) : Infinity;
        const isActuallyOnline = pres.status === 'online' && diffMs <= 75000;

        result[id] = {
            ...pres,
            status: isActuallyOnline ? 'online' : (pres.status === 'logged_out' ? 'logged_out' : 'offline'),
            is_online: isActuallyOnline,
            diff_ms: diffMs,
            seconds_ago: Math.round(diffMs / 1000),
        };
    }

    return result;
}
