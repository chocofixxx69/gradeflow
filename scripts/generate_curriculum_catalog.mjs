import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function main() {
  console.log('Fetching all rows from subject_catalog...');
  let allCatalog = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const { data, error } = await supabase
      .from('subject_catalog')
      .select('scheme, branch, semester, subject_code, subject_name, credits')
      .range(page * pageSize, (page + 1) * pageSize - 1)
      .order('scheme')
      .order('branch')
      .order('semester')
      .order('subject_code');
    if (error || !data || data.length === 0) break;
    allCatalog = allCatalog.concat(data);
    if (data.length < pageSize) break;
    page++;
  }

  console.log(`Fetched ${allCatalog.length} records.`);

  // Build VTU_OFFICIAL_SUBJECT_DATA structure: [scheme][branch][semester] = [{ code, name, credits }]
  const officialData = {};
  const creditsLookup = {};

  for (const r of allCatalog) {
    const scheme = String(r.scheme || '2022').trim();
    const branch = String(r.branch || 'CS').trim().toUpperCase();
    const semester = Number(r.semester) || 1;
    const code = String(r.subject_code || '').trim().toUpperCase();
    const name = String(r.subject_name || '').trim();
    const credits = Number(r.credits);

    if (!officialData[scheme]) officialData[scheme] = {};
    if (!officialData[scheme][branch]) officialData[scheme][branch] = {};
    if (!officialData[scheme][branch][semester]) officialData[scheme][branch][semester] = [];

    // Avoid duplicate objects in semester list
    if (!officialData[scheme][branch][semester].some(x => x.code === code)) {
      officialData[scheme][branch][semester].push({ code, name, credits });
    }

    // Fast lookup keys
    creditsLookup[`${scheme}_${branch}_${semester}_${code}`] = credits;
    creditsLookup[`${scheme}_${code}`] = credits;
    if (creditsLookup[code] === undefined) {
      creditsLookup[code] = credits;
    }
  }

  const content = `// lib/vtu-curriculum-catalog.js
// Authoritative VTU Curriculum Data for Schemes 2022 and 2025 across all 8 branches (AI, CS, CV, DS, EC, EE, ME, RI)
// Generated directly from database subject_catalog table (${allCatalog.length} records)

export const VTU_SUPPORTED_BRANCHES = {
    'AI': 'Artificial Intelligence & Machine Learning',
    'CS': 'Computer Science & Engineering',
    'CV': 'Civil Engineering',
    'DS': 'Computer Science & Engineering (Data Science)',
    'EC': 'Electronics & Communication Engineering',
    'EE': 'Electrical & Electronics Engineering',
    'ME': 'Mechanical Engineering',
    'RI': 'Robotics & Artificial Intelligence'
};

export const OFFICIAL_CREDITS_LOOKUP = ${JSON.stringify(creditsLookup, null, 2)};

export const VTU_OFFICIAL_SUBJECT_DATA = ${JSON.stringify(officialData, null, 2)};

export function getOfficialCredit(subjectCode, scheme = '2022', branch = null, semester = null) {
    if (!subjectCode) return null;
    const code = String(subjectCode).trim().toUpperCase();
    const s = String(scheme || '2022').trim();
    
    if (branch && semester) {
        const b = String(branch).trim().toUpperCase();
        const sem = Number(semester);
        const specificKey = \`\${s}_\${b}_\${sem}_\${code}\`;
        if (OFFICIAL_CREDITS_LOOKUP[specificKey] !== undefined) {
            return OFFICIAL_CREDITS_LOOKUP[specificKey];
        }
    }
    
    const schemeKey = \`\${s}_\${code}\`;
    if (OFFICIAL_CREDITS_LOOKUP[schemeKey] !== undefined) {
        return OFFICIAL_CREDITS_LOOKUP[schemeKey];
    }
    
    if (OFFICIAL_CREDITS_LOOKUP[code] !== undefined) {
        return OFFICIAL_CREDITS_LOOKUP[code];
    }
    
    return null;
}
`;

  fs.writeFileSync('lib/vtu-curriculum-catalog.js', content, 'utf8');
  console.log('Successfully wrote lib/vtu-curriculum-catalog.js');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
