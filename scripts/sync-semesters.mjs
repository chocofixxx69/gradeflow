import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Missing Supabase credentials in env.');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function fetchAllPaged(table, select) {
    const all = [];
    let from = 0;
    const pageSize = 1000;
    while (true) {
        const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1);
        if (error) throw error;
        if (data) all.push(...data);
        if (!data || data.length < pageSize) break;
        from += pageSize;
    }
    return all;
}

export async function syncAllStudentSemesters() {
    console.log('Fetching all students, subject marks, and class enrollments...');
    const [students, subjMarks, classEnrollments] = await Promise.all([
        fetchAllPaged('students', 'id, usn, name, semester, year, lateral_entry'),
        fetchAllPaged('subject_marks', 'usn, semester'),
        fetchAllPaged('class_students', 'usn, classes(semester)')
    ]);

    console.log(`Found: ${students.length} students, ${subjMarks.length} subject mark rows, ${classEnrollments.length} enrollments.`);

    const marksMap = {};
    for (const m of subjMarks) {
        if (!m.usn) continue;
        const u = m.usn.toUpperCase().trim();
        if (!marksMap[u]) marksMap[u] = [];
        marksMap[u].push(Number(m.semester));
    }

    const classMap = {};
    for (const ce of classEnrollments) {
        if (!ce.usn || !ce.classes?.semester) continue;
        const u = ce.usn.toUpperCase().trim();
        if (!classMap[u]) classMap[u] = [];
        classMap[u].push(Number(ce.classes.semester));
    }

    let updatedCount = 0;
    const updates = [];

    for (const s of students) {
        const u = (s.usn || '').toUpperCase().trim();
        const sMarks = marksMap[u] || [];
        const maxMarkSem = sMarks.length > 0 ? Math.max(...sMarks) : 0;
        const sClasses = classMap[u] || [];
        const maxClassSem = sClasses.length > 0 ? Math.max(...sClasses) : 0;

        let computedSem = Number(s.semester) || 1;

        // If student is enrolled in a class, use class semester
        if (maxClassSem > 0) {
            computedSem = maxClassSem;
        } else if (maxMarkSem > 0) {
            // Student finished exams up to maxMarkSem -> Promoted to maxMarkSem + 1
            computedSem = Math.min(maxMarkSem + 1, 8);
        }

        if (computedSem !== Number(s.semester)) {
            updates.push({ id: s.id, usn: s.usn, name: s.name, oldSem: s.semester, newSem: computedSem });
        }
    }

    console.log(`Need to update ${updates.length} students...`);

    for (let i = 0; i < updates.length; i += 20) {
        const batch = updates.slice(i, i + 20);
        await Promise.all(
            batch.map(item => supabase.from('students').update({ semester: item.newSem }).eq('id', item.id))
        );
        updatedCount += batch.length;
    }

    console.log(`Semester synchronization complete: ${updatedCount} student(s) updated.`);
    return { updatedCount, totalStudents: students.length };
}

if (process.argv[1]?.includes('sync-semesters.mjs')) {
    syncAllStudentSemesters()
        .then(res => console.log('Result:', res))
        .catch(err => { console.error('Sync failed:', err); process.exit(1); });
}
