import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents, fetchDynamicMarks } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, isLateralEntry } from '@/lib/semester-utils';
import { resolveSubjectCredits } from '@/lib/export-utils';
import { isFailedSubject, getGradePoint } from '@/lib/vtuGrades';

export const dynamic = 'force-dynamic';

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
        const branch = (searchParams.get('branch') || 'CS').toUpperCase().trim();
        const semester = parseInt(searchParams.get('semester') || '3', 10);
        const batch = searchParams.get('batch') || '';
        const classId = searchParams.get('classId') || '';
        const section = searchParams.get('section') || '';

        const cacheKey = `sem_analysis_v2:${branch}:${semester}:${batch}:${classId}:${section}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Resolve student list based on classId or branch/batch
        let studentUsns = [];
        let studentsList = [];

        if (classId) {
            const { data: csData } = await supabaseAdmin
                .from('class_students')
                .select('usn')
                .eq('class_id', classId);
            studentUsns = (csData || []).map(r => r.usn);

            if (studentUsns.length > 0) {
                const { data: stData } = await supabaseAdmin
                    .from('students')
                    .select('id, usn, name, branch, semester, year, lateral_entry')
                    .in('usn', studentUsns);
                studentsList = stData || [];
            }
        } else {
            const stData = await fetchDynamicStudents(supabaseAdmin, { branch });
            let filtered = stData || [];

            if (batch) {
                filtered = filtered.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
            }

            studentsList = filtered;
            studentUsns = studentsList.map(s => s.usn);
        }

        if (studentUsns.length === 0) {
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

        // 2. Fetch subject marks dynamically for these students in this semester
        const allMarks = await fetchDynamicMarks(supabaseAdmin, { usns: studentUsns, semester });

        // 3. Fetch catalog subjects for this branch and semester
        const { data: catSubjects } = await supabaseAdmin
            .from('subject_catalog')
            .select('*')
            .ilike('branch', `%${branch}%`)
            .eq('semester', semester);

        const catalogMap = new Map();
        (catSubjects || []).forEach(sub => {
            catalogMap.set(sub.subject_code.toUpperCase(), sub);
        });

        // 4. Group marks by student USN
        const marksByUsn = new Map();
        (allMarks || []).forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // When "All Batches" is selected without classId, only include students who appeared in this semester or are in/above it
        if (!batch && !classId) {
            studentsList = studentsList.filter(s => {
                const uMarks = marksByUsn.get(s.usn) || [];
                return uMarks.length > 0 || (s.semester && Number(s.semester) >= semester);
            });
            studentUsns = studentsList.map(s => s.usn);
        }

        // 5. Determine unique subject columns from marks actually taken by this cohort
        const subjectCodeMap = new Map();
        (allMarks || []).forEach(m => {
            const code = (m.subject_code || m.code || '').toUpperCase();
            if (code && !subjectCodeMap.has(code)) {
                const cat = catalogMap.get(code);
                subjectCodeMap.set(code, {
                    code,
                    name: cat?.subject_name || m.subject_name || m.name || code,
                    credits: Number(cat?.credits) || resolveSubjectCredits(m, cat)
                });
            }
        });

        // Fallback: If no marks exist yet for this semester, populate from catalog
        if (subjectCodeMap.size === 0) {
            (catSubjects || []).forEach(s => {
                const code = s.subject_code.toUpperCase();
                if (!code.startsWith('1B') && !code.includes('XX')) {
                    subjectCodeMap.set(code, {
                        code,
                        name: s.subject_name || s.subject_code,
                        credits: Number(s.credits) || 3
                    });
                }
            });
        }

        const subjectCols = Array.from(subjectCodeMap.values()).sort((a, b) => a.code.localeCompare(b.code));

        // 6. Process each student row
        const studentsProcessed = [];
        const backlogRoster = [];
        let totalAppeared = 0;
        let totalPassed = 0;
        let totalFailed = 0;
        const classCounts = { FCD: 0, FC: 0, SC: 0, P: 0, F: 0 };

        // Pre-create subject tally counters
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

        studentsList.forEach(student => {
            const uMarks = marksByUsn.get(student.usn) || [];
            const hasData = uMarks.length > 0;
            if (hasData) totalAppeared++;

            const marksByCode = new Map();
            uMarks.forEach(m => marksByCode.set((m.subject_code || m.code || '').toUpperCase(), m));

            let totalRegisteredCr = 0;
            let totalEarnedCi = 0;
            let totalCrP = 0;
            let totalScoreSum = 0;
            let arrearsCount = 0;
            const failedSubjectsForStudent = [];

            const subjectDetails = {};

            subjectCols.forEach(sub => {
                const m = marksByCode.get(sub.code);
                const subTally = tallyMap.get(sub.code);

                if (m) {
                    const cr = resolveSubjectCredits(m, sub);
                    const grade = (m.grade || '').trim().toUpperCase();
                    const intMarks = m.internal ?? m.cie_marks ?? null;
                    const extMarks = m.external ?? m.see_marks ?? null;
                    const totMarks = m.total ?? m.total_marks ?? null;
                    const isFail = isFailedSubject(m);
                    const gp = isFail ? 0 : getGradePoint(grade, student.scheme || '2022', totMarks, extMarks);
                    const ci = isFail ? 0 : cr;
                    const crp = ci * gp;

                    totalRegisteredCr += cr;
                    totalEarnedCi += ci;
                    totalCrP += crp;
                    if (totMarks !== null) totalScoreSum += Number(totMarks);

                    if (isFail) {
                        arrearsCount++;
                        failedSubjectsForStudent.push({
                            code: sub.code,
                            name: sub.name,
                            internal: intMarks,
                            external: extMarks,
                            total: totMarks,
                            grade: grade || 'F'
                        });
                    }

                    // Accumulate in subject tally
                    if (subTally) {
                        subTally.appeared++;
                        if (isFail) {
                            subTally.failed++;
                            if (grade === 'A' || grade === 'AB' || grade === 'ABSENT' || totMarks === 0) {
                                subTally.grades['Ab']++;
                            } else {
                                subTally.grades['F']++;
                            }
                        } else {
                            subTally.passed++;
                            if (subTally.grades[grade] !== undefined) {
                                subTally.grades[grade]++;
                            } else if (grade === 'S') {
                                subTally.grades['O']++;
                            } else {
                                subTally.grades['P']++;
                            }
                        }
                    }

                    subjectDetails[sub.code] = {
                        cr,
                        ci,
                        g: grade || (isFail ? 'F' : 'P'),
                        gi: gp,
                        crp,
                        internal: intMarks,
                        external: extMarks,
                        total: totMarks,
                        isFail
                    };
                } else {
                    subjectDetails[sub.code] = null;
                }
            });

            // Calculate SGPA
            const sgpa = totalRegisteredCr > 0 ? Number((totalCrP / totalRegisteredCr).toFixed(2)) : 0;
            const percentage = sgpa > 0 ? Number(Math.max(0, (sgpa - 0.75) * 10).toFixed(2)) : 0;
            const backlogCredits = totalRegisteredCr - totalEarnedCi;

            // VTU Class Award
            let vtuClass = '—';
            if (hasData) {
                if (arrearsCount > 0) {
                    vtuClass = 'F';
                    totalFailed++;
                    classCounts.F++;
                } else {
                    totalPassed++;
                    if (sgpa >= 7.75) {
                        vtuClass = 'FCD';
                        classCounts.FCD++;
                    } else if (sgpa >= 6.75) {
                        vtuClass = 'FC';
                        classCounts.FC++;
                    } else if (sgpa >= 5.0) {
                        vtuClass = 'SC';
                        classCounts.SC++;
                    } else {
                        vtuClass = 'P';
                        classCounts.P++;
                    }
                }
            }

            if (arrearsCount > 0) {
                backlogRoster.push({
                    usn: student.usn,
                    name: student.name || student.usn,
                    arrearsCount,
                    backlogCredits,
                    failedSubjects: failedSubjectsForStudent
                });
            }

            studentsProcessed.push({
                usn: student.usn,
                name: student.name || student.usn,
                isLE: isLateralEntry(student.usn, student.lateral_entry),
                hasData,
                totalRegisteredCr,
                totalEarnedCi,
                totalCrP,
                totalScoreSum,
                sgpa,
                percentage,
                vtuClass,
                arrearsCount,
                backlogCredits,
                subjectDetails
            });
        });

        // Sort students naturally by USN
        studentsProcessed.sort((a, b) => a.usn.localeCompare(b.usn));
        backlogRoster.sort((a, b) => b.arrearsCount - a.arrearsCount || a.usn.localeCompare(b.usn));

        // Format subject tallies with pass percentage
        const subjectTallies = Array.from(tallyMap.values()).map(st => ({
            ...st,
            passRate: st.appeared > 0 ? Number(((st.passed / st.appeared) * 100).toFixed(1)) : 0
        }));

        const passPercentage = totalAppeared > 0 ? Number(((totalPassed / totalAppeared) * 100).toFixed(1)) : 0;

        const payload = {
            students: studentsProcessed,
            subjects: subjectCols,
            summary: {
                totalAppeared,
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
