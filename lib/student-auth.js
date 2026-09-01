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

/**
 * Generates the institutional fixed/formula default password for a student:
 * First 2 letters of name (or 'ST' if missing) + last 3 characters of USN.
 * Example: rawahah + 2ab23cs063 -> RA063
 * Example: Mohammed Ainan + 2AB23CS043 -> MO043
 * Always returned in uppercase.
 */
export function generateFormulaPassword(name, usn) {
    const cleanUsn = String(usn || '').trim().toUpperCase();
    const cleanName = String(name || '').trim().replace(/[^a-zA-Z]/g, '').toUpperCase();

    let prefix = cleanName.slice(0, 2);
    if (prefix.length < 2) {
        const usnLetters = cleanUsn.replace(/[^A-Z]/g, '');
        prefix = (prefix + usnLetters).slice(0, 2);
    }
    if (prefix.length < 2) {
        prefix = (prefix + 'ST').slice(0, 2);
    }

    const suffix = cleanUsn.length >= 3 ? cleanUsn.slice(-3) : cleanUsn.padStart(3, '0');

    return `${prefix}${suffix}`.toUpperCase();
}

// Verifies a plaintext password against a stored students.password_hash value
// or checks against the student's dynamic formula password.
// Supports case-insensitive comparison across all formats.
export async function verifyStudentPassword(password, storedHash, studentName = null, studentUsn = null) {
    if (!password) return false;

    const normalized = normalizeStudentPassword(password);
    const raw = String(password).trim();

    // 1. Check against dynamic formula password if name/usn are available
    if (studentUsn) {
        const formulaPass = generateFormulaPassword(studentName, studentUsn);
        if (normalized === formulaPass) {
            return true;
        }
    }

    if (!storedHash) return false;

    // 2. Check bcrypt hash
    if (BCRYPT_HASH_PATTERN.test(storedHash)) {
        const matchNormalized = await bcrypt.compare(normalized, storedHash);
        if (matchNormalized) return true;
        if (raw !== normalized) {
            return bcrypt.compare(raw, storedHash);
        }
        return false;
    }

    // 3. Legacy fixed-pepper SHA-256 hashes
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
