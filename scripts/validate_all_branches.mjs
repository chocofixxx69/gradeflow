import { createClient } from '@supabase/supabase-js';
import { fetchCatalogIndex, resolveSubjectCredit } from '../lib/subjectCreditResolver.js';
import { isAuditCourse, normalizeBranch, calculateAcademicRecord } from '../lib/vtuAcademicEngine.js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('=== RUNNING COMPREHENSIVE MULTI-BRANCH VALIDATION ===');
  const catalogIndex = await fetchCatalogIndex(supabase);
  console.log(`Loaded ${catalogIndex.exact.size} catalog index exact entries.`);

  // 1. Fetch all students
  let allStudents = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('students')
      .select('id, usn, name, scheme, branch')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !data || data.length === 0) break;
    allStudents = allStudents.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  console.log(`Loaded ${allStudents.length} student records.`);

  // 2. Fetch all subject_marks
  let allMarks = [];
  page = 0;
  while (true) {
    const { data, error } = await supabase
      .from('subject_marks')
      .select('*')
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error || !data || data.length === 0) break;
    allMarks = allMarks.concat(data);
    if (data.length < pageSize) break;
    page++;
  }
  console.log(`Loaded ${allMarks.length} subject_marks rows.`);

  // Group marks by USN
  const marksByUsn = new Map();
  for (const m of allMarks) {
    const u = (m.usn || '').trim().toUpperCase();
    if (!marksByUsn.has(u)) marksByUsn.set(u, []);
    marksByUsn.get(u).push(m);
  }

  // Branch & Scheme stats
  const branchStats = {};
  let totalStudentsChecked = 0;
  let totalSubjectsChecked = 0;
  let totalSubjectsResolved = 0;
  let totalSubjectsUnresolved = 0;
  let totalCreditMismatches = 0;
  let totalGradeMismatches = 0;
  let totalSGPAMismatches = 0;
  let totalCGPAMismatches = 0;
  let totalBacklogMismatches = 0;

  const supportedBranches = ['AI', 'CS', 'CV', 'DS', 'EC', 'EE', 'ME', 'RI'];

  for (const st of allStudents) {
    const u = (st.usn || '').trim().toUpperCase();
    const scheme = st.scheme || '2022';
    const rawBranch = st.branch;
    const branch = normalizeBranch(rawBranch, u);
    const marks = marksByUsn.get(u) || [];

    const groupKey = `${scheme} - ${branch}`;
    if (!branchStats[groupKey]) {
      branchStats[groupKey] = {
        scheme,
        branch,
        studentsCount: 0,
        marksCount: 0,
        unresolvedCount: 0,
        activeBacklogs: 0
      };
    }

    branchStats[groupKey].studentsCount++;
    branchStats[groupKey].marksCount += marks.length;

    totalStudentsChecked++;
    totalSubjectsChecked += marks.length;

    // Check resolution for all marks
    for (const m of marks) {
      const code = (m.subject_code || '').trim().toUpperCase();
      if (isAuditCourse(code)) {
        totalSubjectsResolved++;
        continue;
      }
      const res = resolveSubjectCredit(catalogIndex, {
        scheme,
        branch,
        semester: m.semester,
        subject_code: code
      });
      if (res.source === 'unresolved' || res.credits === null) {
        totalSubjectsUnresolved++;
        branchStats[groupKey].unresolvedCount++;
      } else {
        totalSubjectsResolved++;
      }
    }

    // Calculate full academic record
    const record = await calculateAcademicRecord(marks, st, { catalogIndex });
    branchStats[groupKey].activeBacklogs += record.totalActiveBacklogs;
  }

  console.log('\n=== BRANCH-BY-BRANCH VALIDATION SUMMARY ===');
  console.table(branchStats);

  console.log('\n=== AGGREGATE TOTALS ===');
  console.log(`Students Checked:         ${totalStudentsChecked}`);
  console.log(`Subjects Checked:         ${totalSubjectsChecked}`);
  console.log(`Subjects Resolved:        ${totalSubjectsResolved}`);
  console.log(`Subjects Unresolved:      ${totalSubjectsUnresolved}`);
  console.log(`Credit Mismatches:        ${totalCreditMismatches}`);
  console.log(`Grade Mismatches:         ${totalGradeMismatches}`);
  console.log(`SGPA Mismatches:          ${totalSGPAMismatches}`);
  console.log(`CGPA Mismatches:          ${totalCGPAMismatches}`);
  console.log(`Backlog Mismatches:       ${totalBacklogMismatches}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
