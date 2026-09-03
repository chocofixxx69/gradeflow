import { NextResponse } from 'next/server';
import { requireStaff } from '../../../../../lib/server-session';
import { getAdminClient, loadResultAnalysisDataset, parseFilters, rankBy } from '../../../../../lib/analytics-data';
import { normalizeSubjectResult } from '../../../../../lib/vtuAcademicEngine';

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

/**
 * GET /api/admin/analytics/leaderboard
 *
 * Class Leaderboard & Toppers — overall CGPA, per-semester SGPA, and
 * per-subject marks rankings. Shared by faculty and admin (both roles hit
 * this one route, same as /api/admin/analytics/rankings already does) and
 * built on loadResultAnalysisDataset / calculateAcademicRecord — the same
 * canonical engine every other admin analytics page and the student-facing
 * /api/student/leaderboard already use. That shared foundation is what
 * keeps the numbers here from ever diverging from what a student sees on
 * their own dashboard, and it's also what gives faculty correct scoping for
 * free: loadResultAnalysisDataset already restricts role:'faculty' callers
 * to students in their own assigned classes; admin sees everything the
 * filters allow.
 *
 * Cohort filters (?branch=&academicYear=&examSession=&classId=&section=) are
 * the same 6-key contract every other /api/admin/analytics/* route uses
 * (parseFilters). `semester` is deliberately excluded from that contract
 * here — reusing it would shrink the cohort to only students whose
 * *current* class semester matches, when the semester tab actually needs
 * "this same cohort's SGPA back in semester N". That's the separate
 * ?viewSemester= param below, which only selects which slice to rank by,
 * same idea for ?subjectCode= on the subject tab.
 */
