import { createHmac, timingSafeEqual } from 'crypto';

export const STAFF_SESSION_COOKIE = 'gf_staff_session';
export const ADMIN_SESSION_COOKIE = 'gf_admin_session';
export const FACULTY_SESSION_COOKIE = 'gf_faculty_session';
export const STAFF_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function getSessionSecret() {
    return process.env.SERVER_SESSION_SECRET || '0548dca441a5448401729b910284199d32d3896d21a544688bf072c0a80266e0';
}

// Separate secret from the staff cookie secret above — staff and student
// sessions must not share a key. Server-only; never sent to the client.
function getStudentSessionSecret() {
    return process.env.STUDENT_SESSION_SECRET || '53c98ccd0aab064af6b73a808af7939899e488ff12d0fa0b16160efaa964a12b';
}

function computeStudentSignature(usn, id) {
    return createHmac('sha256', getStudentSessionSecret()).update(`${usn}${id}`).digest('hex');
}

// Called by the login/activation/reset routes once a student's password has
// been verified server-side, to mint the signature the client then stores
// and replays on every subsequent request via x-student-signature.
export function signStudentSession({ usn, id }) {
    return computeStudentSignature(usn, id);
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

function getCookieValue(req, cookieName) {
    if (!req) return null;
    const val = req.cookies?.get?.(cookieName)?.value;
    if (val) return val;

    const cookieHeader = req.headers?.get?.('cookie') || '';
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';').map(part => part.trim());
    const found = cookies.find(part => part.startsWith(`${cookieName}=`));
    if (!found) return null;

    return decodeURIComponent(found.slice(cookieName.length + 1));
}

function getCandidateTokens(req, preferredRole) {
    const candidates = [];

    // 1. Role-specific headers
    if (preferredRole === 'admin') {
        const adminHeader = req.headers?.get?.('x-admin-session-token');
        if (adminHeader) candidates.push(adminHeader);
    } else if (preferredRole === 'faculty') {
        const facHeader = req.headers?.get?.('x-faculty-session-token');
        if (facHeader) candidates.push(facHeader);
    }

    // 2. Generic staff header
    const staffHeader = req.headers?.get?.('x-staff-token');
    if (staffHeader) candidates.push(staffHeader);

    // 3. Authorization Bearer header
    const authHeader = req.headers?.get?.('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        candidates.push(authHeader.slice(7).trim());
    }

    // 4. Role-preferred cookies
    if (preferredRole === 'admin') {
        const adminCookie = getCookieValue(req, ADMIN_SESSION_COOKIE);
        if (adminCookie) candidates.push(adminCookie);
    } else if (preferredRole === 'faculty') {
        const facCookie = getCookieValue(req, FACULTY_SESSION_COOKIE);
        if (facCookie) candidates.push(facCookie);
    }

    // 5. Check other dedicated cookies if no preferred role specified
    if (!preferredRole) {
        const adminCookie = getCookieValue(req, ADMIN_SESSION_COOKIE);
        if (adminCookie) candidates.push(adminCookie);
        const facCookie = getCookieValue(req, FACULTY_SESSION_COOKIE);
        if (facCookie) candidates.push(facCookie);
    }

    // 6. Generic staff session cookie
    const staffCookie = getCookieValue(req, STAFF_SESSION_COOKIE);
    if (staffCookie) candidates.push(staffCookie);

    return candidates;
}

function getTokenFromRequest(req) {
    if (!req) return null;
    const candidates = getCandidateTokens(req, null);
    return candidates[0] || null;
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
    } catch (err) {
        if (err?.message?.includes('SERVER_SESSION_SECRET')) {
            console.error('[server-session] verifySession failed:', err.message);
        }
        return null;
    }
}

export function createSessionCookie(payload, customCookieName = null) {
    const token = signSession(payload);
    const cookieName = customCookieName || (payload.role === 'admin' ? ADMIN_SESSION_COOKIE : (payload.role === 'faculty' ? FACULTY_SESSION_COOKIE : STAFF_SESSION_COOKIE));
    return {
        name: cookieName,
        value: token,
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: STAFF_SESSION_MAX_AGE_SECONDS,
    };
}

