import { supabase } from './supabase';

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


/**
 * Fetches rows by chunking a filter list (e.g. a list of USNs).
 * This avoids URL length limits and Supabase expression limits.
 * 
 * @param {string} table - Table name
 * @param {string} select - Columns to select
 * @param {string} filterCol - Column to filter on (using .in())
 * @param {Array} filterValues - List of values to filter by
 * @param {object} client - Optional Supabase client (defaults to standard client)
 * @param {number} chunkSize - Number of values per chunk (default 100)
 * @returns {Promise<Array>} - Combined results
 */
export async function fetchByChunks(table, select, filterCol, filterValues, client = supabase, chunkSize = 100) {
    if (!filterValues || filterValues.length === 0) return [];
    
    const values = [...new Set(filterValues)];
    let allData = [];
    
    for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize);
        const { data, error } = await client
            .from(table)
            .select(select)
            .in(filterCol, chunk);
            
        if (error) {
            console.error(`Error fetching chunk ${i} from ${table}:`, error);
            continue;
        }
        
        if (data) {
            allData = allData.concat(data);
        }
    }
    
    return allData;
}

