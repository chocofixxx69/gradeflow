// lib/vtu-identity.js
//
// THE canonical identity layer for every student record in the system.
//
// One rule, applied everywhere: **the two digits after the college code in the USN
// are the batch, and the branch never affects that.** 2AB23CS043, 2AB23CD001,
// 2AB23CI017, 2AB23CV004, 2AB23EE002 and 2AB23EC011 are all 23 batch (2023). The
// same holds for 24 and 25. Batch and branch are two independent axes read from two
// independent segments of the same string, and nothing else in a student row is
// allowed to override the USN.
//
// Why this module exists — every fact below was measured against the live database:
//
//   * students.year merely mirrors the USN year (625 of 627 rows agree), so it is a
//     fallback for unparseable USNs, never an authority.
//   * students.lateral_entry is wrong for 34 of the 43 students whose USN serial is
//     >= 200 - only 9 carry the flag. Lateral entry is therefore INFERRED from the
//     USN serial and corroborated against the semesters the student actually has
//     records for, with the column treated as a weak hint.
//   * 2AB23CS900 and 2AB23CS901 carry 900-series serials but hold semester 1 and 2
//     records, so a bare "serial >= 200" test misclassifies them. The corroboration
//     step is what keeps them regular.
//   * students.branch_code holds canonical codes (AI, DS) while USNs carry intake
//     codes (CI, CD). Both are correct; they are different alphabets for the same
//     department and this module is the only place that translates between them.
//   * students.semester is a mutable "standing today" column that drifts - 12 rows
//     sit BEHIND a semester the student already has results for. Standing is
//     therefore derived, never read raw.
//
// Lateral entry is reported as an ATTRIBUTE of a student, never as a batch
// adjustment: 2AB25EE400 is a 25-batch student who happens to have entered
// laterally, and appears under 25 batch like every other 2AB25 USN.

/**
 * VTU USN grammar: <college><YY><BRANCH><SERIAL>
 *   2AB    23    CS    043
 *   ^col   ^yy   ^br   ^serial
 * College mnemonics run 2-4 characters with an optional leading digit; branch
 * mnemonics run 2-3 letters; the serial is 3-4 digits.
 */
const USN_RE = /^(\d?[A-Z]{2,4}?)(\d{2})([A-Z]{2,3})(\d{3,4})$/;

/** A serial at or above this marks an intake outside the regular first-year list. */
export const LATERAL_SERIAL_THRESHOLD = 200;

/**
 * 9xx serials are re-admissions and transfers, not lateral entrants: both students
 * carrying one in the live data (2AB23CS900, 2AB23CS901) hold full semester 1 and 2
 * histories. Excluding the band keeps them out of the lateral path even when no
 * semester evidence is available to corroborate with.
 */
export const READMISSION_SERIAL_FLOOR = 900;

/** Does this USN serial belong to the lateral-entry band? */
export function isLateralSerial(serial) {
    const n = Number(serial);
    return Number.isFinite(n) && n >= LATERAL_SERIAL_THRESHOLD && n < READMISSION_SERIAL_FLOOR;
}

/** Lateral entrants join in the second year, i.e. their first semester is 3. */
export const LATERAL_ENTRY_SEMESTER = 3;

/**
 * A lateral entrant is admitted one year AFTER the cohort they then study with.
 *
 * Measured against the live data: every lateral entrant carrying a 2AB24 USN holds
 * records for semesters 3-6 - exactly the semesters the 2023 batch sat in the same
 * years - while the regular 2AB24 intake holds semesters 1-4. The class rosters say
 * the same thing: "CSE - A 2023" (batch 2023) enrols 78 students with 2AB23 USNs
 * and 8 with 2AB24 USNs, and those 8 are the lateral entrants.
 *
 * So a student has TWO batch facts, and they are not interchangeable:
 *   admission batch - the year in their USN. Immutable, what `resolveBatch` returns.
 *   academic cohort - the batch they graduate with. admission - 1 when lateral.
 * Every "Batch" / "Graduation Batch" filter in the product means the COHORT.
 */
export const LATERAL_COHORT_OFFSET = 1;

/**
 * Canonical department registry. `usnCodes` are the mnemonics that appear inside a
 * USN, `aliases` the spellings that appear in free-text columns. Seeded from the
 * live `branches` table and overridable at runtime by `configureBranchRegistry`
 * so the database stays the source of truth while the app still works standalone.
 */
