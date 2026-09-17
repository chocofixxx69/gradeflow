import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function checkStudent() {
    const usn = '2AB23CS013';

    const { data: results } = await supabase.from('results').select('*').eq('usn', usn);
    console.log('\n--- Results Table for 2AB23CS013 ---');
    console.log(JSON.stringify(results, null, 2));

    const { data: sem2Marks } = await supabase.from('subject_marks').select('*').eq('usn', usn).eq('semester', 2);
    console.log('\n--- Sem 2 Marks for 2AB23CS013 ---');
    console.log(JSON.stringify(sem2Marks, null, 2));

    const { data: sem1Marks } = await supabase.from('subject_marks').select('*').eq('usn', usn).eq('semester', 1);
    console.log('\n--- Sem 1 Marks for 2AB23CS013 ---');
    console.log(JSON.stringify(sem1Marks, null, 2));
}

checkStudent();
