import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

let envText = '';
if (fs.existsSync('.env.local')) envText += '\n' + fs.readFileSync('.env.local', 'utf8');
if (fs.existsSync('.env')) envText += '\n' + fs.readFileSync('.env', 'utf8');

const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
let key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
if (!key) key = envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');

const supabase = createClient(url, key);

async function checkDetails() {
    const usns = ['2AB24CI031', '2AB24CV403', '2AB25CI082', '2AB23CV008', '2AB24CI035', '2AB23CV009', '2AB23CV010'];
    for (const u of usns) {
        const { data: m } = await supabase.from('subject_marks').select('*').eq('usn', u);
        const { data: r } = await supabase.from('academic_remarks').select('*').eq('student_usn', u);
        console.log(`USN: ${u} -> Marks Count: ${m?.length || 0}, Remarks Count: ${r?.length || 0}`);
        if (m && m.length > 0) {
            console.log(`   Sample Marks for ${u}:`, m.map(x => `${x.subject_code} (Sem ${x.semester}): total=${x.total}, grade=${x.grade}`));
        }
    }
}

checkDetails();
