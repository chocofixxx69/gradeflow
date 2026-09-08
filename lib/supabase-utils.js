import { supabase } from './supabase.js';

/**
 * How many page reads of one table may be in flight at once.
 *
 * Unbounded parallelism is faster in isolation but saturates Supabase's connection
 * pool once several routes load at the same time: a fully parallel read of
 * subject_marks (20 pages) multiplied across concurrent requests produced one-off
 * responses of 60s and 239s against a warehouse that normally answers in 2-4s. Four
 * keeps most of the speedup and leaves the pool room to breathe.
 */
const PAGE_CONCURRENCY = 4;

/** Runs `fn` over `items` with at most `limit` promises in flight, preserving order. */
async function mapWithConcurrency(items, limit, fn) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            results[i] = await fn(items[i], i);
        }
    });
    await Promise.all(workers);
    return results;
}

/**
 * Fetches all rows from a Supabase table by automatically paginating in batches.
 * Rebuilds the query on every iteration to avoid Supabase mutated-builder bugs.
 *
 * Signatures:
 * 1. fetchAllPaginated(tableName, selectClause, supabaseClient, orderCol?, ascending?)
 * 2. fetchAllPaginated(queryBuilder, pageSize) — legacy, still supported
 */
export async function fetchAllPaginated(arg1, arg2, client, orderCol, ascending = true, pageSize = 1000) {
    // Signature 1: table name string + client
    if (typeof arg1 === 'string' && client && typeof client.from === 'function') {
        const table = arg1;
        const select = arg2 || '*';

        // Ask how many rows there are first, then fetch every page at once.
        //
        // The loop this replaced walked pages strictly one after another, so a table
        // like subject_marks (19,345 rows) cost twenty sequential round trips before
        // it returned anything — several seconds per table, paid again by every
        // analytics route on every request. One HEAD count plus parallel range reads
        // costs roughly one round trip in total.
        //
        // Parallel ranges need a deterministic order or pages can overlap and drop
        // rows, so an explicit order column is always applied: the caller's if it
        // gave one, otherwise the primary key.
        const { count, error: countError } = await client
            .from(table)
            .select('*', { count: 'exact', head: true });

        if (!countError && typeof count === 'number') {
            if (count === 0) return [];
            const pages = Math.ceil(count / pageSize);
            const order = orderCol || 'id';

            if (pages === 1) {
                const { data, error } = await client.from(table).select(select).order(order, { ascending }).range(0, pageSize - 1);
                if (!error) return data || [];
                // Table has no such order column — fall through to the sequential walk.
            } else {
                try {
                    const chunks = await mapWithConcurrency(
                        Array.from({ length: pages }, (_, p) => p),
                        PAGE_CONCURRENCY,
                        async (p) => {
                            const { data, error } = await client.from(table).select(select)
                                .order(order, { ascending })
                                .range(p * pageSize, (p + 1) * pageSize - 1);
                            if (error) throw error;
                            return data || [];
                        }
                    );
                    return chunks.flat();
                } catch (err) {
                    console.warn(`fetchAllPaginated: parallel read of ${table} failed (${err.message}); falling back to sequential.`);
                }
            }
        }

        // Sequential fallback: no count available, or the order column did not exist.
        const allData = [];
        let from = 0;
        while (true) {
            let q = client.from(table).select(select);
            if (orderCol) q = q.order(orderCol, { ascending });
            q = q.range(from, from + pageSize - 1);

            const { data, error } = await q;
            if (error) { console.error('fetchAllPaginated error:', error); throw error; }
            if (data) allData.push(...data);
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }
        return allData;
    }

    // Signature 2: pre-built query builder (legacy)
    const query = arg1;
    const batchSize = Number(arg2) || 1000;
    if (!query || typeof query.range !== 'function') {
        throw new Error('fetchAllPaginated: invalid query object');
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}


export async function fetchByChunks(table, select, filterCol, filterValues, client = supabase, chunkSize = 100) {
    if (!filterValues || filterValues.length === 0) return [];
    
    const values = [...new Set(filterValues.filter(Boolean))];
    if (values.length === 0) return [];
    
    const pageSize = 1000;
    const chunks = [];
    for (let i = 0; i < values.length; i += chunkSize) {
        chunks.push(values.slice(i, i + chunkSize));
    }
    
    // Execute all chunks in parallel for maximum network efficiency
    const chunkPromises = chunks.map(async (chunk) => {
        let chunkData = [];
        let from = 0;
        
        while (true) {
            const { data, error } = await client
                .from(table)
                .select(select)
                .in(filterCol, chunk)
                .range(from, from + pageSize - 1);
                
            if (error) {
                console.error(`Error fetching chunk (range ${from}-${from + pageSize - 1}) from ${table}:`, error);
                break;
            }
            
            if (data && data.length > 0) {
                chunkData = chunkData.concat(data);
            }
            
            if (!data || data.length < pageSize) {
                break;
            }
            from += pageSize;
        }
        return chunkData;
    });

    const results = await Promise.all(chunkPromises);
    return results.flat();
}

