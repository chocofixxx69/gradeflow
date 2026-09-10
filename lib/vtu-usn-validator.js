/**
 * VTU USN (University Seat Number) Validation & Auto-Correction Utility
 * 
 * Standard VTU USN Anatomy (Strictly 10 Characters):
 * - Region: 1 digit (1-4)
 * - College: 2 uppercase letters (e.g., AB, MS, CR, NI, RV)
 * - Year: 2 digits (e.g., 20, 21, 22, 23, 24, 25)
 * - Branch: 2 uppercase letters (e.g., CS, IS, EC, EE, ME, CV, AI, CD)
 * - Roll / Serial No: 3 digits (e.g., 001 - 999, or 401+ for lateral entry)
 * 
 * Total = 1 + 2 + 2 + 2 + 3 = 10 characters.
 */

export const VTU_USN_REGEX = /^[1-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{3}$/;

/**
 * Strips whitespace, hyphens, dots, and normalizes casing.
 */
export function sanitizeUsn(raw) {
    if (!raw) return '';
    return String(raw)
        .toUpperCase()
        .replace(/[\s\-_.,/]/g, '')
        .trim();
}

/**
 * Heuristic to detect common user typos and propose a corrected USN.
 * Returns null if no plausible correction can be inferred.
 */
export function getUsnSuggestion(raw) {
    const clean = sanitizeUsn(raw);
    if (!clean) return null;

    // 1. Extra 4th digit in roll number (e.g., 2AB23CS0022 -> 11 chars)
    // Common when users enter 4 digits for roll no out of habit.
    const extraRollDigitMatch = clean.match(/^([1-9][A-Z]{2}[0-9]{2}[A-Z]{2})([0-9]{4})$/);
    if (extraRollDigitMatch) {
        const prefix = extraRollDigitMatch[1];
        const fourDigits = extraRollDigitMatch[2];
        // If it starts with 0 (e.g. 0022), strip the first 0 -> 022
        const suggestedRoll = fourDigits.startsWith('0') ? fourDigits.slice(1) : fourDigits.slice(0, 3);
        return `${prefix}${suggestedRoll}`;
    }

    // 2. 4-digit calendar year entered (e.g., 2AB2023CS043 -> 12 chars)
    const fourDigitYearMatch = clean.match(/^([1-9][A-Z]{2})20([0-9]{2})([A-Z]{2}[0-9]{3})$/);
    if (fourDigitYearMatch) {
        return `${fourDigitYearMatch[1]}${fourDigitYearMatch[2]}${fourDigitYearMatch[3]}`;
    }

    // 3. Letter 'O' or 'o' typed in numeric slots (e.g. 2AB23CSO43 or 2ABO3CS001)
    if (clean.length === 10) {
        let fixed = clean;
        const chars = clean.split('');
        // Slot 0 (region): must be digit
        if (chars[0] === 'O') chars[0] = '0';
        // Slots 3, 4 (year): must be digits
        if (chars[3] === 'O') chars[3] = '0';
        if (chars[4] === 'O') chars[4] = '0';
        // Slots 7, 8, 9 (roll): must be digits
        if (chars[7] === 'O') chars[7] = '0';
        if (chars[8] === 'O') chars[8] = '0';
        if (chars[9] === 'O') chars[9] = '0';
        fixed = chars.join('');
        if (fixed !== clean && VTU_USN_REGEX.test(fixed)) {
            return fixed;
        }
    }

    // 4. Pasted with extra junk at end (e.g. 2AB23CS043XYZ)
    if (clean.length > 10) {
        const first10 = clean.slice(0, 10);
        if (VTU_USN_REGEX.test(first10)) {
            return first10;
        }
    }

    return null;
}

/**
 * Deep diagnostic validator that inspects each individual segment of a USN.
 * Returns detailed diagnostics, human-friendly error messages, and suggestions.
 */
export function validateUsn(raw) {
    const sanitized = sanitizeUsn(raw);

    if (!sanitized) {
        return {
            isValid: false,
            sanitized: '',
            error: null,
            suggestion: null,
            segments: null,
            charCount: 0,
        };
    }

    const charCount = sanitized.length;
    const suggestion = getUsnSuggestion(sanitized);

    // Exact valid match
    if (VTU_USN_REGEX.test(sanitized)) {
        return {
            isValid: true,
            sanitized,
            error: null,
            suggestion: null,
            segments: {
                region: sanitized[0],
                college: sanitized.slice(1, 3),
                year: sanitized.slice(3, 5),
                branch: sanitized.slice(5, 7),
                roll: sanitized.slice(7, 10),
            },
            charCount: 10,
        };
    }

    // Detailed error analysis
    let error = 'Invalid USN format.';

    // Check for 11 chars with 4 digits at end (like 2ab23cs0022)
    if (charCount === 11 && /^[1-9][A-Z]{2}[0-9]{2}[A-Z]{2}[0-9]{4}$/.test(sanitized)) {
        error = `USN has 11 characters. VTU roll numbers are strictly 3 digits (entered '${sanitized.slice(7)}').`;
    } else if (charCount > 10) {
        error = `Too long (${charCount} characters). VTU USNs are strictly 10 characters.`;
    } else if (charCount < 10) {
        // Specific checks for incomplete or missing characters
        // Missing letter in college code (e.g. 2A23CS043 - 9 chars)
        if (/^[1-9][A-Z][0-9]{2}[A-Z]{2}[0-9]{3}$/.test(sanitized)) {
            error = `Missing letter in college code ('${sanitized.slice(0, 2)}' has 1 letter, expected 2 like 2AB, 1MS).`;
        }
        // Missing letter in branch code (e.g. 2AB23C043 - 9 chars)
        else if (/^[1-9][A-Z]{2}[0-9]{2}[A-Z][0-9]{3}$/.test(sanitized)) {
            error = `Missing letter in branch code ('${sanitized.slice(5, 6)}' has 1 letter, expected 2 like CS, EC).`;
        }
        // General incomplete
        else {
            error = `Incomplete USN (${charCount}/10 characters). Expected format: 2AB23CS043.`;
        }
    } else {
        // charCount === 10, but failed regex
        const region = sanitized[0];
        const college = sanitized.slice(1, 3);
        const year = sanitized.slice(3, 5);
        const branch = sanitized.slice(5, 7);
        const roll = sanitized.slice(7, 10);

        if (!/^[1-9]$/.test(region)) {
            error = `Invalid region code '${region}'. First character must be a non-zero digit (e.g. 1, 2, 4).`;
        } else if (!/^[A-Z]{2}$/.test(college)) {
            error = `Invalid college code '${college}'. Expected 2 letters (e.g. AB, MS, RV).`;
        } else if (!/^[0-9]{2}$/.test(year)) {
            error = `Invalid admission year '${year}'. Expected 2 digits (e.g. 21, 22, 23).`;
        } else if (!/^[A-Z]{2}$/.test(branch)) {
            error = `Invalid branch code '${branch}'. Expected 2 letters (e.g. CS, IS, EC).`;
        } else if (!/^[0-9]{3}$/.test(roll)) {
            error = `Invalid roll number '${roll}'. Expected 3 digits (e.g. 001, 043).`;
        }
    }

    return {
        isValid: false,
        sanitized,
        error,
        suggestion,
        segments: null,
        charCount,
    };
}
