import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

let envText = '';
if (fs.existsSync('.env.local')) envText += '\n' + fs.readFileSync('.env.local', 'utf8');
if (fs.existsSync('.env')) envText += '\n' + fs.readFileSync('.env', 'utf8');

const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
let key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
if (!key) key = envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');

const supabase = createClient(url, key);

async function check() {
    console.log('--- DATABASE STORAGE VERIFICATION ---');
    const tables = ['students', 'results', 'subject_marks', 'subject_mark_attempts', 'academic_remarks'];
    for (const t of tables) {
        const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
        console.log(`${t.padEnd(25)}: ${error ? 'Error: ' + error.message : count + ' records'}`);
    }
}
check();
