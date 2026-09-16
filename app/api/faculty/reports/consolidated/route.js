import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, findFacultyAssignment } from '@/lib/analytics-data';
import { matchesBatch, matchesBranch } from '@/lib/semester-utils';
import { branchLabelFor, canonicalBranch } from '@/lib/vtu-identity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const rawBranch = searchParams.get('branch') || 'ALL';
        const branch = rawBranch && rawBranch !== 'ALL' ? rawBranch.toUpperCase().trim() : null;
        const rawBatch = searchParams.get('batch') || '2023';
        const batch = rawBatch && rawBatch !== 'ALL' ? rawBatch.trim() : null;
        const rawSemester = searchParams.get('semester') || '7';
        const semester = rawSemester && rawSemester !== 'ALL' && rawSemester !== 'all' ? parseInt(rawSemester, 10) : null;
        const rawSection = searchParams.get('section') || 'ALL';
        const section = rawSection && rawSection !== 'ALL' ? rawSection.toUpperCase().trim() : null;

        const supabaseAdmin = getAdminClient();

        // Load complete dataset using shared warehouse
        const dataset = await loadResultAnalysisDataset(supabaseAdmin, {
            role: session.role,
            facultyId: session.sub,
            filters: {
                branch,
                batch,
                semester,
                section
            }
        });

        // 1. Resolve scoped students
        let scopedStudents = (dataset.students || []).map(s => ({
            usn: s.usn,
            name: s.name || s.usn,
            branch: s.branch || branch || 'CS',
            year: s.year,
            batch: s.batch || batch,
            lateral_entry: s.lateral_entry,
            scheme: s.scheme
        }));

        if (scopedStudents.length === 0) {
            // Fallback to all students matching batch and branch directly
            scopedStudents = (dataset.allStudents || []).filter(s => {
                if (branch && !matchesBranch(s, branch)) return false;
                if (batch && !matchesBatch(s.usn, batch, s.year, s.lateral_entry)) return false;
                return true;
            }).map(s => ({
                usn: s.usn,
                name: s.name || s.usn,
                branch: s.branch || branch || 'CS',
                year: s.year,
                batch: s.batch || batch,
                lateral_entry: s.lateral_entry,
                scheme: s.scheme
            }));
        }

        const studentUsns = new Set(scopedStudents.map(s => s.usn));

        // 2. Fetch or filter subject marks for these students
        let marks = (dataset.subjectMarks || []).filter(m => studentUsns.has(m.usn));
        if (semester) {
            marks = marks.filter(m => Number(m.semester) === Number(semester));
        }

        // If dataset.subjectMarks was filtered or empty, query directly from subject_marks
        if (marks.length === 0 && scopedStudents.length > 0) {
            const usnList = Array.from(studentUsns);
            let q = supabaseAdmin
                .from('subject_marks')
                .select('usn, semester, subject_code, subject_name, internal, external, total, grade, credits, passed')
                .in('usn', usnList.slice(0, 500));
            if (semester) q = q.eq('semester', semester);
            const { data: directMarks } = await q;
            if (directMarks && directMarks.length > 0) {
                marks = directMarks;
            }
        }

        // 3. Derive unique subjects from marks and catalog
        const subjectCodeSet = new Set(marks.map(m => (m.subject_code || '').toUpperCase().trim()).filter(Boolean));
        const subjectsList = [];
        const subjectMap = new Map();

        marks.forEach(m => {
            const code = (m.subject_code || '').toUpperCase().trim();
            if (!code || subjectMap.has(code)) return;
            const subObj = {
                code,
                name: m.subject_name || code,
                credits: Number(m.credits) || 3
            };
            subjectMap.set(code, subObj);
            subjectsList.push(subObj);
        });

        subjectsList.sort((a, b) => a.code.localeCompare(b.code));

        // 4. Map faculty assignments to subjects
        const facultyMap = {};
        (subjectsList || []).forEach(sub => {
            const code = sub.code;
            const assignment = findFacultyAssignment(dataset.facultyAssignments, {
                subjectCode: code,
                branch: branch || 'CS',
                semester: semester || 7
            });
            if (assignment && assignment.faculty_id) {
                const fac = dataset.facultyById[assignment.faculty_id];
                if (fac && fac.full_name) {
                    facultyMap[code] = fac.full_name;
                }
            }
        });

        // 5. Construct selectedClass object and institution info
        const displayBranch = branch ? branchLabelFor(branch) : 'Computer Science & Engineering';
        const sectionLabel = section ? `Section ${section}` : 'All Sections';
        const semLabel = semester ? `Sem ${semester}` : 'All Semesters (Sem 1-7)';
        const className = `${branch || 'CSE'} - Batch ${batch || '2023'} (${semLabel}, ${sectionLabel})`;

        const selectedClass = {
            id: `class-${batch || '2023'}-${branch || 'CS'}-${semester || 'all'}-${section || 'ALL'}`,
            name: className,
            branch: branch || 'CS',
            semester: semester || 7,
            section: section || 'ALL',
            batch: batch || '2023',
            academic_year: '2025-2026'
        };

        const institutionInfo = {
            collegeName: 'Anjuman Institute of Technology and Management',
            department: `Department of ${displayBranch}`,
            address: '(Anjumanabad, Bhatkal - 581320)',
            batch: batch ? `${batch} Batch` : '2023 Batch',
            academicYear: '2025-2026',
            section: sectionLabel
        };

        return ok({
            selectedClass,
            students: scopedStudents,
            allMarks: marks,
            subjects: subjectsList,
            facultyMap,
            targetSemester: semester,
            institutionInfo,
            stats: {
                studentCount: scopedStudents.length,
                marksCount: marks.length,
                subjectCount: subjectsList.length
            }
        });
    } catch (err) {
        console.error('[GET /api/faculty/reports/consolidated]', err);
        return fail('Failed to compile consolidated report: ' + (err.message || err), 'CONSOLIDATED_REPORT_ERROR', 500);
    }
}
