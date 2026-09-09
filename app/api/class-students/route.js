import { NextResponse } from 'next/server';
import { fetchByChunks } from '../../../lib/supabase-utils';
import { calculateAcademicRecord, normalizeBranch } from '../../../lib/vtuAcademicEngine';
import { fetchCatalogIndex } from '../../../lib/subjectCreditResolver';
import { getAdminClient, findFacultyAssignment } from '../../../lib/analytics-data';
import { requireStaff } from '../../../lib/server-session';
import { generateFormulaPassword, hashStudentPassword } from '../../../lib/student-auth';
import { logFacultyActivityServer } from '../../../lib/server-audit';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

// GET — students in a class, joined with their CGPA/backlog data
export async function GET(req) {
    const { session, error: authError } = requireStaff(req);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const class_id = searchParams.get('class_id');
        if (!class_id) return NextResponse.json({ error: 'class_id required.' }, { status: 400 });

        const [{ data: members, error: mErr }, { data: classData }, catalogIndex] = await Promise.all([
            supabaseAdmin
                .from('class_students')
                .select('id, usn, created_at')
                .eq('class_id', class_id)
                .order('usn', { ascending: true }),
            supabaseAdmin
                .from('classes')
                .select('semester, branch, scheme')
                .eq('id', class_id)
                .maybeSingle(),
            fetchCatalogIndex(supabaseAdmin),
        ]);

        if (mErr) {
            console.error('[GET /api/class-students] class_students error:', mErr);
            throw mErr;
        }

        if (!members || members.length === 0) {
            return NextResponse.json({ success: true, students: [] });
        }

        // Collect BOTH the raw USN and the uppercase form — query with both to
        // guarantee we match regardless of case stored in each table.
        const rawUsns = members.map(m => m.usn);
        const upperUsns = rawUsns.map(u => (u || '').toUpperCase().trim());
        const allQueryUsns = [...new Set([...rawUsns, ...upperUsns])];

        const [profiles, scrapedMarks, manualMarks] = await Promise.all([
            fetchByChunks('students', 'usn, name, branch, semester, scheme', 'usn', allQueryUsns, supabaseAdmin),
            fetchByChunks('subject_marks', 'usn, semester, subject_code, subject_name, grade, internal, external, total, credits, is_backlog, announced_date, result_id', 'usn', allQueryUsns, supabaseAdmin),
            fetchByChunks('marks', 'student_usn, semester, subject_code, subject_name, grade, cie_marks, see_marks, total_marks, credits', 'student_usn', allQueryUsns, supabaseAdmin),
        ]);

        // ── ALL index maps are keyed by UPPERCASE USN ──
        // This is the single normalization point — every lookup below uses norm().
        const norm = usn => (usn || '').toUpperCase().trim();

        // Combine scraped and manual marks into a single normalized pool
        const marks = [
            ...(scrapedMarks || []).map(m => ({ ...m, usn: norm(m.usn) })),
            ...(manualMarks || []).map(m => ({
                ...m,
                usn: norm(m.student_usn),
                internal: m.cie_marks,
                external: m.see_marks,
                total: m.total_marks
            }))
        ];

        const marksByUsn = {};
        (marks || []).forEach(m => (marksByUsn[norm(m.usn)] ||= []).push(m));

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[norm(p.usn)] = p; });

        const classSem = Number(classData?.semester) || 1;

        const recordByUsn = {};
        await Promise.all(upperUsns.map(async u => {
            const studMarks = marksByUsn[u] || [];
            if (studMarks.length === 0) return;
            const profile = {
                usn: u,
                branch: profileMap[u]?.branch || classData?.branch,
                scheme: profileMap[u]?.scheme || classData?.scheme || '2022',
            };
            recordByUsn[u] = await calculateAcademicRecord(studMarks, profile, { catalogIndex });
        }));

        const hasResultsMap = {};
        upperUsns.forEach(u => { hasResultsMap[u] = Boolean(recordByUsn[u] && (marksByUsn[u]?.length > 0)); });

        // ── Build final student list — ALL lookups via norm(usn) ──
        const students = members.map(m => {
            const u = norm(m.usn);
            const hasData = hasResultsMap[u] || false;
            const record = recordByUsn[u];
            const semNumbers = record ? Object.keys(record.semStats).map(Number) : [];
            const computedSem = (semNumbers.length ? Math.max(...semNumbers) : 0) || classSem || Number(profileMap[u]?.semester) || 1;

            const semester_data = {};
            let cgpa = null;
            if (record) {
                Object.entries(record.semStats).forEach(([sem, s]) => {
                    semester_data[sem] = { sgpa: s.sgpa, backlogs: s.backlogs, total_credits: s.totalCredits };
                });
                // The engine's own CGPA, taken directly. Re-deriving it by weighting
                // the per-semester SGPAs is arithmetically the same thing but rounds
                // each SGPA to two decimals first, so it could drift a hundredth away
                // from the figure every other surface shows.
                cgpa = record.cgpa;
            }

            return {
                id: m.id,
                usn: m.usn,
                name: profileMap[u]?.name || m.usn,
                branch: profileMap[u]?.branch || classData?.branch || '—',
                semester: computedSem,
                cgpa: hasData ? cgpa : null,
                total_backlogs: hasData ? record.totalActiveBacklogs : null,
                semester_data,
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
            
            // subject_catalog stores branch under its canonical short code (e.g. "AI"),
            // but classes.branch can hold whatever label the class was created with
            // (e.g. "AIML") — normalize the same way the SGPA/credit engine already
            // does (lib/vtuAcademicEngine.js) so the catalog lookup actually matches.
            const catalogBranch = normalizeBranch(classData?.branch) || 'CS';
            const { data: catData } = await supabaseAdmin
                .from('subject_catalog')
                .select('id, subject_code, subject_name, credits')
                .eq('scheme', classData?.scheme || '2022')
                .eq('branch', catalogBranch)
                .eq('semester', semNum);

            // Ground truth only: a subject column exists if and only if at least one real
            // mark row exists for it among this roster. subject_catalog is used purely to
            // enrich the display name/credits for a code that IS backed by real marks — it
            // never contributes a column on its own.
            const catByCode = new Map((catData || []).map(c => [c.subject_code, c]));
            const markCodes = Array.from(new Set((exportMarksData || []).map(m => m.subject_code)));

            exportCatData = markCodes.map(code => {
                const cat = catByCode.get(code);
                const sample = exportMarksData.find(m => m.subject_code === code);
                return {
                    id: cat?.id || code,
                    subject_code: code,
                    subject_name: cat?.subject_name || sample?.subject_name || code,
                    credits: cat?.credits ?? sample?.credits ?? null,
                };
            }).sort((a, b) => a.subject_code.localeCompare(b.subject_code));
        }

        // Dynamically resolve faculty assignments for this class and its subjects
        const facultyMap = {};
        try {
            const { data: assignments } = await supabaseAdmin
                .from('faculty_subject_assignments')
                .select('id, faculty_id, subject_code, branch, semester, scheme, class_id, faculty_onboarding(id, full_name)');

            if (assignments && assignments.length > 0) {
                const targetCodes = exportCatData
                    ? exportCatData.map(c => c.subject_code)
                    : Array.from(new Set((marks || []).map(m => m.subject_code).filter(Boolean)));

                const classBranch = classData?.branch || '';
                const semNum = exportSem ? Number(exportSem) : (Number(classData?.semester) || null);
                const classScheme = classData?.scheme || '2022';

                for (const code of targetCodes) {
                    const match = findFacultyAssignment(assignments, {
                        subjectCode: code,
                        branch: classBranch,
                        semester: semNum,
                        scheme: classScheme,
                        classId: class_id
                    });
                    if (match) {
                        const name = match.faculty_onboarding?.full_name || null;
                        if (name) {
                            facultyMap[code] = name;
                        }
                    }
                }
            }
        } catch (fErr) {
            console.warn('[GET /api/class-students] faculty assignments resolution notice:', fErr.message);
        }

        return NextResponse.json({ 
            success: true, 
            students, 
            marksData: exportMarksData, 
            catData: exportCatData,
            facultyMap
        });
    } catch (err) {
        console.error('[GET /api/class-students]', err);
        return NextResponse.json({ error: 'Failed to fetch students.' }, { status: 500 });
    }
}

