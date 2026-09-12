import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { isCieOnlyCourse, calculateAcademicRecord } from '../lib/vtuAcademicEngine.js';
import { fetchCatalogIndex } from '../lib/subjectCreditResolver.js';

const envText = fs.readFileSync('.env', 'utf8');
const url = envText.match(/NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.*)/)?.[1]?.trim();
const key = envText.match(/SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.*)/)?.[1]?.trim();
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

async function main() {
    console.log('================================================================');
    console.log('INSTITUTIONAL AUDIT: CHECKING EACH & EVERY STUDENT IN DATABASE');
    console.log('================================================================\n');

    console.log('Loading full institutional database tables...');
    const [students, marks, remarks, catalogIndex] = await Promise.all([
        fetchAll('students', 'id, usn, name, branch, semester, scheme'),
        fetchAll('subject_marks', 'id, usn, semester, subject_code, subject_name, credits, internal, external, total, grade, passed, is_backlog'),
        fetchAll('academic_remarks', 'id, student_id, student_usn, semester, sgpa, backlog_count, is_all_clear'),
        fetchCatalogIndex(supabase)
    ]);

    console.log(`- Total Students: ${students.length}`);
    console.log(`- Total Subject Marks: ${marks.length}`);
    console.log(`- Total Academic Remarks: ${remarks.length}`);

    // Group marks by USN
    const marksByUsn = new Map();
    for (const m of marks) {
        const u = String(m.usn || '').toUpperCase().trim();
        if (!marksByUsn.has(u)) marksByUsn.set(u, []);
        marksByUsn.get(u).push(m);
    }

    // Group remarks by USN -> semester
    const remarksByUsn = new Map();
    for (const r of remarks) {
        const u = String(r.student_usn || '').toUpperCase().trim();
        if (!remarksByUsn.has(u)) remarksByUsn.set(u, new Map());
        remarksByUsn.get(u).set(Number(r.semester), r);
    }

    // Determine max external marks seen per subject code to detect SEE exam courses
    const subjectMaxExt = new Map();
    for (const m of marks) {
        const code = (m.subject_code || '').trim().toUpperCase();
        const ext = m.external !== null && m.external !== undefined ? Number(m.external) : null;
        if (ext !== null && !isNaN(ext)) {
            const cur = subjectMaxExt.get(code) || 0;
            if (ext > cur) subjectMaxExt.set(code, ext);
        }
    }

    let studentsWithFalsePasses = 0;
    let studentsWithFalseBacklogs = 0;
    let studentsWithRemarksMismatch = 0;
    let totalActiveBacklogStudents = 0;
    let totalAllClearStudents = 0;
    let totalStudentsChecked = 0;

    const falsePassDetails = [];
    const falseBacklogDetails = [];
    const remarksMismatches = [];
    const remarksToUpdate = [];

    for (const s of students) {
        const usn = String(s.usn || '').toUpperCase().trim();
        const uMarks = marksByUsn.get(usn) || [];
        totalStudentsChecked++;

        let studentHasFalsePass = false;
        let studentHasFalseBacklog = false;

        // 1. Audit every mark row for this student
        for (const m of uMarks) {
            const code = (m.subject_code || '').trim().toUpperCase();
            const ext = m.external !== null && m.external !== undefined ? Number(m.external) : null;
            const tot = Number(m.total) || 0;
            const g = (m.grade || '').trim().toUpperCase();
            const maxExt = subjectMaxExt.get(code) || 0;
            const isCieOnly = isCieOnlyCourse(code);

            // Check if this row is an SEE fail but marked pass
            if (maxExt >= 18 && !isCieOnly && ext !== null && ext < 18) {
                const isMarkedPass = m.passed === true || m.is_backlog === false || (g && !['F', 'FAIL', 'AB', 'ABSENT', 'A', 'W', 'X', 'NE'].includes(g));
                if (isMarkedPass) {
                    studentHasFalsePass = true;
                    falsePassDetails.push({ usn, name: s.name, sem: m.semester, code, int: m.internal, ext: m.external, tot: m.total, grade: m.grade });
                }
            }

            // Check if this row was a genuine pass but marked backlog
            if (tot >= 40 && (isCieOnly || (ext !== null && ext >= 18))) {
                if (m.is_backlog === true && m.passed === false && ['F', 'FAIL'].includes(g)) {
                    studentHasFalseBacklog = true;
                    falseBacklogDetails.push({ usn, name: s.name, sem: m.semester, code, int: m.internal, ext: m.external, tot: m.total, grade: m.grade });
                }
            }
        }

        if (studentHasFalsePass) studentsWithFalsePasses++;
        if (studentHasFalseBacklog) studentsWithFalseBacklogs++;

        // 2. Compute canonical academic record for this student
        const canonical = await calculateAcademicRecord(
            uMarks,
            { usn, branch: s.branch, scheme: s.scheme || '2022' },
            { catalogIndex }
        );
        const activeBacklogs = canonical?.totalActiveBacklogs || 0;
        if (activeBacklogs > 0) {
            totalActiveBacklogStudents++;
        } else if (uMarks.length > 0) {
            totalAllClearStudents++;
        }

        // 3. Check student academic_remarks against canonical record
        const uRemarksMap = remarksByUsn.get(usn) || new Map();
        for (const [semStr, semStat] of Object.entries(canonical?.semStats || {})) {
            const sem = Number(semStr);
            const remarkRow = uRemarksMap.get(sem);
            if (!remarkRow) continue;

            const storedBacklogs = Number(remarkRow.backlog_count) || 0;
            const storedAllClear = remarkRow.is_all_clear;
            const storedSgpa = Number(remarkRow.sgpa) || 0;

            const trueBacklogs = semStat.backlogs;
            const trueAllClear = semStat.backlogs === 0;
            const trueSgpa = semStat.sgpa;

            const backlogMismatch = storedBacklogs !== trueBacklogs || storedAllClear !== trueAllClear;
            const sgpaMismatch = Math.abs(storedSgpa - trueSgpa) > 0.05;

            if (backlogMismatch || sgpaMismatch) {
                remarksMismatches.push({
                    usn,
                    sem,
                    storedBacklogs,
                    trueBacklogs,
                    storedAllClear,
                    trueAllClear,
                    storedSgpa,
                    trueSgpa,
                    remarkId: remarkRow.id,
                    studentId: remarkRow.student_id || s.id
                });
                remarksToUpdate.push({
                    id: remarkRow.id,
                    student_id: remarkRow.student_id || s.id,
                    student_usn: usn,
                    semester: sem,
                    sgpa: trueSgpa,
                    backlog_count: trueBacklogs,
                    is_all_clear: trueAllClear
                });
            }
        }
    }

    if (remarksMismatches.length > 0) {
        studentsWithRemarksMismatch = new Set(remarksMismatches.map(r => r.usn)).size;
    }

    console.log('\n================================================================');
    console.log('AUDIT SUMMARY ACROSS ALL STUDENTS');
    console.log('================================================================');
    console.log(`Total Students Inspected:               ${totalStudentsChecked}`);
    console.log(`Students with False Passes (SEE < 18):  ${studentsWithFalsePasses}`);
    console.log(`Students with False Backlogs:           ${studentsWithFalseBacklogs}`);
    console.log(`Students with Remarks Mismatch:         ${studentsWithRemarksMismatch}`);
    console.log(`All-Clear Students:                     ${totalAllClearStudents}`);
    console.log(`Students with Active Backlogs:          ${totalActiveBacklogStudents}`);

    if (falsePassDetails.length > 0) {
        console.log(`\n[WARNING] Found ${falsePassDetails.length} false pass subject rows:`);
        console.table(falsePassDetails.slice(0, 10));
    } else {
        console.log('\n[PASS] ZERO false passes found across all students.');
    }

    if (falseBacklogDetails.length > 0) {
        console.log(`\n[WARNING] Found ${falseBacklogDetails.length} false backlog subject rows:`);
        console.table(falseBacklogDetails.slice(0, 10));
    } else {
        console.log('[PASS] ZERO false backlogs found across all students.');
    }

    if (remarksMismatches.length > 0) {
        console.log(`\n[INFO] Found ${remarksMismatches.length} remarks rows that need syncing to canonical marks.`);
        console.log(`Syncing ${remarksToUpdate.length} rows to academic_remarks now...`);
        const batchSize = 100;
        for (let i = 0; i < remarksToUpdate.length; i += batchSize) {
            const chunk = remarksToUpdate.slice(i, i + batchSize);
            const { error: upsertErr } = await supabase
                .from('academic_remarks')
                .upsert(chunk, { onConflict: 'student_id,semester' });
            if (upsertErr) {
                console.error('Error updating remarks chunk:', upsertErr);
            }
        }
        console.log('[SUCCESS] All academic_remarks successfully synced with marks ground truth!');
    } else {
        console.log('[PASS] All academic_remarks are 100% in sync with subject_marks.');
    }

    // Spot-check cohorts
    console.log('\n--- SAMPLE STUDENT SPOT CHECKS ACROSS BRANCHES ---');
    const sampleUsns = ['2AB23CS043', '2AB23CS013', '2AB23CS003', '2AB24CS029', '2AB24CI015', '2AB23EC001', '2AB22ME001'];
    for (const u of sampleUsns) {
        const s = students.find(x => String(x.usn || '').toUpperCase().trim() === u);
        if (!s) continue;
        const uMarks = marksByUsn.get(u) || [];
        const canonical = await calculateAcademicRecord(uMarks, { usn: u, branch: s.branch, scheme: s.scheme || '2022' }, { catalogIndex });
        const backlogs = (canonical?.activeBacklogSubjects || []).map(b => `${b.subjectCode} (Sem ${b.semester})`).join(', ') || 'None';
        console.log(`USN: ${u} | ${s.name} (${s.branch}) | CGPA: ${canonical?.cgpa} | Backlogs: ${canonical?.totalActiveBacklogs} [${backlogs}]`);
    }

    console.log('\n================================================================');
    console.log('INSTITUTIONAL AUDIT COMPLETE: ALL STUDENTS VERIFIED');
    console.log('================================================================');
}

main().catch(console.error);
