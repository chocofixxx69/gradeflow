/**
 * High-Performance In-Memory Server Cache for GradeFlow Analytics & Reports
 * 
 * Provides sub-millisecond response times for repeated analytics queries,
 * metadata lookups, and student rollups without continuous database roundtrips.
 */

const serverCache = new Map();
const MAX_CACHE_ENTRIES = 1000;

export function getCached(key) {
    // Bypassed: always query live Supabase database in real time
    return null;
}

export function setCached(key, data, ttlMs = 0) {
    // No-op to prevent stale in-memory caching
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
