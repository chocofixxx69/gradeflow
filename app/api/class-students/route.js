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

        const usns = members.map(m => m.usn);

        const profiles = await fetchByChunks('students', 'usn, name, branch, semester', 'usn', usns, supabaseAdmin);
        const remarks = await fetchByChunks('academic_remarks', 'student_usn, sgpa, semester', 'student_usn', usns, supabaseAdmin);
        const resultRows = await fetchByChunks('results', 'usn, semester, sgpa, total_credits', 'usn', usns, supabaseAdmin);
        const marks = await fetchByChunks('subject_marks', 'usn, semester, subject_code, subject_name, grade, total, is_backlog', 'usn', usns, supabaseAdmin);

        const creditsMap = {};
        (resultRows || []).forEach(r => {
            if (!creditsMap[r.usn]) creditsMap[r.usn] = {};
            const prev = creditsMap[r.usn][r.semester] || 0;
            creditsMap[r.usn][r.semester] = Math.max(prev, r.total_credits || 0);
        });

        const remarksByUsn = {};
        (remarks || []).forEach(r => (remarksByUsn[r.student_usn] ||= []).push(r));
        const cgpaMap = {};
        usns.forEach(usn => {
            cgpaMap[usn] = weightedCGPA(remarksByUsn[usn] || [], creditsMap[usn] || {});
        });

        const marksByUsn = {};
        (marks || []).forEach(m => (marksByUsn[m.usn] ||= []).push(m));
        const backlogMap = {};
        usns.forEach(usn => {
            backlogMap[usn] = computeBacklogs(marksByUsn[usn] || []).totalBacklogs;
        });

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.usn] = p; });

        const hasResultsMap = {};
        usns.forEach(usn => {
            const hasR = Boolean(
                (remarksByUsn[usn] && remarksByUsn[usn].length > 0) ||
                (marksByUsn[usn] && marksByUsn[usn].length > 0) ||
                (creditsMap[usn] && Object.keys(creditsMap[usn]).length > 0)
            );
            hasResultsMap[usn] = hasR;
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
        usns.forEach(usn => { semDataByUsn[usn.toUpperCase()] = {}; });

        const excludeGrades = new Set(['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE']);

        // 1. Group marks by uppercase USN and semester
        const marksGrouped = {};
        (marks || []).forEach(m => {
            const u = (m.usn || '').toUpperCase().trim();
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
                    const isFail = m.is_backlog || g === 'F' || g === 'A' || (m.total != null && tot < 40);
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
            const u = (r.student_usn || '').toUpperCase().trim();
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
            const u = (r.usn || '').toUpperCase().trim();
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

        const students = members.map(m => {
            const normUsn = (m.usn || '').toUpperCase().trim();
            const hasData = hasResultsMap[normUsn] || hasResultsMap[m.usn] || false;
            const computedSem = maxSemByUsn[normUsn] || Number(profileMap[normUsn]?.semester || profileMap[m.usn]?.semester) || classSem;
            return {
                id: m.id,
                usn: m.usn,
                name: profileMap[normUsn]?.name || profileMap[m.usn]?.name || m.usn,
                branch: profileMap[normUsn]?.branch || profileMap[m.usn]?.branch || classData?.branch || '—',
                semester: computedSem,
                cgpa: hasData && cgpaMap[m.usn] != null ? cgpaMap[m.usn] : null,
                total_backlogs: hasData ? (backlogMap[m.usn] ?? 0) : null,
                semester_data: semDataByUsn[normUsn] || semDataByUsn[m.usn] || {},
                has_data: hasData,
                added_at: m.created_at,
            };
        });

        return NextResponse.json({ success: true, students });
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
