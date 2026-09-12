import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function listAffected() {
    let allMarks = [];
    let page = 0;
    while(true) {
        const { data } = await supabase.from('subject_marks').select('id, usn, semester, subject_code, subject_name, internal, external, total, grade, passed, is_backlog').range(page*1000, (page+1)*1000-1);
        if(!data || !data.length) break;
        allMarks.push(...data);
        if(data.length < 1000) break;
        page++;
    }
    const maxExtMap = new Map();
    for(const m of allMarks) {
        const c = (m.subject_code||'').trim().toUpperCase();
        const ext = Number(m.external)||0;
        if(ext > (maxExtMap.get(c)||0)) maxExtMap.set(c, ext);
    }
    const falsePasses = allMarks.filter(m => {
        const c = (m.subject_code||'').trim().toUpperCase();
        const extMax = maxExtMap.get(c)||0;
        const ext = m.external !== null && m.external !== undefined ? Number(m.external) : null;
        if (extMax >= 18 && (ext === null || ext < 18)) {
            return m.passed === true || m.is_backlog === false;
        }
        return false;
    });

    const students = new Map();
    for(const fp of falsePasses) {
        if(!students.has(fp.usn)) students.set(fp.usn, []);
        students.get(fp.usn).push(fp);
    }

    console.log('Total affected students:', students.size);
    for(const [usn, rows] of students.entries()) {
        console.log(`USN: ${usn} (${rows.length} false passes)`);
        for(const r of rows) {
            console.log(`   Sem ${r.semester} | ${r.subject_code} - ${r.subject_name} | Int: ${r.internal}, Ext: ${r.external}, Tot: ${r.total}, Grade: ${r.grade}`);
        }
    }
}

listAffected();
