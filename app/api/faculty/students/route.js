import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, computeBacklogs } from '@/lib/analytics-data';
import { readTable, invalidateTableCache, SELECTS } from '@/lib/table-cache';
import { fetchCatalogIndex, resolveSubjectCredit } from '@/lib/subjectCreditResolver';
import { isAuditCourse } from '@/lib/vtuAcademicEngine';
import {
    configureBranchRegistry,
    buildStudentIdentity,
    canonicalBranch,
    branchLabelFor,
    matchesBatchYear
} from '@/lib/vtu-identity';
import { buildSemesterIndex, cumulativeGPA } from '@/lib/vtu-results';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/**
 * Semester matching modes.
 *
 *   'records' (default) - a student belongs to semester N if they have academic
 *                         records for N, or are currently studying it. This is the
 *                         only mode that answers "show me the 23 batch's semester 3":
 *                         those students sat semester 3 two years ago and their
 *                         students.semester column now reads 7.
 *   'current'           - only students whose live standing IS semester N.
 *
 * students.semester is a single mutable "where the student stands today" column and
 * it drifts - 12 live rows sit BEHIND a semester the student already has results
 * for. Standing is therefore derived (lib/vtu-identity.js resolveStanding), never
 * read raw, and matching on the raw column alone is what produced empty directories.
 */
const SEMESTER_MODES = new Set(['records', 'current']);

/**
 * The directory dataset is identical for every filter combination — only the
 * predicates applied to it change. Holding it for a few seconds keeps changing a
 * dropdown instantaneous instead of re-pulling the warehouse per keystroke, while
 * staying live enough that a scrape landing mid-session shows up on its own.
 * `?fresh=1` (the Refresh button) always bypasses it.
 */
const DATASET_TTL_MS = 15_000;
let datasetCache = { at: 0, promise: null };

function loadDataset(supabaseAdmin, { fresh = false } = {}) {
    if (!fresh && datasetCache.promise && Date.now() - datasetCache.at < DATASET_TTL_MS) {
        return datasetCache.promise;
    }

    if (fresh) invalidateTableCache();

    const promise = Promise.all([
        readTable(supabaseAdmin, 'students', SELECTS.students, { orderCol: 'usn' }),
        readTable(supabaseAdmin, 'classes', SELECTS.classes, { orderCol: 'created_at', ascending: false }),
        readTable(supabaseAdmin, 'class_students', SELECTS.class_students),
        readTable(supabaseAdmin, 'results', SELECTS.results),
        readTable(supabaseAdmin, 'academic_remarks', SELECTS.academic_remarks),
        readTable(supabaseAdmin, 'subject_marks', SELECTS.subject_marks),
        supabaseAdmin.from('branches').select('code, label, usn_codes, aliases, sort_order, is_active').then(r => r.data || []),
        fetchCatalogIndex(supabaseAdmin).catch(() => null)
    ]).then(([students, classes, classStudents, results, remarks, marks, branches, catalogIndex]) => {
        // The branches table is the department authority — seed the resolver from it
        // before a single branch code is resolved.
        configureBranchRegistry(branches);

        const marksByUsn = new Map();
        for (const m of marks) {
            const u = String(m.usn || '').toUpperCase().trim();
            if (!marksByUsn.has(u)) marksByUsn.set(u, []);
            marksByUsn.get(u).push(m);
        }

        // ONE resolution of the multi-attempt results log, shared by every request.
        const semesterIndex = buildSemesterIndex({ results, remarks, marks });

        return { students, classes, classStudents, marksByUsn, semesterIndex, branches, catalogIndex };
    }).catch(err => {
        // Never leave a rejected promise cached — the next request must retry.
        datasetCache = { at: 0, promise: null };
        throw err;
    });

    datasetCache = { at: Date.now(), promise };
    return promise;
}

/**
 * Credits for one mark, resolved through the catalog rather than read off the row.
 * subject_marks.credits is null or zero on 1,846 live rows across 527 students, so
 * trusting the column silently weights real subjects at zero.
 */
