'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchAdminRiskAnalysis } from '../../../lib/api/risk';

const INITIAL_STATE = {
    error: '',
    loading: true,
    refreshing: false,
    risk: null,
};

export function useAdminRisk(filters) {
    const [state, setState] = useState(INITIAL_STATE);
    const abortRef = useRef(null);
    const requestIdRef = useRef(0);

    const loadRisk = useCallback(async ({ refresh = false } = {}) => {
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
            const data = await fetchAdminRiskAnalysis({ filters, signal: controller.signal });

            if (controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState({
                error: '',
                loading: false,
                refreshing: false,
                risk: data,
            });
        } catch (error) {
            if (error?.name === 'AbortError' || controller.signal.aborted || requestIdRef.current !== requestId) return;

            setState(prev => ({
                ...prev,
                error: error?.message || 'Risk analysis could not be loaded.',
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
        loadRisk();

        return () => {
            abortRef.current?.abort();
        };
    }, [loadRisk]);

    return {
        error: state.error,
        isEmpty: !state.loading && !state.error && !Array.isArray(state.risk?.students),
        loading: state.loading,
        refresh: () => loadRisk({ refresh: true }),
        refreshing: state.refreshing,
        risk: state.risk,
    };
}
