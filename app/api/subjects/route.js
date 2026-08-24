import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../lib/server-session';
import { getGradePoint, getGradeDetails } from '../../../lib/vtuGrades';
import { getOfficialCredit } from '../../../lib/vtu-curriculum-catalog';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

function normalizeBranch(br) {
    if (!br) return 'CS';
    const b = br.toUpperCase().trim();
    if (b === 'CSE') return 'CS';
    if (b === 'ECE') return 'EC';
    if (b === 'EEE') return 'EE';
    if (b === 'AIML') return 'AI';
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
        await cascadeCreditUpdate(cleanCode, numCredits);

        return NextResponse.json({ success: true, subject: data });
    } catch (err) {
        console.error('[POST /api/subjects] Error:', err);
        return NextResponse.json({ error: err.message || 'Failed to create subject.' }, { status: 500 });
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
        const affectedCount = await cascadeCreditUpdate(cleanCode, numCredits, branch, semester);

        return NextResponse.json({
            success: true,
            message: `Subject updated. Recalculated SGPA for ${affectedCount} student semester records in ${branch || 'all'} branch.`,
            recalculatedCount: affectedCount,
            subject: data ? data[0] : null
        });
    } catch (err) {
        console.error('[PUT /api/subjects] Error:', err);
        return NextResponse.json({ error: err.message || 'Failed to update subject.' }, { status: 500 });
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
        return NextResponse.json({ error: err.message || 'Failed to delete subject.' }, { status: 500 });
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
 */
async function cascadeCreditUpdate(subjectCode, newCredits, targetBranch = null, targetSemester = null) {
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

        // Fetch student profiles to check branch matching
        const usns = Array.from(new Set(allMarks.map(m => m.usn.toUpperCase())));
        const { data: profiles } = await supabaseAdmin
            .from('students')
            .select('usn, branch')
            .in('usn', usns);

        const profileMap = new Map();
        (profiles || []).forEach(p => profileMap.set(p.usn.toUpperCase(), p.branch));

        // Filter USNs that match the target branch
        const matchedUsns = new Set();
        usns.forEach(usn => {
            const stBranch = profileMap.get(usn);
            if (matchesBranch(usn, stBranch, targetBranch)) {
                matchedUsns.add(usn);
            }
        });

        if (matchedUsns.size === 0) return 0;

        const matchedUsnArray = Array.from(matchedUsns);

        // 2. Update credits ONLY for subject_marks of students belonging to matched USNs
        for (let i = 0; i < matchedUsnArray.length; i += 100) {
            const chunk = matchedUsnArray.slice(i, i + 100);
            let updateQ = supabaseAdmin
                .from('subject_marks')
                .update({ credits: newCredits })
                .eq('subject_code', subjectCode)
                .in('usn', chunk);

            if (targetSemester) {
                updateQ = updateQ.eq('semester', Number(targetSemester));
            }
            await updateQ;
        }

        // 3. Deduplicate (usn, semester) pairs to recalculate SGPA
        const pairsMap = new Map();
        allMarks.forEach(row => {
            const u = row.usn.toUpperCase();
            if (matchedUsns.has(u) && row.semester) {
                const key = `${u}_${row.semester}`;
                pairsMap.set(key, { usn: u, semester: Number(row.semester) });
            }
        });

        const pairs = Array.from(pairsMap.values());
        const excludeGrades = new Set(['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE']);

        // 4. For each pair, recalculate SGPA and update results & academic_remarks
        for (const { usn, semester } of pairs) {
            const { data: semMarks } = await supabaseAdmin
                .from('subject_marks')
                .select('*')
                .eq('usn', usn)
                .eq('semester', semester);

            if (!semMarks || semMarks.length === 0) continue;

            semMarks.forEach(m => {
                const g = (m.grade || 'F').trim().toUpperCase();
                if (excludeGrades.has(g)) return;

                const details = getGradeDetails(m, '2022');
                const offCr = getOfficialCredit(m.subject_code, '2022', null, Number(semester));
                const cr = offCr !== null ? offCr : (Number(m.credits) || 0);

                if (cr === 0) return; // Non-credit audit course

                const gp = details.gp;
                tc += cr;
                tcp += (gp * cr);

                if (details.isFail || m.is_backlog) backlogs++;
            });

            const newSgpa = tc > 0 ? Number((tcp / tc).toFixed(2)) : 0.0;

            // Update results table
            const { data: existingResult } = await supabaseAdmin
                .from('results')
                .select('id')
                .eq('usn', usn)
                .eq('semester', semester)
                .limit(1);

            if (existingResult && existingResult.length > 0) {
                await supabaseAdmin
                    .from('results')
                    .update({ sgpa: newSgpa, total_credits: tc })
                    .eq('id', existingResult[0].id);
            }

            // Update academic_remarks table
            const { data: stData } = await supabaseAdmin
                .from('students')
                .select('id')
                .eq('usn', usn)
                .limit(1);

            if (stData && stData.length > 0) {
                await supabaseAdmin
                    .from('academic_remarks')
                    .upsert({
                        student_id: stData[0].id,
                        student_usn: usn,
                        semester,
                        sgpa: newSgpa,
                        backlog_count: backlogs,
                        is_all_clear: backlogs === 0
                    }, { onConflict: 'student_id,semester' });
            }
        }

        return pairs.length;
    } catch (err) {
        console.error('[cascadeCreditUpdate] Error:', err);
        return 0;
    }
}

