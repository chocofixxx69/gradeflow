import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import { fetchAllPaginated, fetchByChunks } from '../../../../lib/supabase-utils';
import { calculateAcademicRecord, normalizeSubjectResult } from '../../../../lib/vtuAcademicEngine';
import { fetchCatalogIndex } from '../../../../lib/subjectCreditResolver';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

// In-memory module-level cache with 60s TTL for blazing fast responses
const cohortCache = new Map();
const CACHE_TTL_MS = 60 * 1000;

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

function resolveSubjectCredits(sm) {
    if (sm && sm.credits !== undefined && sm.credits !== null && !isNaN(Number(sm.credits))) {
        return Number(sm.credits);
    }
    const code = (sm?.subject_code || '').toUpperCase();
    if (code.startsWith('BIKS') || code.startsWith('BPEK') || code.startsWith('BNSK') || code.startsWith('BYOK') || code.includes('AUDIT') || code.includes('NON-CREDIT')) {
        return 0;
    }
    return 3;
}

// Cohort resolver mapping branch codes and batches including lateral entries
function resolveCohortConfig(batchOrBranch, currentUsn) {
    let key = (batchOrBranch || '').toUpperCase().trim();

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

    return {
        branch: key,
        code: key,
        name: `Cohort ${key}`,
        patterns: [`${key}%`]
    };
}

