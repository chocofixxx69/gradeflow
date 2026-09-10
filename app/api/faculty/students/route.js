import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { readTable, invalidateTableCache, SELECTS } from '@/lib/table-cache';
import { canonicalBranch, branchLabelFor } from '@/lib/vtu-identity';
import { loadStudentRecords, toSummary } from '@/lib/student-record';
import { matchesStudent, scoreStudentMatch } from '@/lib/search-utils';

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
        // THE canonical academic record for every student. CGPA, backlogs, credits
        // and per-semester SGPA all come from here and nowhere else — see
        // lib/student-record.js for why the derived tables are not trusted.
        loadStudentRecords(supabaseAdmin, { fresh }),
        readTable(supabaseAdmin, 'classes', SELECTS.classes, { orderCol: 'created_at', ascending: false }),
        readTable(supabaseAdmin, 'class_students', SELECTS.class_students)
    ]).then(([studentRecords, classes, classStudents]) => ({ studentRecords, classes, classStudents }))
        .catch(err => {
            // Never leave a rejected promise cached — the next request must retry.
            datasetCache = { at: 0, promise: null };
            throw err;
        });

    datasetCache = { at: Date.now(), promise };
    return promise;
}

export async function GET(req) {
    try {
        const { error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
        const limitParam = (searchParams.get('limit') || '25').toLowerCase().trim();
        const isAll = limitParam === 'all' || limitParam === '-1';
        const limit = isAll ? 10000 : Math.min(1000, Math.max(10, parseInt(limitParam, 10) || 25));
        const sortBy = (searchParams.get('sortBy') || 'batch').toLowerCase().trim();
        const sortOrder = (searchParams.get('sortOrder') || (sortBy === 'batch' ? 'desc' : 'asc')).toLowerCase().trim();
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

        const { studentRecords, classes: rawClasses, classStudents: rawClassStudents } =
            await loadDataset(getAdminClient(), { fresh: searchParams.get('fresh') === '1' });

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

        // ── Multi-axis sorting comparator (batch, branch, USN, CGPA, etc.) ──
        const sortComparator = (a, b) => {
            let res = 0;
            if (sortBy === 'batch') {
                const batchA = Number(a.identity.batch.year) || 0;
                const batchB = Number(b.identity.batch.year) || 0;
                res = sortOrder === 'asc' ? batchA - batchB : batchB - batchA;
                if (res !== 0) return res;
                // secondary sort: branch, then USN
                const branchA = a.identity.branch.code || '';
                const branchB = b.identity.branch.code || '';
                const brRes = branchA.localeCompare(branchB);
                if (brRes !== 0) return brRes;
                return a.usn.localeCompare(b.usn);
            } else if (sortBy === 'name') {
                const nameA = a.record.name || '';
                const nameB = b.record.name || '';
                res = nameA.localeCompare(nameB);
            } else if (sortBy === 'cgpa') {
                const cgpaA = a.record.cgpa || 0;
                const cgpaB = b.record.cgpa || 0;
                res = cgpaA - cgpaB;
            } else if (sortBy === 'backlogs') {
                const bA = a.record.totalActiveBacklogs || 0;
                const bB = b.record.totalActiveBacklogs || 0;
                res = bA - bB;
            } else if (sortBy === 'department') {
                const brA = a.identity.branch.code || '';
                const brB = b.identity.branch.code || '';
                res = brA.localeCompare(brB);
            } else {
                // default USN
                res = a.usn.localeCompare(b.usn);
            }

            if (res === 0) res = a.usn.localeCompare(b.usn);
            return (sortOrder === 'desc' && sortBy !== 'batch') ? -res : res;
        };

        // ── One filterable row per student, wrapped around the canonical record ──
        const records = [...studentRecords.values()].map(record => {
            const classInfo = usnToClassMap.get(record.usn) || null;

            // Academic batch determination:
            // 1. If enrolled in a class with a declared batch (e.g. CSE - A 2023 with batch: '2023'), that class batch is authoritative.
            // 2. If a lateral entry student (e.g. 2AB24... enrolled in 2nd year), their academic cohort is batchYear - 1 ('2023').
            // 3. Otherwise, use their record's regular identity batch.
            const isLateral = record.identity.lateral?.isLateral;
            const usnBatchYear = record.identity.batch?.year;
            const cohortYear = isLateral && usnBatchYear ? String(Number(usnBatchYear) - 1) : usnBatchYear;
            const effectiveBatchYear = classInfo?.batch || cohortYear || usnBatchYear;
            const effectiveBatchDigits = effectiveBatchYear ? String(effectiveBatchYear).replace(/[^0-9]/g, '') : '';
            const effectiveBatchTwoDigit = effectiveBatchDigits.slice(-2);
            const effectiveBatchLabel = effectiveBatchTwoDigit ? `${effectiveBatchTwoDigit} Batch (${effectiveBatchYear})` : (record.identity.batch?.label || 'Unknown Batch');

            return {
                record,
                usn: record.usn,
                identity: {
                    ...record.identity,
                    batch: {
                        ...record.identity.batch,
                        year: effectiveBatchYear,
                        twoDigit: effectiveBatchTwoDigit,
                        label: effectiveBatchLabel,
                        source: classInfo?.batch ? 'class' : (isLateral ? 'lateral_cohort' : record.identity.batch?.source)
                    }
                },
                recordedSemesters: record.recordedSemesters,
                section: classInfo?.section || null,
                classInfo,
                searchBlob: `${record.usn} ${record.name} ${record.raw?.email || ''}`.toLowerCase()
            };
        }).sort(sortComparator);

        // "23", "2023" and "23 Batch (2023)" all mean the same cohort.
        const batchDigits = String(batch).replace(/[^0-9]/g, '');
        const batchTwoDigit = batchDigits ? batchDigits.slice(-2) : '';

        // ── One predicate per filter, so facets can re-run every filter but one ──
        const predicates = {
            branch: r => !branch || r.identity.branch.code === branch,
            // Check student's effective batch, class batch, and raw USN batch
            batch: r => {
                if (!batchTwoDigit) return true;
                return r.identity.batch.twoDigit === batchTwoDigit ||
                       (r.classInfo?.batch && String(r.classInfo.batch).replace(/[^0-9]/g, '').slice(-2) === batchTwoDigit) ||
                       (r.record.identity.batch?.twoDigit === batchTwoDigit);
            },
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
            search: r => {
                if (!search) return true;
                return matchesStudent({
                    usn: r.usn,
                    name: r.record.name,
                    email: r.record.raw?.email,
                    phone: r.record.raw?.phone,
                    section: r.section,
                    className: r.classInfo?.className,
                    branch: r.identity.branch.code
                }, search);
            }
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
        if (search) {
            matched.sort((a, b) => {
                const sB = scoreStudentMatch({
                    usn: b.usn,
                    name: b.record.name,
                    email: b.record.raw?.email,
                    phone: b.record.raw?.phone,
                    section: b.section,
                    className: b.classInfo?.className,
                    branch: b.identity.branch.code
                }, search);
                const sA = scoreStudentMatch({
                    usn: a.usn,
                    name: a.record.name,
                    email: a.record.raw?.email,
                    phone: a.record.raw?.phone,
                    section: a.section,
                    className: a.classInfo?.className,
                    branch: a.identity.branch.code
                }, search);
                return sB - sA;
            });
        }

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
        const classPool = applyAllExcept('classId');
        const statusPool = applyAllExcept('status');
        const entryPool = applyAllExcept('entry');

        const facets = {
            branches: countInto(branchPool, r => r.identity.branch.code, code => branchLabelFor(code))
                .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value))),
            batches: countInto(batchPool, r => r.identity.batch.year, year => `${String(year).slice(-2)} Batch (${year})`)
                .sort((a, b) => String(b.value).localeCompare(String(a.value))),
            classes: countInto(
                classPool.filter(r => r.classInfo?.classId),
                r => r.classInfo.classId,
                cid => {
                    const c = classById.get(cid);
                    return c ? `${c.name}${c.section ? ` (Sec ${c.section})` : ''}` : 'Class';
                }
            ).sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label))),
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

        // ── Project the canonical record onto a table row ─────────────────────
        // Nothing is recomputed here. Every number below already exists on the
        // student's canonical record (lib/student-record.js), so this row and the
        // detail page and the faculty dashboard cannot disagree.
        const enrichList = (targetRecords) => targetRecords.map(r => {
            const rec = r.record;
            const id = r.identity;
            const s = rec.raw;

            // Every quality signal that applies to THIS student, so the row can say
            // why a number might be off instead of quietly presenting it as solid.
            const flags = [];
            if (!id.usnValid) flags.push({ code: 'USN_INVALID', label: 'USN does not parse' });
            if (id.standing.drift === 'behind') flags.push({ code: 'STANDING_BEHIND', label: `Stored semester ${id.standing.declared} is behind recorded ${id.standing.maxRecorded}` });
            if (id.standing.missingSemesters.length) flags.push({ code: 'SEMESTER_GAP', label: `No records for semester ${id.standing.missingSemesters.join(', ')}` });
            if (!id.batch.agreesWithColumn) flags.push({ code: 'YEAR_MISMATCH', label: `students.year is ${id.batch.declaredYear}, USN says ${id.batch.year}` });
            if (!id.lateral.flagAgrees) flags.push({ code: 'LATERAL_FLAG', label: id.lateral.isLateral ? 'Lateral entry not flagged on the record' : 'Flagged lateral but has first-year records' });
            if (rec.hasUnresolvedCredits) flags.push({ code: 'CREDIT_UNRESOLVED', label: `${rec.unresolvedSubjects.length} subject(s) with no catalog credit, excluded from the CGPA` });
            const multiRound = Object.values(rec.provenance).filter(p => p.attemptCount > 1);
            if (multiRound.length) flags.push({ code: 'MULTI_ATTEMPT', label: `${multiRound.length} semester(s) published across several exam rounds` });
            if (rec.staleSemesters) flags.push({ code: 'SGPA_CONFLICT', label: `${rec.staleSemesters} semester(s) where the published SGPA is stale against the marks` });

            let semesterView = null;
            if (semester) {
                const st = rec.semStats[semester] || null;
                const pv = rec.provenance[semester] || null;
                semesterView = {
                    semester,
                    hasRecord: Boolean(st),
                    sgpa: st ? st.sgpa : null,
                    sgpaSource: st ? 'subject_marks' : null,
                    credits: st ? st.totalCredits : null,
                    earnedCredits: st ? st.earnedCredits : null,
                    backlogs: st ? st.backlogs : null,
                    subjectCount: st ? st.subjectCount : 0,
                    examName: pv?.examName || null,
                    examKind: pv?.examKind || null,
                    attemptCount: pv?.attemptCount || 0,
                    hasRevaluation: Boolean(pv?.hasRevaluation),
                    publishedSgpa: pv?.publishedSgpa ?? null,
                    sgpaDelta: pv?.sgpaDelta ?? 0
                };
            }

            return {
                ...toSummary(rec),
                id: s?.id || null,
                batch: r.identity.batch.year,
                batchLabel: r.identity.batch.label,
                branchSource: id.branch.source,
                year: s?.year ?? null,
                email: s?.email || '—',
                phone: s?.phone || '—',
                is_suspended: id.isInactive,
                section: r.section || null,
                className: r.classInfo?.className || null,
                classId: r.classInfo?.classId || null,
                cgpaSource: rec.cgpaSource,
                flags,
                semesterView
            };
        });

        let totalStudents = matched.length;
        let pagedEnriched = [];

        if (backlogsFilter === 'all') {
            const startIndex = isAll ? 0 : (page - 1) * limit;
            const endIndex = isAll ? matched.length : (startIndex + limit);
            pagedEnriched = enrichList(matched.slice(startIndex, endIndex));
        } else {
            // Backlog status is only knowable after enrichment, so the whole
            // candidate set is enriched before paging.
            const allEnriched = enrichList(matched);
            const filtered = allEnriched.filter(s =>
                backlogsFilter === 'clear' ? s.total_backlogs === 0 : s.total_backlogs > 0
            );
            totalStudents = filtered.length;
            const startIndex = isAll ? 0 : (page - 1) * limit;
            const endIndex = isAll ? filtered.length : (startIndex + limit);
            pagedEnriched = filtered.slice(startIndex, endIndex);
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
            if (r.record.staleSemesters) codes.push('SGPA_CONFLICT');
            if (Object.values(r.record.provenance).some(p => p.attemptCount > 1)) codes.push('MULTI_ATTEMPT');
            if (codes.length) qualitySummary.flagged += 1;
            for (const c of codes) qualitySummary.byCode[c] = (qualitySummary.byCode[c] || 0) + 1;
        }

        return ok({
            students: pagedEnriched,
            pagination: {
                total: totalStudents,
                page,
                limit: isAll ? totalStudents : limit,
                totalPages: isAll ? 1 : (Math.ceil(totalStudents / limit) || 1)
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
                sortBy,
                sortOrder,
                activeFilters: activeFilterNames
            },
            blockingFilters,
            quality: qualitySummary,
            meta: {
                sections: facets.sections.map(o => o.value).filter(v => v !== 'UNASSIGNED'),
                totalStudents: records.length,
                matchedBeforeBacklogFilter: matched.length,
                batchGroups: facets.batches,
                branchGroups: facets.branches,
                cgpaSource: 'subject_marks + subject_catalog (vtuAcademicEngine)'
            }
        });
    } catch (err) {
        console.error('[GET /api/faculty/students]', err);
        return fail('Failed to fetch students directory: ' + (err.message || err), 'STUDENTS_DIRECTORY_ERROR', 500);
    }
}
