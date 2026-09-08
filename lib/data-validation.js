// lib/data-validation.js
//
// The institutional data-integrity engine. Runs every invariant the rest of the app
// silently assumes, against the live tables, and reports what is actually true.
//
// Each check returns a stable `code`, a severity, a count, and real affected records
// - never a bare boolean - so the Data Health page can show which students, marks or
// semesters are involved and someone can act on it. Checks are pure functions over
// already-fetched rows: nothing here queries, so the same engine runs in a route, a
// script, or a test.
//
// Severity means:
//   critical - numbers shown to users are wrong right now
//   warning  - a real defect that degrades a feature but does not corrupt figures
//   info     - a completeness gap worth knowing about, not necessarily a fault

import {
    parseUSN,
    resolveBatch,
    resolveBranch,
    resolveLateralEntry,
    resolveStanding,
    canonicalBranch
} from './vtu-identity.js';
import { resolveAttempts, classifyExam, EXAM_KINDS } from './vtu-results.js';
import { resolveSubjectCredit } from './subjectCreditResolver.js';
import { isAuditCourse } from './vtuAcademicEngine.js';

export const SEVERITY = { CRITICAL: 'critical', WARNING: 'warning', INFO: 'info' };

export const CATEGORIES = {
    IDENTITY: 'Identity & Batch',
    INTEGRITY: 'Referential Integrity',
    ACADEMIC: 'Academic Records',
    CURRICULUM: 'Curriculum & Credits',
    COMPLETENESS: 'Coverage & Completeness'
};

const MAX_SAMPLES = 40;

function issue({ code, severity, category, title, detail, impact, remedy, count, total, samples = [], unit = 'records' }) {
    return {
        code,
        severity,
        category,
        title,
        detail,
        impact: impact || null,
        remedy: remedy || null,
        count,
        total: total ?? null,
        percent: total ? Number(((count / total) * 100).toFixed(1)) : null,
        unit,
        samples: samples.slice(0, MAX_SAMPLES),
        sampleTruncated: samples.length > MAX_SAMPLES
    };
}

/**
 * Runs the full battery. `catalogIndex` is optional — without it the credit checks
 * are skipped rather than guessed at, and the report says so.
 */