const DEFAULT_BRANCH_REGISTRY = [
    { code: 'CS', label: 'Computer Science & Engineering', usnCodes: ['CS'], aliases: ['CS', 'CSE', 'COMPUTER SCIENCE', 'COMPUTER SCIENCE & ENGINEERING'], sortOrder: 1 },
    { code: 'AI', label: 'AI & Machine Learning', usnCodes: ['CI', 'AI'], aliases: ['AI', 'AIML', 'CI', 'ARTIFICIAL INTELLIGENCE', 'AI & MACHINE LEARNING'], sortOrder: 2 },
    { code: 'DS', label: 'Computer Science & Engineering (Data Science)', usnCodes: ['CD', 'DS'], aliases: ['DS', 'CD', 'CSD', 'DATA SCIENCE', 'CSE(DS)', 'CSE (DS)'], sortOrder: 3 },
    { code: 'EC', label: 'Electronics & Communication Engineering', usnCodes: ['EC'], aliases: ['EC', 'ECE', 'ENC', 'ELECTRONICS & COMMUNICATION'], sortOrder: 4 },
    { code: 'EE', label: 'Electrical & Electronics Engineering', usnCodes: ['EE'], aliases: ['EE', 'EEE', 'ELECTRICAL & ELECTRONICS'], sortOrder: 5 },
    { code: 'ME', label: 'Mechanical Engineering', usnCodes: ['ME'], aliases: ['ME', 'MECH', 'MECHANICAL', 'MECHANICAL ENGINEERING'], sortOrder: 6 },
    { code: 'CV', label: 'Civil Engineering', usnCodes: ['CV'], aliases: ['CV', 'CIVIL', 'CIVIL ENGINEERING'], sortOrder: 7 },
    { code: 'RI', label: 'Robotics & Artificial Intelligence', usnCodes: ['RI'], aliases: ['RI', 'ROBOTICS', 'ROBOTICS & AI', 'ROBOTICS & ARTIFICIAL INTELLIGENCE'], sortOrder: 8 },
    { code: 'BA', label: 'Master of Business Administration', usnCodes: ['BA'], aliases: ['BA', 'MBA'], sortOrder: 9, isActive: false },
    { code: 'MC', label: 'Master of Computer Applications', usnCodes: ['MC'], aliases: ['MC', 'MCA'], sortOrder: 10, isActive: false }
];

let branchRegistry = normaliseRegistry(DEFAULT_BRANCH_REGISTRY);

function normaliseRegistry(rows) {
    const entries = (rows || [])
        .map(r => ({
            code: String(r.code || '').toUpperCase().trim(),
            label: r.label || r.name || String(r.code || '').toUpperCase().trim(),
            usnCodes: (r.usnCodes || r.usn_codes || [r.code]).filter(Boolean).map(c => String(c).toUpperCase().trim()),
            aliases: (r.aliases || []).filter(Boolean).map(a => String(a).toUpperCase().trim()),
            sortOrder: Number(r.sortOrder ?? r.sort_order ?? 99),
            isActive: r.isActive ?? r.is_active ?? true
        }))
        .filter(r => r.code);

    const byCode = new Map();
    const byUsnCode = new Map();
    const byAlias = new Map();

    entries.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const e of entries) {
        byCode.set(e.code, e);
        for (const u of e.usnCodes) if (!byUsnCode.has(u)) byUsnCode.set(u, e.code);
        for (const a of e.aliases) if (!byAlias.has(a)) byAlias.set(a, e.code);
        if (!byAlias.has(e.code)) byAlias.set(e.code, e.code);
        const upperLabel = String(e.label).toUpperCase();
        if (!byAlias.has(upperLabel)) byAlias.set(upperLabel, e.code);
    }

    return { entries, byCode, byUsnCode, byAlias };
}

/**
 * Replaces the in-memory registry with rows from the `branches` table. Rows are
 * merged over the defaults so a sparsely populated table can never remove a
 * department that students actually exist in.
 */