export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const filters = parseFilters(searchParams);
        delete filters.semester; // see doc comment above — not a cohort filter here
        const viewSemesterParam = searchParams.get('viewSemester') ? Number(searchParams.get('viewSemester')) : null;
        const subjectCodeParam = searchParams.get('subjectCode') || null;

        const supabaseAdmin = getAdminClient();

        // Every section this caller could pick — a faculty's own assigned
        // classes only, or every class for admin — computed independently of
        // whatever `section` filter is currently applied, so switching
        // sections never collapses the dropdown down to just the one already
        // selected. Scoped by faculty_id at the query level (not filtered
        // client-side after the fact), so a faculty member never even sees a
        // section they don't teach as an option.
        let sectionQuery = supabaseAdmin.from('classes').select('branch, section');
        if (session.role === 'faculty') {
            sectionQuery = sectionQuery.eq('faculty_id', session.sub);
        }

        const [dataset, { data: myClasses }] = await Promise.all([
            loadResultAnalysisDataset(supabaseAdmin, { role: session.role, facultyId: session.sub, filters }),
            sectionQuery,
        ]);

        const sectionSet = new Set();
        (myClasses || []).forEach(c => {
            const matchesBranch = !filters.branch || (c.branch || '').toUpperCase().includes(String(filters.branch).toUpperCase());
            if (matchesBranch && c.section) sectionSet.add(c.section);
        });
        const availableSections = Array.from(sectionSet).sort();

        const { students, recordsByUsn, subjectMarks, catalogIndex } = dataset;

        if (students.length === 0) {
            return ok({
                totalStudents: 0, regularCount: 0, lateralCount: 0,
                targetSemester: null, availableSections,
                overallLeaderboard: [], availableSemesters: [], allSemestersLeaderboard: {},
                availableSubjects: [], subjectLeaderboard: [], currentSubject: null,
            });
        }

        const studentMap = Object.fromEntries(students.map(s => [s.usn, s]));
        const isLateralByUsn = {};
        let regularCount = 0, lateralCount = 0;
        for (const s of students) {
            const isLateral = !!s.lateral_entry;
            isLateralByUsn[s.usn] = isLateral;
            if (isLateral) lateralCount++; else regularCount++;
        }

        // ── Overall CGPA leaderboard ──
        const overallRows = students.map(s => {
            const rec = recordsByUsn[s.usn];
            return {
                usn: s.usn, name: s.name || s.usn, branch: s.branch,
                isLateral: isLateralByUsn[s.usn],
                cgpa: rec ? rec.cgpa : 0,
                earnedCredits: rec ? rec.totalEarnedCredits : 0,
                semestersTracked: rec ? rec.semestersTracked : 0,
                totalBacklogs: rec ? rec.totalActiveBacklogs : 0,
            };
        });
        const overallLeaderboard = rankBy(overallRows, r => r.cgpa, { tieBreakKey: r => r.usn });

        // ── Per-semester SGPA leaderboards ──
        const semSet = new Set();
        for (const s of students) {
            const rec = recordsByUsn[s.usn];
            if (rec) Object.keys(rec.semStats).forEach(sem => semSet.add(Number(sem)));
        }
        const availableSemesters = Array.from(semSet).sort((a, b) => a - b);

        const allSemestersLeaderboard = {};
        for (const sem of availableSemesters) {
            const rows = students.map(s => {
                const rec = recordsByUsn[s.usn];
                const stat = rec?.semStats?.[sem];
                const hasAppeared = !!(stat && (stat.totalCredits > 0 || stat.sgpa > 0));
                return {
                    usn: s.usn, name: s.name || s.usn, branch: s.branch,
                    isLateral: isLateralByUsn[s.usn],
                    sgpa: hasAppeared ? stat.sgpa : null,
                    credits: hasAppeared ? stat.totalCredits : 0,
                    hasAppeared,
                };
            });
            const appeared = rankBy(rows.filter(r => r.hasAppeared), r => r.sgpa, { tieBreakKey: r => r.usn });
            const notAppeared = rows.filter(r => !r.hasAppeared)
                .sort((a, b) => a.usn.localeCompare(b.usn))
                .map(r => ({ ...r, rank: '—' }));
            allSemestersLeaderboard[sem] = [...appeared, ...notAppeared];
        }

        const targetSem = (viewSemesterParam && availableSemesters.includes(viewSemesterParam))
            ? viewSemesterParam
            : (availableSemesters[availableSemesters.length - 1] || null);

        // ── Subject-wise leaderboard: best attempt per student, deduped by code ──
        const subjectGroups = {};
        const subjectSemCounts = {};
        const subjectNames = {};
        for (const m of subjectMarks) {
            if (!studentMap[m.usn]) continue; // outside the current cohort scope
            const code = (m.subject_code || '').trim().toUpperCase();
            if (!code) continue;
            const semNum = Number(m.semester) || 1;

            (subjectSemCounts[code] ||= {});
            subjectSemCounts[code][semNum] = (subjectSemCounts[code][semNum] || 0) + 1;
            if (m.subject_name && m.subject_name.trim().length > (subjectNames[code]?.length || 0)) {
                subjectNames[code] = m.subject_name.trim();
            }

            const stu = studentMap[m.usn];
            const norm = normalizeSubjectResult(m, stu?.scheme || '2022', stu?.branch, semNum, catalogIndex);
            const entry = {
                usn: m.usn, name: stu?.name || m.usn, isLateral: isLateralByUsn[m.usn] || false,
                internal: norm.cie_marks ?? Number(m.internal) ?? 0,
                external: norm.seeMarks ?? Number(m.external) ?? 0,
                total: norm.totalMarks ?? Number(m.total) ?? 0,
                grade: norm.grade, passed: norm.isPassed,
            };

            (subjectGroups[code] ||= {});
            const existing = subjectGroups[code][m.usn];
            if (!existing) {
                subjectGroups[code][m.usn] = entry;
            } else {
                const existingPassed = existing.passed ? 1 : 0;
                const newPassed = entry.passed ? 1 : 0;
                if (newPassed > existingPassed || (newPassed === existingPassed && entry.total > existing.total)) {
                    subjectGroups[code][m.usn] = entry;
                }
            }
        }

        const availableSubjects = Object.entries(subjectGroups).map(([code, byUsn]) => {
            const semCounts = subjectSemCounts[code] || {};
            const semKeys = Object.keys(semCounts);
            const dominantSem = semKeys.length
                ? Number(semKeys.reduce((a, b) => semCounts[a] > semCounts[b] ? a : b))
                : 1;
            return {
                subject_code: code,
                subject_name: subjectNames[code] || code,
                semester: dominantSem,
                enrolledCount: Object.keys(byUsn).length,
            };
        }).sort((a, b) => (a.semester - b.semester) || a.subject_code.localeCompare(b.subject_code));

        const targetSubjectCode = subjectCodeParam
            ? subjectCodeParam.toUpperCase().trim()
            : (availableSubjects.find(s => s.semester === targetSem)?.subject_code || availableSubjects[0]?.subject_code || null);

        let subjectLeaderboard = [];
        let currentSubject = null;
        if (targetSubjectCode && subjectGroups[targetSubjectCode]) {
            const list = Object.values(subjectGroups[targetSubjectCode]);
            subjectLeaderboard = rankBy(list, s => s.total, { tieBreakKey: s => s.usn });
            const subInfo = availableSubjects.find(s => s.subject_code === targetSubjectCode);
            currentSubject = subInfo ? { ...subInfo, totalStudents: list.length } : null;
        }

        return ok({
            totalStudents: students.length,
            regularCount,
            lateralCount,
            targetSemester: targetSem,
            availableSections,
            overallLeaderboard,
            availableSemesters,
            allSemestersLeaderboard,
            availableSubjects,
            subjectLeaderboard,
            currentSubject,
        });
    } catch (err) {
        console.error('[GET /api/admin/analytics/leaderboard]', err);
        return fail(err.message || 'Failed to generate leaderboard.', 'LEADERBOARD_ERROR', 500);
    }
}
