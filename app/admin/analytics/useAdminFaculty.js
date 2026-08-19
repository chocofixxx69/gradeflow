'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminFaculty } from '../../../lib/api/analytics';

const INITIAL_STATE = {
    error: '',
    faculty: null,
    loading: true,
    refreshing: false,
};

export function useAdminFaculty(filters) {
    const [state, setState] = useState(INITIAL_STATE);
    const abortRef = useRef(null);
    const requestIdRef = useRef(0);

    const load = useCallback(async ({ refresh = false } = {}) => {
        abortRef.current?.abort();

        const controller = new AbortController();
        const requestId = requestIdRef.current + 1;
        requestIdRef.current = requestId;
        abortRef.current = controller;

        setState(prev => ({
            ...prev,
            error: '',
            loading: refresh ? prev.loading : true,
            refreshing: refresh,
        }));

        try {
            const data = await fetchAdminFaculty({ filters, signal: controller.signal });

            if (controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState({
                error: '',
                faculty: data,
                loading: false,
                refreshing: false,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState(prev => ({
                ...prev,
                error: error?.message || 'Faculty analysis could not be loaded.',
                loading: false,
                refreshing: false,
            }));
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    }, [filters]);

    useEffect(() => {
        load();

        return () => {
            abortRef.current?.abort();
        };
    }, [load]);

    return {
        error: state.error,
        faculty: state.faculty,
        isEmpty: !state.loading && !state.error && !Array.isArray(state.faculty?.faculty),
        loading: state.loading,
        refresh: () => load({ refresh: true }),
        refreshing: state.refreshing,
    };
}
