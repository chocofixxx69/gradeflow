import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import { fetchByChunks } from '../../../../lib/supabase-utils';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

// Cohort resolver mapping branch codes and batches including lateral entries
function resolveCohortConfig(batchOrBranch, currentUsn) {
    let key = (batchOrBranch || '').toUpperCase().trim();

    // Auto-detect from current user USN if not explicitly requested
    if (!key && currentUsn) {
        if (currentUsn.includes('CS')) key = 'CS';
        else if (currentUsn.includes('CD') || currentUsn.includes('DS')) key = 'CD';
        else if (currentUsn.includes('CI')) key = 'CI';
        else if (currentUsn.includes('CV')) key = 'CV';
        else {
            const match = currentUsn.match(/^([0-9][A-Z]{2}[0-9]{2}[A-Z]{2,3})/);
            key = match ? match[1] : currentUsn.slice(0, 7);
        }
    }

    if (key === 'CS' || key === '2AB23CS' || key === '2AB24CS') {
        return {
            branch: 'CS',
            code: 'CS',
            name: 'Computer Science & Engineering',
            patterns: ['2AB23CS%', '2AB24CS%']
        };
    }
    if (key === 'CD' || key === 'DS' || key === '2AB23CD' || key === '2AB24CD') {
        return {
            branch: 'CD',
            code: 'CD',
            name: 'Computer Science (Data Science)',
            patterns: ['2AB23CD%', '2AB24CD%']
        };
    }
    if (key === 'CI' || key === '2AB23CI' || key === '2AB24CI') {
        return {
            branch: 'CI',
            code: 'CI',
            name: 'Computer Science (AI & Design)',
            patterns: ['2AB23CI%', '2AB24CI%']
        };
    }
    if (key === 'CV' || key === '2AB23CV') {
        return {
            branch: 'CV',
            code: 'CV',
            name: 'Civil Engineering',
            patterns: ['2AB23CV%']
        };
    }

    // Default fallback
    return {
        branch: key,
        code: key,
        name: `Cohort ${key}`,
        patterns: [`${key}%`]
    };
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStudent(req);
        if (authError) return authError;

        const currentUsn = session.usn?.toUpperCase().trim();
        const { searchParams } = new URL(req.url);

        const requestedBatch = searchParams.get('batch');
        const cohortConfig = resolveCohortConfig(requestedBatch, currentUsn);
        const selectedSem = parseInt(searchParams.get('semester')) || null;
        const selectedSubject = searchParams.get('subject_code') || null;

        // 1. Fetch all students matching any of the cohort USN patterns
        const { data: allStudents, error: stuErr } = await supabaseAdmin
            .from('students')
            .select('id, usn, name, branch, scheme, semester, lateral_entry')
            .order('usn', { ascending: true });

        if (stuErr) throw stuErr;

        const students = (allStudents || []).filter(s => {
            return cohortConfig.patterns.some(p => {
                const prefix = p.replace('%', '');
                return s.usn.startsWith(prefix);
            });
        });

        const studentUsns = students.map(s => s.usn);
        const studentMap = Object.fromEntries(students.map(s => [s.usn, s]));

        if (studentUsns.length === 0) {
            return ok({
                batch: cohortConfig.code,
                batchName: cohortConfig.name,
                totalStudents: 0,
                regularCount: 0,
                lateralCount: 0,
                overallLeaderboard: [],
                semesterLeaderboard: [],
                subjectLeaderboard: [],
                availableSemesters: [],
                availableSubjects: [],
                currentUser: { usn: currentUsn, rank: null }
            });
        }

        // 2. Fetch all results, remarks, and subject_marks for these students using chunked fetching
        const [
            allResults,
            allRemarks,
            allMarks
        ] = await Promise.all([
            fetchByChunks('results', 'usn, semester, sgpa, total_credits', 'usn', studentUsns, supabaseAdmin),
            fetchByChunks('academic_remarks', 'student_usn, semester, sgpa, backlog_count, is_all_clear', 'student_usn', studentUsns, supabaseAdmin),
            fetchByChunks('subject_marks', 'usn, semester, subject_code, subject_name, internal, external, total, grade, credits, passed, is_backlog', 'usn', studentUsns, supabaseAdmin)
        ]);

        // 3. Build student performance matrix
        const GRADE_POINTS = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'P': 4, 'F': 0 };
        function scoreToGradePoint(score, grade) {
            if (grade && GRADE_POINTS[grade.toUpperCase()] !== undefined && grade.toUpperCase() !== 'P') {
                return GRADE_POINTS[grade.toUpperCase()];
            }
            const s = Number(score) || 0;
            if (s >= 90) return 10;
            if (s >= 80) return 9;
            if (s >= 70) return 8;
            if (s >= 60) return 7;
            if (s >= 50) return 6;
            if (s >= 40) return 4;
            return 0;
        }

        let regularCount = 0;
        let lateralCount = 0;

        const studentStats = {};
        students.forEach(s => {
            const isLateral = s.lateral_entry === true || /[0-9][A-Z]{2}[0-9]{2}[A-Z]{2,3}4[0-9]{2}/.test(s.usn);
            if (isLateral) lateralCount++; else regularCount++;

            studentStats[s.usn] = {
                usn: s.usn,
                name: s.name || s.usn,
                branch: s.branch,
                scheme: s.scheme,
                isLateral,
                semesters: {},
                totalBacklogs: 0,
                isCurrentUser: s.usn === currentUsn
            };
        });

        const semSet = new Set();
        const userMarksBySem = {};
        (allMarks || []).forEach(m => {
            const semNum = Number(m.semester);
            if (semNum > 0) semSet.add(semNum);
            const key = `${m.usn}_${semNum}`;
            if (!userMarksBySem[key]) userMarksBySem[key] = [];
            userMarksBySem[key].push(m);
        });

        (allResults || []).forEach(r => {
            const s = studentStats[r.usn];
            if (!s) return;
            const semNum = Number(r.semester);
            if (semNum > 0) semSet.add(semNum);

            if (!s.semesters[semNum] || Number(r.sgpa) > (s.semesters[semNum].sgpa || 0)) {
                s.semesters[semNum] = {
                    semester: semNum,
                    sgpa: Number(r.sgpa) || 0,
                    credits: Number(r.total_credits) || 20
                };
            }
        });

        // Dynamic SGPA calculation for any student missing results slip
        Object.entries(userMarksBySem).forEach(([key, marks]) => {
            const [usn, semStr] = key.split('_');
            const semNum = Number(semStr);
            const s = studentStats[usn];
            if (!s) return;

            if (!s.semesters[semNum] || s.semesters[semNum].sgpa === 0) {
                let earnedPoints = 0;
                let totalCr = 0;
                marks.forEach(m => {
                    const cr = Number(m.credits) || 3;
                    const gp = scoreToGradePoint(m.total, m.grade);
                    earnedPoints += (gp * cr);
                    totalCr += cr;
                });
                const calcSGPA = totalCr > 0 ? Number((earnedPoints / totalCr).toFixed(2)) : 0;
                s.semesters[semNum] = {
                    semester: semNum,
                    sgpa: calcSGPA,
                    credits: totalCr
                };
            }
        });

        (allRemarks || []).forEach(rm => {
            const s = studentStats[rm.student_usn];
            if (!s) return;
            s.totalBacklogs += (Number(rm.backlog_count) || 0);
        });

        // 4. Calculate Overall CGPA Leaderboard for ALL students in the class
        const overallList = Object.values(studentStats).map(s => {
            let totalCredits = 0;
            let weightedPoints = 0;
            let semCount = 0;

            Object.values(s.semesters).forEach(sem => {
                if (sem.sgpa > 0) {
                    const cr = sem.credits || 20;
                    totalCredits += cr;
                    weightedPoints += (sem.sgpa * cr);
                    semCount++;
                }
            });

            const cgpa = totalCredits > 0 ? Number((weightedPoints / totalCredits).toFixed(2)) : 0;

            return {
                usn: s.usn,
                name: s.name,
                branch: s.branch,
                isLateral: s.isLateral,
                cgpa,
                semestersTracked: semCount,
                totalBacklogs: s.totalBacklogs,
                isCurrentUser: s.isCurrentUser
            };
        });

        // Sort descending by CGPA, then fewest backlogs, then USN
        overallList.sort((a, b) => {
            if (b.cgpa !== a.cgpa) return b.cgpa - a.cgpa;
            if (a.totalBacklogs !== b.totalBacklogs) return a.totalBacklogs - b.totalBacklogs;
            return a.usn.localeCompare(b.usn);
        });

        overallList.forEach((item, index) => {
            item.rank = index + 1;
        });

        // 5. Available semesters sorted
        const availableSemesters = Array.from(semSet).sort((a, b) => a - b);
        const targetSem = selectedSem || (availableSemesters.length > 0 ? availableSemesters[availableSemesters.length - 1] : 6);

        // 6. Semester-Wise SGPA Leaderboard for target semester
        const semesterList = Object.values(studentStats)
            .filter(s => s.semesters[targetSem] && s.semesters[targetSem].sgpa > 0)
            .map(s => ({
                usn: s.usn,
                name: s.name,
                isLateral: s.isLateral,
                semester: targetSem,
                sgpa: s.semesters[targetSem].sgpa,
                credits: s.semesters[targetSem].credits,
                isCurrentUser: s.isCurrentUser
            }));

        semesterList.sort((a, b) => {
            if (b.sgpa !== a.sgpa) return b.sgpa - a.sgpa;
            return a.usn.localeCompare(b.usn);
        });

        semesterList.forEach((item, index) => {
            item.rank = index + 1;
        });

        // 7. Subject-Wise Toppers & Subject Leaderboard
        const subjectGroups = {};
        (allMarks || []).forEach(m => {
            const semNum = Number(m.semester);
            const code = (m.subject_code || '').trim().toUpperCase();
            if (!code) return;

            if (!subjectGroups[code]) {
                subjectGroups[code] = {
                    subject_code: code,
                    subject_name: m.subject_name || code,
                    semester: semNum,
                    students: []
                };
            }

            subjectGroups[code].students.push({
                usn: m.usn,
                name: studentMap[m.usn]?.name || m.usn,
                isLateral: studentStats[m.usn]?.isLateral || false,
                internal: Number(m.internal) || 0,
                external: Number(m.external) || 0,
                total: Number(m.total) || 0,
                grade: m.grade || '—',
                passed: m.passed !== false,
                isCurrentUser: m.usn === currentUsn
            });
        });

        // Build list of all available subjects in this cohort
        const availableSubjects = Object.values(subjectGroups).map(sg => ({
            subject_code: sg.subject_code,
            subject_name: sg.subject_name,
            semester: sg.semester,
            enrolledCount: sg.students.length
        })).sort((a, b) => (a.semester - b.semester) || a.subject_code.localeCompare(b.subject_code));

        // Selected subject ranking or default to first subject in target semester
        const targetSubjectCode = selectedSubject
            ? selectedSubject.toUpperCase().trim()
            : availableSubjects.find(s => s.semester === targetSem)?.subject_code || availableSubjects[0]?.subject_code;

        let subjectLeaderboard = [];
        let currentSubjectInfo = null;

        if (targetSubjectCode && subjectGroups[targetSubjectCode]) {
            const group = subjectGroups[targetSubjectCode];
            currentSubjectInfo = {
                subject_code: group.subject_code,
                subject_name: group.subject_name,
                semester: group.semester,
                totalStudents: group.students.length
            };

            const sortedScores = [...group.students].sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;
                if (b.external !== a.external) return b.external - a.external;
                return a.usn.localeCompare(b.usn);
            });

            sortedScores.forEach((s, idx) => {
                s.rank = idx + 1;
            });

            subjectLeaderboard = sortedScores;
        }

        // Find current user's ranks
        const currentUserOverall = overallList.find(s => s.isCurrentUser);
        const currentUserSem = semesterList.find(s => s.isCurrentUser);
        const currentUserSub = subjectLeaderboard.find(s => s.isCurrentUser);

        return ok({
            batch: cohortConfig.code,
            batchName: cohortConfig.name,
            totalStudents: students.length,
            regularCount,
            lateralCount,
            targetSemester: targetSem,
            availableSemesters,
            availableSubjects,
            currentSubject: currentSubjectInfo,
            currentUser: {
                usn: currentUsn,
                name: studentMap[currentUsn]?.name || currentUsn,
                isLateral: currentUserOverall?.isLateral || false,
                overallRank: currentUserOverall?.rank || null,
                overallCGPA: currentUserOverall?.cgpa || null,
                semesterRank: currentUserSem?.rank || null,
                semesterSGPA: currentUserSem?.sgpa || null,
                subjectRank: currentUserSub?.rank || null,
                subjectTotal: currentUserSub?.total || null,
            },
            overallLeaderboard: overallList,
            semesterLeaderboard: semesterList,
            subjectLeaderboard
        });
    } catch (err) {
        console.error('[GET /api/student/leaderboard]', err);
        return fail(err.message || 'Failed to generate class leaderboard.', 'LEADERBOARD_ERROR', 500);
    }
}
