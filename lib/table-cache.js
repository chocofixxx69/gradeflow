// lib/table-cache.js
//
// ONE process-wide cache for whole-table reads.
//
// Several independent layers each need the same tables — the analytics warehouse,
// the bulk marks reader, the students directory and the data-health sweep all want
// students, subject_marks, results and academic_remarks. Each used to issue its own
// full read with its own private cache, so a single page load could pull
// subject_marks (19k rows, 20 pages) three or four times over. Under concurrency
// that saturated Supabase's pooler and turned 3-second routes into 100-second ones.
//
// Reads are memoised by (table, select) and de-duplicated while in flight, so
// simultaneous callers share one round trip rather than racing each other.

import { fetchAllPaginated } from './supabase-utils.js';

const DEFAULT_TTL_MS = 60_000;

/**
 * Canonical column lists.
 *
 * The cache keys on (table, select), so two readers only share a read when they ask
 * for exactly the same columns. Routing every consumer through these constants is
 * what makes the sharing actually happen — otherwise each layer's slightly different
 * select pulled its own copy of subject_marks.
 */
export const SELECTS = {
    students: 'id, usn, name, branch, branch_code, semester, year, scheme, email, phone, is_suspended, lateral_entry, created_at',
    subject_marks: 'id, usn, semester, subject_code, subject_name, internal, external, total, grade, credits, passed, is_backlog, is_makeup, result_id',
    results: 'id, usn, semester, sgpa, total_credits, exam_name, exam_url, scraped_at, exam_session_id',
    academic_remarks: 'student_usn, semester, sgpa, backlog_count, is_all_clear',
    classes: 'id, name, branch, branch_code, semester, section, batch, academic_year, faculty_id, created_at',
    class_students: 'class_id, usn',
    subject_catalog: 'scheme, branch, semester, subject_code, subject_name, credits'
};

const cache = new Map(); // `${table}|${select}` -> { at, promise }

/**
 * Reads an entire table, sharing the result with every other caller inside the TTL.
 * A rejected read is never cached, so a transient failure does not stick.
 */
export function readTable(client, table, select = '*', { ttl = DEFAULT_TTL_MS, orderCol, ascending = true } = {}) {
    const key = `${table}|${select}|${orderCol || ''}|${ascending ? 'asc' : 'desc'}`;
    const hit = cache.get(key);
    if (hit && (Date.now() - hit.at) < ttl) return hit.promise;

    const promise = fetchAllPaginated(table, select, client, orderCol, ascending)
        .catch(err => {
            cache.delete(key);
            throw err;
        });

    cache.set(key, { at: Date.now(), promise });
    return promise;
}

/**
 * Drops cached reads. Pass a table name to clear just that table (every select
 * variant of it), or nothing to clear everything.
 */
export function invalidateTableCache(table = null) {
    if (!table) {
        cache.clear();
        return;
    }
    for (const key of [...cache.keys()]) {
        if (key.startsWith(`${table}|`)) cache.delete(key);
    }
}

/** What is currently held, for diagnostics. */
export function tableCacheStatus() {
    const now = Date.now();
    return [...cache.entries()].map(([key, v]) => {
        const [table, select, orderCol, direction] = key.split('|');
        return { table, select, orderCol: orderCol || null, direction, ageMs: now - v.at };
    });
}
