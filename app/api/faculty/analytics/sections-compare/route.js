import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents, fetchDynamicMarks } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBranch } from '@/lib/semester-utils';
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
        const semester = parseInt(searchParams.get('semester') || '3', 10);

        const cacheKey = `sections_compare:${branch}:${semester}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch students for the requested branch/institution
        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { branch });
        let students = rawStudents || [];
        if (branch && branch !== 'ALL') {
            students = students.filter(s => matchesBranch(s, branch));
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

        const activeUsns = Array.from(marksByUsn.keys());

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

        // Dynamically detect all sections present in the classes database
        const sectionsSet = new Set();
        (rawClasses || []).forEach(c => {
            if (c.section) sectionsSet.add(c.section.toUpperCase());
        });
        if (sectionsSet.size === 0) {
            sectionsSet.add('A');
            sectionsSet.add('B');
        }
        const sectionsList = Array.from(sectionsSet).sort();

        // 4. Partition active students into dynamic sections
        const studentsBySection = new Map();
        sectionsList.forEach(sec => studentsBySection.set(sec, []));

        activeUsns.forEach(u => {
            const s = studentByUsn.get(u) || { usn: u, name: u };
            let assignedSec = usnToSectionMap.get(u);
            if (!assignedSec || !studentsBySection.has(assignedSec)) {
                // Determine section by standard USN sequence split if not in class_students
                const match = u.match(/\d+$/);
                const num = match ? parseInt(match[0], 10) : 1;
                assignedSec = (num <= 60 && num < 400) ? 'A' : 'B';
                if (!studentsBySection.has(assignedSec)) assignedSec = sectionsList[0];
            }
            studentsBySection.get(assignedSec).push(s);
        });

        // 5. Compute metrics per section
        const sectionComparisons = [];
        const subjectSectionMap = new Map(); // subject_code -> Map(sec -> { appeared, passed })

        const classes = rawClasses || [];
        const facultyList = rawFaculty || [];

        sectionsList.forEach(sec => {
            const secStudents = studentsBySection.get(sec) || [];
            const secClass = classes.find(c => (c.section || '').toUpperCase() === sec && (Number(c.semester) === semester || !c.semester));
            const teacher = secClass ? facultyById.get(secClass.faculty_id) : null;

            let appeared = 0;
            let passed = 0;
            let failed = 0;
            let totalMarksSum = 0;
            let marksCount = 0;
            let highestTotal = 0;
            let topperName = '—';

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
                topper: topperName
            });
        });

        // 5. Build subject matrix across sections
        const subjectMatrix = Array.from(subjectSectionMap.values()).map(sub => {
            const passRates = {};
            sectionsList.forEach(sec => {
                const stat = sub.sections.get(sec);
                passRates[sec] = stat && stat.appeared > 0 ? pct(stat.passed, stat.appeared) : null;
            });
            return {
                code: sub.code,
                name: sub.name,
                rates: passRates
            };
        }).sort((a, b) => a.code.localeCompare(b.code));

        const payload = {
            branch,
            semester,
            sections: sectionsList,
            sectionComparisons,
            subjectMatrix
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/sections-compare]', err);
        return fail('Failed to compare class sections: ' + (err.message || err), 'SECTIONS_COMPARE_ERROR', 500);
    }
}