export function configureBranchRegistry(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return branchRegistry;
    const merged = new Map(DEFAULT_BRANCH_REGISTRY.map(r => [r.code, { ...r }]));
    for (const row of rows) {
        const code = String(row.code || '').toUpperCase().trim();
        if (!code) continue;
        const base = merged.get(code) || { code, usnCodes: [code], aliases: [code], sortOrder: 99 };
        merged.set(code, {
            ...base,
            label: row.label || base.label || code,
            usnCodes: [...new Set([...(base.usnCodes || []), ...((row.usn_codes || row.usnCodes || []).map(c => String(c).toUpperCase()))])],
            aliases: [...new Set([...(base.aliases || []), ...((row.aliases || []).map(a => String(a).toUpperCase()))])],
            sortOrder: Number(row.sort_order ?? row.sortOrder ?? base.sortOrder ?? 99),
            isActive: row.is_active ?? base.isActive ?? true
        });
    }
    branchRegistry = normaliseRegistry([...merged.values()]);
    return branchRegistry;
}

export function getBranchRegistry() {
    return branchRegistry;
}

/** Every department that can hold students, in institutional order. */
export function listBranches({ includeInactive = false } = {}) {
    return branchRegistry.entries
        .filter(e => includeInactive || e.isActive !== false)
        .map(e => ({ code: e.code, label: e.label, usnCodes: e.usnCodes }));
}

export function branchLabelFor(code) {
    const c = String(code || '').toUpperCase().trim();
    return branchRegistry.byCode.get(c)?.label || (c ? `${c} - Department` : 'Unknown Department');
}

/**
 * Resolves any department spelling - a USN mnemonic, a canonical code, an alias, or
 * a full free-text label - to its canonical code. Multi-word aliases are matched
 * before bare tokens so "ROBOTICS & ARTIFICIAL INTELLIGENCE" resolves to RI rather
 * than being caught by the trailing "AI", and matching is whole-token so the "CI"
 * inside "SCIENCE" can never pull a Computer Science student into AI & ML.
 */
export function canonicalBranch(input) {
    const raw = String(input ?? '').toUpperCase().trim();
    if (!raw) return null;

    if (branchRegistry.byCode.has(raw)) return raw;
    if (branchRegistry.byUsnCode.has(raw)) return branchRegistry.byUsnCode.get(raw);
    if (branchRegistry.byAlias.has(raw)) return branchRegistry.byAlias.get(raw);

    const cleaned = raw.replace(/[^A-Z0-9&\s]/g, ' ').replace(/\s+/g, ' ').trim();
    if (branchRegistry.byAlias.has(cleaned)) return branchRegistry.byAlias.get(cleaned);

    const phrases = [];
    for (const e of branchRegistry.entries) {
        for (const a of e.aliases) if (a.includes(' ')) phrases.push([e.code, a]);
    }
    phrases.sort((a, b) => b[1].length - a[1].length);
    for (const [code, alias] of phrases) {
        if (cleaned.includes(alias)) return code;
    }

    const tokens = cleaned.split(' ').filter(Boolean);
    for (const e of branchRegistry.entries) {
        if (e.aliases.some(a => !a.includes(' ') && tokens.includes(a))) return e.code;
    }
    return null;
}

/**
 * Splits a USN into its four meaningful segments. Returns `{ valid: false }` rather
 * than throwing or guessing, so a malformed USN surfaces in validation instead of
 * silently landing in an arbitrary batch.
 */
export function parseUSN(usn) {
    const raw = String(usn ?? '').trim();
    const normalized = raw.toUpperCase().replace(/\s+/g, '');
    const m = normalized.match(USN_RE);
    if (!m) {
        return { valid: false, raw, normalized, college: null, batchTwoDigit: null, batchYear: null, usnBranch: null, branchCode: null, serial: null, highSerial: false };
    }
    const [, college, yy, usnBranch, serialStr] = m;
    const serial = parseInt(serialStr, 10);
    return {
        valid: true,
        raw,
        normalized,
        college,
        batchTwoDigit: yy,
        batchYear: `20${yy}`,
        usnBranch,
        branchCode: canonicalBranch(usnBranch),
        serial,
        highSerial: isLateralSerial(serial),
        readmissionSerial: serial >= READMISSION_SERIAL_FLOOR
    };
}

/**
 * The batch a student belongs to. The USN's year digits win outright - the whole
 * point of the rule - and `students.year` is consulted only when the USN cannot be
 * parsed at all. `source` records which path was taken so validation can flag rows
 * whose stored year disagrees with their own USN.
 */
