'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminRankings } from '../../../lib/api/analytics';

const INITIAL_STATE = {
    error: '',
    loading: true,
    rankings: null,
    refreshing: false,
};

export function useAdminRankings(filters, limit = 10) {
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
            const data = await fetchAdminRankings({ filters, limit, signal: controller.signal });

            if (controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState({
                error: '',
                loading: false,
                rankings: data,
                refreshing: false,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState(prev => ({
                ...prev,
                error: error?.message || 'Rankings could not be loaded.',
                loading: false,
                refreshing: false,
            }));
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    }, [filters, limit]);

    useEffect(() => {
        load();

        return () => {
            abortRef.current?.abort();
        };
    }, [load]);

    const isEmpty = !state.loading && !state.error && (
        !Array.isArray(state.rankings?.top_students) || state.rankings.top_students.length === 0
    ) && (
        !Array.isArray(state.rankings?.top_subjects) || state.rankings.top_subjects.length === 0
    ) && (
        !Array.isArray(state.rankings?.top_classes) || state.rankings.top_classes.length === 0
    );

    return {
        error: state.error,
        isEmpty,
        loading: state.loading,
        rankings: state.rankings,
        refresh: () => load({ refresh: true }),
        refreshing: state.refreshing,
    };
}
