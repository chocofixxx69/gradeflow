// Simple in-memory, per-process fixed-window rate limiter. Not distributed —
// on a multi-instance deploy each instance tracks its own counts, so the
// effective limit scales with instance count. Good enough as a first line of
// defense against basic credential-guessing; not a substitute for a shared
// store (e.g. Redis) if this ever needs to be airtight.
const buckets = new Map();

export function checkRateLimit(key, { limit = 10, windowMs = 60_000 } = {}) {
    const now = Date.now();
    const entry = buckets.get(key);

    if (!entry || now - entry.windowStart > windowMs) {
        buckets.set(key, { count: 1, windowStart: now });
        return { allowed: true };
    }

    entry.count += 1;
    if (entry.count > limit) {
        return { allowed: false, retryAfterSeconds: Math.ceil((windowMs - (now - entry.windowStart)) / 1000) };
    }

    return { allowed: true };
}

export function getClientIp(req) {
    const forwarded = req.headers?.get?.('x-forwarded-for');
    if (forwarded) return forwarded.split(',')[0].trim();
    return req.headers?.get?.('x-real-ip') || 'unknown';
}
