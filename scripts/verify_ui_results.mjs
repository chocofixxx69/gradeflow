import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { processStudentResults } from '../lib/semester-utils.js';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
    const usn = '2AB23CS043';
    const { data: marks } = await supabase.from('subject_marks').select('*').ilike('usn', usn);
    console.log(`Loaded ${marks.length} marks for ${usn}`);

    const res = processStudentResults(marks, '2022', { usn });
    console.log('\n=== RESULT OF processStudentResults ===');
    console.log('Overall CGPA:', res.cgpa.toFixed(2));
    for (const [sem, stat] of Object.entries(res.stats)) {
        console.log(`  Sem ${sem}: SGPA = ${stat.sgpa.toFixed(2)}, Credits = ${stat.totalCredits}, Backlogs = ${stat.backlogs}, GradePoints = ${stat.gradePoints.toFixed(2)}`);
    }
}

run();
