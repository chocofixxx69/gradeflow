import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents, fetchDynamicMarks } from '@/lib/analytics-data';
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
        const semester = parseInt(searchParams.get('semester') || '3', 10);
        const sectionMode = (searchParams.get('sectionMode') || 'auto').toLowerCase().trim();

        const cacheKey = `sections_compare:${branch}:${batch}:${semester}:${sectionMode}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students for the requested branch & batch
        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { branch });
        let students = rawStudents || [];
        if (branch && branch !== 'ALL') {
            students = students.filter(s => matchesBranch(s, branch));
        }
        if (batch && batch !== 'ALL') {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }

        const studentByUsn = new Map();
        students.forEach(s => studentByUsn.set(s.usn, s));
        const usns = students.map(s => s.usn);

        // 2. Fetch marks for this semester across all scoped students
        const marks = await fetchDynamicMarks(supabaseAdmin, {
            usns,
            semester,
            select: 'usn, subject_code, subject_name, internal, external, total, grade, passed, is_backlog'
        });

        const marksByUsn = new Map();
        marks.forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        const activeUsns = Array.from(marksByUsn.keys()).sort();

        // 3. Fetch classes, class_students mappings, and faculty list
        const [
            { data: rawClasses },
            { data: rawClassStudents },
            { data: rawFaculty }
        ] = await Promise.all([
            supabaseAdmin.from('classes').select('id, name, branch, semester, section, faculty_id'),
            supabaseAdmin.from('class_students').select('class_id, usn'),
            supabaseAdmin.from('faculty_onboarding').select('id, full_name, email')
        ]);

        const classById = new Map((rawClasses || []).map(c => [c.id, c]));
        const facultyById = new Map((rawFaculty || []).map(f => [f.id, f]));
        const usnToSectionMap = new Map();

        (rawClassStudents || []).forEach(cs => {
            const c = classById.get(cs.class_id);
            if (c && c.section) {
                usnToSectionMap.set(cs.usn, c.section.toUpperCase());
            }
        });

        // 4. Sections list — REAL sections only, ever. A "section" here always
        // means a class actually created in Classes & Sections (app/faculty/classes)
        // with students actually rostered into it via class_students. There used
        // to be a fallback that invented 'A'/'B'/'C' buckets and evenly chunked
        // every student without a real class assignment into them by array index
        // — meaning "Section Topper" was just whichever student landed first in an
        // arbitrary USN-sorted slice, not the actual top student of any real
        // section. sectionMode ('2'/'3'/'4') now only controls how many of the
        // real detected sections to show (capped), never invents ones that don't
        // exist; students with no real class/section assignment are reported
        // separately as unsectioned rather than silently folded into a fake one.
        const matchingClasses = (rawClasses || []).filter(c =>
            (c.semester ? Number(c.semester) === semester : true) &&
            (branch === 'ALL' || matchesBranch(c.branch, branch))
        );
        const detectedSections = Array.from(new Set(matchingClasses.map(c => (c.section || '').toUpperCase()).filter(Boolean))).sort();

        let sectionsList = detectedSections;
        if (sectionMode === '2' || sectionMode === '3' || sectionMode === '4') {
            sectionsList = detectedSections.slice(0, Number(sectionMode));
        }

        if (sectionsList.length === 0) {
            const empty = {
                branch, batch, semester, sectionMode,
                sections: [],
                sectionComparisons: [],
                subjectMatrix: [],
                unassignedCount: activeUsns.length,
                noRealSections: true,
                benchmarks: { bestSection: '—', totalEvaluated: 0, benchmarkAvg: 0, sectionSpread: 0, subjectCount: 0 },
            };
            setCached(cacheKey, empty, 30_000);
            return ok(empty);
        }

        // 5. Partition active students into REAL sections only — via their actual
        // class_students -> classes.section assignment. No redistribution, ever.
        const studentsBySection = new Map();
        sectionsList.forEach(sec => studentsBySection.set(sec, []));

        const unassignedUsns = [];
        activeUsns.forEach(u => {
            const explicitSec = usnToSectionMap.get(u);
            if (explicitSec && studentsBySection.has(explicitSec)) {
                studentsBySection.get(explicitSec).push(studentByUsn.get(u) || { usn: u, name: u });
            } else {
                unassignedUsns.push(u);
            }
        });

        // 6. Compute metrics per section
        const sectionComparisons = [];
        const subjectSectionMap = new Map(); // subject_code -> Map(sec -> { appeared, passed })

        const classes = rawClasses || [];

        sectionsList.forEach(sec => {
            const secStudents = studentsBySection.get(sec) || [];
            const secClass = classes.find(c => 
                (c.section || '').toUpperCase() === sec && 
                (Number(c.semester) === semester || !c.semester) &&
                (branch === 'ALL' || matchesBranch(c.branch, branch))
            );
            const teacher = secClass ? facultyById.get(secClass.faculty_id) : null;

            let appeared = 0;
            let passed = 0;
            let failed = 0;
            let totalMarksSum = 0;
            let marksCount = 0;
            let highestTotal = 0;
            let topperName = '—';

            // Grade distribution counters
            const grades = { O: 0, APlus: 0, A: 0, BPlus: 0, B: 0, C: 0, P: 0, F: 0 };

            secStudents.forEach(s => {
                const uMarks = marksByUsn.get(s.usn) || [];
                if (uMarks.length === 0) return;

                appeared++;
                const hasFail = uMarks.some(isFailedSubject);
                if (hasFail) {
                    failed++;
                } else {
                    passed++;
                }

                let stuTotal = 0;
                uMarks.forEach(m => {
                    const score = Number(m.total) || 0;
                    stuTotal += score;
                    totalMarksSum += score;
                    marksCount++;

                    // Tally grade
                    const gr = String(m.grade || '').toUpperCase().trim();
                    if (gr === 'O') grades.O++;
                    else if (gr === 'A+' || gr === 'A_PLUS') grades.APlus++;
                    else if (gr === 'A') grades.A++;
                    else if (gr === 'B+' || gr === 'B_PLUS') grades.BPlus++;
                    else if (gr === 'B') grades.B++;
                    else if (gr === 'C') grades.C++;
                    else if (gr === 'P') grades.P++;
                    else if (isFailedSubject(m)) grades.F++;

                    const code = (m.subject_code || '').toUpperCase();
                    if (!subjectSectionMap.has(code)) {
                        subjectSectionMap.set(code, {
                            code,
                            name: m.subject_name || code,
                            sections: new Map()
                        });
                    }
                    const subObj = subjectSectionMap.get(code);
                    const sStat = subObj.sections.get(sec) || { appeared: 0, passed: 0 };
                    sStat.appeared++;
                    if (!isFailedSubject(m)) sStat.passed++;
                    subObj.sections.set(sec, sStat);
                });

                if (stuTotal > highestTotal) {
                    highestTotal = stuTotal;
                    topperName = `${s.name} (${s.usn})`;
                }
            });

            const passRate = pct(passed, appeared);
            const avgScore = marksCount > 0 ? Number((totalMarksSum / marksCount).toFixed(1)) : 0;

            sectionComparisons.push({
                section: `Section ${sec}`,
                sectionKey: sec,
                facultyName: teacher?.full_name || 'Faculty Not Assigned',
                enrolled: secStudents.length,
                appeared,
                passed,
                failed,
                passRate,
                avgScore,
                highestScore: highestTotal,
                topper: topperName,
                grades,
                standing: {
                    allClear: passed,
                    withBacklogs: failed
                }
            });
        });

        // 7. Build subject matrix across sections
        const subjectMatrix = Array.from(subjectSectionMap.values()).map(sub => {
            const passRates = {};
            let highestRate = -1;
            let lowestRate = 101;
            let bestSec = null;

            sectionsList.forEach(sec => {
                const stat = sub.sections.get(sec);
                if (stat && stat.appeared > 0) {
                    const rate = pct(stat.passed, stat.appeared);
                    passRates[sec] = rate;
                    if (rate > highestRate) {
                        highestRate = rate;
                        bestSec = sec;
                    }
                    if (rate < lowestRate) {
                        lowestRate = rate;
                    }
                } else {
                    passRates[sec] = null;
                }
            });

            const delta = (highestRate >= 0 && lowestRate <= 100) ? Number((highestRate - lowestRate).toFixed(1)) : 0;

            return {
                code: sub.code,
                name: sub.name,
                rates: passRates,
                bestSection: bestSec,
                gap: delta
            };
        }).sort((a, b) => a.code.localeCompare(b.code));

        // 8. Overall Benchmarks
        const bestSectionObj = [...sectionComparisons].sort((a, b) => b.passRate - a.passRate)[0];
        const passRates = sectionComparisons.filter(s => s.appeared > 0).map(s => s.passRate);
        const sectionSpread = passRates.length > 1 ? Number((Math.max(...passRates) - Math.min(...passRates)).toFixed(1)) : 0;
        const totalMarksAcrossAll = sectionComparisons.reduce((acc, s) => acc + (s.avgScore * s.appeared), 0);
        const totalAppeared = sectionComparisons.reduce((acc, s) => acc + s.appeared, 0);
        const benchmarkAvg = totalAppeared > 0 ? Number((totalMarksAcrossAll / totalAppeared).toFixed(1)) : 0;

        const payload = {
            branch,
            batch,
            semester,
            sectionMode,
            sections: sectionsList,
            sectionComparisons,
            subjectMatrix,
            unassignedCount: unassignedUsns.length,
            noRealSections: false,
            benchmarks: {
                bestSection: bestSectionObj ? `${bestSectionObj.section} (${bestSectionObj.passRate}%)` : '—',
                totalEvaluated: totalAppeared,
                benchmarkAvg,
                sectionSpread,
                subjectCount: subjectMatrix.length
            }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/sections-compare]', err);
        return fail('Failed to compare class sections: ' + (err.message || err), 'SECTIONS_COMPARE_ERROR', 500);
    }
}