function creditsFor(mark, identity, catalogIndex) {
    const code = String(mark.subject_code || '').toUpperCase().trim();
    if (!code) return { credits: 0, source: 'no-code' };
    if (isAuditCourse(code)) return { credits: 0, source: 'audit' };

    if (catalogIndex) {
        const r = resolveSubjectCredit(catalogIndex, {
            scheme: identity.scheme,
            branch: identity.branch.code,
            semester: mark.semester,
            subject_code: code
        });
        if (r.source !== 'unresolved' && Number(r.credits) > 0) {
            return { credits: Number(r.credits), source: r.source };
        }
    }

    const stored = Number(mark.credits);
    if (Number.isFinite(stored) && stored > 0) return { credits: stored, source: 'stored' };
    return { credits: 0, source: 'unresolved' };
}

export async function GET(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') || '25', 10)));
        const branchParam = (searchParams.get('branch') || '').toUpperCase().trim();
        const branch = branchParam && branchParam !== 'ALL' ? (canonicalBranch(branchParam) || branchParam) : '';
        const semesterRaw = searchParams.get('semester');
        const semester = semesterRaw && semesterRaw !== 'all' ? parseInt(semesterRaw, 10) : null;
        const semesterModeParam = (searchParams.get('semesterMode') || 'records').trim();
        const semesterMode = SEMESTER_MODES.has(semesterModeParam) ? semesterModeParam : 'records';
        const batchRaw = (searchParams.get('batch') || '').trim();
        const batch = batchRaw && batchRaw !== 'all' ? batchRaw : '';
        const sectionRaw = (searchParams.get('section') || 'all').trim().toUpperCase();
        const section = sectionRaw && sectionRaw !== 'ALL' ? sectionRaw : '';
        const classId = searchParams.get('classId') || '';
        const search = (searchParams.get('search') || '').trim().toLowerCase();
        const status = searchParams.get('status') || 'all';           // 'all' | 'active' | 'inactive'
        const backlogsFilter = searchParams.get('backlogsFilter') || 'all'; // 'all' | 'clear' | 'backlogs'
        const entryFilter = (searchParams.get('entry') || 'all').trim(); // 'all' | 'regular' | 'lateral'

        const {
            students: rawStudents,
            classes: rawClasses,
            classStudents: rawClassStudents,
            marksByUsn,
            semesterIndex,
            catalogIndex
        } = await loadDataset(getAdminClient(), { fresh: searchParams.get('fresh') === '1' });

        // ── Class membership → section ────────────────────────────────────────
        const classById = new Map((rawClasses || []).map(c => [c.id, c]));
        const usnToClassMap = new Map();
        (rawClassStudents || []).forEach(cs => {
            const c = classById.get(cs.class_id);
            if (!c) return;
            const key = String(cs.usn || '').toUpperCase().trim();
            const existing = usnToClassMap.get(key);
            if (!existing || (!existing.section && c.section)) {
                usnToClassMap.set(key, {
                    classId: c.id,
                    className: c.name,
                    section: (c.section || '').toUpperCase().trim(),
                    batch: c.batch,
                    semester: c.semester,
                    branch: c.branch
                });
            }
        });

        // ── Normalise every student into one filterable record ────────────────
        const records = (rawStudents || []).map(s => {
            const key = String(s.usn || '').toUpperCase().trim();
            const perSemester = semesterIndex.get(key) || new Map();
            const recordedSemesters = [...perSemester.keys()].sort((a, b) => a - b);
            const identity = buildStudentIdentity(s, recordedSemesters);
            const classInfo = usnToClassMap.get(key) || null;

            return {
                raw: s,
                usn: key,
                identity,
                perSemester,
                recordedSemesters,
                section: classInfo?.section || null,
                classInfo,
                searchBlob: `${s.usn || ''} ${s.name || ''} ${s.email || ''}`.toLowerCase()
            };
        });

        // ── One predicate per filter, so facets can re-run every filter but one ──
        const predicates = {
            branch: r => !branch || r.identity.branch.code === branch,
            batch: r => !batch || matchesBatchYear(r.raw, batch),
            semester: r => {
                if (!semester) return true;
                if (semesterMode === 'current') return r.identity.standing.current === semester;
                return r.recordedSemesters.includes(semester) || r.identity.standing.current === semester;
            },
            section: r => {
                if (!section) return true;
                if (section === 'UNASSIGNED') return !r.section;
                return r.section === section;
            },
            classId: r => !classId || r.classInfo?.classId === classId,
            status: r => {
                if (status === 'active') return !r.identity.isInactive;
                if (status === 'inactive') return r.identity.isInactive;
                return true;
            },
            entry: r => {
                if (entryFilter === 'lateral') return r.identity.lateral.isLateral;
                if (entryFilter === 'regular') return !r.identity.lateral.isLateral;
                return true;
            },
            search: r => !search || r.searchBlob.includes(search)
        };

        const isActive = {
            branch: Boolean(branch),
            batch: Boolean(batch),
            semester: Boolean(semester),
            section: Boolean(section),
            classId: Boolean(classId),
            status: status !== 'all',
            entry: entryFilter !== 'all',
            search: Boolean(search)
        };
        const activeFilterNames = Object.keys(predicates).filter(n => isActive[n]);

        const applyAllExcept = (skip) => records.filter(r =>
            Object.entries(predicates).every(([name, fn]) => name === skip || fn(r))
        );

        const matched = applyAllExcept(null);

        // ── Facets: every dropdown option counted against the *other* filters ──
        // A facet count of 0 is never rendered as a selectable dead end on the
        // client, so an empty table is no longer reachable by picking a plausible
        // combination.
        const countInto = (list, keyFn, labelFn) => {
            const counts = new Map();
            list.forEach(r => {
                const keys = keyFn(r);
                (Array.isArray(keys) ? keys : [keys]).forEach(k => {
                    if (k === null || k === undefined || k === '') return;
                    counts.set(k, (counts.get(k) || 0) + 1);
                });
            });
            return Array.from(counts.entries()).map(([value, count]) => ({ value, count, label: labelFn(value, count) }));
        };

        const branchPool = applyAllExcept('branch');
        const batchPool = applyAllExcept('batch');
        const semesterPool = applyAllExcept('semester');
        const sectionPool = applyAllExcept('section');
        const statusPool = applyAllExcept('status');
        const entryPool = applyAllExcept('entry');

        const facets = {
            branches: countInto(branchPool, r => r.identity.branch.code, code => branchLabelFor(code))
                .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value))),
            batches: countInto(batchPool, r => r.identity.batch.year, year => `${String(year).slice(-2)} Batch (${year})`)
                .sort((a, b) => String(b.value).localeCompare(String(a.value))),
            semesters: countInto(
                semesterPool,
                r => semesterMode === 'current'
                    ? [r.identity.standing.current]
                    : Array.from(new Set([...r.recordedSemesters, r.identity.standing.current])),
                sem => `Semester ${sem}`
            ).sort((a, b) => a.value - b.value),
            sections: [
                ...countInto(sectionPool.filter(r => r.section), r => r.section, sec => `Section ${sec}`)
                    .sort((a, b) => String(a.value).localeCompare(String(b.value))),
                { value: 'UNASSIGNED', label: 'Unassigned (No Class)', count: sectionPool.filter(r => !r.section).length }
            ].filter(o => o.count > 0),
            statuses: [
                { value: 'all', label: 'All', count: statusPool.length },
                { value: 'active', label: 'Active', count: statusPool.filter(r => !r.identity.isInactive).length },
                { value: 'inactive', label: 'Inactive', count: statusPool.filter(r => r.identity.isInactive).length }
            ],
            entries: [
                { value: 'all', label: 'All Entries', count: entryPool.length },
                { value: 'regular', label: 'Regular Intake', count: entryPool.filter(r => !r.identity.lateral.isLateral).length },
                { value: 'lateral', label: 'Lateral Entry', count: entryPool.filter(r => r.identity.lateral.isLateral).length }
            ].filter(o => o.count > 0 || o.value === 'all'),
            total: records.length
        };

        // ── When nothing matched, name the filter that emptied the table ───────
        // Each active filter is dropped in turn; whichever drop brings rows back is
        // reported so the client can offer a one-click way out instead of a dead end.
        const filterLabels = {
            branch: `Department "${branchLabelFor(branch)}"`,
            batch: `Batch ${batch}`,
            semester: `Semester ${semester}`,
            section: section === 'UNASSIGNED' ? 'Section "Unassigned"' : `Section ${section}`,
            classId: 'Class',
            status: `Status "${status}"`,
            entry: entryFilter === 'lateral' ? 'Lateral entry only' : 'Regular intake only',
            search: `Search "${search}"`
        };

        const blockingFilters = matched.length === 0
            ? activeFilterNames
                .map(name => ({ filter: name, label: filterLabels[name], countIfCleared: applyAllExcept(name).length }))
                .filter(x => x.countIfCleared > 0)
                .sort((a, b) => b.countIfCleared - a.countIfCleared)
            : [];

        // ── Enrich only what is shown ─────────────────────────────────────────
        const enrichList = (targetRecords) => targetRecords.map(r => {
            const s = r.raw;
            const id = r.identity;
            const uMarks = marksByUsn.get(r.usn) || [];

            const backlogInfo = computeBacklogs(uMarks);
            let backlogCredits = 0;
            let unresolvedCredits = 0;
            for (const fb of backlogInfo.failedSubjects) {
                const c = creditsFor({ subject_code: fb.subject_code, semester: fb.semester, credits: fb.credits }, id, catalogIndex);
                backlogCredits += c.credits;
                if (c.source === 'unresolved') unresolvedCredits += 1;
            }

            const { cgpa, credits: gpaCredits, semesters: gradedSemesters } = cumulativeGPA(r.perSemester);

            // Every quality signal that applies to THIS student, so the row can say
            // why a number might be off instead of quietly presenting it as solid.
            const flags = [];
            if (!id.usnValid) flags.push({ code: 'USN_INVALID', label: 'USN does not parse' });
            if (id.standing.drift === 'behind') flags.push({ code: 'STANDING_BEHIND', label: `Stored semester ${id.standing.declared} is behind recorded ${id.standing.maxRecorded}` });
            if (id.standing.missingSemesters.length) flags.push({ code: 'SEMESTER_GAP', label: `No records for semester ${id.standing.missingSemesters.join(', ')}` });
            if (!id.batch.agreesWithColumn) flags.push({ code: 'YEAR_MISMATCH', label: `students.year is ${id.batch.declaredYear}, USN says ${id.batch.year}` });
            if (!id.lateral.flagAgrees) flags.push({ code: 'LATERAL_FLAG', label: id.lateral.isLateral ? 'Lateral entry not flagged on the record' : 'Flagged lateral but has first-year records' });
            if (unresolvedCredits) flags.push({ code: 'CREDIT_UNRESOLVED', label: `${unresolvedCredits} backlog subject(s) with no catalog credit` });
            const contested = [...r.perSemester.values()].filter(e => e.contested);
            if (contested.length) flags.push({ code: 'MULTI_ATTEMPT', label: `${contested.length} semester(s) published across several exam rounds` });
            const conflicts = [...r.perSemester.values()].filter(e => e.sgpaConflict > 0.5);
            if (conflicts.length) flags.push({ code: 'SGPA_CONFLICT', label: `${conflicts.length} semester(s) where results and remarks disagree` });

            let semesterView = null;
            if (semester) {
                const entry = r.perSemester.get(semester) || null;
                const semMarks = uMarks.filter(m => Number(m.semester) === semester);
                const semBacklogs = entry?.backlogCount ?? (semMarks.length ? computeBacklogs(semMarks).totalBacklogs : null);
                semesterView = {
                    semester,
                    hasRecord: Boolean(entry) || semMarks.length > 0,
                    sgpa: Number.isFinite(entry?.sgpa) ? entry.sgpa : null,
                    sgpaSource: entry?.sgpaSource || null,
                    credits: entry?.credits ?? null,
                    backlogs: semBacklogs,
                    subjectCount: semMarks.length,
                    examName: entry?.examName || null,
                    examKind: entry?.examKind || null,
                    attemptCount: entry?.attemptCount || 0,
                    hasRevaluation: Boolean(entry?.hasRevaluation)
                };
            }

            return {
                id: s.id,
                usn: r.usn,
                name: id.name,
                branch: id.branch.code || '—',
                branchLabel: id.branch.label,
                branchSource: id.branch.source,
                semester: id.standing.current || 1,
                declaredSemester: id.standing.declared,
                recordedSemesters: r.recordedSemesters,
                semesterDrift: id.standing.drift,
                batch: id.batch.year,
                batchLabel: id.batch.label,
                year: s.year,
                scheme: id.scheme,
                email: s.email || '—',
                phone: s.phone || '—',
                is_inactive: id.isInactive,
                is_suspended: id.isInactive,
                lateral_entry: id.lateral.isLateral,
                lateralConfidence: id.lateral.confidence,
                section: r.section || null,
                className: r.classInfo?.className || null,
                classId: r.classInfo?.classId || null,
                cgpa,
                cgpaCredits: gpaCredits,
                gradedSemesters,
                total_backlogs: backlogInfo.totalBacklogs,
                backlog_credits: backlogCredits,
                failedSubjects: backlogInfo.failedSubjects.map(f => f.subject_code),
                flags,
                semesterView
            };
        });

        let totalStudents = matched.length;
        let pagedEnriched = [];

        if (backlogsFilter === 'all') {
            const startIndex = (page - 1) * limit;
            pagedEnriched = enrichList(matched.slice(startIndex, startIndex + limit));
        } else {
            // Backlog status is only knowable after enrichment, so the whole
            // candidate set is enriched before paging.
            const allEnriched = enrichList(matched);
            const filtered = allEnriched.filter(s =>
                backlogsFilter === 'clear' ? s.total_backlogs === 0 : s.total_backlogs > 0
            );
            totalStudents = filtered.length;
            const startIndex = (page - 1) * limit;
            pagedEnriched = filtered.slice(startIndex, startIndex + limit);
        }

        // Quality summary across the whole matched set, not just this page, so the
        // header can say how much of the current selection is questionable.
        const qualitySummary = { flagged: 0, byCode: {} };
        for (const r of matched) {
            const id = r.identity;
            const codes = [];
            if (!id.usnValid) codes.push('USN_INVALID');
            if (id.standing.drift === 'behind') codes.push('STANDING_BEHIND');
            if (id.standing.missingSemesters.length) codes.push('SEMESTER_GAP');
            if (!id.batch.agreesWithColumn) codes.push('YEAR_MISMATCH');
            if (!id.lateral.flagAgrees) codes.push('LATERAL_FLAG');
            if ([...r.perSemester.values()].some(e => e.sgpaConflict > 0.5)) codes.push('SGPA_CONFLICT');
            if ([...r.perSemester.values()].some(e => e.contested)) codes.push('MULTI_ATTEMPT');
            if (codes.length) qualitySummary.flagged += 1;
            for (const c of codes) qualitySummary.byCode[c] = (qualitySummary.byCode[c] || 0) + 1;
        }

        return ok({
            students: pagedEnriched,
            pagination: {
                total: totalStudents,
                page,
                limit,
                totalPages: Math.ceil(totalStudents / limit) || 1
            },
            facets,
            applied: {
                branch: branch || null,
                batch: batch || null,
                semester,
                semesterMode,
                section: section || null,
                classId: classId || null,
                status,
                entry: entryFilter,
                backlogsFilter,
                search: search || null,
                activeFilters: activeFilterNames
            },
            blockingFilters,
            quality: qualitySummary,
            meta: {
                sections: facets.sections.map(o => o.value).filter(v => v !== 'UNASSIGNED'),
                totalStudents: records.length,
                matchedBeforeBacklogFilter: matched.length,
                creditsResolvedFromCatalog: Boolean(catalogIndex)
            }
        });
    } catch (err) {
        console.error('[GET /api/faculty/students]', err);
        return fail('Failed to fetch students directory: ' + (err.message || err), 'STUDENTS_DIRECTORY_ERROR', 500);
    }
}