export function validateDataset({
    students = [],
    marks = [],
    results = [],
    remarks = [],
    classes = [],
    classStudents = [],
    catalog = [],
    examSessions = [],
    catalogIndex = null
} = {}) {
    const issues = [];

    // ── Shared indexes ────────────────────────────────────────────────────────
    const studentByUsn = new Map(students.map(s => [String(s.usn || '').toUpperCase().trim(), s]));
    const usnSet = new Set(studentByUsn.keys());
    const up = v => String(v || '').toUpperCase().trim();

    const marksByUsn = new Map();
    const semestersByUsn = new Map();
    for (const m of marks) {
        const u = up(m.usn);
        if (!marksByUsn.has(u)) marksByUsn.set(u, []);
        marksByUsn.get(u).push(m);
        if (!semestersByUsn.has(u)) semestersByUsn.set(u, new Set());
        semestersByUsn.get(u).add(Number(m.semester));
    }

    const resultGroups = new Map(); // `usn|sem` -> rows
    for (const r of results) {
        const k = `${up(r.usn)}|${Number(r.semester)}`;
        if (!resultGroups.has(k)) resultGroups.set(k, []);
        resultGroups.get(k).push(r);
    }
    const remarkByKey = new Map(remarks.map(r => [`${up(r.student_usn)}|${Number(r.semester)}`, r]));
    const marksKeys = new Set(marks.map(m => `${up(m.usn)}|${Number(m.semester)}`));

    // ══════════════════ IDENTITY & BATCH ══════════════════

    const unparseable = students.filter(s => !parseUSN(s.usn).valid);
    if (unparseable.length) {
        issues.push(issue({
            code: 'USN_UNPARSEABLE', severity: SEVERITY.CRITICAL, category: CATEGORIES.IDENTITY,
            title: 'USNs that do not match the VTU format',
            detail: 'These USNs cannot be split into college / year / branch / serial, so their batch and department fall back to free-text columns.',
            impact: 'Excluded from every batch and department filter in the app.',
            remedy: 'Correct the USN on the student record.',
            count: unparseable.length, total: students.length, unit: 'students',
            samples: unparseable.map(s => ({ usn: s.usn, name: s.name, branch: s.branch, year: s.year }))
        }));
    }

    const yearMismatch = students.filter(s => {
        const b = resolveBatch(s);
        return b.source === 'usn' && !b.agreesWithColumn;
    });
    if (yearMismatch.length) {
        issues.push(issue({
            code: 'BATCH_YEAR_COLUMN_MISMATCH', severity: SEVERITY.WARNING, category: CATEGORIES.IDENTITY,
            title: 'students.year disagrees with the USN batch year',
            detail: 'The USN is authoritative, so these students are filed under their USN year. The stored year column is stale or was edited by hand.',
            impact: 'None to filtering — the USN wins — but the column misleads anyone reading the row directly.',
            remedy: 'Align students.year with the USN, or confirm the override is deliberate.',
            count: yearMismatch.length, total: students.length, unit: 'students',
            samples: yearMismatch.map(s => ({ usn: s.usn, name: s.name, storedYear: s.year, usnBatch: resolveBatch(s).year }))
        }));
    }

    const lateralMismatch = [];
    for (const s of students) {
        const sems = [...(semestersByUsn.get(up(s.usn)) || [])];
        const lat = resolveLateralEntry(s, sems);
        const flag = s.lateral_entry === true;
        if (lat.isLateral !== flag) {
            lateralMismatch.push({
                usn: s.usn, name: s.name, storedFlag: flag, resolved: lat.isLateral,
                confidence: lat.confidence, earliestSemester: sems.length ? Math.min(...sems) : null,
                serial: parseUSN(s.usn).serial
            });
        }
    }
    if (lateralMismatch.length) {
        issues.push(issue({
            code: 'LATERAL_FLAG_MISMATCH', severity: SEVERITY.WARNING, category: CATEGORIES.IDENTITY,
            title: 'lateral_entry column disagrees with the evidence',
            detail: 'Lateral entry is resolved from the USN serial and corroborated by the earliest semester on record. The stored flag does not match that for these students.',
            impact: 'Lateral badges and first-year expectations are wrong wherever the raw column is read.',
            remedy: 'Backfill students.lateral_entry from the resolved value.',
            count: lateralMismatch.length, total: students.length, unit: 'students',
            samples: lateralMismatch
        }));
    }

    const branchDisagreement = students.filter(s => {
        const parsed = parseUSN(s.usn);
        if (!parsed.valid || !s.branch_code) return false;
        const fromColumn = canonicalBranch(s.branch_code);
        return fromColumn && parsed.branchCode && fromColumn !== parsed.branchCode;
    });
    if (branchDisagreement.length) {
        issues.push(issue({
            code: 'BRANCH_CODE_CONFLICT', severity: SEVERITY.CRITICAL, category: CATEGORIES.IDENTITY,
            title: 'branch_code resolves to a different department than the USN',
            detail: 'Not the CI/AI or CD/DS spelling difference — these rows resolve to genuinely different departments.',
            impact: 'The student appears under the wrong department in every report.',
            remedy: 'Correct branch_code, or the USN if that is what is wrong.',
            count: branchDisagreement.length, total: students.length, unit: 'students',
            samples: branchDisagreement.map(s => ({ usn: s.usn, name: s.name, branchCode: s.branch_code, usnBranch: parseUSN(s.usn).usnBranch, resolved: resolveBranch(s).code }))
        }));
    }

    const unresolvedBranch = students.filter(s => !resolveBranch(s).code);
    if (unresolvedBranch.length) {
        issues.push(issue({
            code: 'BRANCH_UNRESOLVED', severity: SEVERITY.CRITICAL, category: CATEGORIES.IDENTITY,
            title: 'Students whose department cannot be resolved at all',
            detail: 'Neither the USN, branch_code nor the free-text branch label maps to a known department.',
            impact: 'Invisible to every department filter.',
            remedy: 'Add the department to the branches table, or fix the student record.',
            count: unresolvedBranch.length, total: students.length, unit: 'students',
            samples: unresolvedBranch.map(s => ({ usn: s.usn, name: s.name, branch: s.branch, branchCode: s.branch_code }))
        }));
    }

    const standingBehind = [];
    const standingGap = [];
    const sequenceHoles = [];
    for (const s of students) {
        const sems = [...(semestersByUsn.get(up(s.usn)) || [])];
        const st = resolveStanding(s, sems);
        if (st.drift === 'behind') standingBehind.push({ usn: s.usn, name: s.name, declared: st.declared, maxRecorded: st.maxRecorded });
        if (st.drift === 'ahead') standingGap.push({ usn: s.usn, name: s.name, declared: st.declared, maxRecorded: st.maxRecorded });
        if (st.missingSemesters.length) sequenceHoles.push({ usn: s.usn, name: s.name, recorded: st.recorded, missing: st.missingSemesters });
    }
    if (standingBehind.length) {
        issues.push(issue({
            code: 'SEMESTER_STANDING_BEHIND', severity: SEVERITY.WARNING, category: CATEGORIES.IDENTITY,
            title: 'students.semester is behind a semester the student already has results for',
            detail: 'The stored standing claims an earlier semester than the records prove. Standing is derived as max(declared, highest recorded) so displays stay correct, but the column is stale.',
            impact: 'Any query that filters on the raw column alone misses these students.',
            remedy: 'Advance students.semester to at least the highest recorded semester.',
            count: standingBehind.length, total: students.length, unit: 'students', samples: standingBehind
        }));
    }
    if (standingGap.length) {
        issues.push(issue({
            code: 'SEMESTER_STANDING_AHEAD', severity: SEVERITY.INFO, category: CATEGORIES.IDENTITY,
            title: 'students.semester is more than one semester ahead of the records',
            detail: 'Sitting in the semester after the last completed one is normal; a bigger jump means a semester was never scraped.',
            impact: 'Semester-scoped reports look emptier than the standing implies.',
            remedy: 'Scrape the missing semester, or correct the standing.',
            count: standingGap.length, total: students.length, unit: 'students', samples: standingGap
        }));
    }
    if (sequenceHoles.length) {
        issues.push(issue({
            code: 'SEMESTER_SEQUENCE_GAP', severity: SEVERITY.WARNING, category: CATEGORIES.COMPLETENESS,
            title: 'Holes in the middle of a student\'s semester history',
            detail: 'These students have records either side of a semester they have nothing for — a missed scrape rather than a gap year.',
            impact: 'CGPA is computed over an incomplete history and reads higher or lower than the truth.',
            remedy: 'Re-run the scraper for the listed semesters.',
            count: sequenceHoles.length, total: students.length, unit: 'students', samples: sequenceHoles
        }));
    }

    // ══════════════════ REFERENTIAL INTEGRITY ══════════════════

    const orphanMarks = marks.filter(m => !usnSet.has(up(m.usn)));
    if (orphanMarks.length) {
        issues.push(issue({
            code: 'ORPHAN_MARKS', severity: SEVERITY.CRITICAL, category: CATEGORIES.INTEGRITY,
            title: 'subject_marks rows whose USN has no student',
            detail: 'Marks exist for USNs that are not in the students table.',
            impact: 'Those marks are counted in institution-wide subject statistics but belong to nobody.',
            remedy: 'Import the missing students or delete the stray marks.',
            count: orphanMarks.length, total: marks.length, unit: 'marks',
            samples: [...new Set(orphanMarks.map(m => m.usn))].map(u => ({ usn: u, rows: orphanMarks.filter(m => m.usn === u).length }))
        }));
    }

    const orphanResults = results.filter(r => !usnSet.has(up(r.usn)));
    if (orphanResults.length) {
        issues.push(issue({
            code: 'ORPHAN_RESULTS', severity: SEVERITY.CRITICAL, category: CATEGORIES.INTEGRITY,
            title: 'results rows whose USN has no student',
            detail: 'Scraped semester results reference USNs absent from the students table.',
            impact: 'Semester counts and SGPA aggregates include records with no owner.',
            remedy: 'Import the missing students or delete the stray results.',
            count: orphanResults.length, total: results.length, unit: 'results',
            samples: [...new Set(orphanResults.map(r => r.usn))].map(u => ({ usn: u }))
        }));
    }

    const orphanRemarks = remarks.filter(r => !usnSet.has(up(r.student_usn)));
    if (orphanRemarks.length) {
        issues.push(issue({
            code: 'ORPHAN_REMARKS', severity: SEVERITY.CRITICAL, category: CATEGORIES.INTEGRITY,
            title: 'academic_remarks rows whose USN has no student',
            detail: 'Published SGPA rows reference USNs absent from the students table.',
            count: orphanRemarks.length, total: remarks.length, unit: 'remarks',
            samples: [...new Set(orphanRemarks.map(r => r.student_usn))].map(u => ({ usn: u }))
        }));
    }

    const classIds = new Set(classes.map(c => c.id));
    const orphanMembership = classStudents.filter(cs => !classIds.has(cs.class_id) || !usnSet.has(up(cs.usn)));
    if (orphanMembership.length) {
        issues.push(issue({
            code: 'ORPHAN_CLASS_MEMBERSHIP', severity: SEVERITY.WARNING, category: CATEGORIES.INTEGRITY,
            title: 'class_students rows pointing at a missing class or student',
            detail: 'Roster entries that reference a deleted class or a USN with no student row.',
            impact: 'Section resolution silently drops these students.',
            remedy: 'Delete the stale roster rows.',
            count: orphanMembership.length, total: classStudents.length, unit: 'memberships',
            samples: orphanMembership.map(cs => ({ usn: cs.usn, classId: cs.class_id, classMissing: !classIds.has(cs.class_id) }))
        }));
    }

    const sessionIds = new Set(examSessions.map(s => s.id));
    const unlinkedSessions = results.filter(r => !r.exam_session_id);
    const badSessions = results.filter(r => r.exam_session_id && !sessionIds.has(r.exam_session_id));
    if (unlinkedSessions.length) {
        issues.push(issue({
            code: 'RESULT_SESSION_UNLINKED', severity: unlinkedSessions.length === results.length ? SEVERITY.WARNING : SEVERITY.INFO,
            category: CATEGORIES.INTEGRITY,
            title: 'results rows not linked to an exam session',
            detail: unlinkedSessions.length === results.length
                ? 'Every result row has a null exam_session_id, so the exam_sessions table is effectively unused.'
                : 'Some result rows carry no exam session reference.',
            impact: 'Any filter or grouping by exam session returns nothing for these rows.',
            remedy: 'Backfill exam_session_id during the scrape, or drop the exam-session dimension from the UI.',
            count: unlinkedSessions.length, total: results.length, unit: 'results',
            samples: unlinkedSessions.slice(0, MAX_SAMPLES).map(r => ({ usn: r.usn, semester: r.semester, examName: r.exam_name }))
        }));
    }
    if (badSessions.length) {
        issues.push(issue({
            code: 'RESULT_SESSION_ORPHANED', severity: SEVERITY.WARNING, category: CATEGORIES.INTEGRITY,
            title: 'results rows referencing a deleted exam session',
            detail: 'exam_session_id points at a row that no longer exists in exam_sessions.',
            count: badSessions.length, total: results.length, unit: 'results',
            samples: badSessions.map(r => ({ usn: r.usn, semester: r.semester, sessionId: r.exam_session_id }))
        }));
    }

    // ══════════════════ ACADEMIC RECORDS ══════════════════

    const contested = [];
    let divergentPick = 0;
    for (const [key, rows] of resultGroups) {
        if (rows.length < 2) continue;
        const resolved = resolveAttempts(rows);
        const naive = rows[rows.length - 1]; // what an unordered last-wins map keeps
        const differs = String(naive.sgpa) !== String(resolved.primary?.row?.sgpa);
        if (differs) divergentPick++;
        const [usn, semester] = key.split('|');
        contested.push({
            usn, semester: Number(semester), attempts: rows.length,
            resolvedSgpa: resolved.primary?.sgpa ?? null,
            resolvedExam: resolved.primary?.exam?.code || null,
            resolvedKind: resolved.primary?.exam?.kind || null,
            naiveSgpa: naive.sgpa,
            wouldDiffer: differs
        });
    }
    if (contested.length) {
        const differing = contested.filter(c => c.wouldDiffer);
        issues.push(issue({
            code: 'RESULT_MULTIPLE_ATTEMPTS', severity: differing.length ? SEVERITY.CRITICAL : SEVERITY.INFO,
            category: CATEGORIES.ACADEMIC,
            title: 'Semesters published across several exam rounds',
            detail: `${contested.length} (student, semester) pairs carry more than one results row — regular, revaluation, makeup and supplementary rounds each land separately. Attempt resolution picks revaluation first, then the most recent publication. ${differing.length} of them resolve to a different SGPA than an unordered lookup would have returned.`,
            impact: differing.length
                ? `${differing.length} semester SGPAs — and every CGPA built on them — were being read from an arbitrary exam round.`
                : 'Resolved correctly; listed for visibility.',
            remedy: 'Read results through resolveAttempts() (lib/vtu-results.js), never by keying rows directly.',
            count: differing.length || contested.length, total: resultGroups.size, unit: 'semesters',
            samples: (differing.length ? differing : contested)
        }));
    }
    if (divergentPick > 0) {
        // Reported inside the issue above; kept as a distinct signal for the summary.
    }

    const sgpaConflicts = [];
    for (const [key, rows] of resultGroups) {
        const remark = remarkByKey.get(key);
        if (!remark) continue;
        const resolved = resolveAttempts(rows);
        const rs = resolved.primary?.sgpa;
        const as = Number(remark.sgpa);
        if (!Number.isFinite(rs) || !Number.isFinite(as) || rs <= 0 || as <= 0) continue;
        const delta = Math.abs(rs - as);
        if (delta > 0.5) {
            const [usn, semester] = key.split('|');
            sgpaConflicts.push({
                usn, semester: Number(semester), resultsSgpa: rs, remarksSgpa: as,
                delta: Number(delta.toFixed(2)),
                exam: resolved.primary?.exam?.code || null,
                kind: resolved.primary?.exam?.kind || null
            });
        }
    }
    if (sgpaConflicts.length) {
        issues.push(issue({
            code: 'SGPA_SOURCE_CONFLICT', severity: SEVERITY.CRITICAL, category: CATEGORIES.ACADEMIC,
            title: 'results and academic_remarks disagree on a semester SGPA',
            detail: 'The resolved exam result and the published remarks row differ by more than 0.5 grade points. A revaluation result supersedes; anything else means one of the two tables is stale.',
            impact: 'The semester SGPA a student sees depends on which table the page happens to read.',
            remedy: 'Re-scrape the semester, or make the scraper write both tables in one transaction.',
            count: sgpaConflicts.length, unit: 'semesters',
            samples: sgpaConflicts.sort((a, b) => b.delta - a.delta)
        }));
    }

    const resultsWithoutMarks = [...resultGroups.keys()].filter(k => !marksKeys.has(k));
    if (resultsWithoutMarks.length) {
        issues.push(issue({
            code: 'RESULT_WITHOUT_MARKS', severity: SEVERITY.WARNING, category: CATEGORIES.ACADEMIC,
            title: 'Semester results with no subject marks behind them',
            detail: 'A results row exists but no subject_marks were captured for that semester.',
            impact: 'Backlog and subject-level analysis silently skips the semester.',
            remedy: 'Re-scrape the semester so the subject breakdown is captured.',
            count: resultsWithoutMarks.length, total: resultGroups.size, unit: 'semesters',
            samples: resultsWithoutMarks.map(k => { const [usn, semester] = k.split('|'); return { usn, semester: Number(semester) }; })
        }));
    }

    const marksWithoutResult = [...marksKeys].filter(k => !resultGroups.has(k));
    if (marksWithoutResult.length) {
        issues.push(issue({
            code: 'MARKS_WITHOUT_RESULT', severity: SEVERITY.INFO, category: CATEGORIES.ACADEMIC,
            title: 'Subject marks with no parent results row',
            detail: 'Marks were captured for a semester that has no results header — the SGPA and exam provenance for it are unknown.',
            impact: 'Those semesters carry marks but no published SGPA.',
            remedy: 'Re-scrape so the results header is written alongside the marks.',
            count: marksWithoutResult.length, total: marksKeys.size, unit: 'semesters',
            samples: marksWithoutResult.map(k => { const [usn, semester] = k.split('|'); return { usn, semester: Number(semester) }; })
        }));
    }

    const zeroSgpaPublished = results.filter(r => Number(r.sgpa) === 0 && Number(r.total_credits) > 0);
    if (zeroSgpaPublished.length) {
        issues.push(issue({
            code: 'RESULT_ZERO_SGPA_WITH_CREDITS', severity: SEVERITY.WARNING, category: CATEGORIES.ACADEMIC,
            title: 'Result rows with credits but a zero SGPA',
            detail: 'A zero SGPA alongside a non-zero credit load is usually a partially-scraped page rather than a genuine total failure.',
            impact: 'If such a row wins attempt resolution it drags the CGPA to zero.',
            remedy: 'Re-scrape these semesters and confirm against the VTU page.',
            count: zeroSgpaPublished.length, total: results.length, unit: 'results',
            samples: zeroSgpaPublished.map(r => ({ usn: r.usn, semester: r.semester, examName: r.exam_name, credits: r.total_credits }))
        }));
    }

    // ══════════════════ CURRICULUM & CREDITS ══════════════════

    const catalogCodes = new Set(catalog.map(c => up(c.subject_code)));
    const marksCodes = new Map();
    for (const m of marks) {
        const c = up(m.subject_code);
        if (!c) continue;
        marksCodes.set(c, (marksCodes.get(c) || 0) + 1);
    }
    const uncatalogued = [...marksCodes.entries()].filter(([c]) => !catalogCodes.has(c));
    if (uncatalogued.length) {
        issues.push(issue({
            code: 'SUBJECT_NOT_IN_CATALOG', severity: SEVERITY.WARNING, category: CATEGORIES.CURRICULUM,
            title: 'Subject codes on marks that the catalog has never heard of',
            detail: 'These codes appear on real results but have no subject_catalog row under any scheme, branch or semester. Elective variants resolve through the family convention; the rest do not resolve at all.',
            impact: 'Credit resolution falls back to the family rule or fails outright for these subjects.',
            remedy: 'Add the missing rows to subject_catalog.',
            count: uncatalogued.length, total: marksCodes.size, unit: 'subject codes',
            samples: uncatalogued.sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, marks: n }))
        }));
    }

    if (catalogIndex) {
        const unresolvedCredit = new Map();
        const staleCreditColumn = [];
        for (const m of marks) {
            const s = studentByUsn.get(up(m.usn));
            if (!s) continue;
            const code = up(m.subject_code);
            if (!code || isAuditCourse(code)) continue;
            const branch = resolveBranch(s).code;
            const r = resolveSubjectCredit(catalogIndex, { scheme: s.scheme, branch, semester: m.semester, subject_code: code });
            if (r.source === 'unresolved') {
                const key = `${code}|${s.scheme}|${branch}|${m.semester}`;
                const prev = unresolvedCredit.get(key) || { code, scheme: s.scheme, branch, semester: m.semester, marks: 0 };
                prev.marks += 1;
                unresolvedCredit.set(key, prev);
            } else if (Number(r.credits) > 0 && !(Number(m.credits) > 0)) {
                staleCreditColumn.push({ usn: m.usn, semester: m.semester, code, storedCredits: m.credits, catalogCredits: r.credits });
            }
        }
        if (unresolvedCredit.size) {
            const list = [...unresolvedCredit.values()].sort((a, b) => b.marks - a.marks);
            issues.push(issue({
                code: 'CREDIT_UNRESOLVED', severity: SEVERITY.CRITICAL, category: CATEGORIES.CURRICULUM,
                title: 'Marks whose credit value cannot be resolved from the catalog',
                detail: 'The catalog has no exact row and no elective-family match for these (code, scheme, branch, semester) combinations, so their credit is unknown.',
                impact: 'These subjects are excluded from every SGPA and CGPA weighting, understating the credit load.',
                remedy: 'Add the missing subject_catalog rows for the scheme, branch and semester listed.',
                count: list.reduce((a, x) => a + x.marks, 0), total: marks.length, unit: 'marks',
                samples: list
            }));
        }
        if (staleCreditColumn.length) {
            issues.push(issue({
                code: 'CREDIT_COLUMN_STALE', severity: SEVERITY.WARNING, category: CATEGORIES.CURRICULUM,
                title: 'subject_marks.credits is null or zero while the catalog knows the credit',
                detail: 'The stored column is empty but the catalog resolves a real credit value. Code paths that read the column directly weight these subjects at zero, or guess.',
                impact: 'SGPA computed from the raw column understates or misweights these subjects.',
                remedy: 'Backfill subject_marks.credits from the catalog, and read credits through the resolver everywhere.',
                count: staleCreditColumn.length, total: marks.length, unit: 'marks',
                samples: staleCreditColumn
            }));
        }
    }

    const catalogNoCredits = catalog.filter(c => c.credits === null || c.credits === undefined);
    if (catalogNoCredits.length) {
        issues.push(issue({
            code: 'CATALOG_CREDIT_MISSING', severity: SEVERITY.WARNING, category: CATEGORIES.CURRICULUM,
            title: 'subject_catalog rows with no credit value',
            detail: 'The credit authority itself is missing a value for these subjects.',
            count: catalogNoCredits.length, total: catalog.length, unit: 'catalog rows',
            samples: catalogNoCredits.map(c => ({ code: c.subject_code, scheme: c.scheme, branch: c.branch, semester: c.semester }))
        }));
    }

    const schemesInUse = new Set(students.map(s => String(s.scheme || '')).filter(Boolean));
    const schemesInCatalog = new Set(catalog.map(c => String(c.scheme || '')).filter(Boolean));
    const missingSchemes = [...schemesInUse].filter(s => !schemesInCatalog.has(s));
    if (missingSchemes.length) {
        issues.push(issue({
            code: 'SCHEME_NOT_CATALOGUED', severity: SEVERITY.CRITICAL, category: CATEGORIES.CURRICULUM,
            title: 'Students on a scheme the catalog does not cover',
            detail: `Students are registered under scheme(s) ${missingSchemes.join(', ')} but subject_catalog has no rows for them.`,
            impact: 'No credit can be resolved for any of their subjects.',
            remedy: 'Import the scheme into subject_catalog.',
            count: students.filter(s => missingSchemes.includes(String(s.scheme))).length, total: students.length, unit: 'students',
            samples: missingSchemes.map(s => ({ scheme: s, students: students.filter(x => String(x.scheme) === s).length }))
        }));
    }

    // ══════════════════ COVERAGE & COMPLETENESS ══════════════════

    const noEmail = students.filter(s => !s.email || !String(s.email).trim());
    if (noEmail.length) {
        issues.push(issue({
            code: 'STUDENT_EMAIL_MISSING', severity: noEmail.length === students.length ? SEVERITY.WARNING : SEVERITY.INFO,
            category: CATEGORIES.COMPLETENESS,
            title: 'Students with no email address',
            detail: noEmail.length === students.length
                ? 'No student record carries an email, so searching the directory by email can never match and account activation has nothing to send to.'
                : 'Some students have no email on file.',
            impact: 'Email search and any account-activation flow are inoperative for these students.',
            remedy: 'Import institutional email addresses.',
            count: noEmail.length, total: students.length, unit: 'students',
            samples: noEmail.slice(0, MAX_SAMPLES).map(s => ({ usn: s.usn, name: s.name }))
        }));
    }

    const enrolled = new Set(classStudents.map(cs => up(cs.usn)));
    const unassigned = students.filter(s => !enrolled.has(up(s.usn)));
    if (unassigned.length) {
        issues.push(issue({
            code: 'STUDENT_WITHOUT_CLASS', severity: SEVERITY.INFO, category: CATEGORIES.COMPLETENESS,
            title: 'Students not enrolled in any class',
            detail: 'Section comes from class membership, so these students have no section and fall into "Unassigned" in every section-scoped view.',
            impact: 'Section filters, class rosters and section comparisons exclude them.',
            remedy: 'Create the classes for each batch/branch/section and import the rosters.',
            count: unassigned.length, total: students.length, unit: 'students',
            samples: unassigned.slice(0, MAX_SAMPLES).map(s => ({ usn: s.usn, name: s.name, branch: resolveBranch(s).code, batch: resolveBatch(s).year }))
        }));
    }

    const noRecords = students.filter(s => !(semestersByUsn.get(up(s.usn))?.size));
    if (noRecords.length) {
        issues.push(issue({
            code: 'STUDENT_WITHOUT_RECORDS', severity: SEVERITY.WARNING, category: CATEGORIES.COMPLETENESS,
            title: 'Students with no academic records at all',
            detail: 'No subject marks exist for these students in any semester.',
            impact: 'They show a blank CGPA and are invisible to every academic report.',
            remedy: 'Run the scraper for their batch.',
            count: noRecords.length, total: students.length, unit: 'students',
            samples: noRecords.slice(0, MAX_SAMPLES).map(s => ({ usn: s.usn, name: s.name, batch: resolveBatch(s).year }))
        }));
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const bySeverity = {
        [SEVERITY.CRITICAL]: issues.filter(i => i.severity === SEVERITY.CRITICAL).length,
        [SEVERITY.WARNING]: issues.filter(i => i.severity === SEVERITY.WARNING).length,
        [SEVERITY.INFO]: issues.filter(i => i.severity === SEVERITY.INFO).length
    };

    const byCategory = {};
    for (const c of Object.values(CATEGORIES)) {
        const inCat = issues.filter(i => i.category === c);
        byCategory[c] = {
            total: inCat.length,
            critical: inCat.filter(i => i.severity === SEVERITY.CRITICAL).length,
            warning: inCat.filter(i => i.severity === SEVERITY.WARNING).length,
            info: inCat.filter(i => i.severity === SEVERITY.INFO).length
        };
    }

    // A blunt but honest headline: criticals cost 12 points each, warnings 4, info 1.
    const penalty = bySeverity.critical * 12 + bySeverity.warning * 4 + bySeverity.info * 1;
    const score = Math.max(0, 100 - penalty);

    return {
        generatedAt: new Date().toISOString(),
        score,
        grade: score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'E',
        bySeverity,
        byCategory,
        issues: issues.sort((a, b) => {
            const rank = { [SEVERITY.CRITICAL]: 0, [SEVERITY.WARNING]: 1, [SEVERITY.INFO]: 2 };
            return rank[a.severity] - rank[b.severity] || b.count - a.count;
        }),
        totals: {
            students: students.length,
            marks: marks.length,
            results: results.length,
            remarks: remarks.length,
            classes: classes.length,
            classMemberships: classStudents.length,
            catalogRows: catalog.length,
            distinctResultSemesters: resultGroups.size,
            creditChecksRan: Boolean(catalogIndex)
        }
    };
}
