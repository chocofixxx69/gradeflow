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
        if (error) throw error;
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < pageSize) break;
        page++;
    }
    return rows;
}

async function analyze() {
    console.log('Fetching database records for comprehensive audit...');
    const [students, marks] = await Promise.all([
        fetchAll('students', 'id, usn, name, branch, semester, scheme, lateral_entry, year'),
        fetchAll('subject_marks', 'id, usn, semester, subject_code, total, grade')
    ]);

    const marksByUsn = new Map();
    const countByUsn = new Map();

    for (const m of marks) {
        if (!m.usn) continue;
        const u = String(m.usn).toUpperCase().trim();
        if (!marksByUsn.has(u)) marksByUsn.set(u, new Set());
        marksByUsn.get(u).add(Number(m.semester));
        countByUsn.set(u, (countByUsn.get(u) || 0) + 1);
    }

    const students2022 = [];
    const students2025 = [];

    for (const s of students) {
        const u = String(s.usn || '').toUpperCase().trim();
        const semsSet = marksByUsn.get(u) || new Set();
        const recordedSems = Array.from(semsSet).sort((a, b) => a - b);
        const lateral = resolveLateralEntry(s, recordedSems);
        const totalMarks = countByUsn.get(u) || 0;
        const branch = resolveBranch(s);
        const batch = resolveBatch(s);
        
        // Scheme deduction from USN & database
        const is2025Scheme = batch.twoDigit === '25' || String(s.scheme) === '2025';
        const scheme = is2025Scheme ? '2025' : '2022';

        let reason = null;
        let missingSems = [];

        // 1. Zero marks on record
        if (totalMarks === 0) {
            reason = 'NO_MARKS (0 marks in DB)';
            missingSems = [1];
        } 
        // 2. Suspiciously low marks (under 4 subjects overall or incomplete)
        else if (is2025Scheme && totalMarks < 4) {
            reason = `INCOMPLETE_MARKS (${totalMarks} subject(s) recorded)`;
            missingSems = [1];
        }
        // 3. Semester gaps
        else {
            const expectedStart = lateral.isLateral ? 3 : 1;
            const maxRecorded = recordedSems[recordedSems.length - 1];

            // Intermediate gaps
            for (let sem = expectedStart; sem < maxRecorded; sem++) {
                if (!semsSet.has(sem)) {
                    missingSems.push(sem);
                }
            }

            // Expected cohort progress checks
            // 2023 batch: expected Sem 1..4 (or 1..6)
            if (batch.twoDigit === '23') {
                const targetMax = 6;
                for (let sem = expectedStart; sem <= targetMax; sem++) {
                    if (!semsSet.has(sem) && !missingSems.includes(sem)) {
                        // only flag as missing if gap or missing 1..4
                        if (sem <= 4) missingSems.push(sem);
                    }
                }
            }

            // 2024 batch: expected Sem 1 & Sem 2 for regular
            if (batch.twoDigit === '24' && !lateral.isLateral) {
                if (!semsSet.has(1) && !missingSems.includes(1)) missingSems.push(1);
                if (!semsSet.has(2) && !missingSems.includes(2)) missingSems.push(2);
            }

            // 2025 batch: expected Sem 1
            if (batch.twoDigit === '25') {
                if (!semsSet.has(1) && !missingSems.includes(1)) missingSems.push(1);
            }

            if (missingSems.length > 0) {
                reason = `MISSING_SEMESTER_GAPS (Missing Sem: ${missingSems.sort((a,b)=>a-b).join(', ')})`;
            }
        }

        if (reason) {
            const item = {
                usn: u,
                name: s.name || 'UNKNOWN',
                branch: branch.code || s.branch || 'N/A',
                batch: batch.twoDigit || '??',
                scheme,
                isLateral: lateral.isLateral,
                recordedSemesters: recordedSems,
                missingSemesters: missingSems.sort((a,b)=>a-b),
                totalMarks,
                reason
            };

            if (scheme === '2025') {
                students2025.push(item);
            } else {
                students2022.push(item);
            }
        }
    }

    // Sort by USN
    students2022.sort((a, b) => a.usn.localeCompare(b.usn));
    students2025.sort((a, b) => a.usn.localeCompare(b.usn));

    console.log('\n============================================================');
    console.log(`TOTAL STUDENTS NEEDING SCRAPING: ${students2022.length + students2025.length}`);
    console.log(`- 2022 Scheme Candidates: ${students2022.length}`);
    console.log(`- 2025 Scheme Candidates: ${students2025.length}`);
    console.log('============================================================\n');

    // Write USN lists to disk
    const header2022 = `# 2022 Scheme - Target USNs for Scraping (${students2022.length} students)\n`;
    const lines2022 = students2022.map(s => `${s.usn}`).join('\n');
    fs.writeFileSync('missing_students_2022.txt', header2022 + lines2022 + '\n');

    const header2025 = `# 2025 Scheme - Target USNs for Scraping (${students2025.length} students)\n`;
    const lines2025 = students2025.map(s => `${s.usn}`).join('\n');
    fs.writeFileSync('missing_students_2025.txt', header2025 + lines2025 + '\n');

    // Combined missing_students.txt
    const combinedHeader = `# Combined Missing / Incomplete Students (${students2022.length + students2025.length} students)\n`;
    const combinedLines = [...students2022, ...students2025].map(s => s.usn).join('\n');
    fs.writeFileSync('missing_students.txt', combinedHeader + combinedLines + '\n');

    // Detailed JSON report
    fs.writeFileSync('scratch/detailed_missing_report.json', JSON.stringify({
        summary: {
            totalNeedScraping: students2022.length + students2025.length,
            count2022: students2022.length,
            count2025: students2025.length
        },
        students2022,
        students2025
    }, null, 2));

    console.log('Generated files:');
    console.log('  1. missing_students_2022.txt');
    console.log('  2. missing_students_2025.txt');
    console.log('  3. missing_students.txt (combined)');
    console.log('  4. scratch/detailed_missing_report.json (full breakdown with reasons & missing sems)\n');
}

analyze().catch(console.error);
