import { getAdminClient } from '../lib/analytics-data.js';
import { getGradeFromScore } from '../lib/vtuAcademicEngine.js';

async function main() {
    console.log('=== FIXING FALSE BACKLOGS ACROSS SUPABASE ===\n');
    const supabase = getAdminClient();

    let allMarks = [];
    let page = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('subject_marks')
            .select('id, usn, subject_code, semester, internal, external, total, grade, passed, is_backlog')
            .range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) {
            console.error('Error fetching subject_marks:', error);
            process.exit(1);
        }
        if (!data || data.length === 0) break;
        allMarks.push(...data);
        if (data.length < pageSize) break;
        page++;
    }
    console.log(`Fetched ${allMarks.length} total subject_marks rows.`);

    const falseFails = allMarks.filter(m => {
        const isFlaggedFail = m.grade === 'F' || m.grade === 'FAIL' || m.grade === 'A' || m.passed === false || m.is_backlog === true;
        if (!isFlaggedFail) return false;
        const tot = Number(m.total) || 0;
        const ext = m.external !== null && m.external !== undefined ? Number(m.external) : null;
        // VTU passing rule:
        // Aggregate total >= 40 AND either external >= 18 OR external is 0 (internal/project/audit subject)
        if (tot >= 40 && (ext === null || ext >= 18 || ext === 0)) {
            return true;
        }
        return false;
    });

    console.log(`Found ${falseFails.length} falsely failed subjects to correct.\n`);

    const affectedUsns = new Set();
    let updatedCount = 0;

    for (const row of falseFails) {
        const tot = Number(row.total) || 0;

        const { error: updateErr } = await supabase
            .from('subject_marks')
            .update({
                grade: 'P',
                passed: true,
                is_backlog: false
            })
            .eq('id', row.id);

        if (updateErr) {
            console.error(`Failed to update row ${row.id} (${row.usn} - ${row.subject_code}):`, updateErr);
        } else {
            updatedCount++;
            affectedUsns.add(row.usn);
            if (row.usn === '2AB24CD024' || row.usn === '2AB23CS043') {
                console.log(`[TARGET FIX] ${row.usn} | Sem ${row.semester} | ${row.subject_code} | Tot: ${tot} | Ext: ${row.external} | Int: ${row.internal} | '${row.grade}' -> 'P' (passed=true, is_backlog=false)`);
            }
        }
    }

    console.log(`\nSuccessfully updated ${updatedCount} / ${falseFails.length} subject rows.`);
    console.log(`Recalculating academic_remarks for ${affectedUsns.size} affected students...`);

    // Recalculate academic_remarks for affected students
    for (const usn of affectedUsns) {
        const { data: stMarks } = await supabase
            .from('subject_marks')
            .select('semester, is_backlog, grade, passed')
            .eq('usn', usn);

        if (!stMarks) continue;

        const sems = [...new Set(stMarks.map(m => m.semester))];
        for (const sem of sems) {
            const semSubjects = stMarks.filter(m => m.semester === sem);
            const backlogs = semSubjects.filter(m => m.is_backlog === true || m.passed === false || ['F', 'FAIL', 'AB', 'ABSENT'].includes((m.grade || '').trim().toUpperCase()));
            const backlogCount = backlogs.length;
            const isAllClear = backlogCount === 0;

            await supabase
                .from('academic_remarks')
                .update({
                    backlog_count: backlogCount,
                    is_all_clear: isAllClear
                })
                .eq('student_usn', usn)
                .eq('semester', sem);
        }
    }

    console.log('Finished updating academic_remarks for all affected students.');

    // Quick verification on 2AB24CD024
    const { data: verify24 } = await supabase
        .from('subject_marks')
        .select('subject_code, grade, passed, is_backlog, total, external, internal')
        .eq('usn', '2AB24CD024')
        .eq('subject_code', 'BMATS201')
        .single();
    console.log('\nVerification for 2AB24CD024 BMATS201:', verify24);

    process.exit(0);
}

main().catch(err => {
    console.error('Fatal error in fix script:', err);
    process.exit(1);
});
