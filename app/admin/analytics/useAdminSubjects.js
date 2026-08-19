'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminSubjects } from '../../../lib/api/analytics';

const INITIAL_STATE = {
    error: '',
    loading: true,
    refreshing: false,
    subjects: null,
};

export function useAdminSubjects(filters) {
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
            const data = await fetchAdminSubjects({ filters, signal: controller.signal });

            if (controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState({
                error: '',
                loading: false,
                refreshing: false,
                subjects: data,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState(prev => ({
                ...prev,
                error: error?.message || 'Subject analysis could not be loaded.',
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
        isEmpty: !state.loading && !state.error && !Array.isArray(state.subjects?.subjects),
        loading: state.loading,
        refresh: () => load({ refresh: true }),
        refreshing: state.refreshing,
        subjects: state.subjects,
    };
}