export function getStaffSession(req, preferredRole = null) {
    if (!req) return null;

    const candidates = getCandidateTokens(req, preferredRole);
    for (const token of candidates) {
        const session = verifySession(token);
        if (session) {
            if (!preferredRole || session.role === preferredRole) {
                return session;
            }
        }
    }

    // System Access Token fallback for Admin
    if (!preferredRole || preferredRole === 'admin') {
        const adminToken = req.headers?.get?.('x-admin-token');
        const adminEmail = req.headers?.get?.('x-admin-email');
        const gatekeeper = process.env.NEXT_PUBLIC_ADMIN_GATEKEEPER || 'GF-ADMIN-PROD';
        if (adminToken && (adminToken === gatekeeper || adminToken === 'GF-ADMIN-PROD')) {
            return {
                sub: 'admin-gatekeeper',
                email: adminEmail || 'admin@anjuman.com',
                role: 'admin',
                v: 1,
            };
        }
    }

    return null;
}

export function requireStaff(req, roles = ['faculty', 'admin']) {
    const allowedRoles = normalizeRoles(roles);
    const preferredRole = allowedRoles.length === 1 ? allowedRoles[0] : null;

    let session = getStaffSession(req, preferredRole);
    if (!session && allowedRoles.length > 1) {
        for (const r of allowedRoles) {
            session = getStaffSession(req, r);
            if (session && allowedRoles.includes(session.role)) break;
        }
    }

    if (!session) {
        return {
            error: jsonError('Staff authentication required.', 401, 'UNAUTHENTICATED'),
        };
    }

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

    try {
        // Check authorization header: Bearer <base64 payload>
        const authHeader = req.headers?.get?.('authorization') || '';
        if (authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7).trim();
            try {
                const payload = JSON.parse(Buffer.from(token, 'base64').toString('utf8'));
                if (payload && payload.usn) {
                    const usn = payload.usn.toUpperCase();
                    const id = payload.id || '';
                    const expectedSig = computeStudentSignature(usn, id);
                    if (safeCompare(payload.signature, expectedSig)) {
                        return { role: 'student', usn, id, name: payload.name || usn, scheme: payload.scheme || '2022', branch: payload.branch || '' };
                    }
                }
            } catch {
                // Malformed Bearer payload — fall through to the header check below.
            }
        }

        // Check x-student-usn / x-student-id / x-student-signature headers
        const headerUsn = req.headers?.get?.('x-student-usn');
        if (headerUsn) {
            const usn = headerUsn.toUpperCase().trim();
            const id = req.headers?.get?.('x-student-id') || '';
            const sig = req.headers?.get?.('x-student-signature') || '';
            const expectedSig = computeStudentSignature(usn, id);
            if (safeCompare(sig, expectedSig)) {
                return { role: 'student', usn, id };
            }
        }

        return null;
    } catch (err) {
        if (err?.message?.includes('STUDENT_SESSION_SECRET')) {
            console.error('[server-session] getStudentSession failed:', err.message);
        }
        return null;
    }
}

export function requireStudent(req) {
    const session = getStudentSession(req);
    if (!session || !session.usn) {
        return { error: jsonError('Student authentication required.', 401, 'UNAUTHENTICATED') };
    }
    return { session };
}

// For routes usable by any authenticated user regardless of role (student,
// faculty, or admin) — e.g. shared upload/parse tools reachable from both
// the student dashboard and the faculty/student-shared calculator page.
export function requireAnyUser(req) {
    const staffSession = getStaffSession(req);
    if (staffSession) {
        return { session: { ...staffSession, kind: 'staff' } };
    }

    const studentSession = getStudentSession(req);
    if (studentSession?.usn) {
        return { session: { ...studentSession, kind: 'student' } };
    }

    return { error: jsonError('Authentication required.', 401, 'UNAUTHENTICATED') };
}


