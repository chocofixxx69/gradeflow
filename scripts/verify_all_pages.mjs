const pages = [
  '/',
  '/auth',
  '/auth/student',
  '/dashboard',
  '/calculator',
  '/vault',
  '/settings',
  '/analytics',
  '/faculty/login',
  '/faculty/register',
  '/faculty/dashboard',
  '/faculty/classes',
  '/faculty/batch-upload',
  '/faculty/subjects',
  '/faculty/reports',
  '/faculty/vtu-urls',
  '/admin/terminal'
];

async function checkAll() {
  console.log('Verifying all routes on http://localhost:3000...\n');
  let allGood = true;

  for (const page of pages) {
    try {
      const res = await fetch('http://localhost:3000' + page);
      const html = await res.text();
      const hasInter = html.includes('__className_8b3a0b');
      const isOk = res.status === 200 && hasInter;
      if (!isOk) allGood = false;

      console.log(`${isOk ? '✓' : '✗'} [Status: ${res.status}] ${page.padEnd(25)} -> Clean Inter font applied: ${hasInter}`);
    } catch (e) {
      allGood = false;
      console.error(`✗ [ERROR] ${page.padEnd(25)} -> ${e.message}`);
    }
  }

  console.log(`\nResult: ${allGood ? 'ALL ROUTES VERIFIED SUCCESSFULLY WITH CLEAN INTER FONT' : 'SOME ROUTES HAD ISSUES'}`);
}

checkAll();
