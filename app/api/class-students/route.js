import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { weightedCGPA, computeBacklogs } from '../../../lib/analytics-data';
import { fetchByChunks } from '../../../lib/supabase-utils';
import { getGradePoint } from '../../../lib/vtuGrades';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

// GET — students in a class, joined with their CGPA/backlog data
export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const class_id = searchParams.get('class_id');
        if (!class_id) return NextResponse.json({ error: 'class_id required.' }, { status: 400 });

        const members = await fetchByChunks('class_students', 'id, usn, created_at', 'class_id', [class_id], supabaseAdmin);

        if (!members || members.length === 0) {
            return NextResponse.json({ success: true, students: [] });
        }

        // Collect BOTH the raw USN and the uppercase form — query with both to
        // guarantee we match regardless of case stored in each table.
        const rawUsns = members.map(m => m.usn);
        const upperUsns = rawUsns.map(u => (u || '').toUpperCase().trim());
        const allQueryUsns = [...new Set([...rawUsns, ...upperUsns])];

        const [profiles, remarks, resultRows, marks] = await Promise.all([
            fetchByChunks('students', 'usn, name, branch, semester', 'usn', allQueryUsns, supabaseAdmin),
            fetchByChunks('academic_remarks', 'student_usn, sgpa, semester', 'student_usn', allQueryUsns, supabaseAdmin),
            fetchByChunks('results', 'usn, semester, sgpa, total_credits', 'usn', allQueryUsns, supabaseAdmin),
            fetchByChunks('subject_marks', 'usn, semester, subject_code, subject_name, grade, internal, external, total, credits, is_backlog, announced_date, result_id', 'usn', allQueryUsns, supabaseAdmin),
        ]);

        // ── ALL index maps are keyed by UPPERCASE USN ──
        // This is the single normalization point — every lookup below uses norm().
        const norm = usn => (usn || '').toUpperCase().trim();

        const creditsMap = {};
        (resultRows || []).forEach(r => {
            const u = norm(r.usn);
            if (!creditsMap[u]) creditsMap[u] = {};
            const prev = creditsMap[u][r.semester] || 0;
            creditsMap[u][r.semester] = Math.max(prev, r.total_credits || 0);
        });

        const remarksByUsn = {};
        (remarks || []).forEach(r => (remarksByUsn[norm(r.student_usn)] ||= []).push(r));

        const cgpaMap = {};
        upperUsns.forEach(u => {
            cgpaMap[u] = weightedCGPA(remarksByUsn[u] || [], creditsMap[u] || {});
        });

        const marksByUsn = {};
        (marks || []).forEach(m => (marksByUsn[norm(m.usn)] ||= []).push(m));

        const backlogMap = {};
        upperUsns.forEach(u => {
            backlogMap[u] = computeBacklogs(marksByUsn[u] || []).totalBacklogs;
        });

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[norm(p.usn)] = p; });

        const hasResultsMap = {};
        upperUsns.forEach(u => {
            hasResultsMap[u] = Boolean(
                (remarksByUsn[u] && remarksByUsn[u].length > 0) ||
                (marksByUsn[u] && marksByUsn[u].length > 0) ||
                (creditsMap[u] && Object.keys(creditsMap[u]).length > 0)
            );
        });

        // Fetch class metadata to fallback to class semester if needed
        const { data: classData } = await supabaseAdmin
            .from('classes')
            .select('semester, branch, scheme')
            .eq('id', class_id)
            .maybeSingle();

        const classSem = Number(classData?.semester) || 1;

        const maxSemByUsn = {};
        const semDataByUsn = {};
        upperUsns.forEach(u => { semDataByUsn[u] = {}; });

        const excludeGrades = new Set(['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE']);

        // 1. Group marks by uppercase USN and semester
        const marksGrouped = {};
        (marks || []).forEach(m => {
            const u = norm(m.usn);
            const s = Number(m.semester);
            if (u && s) {
                maxSemByUsn[u] = Math.max(maxSemByUsn[u] || 0, s);
                if (!marksGrouped[u]) marksGrouped[u] = {};
                if (!marksGrouped[u][s]) marksGrouped[u][s] = [];
                marksGrouped[u][s].push(m);
            }
        });

        // 2. Compute exact SGPA and backlogs per (USN, semester) from marks
        Object.entries(marksGrouped).forEach(([u, semMap]) => {
            if (!semDataByUsn[u]) semDataByUsn[u] = {};

            Object.entries(semMap).forEach(([semStr, semMarks]) => {
                const sem = Number(semStr);
                let tc = 0;
                let tcp = 0;
                let bCount = 0;

                semMarks.forEach(m => {
                    const g = (m.grade || 'F').trim().toUpperCase();
                    const tot = Number(m.total) || 0;
                    const ext = Number(m.external) || 0;
                    const isFail = m.is_backlog === true || m.is_backlog === 'true'
                        || g === 'F' || g === 'A' || g === 'FAIL' || g === 'ABSENT'
                        || g === 'NP' || g === 'NE' || g === 'X'
                        || (ext > 0 && ext < 18) || (tot > 0 && tot < 40);
                    if (isFail) bCount++;

                    if (excludeGrades.has(g)) return;
                    const cr = Number(m.credits) || 3;
                    const gp = getGradePoint(g, '2022', tot, ext);
                    tc += cr;
                    tcp += (gp * cr);
                });

                const calcSgpa = tc > 0 ? Number((tcp / tc).toFixed(2)) : 0.0;
                semDataByUsn[u][sem] = {
                    sgpa: calcSgpa,
                    backlogs: bCount,
                    total_credits: tc
                };
            });
        });

        // 3. Fallback to academic_remarks & results if marks not present for a semester
        (remarks || []).forEach(r => {
            const u = norm(r.student_usn);
            const s = Number(r.semester);
            if (u && s) {
                maxSemByUsn[u] = Math.max(maxSemByUsn[u] || 0, s);
                if (!semDataByUsn[u]) semDataByUsn[u] = {};
                if (!semDataByUsn[u][s]) semDataByUsn[u][s] = { backlogs: 0 };
                if (semDataByUsn[u][s].sgpa == null || semDataByUsn[u][s].sgpa === 0) {
                    semDataByUsn[u][s].sgpa = Number(r.sgpa) || 0;
                }
            }
        });

        (resultRows || []).forEach(r => {
            const u = norm(r.usn);
            const s = Number(r.semester);
            if (u && s) {
                maxSemByUsn[u] = Math.max(maxSemByUsn[u] || 0, s);
                if (!semDataByUsn[u]) semDataByUsn[u] = {};
                if (!semDataByUsn[u][s]) semDataByUsn[u][s] = { backlogs: 0 };
                if ((semDataByUsn[u][s].sgpa == null || semDataByUsn[u][s].sgpa === 0) && r.sgpa) {
                    semDataByUsn[u][s].sgpa = Number(r.sgpa) || 0;
                }
            }
        });

        // ── Build final student list — ALL lookups via norm(usn) ──
        const students = members.map(m => {
            const u = norm(m.usn);
            const hasData = hasResultsMap[u] || false;
            const computedSem = maxSemByUsn[u] || Number(profileMap[u]?.semester) || classSem;
            return {
                id: m.id,
                usn: m.usn,
                name: profileMap[u]?.name || m.usn,
                branch: profileMap[u]?.branch || classData?.branch || '—',
                semester: computedSem,
                cgpa: hasData && cgpaMap[u] != null ? cgpaMap[u] : null,
                total_backlogs: hasData ? (backlogMap[u] ?? 0) : null,
                semester_data: semDataByUsn[u] || {},
                has_data: hasData,
                added_at: m.created_at,
            };
        });

        const exportSem = searchParams.get('export_sem');
        let exportMarksData = null;
        let exportCatData = null;

        if (exportSem) {
            const semNum = Number(exportSem);
            exportMarksData = (marks || []).filter(m => Number(m.semester) === semNum);
            
            const { data: catData } = await supabaseAdmin
                .from('subject_catalog')
                .select('id, subject_code, subject_name, credits')
                .eq('scheme', classData?.scheme || '2022')
                .eq('branch', classData?.branch || 'CS')
                .eq('semester', semNum);

            exportCatData = catData || [];
        }

        return NextResponse.json({ 
            success: true, 
            students, 
            marksData: exportMarksData, 
            catData: exportCatData 
        });
    } catch (err) {
        console.error('[GET /api/class-students]', err);
        return NextResponse.json({ error: 'Failed to fetch students.' }, { status: 500 });
    }
}