export function resolveBatch(studentOrUsn, fallbackYear = null) {
    const isObject = studentOrUsn && typeof studentOrUsn === 'object';
    const usn = isObject ? studentOrUsn.usn : studentOrUsn;
    const declaredYear = isObject
        ? (studentOrUsn.year ?? studentOrUsn.batch ?? studentOrUsn.academic_batch ?? fallbackYear)
        : fallbackYear;

    const parsed = parseUSN(usn);
    if (parsed.valid) {
        return {
            year: parsed.batchYear,
            twoDigit: parsed.batchTwoDigit,
            label: `${parsed.batchTwoDigit} Batch (${parsed.batchYear})`,
            source: 'usn',
            declaredYear: declaredYear != null ? String(declaredYear) : null,
            agreesWithColumn: declaredYear == null || String(declaredYear) === parsed.batchYear
        };
    }

    const digits = String(declaredYear ?? '').replace(/[^0-9]/g, '');
    if (digits.length >= 2) {
        const twoDigit = digits.slice(-2);
        return {
            year: `20${twoDigit}`,
            twoDigit,
            label: `${twoDigit} Batch (20${twoDigit})`,
            source: 'year_column',
            declaredYear: String(declaredYear),
            agreesWithColumn: true
        };
    }

    return { year: null, twoDigit: null, label: 'Unknown Batch', source: 'unknown', declaredYear: null, agreesWithColumn: false };
}

/**
 * Canonical department for a student row. The USN is authoritative because it is
 * assigned by the university and immutable; `branch_code` and the free-text
 * `branch` label are progressively weaker fallbacks for rows with a broken USN.
 */
export function resolveBranch(student) {
    const parsed = parseUSN(student?.usn);
    if (parsed.valid && parsed.branchCode) {
        return { code: parsed.branchCode, label: branchLabelFor(parsed.branchCode), source: 'usn', usnBranch: parsed.usnBranch };
    }
    const fromColumn = canonicalBranch(student?.branch_code);
    if (fromColumn) return { code: fromColumn, label: branchLabelFor(fromColumn), source: 'branch_code', usnBranch: parsed.usnBranch };
    const fromText = canonicalBranch(student?.branch);
    if (fromText) return { code: fromText, label: branchLabelFor(fromText), source: 'branch_text', usnBranch: parsed.usnBranch };
    return { code: null, label: 'Unknown Department', source: 'unresolved', usnBranch: parsed.usnBranch };
}

/**
 * Whether a student entered laterally, and how confident that is.
 *
 * A high serial alone is not proof - 2AB23CS900 holds semester 1 and 2 records and
 * is a regular student with an out-of-band serial. The semesters a student actually
 * has records for are the corroborating evidence: a lateral entrant's academic
 * history starts at semester 3 because semesters 1 and 2 never happened for them.
 *
 * Lateral entry NEVER moves a student's batch. It is reported here purely as an
 * attribute of the student.
 */
