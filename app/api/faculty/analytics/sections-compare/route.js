import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
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
        const branch = (searchParams.get('branch') || 'CS').toUpperCase().trim();
        const semester = parseInt(searchParams.get('semester') || '3', 10);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch classes in this branch & semester
        const [
            { data: rawClasses },
            { data: rawFaculty },
            { data: rawStudents }
        ] = await Promise.all([
            supabaseAdmin
                .from('classes')
                .select('id, name, branch, semester, section, faculty_id')
                .ilike('branch', `%${branch}%`)
                .eq('semester', semester),
            supabaseAdmin.from('faculty_onboarding').select('id, full_name, email'),
            supabaseAdmin.from('students').select('id, usn, name, branch, semester').ilike('branch', `%${branch}%`).eq('semester', semester)
        ]);

        const classes = rawClasses || [];
        const facultyList = rawFaculty || [];
        const students = rawStudents || [];

        // Identify available sections
        let sectionsList = Array.from(new Set(classes.map(c => (c.section || 'A').toUpperCase()))).sort();
        if (sectionsList.length === 0) {
            sectionsList = ['A', 'B']; // Fallback sections
        }

        // 2. Fetch class students mapping with real schema (class_id, usn)
        const classIds = classes.map(c => c.id);
        const { data: rawClassStudents } = await supabaseAdmin
            .from('class_students')
            .select('class_id, usn')
            .in('class_id', classIds);

        const classStudents = rawClassStudents || [];

        // Partition students by section
        const studentsBySection = new Map();
        sectionsList.forEach(sec => studentsBySection.set(sec, []));

        const studentByUsn = new Map();
        students.forEach(s => studentByUsn.set(s.usn, s));

        // Distribute mapped students from real class_students
        classes.forEach(c => {
            const sec = (c.section || 'A').toUpperCase();
            const enrolledUsns = classStudents.filter(cs => cs.class_id === c.id).map(cs => cs.usn);
            const current = studentsBySection.get(sec) || [];
            enrolledUsns.forEach(u => {
                const stu = studentByUsn.get(u) || { usn: u, name: u };
                if (!current.some(item => item.usn === u)) current.push(stu);
            });
            studentsBySection.set(sec, current);
        });

        // If a section in classes has no class_students rows yet, check general students for that branch
        if (Array.from(studentsBySection.values()).every(arr => arr.length === 0) && students.length > 0) {
            const secCount = sectionsList.length || 2;
            students.forEach((s, i) => {
                const sec = sectionsList[i % secCount];
                const list = studentsBySection.get(sec) || [];
                list.push(s);
                studentsBySection.set(sec, list);
            });
        }

        // 3. Fetch marks for all these students in this semester
        const allUsns = Array.from(new Set(Array.from(studentsBySection.values()).flatMap(arr => arr.map(s => s.usn))));
        const { data: rawMarks } = await supabaseAdmin
            .from('subject_marks')
            .select('usn, subject_code, subject_name, internal, external, total, grade, passed')
            .in('usn', allUsns)
            .eq('semester', semester);

        const marks = rawMarks || [];

        const marksByUsn = new Map();
        marks.forEach(m => {
            const list = marksByUsn.get(m.usn) || [];
            list.push(m);
            marksByUsn.set(m.usn, list);
        });

        // 4. Compute metrics per section
        const sectionComparisons = [];
        const subjectSectionMap = new Map(); // subject_code -> Map(sec -> { appeared, passed })

        sectionsList.forEach(sec => {
            const secStudents = studentsBySection.get(sec) || [];
            const secClass = classes.find(c => (c.section || 'A').toUpperCase() === sec);
            const teacher = facultyList.find(f => f.id === secClass?.faculty_id);

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

        return ok({
            branch,
            semester,
            sections: sectionsList,
            sectionComparisons,
            subjectMatrix
        });
    } catch (err) {
        console.error('[GET /api/faculty/analytics/sections-compare]', err);
        return fail('Failed to compare class sections: ' + (err.message || err), 'SECTIONS_COMPARE_ERROR', 500);
    }
}
