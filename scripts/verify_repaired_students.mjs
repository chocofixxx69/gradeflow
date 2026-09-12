import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { calculateAcademicRecord } from '../lib/vtuAcademicEngine.js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function checkSample() {
    const sampleUsns = ['2AB23CS043', '2AB24CS029', '2AB24CI015', '2AB23CS003', '2AB23CS078', '2AB25CS023'];
    for (const usn of sampleUsns) {
        const { data: st } = await supabase.from('students').select('*').eq('usn', usn).single();
        const { data: marks } = await supabase.from('subject_marks').select('*').eq('usn', usn);
        const record = await calculateAcademicRecord(marks, st);
        console.log(`USN: ${usn} | Total Backlogs: ${record.totalActiveBacklogs} | Backlog Codes: ${record.activeBacklogSubjects.map(s => s.subjectCode).join(', ')}`);
    }
}

checkSample().catch(console.error);
