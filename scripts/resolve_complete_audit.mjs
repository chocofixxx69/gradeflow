import { getAdminClient } from '../lib/analytics-data.js';
import { fetchCatalogIndex, resolveSubjectCredit } from '../lib/subjectCreditResolver.js';
import { isAuditCourse, normalizeBranch, calculateAcademicRecord } from '../lib/vtuAcademicEngine.js';
import { readTable, SELECTS } from '../lib/table-cache.js';

const supabaseAdmin = getAdminClient();

async function fetchAllPaged(table, select, filterFn) {
    const all = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        let q = supabaseAdmin.from(table).select(select).range(from, from + pageSize - 1);
        if (filterFn) q = filterFn(q);
        const { data, error } = await q;
        if (error) throw error;
        all.push(...(data || []));
        if (!data || data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

async function main() {
    console.log('=== STARTING COMPLETE AUDIT RESOLUTION ===\n');

    const [catalogIndex, students, marks] = await Promise.all([
        fetchCatalogIndex(supabaseAdmin),
        readTable(supabaseAdmin, 'students', SELECTS.students, { orderCol: 'usn' }),
        readTable(supabaseAdmin, 'subject_marks', SELECTS.subject_marks)
    ]);

    const studentByUsn = new Map(students.map(s => [(s.usn || '').toUpperCase(), s]));
    console.log(`Loaded ${students.length} students and ${marks.length} subject_marks rows.`);

    const mismatches = [];
    const unresolved = [];
    let auditCount = 0;
    let okCount = 0;

    for (const m of marks) {
        const code = (m.subject_code || '').trim().toUpperCase();
        if (isAuditCourse(code)) {
            auditCount++;
            if (m.credits !== 0 && m.credits !== null) {
                mismatches.push({ id: m.id, usn: m.usn, semester: m.semester, subject_code: code, stored_credits: m.credits, correct_credits: 0, branch: 'ANY', source: 'audit' });
            }
            continue;
        }

        const student = studentByUsn.get((m.usn || '').toUpperCase());
        const scheme = student?.scheme || '2022';
        const branch = normalizeBranch(student?.branch, m.usn);

        const resolved = resolveSubjectCredit(catalogIndex, { scheme, branch, semester: m.semester, subject_code: code });

        if (resolved.credits === null) {
            unresolved.push({ id: m.id, usn: m.usn, semester: m.semester, subject_code: code, stored_credits: m.credits, branch });
            continue;
        }

        if (Number(resolved.credits) !== Number(m.credits)) {
            mismatches.push({ id: m.id, usn: m.usn, semester: m.semester, subject_code: code, stored_credits: m.credits, correct_credits: resolved.credits, branch, source: resolved.source });
        } else {
            okCount++;
        }
    }

    console.log('\n--- Initial Audit Scan ---');
    console.log(`- Total Marks: ${marks.length}`);
    console.log(`- Exact OK: ${okCount}`);
    console.log(`- Audit / Non-credit: ${auditCount}`);
    console.log(`- Drift / Mismatches to Fix: ${mismatches.length}`);
    console.log(`- Unresolved: ${unresolved.length}`);

    if (unresolved.length > 0) {
        console.warn(`WARNING: Still found ${unresolved.length} unresolved subject marks!`);
        unresolved.slice(0, 10).forEach(u => console.log('   Unresolved:', u));
    }

    if (mismatches.length === 0) {
        console.log('\n✓ Zero drift found! Database is already 100% synchronized.');
        return;
    }

    console.log(`\nFixing ${mismatches.length} mismatches in subject_marks...`);
    const chunkSize = 200;
    for (let i = 0; i < mismatches.length; i += chunkSize) {
        const chunk = mismatches.slice(i, i + chunkSize);
        await Promise.all(chunk.map(m =>
            supabaseAdmin.from('subject_marks').update({ credits: m.correct_credits }).eq('id', m.id)
        ));
        process.stdout.write(`  Updated ${Math.min(i + chunkSize, mismatches.length)} / ${mismatches.length} rows...\r`);
    }
    console.log(`\n✓ All ${mismatches.length} subject_marks.credits rows updated!`);

    // 2. Recompute affected (usn, semester) pairs
    const pairKey = (usn, sem) => `${(usn || '').toUpperCase()}_${sem}`;
    const pairs = new Map();
    mismatches.forEach(m => pairs.set(pairKey(m.usn, m.semester), { usn: (m.usn || '').toUpperCase(), semester: m.semester }));

    const usns = [...new Set([...pairs.values()].map(p => p.usn))];
    console.log(`\nRecalculating remarks & results for ${usns.length} affected students across ${pairs.size} semester pairs...`);

    const remarksRows = [];
    const resultUpdates = [];

    for (let i = 0; i < usns.length; i++) {
        const usn = usns[i];
        const student = studentByUsn.get(usn);
        const scheme = student?.scheme || '2022';
        const semestersForUsn = [...pairs.values()].filter(p => p.usn === usn).map(p => p.semester);

        const { data: allMarksForUsn, error } = await supabaseAdmin.from('subject_marks').select('*').eq('usn', usn);
        if (error) {
            console.error(`Error loading marks for ${usn}:`, error);
            continue;
        }

        const record = await calculateAcademicRecord(allMarksForUsn, { usn, branch: student?.branch, scheme }, { catalogIndex });

        for (const semester of semestersForUsn) {
            const stat = record.semStats[semester];
            if (!stat) continue;
            const backlogs = record.activeBacklogSubjects.filter(s => Number(s.semester) === Number(semester)).length;

            if (student?.id) {
                remarksRows.push({
                    student_id: student.id,
                    student_usn: usn,
                    semester,
                    sgpa: stat.sgpa,
                    backlog_count: backlogs,
                    is_all_clear: backlogs === 0
                });
            }
            resultUpdates.push({ usn, semester, newSgpa: stat.sgpa, tc: stat.totalCredits });
        }
        if (i % 25 === 0) {
            process.stdout.write(`  Processed ${i} / ${usns.length} students...\r`);
        }
    }

    if (remarksRows.length) {
        console.log(`\nUpserting ${remarksRows.length} academic_remarks records...`);
        for (let i = 0; i < remarksRows.length; i += 200) {
            const chunk = remarksRows.slice(i, i + 200);
            const { error } = await supabaseAdmin.from('academic_remarks').upsert(chunk, { onConflict: 'student_id,semester' });
            if (error) console.error('Error upserting remarks chunk:', error);
        }
    }

    if (resultUpdates.length) {
        console.log(`Updating ${resultUpdates.length} results records...`);
        const semestersInvolved = [...new Set(resultUpdates.map(r => r.semester))];
        const existingResults = await fetchAllPaged('results', 'id, usn, semester', q => q.in('usn', usns).in('semester', semestersInvolved));
        const firstResultByPair = new Map();
        existingResults.forEach(r => {
            const k = pairKey(r.usn, r.semester);
            if (!firstResultByPair.has(k)) firstResultByPair.set(k, r.id);
        });

        for (let i = 0; i < resultUpdates.length; i += 50) {
            const chunk = resultUpdates.slice(i, i + 50);
            await Promise.all(chunk.map(async ({ usn, semester, newSgpa, tc }) => {
                const id = firstResultByPair.get(pairKey(usn, semester));
                if (!id) return;
                await supabaseAdmin.from('results').update({ sgpa: newSgpa, total_credits: tc }).eq('id', id);
            }));
        }
    }

    console.log('\n=== VERIFYING POST-AUDIT INTEGRITY ===');
    const freshMarks = await fetchAllPaged('subject_marks', 'id, usn, semester, subject_code, credits');
    let postMismatches = 0;
    let postUnresolved = 0;

    for (const m of freshMarks) {
        const code = (m.subject_code || '').trim().toUpperCase();
        if (isAuditCourse(code)) continue;
        const student = studentByUsn.get((m.usn || '').toUpperCase());
        const scheme = student?.scheme || '2022';
        const branch = normalizeBranch(student?.branch, m.usn);
        const resolved = resolveSubjectCredit(catalogIndex, { scheme, branch, semester: m.semester, subject_code: code });
        if (resolved.credits === null) postUnresolved++;
        else if (Number(resolved.credits) !== Number(m.credits)) postMismatches++;
    }

    console.log(`Post-audit Mismatches: ${postMismatches}`);
    console.log(`Post-audit Unresolved: ${postUnresolved}`);
    if (postMismatches === 0 && postUnresolved === 0) {
        console.log('\n🎉 COMPLETE AUDIT RESOLVED WITH 100% PERFECT INTEGRITY!');
    }
}

main().catch(err => {
    console.error('Fatal audit error:', err);
    process.exit(1);
});
