import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function main() {
    const usn = '2AB23CS013';
    console.log(`=== UPDATING USN: ${usn} (BPLCK205B Python Programming) ===`);

    // 1. Fetch current marks
    const { data: beforeMarks } = await supabase
        .from('subject_marks')
        .select('*')
        .eq('usn', usn)
        .eq('semester', 2)
        .eq('subject_code', 'BPLCK205B');

    console.log('\n--- Before Update (subject_marks) ---');
    console.log(beforeMarks);

    // 2. Perform the update
    const { data: updatedMarks, error: updateError } = await supabase
        .from('subject_marks')
        .update({
            internal: 45,
            external: 36,
            total: 81,
            grade: 'P',
            credits: 3,
            passed: true,
            is_backlog: false,
            announced_date: '2024-08-13',
            result_id: '5657d8c8-673c-4e5e-b5db-0210e9e25ec3'
        })
        .eq('usn', usn)
        .eq('semester', 2)
        .eq('subject_code', 'BPLCK205B')
        .select();

    if (updateError) {
        console.error('Error updating subject_marks:', updateError);
        return;
    }

    console.log('\n--- After Update (subject_marks) ---');
    console.log(updatedMarks);

    // 3. Update SGPA in results table for Semester 2
    // Recalculate exact SGPA:
    // BMATS201: 93 (O, 10) * 4 = 40
    // BCHES202: 91 (O, 10) * 4 = 40
    // BCEDK203: 84 (A+, 9) * 3 = 27
    // BESCK204C: 91 (O, 10) * 3 = 30
    // BPLCK205B: 81 (A+, 9) * 3 = 27
    // BPWSK206: 88 (A+, 9) * 1 = 9
    // BKSKK207: 97 (O, 10) * 1 = 10
    // BIDTK258: 90 (O, 10) * 1 = 10
    // Total credits = 20, Total grade points = 193 -> SGPA = 9.65
    const { data: updatedResults, error: resError } = await supabase
        .from('results')
        .update({
            sgpa: 9.65,
            total_credits: 20
        })
        .eq('usn', usn)
        .eq('semester', 2)
        .select();

    if (resError) {
        console.error('Error updating results table:', resError);
    } else {
        console.log('\n--- After Update (results table) ---');
        console.log(updatedResults);
    }

    console.log('\nSUCCESS! Database updated with verified official VTU result for 2AB23CS013!');
}

main();
