import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { isCieOnlyCourse, normalizeSubjectResult } from '../lib/vtuAcademicEngine.js';
import { getGradePoint } from '../lib/vtuGrades.js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function main() {
    console.log('=== FIXING FALSE PASSES ACROSS ENTIRE SUPABASE DATABASE ===\n');

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
    console.log(`Fetched ${allMarks.length} total subject_marks rows.`);

    // Check subjects with SEE exam
    const maxExtMap = new Map();
    for (const m of allMarks) {
        const c = (m.subject_code || '').trim().toUpperCase();
        const ext = Number(m.external) || 0;
        if (ext > (maxExtMap.get(c) || 0)) maxExtMap.set(c, ext);
    }

    const falsePasses = allMarks.filter(m => {
        const c = (m.subject_code || '').trim().toUpperCase();
        const extMax = maxExtMap.get(c) || 0;
        const ext = m.external !== null && m.external !== undefined ? Number(m.external) : null;

        // Course has SEE exam
        if (extMax >= 18 && !isCieOnlyCourse(c)) {
            // Student failed SEE (< 18 marks)
            if (ext !== null && ext < 18) {
                // Erroneously marked as passed or not backlog
                return m.passed === true || m.is_backlog === false || !['F', 'FAIL', 'AB', 'ABSENT', 'X', 'NE'].includes((m.grade || '').trim().toUpperCase());
            }
        }
        return false;
    });

    console.log(`Found ${falsePasses.length} false-pass records to correct across database.\n`);

    const affectedUsns = new Set();
    let updatedCount = 0;

    for (const row of falsePasses) {
        console.log(`Updating: USN: ${row.usn} | Sem ${row.semester} | ${row.subject_code} (${row.subject_name}) | Int: ${row.internal} | Ext: ${row.external} | Tot: ${row.total} | '${row.grade}' -> 'F' (passed=false, is_backlog=true)`);

        const { error: updateErr } = await supabase
            .from('subject_marks')
            .update({
                grade: 'F',
                passed: false,
                is_backlog: true
            })
            .eq('id', row.id);

        if (updateErr) {
            console.error(`Failed to update row ${row.id}:`, updateErr);
        } else {
            updatedCount++;
            affectedUsns.add(row.usn);
        }
    }

    console.log(`\nSuccessfully corrected ${updatedCount} / ${falsePasses.length} subject rows.`);
    console.log(`Recalculating academic_remarks for ${affectedUsns.size} affected students...`);

    for (const usn of affectedUsns) {
        const { data: stMarks, error: marksErr } = await supabase
            .from('subject_marks')
            .select('id, semester, subject_code, credits, internal, external, total, grade, passed, is_backlog')
            .eq('usn', usn);

        if (marksErr || !stMarks) continue;

        const sems = [...new Set(stMarks.map(m => m.semester))];
        for (const sem of sems) {
            const semSubjects = stMarks.filter(m => m.semester === sem);
            
            // Calculate active backlogs
            const backlogs = semSubjects.filter(m => {
                const norm = normalizeSubjectResult(m);
                return norm.isFailed;
            });
            const backlogCount = backlogs.length;
            const isAllClear = backlogCount === 0;

            // Recalculate SGPA
            let tc = 0;
            let tcp = 0;
            for (const s of semSubjects) {
                const cr = Number(s.credits) || 0;
                const norm = normalizeSubjectResult(s);
                tc += cr;
                tcp += (norm.gradePoint * cr);
            }
            const sgpa = tc > 0 ? Number((tcp / tc).toFixed(2)) : 0.0;

            const { error: remErr } = await supabase
                .from('academic_remarks')
                .update({
                    backlog_count: backlogCount,
                    is_all_clear: isAllClear,
                    sgpa: sgpa,
                    updated_at: new Date().toISOString()
                })
                .eq('student_usn', usn)
                .eq('semester', sem);

            if (remErr) {
                console.error(`Error updating academic_remarks for ${usn} Sem ${sem}:`, remErr);
            } else {
                console.log(`Updated academic_remarks for ${usn} Sem ${sem}: Backlogs: ${backlogCount}, AllClear: ${isAllClear}, SGPA: ${sgpa}`);
            }
        }
    }

    console.log('\n=== VERIFICATION FOR 2AB23CS043 ===');
    const { data: verifyAinMarks } = await supabase
        .from('subject_marks')
        .select('subject_code, subject_name, semester, internal, external, total, grade, passed, is_backlog')
        .eq('usn', '2AB23CS043')
        .eq('semester', 5);
    console.table(verifyAinMarks);

    const { data: verifyAinRemarks } = await supabase
        .from('academic_remarks')
        .select('semester, sgpa, backlog_count, is_all_clear')
        .eq('student_usn', '2AB23CS043')
        .eq('semester', 5);
    console.log('Remarks for 2AB23CS043 Sem 5:', verifyAinRemarks);

    console.log('\n=== ALL DONE ===');
    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error in fix script:', err);
    process.exit(1);
});
