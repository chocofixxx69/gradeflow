/**
 * High-Performance In-Memory Server Cache for GradeFlow Analytics & Reports
 * 
 * Provides sub-millisecond response times for repeated analytics queries,
 * metadata lookups, and student rollups without continuous database roundtrips.
 */

const serverCache = new Map();
const MAX_CACHE_ENTRIES = 1000;

export function getCached(key) {
    if (!key) return null;
    const entry = serverCache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
        serverCache.delete(key);
        return null;
    }
    // Refresh access order (LRU)
    serverCache.delete(key);
    serverCache.set(key, entry);
    return entry.data;
}

export function setCached(key, data, ttlMs = 60_000) {
    if (!key || data === undefined) return;
    if (serverCache.size >= MAX_CACHE_ENTRIES) {
        const oldestKey = serverCache.keys().next().value;
        if (oldestKey) serverCache.delete(oldestKey);
    }
    serverCache.set(key, {
        data,
        expiresAt: Date.now() + ttlMs
    });
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
