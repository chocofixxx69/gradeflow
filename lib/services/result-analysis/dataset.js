// Shared data-fetch layer for the Result Analysis service suite.
//
// Every service in this directory (summary, subjects, classes, students, faculty,
// rankings, backlogs, statistics, chart-data, export) builds its report from the
// single dataset assembled here. This is deliberate: it's the only place Result
// Analysis queries Supabase, so there is exactly one fetch path to review for
// N+1s, and every endpoint sees identically-scoped data for the same filters.
//
// Filters accepted (all optional): academicYear, examSessionId, examName,
// branch, semester, classId, section.
//
// academicYear / examSessionId rely on migration 001_result_analysis.sql
// (classes.academic_year, exam_sessions, results.exam_session_id). Until that
// migration has been applied, those two filters are no-ops (documented in the
// returned `meta`), not silent failures — everything else works unchanged.

const PAGE = 1000;

async function fetchAllRows(client, table, select) {
    let all = [];
    let from = 0;
    while (true) {
        const { data, error } = await client.from(table).select(select).range(from, from + PAGE - 1);
        if (error) throw error;
        if (data) all.push(...data);
        if (!data || data.length < PAGE) break;
        from += PAGE;
    }
    return all;
}

export async function fetchByColumnIn(client, table, select, column, values, chunkSize = 30) {
    const out = [];
    const unique = [...new Set((values || []).filter(Boolean))];
    if (unique.length === 0) return [];
    
    const pageSize = 1000;
    for (let i = 0; i < unique.length; i += chunkSize) {
        const chunk = unique.slice(i, i + chunkSize);
        let from = 0;
        while (true) {
            const { data, error } = await client
                .from(table)
                .select(select)
                .in(column, chunk)
                .range(from, from + pageSize - 1);
            if (error) throw error;
            if (data && data.length > 0) out.push(...data);
            if (!data || data.length < pageSize) break;
            from += pageSize;
        }
    }
    return out;
}

function isMissingColumnError(err) {
    const msg = String(err?.message || err || '');
    return err?.code === '42703' || /column .* does not exist/i.test(msg);
}

export function isMissingTableError(err) {
    const msg = String(err?.message || err || '');
    return err?.code === '42P01' || /relation .* does not exist/i.test(msg);
}

export async function resolveClasses(client, filters = {}) {
    const { classId, branch, semester, section } = filters;

    let query = client.from('classes').select('*');
    if (classId) query = query.eq('id', classId);
    if (branch) query = query.ilike('branch', branch);
    if (semester !== undefined && semester !== null && semester !== '') query = query.eq('semester', Number(semester));
    if (section) query = query.eq('section', section);

    const { data, error } = await query;
    if (error) throw error;
    let classes = data || [];

    let academicYearSupported = true;
    if (filters.academicYear) {
        if (classes.length > 0 && !Object.prototype.hasOwnProperty.call(classes[0], 'academic_year')) {
            academicYearSupported = false;
        } else {
            classes = classes.filter(c => String(c.academic_year || '') === String(filters.academicYear));
        }
    }

    return { classes, academicYearSupported };
}

export function scopeClassesToFaculty(classes, session) {
    if (!session || session.role !== 'faculty') return classes;
    return classes.filter(c => c.faculty_id === session.sub);
}

/** Resolves an exam_sessions row by id or name. Returns null if the table isn't migrated yet. */
export async function resolveExamSession(client, { examSessionId, examName } = {}) {
    if (!examSessionId && !examName) return { session: null, examSessionsSupported: true };
    try {
        let query = client.from('exam_sessions').select('*');
        if (examSessionId) query = query.eq('id', examSessionId);
        else query = query.eq('name', examName);
        const { data, error } = await query.limit(1).maybeSingle();
        if (error) throw error;
        return { session: data || null, examSessionsSupported: true };
    } catch (err) {
        if (isMissingTableError(err)) return { session: null, examSessionsSupported: false };
        throw err;
    }
}

async function fetchResults(client, usns) {
    try {
        const rows = await fetchByColumnIn(
            client, 'results', 'id, usn, semester, exam_name, exam_url, exam_session_id, scraped_at', 'usn', usns
        );
        return { rows, examSessionIdColumnPresent: true };
    } catch (err) {
        if (!isMissingColumnError(err)) throw err;
        const rows = await fetchByColumnIn(
            client, 'results', 'id, usn, semester, exam_name, exam_url, scraped_at', 'usn', usns
        );
        return { rows, examSessionIdColumnPresent: false };
    }
}

