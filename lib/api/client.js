const JSON_HEADERS = {
    Accept: 'application/json',
};

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

export async function apiRequest(path, { query, responseType = 'json', signal, ...options } = {}) {
    const response = await fetch(buildUrl(path, query), {
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
