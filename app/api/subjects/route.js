import { NextResponse } from 'next/server';
import { requireStaff } from '../../../lib/server-session';
import { getGradePoint, getGradeDetails, isFailedSubject } from '../../../lib/vtuGrades';
import { fetchCatalogIndex, resolveSubjectCredit } from '../../../lib/subjectCreditResolver';
import { isAuditCourse, normalizeBranch as normalizeBranchCode } from '../../../lib/vtuAcademicEngine';
import { getAdminClient } from '../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

function normalizeBranch(br) {
    if (!br) return 'CS';
    const b = br.toUpperCase().trim();
    if (b === 'CSE' || b === 'CS' || b.includes('COMPUTER SCIENCE')) return 'CS';
    if (b === 'ECE' || b === 'EC' || b.includes('ELECTRONICS')) return 'EC';
    if (b === 'EEE' || b === 'EE' || b.includes('ELECTRICAL')) return 'EE';
    if (b === 'AIML' || b === 'AI' || b === 'CI' || b.includes('ARTIFICIAL INTELLIGENCE')) return 'AI';
    if (b === 'DS' || b === 'CD' || b.includes('DATA SCIENCE') || b.includes('CSE(DS)')) return 'DS';
    if (b === 'MECH' || b === 'ME' || b.includes('MECHANICAL')) return 'ME';
    if (b === 'CIVIL' || b === 'CV' || b.includes('CIVIL')) return 'CV';
    if (b === 'ROBOTICS' || b === 'RI' || b.includes('ROBOTICS')) return 'RI';
    return b;
}

export async function GET(req) {
    const { error: authError } = requireStaff(req, ['faculty', 'admin']);
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const scheme = searchParams.get('scheme') || '2022';
    const rawBranch = searchParams.get('branch') || 'CS';
    const branch = normalizeBranch(rawBranch);
    const semester = searchParams.get('semester');

    try {
        let query = supabaseAdmin
            .from('subject_catalog')
            .select('*')
            .eq('scheme', scheme)
            .in('branch', Array.from(new Set([branch, rawBranch])));

        if (semester && semester !== 'all') {
            query = query.eq('semester', parseInt(semester));
        }

        const { data, error } = await query.order('semester', { ascending: true }).order('subject_code', { ascending: true });

        if (error) {
            console.error('[GET /api/subjects] Database Query Error:', error);
            return NextResponse.json({ success: false, subjects: [], error: 'Syllabus not found' });
        }

        const subjects = (data || []).map(s => ({
            id: s.id,
            code: s.subject_code,
            name: s.subject_name,
            credits: s.credits,
            semester: s.semester,
            scheme: s.scheme,
            branch: s.branch
        }));

        return NextResponse.json({ success: true, subjects, data });
    } catch (err) {
        console.error('[GET /api/subjects] Error:', err);
        return NextResponse.json({ error: 'Failed to access institutional registry' }, { status: 500 });
    }
}

export async function POST(req) {
    const { error: authError } = requireStaff(req, ['faculty', 'admin']);
    if (authError) return authError;

    try {
        const body = await req.json().catch(() => ({}));
        const { subject_code, subject_name, credits, semester, scheme = '2022', branch = 'CSE' } = body || {};

        if (!subject_code || !subject_name || credits == null || !semester) {
            return NextResponse.json({ error: 'subject_code, subject_name, credits, and semester are required.' }, { status: 400 });
        }

        const cleanCode = subject_code.trim().toUpperCase();
        const numCredits = Number(credits);
        const numSem = Number(semester);

        const { data, error } = await supabaseAdmin
            .from('subject_catalog')
            .upsert({
                subject_code: cleanCode,
                subject_name: subject_name.trim(),
                credits: numCredits,
                semester: numSem,
                scheme,
                branch
            }, { onConflict: 'scheme,branch,semester,subject_code' })
            .select()
            .single();

        if (error) throw error;

        // Sync credits to existing subject_marks if any
        await cascadeCreditUpdate(cleanCode, numCredits, branch, numSem, scheme);

        return NextResponse.json({ success: true, subject: data });
    } catch (err) {
        console.error('[POST /api/subjects] Error:', err);
        return NextResponse.json({ error: 'Failed to create subject.' }, { status: 500 });
    }
}

