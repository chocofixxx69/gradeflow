import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Read .env or .env.local
let envText = '';
if (fs.existsSync('.env.local')) {
    envText += '\n' + fs.readFileSync('.env.local', 'utf8');
}
if (fs.existsSync('.env')) {
    envText += '\n' + fs.readFileSync('.env', 'utf8');
}

const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
let key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
if (!key) {
    key = envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
}

if (!url || !key) {
    console.error('Missing Supabase credentials in .env / .env.local');
    process.exit(1);
}

const supabase = createClient(url, key);

async function fetchAll(table, select = '*') {
    const rows = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from(table)
            .select(select)
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
            console.error(`Error fetching ${table}:`, error);
            throw error;
        }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        page++;
    }
    return rows;
}

async function run() {
    console.log('Connecting to database and fetching records...');
    const [students, marks, remarks] = await Promise.all([
        fetchAll('students', 'id, usn, name, branch, semester, scheme'),
        fetchAll('subject_marks', 'id, usn, semester, total, grade'),
        fetchAll('academic_remarks', 'id, student_id, student_usn, semester, sgpa')
    ]);

    console.log(`Total Students Registered: ${students.length}`);
    console.log(`Total Subject Marks in DB: ${marks.length}`);
    console.log(`Total Academic Remarks in DB: ${remarks.length}`);

    // Set of USNs with subject marks
    const usnsWithMarks = new Set();
    for (const m of marks) {
        if (m.usn) usnsWithMarks.add(String(m.usn).toUpperCase().trim());
    }

    // Set of USNs with remarks / SGPA
    const usnsWithRemarks = new Set();
    for (const r of remarks) {
        if (r.student_usn) usnsWithRemarks.add(String(r.student_usn).toUpperCase().trim());
    }

    // Identify students with missing marks or missing remarks
    const missingBoth = [];
    const missingMarksOnly = [];
    const missingRemarksOnly = [];

    for (const s of students) {
        const u = String(s.usn || '').toUpperCase().trim();
        const hasMarks = usnsWithMarks.has(u);
        const hasRemarks = usnsWithRemarks.has(u);

        if (!hasMarks && !hasRemarks) {
            missingBoth.push(s);
        } else if (!hasMarks && hasRemarks) {
            missingMarksOnly.push(s);
        } else if (hasMarks && !hasRemarks) {
            missingRemarksOnly.push(s);
        }
    }

    console.log('\n======================================================');
    console.log(`RESULTS SUMMARY:`);
    console.log(`- Students with ZERO marks and ZERO SGPA/CGPA records: ${missingBoth.length}`);
    console.log(`- Students with Remarks but no Subject Marks: ${missingMarksOnly.length}`);
    console.log(`- Students with Subject Marks but no Remarks: ${missingRemarksOnly.length}`);
    console.log('======================================================\n');

    if (missingBoth.length > 0) {
        console.log('STUDENTS WITH NO MARKS AND NO SGPA/CGPA (Total: ' + missingBoth.length + '):');
        console.log('----------------------------------------------------------------------------------------');
        console.log('USN\t\tName\t\t\t\tBranch\tSem\tScheme');
        console.log('----------------------------------------------------------------------------------------');
        // Sort by branch, then usn
        missingBoth.sort((a, b) => (a.branch || '').localeCompare(b.branch || '') || (a.usn || '').localeCompare(b.usn || ''));
        for (const s of missingBoth) {
            const usn = (s.usn || '').padEnd(12);
            const name = (s.name || 'UNKNOWN').padEnd(30).substring(0, 30);
            const branch = (s.branch || 'N/A').padEnd(8);
            const sem = String(s.semester || '-').padEnd(5);
            const scheme = String(s.scheme || '-');
            console.log(`${usn}\t${name}\t${branch}\t${sem}\t${scheme}`);
        }
    }

    // Output JSON for further processing if needed
    fs.writeFileSync('scratch_missing_students.json', JSON.stringify({
        totalRegistered: students.length,
        missingBoth,
        missingMarksOnly,
        missingRemarksOnly
    }, null, 2));
}

run().catch(console.error);
