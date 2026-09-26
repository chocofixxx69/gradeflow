// lib/subject-catalog-utils.js
// Clean, dependency-free VTU Subject Catalog lookup & synchronization utilities.
// Operates on the authoritative VTU_OFFICIAL_SUBJECT_DATA (Schemes 2022 and 2025)
// and authoritative special course resolutions.

import { VTU_OFFICIAL_SUBJECT_DATA } from './vtu-curriculum-catalog.js';

export function electiveFamilyKey(code) {
    const m = String(code || '').toUpperCase().match(/^(\d*B)[A-Z]{2,3}(\d{3})[A-Z]?$/);
    return m ? `${m[1]}XX${m[2]}X` : null;
}

// Authoritative mapping of VTU course codes to their FULL official course names.
// Used for exact resolutions where generic elective families might otherwise return placeholders (e.g., ': CS').
export const SPECIAL_COURSE_LOOKUP = {
    // 3rd Semester CS & Allied (Scheme 2022)
    'BCS301': 'Mathematics for Computer Science',
    'BMCS301': 'Mathematics for Computer Science',
    'BCS302': 'Digital Design and Computer Organization',
    'BCS303': 'Operating Systems',
    'BCS304': 'Data Structures and Applications',
    'BCSL305': 'Data Structures Laboratory',
    'BCS306A': 'Object Oriented Programming with Java',
    'BCS306B': 'Object Oriented Programming with C++',
    'BCSC307': 'Social Connect and Responsibility',
    'BSCK307': 'Social Connect and Responsibility',
    'BCS358A': 'Data Analytics with R',
    'BCS358B': 'Python Programming',
    'BCS358C': 'Project Management with Git',
    'BCS358D': 'Linux & Shell Scripting',
    'BPEK359': 'Physical Education',
    'BPRK359': 'Physical Education',
    'BNSK359': 'National Service Scheme (NSS)',
    'BYOK359': 'Yoga',

    // 3rd Semester CS & Allied (Scheme 2025)
    '1BCS301': 'Mathematics for Computer Science',
    '1BCS302': 'Object Oriented Programming with Java',
    '1BCS303': 'Digital Design and Computer Organization',
    '1BCS304': 'Operating Systems',
    '1BCS305': 'Data Structures and Applications',
    '1BCSL306': 'Data Structures Laboratory',
    '1BCSL307A': 'Project Management (with Git)',
    '1BCP308': 'Community Project / Societal Project',
    '1BNSS309': 'National Service Scheme (NSS)',
    '1BMATDIP310': 'Mathematics for Lateral Entry Students',
    '1BMATCS301': 'Probability, Distributions and Statistics',

    // 4th Semester CS
    'BCS401': 'Analysis & Design of Algorithms',
    'BCS402': 'Microcontrollers & Embedded Systems',
    'BCS403': 'Database Management Systems',
    'BCS404': 'Discrete Mathematical Structures',
    'BCSL405': 'Analysis & Design of Algorithms Lab',
    'BCS456A': 'Core Java',
    'BCS456B': 'Python Programming',
    'BCS456C': 'UI/UX Design',
    'BBOK407': 'Biology for Engineers',
    'BCSK408': 'Biology for Engineers',

    // 5th Semester CS
    'BCS501': 'Software Engineering and Project Management',
    'BCS502': 'Computer Networks',
    'BCS503': 'Theory of Computation',
    'BCS504': 'Cloud Computing',
    'BCSL505': 'Computer Networks Laboratory',

    // 6th Semester CS
    'BCS601': 'Cloud Computing',
    'BCS602': 'Machine Learning',
    'BCSL606': 'Machine Learning Laboratory',
    'BCS613B': 'Computer Vision',
    'BEE654B': 'Technologies of Renewable Energy Sources',

    // 7th Semester CS
    'BCS701': 'Internet of Things',
    'BCS702': 'Parallel Computing',
    'BCS703': 'Cryptography and Network Security',
    'BCS714D': 'Big Data Analytics',
    'BME755D': 'Non-Conventional Energy Sources',

    // 1st / 2nd Semester Common
    'BMATS101': 'Mathematics-I for Computer Science and Engineering',
    'BMATS201': 'Mathematics-II for Computer Science and Engineering',
    'BPHYS102': 'Applied Physics for CSE Stream',
    'BPOPS103': 'Principles of Programming Using C',
    'BESCK104B': 'Introduction to Electrical Engineering',
    'BETCK105H': 'Introduction to Internet of Things'
};

