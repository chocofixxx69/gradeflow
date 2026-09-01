import bcrypt from 'bcryptjs';
import { createHash, timingSafeEqual } from 'crypto';

const BCRYPT_SALT_ROUNDS = 10;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

// Only for verifying students.password_hash values written before the
// server-side session-secret migration (a fixed pepper, no per-user salt).
// Never used to write new hashes — hashStudentPassword() (bcrypt) is used
// for every new activation/reset going forward.
function getLegacyPasswordPepper() {
    return process.env.LEGACY_STUDENT_PASSWORD_PEPPER || '_gradeflow_secret_v1_2026';
}

function safeCompareHex(a, b) {
    const left = Buffer.from(String(a || ''), 'utf8');
    const right = Buffer.from(String(b || ''), 'utf8');
    return left.length === right.length && timingSafeEqual(left, right);
}

// Normalizes student passwords to a consistent uppercase string so passwords
// are case-insensitive across all authentication touchpoints.
export function normalizeStudentPassword(password) {
    return String(password || '').trim().toUpperCase();
}

// Verifies a plaintext password against a stored students.password_hash value.
// Handles both bcrypt hashes (current) and the legacy fixed-pepper SHA-256
// hashes (accounts that haven't activated/reset since the migration).
// Supports case-insensitive comparison across all formats.
export async function verifyStudentPassword(password, storedHash) {
    if (!storedHash || !password) return false;

    const normalized = normalizeStudentPassword(password);
    const raw = String(password).trim();

    if (BCRYPT_HASH_PATTERN.test(storedHash)) {
        const matchNormalized = await bcrypt.compare(normalized, storedHash);
        if (matchNormalized) return true;
        if (raw !== normalized) {
            return bcrypt.compare(raw, storedHash);
        }
        return false;
    }

    // Legacy fixed-pepper SHA-256 hashes
    const pepper = getLegacyPasswordPepper();
    const variants = Array.from(new Set([raw, normalized, raw.toLowerCase()]));
    for (const v of variants) {
        const legacyHash = createHash('sha256').update(`${v}${pepper}`).digest('hex');
        if (safeCompareHex(legacyHash, storedHash)) {
            return true;
        }
    }
    return false;
}

// Hashes a NEW password (activation, reset, or bulk-seed). Always bcrypt of normalized uppercase password.
export function hashStudentPassword(password) {
    const normalized = normalizeStudentPassword(password);
    return bcrypt.hash(normalized, BCRYPT_SALT_ROUNDS);
}

