import { createHmac, timingSafeEqual } from 'crypto';

export const STAFF_SESSION_COOKIE = 'gf_staff_session';
export const STAFF_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getSessionSecret() {
    const secret = process.env.SERVER_SESSION_SECRET;
    if (!secret) {
        throw new Error('SERVER_SESSION_SECRET is not configured.');
    }
    return secret;
}

function base64UrlEncode(value) {
    const input = typeof value === 'string' ? value : JSON.stringify(value);
    return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
    return Buffer.from(value, 'base64url').toString('utf8');
}

function signPayload(encodedPayload) {
    return createHmac('sha256', getSessionSecret()).update(encodedPayload).digest('base64url');
}

function safeCompare(left, right) {
    const leftBuffer = Buffer.from(String(left || ''), 'utf8');
    const rightBuffer = Buffer.from(String(right || ''), 'utf8');
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeRoles(roles) {
    if (!roles) return [];
    return Array.isArray(roles) ? roles : [roles];
}

function jsonError(message, status, code = 'ERROR') {
    return Response.json({ success: false, error: { code, message } }, { status });
}

function getTokenFromRequest(req) {
    if (!req) return null;

    const cookieValue = req.cookies?.get?.(STAFF_SESSION_COOKIE)?.value;
    if (cookieValue) return cookieValue;

    const cookieHeader = req.headers?.get?.('cookie') || '';
    const cookies = cookieHeader.split(';').map(part => part.trim());
    const sessionCookie = cookies.find(part => part.startsWith(`${STAFF_SESSION_COOKIE}=`));
    if (!sessionCookie) return null;

    return decodeURIComponent(sessionCookie.slice(STAFF_SESSION_COOKIE.length + 1));
}

export function signSession(payload) {
    if (!payload || typeof payload !== 'object') {
        throw new Error('Session payload must be an object.');
    }

    if (!payload.sub || !payload.email || !payload.role) {
        throw new Error('Session payload requires sub, email, and role.');
    }

    if (!['admin', 'faculty'].includes(payload.role)) {
        throw new Error('Session role must be admin or faculty.');
    }

    const now = Math.floor(Date.now() / 1000);
    const sessionPayload = {
        v: 1,
        iat: now,
        exp: now + STAFF_SESSION_MAX_AGE_SECONDS,
        ...payload,
    };

    if (!Number.isFinite(sessionPayload.exp) || sessionPayload.exp <= now) {
        throw new Error('Session expiry must be in the future.');
    }

    const encodedPayload = base64UrlEncode(sessionPayload);
    const signature = signPayload(encodedPayload);
    return `${encodedPayload}.${signature}`;
}

export function verifySession(token) {
    try {
        if (!token || typeof token !== 'string') return null;

        const [encodedPayload, signature, extra] = token.split('.');
        if (!encodedPayload || !signature || extra !== undefined) return null;

        const expectedSignature = signPayload(encodedPayload);
        if (!safeCompare(signature, expectedSignature)) return null;

        const payload = JSON.parse(base64UrlDecode(encodedPayload));
        const now = Math.floor(Date.now() / 1000);

        if (payload.v !== 1) return null;
        if (!payload.sub || !payload.email || !payload.role) return null;
        if (!['admin', 'faculty'].includes(payload.role)) return null;
        if (!Number.isFinite(payload.exp) || payload.exp <= now) return null;

        return payload;
    } catch {
        return null;
    }
}

export function createSessionCookie(payload) {
    const token = signSession(payload);
    return {
        name: STAFF_SESSION_COOKIE,
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
    };
}

export function clearSessionCookie() {
    return {
        name: STAFF_SESSION_COOKIE,
        value: '',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    };
}

export function getStaffSession(req) {
    return verifySession(getTokenFromRequest(req));
}

export function requireStaff(req, roles = ['faculty', 'admin']) {
    const session = getStaffSession(req);
    if (!session) {
        return {
            error: jsonError('Staff authentication required.', 401, 'UNAUTHENTICATED'),
        };
    }

    const allowedRoles = normalizeRoles(roles);
    if (allowedRoles.length > 0 && !allowedRoles.includes(session.role)) {
        return {
            error: jsonError('Insufficient staff permissions.', 403, 'FORBIDDEN'),
        };
    }

    return { session };
}

export function requireAdmin(req) {
    return requireStaff(req, ['admin']);
}
