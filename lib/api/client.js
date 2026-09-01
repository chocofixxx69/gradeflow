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

async function executeRequest(url, { responseType = 'json', signal, ...options } = {}) {
    const response = await fetch(url, {
        ...options,
        cache: options.cache || 'no-store',
        credentials: 'include',
        headers: {
            ...JSON_HEADERS,
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

export async function apiRequest(path, { query, responseType = 'json', signal, ...options } = {}) {
    const url = buildUrl(path, query);
    const method = (options.method || 'GET').toUpperCase();

    // Deduplicate identical in-flight GET requests
    if (method === 'GET' && !signal && responseType === 'json') {
        const cacheKey = `${url}|${JSON.stringify(options.headers || {})}`;
        if (inFlightRequests.has(cacheKey)) {
            return inFlightRequests.get(cacheKey);
        }

        const requestPromise = (async () => {
            try {
                return await executeRequest(url, { responseType, signal, ...options });
            } finally {
                inFlightRequests.delete(cacheKey);
            }
        })();

        inFlightRequests.set(cacheKey, requestPromise);
        return requestPromise;
    }

    return executeRequest(url, { responseType, signal, ...options });
}
