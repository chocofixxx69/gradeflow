'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useAdminResource(fetcher, filters) {
    const [state, setState] = useState({ data: null, error: '', loading: true, refreshing: false });
    const abortRef = useRef(null);
    const load = useCallback(async ({ refresh = false } = {}) => {
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        setState(current => ({ ...current, error: '', loading: refresh ? current.loading : true, refreshing: refresh }));
        try {
            const data = await fetcher({ filters, signal: controller.signal });
            if (!controller.signal.aborted) setState({ data, error: '', loading: false, refreshing: false });
        } catch (error) {
            if (!controller.signal.aborted) setState(current => ({ ...current, error: error.message || 'Data could not be loaded.', loading: false, refreshing: false }));
        }
    }, [fetcher, filters]);
    useEffect(() => { load(); return () => abortRef.current?.abort(); }, [load]);
    return { ...state, isEmpty: !state.loading && !state.error && !Object.values(state.data || {}).some(value => Array.isArray(value) && value.length), refresh: () => load({ refresh: true }) };
}
