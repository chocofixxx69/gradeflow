'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminBacklogs } from '../../../lib/api/analytics';

const INITIAL_STATE = {
    backlogs: null,
    error: '',
    loading: true,
    refreshing: false,
};

export function useAdminBacklogs(filters) {
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
            const data = await fetchAdminBacklogs({ filters, signal: controller.signal });

            if (controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState({
                backlogs: data,
                error: '',
                loading: false,
                refreshing: false,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState(prev => ({
                ...prev,
                error: error?.message || 'Backlog analysis could not be loaded.',
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
        backlogs: state.backlogs,
        error: state.error,
        isEmpty: !state.loading && !state.error && !Array.isArray(state.backlogs?.student_backlogs),
        loading: state.loading,
        refresh: () => load({ refresh: true }),
        refreshing: state.refreshing,
    };
}
