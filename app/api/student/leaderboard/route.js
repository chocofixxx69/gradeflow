import { NextResponse } from 'next/server';
import { requireStudent } from '../../../../lib/server-session';
import { getAdminClient } from '../../../../lib/analytics-data';
import { fetchAllPaginated, fetchByChunks } from '../../../../lib/supabase-utils';
import { calculateAcademicRecord, normalizeSubjectResult } from '../../../../lib/vtuAcademicEngine';
import { fetchCatalogIndex } from '../../../../lib/subjectCreditResolver';
import { getStudentAcademicBatch, matchesBatch, extractBranchFromUsn } from '../../../../lib/semester-utils';

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

const BRANCH_NAMES = {
    CS: 'Computer Science & Engineering',
    CD: 'Computer Science (Data Science)',
    CI: 'Computer Science (AI & Design)',
    CV: 'Civil Engineering',
};

// Resolves which branch + which single academic-year cohort a student's
// leaderboard should scope to. Previously this hardcoded BOTH the 2023 and
// 2024 admission-year prefixes into one combined pattern for every branch,
// so any student landing on the "CS"/etc. shortcut saw an entirely
// different, younger batch mixed into their own class ranking — two
// admission years are two different classes (often two different curriculum
// schemes entirely), never one cohort.
//
// The one legitimate reason two years' USNs belong together is lateral
// entry: a lateral student's USN carries the year they joined (one year
// after the regulars in their actual class), not the class's own admission
// year. getStudentAcademicBatch already encodes that offset — reuse it
// rather than re-deriving it here.
function resolveCohortConfig(batchOrBranch, currentUsn, currentIsLateral = null, currentYear = null) {
    const usn = (currentUsn || '').toUpperCase().trim();

    let branchKey = (batchOrBranch || '').toUpperCase().trim();
    // Tolerate a legacy full prefix like '2AB23CS' being passed in — reduce
    // it to just the branch code.
    const fullPrefixMatch = branchKey.match(/^\d[A-Z]{2}\d{2}([A-Z]{2,3})$/);
    if (fullPrefixMatch) branchKey = fullPrefixMatch[1];

    if (!branchKey) {
        branchKey = extractBranchFromUsn(usn) || '';
        if (!branchKey) {
            if (usn.includes('CS')) branchKey = 'CS';
            else if (usn.includes('CD') || usn.includes('DS')) branchKey = 'CD';
            else if (usn.includes('CI')) branchKey = 'CI';
            else if (usn.includes('CV')) branchKey = 'CV';
        }
    }

    // The caller's own TRUE academic cohort year — lateral & override aware.
    const ownCohort = getStudentAcademicBatch(usn, currentIsLateral, currentYear);

    return {
        branch: branchKey,
        code: branchKey,
        name: BRANCH_NAMES[branchKey] || `Cohort ${branchKey}`,
        cohortYear: ownCohort?.twoDigit || null,
        cohortId: ownCohort ? `${ownCohort.twoDigit}${branchKey}` : branchKey,
    };
}

const STUDENT_SELECT_COLS = 'id, usn, name, branch, scheme, semester, year, lateral_entry';

// The whole-batch fallback used only when a student hasn't been placed into
// any faculty-created class yet: same branch AND the same real academic
// cohort year — matchesBatch resolves year-backs, reassignments and lateral
// students accurately.
async function resolveBatchStudents(cohortConfig) {
    if (!cohortConfig.cohortYear) return [];

    const { data: allStudents, error: stuErr } = await supabaseAdmin
        .from('students')
        .select(STUDENT_SELECT_COLS)
        .order('usn', { ascending: true });

    if (stuErr) throw stuErr;

    return (allStudents || []).filter(s => {
        if (extractBranchFromUsn(s.usn) !== cohortConfig.branch) return false;
        return matchesBatch(s, cohortConfig.cohortYear);
    });
}