// POST — add student(s) to a class
export async function POST(req) {
    const { session, error: authError } = requireStaff(req);
    if (authError) return authError;

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

        // Upsert student profiles into `students` table with formula passwords
        const toUpsert = await Promise.all(uniqueStudents.map(async s => {
            const stuName = s.name || s.usn;
            const formulaPass = generateFormulaPassword(stuName, s.usn);
            const passHash = await hashStudentPassword(formulaPass);
            const row = { usn: s.usn, name: stuName, password_hash: passHash };
            if (s.branch) row.branch = s.branch;
            if (s.semester) row.semester = s.semester;
            return row;
        }));

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

            // Audit log in faculty_activity
            const isBulk = newUsnsToInsert.length > 1;
            const singleUsn = newUsnsToInsert.length === 1 ? newUsnsToInsert[0] : null;
            logFacultyActivityServer(req, {
                action_type: isBulk ? 'CLASS_BULK_IMPORT' : 'CLASS_ADD_STUDENT',
                target_usn: singleUsn,
                context_module: 'Faculty Portal > Classes > Section Roster',
                reason: isBulk ? 'Batch student enrollment into class section.' : 'Individual student enrollment into class roster.',
                details: isBulk 
                    ? `Enrolled ${newUsnsToInsert.length} students into class cohort`
                    : `Enrolled student ${singleUsn} into class roster`,
                metadata: { class_id, count: newUsnsToInsert.length, usns: newUsnsToInsert.slice(0, 15) }
            }).catch(() => {});
        }

        return NextResponse.json({ success: true, added: newUsnsToInsert.length || usns.length });
    } catch (err) {
        console.error('[POST /api/class-students]', err);
        return NextResponse.json({ error: 'Failed to add student.' }, { status: 500 });
    }
}

// DELETE — remove a student from a class
export async function DELETE(req) {
    const { session, error: authError } = requireStaff(req);
    if (authError) return authError;

    try {
        const body = await req.json().catch(() => ({}));
        const { class_id, usn } = body || {};
        if (!class_id || !usn) return NextResponse.json({ error: 'class_id and usn required.' }, { status: 400 });

        const cleanUsn = usn.toUpperCase().trim();
        const { error } = await supabaseAdmin
            .from('class_students')
            .delete()
            .eq('class_id', class_id)
            .eq('usn', cleanUsn);

        if (error) throw error;

        // Audit log in faculty_activity
        logFacultyActivityServer(req, {
            action_type: 'CLASS_REMOVE_STUDENT',
            target_usn: cleanUsn,
            context_module: 'Faculty Portal > Classes > Section Roster',
            reason: 'Student roster de-enrollment due to section transfer or course drop.',
            details: `Removed student ${cleanUsn} from class roster`,
            metadata: { class_id, usn: cleanUsn }
        }).catch(() => {});

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/class-students]', err);
        return NextResponse.json({ error: 'Failed to remove student.' }, { status: 500 });
    }
}