export function resolveLateralEntry(student, recordedSemesters = []) {
    const parsed = parseUSN(student?.usn);
    const flag = student?.lateral_entry === true || student?.lateral_entry === 'true' || student?.lateral_entry === 1;
    const sems = [...new Set((recordedSemesters || []).map(Number).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
    const lowest = sems.length ? sems[0] : null;
    const hasFirstYear = sems.some(s => s < LATERAL_ENTRY_SEMESTER);
    const reasons = [];

    if (parsed.highSerial) reasons.push(`USN serial ${parsed.serial} is in the lateral band (${LATERAL_SERIAL_THRESHOLD}-${READMISSION_SERIAL_FLOOR - 1})`);
    if (parsed.readmissionSerial) reasons.push(`USN serial ${parsed.serial} is a re-admission/transfer serial, not a lateral one`);
    if (flag) reasons.push('lateral_entry column is set');
    if (lowest !== null) reasons.push(`earliest semester on record is ${lowest}`);

    // Records that start at semester 3 or later confirm it outright.
    if (parsed.highSerial && lowest !== null && lowest >= LATERAL_ENTRY_SEMESTER) {
        return { isLateral: true, confidence: 'confirmed', flagAgrees: flag, reasons };
    }
    // First-year records disprove it no matter what the serial or the column say.
    if (hasFirstYear) {
        return { isLateral: false, confidence: 'confirmed', flagAgrees: !flag, reasons };
    }
    if (parsed.highSerial) {
        return { isLateral: true, confidence: sems.length ? 'inferred' : 'serial-only', flagAgrees: flag, reasons };
    }
    if (flag) {
        return { isLateral: true, confidence: 'flag-only', flagAgrees: true, reasons };
    }
    return { isLateral: false, confidence: sems.length ? 'confirmed' : 'assumed', flagAgrees: !flag, reasons };
}

/**
 * The batch a student GRADUATES with - the cohort they sit exams alongside.
 *
 * For a regular student this is their admission batch. For a lateral entrant it is
 * one year earlier, because they join directly into semester 3 (see
 * LATERAL_COHORT_OFFSET). This is the value every "Batch" / "Graduation Batch"
 * filter in the product must compare against; `resolveBatch` stays the immutable
 * admission fact and is what provenance and USN validation read.
 *
 * @param {object|string} studentOrUsn - student row or a bare USN
 * @param {object} [options]
 * @param {boolean|null} [options.lateral] - skip inference and use this verdict
 * @param {number[]} [options.recordedSemesters] - semesters the student has marks
 *   for; supplying them upgrades lateral detection from serial-only to confirmed
 * @param {string|number|null} [options.fallbackYear] - students.year, for USNs that
 *   cannot be parsed
 */
export function resolveCohort(studentOrUsn, options = {}) {
    const isObject = studentOrUsn && typeof studentOrUsn === 'object';
    const student = isObject ? studentOrUsn : { usn: studentOrUsn };

    // Already-resolved identity objects carry their own cohort - never redo the work.
    if (isObject && student.cohort && student.cohort.twoDigit !== undefined) return student.cohort;
    if (isObject && student.identity?.cohort && student.identity.cohort.twoDigit !== undefined) return student.identity.cohort;

    const admission = resolveBatch(student, options.fallbackYear ?? null);

    const lateral = (options.lateral === true || options.lateral === false)
        ? { isLateral: options.lateral, confidence: 'supplied' }
        : resolveLateralEntry(student, options.recordedSemesters || []);

    const base = {
        admissionYear: admission.year,
        admissionTwoDigit: admission.twoDigit,
        admissionLabel: admission.label,
        isLateral: lateral.isLateral,
        lateralConfidence: lateral.confidence,
        source: admission.source
    };

    if (!admission.year) {
        return { ...base, year: null, twoDigit: null, label: 'Unknown Batch', offsetApplied: false };
    }

    if (!lateral.isLateral) {
        return { ...base, year: admission.year, twoDigit: admission.twoDigit, label: admission.label, offsetApplied: false };
    }

    const year = String(Number(admission.year) - LATERAL_COHORT_OFFSET);
    const twoDigit = year.slice(-2);
    return { ...base, year, twoDigit, label: `${twoDigit} Batch (${year})`, offsetApplied: true };
}

/**
 * A student's semester standing, derived rather than read.
 *
 * `recorded` is where the evidence ends, `declared` is what students.semester
 * claims, and `current` is the defensible answer: never behind the evidence. A
 * student who has just finished semester 6 is normally sitting in 7, so declared
 * == max(recorded) + 1 is the healthy case, not a discrepancy.
 */
export function resolveStanding(student, recordedSemesters = []) {
    const sems = [...new Set((recordedSemesters || []).map(Number).filter(n => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);
    const declared = Number(student?.semester) || null;
    const maxRecorded = sems.length ? sems[sems.length - 1] : null;
    const current = Math.max(declared || 0, maxRecorded || 0) || null;

    let drift = 'ok';
    if (declared && maxRecorded) {
        if (declared < maxRecorded) drift = 'behind';
        else if (declared > maxRecorded + 1) drift = 'ahead';
    } else if (!declared) {
        drift = 'missing';
    }

    // Holes in the middle of the sequence mean an un-scraped semester, not a gap year.
    const missing = [];
    if (sems.length) {
        for (let s = sems[0]; s < sems[sems.length - 1]; s++) if (!sems.includes(s)) missing.push(s);
    }

    return { declared, recorded: sems, maxRecorded, current, drift, missingSemesters: missing };
}

/**
 * Organises an entire student list into the batch structure the whole app reads
 * from: every batch that exists, in descending order, each with its department
 * breakdown, lateral count and semester spread. Nothing here is hardcoded - a batch
 * appears because students exist in it, and disappears when they do not.
 */
export function buildBatchRegistry(students = [], { semestersByUsn = new Map() } = {}) {
    const batches = new Map();

    for (const s of students) {
        const batch = resolveBatch(s);
        if (!batch.year) continue;
        const branch = resolveBranch(s);
        const sems = semestersByUsn.get?.(s.usn) ?? semestersByUsn[s.usn] ?? [];
        const semList = Array.isArray(sems) ? sems : [...(sems || [])];
        const lateral = resolveLateralEntry(s, semList);

        const entry = batches.get(batch.year) || {
            year: batch.year,
            twoDigit: batch.twoDigit,
            label: batch.label,
            total: 0,
            lateral: 0,
            branches: new Map(),
            semesters: new Map()
        };

        entry.total += 1;
        if (lateral.isLateral) entry.lateral += 1;

        const bCode = branch.code || 'UNKNOWN';
        const b = entry.branches.get(bCode) || { code: bCode, label: branch.label, total: 0, lateral: 0 };
        b.total += 1;
        if (lateral.isLateral) b.lateral += 1;
        entry.branches.set(bCode, b);

        for (const sem of new Set(semList.map(Number).filter(Boolean))) {
            entry.semesters.set(sem, (entry.semesters.get(sem) || 0) + 1);
        }

        batches.set(batch.year, entry);
    }

    return [...batches.values()]
        .sort((a, b) => Number(b.year) - Number(a.year))
        .map(e => ({
            year: e.year,
            twoDigit: e.twoDigit,
            label: e.label,
            total: e.total,
            lateral: e.lateral,
            branches: [...e.branches.values()].sort((a, b) => b.total - a.total),
            semesters: [...e.semesters.entries()].sort((a, b) => a[0] - b[0]).map(([semester, count]) => ({ semester, count }))
        }));
}

/**
 * Does a student fall in the requested batch? Accepts "23", "2023" and
 * "23 Batch (2023)" so a filter value from any surface resolves the same way.
 */
export function matchesBatchYear(student, batchFilter, options = {}) {
    if (batchFilter === null || batchFilter === undefined) return true;
    const raw = String(batchFilter).trim();
    if (!raw || raw.toLowerCase() === 'all') return true;
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) return true;
    const twoDigit = digits.slice(-2);
    // The COHORT, not the admission batch: a lateral entrant with a 2AB24 USN sits
    // semester 6 with the 2023 batch and must appear under Batch 2023.
    return resolveCohort(student, options).twoDigit === twoDigit;
}

/** Does a student belong to the requested department? */
export function matchesBranchCode(student, branchFilter) {
    if (!branchFilter) return true;
    const raw = String(branchFilter).trim().toUpperCase();
    if (!raw || raw === 'ALL') return true;
    const target = canonicalBranch(raw);
    if (!target) return false;
    return resolveBranch(student).code === target;
}

/**
 * One normalised identity object per student — what every route should build once
 * and pass around, instead of re-deriving batch/branch/standing per call site.
 */
export function buildStudentIdentity(student, recordedSemesters = []) {
    const parsed = parseUSN(student?.usn);
    const batch = resolveBatch(student);
    const branch = resolveBranch(student);
    const lateral = resolveLateralEntry(student, recordedSemesters);
    const standing = resolveStanding(student, recordedSemesters);
    // Corroborated against the semesters actually on record, so this is the
    // highest-confidence cohort the system can produce for this student.
    const cohort = resolveCohort(student, { lateral: lateral.isLateral, recordedSemesters });

    return {
        usn: parsed.normalized || String(student?.usn || ''),
        name: student?.name || parsed.normalized || '',
        usnValid: parsed.valid,
        college: parsed.college,
        serial: parsed.serial,
        batch,
        cohort,
        branch,
        lateral,
        standing,
        isInactive: Boolean(student?.is_suspended),
        scheme: student?.scheme ? String(student.scheme) : null
    };
}

/**
 * Authoritative default institutional email generator for VTU students.
 * Pattern: <usn_lower>@anjuman.edu.in
 * e.g. '2AB23CS043' -> '2ab23cs043@anjuman.edu.in'
 */
export function getStudentDefaultEmail(usn) {
    if (!usn || typeof usn !== 'string') return '';
    const clean = usn.trim().toLowerCase();
    if (!clean) return '';
    if (clean.includes('@')) {
        return clean.endsWith('@anjuman.edu.in') ? clean : `${clean.split('@')[0]}@anjuman.edu.in`;
    }
    return `${clean}@anjuman.edu.in`;
}
