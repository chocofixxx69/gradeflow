import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { readTable, SELECTS } from '@/lib/table-cache';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, isLateralEntry, canonicalBranchCode } from '@/lib/semester-utils';
import { loadStudentRecords } from '@/lib/student-record';

import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function ok(data) {
    return NextResponse.json({ success: true, data }, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        }
    });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    noStore();
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const rawBranch = searchParams.get('branch') || '';
        const branch = canonicalBranchCode(rawBranch) || rawBranch.toUpperCase().trim();
        const semester = parseInt(searchParams.get('semester') || '3', 10);
        const batch = searchParams.get('batch') || '';
        const classId = searchParams.get('classId') || '';
        const section = (searchParams.get('section') || 'ALL').toUpperCase().trim();
        const fresh = searchParams.get('fresh') === '1';

        const cacheKey = `sem_analysis_v5:${branch || 'ALL'}:${semester}:${batch}:${classId}:${section}`;
        if (!fresh) {
            const cached = getCached(cacheKey);
            if (cached) return ok(cached);
        }

        const supabaseAdmin = getAdminClient();

        // Canonical per-student records (cached, shared warehouse read — see
        // lib/student-record.js) plus classes/class_students for section
        // resolution and subject_catalog for the "no marks yet" column fallback.
        const [studentRecords, rawClasses, rawClassStudents, rawCatalog] = await Promise.all([
            loadStudentRecords(supabaseAdmin, { fresh }),
            readTable(supabaseAdmin, 'classes', SELECTS.classes, { orderCol: 'created_at', ascending: false }),
            readTable(supabaseAdmin, 'class_students', SELECTS.class_students),
            readTable(supabaseAdmin, 'subject_catalog', SELECTS.subject_catalog)
        ]);

        // 1. Section resolution from class rosters
        const classById = new Map((rawClasses || []).map(c => [c.id, c]));
        const usnToSectionMap = new Map();
        const sortedClassStudents = [...(rawClassStudents || [])].sort((a, b) => {
            const cA = classById.get(a.class_id);
            const cB = classById.get(b.class_id);
            const aScore = (cA && Number(cA.semester) === Number(semester) ? 2 : 0) + (cA && cA.batch === batch ? 1 : 0);
            const bScore = (cB && Number(cB.semester) === Number(semester) ? 2 : 0) + (cB && cB.batch === batch ? 1 : 0);
            return aScore - bScore;
        });
        sortedClassStudents.forEach(cs => {
            const c = classById.get(cs.class_id);
            if (c && c.section) {
                usnToSectionMap.set(cs.usn, c.section.toUpperCase().trim());
            }
        });

        // 2. Resolve the scoped student record list based on classId or branch/batch/section
        let records = [];
        if (classId) {
            const classUsns = new Set((rawClassStudents || []).filter(cs => cs.class_id === classId).map(cs => cs.usn));
            records = [...studentRecords.values()].filter(r => classUsns.has(r.usn));
        } else {
            records = [...studentRecords.values()];
            if (branch && branch !== 'ALL') records = records.filter(r => (r.raw?.branch || '').toUpperCase().includes(branch) || r.identity.branch.code === branch);
            if (batch && batch.toUpperCase() !== 'ALL') records = records.filter(r => matchesBatch(r.raw, batch));
            if (section && section !== 'ALL') records = records.filter(r => usnToSectionMap.get(r.usn) === section);
        }

        if (records.length === 0) {
            return ok({
                students: [],
                subjects: [],
                summary: {
                    totalAppeared: 0,
                    totalPassed: 0,
                    totalFailed: 0,
                    passPercentage: 0,
                    classCounts: { FCD: 0, FC: 0, SC: 0, P: 0, F: 0 }
                },
                subjectTallies: [],
                backlogRoster: []
            });
        }

        // When "All Batches" is selected without classId, only include students who
        // have this semester on record or are in/above it (raw declared semester —
        // just a display heuristic, not an academic computation).
        if (!batch && !classId) {
            records = records.filter(r => r.semStats[semester] || (r.raw?.semester && Number(r.raw.semester) >= semester));
        }

        // 3. Determine unique subject columns for this semester straight off the
        // students' own canonical marksBySemester — credits already resolved from
        // the live subject_catalog by the academic engine, no separate lookup needed.
        const subjectCodeMap = new Map();
        records.forEach(r => {
            (r.marksBySemester[semester] || []).forEach(s => {
                if (!subjectCodeMap.has(s.subjectCode)) {
                    subjectCodeMap.set(s.subjectCode, { code: s.subjectCode, name: s.subjectName || s.subjectCode, credits: s.credits || 0 });
                }
            });
        });

        // Fallback: if no marks exist yet for this semester, populate columns from catalog
        if (subjectCodeMap.size === 0) {
            const catSubjects = (rawCatalog || []).filter(s => Number(s.semester) === semester && (
                !branch || branch === 'ALL' || (s.branch || '').toUpperCase().includes(branch)
            ));
            catSubjects.forEach(s => {
                const code = (s.subject_code || '').toUpperCase();
                if (code && !code.startsWith('1B') && !code.includes('XX')) {
                    subjectCodeMap.set(code, {
                        code,
                        name: s.subject_name || s.subject_code,
                        credits: Number(s.credits) || 3
                    });
                }
            });
        }

        const subjectCols = Array.from(subjectCodeMap.values()).sort((a, b) => a.code.localeCompare(b.code));

        // 4. Process each student row straight off their already-computed canonical
        // record (lib/vtuAcademicEngine.js via lib/student-record.js) — same
        // SGPA/credits/grade-point source as the Student Lookup dashboard, so this
        // gazette never disagrees with it for the same student.
        const studentsProcessed = [];
        const backlogRoster = [];
        let totalAppeared = 0;
        let totalPassed = 0;
        let totalFailed = 0;
        const classCounts = { FCD: 0, FC: 0, SC: 0, P: 0, F: 0 };

        const tallyMap = new Map();
        subjectCols.forEach(s => {
            tallyMap.set(s.code, {
                code: s.code,
                name: s.name,
                credits: s.credits,
                appeared: 0,
                passed: 0,
                failed: 0,
                grades: { O: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, P: 0, F: 0, Ab: 0 }
            });
        });

        records.forEach(record => {
            const semSubjects = record.marksBySemester[semester] || [];
            const hasData = semSubjects.length > 0;
            if (hasData) totalAppeared++;

            const subjectsByCode = new Map(semSubjects.map(s => [s.subjectCode, s]));
            const stat = record.semStats[semester];

            let totalScoreSum = 0;
            let arrearsCount = stat?.backlogs ?? 0;
            const failedSubjectsForStudent = [];
            const subjectDetails = {};

            subjectCols.forEach(sub => {
                const s = subjectsByCode.get(sub.code);
                const subTally = tallyMap.get(sub.code);

                if (s) {
                    if (s.totalMarks !== null) totalScoreSum += Number(s.totalMarks);

                    if (s.isFailed) {
                        failedSubjectsForStudent.push({
                            code: sub.code,
                            name: sub.name,
                            internal: s.internalMarks,
                            external: s.seeMarks,
                            total: s.totalMarks,
                            grade: s.grade || 'F'
                        });
                    }

                    if (subTally) {
                        subTally.appeared++;
                        if (s.isFailed) {
                            subTally.failed++;
                            if (s.isAbsent) {
                                subTally.grades['Ab']++;
                            } else {
                                subTally.grades['F']++;
                            }
                        } else {
                            subTally.passed++;
                            if (subTally.grades[s.grade] !== undefined) {
                                subTally.grades[s.grade]++;
                            } else {
                                subTally.grades['P']++;
                            }
                        }
                    }

                    subjectDetails[sub.code] = {
                        cr: s.credits,
                        ci: s.isFailed ? 0 : s.credits,
                        g: s.grade,
                        gi: s.gradePoint,
                        crp: s.weightedPoints,
                        internal: s.internalMarks,
                        external: s.seeMarks,
                        total: s.totalMarks,
                        isFail: s.isFailed
                    };
                } else {
                    subjectDetails[sub.code] = null;
                }
            });

            const totalRegisteredCr = stat?.totalCredits ?? 0;
            const totalEarnedCi = stat?.earnedCredits ?? 0;
            const totalCrP = stat?.gradePoints ?? 0;
            const sgpa = stat?.sgpa ?? 0;
            const percentage = sgpa > 0 ? Number(Math.max(0, (sgpa - 0.75) * 10).toFixed(2)) : 0;
            const backlogCredits = totalRegisteredCr - totalEarnedCi;

            let vtuClass = '—';
            let awardClass = '—';
            if (hasData) {
                if (arrearsCount > 0) {
                    vtuClass = 'F';
                    awardClass = 'Fail';
                    totalFailed++;
                    classCounts.F++;
                } else {
                    totalPassed++;
                    if (sgpa >= 7.75) {
                        vtuClass = 'FCD';
                        awardClass = 'First Class Distinction';
                        classCounts.FCD++;
                    } else if (sgpa >= 6.75) {
                        vtuClass = 'FC';
                        awardClass = 'First Class';
                        classCounts.FC++;
                    } else if (sgpa >= 5.0) {
                        vtuClass = 'SC';
                        awardClass = 'Second Class';
                        classCounts.SC++;
                    } else {
                        vtuClass = 'P';
                        awardClass = 'Pass Class';
                        classCounts.P++;
                    }
                }
            }

            if (arrearsCount > 0) {
                backlogRoster.push({
                    usn: record.usn,
                    name: record.name || record.usn,
                    arrearsCount,
                    backlogCredits,
                    failedSubjects: failedSubjectsForStudent
                });
            }

            studentsProcessed.push({
                usn: record.usn,
                name: record.name || record.usn,
                branch: record.raw?.branch || (record.usn.length >= 7 ? record.usn.substring(5, 7).toUpperCase() : '—'),
                section: usnToSectionMap.get(record.usn) || '—',
                isLE: isLateralEntry(record.usn, record.raw?.lateral_entry),
                hasData,
                isPassed: Boolean(hasData && arrearsCount === 0),
                totalRegisteredCr,
                totalEarnedCi,
                totalCrP,
                totalScoreSum,
                totalMarks: totalScoreSum,
                sgpa,
                percentage,
                vtuClass,
                awardClass,
                arrearsCount,
                backlogCount: arrearsCount,
                backlogCredits,
                subjectDetails
            });
        });

        studentsProcessed.sort((a, b) => a.usn.localeCompare(b.usn));
        backlogRoster.sort((a, b) => b.arrearsCount - a.arrearsCount || a.usn.localeCompare(b.usn));

        const subjectTallies = Array.from(tallyMap.values()).map(st => ({
            ...st,
            passRate: st.appeared > 0 ? Number(((st.passed / st.appeared) * 100).toFixed(1)) : 0
        }));

        const passPercentage = totalAppeared > 0 ? Number(((totalPassed / totalAppeared) * 100).toFixed(1)) : 0;

        const payload = {
            students: studentsProcessed,
            subjects: subjectCols,
            summary: {
                totalEnrolled: records.length,
                totalAppeared,
                totalNotAppeared: Math.max(0, records.length - totalAppeared),
                totalPassed,
                totalFailed,
                passPercentage,
                classCounts
            },
            subjectTallies,
            backlogRoster,
            filtersApplied: { branch, semester, batch, classId, section }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/semester-analysis]', err);
        return fail('Failed to compute semester analysis: ' + (err.message || err), 'ANALYSIS_ERROR', 500);
    }
}