// Check if a resolved name is merely a generic catalog placeholder (e.g., ': CS', 'ESC/ETC/PLC')
export function isPlaceholderName(name) {
    if (!name) return true;
    const s = String(name).trim();
    if (s.length <= 2) return true;
    if (s.startsWith(':')) return true;
    const lower = s.toLowerCase();
    if (lower === 'esc/etc/plc' || lower === 'td/psb' || lower === 'td/psb: cs allied') return true;
    if (lower.startsWith('cie: by departments') || lower.startsWith('td -maths dept')) return true;
    return false;
}

// Global cached maps of the authoritative VTU curriculum catalog
let _globalCatalogCache = null;

export function getGlobalCatalogMaps() {
    if (_globalCatalogCache) return _globalCatalogCache;
    const byCode = new Map();
    const byFamily = new Map();
    const byName = new Map();

    // 1. Pre-seed with SPECIAL_COURSE_LOOKUP
    Object.entries(SPECIAL_COURSE_LOOKUP).forEach(([c, n]) => {
        const item = { code: c, name: n, credits: 3 };
        byCode.set(c, item);
        const fam = electiveFamilyKey(c);
        if (fam && !byFamily.has(fam)) {
            byFamily.set(fam, item);
        }
        byName.set(n.toLowerCase(), item);
    });

    // 2. Ingest schemes from official catalog without overwriting specials with placeholders
    const schemes = ['2025', '2022'];
    schemes.forEach(sc => {
        const branches = VTU_OFFICIAL_SUBJECT_DATA?.[sc] || {};
        Object.values(branches).forEach(sems => {
            Object.values(sems).forEach(subs => {
                (subs || []).forEach(s => {
                    const c = String(s.code || '').toUpperCase().trim();
                    const n = String(s.name || '').trim();
                    if (!c || !n || isPlaceholderName(n)) return;
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
 * 1. Definitive SPECIAL_COURSE_LOOKUP
 * 2. Direct match in local catalogSubjects (non-placeholder)
 * 3. Authoritative global VTU curriculum catalog
 * 4. Elective family match in local catalogSubjects (non-placeholder)
 * 5. Leading '1' variation (1BCS303 vs BCS303) in local catalogSubjects
 */
export function lookupSubjectInCatalog(rawCode, catalogSubjects = []) {
    const c = String(rawCode || '').toUpperCase().trim();
    if (!c) return null;

    // 1. Definitive SPECIAL_COURSE_LOOKUP first
    if (SPECIAL_COURSE_LOOKUP[c]) {
        return { code: c, name: SPECIAL_COURSE_LOOKUP[c] };
    }

    // 2. Direct match in local catalogSubjects (if name is valid and not a placeholder/short acronym)
    for (const s of (catalogSubjects || [])) {
        const sc = String(s.code || s.subject_code || '').toUpperCase().trim();
        const sn = String(s.name || s.subject_name || '').trim();
        if (sc === c && sn && !isPlaceholderName(sn) && !KNOWN_SHORT_NAMES.has(sn.toUpperCase()) && sn.length > 5) {
            return { code: sc, name: sn };
        }
    }

    // 3. Authoritative global VTU curriculum catalog direct code
    const globalCat = getGlobalCatalogMaps();
    if (globalCat.byCode.has(c)) {
        const entry = globalCat.byCode.get(c);
        if (entry && !isPlaceholderName(entry.name)) return entry;
    }

    // 4. Leading '1' variation in local catalogSubjects (e.g. 1BCS303 vs BCS303)
    const altCode = c.startsWith('1') ? c.slice(1) : ('1' + c);
    if (SPECIAL_COURSE_LOOKUP[altCode]) {
        return { code: c, name: SPECIAL_COURSE_LOOKUP[altCode] };
    }
    for (const s of (catalogSubjects || [])) {
        const sc = String(s.code || s.subject_code || '').toUpperCase().trim();
        const sn = String(s.name || s.subject_name || '').trim();
        if (sc === altCode && sn && !isPlaceholderName(sn) && !KNOWN_SHORT_NAMES.has(sn.toUpperCase()) && sn.length > 5) {
            return { code: sc, name: sn };
        }
    }
    if (globalCat.byCode.has(altCode)) {
        const entry = globalCat.byCode.get(altCode);
        if (entry && !isPlaceholderName(entry.name)) return entry;
    }

    // 5. Elective family match in local catalogSubjects (non-placeholder)
    const fam = electiveFamilyKey(c);
    if (fam) {
        for (const s of (catalogSubjects || [])) {
            const sc = String(s.code || s.subject_code || '').toUpperCase().trim();
            const sn = String(s.name || s.subject_name || '').trim();
            if (electiveFamilyKey(sc) === fam && sn && !isPlaceholderName(sn) && !KNOWN_SHORT_NAMES.has(sn.toUpperCase()) && sn.length > 5) {
                return { code: sc, name: sn };
            }
        }
        if (globalCat.byFamily.has(fam)) {
            const entry = globalCat.byFamily.get(fam);
            if (entry && !isPlaceholderName(entry.name)) return entry;
        }
    }

    return null;
}

/**
 * Reverse lookup: resolves a subject name against the catalog.
 */
export function lookupSubjectByName(rawName, catalogSubjects = []) {
    const n = String(rawName || '').trim().toLowerCase();
    if (!n) return null;

    // Check SPECIAL_COURSE_LOOKUP values
    for (const [code, fullName] of Object.entries(SPECIAL_COURSE_LOOKUP)) {
        if (fullName.toLowerCase() === n) {
            return { code, name: fullName };
        }
    }

    for (const s of (catalogSubjects || [])) {
        const sn = String(s.name || s.subject_name || '').trim().toLowerCase();
        if (sn === n) return { code: String(s.code || s.subject_code || '').toUpperCase().trim(), name: String(s.name || s.subject_name || '').trim() };
    }

    const globalCat = getGlobalCatalogMaps();
    return globalCat.byName.get(n) || null;
}

export const KNOWN_SHORT_NAMES = new Set([
    'PE', 'SCR', 'OOPJ', 'MCS', 'DSA', 'OS', 'DDCO', 'ADA', 'MC', 'DBMS',
    'UI/UX', 'CC', 'ML', 'CV', 'TRES', 'IOT', 'PC', 'CN', 'CNS', 'BDA',
    'NCS', 'MATHS', 'MATHS-I', 'PHYSICS', 'POP C', 'ELECTRICAL', 'DS',
    'SEPM', 'TOC', 'AJP', 'HPC', 'PSA-1', 'CS', 'PEC', 'OEC', 'AEC-V',
    'IKS', 'CP-1', 'PRJ-1', 'JAVA', 'OOP', 'NSS', 'YOGA', 'AIML', 'MES',
    'ESC', 'ETC', 'PLC'
]);

/**
 * Authoritative helper: returns the COMPLETE subject name.
 * Upgrades legacy abbreviations (DDCO, OS, DSA, PE, SCR, OOPJ, MCS, etc.)
 * to full official catalog names, while preserving valid manual faculty edits.
 */
export function resolveFullSubjectName(rawCode, rawName = '', catalogSubjects = []) {
    const trimmedName = String(rawName || '').trim();
    const isKnownShort = trimmedName && (
        KNOWN_SHORT_NAMES.has(trimmedName.toUpperCase()) ||
        trimmedName.length <= 5 ||
        trimmedName.toUpperCase() === rawCode?.trim()?.toUpperCase() ||
        isPlaceholderName(trimmedName)
    );

    // If we have a code, look up in catalog
    const fromCode = lookupSubjectInCatalog(rawCode, catalogSubjects);

    // If user provided a short abbreviation, placeholder, or empty name, upgrade it using catalog
    if (!trimmedName || isKnownShort) {
        if (fromCode?.name) return fromCode.name;
    }

    // If the name already looks full and descriptive (not an abbreviation or placeholder), preserve user's edit
    if (trimmedName && !isKnownShort) {
        return trimmedName;
    }

    // Fallback: catalog match, or rawName, or rawCode
    return fromCode?.name || trimmedName || String(rawCode || '').trim();
}
