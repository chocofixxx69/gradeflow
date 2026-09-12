import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { isCieOnlyCourse } from '../lib/vtuAcademicEngine.js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function main() {
    console.log('=== RUNNING DEEP DATABASE INTEGRITY AUDIT ===\n');

    let allMarks = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('subject_marks')
            .select('id, usn, semester, subject_code, subject_name, credits, internal, external, total, grade, passed, is_backlog')
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
            console.error('Error fetching subject_marks:', error);
            process.exit(1);
        }
        if (!data || data.length === 0) break;
        allMarks.push(...data);
        if (data.length < pageSize) break;
        page++;
    }
    console.log(`Total subject_marks in DB: ${allMarks.length}`);

    // Map highest external score per subject code to identify SEE courses
    const subjectMaxExt = new Map();
    for (const m of allMarks) {
        const code = (m.subject_code || '').trim().toUpperCase();
        const ext = m.external !== null && m.external !== undefined ? Number(m.external) : null;
        if (ext !== null && !isNaN(ext)) {
            const current = subjectMaxExt.get(code) || 0;
            if (ext > current) subjectMaxExt.set(code, ext);
        }
    }

    const falsePasses = [];
    const falseFails = [];
    const totalBelow40Passes = [];

    for (const m of allMarks) {
        const code = (m.subject_code || '').trim().toUpperCase();
        const ext = m.external !== null && m.external !== undefined ? Number(m.external) : null;
        const tot = Number(m.total) || 0;
        const g = (m.grade || '').trim().toUpperCase();
        const maxExt = subjectMaxExt.get(code) || 0;
        const isCieOnly = isCieOnlyCourse(code);

        // 1. Check Total < 40 but marked pass
        if (tot < 40 && (m.passed === true || m.is_backlog === false || (g && !['F', 'FAIL', 'AB', 'ABSENT', 'A', 'W', 'X', 'NE'].includes(g)))) {
            totalBelow40Passes.push(m);
        }

        // 2. Check SEE fail: Subject has SEE exam (maxExt >= 18), student got ext < 18, not CIE only, but marked pass
        if (maxExt >= 18 && !isCieOnly) {
            if (ext !== null && ext < 18) {
                const isMarkedPass = m.passed === true || m.is_backlog === false || (g && !['F', 'FAIL', 'AB', 'ABSENT', 'A', 'W', 'X', 'NE'].includes(g));
                if (isMarkedPass) {
                    falsePasses.push(m);
                }
            }
        }

        // 3. Check Genuine Pass marked as Backlog/Fail (e.g. tot >= 40 AND (isCieOnly or ext >= 18))
        if (tot >= 40 && (isCieOnly || (ext !== null && ext >= 18))) {
            if (m.is_backlog === true && m.passed === false && ['F', 'FAIL'].includes(g)) {
                falseFails.push(m);
            }
        }
    }

    console.log(`\nAudit Results:`);
    console.log(`- Total < 40 marked Pass: ${totalBelow40Passes.length}`);
    console.log(`- External < 18 marked Pass (False Passes): ${falsePasses.length}`);
    console.log(`- High marks marked Fail (False Backlogs): ${falseFails.length}`);

    if (falsePasses.length > 0) {
        console.log('\nList of False Passes found:');
        falsePasses.forEach(fp => {
            console.log(`USN: ${fp.usn} | Sem: ${fp.semester} | Code: ${fp.subject_code} | Int: ${fp.internal} | Ext: ${fp.external} | Tot: ${fp.total} | Grade: ${fp.grade}`);
        });
    }

    // Now check academic_remarks vs subject_marks for student 2AB23CS043
    console.log('\nChecking Student 2AB23CS043 across all tables:');
    const { data: marks043 } = await supabase
        .from('subject_marks')
        .select('*')
        .eq('usn', '2AB23CS043')
        .order('semester');
    
    console.log(`Found ${marks043.length} subject_marks for 2AB23CS043:`);
    marks043.forEach(m => {
        console.log(`Sem ${m.semester} | ${m.subject_code} | Int: ${m.internal} | Ext: ${m.external} | Tot: ${m.total} | Grade: ${m.grade} | Passed: ${m.passed} | Backlog: ${m.is_backlog}`);
    });

    const { data: remarks043 } = await supabase
        .from('academic_remarks')
        .select('*')
        .eq('student_usn', '2AB23CS043')
        .order('semester');

    console.log('\nAcademic Remarks for 2AB23CS043:');
    remarks043.forEach(r => {
        console.log(`Sem ${r.semester} | SGPA: ${r.sgpa} | Backlogs: ${r.backlog_count} | AllClear: ${r.is_all_clear}`);
    });

    console.log('\n=== INTEGRITY AUDIT COMPLETE ===');
}

main().catch(console.error);
