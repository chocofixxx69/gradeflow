import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { resolveLateralEntry, resolveBatch, resolveBranch } from '../lib/vtu-identity.js';

let envText = '';
if (fs.existsSync('.env.local')) envText += '\n' + fs.readFileSync('.env.local', 'utf8');
if (fs.existsSync('.env')) envText += '\n' + fs.readFileSync('.env', 'utf8');

const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
let key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');
if (!key) key = envText.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY\s*=\s*([^\r\n]+)/)?.[1]?.trim()?.replace(/["']/g, '');

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
    console.log('Fetching all students and subject marks from database...');
    const [students, marks] = await Promise.all([
        fetchAll('students', 'id, usn, name, branch, semester, scheme, lateral_entry'),
        fetchAll('subject_marks', 'id, usn, semester, subject_code, total, grade')
    ]);

    // Group marks by USN -> Map<usn, Set<semester>>
    const studentMarksBySem = new Map();
    const studentTotalMarks = new Map();

    for (const m of marks) {
        if (!m.usn) continue;
        const u = String(m.usn).toUpperCase().trim();
        if (!studentMarksBySem.has(u)) studentMarksBySem.set(u, new Set());
        studentMarksBySem.get(u).add(Number(m.semester));
        studentTotalMarks.set(u, (studentTotalMarks.get(u) || 0) + 1);
    }

    const totallyMissing = [];
    const lateralEntrants = [];
    const missingIntermediateSems = [];
    const lowMarkCounts = [];

    // Map by cohort / batch to see cohort-level max semester
    // Batch 2023 -> typically Sem 1..4 or 1..6
    // Batch 2024 -> typically Sem 1..2
    // Batch 2025 -> typically Sem 1
    
    // First, let's find the max semester on record per batch for regular and lateral
    const batchMaxSem = new Map();
    for (const s of students) {
        const u = String(s.usn || '').toUpperCase().trim();
        const sems = Array.from(studentMarksBySem.get(u) || []);
        const maxS = sems.length ? Math.max(...sems) : 0;
        const b = resolveBatch(s).twoDigit;
        if (!batchMaxSem.has(b) || batchMaxSem.get(b) < maxS) {
            batchMaxSem.set(b, maxS);
        }
    }

    for (const s of students) {
        const u = String(s.usn || '').toUpperCase().trim();
        const semsSet = studentMarksBySem.get(u) || new Set();
        const recordedSems = Array.from(semsSet).sort((a, b) => a - b);
        const lateral = resolveLateralEntry(s, recordedSems);
        const totalMarks = studentTotalMarks.get(u) || 0;
        const branch = resolveBranch(s);
        const batch = resolveBatch(s);

        const studentInfo = {
            usn: u,
            name: s.name || 'UNKNOWN',
            branch: branch.code || s.branch || 'N/A',
            batch: batch.twoDigit || '??',
            isLateral: lateral.isLateral,
            scheme: s.scheme,
            recordedSemesters: recordedSems,
            totalMarks
        };

        if (lateral.isLateral) {
            lateralEntrants.push(studentInfo);
        }

        // 1. Completely missing marks (0 marks)
        if (totalMarks === 0) {
            totallyMissing.push(studentInfo);
            continue;
        }

        // 2. Lateral entry: Starts at Sem 3. Regular: Starts at Sem 1.
        const expectedStart = lateral.isLateral ? 3 : 1;
        const minRecorded = recordedSems[0];
        const maxRecorded = recordedSems[recordedSems.length - 1];

        // Check if there are gaps/missing semesters between expected start and maxRecorded
        const gaps = [];
        for (let sem = expectedStart; sem < maxRecorded; sem++) {
            if (!semsSet.has(sem)) {
                gaps.push(sem);
            }
        }

        if (gaps.length > 0) {
            missingIntermediateSems.push({
                ...studentInfo,
                gaps,
                expectedStart,
                range: `${minRecorded} to ${maxRecorded}`
            });
        }

        // Check if mark count is suspiciously low (< 4 subjects per semester)
        if (recordedSems.length > 0 && (totalMarks / recordedSems.length) < 3) {
            lowMarkCounts.push(studentInfo);
        }
    }

    console.log('================================================================');
    console.log(`TOTAL STUDENTS AUDITED: ${students.length}`);
    console.log(`- Lateral Entry Students Detected: ${lateralEntrants.length}`);
    console.log(`- Regular Students: ${students.length - lateralEntrants.length}`);
    console.log(`- Students with ZERO Marks: ${totallyMissing.length}`);
    console.log(`- Students with Missing Intermediate Semesters: ${missingIntermediateSems.length}`);
    console.log(`- Students with Suspiciously Low Subject Counts: ${lowMarkCounts.length}`);
    console.log('================================================================\n');

    console.log('1. STUDENTS WITH ZERO MARKS:');
    console.log(JSON.stringify(totallyMissing, null, 2));

    console.log('\n2. STUDENTS WITH GAPS IN SEMESTERS:');
    console.log(JSON.stringify(missingIntermediateSems, null, 2));

    console.log('\n3. STUDENTS WITH SUSPICIOUSLY LOW SUBJECT COUNTS:');
    console.log(JSON.stringify(lowMarkCounts, null, 2));

    fs.writeFileSync('scratch_audit_results.json', JSON.stringify({
        totallyMissing,
        missingIntermediateSems,
        lowMarkCounts,
        lateralCount: lateralEntrants.length
    }, null, 2));
}

run().catch(console.error);