async function getOrComputeCohortData(cohortConfig) {
    const cacheKey = cohortConfig.code;
    const now = Date.now();
    const cached = cohortCache.get(cacheKey);

    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
    }

    // 1. Fetch students for this cohort
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
        const emptyResult = {
            students: [],
            studentMap: {},
            regularCount: 0,
            lateralCount: 0,
            overallLeaderboard: [],
            allSemestersLeaderboard: {},
            availableSemesters: [],
            availableSubjects: [],
            subjectGroups: {},
            studentRecords: {}
        };
        cohortCache.set(cacheKey, { timestamp: now, data: emptyResult });
        return emptyResult;
    }

    // 2. Fetch subject_marks and subject_catalog in parallel
    const [allMarks, catalogIndex] = await Promise.all([
        fetchByChunks('subject_marks', 'id, usn, semester, subject_code, subject_name, internal, external, total, grade, credits, passed, is_backlog', 'usn', studentUsns, supabaseAdmin),
        fetchCatalogIndex(supabaseAdmin)
    ]);

    // Group marks by USN
    const marksByUsn = {};
    const semSet = new Set();
    (allMarks || []).forEach(m => {
        if (!marksByUsn[m.usn]) marksByUsn[m.usn] = [];
        marksByUsn[m.usn].push(m);
        const sNum = Number(m.semester);
        if (sNum > 0) semSet.add(sNum);
    });

    let regularCount = 0;
    let lateralCount = 0;

    // 3. Compute canonical academic records for each student
    const studentRecords = {};
    for (const s of students) {
        const isLateral = s.lateral_entry === true || /[0-9][A-Z]{2}[0-9]{2}[A-Z]{2,3}4[0-9]{2}/.test(s.usn);
        if (isLateral) lateralCount++; else regularCount++;

        const sMarks = marksByUsn[s.usn] || [];
        const rec = await calculateAcademicRecord(sMarks, {
            usn: s.usn,
            name: s.name,
            branch: s.branch || cohortConfig.branch,
            scheme: s.scheme || '2022',
            isLateral
        }, { catalogIndex });

        studentRecords[s.usn] = {
            ...rec,
            isLateral
        };
    }

    const availableSemesters = Array.from(semSet).sort((a, b) => a - b);

    // 4. Overall Class Leaderboard (CGPA)
    const overallLeaderboard = students.map(s => {
        const rec = studentRecords[s.usn];
        return {
            usn: s.usn,
            name: s.name || s.usn,
            branch: s.branch,
            isLateral: rec?.isLateral || false,
            cgpa: rec ? rec.cgpa : 0,
            earnedCredits: rec ? rec.totalEarnedCredits : 0,
            regCredits: rec ? rec.totalRegisteredCredits : 0,
            semestersTracked: rec ? rec.semestersTracked : 0,
            totalBacklogs: rec ? rec.totalActiveBacklogs : 0
        };
    });

    overallLeaderboard.sort((a, b) => {
        if (b.cgpa !== a.cgpa) return b.cgpa - a.cgpa;
        if (a.totalBacklogs !== b.totalBacklogs) return a.totalBacklogs - b.totalBacklogs;
        if (b.earnedCredits !== a.earnedCredits) return b.earnedCredits - a.earnedCredits;
        return a.usn.localeCompare(b.usn);
    });

    overallLeaderboard.forEach((item, idx) => {
        item.rank = idx + 1;
    });

    // 5. Precompute All Semester SGPA Leaderboards
    const allSemestersLeaderboard = {};
    for (const sem of availableSemesters) {
        const list = students.map(s => {
            const rec = studentRecords[s.usn];
            const semStat = rec?.semStats?.[sem];
            const hasAppeared = !!(semStat && (semStat.totalCredits > 0 || semStat.sgpa > 0));
            const isLateralExempt = rec?.isLateral && sem < 3;

            let statusText = 'Appeared';
            if (!hasAppeared) {
                statusText = isLateralExempt ? 'Lateral Entry (Joined Sem 3)' : 'Not Registered / Discontinued';
            }

            return {
                usn: s.usn,
                name: s.name || s.usn,
                branch: s.branch,
                isLateral: rec?.isLateral || false,
                semester: sem,
                sgpa: hasAppeared ? semStat.sgpa : null,
                credits: hasAppeared ? semStat.totalCredits : 0,
                earnedCredits: hasAppeared ? semStat.earnedCredits : 0,
                hasAppeared,
                statusText
            };
        });

        list.sort((a, b) => {
            if (a.hasAppeared && !b.hasAppeared) return -1;
            if (!a.hasAppeared && b.hasAppeared) return 1;
            if (a.hasAppeared && b.hasAppeared) {
                if (b.sgpa !== a.sgpa) return b.sgpa - a.sgpa;
                if (b.earnedCredits !== a.earnedCredits) return b.earnedCredits - a.earnedCredits;
            }
            return a.usn.localeCompare(b.usn);
        });

        let rankCount = 1;
        list.forEach(item => {
            if (item.hasAppeared) {
                item.rank = rankCount++;
            } else {
                item.rank = '—';
            }
        });

        allSemestersLeaderboard[sem] = list;
    }

    // 6. Precompute Subject-Wise Groups with Canonical Grading & Deduplication
    const subjectGroups = {};
    const subjectSemCounts = {};
    const subjectCanonicalNames = {};

    (allMarks || []).forEach(m => {
        const semNum = Number(m.semester) || 1;
        const code = (m.subject_code || '').trim().toUpperCase();
        if (!code) return;

        if (!subjectSemCounts[code]) subjectSemCounts[code] = {};
        subjectSemCounts[code][semNum] = (subjectSemCounts[code][semNum] || 0) + 1;

        if (m.subject_name && m.subject_name.trim().length > (subjectCanonicalNames[code]?.length || 0)) {
            subjectCanonicalNames[code] = m.subject_name.trim();
        }

        if (!subjectGroups[code]) {
            subjectGroups[code] = {
                subject_code: code,
                studentsByUsn: {}
            };
        }

        const norm = normalizeSubjectResult(m, '2022', cohortConfig.branch, semNum);
        const internal = norm.cie_marks ?? Number(m.internal) ?? 0;
        const external = norm.seeMarks ?? Number(m.external) ?? 0;
        const total = norm.totalMarks ?? Number(m.total) ?? (internal + external);

        const studentEntry = {
            usn: m.usn,
            name: studentMap[m.usn]?.name || m.usn,
            isLateral: studentRecords[m.usn]?.isLateral || false,
            internal,
            external,
            total,
            grade: norm.grade,
            gradePoint: norm.gradePoint,
            passed: norm.isPassed
        };

        const existing = subjectGroups[code].studentsByUsn[m.usn];
        if (!existing) {
            subjectGroups[code].studentsByUsn[m.usn] = studentEntry;
        } else {
            const existingPassed = existing.passed ? 1 : 0;
            const newPassed = studentEntry.passed ? 1 : 0;
            if (newPassed > existingPassed) {
                subjectGroups[code].studentsByUsn[m.usn] = studentEntry;
            } else if (newPassed === existingPassed) {
                if (studentEntry.total > existing.total) {
                    subjectGroups[code].studentsByUsn[m.usn] = studentEntry;
                } else if (studentEntry.total === existing.total && studentEntry.external > existing.external) {
                    subjectGroups[code].studentsByUsn[m.usn] = studentEntry;
                }
            }
        }
    });

    const availableSubjects = Object.entries(subjectGroups).map(([code, group]) => {
        const semCounts = subjectSemCounts[code] || {};
        const dominantSem = Number(Object.keys(semCounts).reduce((a, b) => semCounts[a] > semCounts[b] ? a : b, 1));
        const studentList = Object.values(group.studentsByUsn);
        return {
            subject_code: code,
            subject_name: subjectCanonicalNames[code] || code,
            semester: dominantSem,
            enrolledCount: studentList.length,
            students: studentList
        };
    }).sort((a, b) => (a.semester - b.semester) || a.subject_code.localeCompare(b.subject_code));

    const computedData = {
        students,
        studentMap,
        regularCount,
        lateralCount,
        overallLeaderboard,
        allSemestersLeaderboard,
        availableSemesters,
        availableSubjects,
        subjectGroups,
        studentRecords
    };

    cohortCache.set(cacheKey, { timestamp: now, data: computedData });
    return computedData;
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStudent(req);
        if (authError) return authError;

        const currentUsn = session.usn?.toUpperCase().trim();
        const { searchParams } = new URL(req.url);

        const requestedBatch = searchParams.get('batch');
        const cohortConfig = resolveCohortConfig(requestedBatch, currentUsn);
        const selectedSemParam = parseInt(searchParams.get('semester')) || null;
        const selectedSubjectParam = searchParams.get('subject_code') || null;

        const cohortData = await getOrComputeCohortData(cohortConfig);
        const {
            students,
            studentMap,
            regularCount,
            lateralCount,
            overallLeaderboard,
            allSemestersLeaderboard,
            availableSemesters,
            availableSubjects,
            studentRecords
        } = cohortData;

        if (students.length === 0) {
            return ok({
                batch: cohortConfig.code,
                batchName: cohortConfig.name,
                totalStudents: 0,
                regularCount: 0,
                lateralCount: 0,
                targetSemester: 1,
                overallLeaderboard: [],
                semesterLeaderboard: [],
                allSemestersLeaderboard: {},
                subjectLeaderboard: [],
                availableSemesters: [],
                availableSubjects: [],
                currentUser: { usn: currentUsn, rank: null }
            });
        }

        // Determine target semester:
        // If explicitly requested, use it; otherwise default to highest completed semester with >50% students, or 6
        let targetSem = selectedSemParam;
        if (!targetSem || !availableSemesters.includes(targetSem)) {
            // Find highest semester with at least 50% students appeared, default to 6
            const popularSem = [...availableSemesters].reverse().find(s => {
                const list = allSemestersLeaderboard[s] || [];
                const appearedCount = list.filter(item => item.hasAppeared).length;
                return appearedCount >= Math.floor(students.length * 0.4);
            });
            targetSem = popularSem || (availableSemesters.length > 0 ? availableSemesters[availableSemesters.length - 1] : 6);
        }

        const semesterList = (allSemestersLeaderboard[targetSem] || []).map(s => ({
            ...s,
            isCurrentUser: s.usn === currentUsn
        }));

        // Subject leaderboard for target subject
        const targetSubjectCode = selectedSubjectParam
            ? selectedSubjectParam.toUpperCase().trim()
            : availableSubjects.find(s => s.semester === targetSem)?.subject_code || availableSubjects[0]?.subject_code;

        let subjectLeaderboard = [];
        let currentSubjectInfo = null;

        const selectedSubObj = availableSubjects.find(s => s.subject_code === targetSubjectCode);
        if (selectedSubObj) {
            currentSubjectInfo = {
                subject_code: selectedSubObj.subject_code,
                subject_name: selectedSubObj.subject_name,
                semester: selectedSubObj.semester,
                totalStudents: selectedSubObj.students.length
            };

            const sortedScores = [...selectedSubObj.students].sort((a, b) => {
                if (b.total !== a.total) return b.total - a.total;
                if (b.external !== a.external) return b.external - a.external;
                if (b.internal !== a.internal) return b.internal - a.internal;
                return a.usn.localeCompare(b.usn);
            });

            sortedScores.forEach((s, idx) => {
                s.rank = idx + 1;
                s.isCurrentUser = s.usn === currentUsn;
            });

            subjectLeaderboard = sortedScores;
        }

        // Build Current User's Academic Standing across all semesters
        const currentUserOverall = overallLeaderboard.find(s => s.usn === currentUsn);
        const currentUserSem = semesterList.find(s => s.usn === currentUsn);
        const currentUserSub = subjectLeaderboard.find(s => s.usn === currentUsn);

        // Precompute all semester ranks and SGPAs for current user
        const userSemesters = {};
        for (const sem of availableSemesters) {
            const semLeaderboard = allSemestersLeaderboard[sem] || [];
            const userEntry = semLeaderboard.find(s => s.usn === currentUsn);
            if (userEntry) {
                userSemesters[sem] = {
                    semester: sem,
                    rank: userEntry.rank,
                    sgpa: userEntry.sgpa,
                    credits: userEntry.credits,
                    hasAppeared: userEntry.hasAppeared
                };
            }
        }

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
                semesters: userSemesters
            },
            overallLeaderboard: overallLeaderboard.map(s => ({ ...s, isCurrentUser: s.usn === currentUsn })),
            semesterLeaderboard: semesterList,
            allSemestersLeaderboard,
            subjectLeaderboard
        });
    } catch (err) {
        console.error('[GET /api/student/leaderboard]', err);
        return fail(err.message || 'Failed to generate class leaderboard.', 'LEADERBOARD_ERROR', 500);
    }
}
