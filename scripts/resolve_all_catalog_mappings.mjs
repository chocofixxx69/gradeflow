import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('=== STARTING CANONICAL CATALOG MAPPING & UPDATES ===');

  // 1. Update BPLCK 105 and 205 variant credits from 2 to 3 across 2022 scheme
  const { data: bplckRows, error: bplckErr } = await supabase
    .from('subject_catalog')
    .select('id, scheme, branch, semester, subject_code, credits')
    .eq('scheme', '2022')
    .or('subject_code.ilike.BPLCK105%,subject_code.ilike.BPLCK205%');

  console.log(`Found ${bplckRows?.length || 0} BPLCK rows in 2022 scheme`);
  const bplckToUpdate = (bplckRows || []).filter(r => r.credits === 2);
  console.log(`Updating ${bplckToUpdate.length} BPLCK rows from 2 to 3 credits...`);

  for (const r of bplckToUpdate) {
    const { error } = await supabase
      .from('subject_catalog')
      .update({ credits: 3 })
      .eq('id', r.id);
    if (error) console.error(`Error updating BPLCK row ${r.id}:`, error);
  }
  console.log('BPLCK credit updates complete.');

  // 2. Insert missing canonical rows for all supported branches
  const branches = ['AI', 'CS', 'CV', 'DS', 'EC', 'EE', 'ME', 'RI'];
  const newRows = [];

  // Balake Kannada / Samskrutika Kannada for Sem 1 & 2
  for (const b of branches) {
    newRows.push(
      { scheme: '2022', branch: b, semester: 1, subject_code: 'BKBKK107', subject_name: 'Balake Kannada', credits: 1 },
      { scheme: '2022', branch: b, semester: 1, subject_code: 'BKSKK107', subject_name: 'Samskrutika Kannada', credits: 1 },
      { scheme: '2022', branch: b, semester: 2, subject_code: 'BKBKK207', subject_name: 'Balake Kannada', credits: 1 },
      { scheme: '2022', branch: b, semester: 2, subject_code: 'BKSKK207', subject_name: 'Samskrutika Kannada', credits: 1 }
    );
  }

  // AI/DS branch specific courses
  newRows.push(
    { scheme: '2022', branch: 'AI', semester: 4, subject_code: 'BBOC407', subject_name: 'Biology for Computer Engineers', credits: 2 },
    { scheme: '2022', branch: 'AI', semester: 4, subject_code: 'BDSL456C', subject_name: 'MERN Stack Lab', credits: 1 },
    { scheme: '2022', branch: 'AI', semester: 4, subject_code: 'BDS456X', subject_name: 'Ability Enhancement Course-IV', credits: 1 },
    { scheme: '2022', branch: 'DS', semester: 4, subject_code: 'BDSL456C', subject_name: 'MERN Stack Lab', credits: 1 },
    { scheme: '2022', branch: 'AI', semester: 5, subject_code: 'BCI586', subject_name: 'Mini Project', credits: 2 },
    { scheme: '2022', branch: 'AI', semester: 6, subject_code: 'BCO601', subject_name: 'Microcontrollers & Embedded Systems', credits: 4 },
    { scheme: '2022', branch: 'AI', semester: 6, subject_code: 'BCS602', subject_name: 'Machine Learning', credits: 4 },
    { scheme: '2022', branch: 'AI', semester: 6, subject_code: 'BCI685', subject_name: 'Project Phase I', credits: 2 },
    { scheme: '2022', branch: 'AI', semester: 6, subject_code: 'BCSL606', subject_name: 'Machine Learning Lab', credits: 1 }
  );

  // CV branch specific courses
  newRows.push(
    { scheme: '2022', branch: 'CV', semester: 3, subject_code: 'BCVL305', subject_name: 'Computer Aided Building Planning and Drawing', credits: 1 },
    { scheme: '2022', branch: 'CV', semester: 4, subject_code: 'BCVL456A', subject_name: 'Building Information Modelling in Civil Engineering', credits: 1 },
    { scheme: '2022', branch: 'CV', semester: 5, subject_code: 'BCVL504', subject_name: 'Environmental Engineering Lab', credits: 1 },
    { scheme: '2022', branch: 'CV', semester: 6, subject_code: 'BCVL657A', subject_name: 'Building Information Modelling - Advanced', credits: 1 },
    { scheme: '2022', branch: 'CV', semester: 6, subject_code: 'BEE654B', subject_name: 'Technologies of Renewable Energy Sources', credits: 3 }
  );

  console.log(`Checking which of the ${newRows.length} canonical rows already exist...`);
  let addedCount = 0;
  for (const row of newRows) {
    const { data: existing } = await supabase
      .from('subject_catalog')
      .select('id')
      .eq('scheme', row.scheme)
      .eq('branch', row.branch)
      .eq('semester', row.semester)
      .eq('subject_code', row.subject_code)
      .maybeSingle();

    if (!existing) {
      const { error: insertErr } = await supabase.from('subject_catalog').insert(row);
      if (insertErr) {
        console.error(`Error inserting ${row.scheme}|${row.branch}|${row.semester}|${row.subject_code}:`, insertErr);
      } else {
        addedCount++;
        console.log(`+ Added: ${row.scheme} | ${row.branch} | Sem ${row.semester} | ${row.subject_code} (${row.credits} cr) - ${row.subject_name}`);
      }
    }
  }

  console.log(`Added ${addedCount} new canonical catalog rows.`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
