import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function scan() {
    let allMarks = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('subject_marks')
            .select('id, usn, subject_code, subject_name, semester, internal, external, total, grade, passed, is_backlog')
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) { console.error(error); break; }
        if (!data || data.length === 0) break;
        allMarks.push(...data);
        if (data.length < pageSize) break;
        page++;
    }
    console.log('TOTAL MARKS FETCHED:', allMarks.length);

    // Map each subject_code to whether it has an SEE exam (max external > 0)
    const subjectExtMax = new Map();
    for (const m of allMarks) {
        const code = (m.subject_code || '').trim().toUpperCase();
        const ext = Number(m.external) || 0;
        const currentMax = subjectExtMax.get(code) || 0;
        if (ext > currentMax) subjectExtMax.set(code, ext);
    }

    // Now check for subjects that have SEE exam (extMax >= 18), but where a student has external < 18
    // and was marked as passed: true or is_backlog: false or grade !== 'F'
    const falsePasses = [];
    for (const m of allMarks) {
        const code = (m.subject_code || '').trim().toUpperCase();
        const extMax = subjectExtMax.get(code) || 0;
        const ext = m.external !== null && m.external !== undefined ? Number(m.external) : null;

        // If this subject definitely has an external exam (other students scored in SEE >= 18)
        if (extMax >= 18) {
            // Did this student fail SEE? (ext < 18, or ext === 0)
            if (ext !== null && ext < 18) {
                // If they are marked as passed or not backlog
                if (m.passed === true || m.is_backlog === false || (m.grade && !['F', 'FAIL', 'AB', 'ABSENT', 'A'].includes(m.grade.toUpperCase()))) {
                    falsePasses.push({
                        id: m.id,
                        usn: m.usn,
                        code,
                        name: m.subject_name,
                        sem: m.semester,
                        internal: m.internal,
                        external: m.external,
                        total: m.total,
                        grade: m.grade,
                        passed: m.passed,
                        is_backlog: m.is_backlog,
                        extMax
                    });
                }
            }
        }
    }

    console.log('FALSE PASSES (HAS SEE EXAM BUT EXT < 18 AND MARKED PASS):', falsePasses.length);
    console.log('LIST OF ALL FALSE PASSES:');
    for (const fp of falsePasses) {
        console.log(`USN: ${fp.usn} | Sem: ${fp.sem} | Code: ${fp.code} (${fp.name}) | Int: ${fp.internal} | Ext: ${fp.external} | Tot: ${fp.total} | Grade: ${fp.grade} | Passed: ${fp.passed} | Backlog: ${fp.is_backlog} | MaxExtInSubject: ${fp.extMax}`);
    }
}

scan().catch(console.error);
