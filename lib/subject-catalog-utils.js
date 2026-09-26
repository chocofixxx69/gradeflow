// lib/subject-catalog-utils.js
// Clean, dependency-free VTU Subject Catalog lookup & synchronization utilities.
// Operates on the authoritative VTU_OFFICIAL_SUBJECT_DATA (Schemes 2022 and 2025).

import { VTU_OFFICIAL_SUBJECT_DATA } from './vtu-curriculum-catalog.js';

export function electiveFamilyKey(code) {
    const m = String(code || '').toUpperCase().match(/^(\d*B)[A-Z]{2,3}(\d{3})[A-Z]?$/);
    return m ? `${m[1]}XX${m[2]}X` : null;
}

// Global cached maps of the authoritative VTU curriculum catalog
let _globalCatalogCache = null;

export function getGlobalCatalogMaps() {
    if (_globalCatalogCache) return _globalCatalogCache;
    const byCode = new Map();
    const byFamily = new Map();
    const byName = new Map();

    const schemes = ['2025', '2022'];
    schemes.forEach(sc => {
        const branches = VTU_OFFICIAL_SUBJECT_DATA?.[sc] || {};
        Object.values(branches).forEach(sems => {
            Object.values(sems).forEach(subs => {
                (subs || []).forEach(s => {
                    const c = String(s.code || '').toUpperCase().trim();
                    const n = String(s.name || '').trim();
                    if (!c || !n) return;
                    if (!byCode.has(c)) {
                        byCode.set(c, { code: c, name: n, credits: s.credits });
                    }
                    const fam = electiveFamilyKey(c);
                    if (fam && !byFamily.has(fam)) {
                        byFamily.set(fam, { code: c, name: n, credits: s.credits });
                    }
                    const cleanName = n.toLowerCase();
                    if (!byName.has(cleanName)) {
                        byName.set(cleanName, { code: c, name: n, credits: s.credits });
                    }
                });
            });
        });
    });

    _globalCatalogCache = { byCode, byFamily, byName };
    return _globalCatalogCache;
}

/**
 * Resolves a subject code against the catalog, matching:
 * 1. Direct match in local catalogSubjects
 * 2. Elective family match in local catalogSubjects
 * 3. Leading '1' variation (1BCS303 vs BCS303) in local catalogSubjects
 * 4. Authoritative global VTU curriculum catalog
 */
export function lookupSubjectInCatalog(rawCode, catalogSubjects = []) {
    const c = String(rawCode || '').toUpperCase().trim();
    if (!c) return null;

    // 1. Direct match in local catalogSubjects
    for (const s of (catalogSubjects || [])) {
        const sc = String(s.code || s.subject_code || '').toUpperCase().trim();
        const sn = String(s.name || s.subject_name || '').trim();
        if (sc === c && sn) return { code: sc, name: sn };
    }

    // 2. Elective family match in local catalogSubjects
    const fam = electiveFamilyKey(c);
    if (fam) {
        for (const s of (catalogSubjects || [])) {
            const sc = String(s.code || s.subject_code || '').toUpperCase().trim();
            const sn = String(s.name || s.subject_name || '').trim();
            if (electiveFamilyKey(sc) === fam && sn) return { code: sc, name: sn };
        }
    }

    // 3. Leading '1' variation in local catalogSubjects (e.g. 1BCS303 vs BCS303)
    const altCode = c.startsWith('1') ? c.slice(1) : ('1' + c);
    for (const s of (catalogSubjects || [])) {
        const sc = String(s.code || s.subject_code || '').toUpperCase().trim();
        const sn = String(s.name || s.subject_name || '').trim();
        if (sc === altCode && sn) return { code: sc, name: sn };
    }

    // 4. Authoritative global VTU curriculum catalog
    const globalCat = getGlobalCatalogMaps();
    if (globalCat.byCode.has(c)) return globalCat.byCode.get(c);
    if (fam && globalCat.byFamily.has(fam)) return globalCat.byFamily.get(fam);
    if (globalCat.byCode.has(altCode)) return globalCat.byCode.get(altCode);

    return null;
}

/**
 * Reverse lookup: resolves a subject name against the catalog.
 */
export function lookupSubjectByName(rawName, catalogSubjects = []) {
    const n = String(rawName || '').trim().toLowerCase();
    if (!n) return null;

    for (const s of (catalogSubjects || [])) {
        const sn = String(s.name || s.subject_name || '').trim().toLowerCase();
        if (sn === n) return { code: String(s.code || s.subject_code || '').toUpperCase().trim(), name: String(s.name || s.subject_name || '').trim() };
    }

    const globalCat = getGlobalCatalogMaps();
    return globalCat.byName.get(n) || null;
}

export const KNOWN_SHORT_NAMES = new Set([
    'CC', 'ML', 'CV', 'TRES', 'IOT', 'PC', 'CN', 'BDA', 'NCS',
    'ADA', 'MC', 'DBMS', 'UI/UX', 'MATHS', 'DDCO', 'OS', 'DSA',
    'MATHS-I', 'PHYSICS', 'POP C', 'ELECTRICAL', 'DS', 'SEPM', 'TOC',
    'AJP', 'HPC', 'PSA-1', 'CS', 'PEC', 'OEC', 'AEC-V', 'PE', 'IKS',
    'CP-1', 'IOT LAB', 'ML LAB', 'PRJ-1'
]);

/**
 * Authoritative helper: returns the COMPLETE subject name.
 * Upgrades legacy abbreviations (DDCO, OS, DSA, etc.) to full official catalog names,
 * while preserving manual user-edited names.
 */
export function resolveFullSubjectName(rawCode, rawName = '', catalogSubjects = []) {
    const trimmedName = String(rawName || '').trim();
    const isKnownShort = trimmedName && (
        KNOWN_SHORT_NAMES.has(trimmedName.toUpperCase()) ||
        trimmedName.length <= 5 ||
        trimmedName.toUpperCase() === rawCode?.trim()?.toUpperCase()
    );

    // If we have a code, look up in catalog
    const fromCode = lookupSubjectInCatalog(rawCode, catalogSubjects);

    // If user provided a short abbreviation or empty name, upgrade it using catalog
    if (!trimmedName || isKnownShort) {
        if (fromCode?.name) return fromCode.name;
    }

    // If the name already looks full and descriptive (not an abbreviation), preserve user's edit
    if (trimmedName && !isKnownShort) {
        return trimmedName;
    }

    // Fallback: catalog match, or rawName, or rawCode
    return fromCode?.name || trimmedName || String(rawCode || '').trim();
}