// POST — add student(s) to a class
export async function POST(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const { class_id, usn, students: rawStudentObjects } = body || {};
        if (!class_id) return NextResponse.json({ error: 'class_id required.' }, { status: 400 });

        let parsedStudents = [];

        if (Array.isArray(rawStudentObjects) && rawStudentObjects.length > 0) {
            parsedStudents = rawStudentObjects
                .filter(s => s && (s.usn || s.USN))
                .map(s => ({
                    usn: String(s.usn || s.USN).toUpperCase().trim(),
                    name: (s.name || s.Name || s.student_name || '').trim() || String(s.usn || s.USN).toUpperCase().trim(),
                    branch: (s.branch || s.Branch || '').trim() || null,
                    semester: parseInt(s.semester || s.Semester) || null
                }));
        } else if (usn) {
            let rawUsns = Array.isArray(usn) ? usn : String(usn).split(/[\n,;]+/).map(u => u.trim());
            parsedStudents = rawUsns
                .map(u => u.toUpperCase().trim())
                .filter(Boolean)
                .map(u => ({ usn: u, name: u }));
        }

        const isValidUsnFormat = (str) => {
            if (!str || str.length < 7 || str.length > 12) return false;
            const val = str.toUpperCase();
            return /[A-Z]/.test(val) && /[0-9]/.test(val);
        };

        parsedStudents = parsedStudents.filter(s => isValidUsnFormat(s.usn));

        if (parsedStudents.length === 0) {
            return NextResponse.json({ error: 'No valid USN or student data provided.' }, { status: 400 });
        }

        // Deduplicate by USN
        const usnMap = new Map();
        parsedStudents.forEach(s => {
            if (s.usn && !usnMap.has(s.usn)) {
                usnMap.set(s.usn, s);
            }
        });
        const uniqueStudents = Array.from(usnMap.values());
        const usns = uniqueStudents.map(s => s.usn);

        // Upsert student profiles into `students` table
        const toUpsert = uniqueStudents.map(s => {
            const row = { usn: s.usn, name: s.name || s.usn };
            if (s.branch) row.branch = s.branch;
            if (s.semester) row.semester = s.semester;
            return row;
        });

        for (let i = 0; i < toUpsert.length; i += 100) {
            try {
                await supabaseAdmin.from('students')
                    .upsert(toUpsert.slice(i, i + 100), { onConflict: 'usn' });
            } catch (e) {
                console.error('[POST /api/class-students] student upsert error:', e);
            }
        }

        // Fetch existing members for this class to avoid duplicates
        const { data: existingMembers } = await supabaseAdmin
            .from('class_students')
            .select('usn')
            .eq('class_id', class_id);

        const existingSet = new Set((existingMembers || []).map(m => m.usn.toUpperCase()));
        const newUsnsToInsert = usns.filter(u => !existingSet.has(u));

        if (newUsnsToInsert.length > 0) {
            const rows = newUsnsToInsert.map(u => ({ class_id, usn: u }));
            for (let i = 0; i < rows.length; i += 100) {
                const { error: insErr } = await supabaseAdmin
                    .from('class_students')
                    .insert(rows.slice(i, i + 100));
                if (insErr) {
                    console.error('[POST /api/class-students] class_students insert error:', insErr);
                }
            }
        }

        return NextResponse.json({ success: true, added: newUsnsToInsert.length || usns.length });
    } catch (err) {
        console.error('[POST /api/class-students]', err);
        return NextResponse.json({ error: err.message || 'Failed to add student.' }, { status: 500 });
    }
}

// DELETE — remove a student from a class
export async function DELETE(req) {
    try {
        const body = await req.json().catch(() => ({}));
        const { class_id, usn } = body || {};
        if (!class_id || !usn) return NextResponse.json({ error: 'class_id and usn required.' }, { status: 400 });

        const { error } = await supabaseAdmin
            .from('class_students')
            .delete()
            .eq('class_id', class_id)
            .eq('usn', usn.toUpperCase().trim());

        if (error) throw error;
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/class-students]', err);
        return NextResponse.json({ error: 'Failed to remove student.' }, { status: 500 });
    }
}