// The actual roster of the faculty-created class — this is "the class" the
// student sees on the faculty portal, not a department-wide admission-year
// cohort.
async function resolveClassStudents(classId) {
    const { data: rosterRows, error: rErr } = await supabaseAdmin
        .from('class_students')
        .select('student_id')
        .eq('class_id', classId);

    if (rErr) throw rErr;

    const studentIds = [...new Set((rosterRows || []).map(r => r.student_id).filter(Boolean))];
    if (studentIds.length === 0) return [];

    const { data: students, error: sErr } = await supabaseAdmin
        .from('students')
        .select(STUDENT_SELECT_COLS)
        .in('id', studentIds)
        .order('usn', { ascending: true });

    if (sErr) throw sErr;
    return students || [];
}

// Short in-memory cache (mirrors cohortCache below) so switching semester/
// subject tabs — which each refetch this endpoint — doesn't re-query the
// class roster tables on every click.
const primaryClassCache = new Map();

// A student can sit in more than one class row (e.g. a backlog student added
// to a senior class to sit a re-attempt). The class whose semester matches
// the student's own current semester (semester_mismatch = false) is their
// real home class for ranking purposes; among ties, the most recently
// created class wins.
async function resolveStudentPrimaryClass(studentId) {
    const now = Date.now();
    const cached = primaryClassCache.get(studentId);
    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
    }

    const { data: memberships, error: mErr } = await supabaseAdmin
        .from('class_students')
        .select('class_id, semester_mismatch, added_at')
        .eq('student_id', studentId);

    if (mErr || !memberships || memberships.length === 0) {
        primaryClassCache.set(studentId, { timestamp: now, data: null });
        return null;
    }

    const classIds = [...new Set(memberships.map(m => m.class_id).filter(Boolean))];
    if (classIds.length === 0) {
        primaryClassCache.set(studentId, { timestamp: now, data: null });
        return null;
    }

    const { data: classRows, error: cErr } = await supabaseAdmin
        .from('classes')
        .select('id, name, branch, branch_code, semester, section, batch, academic_year, scheme, created_at')
        .in('id', classIds);

    if (cErr || !classRows || classRows.length === 0) {
        primaryClassCache.set(studentId, { timestamp: now, data: null });
        return null;
    }

    const membershipByClassId = new Map(memberships.map(m => [m.class_id, m]));
    const candidates = classRows.map(c => ({
        ...c,
        semester_mismatch: membershipByClassId.get(c.id)?.semester_mismatch || false,
        added_at: membershipByClassId.get(c.id)?.added_at || null,
    }));

    candidates.sort((a, b) => {
        if (a.semester_mismatch !== b.semester_mismatch) return a.semester_mismatch ? 1 : -1;
        const aTime = new Date(a.created_at || a.added_at || 0).getTime();
        const bTime = new Date(b.created_at || b.added_at || 0).getTime();
        return bTime - aTime;
    });

    const primary = candidates[0] || null;
    primaryClassCache.set(studentId, { timestamp: now, data: primary });
    return primary;
}

// Builds the cohortConfig-shaped scope for a resolved faculty-created class.
function buildClassCohortConfig(primaryClass, currentUsn) {
    const branchCode = primaryClass.branch_code || extractBranchFromUsn(currentUsn) || '';
    const sectionLabel = primaryClass.section ? primaryClass.section.trim().toUpperCase() : '';
    const semLabel = primaryClass.semester ? `-S${primaryClass.semester}` : '';
    const secSuffix = sectionLabel ? `-${sectionLabel}` : '';

    return {
        branch: branchCode,
        code: `${branchCode || 'CLASS'}${semLabel}${secSuffix}`,
        name: primaryClass.name
            || `${BRANCH_NAMES[branchCode] || branchCode || 'Class'}${primaryClass.semester ? ` — Semester ${primaryClass.semester}` : ''}${sectionLabel ? ` · Section ${sectionLabel}` : ''}`,
        cohortYear: null,
        cohortId: `class:${primaryClass.id}`,
        classId: primaryClass.id,
        section: sectionLabel || null,
    };
}

