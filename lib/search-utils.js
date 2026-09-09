/**
 * High-Accuracy Search & Relevance Matching Utilities for GradeFlow
 * 
 * Provides resilient, tokenized, typo-tolerant, and order-independent
 * searching across student records (USN, Name, Email, Phone, Section, Branch).
 */

export function cleanAlphanumeric(str) {
    return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeSearchText(str) {
    return (str || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Fast Levenshtein distance calculation for typo tolerance
 */
export function levenshteinDistance(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;

    const row = [];
    for (let i = 0; i <= b.length; i++) row[i] = i;

    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            let val;
            if (a.charAt(i - 1) === b.charAt(j - 1)) {
                val = row[j - 1];
            } else {
                val = Math.min(row[j - 1] + 1, prev + 1, row[j] + 1);
            }
            row[j - 1] = prev;
            prev = val;
        }
        row[b.length] = prev;
    }
    return row[b.length];
}

/**
 * Computes a relevance score (0 = no match, 1000 = exact match)
 * for a student against a search query.
 */
export function scoreStudentMatch(s, query) {
    if (!s) return 0;
    const rawQ = normalizeSearchText(query);
    if (!rawQ) return 1;

    const cleanQ = cleanAlphanumeric(rawQ);
    const tokens = rawQ.split(' ').filter(Boolean);

    const name = normalizeSearchText(s.name || s.student_name || s.fullName);
    const rawUsn = s.usn || s.student_usn || '';
    const usn = normalizeSearchText(rawUsn);
    const cleanUsn = cleanAlphanumeric(rawUsn);
    const email = normalizeSearchText(s.email);
    const phone = cleanAlphanumeric(s.phone);
    const branch = normalizeSearchText(s.branch || s.department || s.dept);
    const section = normalizeSearchText(s.section);
    const className = normalizeSearchText(s.className || s.class_name);

    // Detect if query is specifically targeting a USN (e.g. "2ab23cs043", "2ab 23 cs 043", "cs043")
    const isLikelyUsn = /^[0-9][a-z]{2}[0-9]{2}/i.test(cleanQ) || /^[0-9]{2}[a-z]{2}[0-9]{3}$/i.test(cleanQ);

    // 1. Exact USN match (highest priority)
    if (cleanUsn && cleanUsn === cleanQ) return 1000;

    // 2. Exact Name match
    if (name && name === rawQ) return 900;

    // 3. Clean USN match / prefix / roll number suffix
    if (cleanUsn) {
        if (cleanQ.length >= 3 && cleanUsn.startsWith(cleanQ)) return 850;
        if (cleanQ.length >= 3 && cleanUsn.includes(cleanQ)) return 800;
        // 2-3 digit roll number suffix match (e.g. searching "43" matches 2AB23CS043)
        if (/^\d{2,3}$/.test(cleanQ) && (cleanUsn.endsWith(cleanQ) || cleanUsn.endsWith(cleanQ.padStart(3, '0')))) return 800;
    }

    // If the query was clearly formatted as a full/structured USN, do not match non-matching USNs
    if (isLikelyUsn) {
        return 0;
    }

    // 4. Name prefix or exact phrase match
    if (name) {
        if (name.startsWith(rawQ)) return 750;
        if (name.includes(rawQ)) return 700;
    }

    // 5. Multi-token evaluation across all student attributes
    const nameWords = name ? name.split(' ').filter(Boolean) : [];
    const haystack = [name, usn, email, phone, branch, section, className].filter(Boolean).join(' ');

    let matchedTokensCount = 0;
    for (const token of tokens) {
        const cleanT = cleanAlphanumeric(token);
        let tokenMatched = false;

        // Substring match in concatenated fields
        if (haystack.includes(token)) {
            tokenMatched = true;
        } else if (cleanT.length >= 3 && cleanUsn.includes(cleanT)) {
            tokenMatched = true;
        } else if (token.length >= 4 && nameWords.length > 0) {
            // Typo-tolerant match against individual name words (Levenshtein <= 1)
            tokenMatched = nameWords.some(w => levenshteinDistance(w, token) <= 1);
        }

        if (tokenMatched) matchedTokensCount++;
    }

    // All tokens matched
    if (matchedTokensCount === tokens.length) {
        return 500 + tokens.length * 20;
    }

    // Majority token match for multi-word queries (>= 66% and at least 2 tokens)
    if (tokens.length >= 2 && (matchedTokensCount / tokens.length) >= 0.66) {
        return 300 + matchedTokensCount * 20;
    }

    // Single-word typo tolerance against name (Levenshtein <= 1 for >= 4 chars)
    if (tokens.length === 1 && rawQ.length >= 4 && nameWords.length > 0) {
        const hasFuzzyName = nameWords.some(w => levenshteinDistance(w, rawQ) <= 1);
        if (hasFuzzyName) return 250;
    }

    return 0;
}

/**
 * Checks if a student matches a search query
 */
export function matchesStudent(student, query) {
    return scoreStudentMatch(student, query) > 0;
}

/**
 * Filters a list of students by query and ranks them by relevance.
 * Prioritizes high-confidence exact/full-token matches over fuzzy fallbacks.
 */
export function filterAndRankStudents(students, query) {
    if (!students || !Array.isArray(students)) return [];
    const trimmed = (query || '').trim();
    if (!trimmed) return students;

    const scored = [];
    for (let i = 0; i < students.length; i++) {
        const s = students[i];
        const score = scoreStudentMatch(s, trimmed);
        if (score > 0) {
            scored.push({ student: s, score, originalIndex: i });
        }
    }

    if (scored.length === 0) return [];

    // Prioritize high-confidence matches (score >= 500) so exact matches are not polluted by partial matches
    const highConfidence = scored.filter(item => item.score >= 500);
    const candidateList = highConfidence.length > 0 ? highConfidence : scored;

    candidateList.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

    return candidateList.map(item => item.student);
}

/**
 * Computes a relevance score for any generic item (classes, faculty, tickets, subjects, audit logs)
 * across an array of field names or all string properties.
 */
export function scoreGenericMatch(item, query, fields = null) {
    if (!item) return 0;
    const rawQ = normalizeSearchText(query);
    if (!rawQ) return 1;

    const cleanQ = cleanAlphanumeric(rawQ);
    const tokens = rawQ.split(' ').filter(Boolean);

    // Extract searchable string values
    const fieldValues = [];
    if (fields && Array.isArray(fields)) {
        for (const f of fields) {
            const val = typeof f === 'function' ? f(item) : item[f];
            if (val !== undefined && val !== null) {
                if (typeof val === 'string' || typeof val === 'number') {
                    fieldValues.push(String(val));
                } else if (Array.isArray(val)) {
                    val.forEach(v => {
                        if (typeof v === 'string' || typeof v === 'number') fieldValues.push(String(v));
                        else if (typeof v === 'object' && v !== null) {
                            Object.values(v).forEach(subVal => {
                                if (typeof subVal === 'string' || typeof subVal === 'number') fieldValues.push(String(subVal));
                            });
                        }
                    });
                } else if (typeof val === 'object') {
                    Object.values(val).forEach(subVal => {
                        if (typeof subVal === 'string' || typeof subVal === 'number') fieldValues.push(String(subVal));
                    });
                }
            }
        }
    } else {
        Object.values(item).forEach(val => {
            if (typeof val === 'string' || typeof val === 'number') fieldValues.push(String(val));
        });
    }

    const normValues = fieldValues.map(v => normalizeSearchText(v));
    const cleanValues = fieldValues.map(v => cleanAlphanumeric(v));
    const combinedHaystack = normValues.join(' ');
    const combinedCleanHaystack = cleanValues.join(' ');

    // 1. Exact match in any single field
    if (normValues.some(v => v === rawQ) || cleanValues.some(v => v === cleanQ)) {
        return 1000;
    }

    // 2. Starts with query in any field
    if (normValues.some(v => v.startsWith(rawQ)) || (cleanQ.length >= 3 && cleanValues.some(v => v.startsWith(cleanQ)))) {
        return 900;
    }

    // 3. Exact full phrase substring in combined haystack
    if (combinedHaystack.includes(rawQ) || (cleanQ.length >= 3 && combinedCleanHaystack.includes(cleanQ))) {
        return 800;
    }

    // 4. Multi-token evaluation: do ALL tokens match somewhere in the item?
    const allWords = combinedHaystack.split(' ').filter(Boolean);
    let matchedCount = 0;
    for (const token of tokens) {
        const cleanT = cleanAlphanumeric(token);
        let matched = false;

        if (combinedHaystack.includes(token)) {
            matched = true;
        } else if (cleanT.length >= 3 && combinedCleanHaystack.includes(cleanT)) {
            matched = true;
        } else if (token.length >= 4 && allWords.length > 0) {
            matched = allWords.some(w => levenshteinDistance(w, token) <= 1);
        }

        if (matched) matchedCount++;
    }

    if (matchedCount === tokens.length) {
        return 500 + tokens.length * 20;
    }

    // Partial token match if multi-word (>= 66% and at least 2 tokens)
    if (tokens.length >= 2 && (matchedCount / tokens.length) >= 0.66) {
        return 300 + matchedCount * 20;
    }

    // Single token typo tolerance
    if (tokens.length === 1 && rawQ.length >= 4 && allWords.length > 0) {
        if (allWords.some(w => levenshteinDistance(w, rawQ) <= 1)) {
            return 250;
        }
    }

    return 0;
}

export function matchesGeneric(item, query, fields = null) {
    return scoreGenericMatch(item, query, fields) > 0;
}

export function filterAndRank(items, query, fields = null) {
    if (!items || !Array.isArray(items)) return [];
    const trimmed = (query || '').trim();
    if (!trimmed) return items;

    const scored = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const score = scoreGenericMatch(item, trimmed, fields);
        if (score > 0) {
            scored.push({ item, score, originalIndex: i });
        }
    }

    if (scored.length === 0) return [];

    const highConfidence = scored.filter(item => item.score >= 500);
    const candidateList = highConfidence.length > 0 ? highConfidence : scored;

    candidateList.sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);

    return candidateList.map(entry => entry.item);
}

