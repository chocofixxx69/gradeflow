import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBranch, matchesBatch } from '@/lib/semester-utils';
import { isFailedSubject } from '@/lib/vtuGrades';

export const dynamic = 'force-dynamic';

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

        const cacheKey = `classes_compare:${branch}:${batch}:${semester}:${classIdsParam || 'all'}`;
        const forceFresh = searchParams.get('fresh') === '1' || searchParams.has('t');
        if (!forceFresh) {
            const cached = getCached(cacheKey);
            if (cached) return ok(cached);
        }

        const supabaseAdmin = getAdminClient();

        // 1. Fetch all classes
        const { data: rawClasses, error: classErr } = await supabaseAdmin
            .from('classes')
            .select('id, name, branch, semester, section, batch, academic_year, faculty_id, scheme, branch_code');

        if (classErr) {
            console.error('[classes-compare] Error fetching classes:', classErr);
            return fail('Failed to fetch classes: ' + classErr.message, 'CLASSES_FETCH_ERROR', 500);
        }

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
                matchedClasses = matchedClasses.filter(c => !c.semester || Number(c.semester) === Number(semester));
            }
        }

        // If no matching classes found with strict filters, fallback to all classes or branch classes
        // so faculty can always compare existing classes in the college
        const displayClasses = matchedClasses.length > 0 ? matchedClasses : allClasses;

        // 2. Fetch class_students, faculty, students
        const classIdsToFetch = displayClasses.map(c => c.id);
        const [
            { data: rawClassStudents },
            { data: rawFaculty },
            { data: rawStudents }
        ] = await Promise.all([
            classIdsToFetch.length > 0
                ? supabaseAdmin.from('class_students').select('class_id, usn')
                : { data: [] },
            supabaseAdmin.from('faculty_onboarding').select('id, full_name, email'),
            supabaseAdmin.from('students').select('id, usn, name, branch, semester, year, branch_code')
        ]);

        const facultyMap = new Map((rawFaculty || []).map(f => [f.id, f]));
        const studentMap = new Map((rawStudents || []).map(s => [s.usn, s]));

        // Group enrolled USNs by class ID
        const usnsByClass = new Map();
        (rawClassStudents || []).forEach(cs => {
            if (!usnsByClass.has(cs.class_id)) usnsByClass.set(cs.class_id, []);
            usnsByClass.get(cs.class_id).push(cs.usn);
        });

        // Collect all unique USNs to fetch results and subject marks in bulk
        const allUsns = Array.from(new Set((rawClassStudents || []).map(cs => cs.usn)));

        // 3. Fetch results and subject marks for these students
        let allResults = [];
        let allMarks = [];

        if (allUsns.length > 0) {
            // Fetch in chunks of 500
            const chunkSize = 500;
            const resPromises = [];
            const marksPromises = [];

            const targetSemesters = semester !== 'ALL'
                ? [Number(semester)]
                : Array.from(new Set(displayClasses.map(c => Number(c.semester)).filter(Boolean)));

            for (let i = 0; i < allUsns.length; i += chunkSize) {
                const chunk = allUsns.slice(i, i + chunkSize);
                let rQuery = supabaseAdmin.from('results').select('usn, semester, sgpa, total_credits').in('usn', chunk);
                let mQuery = supabaseAdmin.from('subject_marks').select('usn, semester, subject_code, subject_name, grade, passed, is_backlog, total, credits').in('usn', chunk);

                if (targetSemesters.length > 0) {
                    rQuery = rQuery.in('semester', targetSemesters);
                    mQuery = mQuery.in('semester', targetSemesters);
                }

                resPromises.push(rQuery);
                marksPromises.push(mQuery);
            }

            const [resResults, marksResults] = await Promise.all([
                Promise.all(resPromises),
                Promise.all(marksPromises)
            ]);

            allResults = resResults.flatMap(r => r.data || []);
            allMarks = marksResults.flatMap(m => m.data || []);
        }

        // Map results and marks by `${usn}|${semester}`
        const resultsMap = new Map();
        allResults.forEach(r => {
            const key = `${r.usn}|${r.semester}`;
            resultsMap.set(key, r);
        });

        const marksMap = new Map();
        allMarks.forEach(m => {
            const key = `${m.usn}|${m.semester}`;
            if (!marksMap.has(key)) marksMap.set(key, []);
            marksMap.get(key).push(m);
        });

        // 4. Compute metrics for each class
        const classComparisons = displayClasses.map(c => {
            const enrolledUsns = usnsByClass.get(c.id) || [];
            const teacher = facultyMap.get(c.faculty_id);
            const targetSem = c.semester ? Number(c.semester) : (semester !== 'ALL' ? Number(semester) : null);

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
                const hasFail = uMarks.some(isFailedSubject);
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
                        const sInfo = studentMap.get(usn);
                        topperObj = {
                            usn,
                            name: sInfo?.name || usn,
                            sgpa: studentSgpa
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

            return {
                id: c.id,
                name: c.name,
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
                backlogCount: failed,
                topper: topperObj,
                grades,
                subjectSummary
            };
        });

        // 5. Overall Comparative Benchmarks
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