export async function PUT(req) {
    const { error: authError } = requireStaff(req, ['faculty', 'admin']);
    if (authError) return authError;

    try {
        const body = await req.json().catch(() => ({}));
        const { id, subject_code, subject_name, credits, semester, scheme, branch } = body || {};

        if (!subject_code || credits == null) {
            return NextResponse.json({ error: 'subject_code and credits are required.' }, { status: 400 });
        }

        const cleanCode = subject_code.trim().toUpperCase();
        const numCredits = Number(credits);

        let updateQuery = supabaseAdmin.from('subject_catalog').update({
            subject_name: subject_name ? subject_name.trim() : undefined,
            credits: numCredits,
            semester: semester ? Number(semester) : undefined,
            scheme: scheme || undefined,
            branch: branch || undefined
        });

        if (id) {
            updateQuery = updateQuery.eq('id', id);
        } else {
            updateQuery = updateQuery.eq('subject_code', cleanCode);
        }

        const { data, error } = await updateQuery.select();

        if (error) throw error;

        // Cascade updated credits and recalculate SGPA/CGPA strictly for students of the specified branch
        const affectedCount = await cascadeCreditUpdate(cleanCode, numCredits, branch, semester, scheme);

        return NextResponse.json({
            success: true,
            message: `Subject updated. Recalculated SGPA for ${affectedCount} student semester records in ${branch || 'all'} branch.`,
            recalculatedCount: affectedCount,
            subject: data ? data[0] : null
        });
    } catch (err) {
        console.error('[PUT /api/subjects] Error:', err);
        return NextResponse.json({ error: 'Failed to update subject.' }, { status: 500 });
    }
}

export async function DELETE(req) {
    const { error: authError } = requireStaff(req, ['faculty', 'admin']);
    if (authError) return authError;

    try {
        const { searchParams } = new URL(req.url);
        const id = searchParams.get('id');
        const code = searchParams.get('code');

        if (!id && !code) {
            return NextResponse.json({ error: 'id or code required.' }, { status: 400 });
        }

        let query = supabaseAdmin.from('subject_catalog').delete();
        if (id) query = query.eq('id', id);
        else query = query.eq('subject_code', code.trim().toUpperCase());

        const { error } = await query;
        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error('[DELETE /api/subjects] Error:', err);
        return NextResponse.json({ error: 'Failed to delete subject.' }, { status: 500 });
    }
}

/**
 * Checks whether a USN or student record matches the target branch.
 */
function matchesBranch(usn, studentBranch, targetBranch) {
    if (!targetBranch || targetBranch === 'all' || targetBranch === 'ALL') return true;

    const tbLower = targetBranch.toLowerCase().trim();
    if (studentBranch && studentBranch.toLowerCase().includes(tbLower)) return true;

    if (usn && usn.length >= 7) {
        const uBranchCode = usn.substring(5, 7).toUpperCase();
        const branchCodeMap = {
            'CS': ['cs', 'cse', 'computer science'],
            'IS': ['is', 'ise', 'information science'],
            'EC': ['ec', 'ece', 'electronics'],
            'EE': ['ee', 'eee', 'electrical'],
            'ME': ['me', 'mech', 'mechanical'],
            'CV': ['cv', 'civil'],
            'CD': ['cd', 'data science', 'ds'],
            'CI': ['ci', 'ai', 'aiml'],
            'AI': ['ai', 'ci', 'aiml'],
            'AD': ['ad', 'ai & data science'],
            'CB': ['cb', 'cs & business']
        };

        const targetKeywords = branchCodeMap[uBranchCode] || [uBranchCode.toLowerCase()];
        return targetKeywords.some(kw => tbLower.includes(kw) || kw.includes(tbLower));
    }

    return false;
}

/**
 * Cascades updated credit values to subject_marks and dynamically recalculates SGPA/CGPA
 * strictly for students belonging to the target branch.
 *
 * Batched/parallelized rather than one-DB-round-trip-chain-per-student: with a
 * subject shared by dozens of students, the old sequential-for-loop version did
 * 3-4 awaited queries per student back-to-back, which routinely blew past the
 * serverless function timeout and left the client's Save button hung forever
 * even though the update may have partially landed.
 */
