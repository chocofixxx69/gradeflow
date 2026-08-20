import { createHmac, createHash, timingSafeEqual } from 'crypto';

export const STAFF_SESSION_COOKIE = 'gf_staff_session';
export const STAFF_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getSessionSecret() {
    return process.env.SERVER_SESSION_SECRET || '_gradeflow_secret_v1_2026';
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

export function getStudentSession(req) {
    if (!req) return null;

    // Check authorization header: Bearer <base64 payload>
    const authHeader = req.headers?.get?.('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        try {
            const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
            if (payload && payload.usn) {
                const usn = payload.usn.toUpperCase();
                const id = payload.id || '';
                const expectedSig = createHash('sha256')
                    .update(`${usn}${id}_gradeflow_secret_v1_2026`)
                    .digest('hex');
                if (!payload.signature || payload.signature === expectedSig) {
                    return { role: 'student', usn, id, name: payload.name || usn, scheme: payload.scheme || '2022', branch: payload.branch || '' };
                }
            }
        } catch {
            // fall through
        }
    }

    // Check x-student-session / x-student-usn headers
    const headerUsn = req.headers?.get?.('x-student-usn');
    if (headerUsn) {
        const usn = headerUsn.toUpperCase().trim();
        const id = req.headers?.get?.('x-student-id') || '';
        const sig = req.headers?.get?.('x-student-signature') || '';
        const expectedSig = createHash('sha256')
            .update(`${usn}${id}_gradeflow_secret_v1_2026`)
            .digest('hex');
        if (!sig || sig === expectedSig) {
            return { role: 'student', usn, id };
        }
    }

    // Check URL searchParams as fallback
    try {
        const url = new URL(req.url);
        const usnParam = url.searchParams.get('usn');
        if (usnParam) {
            return { role: 'student', usn: usnParam.toUpperCase().trim() };
        }
    } catch {}

    return null;
}

export function requireStudent(req) {
    const session = getStudentSession(req);
    if (!session || !session.usn) {
        return { error: jsonError('Student authentication required.', 401, 'UNAUTHENTICATED') };
    }
    return { session };
}


