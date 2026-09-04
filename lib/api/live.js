'use client';

/**
 * Live data hooks.
 *
 * Every screen that should stay current polls its existing API route through
 * SWR rather than subscribing to Supabase Realtime. That is a deliberate
 * choice, not a fallback:
 *
 *   Realtime enforces RLS, and this app authenticates with its own signed
 *   session cookies rather than Supabase Auth - so there is no auth.uid() for a
 *   policy to scope rows against. Making marks and results reach the browser
 *   over Realtime would mean granting the public anon key SELECT on them, which
 *   would stream every student's marks and PII to anyone holding the key that
 *   ships in the JS bundle. Polling goes through the API routes instead, which
 *   validate the session server-side and query on the service role, so the RLS
 *   lockdown stays intact.
 *
 * Everything here sits on top of apiRequest(), so session headers, query
 * building and ApiError normalization are unchanged.
 */

import useSWR, { useSWRConfig } from 'swr';
import { apiRequest, getStudentAuthHeaders } from './client';

/**
 * Refresh cadences. Pick by how fast the underlying data actually moves -
 * polling faster than the data changes just costs database round trips.
 */
export const LIVE = {
    /** Job/progress rows that change second to second while a scrape runs. */
    FAST: 3_000,
    /** Rosters, student lists, dashboards - the default for operational screens. */
    NORMAL: 10_000,
    /** Analytics rollups and catalogs, which move only when a scrape lands. */
    SLOW: 30_000,
    /** Reference data: no polling, but still refetched when the tab regains focus. */
    STATIC: 0,
};

const fetcher = ([path, query, headers]) => apiRequest(path, { query, headers });

/**
 * Subscribe a component to an API route.
 *
 * @param {string|null} path      API route. Pass null to disable the request.
 * @param {object}      options
 * @param {object}      options.query     Query params, same shape apiRequest takes.
 * @param {object}      options.headers   Extra headers (student auth, etc).
 * @param {number}      options.interval  One of LIVE.*, or milliseconds.
 * @param {boolean}     options.enabled   False suspends polling without unmounting.
 */
export function useLive(path, {
    query,
    headers,
    interval = LIVE.NORMAL,
    enabled = true,
    ...swrOptions
} = {}) {
    const key = (enabled && path) ? [path, query || {}, headers || {}] : null;

    const { data, error, isLoading, isValidating, mutate } = useSWR(key, fetcher, {
        refreshInterval: interval,
        // Do not poll a backgrounded tab; SWR refetches on focus instead.
        refreshWhenHidden: false,
        refreshWhenOffline: false,
        // Keep the previous page of data on screen while a changed filter loads,
        // so switching class or branch does not blank the table.
        keepPreviousData: true,
        ...swrOptions,
    });

    return {
        data,
        error,
        isLoading,
        /** True while a background refresh is in flight - for a subtle "updating" dot. */
        isRefreshing: isValidating && !isLoading,
        /** Force an immediate refetch, e.g. straight after a mutation. */
        refresh: mutate,
    };
}

/**
 * useLive for student-facing screens: injects the x-student-* auth headers the
 * student API routes require.
 */
export function useLiveStudent(path, options = {}) {
    const headers = getStudentAuthHeaders(options.session);
    const authed = Boolean(headers['x-student-signature']);

    return useLive(path, {
        ...options,
        headers: { ...headers, ...(options.headers || {}) },
        enabled: authed && (options.enabled ?? true),
    });
}

/**
 * Revalidate every live query whose path starts with one of the given prefixes.
 * Call after a mutation so the change appears immediately instead of on the
 * next poll tick.
 *
 *   await addStudentsToClass(...);
 *   refreshLive('/api/class-students', '/api/classes');
 */
export function useRefreshLive() {
    const { mutate } = useSWRConfig();

    return (...pathPrefixes) => mutate(
        (key) => Array.isArray(key)
            && typeof key[0] === 'string'
            && pathPrefixes.some((prefix) => key[0].startsWith(prefix)),
        undefined,
        { revalidate: true }
    );
}

/**
 * Global SWR behaviour. Applied once in ClientLayoutWrapper.
 */
export const swrGlobalConfig = {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    // Collapses duplicate requests fired by sibling components on the same tick.
    dedupingInterval: 2_000,
    errorRetryCount: 3,
    onErrorRetry: (error, _key, config, revalidate, { retryCount }) => {
        // Never retry auth or missing-resource failures - retrying a 401 just
        // hammers the route and cannot succeed until the user signs in again.
        if ([400, 401, 403, 404, 409].includes(error?.status)) return;
        if (retryCount >= (config.errorRetryCount ?? 3)) return;
        // Back off: 5s, 10s, 20s.
        setTimeout(() => revalidate({ retryCount }), 5_000 * 2 ** retryCount);
    },
};