async function cascadeCreditUpdate(subjectCode, newCredits, targetBranch = null, targetSemester = null, scheme = '2022') {
    try {
        // 1. Fetch all subject_marks matching this subject code
        let marksQuery = supabaseAdmin
            .from('subject_marks')
            .select('id, usn, semester, subject_code');

        if (targetSemester) {
            marksQuery = marksQuery.eq('semester', Number(targetSemester));
        }

        const { data: allMarks } = await marksQuery.eq('subject_code', subjectCode);
        if (!allMarks || allMarks.length === 0) return 0;

        // Fetch student profiles (id + branch) to check branch matching
        const usns = Array.from(new Set(allMarks.map(m => m.usn.toUpperCase())));
        const { data: profiles } = await supabaseAdmin
            .from('students')
            .select('id, usn, branch')
            .in('usn', usns);

        const profileMap = new Map();
        (profiles || []).forEach(p => profileMap.set(p.usn.toUpperCase(), p));

        // Filter USNs that match the target branch
        const matchedUsns = new Set();
        usns.forEach(usn => {
            const stBranch = profileMap.get(usn)?.branch;
            if (matchesBranch(usn, stBranch, targetBranch)) {
                matchedUsns.add(usn);
            }
        });

        if (matchedUsns.size === 0) return 0;

        const matchedUsnArray = Array.from(matchedUsns);

        // 2. Update credits ONLY for subject_marks of students belonging to matched USNs
        //    (chunks run in parallel — each chunk is an independent update)
        const chunks = [];
        for (let i = 0; i < matchedUsnArray.length; i += 100) {
            chunks.push(matchedUsnArray.slice(i, i + 100));
        }
        await Promise.all(chunks.map(chunk => {
            let updateQ = supabaseAdmin
                .from('subject_marks')
                .update({ credits: newCredits })
                .eq('subject_code', subjectCode)
                .in('usn', chunk);

            if (targetSemester) {
                updateQ = updateQ.eq('semester', Number(targetSemester));
            }
            return updateQ;
        }));

        // 3. Deduplicate (usn, semester) pairs to recalculate SGPA
        const pairsMap = new Map();
        const semestersInvolved = new Set();
        allMarks.forEach(row => {
            const u = row.usn.toUpperCase();
            if (matchedUsns.has(u) && row.semester) {
                const key = `${u}_${row.semester}`;
                pairsMap.set(key, { usn: u, semester: Number(row.semester) });
                semestersInvolved.add(Number(row.semester));
            }
        });

        const pairs = Array.from(pairsMap.values());
        if (pairs.length === 0) return 0;

        const excludeGrades = new Set(['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE']);
        const catalogIndex = await fetchCatalogIndex(supabaseAdmin);

        // 4. Fetch every subject_marks row for every affected (usn, semester) in ONE query,
        //    then group in memory — instead of one query per pair.
        const { data: allSemMarks } = await supabaseAdmin
            .from('subject_marks')
            .select('*')
            .in('usn', matchedUsnArray)
            .in('semester', Array.from(semestersInvolved));

        const semMarksByPair = new Map();
        (allSemMarks || []).forEach(m => {
            const key = `${m.usn.toUpperCase()}_${Number(m.semester)}`;
            if (!pairsMap.has(key)) return;
            if (!semMarksByPair.has(key)) semMarksByPair.set(key, []);
            semMarksByPair.get(key).push(m);
        });

        // 5. Recalculate SGPA per pair (pure in-memory computation, no I/O)
        const recalculated = pairs.map(({ usn, semester }) => {
            const semMarks = semMarksByPair.get(`${usn}_${semester}`) || [];
            const studentBranch = normalizeBranchCode(profileMap.get(usn)?.branch || targetBranch, usn);

            let tc = 0, tcp = 0, backlogs = 0;

            semMarks.forEach(m => {
                const g = (m.grade || 'F').trim().toUpperCase();
                if (excludeGrades.has(g)) return;

                const details = getGradeDetails(m, scheme);
                // Credit is always resolved fresh from subject_catalog — the
                // stored subject_marks.credits value is never trusted.
                const code = (m.subject_code || '').trim().toUpperCase();
                const resolved = isAuditCourse(code)
                    ? { credits: 0, source: 'audit' }
                    : resolveSubjectCredit(catalogIndex, { scheme, branch: studentBranch, semester: Number(semester), subject_code: code });
                const cr = resolved.credits;

                if (cr === null || cr === 0) return; // Unresolved or non-credit audit course

                const isFail = isFailedSubject(m);
                if (isFail) backlogs++;

                tc += cr;
                tcp += (isFail ? 0 : details.gp) * cr;
            });

            const newSgpa = tc > 0 ? Number((tcp / tc).toFixed(2)) : 0.0;
            return { usn, semester, newSgpa, tc, backlogs };
        });

        // 6. Batch-fetch existing `results` rows (one row updated per usn+semester,
        //    matching prior single-row-update behavior) and apply updates in parallel.
        const { data: existingResults } = await supabaseAdmin
            .from('results')
            .select('id, usn, semester')
            .in('usn', matchedUsnArray)
            .in('semester', Array.from(semestersInvolved));

        const firstResultByPair = new Map();
        (existingResults || []).forEach(r => {
            const key = `${r.usn.toUpperCase()}_${Number(r.semester)}`;
            if (!firstResultByPair.has(key)) firstResultByPair.set(key, r.id);
        });

        const resultUpdates = recalculated
            .map(({ usn, semester, newSgpa, tc }) => {
                const id = firstResultByPair.get(`${usn}_${semester}`);
                if (!id) return null;
                return supabaseAdmin.from('results').update({ sgpa: newSgpa, total_credits: tc }).eq('id', id);
            })
            .filter(Boolean);

        // 7. Batch upsert `academic_remarks` in ONE call instead of one per student.
        const remarksRows = recalculated
            .map(({ usn, semester, newSgpa, backlogs }) => {
                const studentId = profileMap.get(usn)?.id;
                if (!studentId) return null;
                return {
                    student_id: studentId,
                    student_usn: usn,
                    semester,
                    sgpa: newSgpa,
                    backlog_count: backlogs,
                    is_all_clear: backlogs === 0
                };
            })
            .filter(Boolean);

        await Promise.all([
            ...resultUpdates,
            remarksRows.length
                ? supabaseAdmin.from('academic_remarks').upsert(remarksRows, { onConflict: 'student_id,semester' })
                : Promise.resolve()
        ]);

        return pairs.length;
    } catch (err) {
        console.error('[cascadeCreditUpdate] Error:', err);
        return 0;
    }
}

