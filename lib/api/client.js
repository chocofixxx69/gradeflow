const JSON_HEADERS = {
    Accept: 'application/json',
};

// Builds the x-student-* headers the API's student auth check requires.
// Reads the signed session already stored by the student login/activation flow —
// callers that already have the parsed session in hand can build these headers
// directly instead (see app/dashboard/page.jsx's loadStudentData).
export function getStudentAuthHeaders(session) {
    let s = session;
    if (!s && typeof window !== 'undefined') {
        try {
            s = JSON.parse(localStorage.getItem('student_session') || 'null');
        } catch {
            s = null;
        }
    }
    if (!s?.usn || !s?.signature) return {};
    return {
        'x-student-usn': s.usn,
        'x-student-id': s.id || '',
        'x-student-signature': s.signature,
    };
}

export class ApiError extends Error {
    constructor(message, { code = 'REQUEST_FAILED', status = 0, details = null } = {}) {
        super(message);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
        this.details = details;
    }
}

function buildUrl(path, query) {
    const params = new URLSearchParams();

    Object.entries(query || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === '' || value === 'all') return;
        params.set(key, String(value));
    });

    const queryString = params.toString();
    return queryString ? `${path}?${queryString}` : path;
}

async function parseResponse(response, responseType) {
    if (responseType === 'blob') {
        return response.blob();
    }

    if (responseType === 'text') {
        return response.text();
    }

    try {
        return await response.json();
    } catch {
        return null;
    }
}

const inFlightRequests = new Map();
const clientResponseCache = new Map();

export function clearApiCache() {
    clientResponseCache.clear();
}

export function getCachedApiData(path, query = {}) {
    const url = buildUrl(path, query);
    const cacheKey = `${url}|${JSON.stringify({})}`;
    const cached = clientResponseCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < 120_000) {
        return cached.data;
    }
    return null;
}

export function preloadApi(path, query = {}) {
    if (typeof window === 'undefined') return Promise.resolve(null);
    return apiRequest(path, { query }).catch(() => null);
}

function getClientAuthHeaders() {
    if (typeof window === 'undefined') return {};
    const headers = {};

    try {
        const admStr = localStorage.getItem('admin_session');
        if (admStr) {
            const adm = JSON.parse(admStr);
            if (adm?.token) headers['x-admin-token'] = adm.token;
            if (adm?.email) headers['x-admin-email'] = adm.email;
            if (adm?.sessionToken) {
                headers['x-admin-session-token'] = adm.sessionToken;
                headers['x-staff-token'] = adm.sessionToken;
            }
        }
    } catch {}

    try {
        const facStr = localStorage.getItem('faculty_session');
        if (facStr) {
            const fac = JSON.parse(facStr);
            if (fac?.sessionToken) {
                headers['x-faculty-session-token'] = fac.sessionToken;
                if (!headers['x-staff-token']) {
                    headers['x-staff-token'] = fac.sessionToken;
                }
            }
        }
    } catch {}

    try {
        const stuHeaders = getStudentAuthHeaders();
        Object.assign(headers, stuHeaders);
    } catch {}

    return headers;
}

async function executeRequest(url, { responseType = 'json', signal, ...options } = {}) {
    const authHeaders = getClientAuthHeaders();
    const response = await fetch(url, {
        ...options,
        cache: 'no-store',
        credentials: 'include',
        headers: {
            ...JSON_HEADERS,
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            Pragma: 'no-cache',
            ...authHeaders,
            ...(options.headers || {}),
        },
        signal,
    });

    if (!response.ok) {
        const errorPayload = await parseResponse(response, 'json');
        const backendError = errorPayload?.error;
        throw new ApiError(
            backendError?.message || `Request failed with status ${response.status}.`,
            {
                code: backendError?.code || `HTTP_${response.status}`,
                status: response.status,
                details: backendError?.details || null,
            }
        );
    }

    const payload = await parseResponse(response, responseType);

    if (responseType === 'json' && payload?.success === false) {
        const backendError = payload?.error;
        throw new ApiError(
            backendError?.message || `Request failed with status ${response.status}.`,
            {
                code: backendError?.code || `HTTP_${response.status}`,
                status: response.status,
                details: backendError?.details || null,
            }
        );
    }

    return payload?.data ?? payload ?? null;
}

export async function apiRequest(path, { query, responseType = 'json', signal, cacheTtl = 0, ...options } = {}) {
    const url = buildUrl(path, query);
    const method = (options.method || 'GET').toUpperCase();

    // Ensure real-time live data: only cache if explicitly specified by caller
    let defaultTtl = cacheTtl;
    const cacheKey = `${url}|${JSON.stringify(options.headers || {})}`;

    if (method === 'GET' && defaultTtl > 0) {
        const cached = clientResponseCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < defaultTtl) {
            return cached.data;
        }
    }

    // Deduplicate identical in-flight GET requests
    if (method === 'GET' && !signal && responseType === 'json') {
        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const requestPromise = (async () => {
            try {
                const res = await executeRequest(url, { responseType, signal, ...options });
                if (defaultTtl > 0) {
                    clientResponseCache.set(cacheKey, { timestamp: Date.now(), data: res });
                }
                return res;
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, requestPromise);
        return requestPromise;
    }

    // Any non-GET mutation clears cached reads
    if (method !== 'GET') {
        clientResponseCache.clear();
    }

    return executeRequest(url, { responseType, signal, ...options });
}
