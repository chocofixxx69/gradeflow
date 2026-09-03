'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLeaderboard } from '../../../lib/api/analytics';

const INITIAL_STATE = {
    error: '',
    loading: true,
    data: null,
    refreshing: false,
};

export function useAdminLeaderboard(filters, { viewSemester, subjectCode } = {}) {
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
            const data = await fetchLeaderboard({ filters, viewSemester, subjectCode, signal: controller.signal });

            if (controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState({
                error: '',
                loading: false,
                data,
                refreshing: false,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState(prev => ({
                ...prev,
                error: error?.message || 'Leaderboard could not be loaded.',
                loading: false,
                refreshing: false,
            }));
        } finally {
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
        }
    }, [filters, viewSemester, subjectCode]);

    useEffect(() => {
        load();

        return () => {
            abortRef.current?.abort();
        };
    }, [load]);

    const isEmpty = !state.loading && !state.error && (state.data?.totalStudents ?? 0) === 0;

    return {
        error: state.error,
        isEmpty,
        loading: state.loading,
        data: state.data,
        refresh: () => load({ refresh: true }),
        refreshing: state.refreshing,
    };
}
