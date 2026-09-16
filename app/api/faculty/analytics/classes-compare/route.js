import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBranch, matchesBatch } from '@/lib/semester-utils';
import { isFailedSubject } from '@/lib/vtuGrades';

import { readTable, SELECTS } from '@/lib/table-cache';

export const dynamic = 'force-dynamic';

// Whole-table analytics reads can exceed Vercel's default 10s ceiling on a cold
// start; see app/api/faculty/analytics/semester-analysis/route.js for the detail.
export const maxDuration = 60;

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const branch = (searchParams.get('branch') || 'ALL').toUpperCase().trim();
        const batch = (searchParams.get('batch') || 'ALL').toUpperCase().trim();
        const semesterParam = searchParams.get('semester');
        const semester = semesterParam && semesterParam !== 'ALL' ? parseInt(semesterParam, 10) : 'ALL';
        const classIdsParam = searchParams.get('classIds');
        const selectedClassIds = classIdsParam ? classIdsParam.split(',').map(s => s.trim()).filter(Boolean) : null;

        const cacheKey = `classes_compare_v4:${branch}:${batch}:${semester}:${classIdsParam || 'all'}`;
        const forceFresh = searchParams.get('fresh') === '1' || searchParams.has('t');
        if (!forceFresh) {
            const cached = getCached(cacheKey);
            if (cached) return ok(cached);
        }

        const supabaseAdmin = getAdminClient();

        // 1. High-Performance Parallel Fetch using process-wide table-cache
        const [
            rawClasses,
            rawClassStudents,
            { data: rawFaculty },
            rawStudents,
            allResults,
            allMarks
        ] = await Promise.all([
            readTable(supabaseAdmin, 'classes', SELECTS.classes),
            readTable(supabaseAdmin, 'class_students', SELECTS.class_students),
            supabaseAdmin.from('faculty_onboarding').select('id, full_name, email'),
            readTable(supabaseAdmin, 'students', SELECTS.students),
            readTable(supabaseAdmin, 'results', SELECTS.results),
            readTable(supabaseAdmin, 'subject_marks', SELECTS.subject_marks)
        ]);

        const allClasses = rawClasses || [];

        // Filter classes by user parameters
        let matchedClasses = allClasses;
        if (selectedClassIds && selectedClassIds.length > 0) {
            matchedClasses = matchedClasses.filter(c => selectedClassIds.includes(c.id));
        } else {
            if (branch && branch !== 'ALL') {
                matchedClasses = matchedClasses.filter(c => matchesBranch(c.branch || c.branch_code, branch));
            }
            if (batch && batch !== 'ALL') {
                matchedClasses = matchedClasses.filter(c => !c.batch || c.batch === batch);
            }
            if (semester !== 'ALL') {
                const semNum = Number(semester);
                const scoped = matchedClasses.filter(c => !c.semester || Number(c.semester) >= semNum);
                if (scoped.length > 0) {
                    matchedClasses = scoped;
                }
            }
        }

        const displayClasses = matchedClasses.length > 0 ? matchedClasses : allClasses;

        const facultyMap = new Map((rawFaculty || []).map(f => [f.id, f]));
        const studentMap = new Map();
        (rawStudents || []).forEach(s => {
            if (s.usn) {
                studentMap.set(s.usn, s);
                studentMap.set(s.usn.toUpperCase().trim(), s);
            }
        });

        // Group enrolled USNs by class ID
        const usnsByClass = new Map();
        (rawClassStudents || []).forEach(cs => {
            if (!usnsByClass.has(cs.class_id)) usnsByClass.set(cs.class_id, []);
            usnsByClass.get(cs.class_id).push(cs.usn);
        });

        // Map results and marks by `${usn}|${semester}`
        const resultsMap = new Map();
        (allResults || []).forEach(r => {
            const key = `${r.usn}|${r.semester}`;
            resultsMap.set(key, r);
        });

        const marksMap = new Map();
        (allMarks || []).forEach(m => {
            const key = `${m.usn}|${m.semester}`;
            if (!marksMap.has(key)) marksMap.set(key, []);
            marksMap.get(key).push(m);
        });

        // 4. Compute metrics for each class
        const classComparisons = displayClasses.map(c => {
            const enrolledUsns = usnsByClass.get(c.id) || [];
            const teacher = facultyMap.get(c.faculty_id);
            const targetSem = semester !== 'ALL' ? Number(semester) : (Number(c.semester) || null);

            let appeared = 0;
            let passed = 0;
            let failed = 0;
            let distinctions = 0;
            let firstClass = 0;
            let secondClass = 0;
            let sumSgpa = 0;
            let sgpaCount = 0;
            let highestSgpa = 0;
            let lowestSgpa = 10;
            let topperObj = null;

            const grades = { O: 0, APlus: 0, A: 0, BPlus: 0, B: 0, C: 0, P: 0, F: 0 };
            const subjectsMap = new Map(); // code -> { code, name, appeared, passed, sumMarks }

            enrolledUsns.forEach(usn => {
                // Find marks and result for this student in target semester
                // If targetSem is null, check all semesters or latest semester
                let uMarks = [];
                let uRes = null;

                if (targetSem) {
                    uMarks = marksMap.get(`${usn}|${targetSem}`) || [];
                    uRes = resultsMap.get(`${usn}|${targetSem}`);
                } else {
                    // Find latest semester with data
                    for (let s = 8; s >= 1; s--) {
                        const mList = marksMap.get(`${usn}|${s}`);
                        if (mList && mList.length > 0) {
                            uMarks = mList;
                            uRes = resultsMap.get(`${usn}|${s}`);
                            break;
                        }
                    }
                }

                if (uMarks.length === 0 && !uRes) return;

                appeared++;

                // Check backlog
                const hasFail = uMarks.length > 0
                    ? uMarks.some(isFailedSubject)
                    : (uRes?.sgpa ? Number(uRes.sgpa) < 4.0 : false);
                if (hasFail) {
                    failed++;
                } else {
                    passed++;
                }

                // SGPA math
                let studentSgpa = uRes?.sgpa ? Number(uRes.sgpa) : null;
                if (studentSgpa) {
                    sumSgpa += studentSgpa;
                    sgpaCount++;

                    if (studentSgpa >= 7.75) distinctions++;
                    else if (studentSgpa >= 6.75) firstClass++;
                    else if (studentSgpa >= 5.0) secondClass++;

                    if (studentSgpa > highestSgpa) {
                        highestSgpa = studentSgpa;
                        const normUsn = String(usn || '').toUpperCase().trim();
                        const sInfo = studentMap.get(normUsn) || studentMap.get(usn);
                        const sName = (sInfo?.name && sInfo.name.trim() !== '') ? sInfo.name.trim() : usn;
                        topperObj = {
                            usn,
                            name: sName,
                            sgpa: studentSgpa,
                            label: `${sName} (${studentSgpa} SGPA)`
                        };
                    }
                    if (studentSgpa < lowestSgpa) {
                        lowestSgpa = studentSgpa;
                    }
                }

                // Tally grades & subjects
                uMarks.forEach(m => {
                    const gr = String(m.grade || '').toUpperCase().trim();
                    if (gr === 'O') grades.O++;
                    else if (gr === 'A+' || gr === 'A_PLUS') grades.APlus++;
                    else if (gr === 'A') grades.A++;
                    else if (gr === 'B+' || gr === 'B_PLUS') grades.BPlus++;
                    else if (gr === 'B') grades.B++;
                    else if (gr === 'C') grades.C++;
                    else if (gr === 'P') grades.P++;
                    else if (isFailedSubject(m)) grades.F++;

                    const code = (m.subject_code || '').toUpperCase().trim();
                    if (code) {
                        if (!subjectsMap.has(code)) {
                            subjectsMap.set(code, {
                                code,
                                name: m.subject_name || code,
                                appeared: 0,
                                passed: 0,
                                totalMarks: 0
                            });
                        }
                        const sub = subjectsMap.get(code);
                        sub.appeared++;
                        if (!isFailedSubject(m)) sub.passed++;
                        sub.totalMarks += Number(m.total) || 0;
                    }
                });
            });

            const passRate = pct(passed, appeared);
            const avgSGPA = sgpaCount > 0 ? Number((sumSgpa / sgpaCount).toFixed(2)) : 0;

            const subjectSummary = Array.from(subjectsMap.values()).map(sub => ({
                code: sub.code,
                name: sub.name,
                appeared: sub.appeared,
                passed: sub.passed,
                passRate: pct(sub.passed, sub.appeared),
                avgMarks: sub.appeared > 0 ? Math.round(sub.totalMarks / sub.appeared) : 0
            })).sort((a, b) => b.appeared - a.appeared);

            const passClassCount = Math.max(0, passed - distinctions - firstClass - secondClass);
            const cleanSec = c.section ? `(${c.section})` : '';
            const shortName = `${c.name} ${cleanSec}`.replace(/\s+/g, ' ').trim();

            return {
                id: c.id,
                name: c.name,
                shortName,
                branch: c.branch || c.branch_code || 'General',
                semester: c.semester,
                section: c.section ? `Section ${c.section}` : 'General',
                sectionLetter: c.section || '—',
                batch: c.batch || '—',
                academicYear: c.academic_year || '—',
                scheme: c.scheme || '2022',
                facultyName: teacher?.full_name || 'Faculty Not Assigned',
                facultyEmail: teacher?.email || null,
                enrolledCount: enrolledUsns.length,
                studentCount: enrolledUsns.length,
                appeared,
                passed,
                failed,
                passRate,
                avgSGPA,
                highestSGPA: highestSgpa > 0 ? highestSgpa : 0,
                lowestSGPA: lowestSgpa < 10 ? lowestSgpa : 0,
                distinctionCount: distinctions,
                firstClassCount: firstClass,
                secondClassCount: secondClass,
                passClassCount,
                backlogCount: failed,
                topper: topperObj,
                grades,
                subjectSummary
            };
        });

        // 5. Compute Batch-to-Batch Aggregated Comparison with Cumulative CGPA Standards
        const batchMap = new Map();
        const batchUsnsMap = new Map(); // batch -> Set of unique enrolled student USNs

        displayClasses.forEach(c => {
            const b = c.batch && c.batch !== '—' ? String(c.batch) : 'Other';
            if (!batchUsnsMap.has(b)) batchUsnsMap.set(b, new Set());
            const enrolled = usnsByClass.get(c.id) || [];
            enrolled.forEach(u => batchUsnsMap.get(b).add(u));
        });

        classComparisons.forEach(c => {
            const b = c.batch && c.batch !== '—' ? String(c.batch) : 'Other';
            if (!batchMap.has(b)) {
                batchMap.set(b, {
                    batch: b,
                    classCount: 0,
                    enrolledCount: 0,
                    appeared: 0,
                    passed: 0,
                    failed: 0,
                    distinctionCount: 0,
                    firstClassCount: 0,
                    secondClassCount: 0,
                    passClassCount: 0,
                    backlogCount: 0,
                    sumSGPA: 0,
                    sgpaCount: 0,
                    highestSGPA: 0,
                    lowestSGPA: 10,
                    topper: null,
                    cgpaTopper: null,
                    semesterLeader: null,
                    grades: { O: 0, APlus: 0, A: 0, BPlus: 0, B: 0, C: 0, P: 0, F: 0 },
                    classes: []
                });
            }
            const bEntry = batchMap.get(b);
            bEntry.classCount++;
            bEntry.enrolledCount += c.enrolledCount;
            bEntry.appeared += c.appeared;
            bEntry.passed += c.passed;
            bEntry.failed += c.failed;
            bEntry.distinctionCount += c.distinctionCount;
            bEntry.firstClassCount += c.firstClassCount;
            bEntry.secondClassCount += c.secondClassCount;
            bEntry.passClassCount += (c.passClassCount || 0);
            bEntry.backlogCount += c.backlogCount;
            if (c.avgSGPA > 0 && c.appeared > 0) {
                bEntry.sumSGPA += (c.avgSGPA * c.appeared);
                bEntry.sgpaCount += c.appeared;
            }
            if (c.highestSGPA > bEntry.highestSGPA) {
                bEntry.highestSGPA = c.highestSGPA;
            }
            if (c.lowestSGPA > 0 && c.lowestSGPA < bEntry.lowestSGPA) {
                bEntry.lowestSGPA = c.lowestSGPA;
            }
            Object.keys(c.grades || {}).forEach(k => {
                bEntry.grades[k] = (bEntry.grades[k] || 0) + (c.grades[k] || 0);
            });
            bEntry.classes.push({ id: c.id, name: c.name, passRate: c.passRate, avgSGPA: c.avgSGPA });
        });

        // Compute academic toppers for each batch based on cumulative CGPA across all evaluated semesters
        for (const [b, bEntry] of batchMap.entries()) {
            const usnSet = batchUsnsMap.get(b) || new Set();
            let bestCgpa = 0;
            let bestCgpaTopper = null;
            let peakSemSgpa = 0;
            let peakSemLeader = null;

            usnSet.forEach(usn => {
                let totalCredits = 0;
                let totalCreditPoints = 0;
                let studentPeakSgpa = 0;
                let studentPeakSem = null;

                for (let s = 1; s <= 8; s++) {
                    const r = resultsMap.get(`${usn}|${s}`);
                    if (r && r.sgpa && r.total_credits) {
                        const creds = Number(r.total_credits);
                        const sg = Number(r.sgpa);
                        if (creds > 0 && sg > 0) {
                            totalCredits += creds;
                            totalCreditPoints += (creds * sg);
                        }
                        if (sg > studentPeakSgpa) {
                            studentPeakSgpa = sg;
                            studentPeakSem = s;
                        }
                    }
                }

                const sInfo = studentMap.get(String(usn || '').toUpperCase().trim()) || studentMap.get(usn) || {};
                const studentName = (sInfo.name && sInfo.name.trim() !== '') ? sInfo.name.trim() : usn;

                if (totalCredits > 0) {
                    const cgpa = Number((totalCreditPoints / totalCredits).toFixed(2));
                    if (cgpa > bestCgpa || (cgpa === bestCgpa && totalCredits > (bestCgpaTopper?.credits || 0))) {
                        bestCgpa = cgpa;
                        bestCgpaTopper = {
                            usn,
                            name: studentName,
                            cgpa,
                            credits: totalCredits,
                            label: `${studentName} (${cgpa} CGPA)`
                        };
                    }
                }

                if (studentPeakSgpa > peakSemSgpa) {
                    peakSemSgpa = studentPeakSgpa;
                    peakSemLeader = {
                        usn,
                        name: studentName,
                        sgpa: studentPeakSgpa,
                        semester: studentPeakSem,
                        label: `${studentName} (${studentPeakSgpa} SGPA · Sem ${studentPeakSem})`
                    };
                }
            });

            bEntry.cgpaTopper = bestCgpaTopper;
            bEntry.semesterLeader = peakSemLeader;
            // Primary Cohort Topper is determined by Cumulative Academic CGPA
            bEntry.topper = bestCgpaTopper || peakSemLeader;
        }

        const batchesComparison = Array.from(batchMap.values()).map(b => ({
            ...b,
            passRate: pct(b.passed, b.appeared),
            avgSGPA: b.sgpaCount > 0 ? Number((b.sumSGPA / b.sgpaCount).toFixed(2)) : 0,
            lowestSGPA: b.lowestSGPA === 10 ? 0 : b.lowestSGPA
        })).sort((a, b) => b.batch.localeCompare(a.batch));

        // 6. Overall Comparative Benchmarks
        const sortedByPass = [...classComparisons].filter(c => c.appeared > 0).sort((a, b) => b.passRate - a.passRate || b.avgSGPA - a.avgSGPA);
        const bestClass = sortedByPass[0] || null;

        const totalEnrolled = classComparisons.reduce((acc, c) => acc + c.enrolledCount, 0);
        const totalAppeared = classComparisons.reduce((acc, c) => acc + c.appeared, 0);
        const totalPassed = classComparisons.reduce((acc, c) => acc + c.passed, 0);
        const overallPassRate = pct(totalPassed, totalAppeared);

        const validSgpas = classComparisons.filter(c => c.appeared > 0 && c.avgSGPA > 0).map(c => c.avgSGPA);
        const benchmarkAvgSGPA = validSgpas.length > 0
            ? Number((validSgpas.reduce((a, b) => a + b, 0) / validSgpas.length).toFixed(2))
            : 0;

        const validPassRates = classComparisons.filter(c => c.appeared > 0).map(c => c.passRate);
        const passRateSpread = validPassRates.length > 1
            ? Number((Math.max(...validPassRates) - Math.min(...validPassRates)).toFixed(1))
            : 0;
        const sgpaSpread = validSgpas.length > 1
            ? Number((Math.max(...validSgpas) - Math.min(...validSgpas)).toFixed(2))
            : 0;

        const payload = {
            classes: classComparisons,
            batchesComparison,
            benchmarks: {
                bestClass: bestClass ? {
                    id: bestClass.id,
                    name: bestClass.name,
                    section: bestClass.section,
                    passRate: bestClass.passRate,
                    avgSGPA: bestClass.avgSGPA,
                    topper: bestClass.topper
                } : null,
                totalClasses: classComparisons.length,
                totalEnrolled,
                totalAppeared,
                overallPassRate,
                benchmarkAvgSGPA,
                passRateSpread,
                sgpaSpread
            },
            filters: {
                branch,
                batch,
                semester,
                isFiltered: matchedClasses.length !== allClasses.length
            }
        };

        setCached(cacheKey, payload, 30_000);
        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/classes-compare]', err);
        return fail('Failed to compare classes: ' + (err.message || err), 'CLASSES_COMPARE_ERROR', 500);
    }
}
