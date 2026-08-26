import { supabase } from './supabase.js';

/**
 * Fetches all rows from a Supabase table by automatically paginating in batches.
 * Rebuilds the query on every iteration to avoid Supabase mutated-builder bugs.
 *
 * Signatures:
 * 1. fetchAllPaginated(tableName, selectClause, supabaseClient, orderCol?, ascending?)
 * 2. fetchAllPaginated(queryBuilder, pageSize) — legacy, still supported
 */
export async function fetchAllPaginated(arg1, arg2, client, orderCol, ascending = true, pageSize = 1000) {
    const allData = [];
    let from = 0;

    // Signature 1: table name string + client
    if (typeof arg1 === 'string' && client && typeof client.from === 'function') {
        const table = arg1;
        const select = arg2 || '*';

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


export async function fetchByChunks(table, select, filterCol, filterValues, client = supabase, chunkSize = 30) {
    if (!filterValues || filterValues.length === 0) return [];
    
    const values = [...new Set(filterValues.filter(Boolean))];
    if (values.length === 0) return [];
    
    let allData = [];
    const pageSize = 1000;
    
    for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);
        let from = 0;
        
        while (true) {
            const { data, error } = await client
                .from(table)
                .select(select)
                .in(filterCol, chunk)
                .range(from, from + pageSize - 1);
                
            if (error) {
                console.error(`Error fetching chunk ${i} (range ${from}-${from + pageSize - 1}) from ${table}:`, error);
                break;
            }
            
            if (data && data.length > 0) {
                allData = allData.concat(data);
            }
            
            if (!data || data.length < pageSize) {
                break;
            }
            from += pageSize;
        }
    }
    
    return allData;
}

