/**
 * High-Performance In-Memory Server Cache for GradeFlow Analytics & Reports
 * 
 * Provides sub-millisecond response times for repeated analytics queries,
 * metadata lookups, and student rollups without continuous database roundtrips.
 */

const serverCache = new Map();
const MAX_CACHE_ENTRIES = 1000;

export function getCached(key) {
    if (key === 'analytics_meta_all') {
        const entry = serverCache.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
            serverCache.delete(key);
            return null;
        }
        return entry.data;
    }
    // Bypassed for operational routes: always query live Supabase database in real time
    return null;
}

export function setCached(key, data, ttlMs = 60_000) {
    if (key === 'analytics_meta_all') {
        serverCache.set(key, {
            data,
            expiresAt: Date.now() + ttlMs
        });
    }
}

export function clearServerCache(pattern = null) {
    if (!pattern) {
        serverCache.clear();
        return;
    }
    for (const key of serverCache.keys()) {
        if (key.includes(pattern)) {
            serverCache.delete(key);
        }
    }
}
