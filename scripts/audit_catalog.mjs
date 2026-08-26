import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

let allCatalog = [];
let page = 0;
const pageSize = 1000;
while (true) {
  const { data, error } = await supabase.from('subject_catalog').select('*').range(page * pageSize, (page + 1) * pageSize - 1);
  if (error || !data || data.length === 0) break;
  allCatalog = allCatalog.concat(data);
  if (data.length < pageSize) break;
  page++;
}

console.log('Total subject_catalog rows:', allCatalog.length);

// 1. Check for duplicates: (scheme, branch, semester, subject_code)
const seen = new Map();
const duplicates = [];
for (const r of allCatalog) {
  const key = `${r.scheme}|${r.branch}|${r.semester}|${r.subject_code}`;
  if (seen.has(key)) {
    duplicates.push({ original: seen.get(key), duplicate: r });
  } else {
    seen.set(key, r);
  }
}
console.log('Duplicate rows found:', duplicates.length);

// 2. Check for null or invalid credits
const invalidCredits = allCatalog.filter(r => r.credits === null || r.credits === undefined || isNaN(Number(r.credits)) || Number(r.credits) < 0 || Number(r.credits) > 20);
console.log('Invalid/Null credits found:', invalidCredits.length);

// 3. Check for invalid codes
const invalidCodes = allCatalog.filter(r => !r.subject_code || r.subject_code.trim() === '');
console.log('Invalid codes found:', invalidCodes.length);

// 4. Breakdown by scheme and branch
const breakdown = {};
for (const r of allCatalog) {
  const key = `${r.scheme} - ${r.branch}`;
  breakdown[key] = (breakdown[key] || 0) + 1;
}
console.log('Catalog breakdown:');
console.table(breakdown);