/**
 * Builds the full filtered dataset: matching classes -> enrolled students ->
 * their results for the resolved exam session -> subject_marks for those results.
 *
 * @returns {{
 *   classes, students, studentByUsn, resultsRaw, matchingResults, resultByUsn,
 *   subjectMarks, resolvedExamName, resolvedExamSessionId, emptyReason, meta
 * }}
 */
export async function buildDataset(client, filters = {}, { session } = {}) {
    const { classes, academicYearSupported } = await resolveClasses(client, filters);
    const scopedClasses = scopeClassesToFaculty(classes, session);

    const meta = {
        marks_source: 'subject_marks',
        faculty_mapping: 'faculty_subject_assignments (falls back to null if not yet populated/migrated)',
        academic_year_filter_supported: academicYearSupported,
    };

    if (scopedClasses.length === 0) {
        return emptyDataset(scopedClasses, filters, meta, classes.length === 0 ? 'NO_MATCHING_CLASSES' : 'NO_CLASSES_FOR_FACULTY');
    }

    const classIds = scopedClasses.map(c => c.id);
    const classStudents = await fetchByColumnIn(client, 'class_students', 'class_id, usn', 'class_id', classIds);
    const usns = [...new Set(classStudents.map(cs => cs.usn))];

    if (usns.length === 0) {
        return emptyDataset(scopedClasses, filters, meta, 'NO_ENROLLED_STUDENTS');
    }

    const [students, { rows: resultsRaw, examSessionIdColumnPresent }, { session: examSession, examSessionsSupported }] = await Promise.all([
        fetchByColumnIn(client, 'students', 'usn, name, branch, semester, scheme', 'usn', usns),
        fetchResults(client, usns),
        resolveExamSession(client, filters),
    ]);
    meta.exam_session_filter_supported = examSessionsSupported && examSessionIdColumnPresent;

    const studentByUsn = {};
    for (const s of students) studentByUsn[s.usn] = s;

    let resolvedExamName = null;
    let resolvedExamSessionId = null;
    let matchingResults;

    if (examSession) {
        resolvedExamName = examSession.name;
        resolvedExamSessionId = examSession.id;
        matchingResults = examSessionIdColumnPresent
            ? resultsRaw.filter(r => r.exam_session_id === examSession.id || r.exam_name === examSession.name)
            : resultsRaw.filter(r => r.exam_name === examSession.name);
    } else if (filters.examName) {
        resolvedExamName = filters.examName;
        matchingResults = resultsRaw.filter(r => r.exam_name === filters.examName);
    } else {
        const latest = [...resultsRaw].sort((a, b) => new Date(b.scraped_at || 0) - new Date(a.scraped_at || 0))[0];
        resolvedExamName = latest?.exam_name || null;
        matchingResults = resolvedExamName ? resultsRaw.filter(r => r.exam_name === resolvedExamName) : resultsRaw;
    }

    if (matchingResults.length === 0) {
        return {
            ...emptyDataset(scopedClasses, filters, meta, 'NO_RESULTS_FOR_SELECTION'),
            resolvedExamName,
            resolvedExamSessionId,
        };
    }

    const resultByUsn = {};
    for (const r of matchingResults) resultByUsn[r.usn] = r;

    const resultIds = matchingResults.map(r => r.id);
    const subjectMarks = await fetchByColumnIn(client, 'subject_marks', '*', 'result_id', resultIds);

    return {
        classes: scopedClasses,
        classStudents,
        students,
        studentByUsn,
        resultsRaw,
        matchingResults,
        resultByUsn,
        subjectMarks,
        resolvedExamName,
        resolvedExamSessionId,
        emptyReason: null,
        meta,
    };
}

function emptyDataset(classes, filters, meta, reason) {
    return {
        classes,
        classStudents: [],
        students: [],
        studentByUsn: {},
        resultsRaw: [],
        matchingResults: [],
        resultByUsn: {},
        subjectMarks: [],
        resolvedExamName: filters.examName || null,
        resolvedExamSessionId: filters.examSessionId || null,
        emptyReason: reason,
        meta,
    };
}

/** usn -> the (first) class row it's enrolled in, from classes + class_students. */
export function buildUsnToClassMap(classes, classStudents) {
    const classById = {};
    for (const c of classes) classById[c.id] = c;
    const map = {};
    for (const cs of classStudents) {
        if (!map[cs.usn] && classById[cs.class_id]) map[cs.usn] = classById[cs.class_id];
    }
    return map;
}
