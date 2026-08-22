// Shared HTTP plumbing for the Result Analysis API routes — keeps every route
// file a thin wrapper: parse filters, call one service, return the envelope.

import { NextResponse } from 'next/server';
export { getAdminClient } from '../../analytics-data';

export function ok(data) {
    return NextResponse.json({ success: true, data });
}

export function fail(message, code, status = 400, details = {}) {
    return NextResponse.json({ success: false, error: { code, message, details } }, { status });
}

/** Reads the common academic-hierarchy filters from a URL's search params. */
export function parseFilters(searchParams) {
    const filters = {};
    const academicYear = searchParams.get('academicYear');
    const examSessionId = searchParams.get('examSessionId');
    const examName = searchParams.get('examName');
    const branch = searchParams.get('branch');
    const semester = searchParams.get('semester');
    const classId = searchParams.get('classId');
    const section = searchParams.get('section');

    if (academicYear) filters.academicYear = academicYear;
    if (examSessionId) filters.examSessionId = examSessionId;
    if (examName) filters.examName = examName;
    if (branch) filters.branch = branch;
    if (semester) filters.semester = semester;
    if (classId) filters.classId = classId;
    if (section) filters.section = section;

    return filters;
}