async function getOrComputeCohortData(cohortConfig, resolveStudents) {
    const cacheKey = cohortConfig.cohortId;
    const now = Date.now();
    const cached = cohortCache.get(cacheKey);

    if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
        return cached.data;
    }

    // 1. Fetch students for this scope — either the faculty-created class
    // roster, or (when the student isn't in any class yet) the whole-batch
    // fallback.
    const students = await resolveStudents();

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
        const acgpa = Number(Number(a.cgpa || 0).toFixed(2));
        const bcgpa = Number(Number(b.cgpa || 0).toFixed(2));
        if (bcgpa !== acgpa) return bcgpa - acgpa;
        if (a.totalBacklogs !== b.totalBacklogs) return a.totalBacklogs - b.totalBacklogs;
        if (b.earnedCredits !== a.earnedCredits) return b.earnedCredits - a.earnedCredits;
        return (a.usn || '').localeCompare(b.usn || '');
    });

    let curOverallRank = 1;
    let lastCgpa = null;
    let rankedOverallCount = 0;
    overallLeaderboard.forEach((item) => {
        const cgpaVal = item.cgpa !== null && item.cgpa !== undefined && !Number.isNaN(Number(item.cgpa)) && Number(item.cgpa) > 0
            ? Number(Number(item.cgpa).toFixed(2))
            : null;

        if (cgpaVal === null) {
            item.rank = '—';
            return;
        }

        if (rankedOverallCount === 0) {
            curOverallRank = 1;
            lastCgpa = cgpaVal;
        } else if (cgpaVal === lastCgpa) {
            // Tied CGPA: identical rank
        } else {
            curOverallRank = curOverallRank + 1; // Dense ranking
            lastCgpa = cgpaVal;
        }
        item.rank = curOverallRank;
        rankedOverallCount++;
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
                const asgpa = Number(Number(a.sgpa || 0).toFixed(2));
                const bsgpa = Number(Number(b.sgpa || 0).toFixed(2));
                if (bsgpa !== asgpa) return bsgpa - asgpa;
                if (b.earnedCredits !== a.earnedCredits) return b.earnedCredits - a.earnedCredits;
            }
            return (a.usn || '').localeCompare(b.usn || '');
        });

        let curSemRank = 1;
        let lastSgpa = null;
        let appearedCount = 0;
        list.forEach(item => {
            if (item.hasAppeared) {
                const sgpaVal = item.sgpa !== null && item.sgpa !== undefined && !Number.isNaN(Number(item.sgpa))
                    ? Number(Number(item.sgpa).toFixed(2))
                    : null;

                if (sgpaVal === null) {
                    item.rank = '—';
                    return;
                }

                if (appearedCount === 0) {
                    curSemRank = 1;
                    lastSgpa = sgpaVal;
                } else if (sgpaVal === lastSgpa) {
                    // Tied SGPA: identical rank
                } else {
                    curSemRank = curSemRank + 1; // Dense ranking
                    lastSgpa = sgpaVal;
                }
                item.rank = curSemRank;
                appearedCount++;
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
        const { data: currentStudent } = await supabaseAdmin
            .from('students')
            .select('id, lateral_entry, year')
            .eq('usn', currentUsn)
            .maybeSingle();

        const requestedBatch = searchParams.get('batch');
        const selectedSemParam = parseInt(searchParams.get('semester')) || null;
        const selectedSubjectParam = searchParams.get('subject_code') || null;

        // A student's leaderboard is scoped to the actual class their faculty
        // created and rostered them into (app/faculty/classes), not a
        // department-wide admission-year cohort. An explicit `batch` override
        // (not used by the student UI today, kept for compatibility) bypasses
        // class detection; a student not yet placed in any class falls back
        // to the old whole-batch scope so their leaderboard isn't empty.
        const primaryClass = (!requestedBatch && currentStudent?.id)
            ? await resolveStudentPrimaryClass(currentStudent.id)
            : null;

        const cohortConfig = primaryClass
            ? buildClassCohortConfig(primaryClass, currentUsn)
            : resolveCohortConfig(requestedBatch, currentUsn, currentStudent?.lateral_entry, currentStudent?.year);

        const resolveStudents = primaryClass
            ? () => resolveClassStudents(primaryClass.id)
            : () => resolveBatchStudents(cohortConfig);

        const cohortData = await getOrComputeCohortData(cohortConfig, resolveStudents);
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
                const atotal = Number(a.total) || 0;
                const btotal = Number(b.total) || 0;
                if (btotal !== atotal) return btotal - atotal;
                if (b.external !== a.external) return (Number(b.external) || 0) - (Number(a.external) || 0);
                if (b.internal !== a.internal) return (Number(b.internal) || 0) - (Number(a.internal) || 0);
                return (a.usn || '').localeCompare(b.usn || '');
            });

            let curSubRank = 1;
            let lastSubTotal = null;
            sortedScores.forEach((s, idx) => {
                const totalScore = Number(s.total) || 0;
                if (idx === 0) {
                    curSubRank = 1;
                    lastSubTotal = totalScore;
                } else if (totalScore === lastSubTotal) {
                    // Tied total score: identical rank
                } else {
                    curSubRank = curSubRank + 1; // Dense ranking
                    lastSubTotal = totalScore;
                }
                s.rank = curSubRank;
                s.isCurrentUser = s.usn === currentUsn;
            });

            subjectLeaderboard = sortedScores;
        }

        // Build Current User's Academic Standing across all semesters
        const currentUserOverall = overallLeaderboard.find(s => s.usn === currentUsn);
        const currentUserSem = semesterList.find(s => s.usn === currentUsn);
        const currentUserSub = subjectLeaderboard.find(s => s.usn === currentUsn);

        // app/leaderboard/page.jsx only ever reads semesters[targetSemester], never
        // another semester's - so only that one entry is built.
        const currentUserSemesterEntry = currentUserSem ? {
            semester: targetSem,
            rank: currentUserSem.rank,
            sgpa: currentUserSem.sgpa,
            credits: currentUserSem.credits,
            hasAppeared: currentUserSem.hasAppeared
        } : null;

        // The per-subject student roster on availableSubjects[] exists to build
        // subjectLeaderboard above; the client only reads the 4 metadata fields below
        // from availableSubjects itself (the selected subject's roster ships
        // separately, already ranked, as subjectLeaderboard).
        const availableSubjectsLight = availableSubjects.map(s => ({
            subject_code: s.subject_code,
            subject_name: s.subject_name,
            semester: s.semester,
            enrolledCount: s.enrolledCount
        }));

        return ok({
            batch: cohortConfig.code,
            batchName: cohortConfig.name,
            totalStudents: students.length,
            regularCount,
            lateralCount,
            targetSemester: targetSem,
            availableSemesters,
            availableSubjects: availableSubjectsLight,
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
                semesters: currentUserSemesterEntry ? { [targetSem]: currentUserSemesterEntry } : {}
            },
            // branch/earnedCredits/regCredits are needed above for ranking and tie
            // breaking but aren't read by page.jsx or export-utils.js past this point.
            overallLeaderboard: overallLeaderboard.map(s => ({
                usn: s.usn,
                name: s.name,
                isLateral: s.isLateral,
                cgpa: s.cgpa,
                semestersTracked: s.semestersTracked,
                totalBacklogs: s.totalBacklogs,
                rank: s.rank,
                isCurrentUser: s.usn === currentUsn
            })),
            semesterLeaderboard: semesterList.map(s => ({
                usn: s.usn,
                name: s.name,
                isLateral: s.isLateral,
                sgpa: s.sgpa,
                credits: s.credits,
                hasAppeared: s.hasAppeared,
                statusText: s.statusText,
                rank: s.rank,
                isCurrentUser: s.isCurrentUser
            })),
            // allSemestersLeaderboard (every semester's full ranked roster) is gone
            // from the response: page.jsx picks selectedSemester and always refetches
            // with it as `semester`, so activeSemester === targetSemester on the client
            // always holds, and semesterLeaderboard above is already that one slice.
            // getOrComputeCohortData still computes/caches every semester server-side
            // so the shared 60s cohort cache can answer a different target next request.
            subjectLeaderboard
        });
    } catch (err) {
        console.error('[GET /api/student/leaderboard]', err);
        return fail(err.message || 'Failed to generate class leaderboard.', 'LEADERBOARD_ERROR', 500);
    }
}
