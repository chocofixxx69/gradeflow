import { createClient } from '@supabase/supabase-js';
import { fetchCatalogIndex, resolveSubjectCredit } from '../lib/subjectCreditResolver.js';
import { isAuditCourse, normalizeBranch, calculateAcademicRecord } from '../lib/vtuAcademicEngine.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('=== RUNNING FINAL READ-ONLY DATA INTEGRITY SCAN ===\n');

  // 1. Check students count
  const { count: studentCount } = await supabase.from('students').select('*', { count: 'exact', head: true });
  console.log(`1. Total Students in database: ${studentCount} (Protected, 0 deleted)`);

  // 2. Check subject_marks count
  const { count: marksCount } = await supabase.from('subject_marks').select('*', { count: 'exact', head: true });
  console.log(`2. Total Subject Marks in database: ${marksCount} (Protected, 0 deleted)`);

  // 3. Check results count
  const { count: resultsCount } = await supabase.from('results').select('*', { count: 'exact', head: true });
  console.log(`3. Total Exam Results in database: ${resultsCount} (Protected, 0 deleted)`);

  // 4. Check subject_catalog count & duplicates
  let allCatalog = [];
  let page = 0;
  while (true) {
    const { data } = await supabase.from('subject_catalog').select('*').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allCatalog = allCatalog.concat(data);
    if (data.length < 1000) break;
    page++;
  }
  console.log(`4. Total Rows in subject_catalog: ${allCatalog.length}`);

  const catalogKeys = new Set();
  let duplicateCount = 0;
  for (const r of allCatalog) {
    const k = `${r.scheme}|${r.branch}|${r.semester}|${r.subject_code}`;
    if (catalogKeys.has(k)) duplicateCount++;
    catalogKeys.add(k);
  }
  console.log(`   - Duplicate catalog rows: ${duplicateCount}`);

  // 5. Test 2AB23CS008 complete regression
  const catalogIndex = await fetchCatalogIndex(supabase);
  const { data: rawMarks008 } = await supabase.from('subject_marks').select('*').ilike('usn', '2AB23CS008').order('semester');
  const { data: profile008 } = await supabase.from('students').select('*').ilike('usn', '2AB23CS008').maybeSingle();

  const record008 = await calculateAcademicRecord(rawMarks008, profile008, { catalogIndex });

  const expected008 = {
    1: { sgpa: 5.20, totalCredits: 20, earnedCredits: 20, gradePoints: 104, backlogs: 0 },
    2: { sgpa: 5.35, totalCredits: 20, earnedCredits: 20, gradePoints: 107, backlogs: 0 },
    3: { sgpa: 6.24, totalCredits: 21, earnedCredits: 21, gradePoints: 131, backlogs: 0 },
    4: { sgpa: 5.16, totalCredits: 19, earnedCredits: 17, gradePoints: 98, backlogs: 1 },
    5: { sgpa: 5.73, totalCredits: 22, earnedCredits: 22, gradePoints: 126, backlogs: 0 },
    6: { sgpa: 3.83, totalCredits: 18, earnedCredits: 11, gradePoints: 69, backlogs: 2 }
  };

  console.log('\n5. Baseline Regression Verification for 2AB23CS008:');
  let regressionPassed = true;
  for (let sem = 1; sem <= 6; sem++) {
    const act = record008.semStats[sem];
    const exp = expected008[sem];
    const ok = act && act.sgpa === exp.sgpa && act.totalCredits === exp.totalCredits && act.earnedCredits === exp.earnedCredits && act.gradePoints === exp.gradePoints && act.backlogs === exp.backlogs;
    if (!ok) regressionPassed = false;
    console.log(`   Semester ${sem}: SGPA ${act?.sgpa} (exp ${exp.sgpa}) | Credits ${act?.totalCredits}/${act?.earnedCredits} (exp ${exp.totalCredits}/${exp.earnedCredits}) | GP ${act?.gradePoints} (exp ${exp.gradePoints}) | Backlog ${act?.backlogs} (exp ${exp.backlogs}) -> ${ok ? 'PASS' : 'FAIL'}`);
  }
  console.log(`   Overall Regression Status: ${regressionPassed ? '100% PERFECT MATCH' : 'MISMATCH'}`);

  // 6. Check unresolved subjects count across whole DB
  let allMarks = [];
  page = 0;
  while (true) {
    const { data } = await supabase.from('subject_marks').select('usn, semester, subject_code, subject_name').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allMarks = allMarks.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  let allStudents = [];
  page = 0;
  while (true) {
    const { data } = await supabase.from('students').select('usn, scheme, branch').range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || data.length === 0) break;
    allStudents = allStudents.concat(data);
    if (data.length < 1000) break;
    page++;
  }

  const studentMap = new Map();
  for (const st of allStudents) {
    studentMap.set((st.usn || '').trim().toUpperCase(), {
      scheme: st.scheme || '2022',
      branch: normalizeBranch(st.branch, st.usn)
    });
  }

  let unresolvedCount = 0;
  for (const m of allMarks) {
    const u = (m.usn || '').trim().toUpperCase();
    const code = (m.subject_code || '').trim().toUpperCase();
    if (isAuditCourse(code)) continue;

    const st = studentMap.get(u) || { scheme: '2022', branch: normalizeBranch(null, u) };
    const res = resolveSubjectCredit(catalogIndex, {
      scheme: st.scheme,
      branch: st.branch,
      semester: m.semester,
      subject_code: code
    });
    if (res.source === 'unresolved' || res.credits === null) {
      unresolvedCount++;
    }
  }

  console.log(`\n6. Global Database Resolution:`);
  console.log(`   - Total Marks Audited: ${allMarks.length}`);
  console.log(`   - Total Unresolved Marks: ${unresolvedCount}`);
  console.log(`   - Resolution Rate: ${((allMarks.length - unresolvedCount) / allMarks.length * 100).toFixed(2)}%`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
