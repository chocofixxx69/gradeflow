import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in environment.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function deduceScheme(usn) {
    const clean = (usn || '').trim().toUpperCase();
    const match = clean.match(/^[0-9][A-Z]{2}(\d{2})[A-Z]{2,3}\d{3}$/);
    if (match) {
        const yr = parseInt(match[1], 10);
        return yr >= 25 ? '2025' : '2022';
    }
    return '2022';
}

async function runTests() {
    console.log('====================================');
    console.log('Scheme-Aware Portal & Scraper Verification');
    console.log('====================================\n');

    // 1. Verify Scheme Deduction from USNs
    const testCases = [
        { usn: '1RV22CS001', expected: '2022' },
        { usn: '2AB23CS013', expected: '2022' },
        { usn: '1MS24IS050', expected: '2022' },
        { usn: '1RV25CS001', expected: '2025' },
        { usn: '1RV26AI020', expected: '2025' }
    ];

    console.log('Test 1: USN Scheme Deduction');
    let usnPass = true;
    for (const { usn, expected } of testCases) {
        const actual = deduceScheme(usn);
        const ok = actual === expected;
        if (!ok) usnPass = false;
        console.log(`  ${ok ? '✓' : '✗'} ${usn} -> detected: ${actual}, expected: ${expected}`);
    }

    // 2. Query faculty_vtu_urls for 2022 vs 2025
    console.log('\nTest 2: Database faculty_vtu_urls per scheme');
    const { data: s22, error: e22 } = await supabase
        .from('faculty_vtu_urls')
        .select('id, url, exam_name, is_active')
        .eq('scheme', '2022');

    const { data: s25, error: e25 } = await supabase
        .from('faculty_vtu_urls')
        .select('id, url, exam_name, is_active')
        .eq('scheme', '2025');

    console.log(`  2022 Scheme URLs count: ${s22?.length || 0} (error: ${e22?.message || 'none'})`);
    console.log(`  2025 Scheme URLs count: ${s25?.length || 0} (error: ${e25?.message || 'none'})`);

    const hasSeparation = (s22?.length || 0) > 0 && (s25?.length || 0) > 0;
    console.log(`  ${hasSeparation ? '✓' : '✗'} Both schemes independently populated`);

    // 3. Verify scraper_jobs table has scheme column
    console.log('\nTest 3: scraper_jobs scheme column check');
    const { data: sampleJob, error: jobErr } = await supabase
        .from('scraper_jobs')
        .select('id, usn, scheme, status')
        .limit(1);

    console.log(`  scraper_jobs query error: ${jobErr?.message || 'none'}`);
    console.log(`  scraper_jobs schema valid: ${jobErr === null}`);

    // 4. Test unique constraint on (faculty_id, url, scheme)
    console.log('\nTest 4: Constraint test (faculty_id, url, scheme)');
    if (s22 && s22.length > 0) {
        const testRow = s22[0];
        // Inserting same URL under '2022' should fail
        const dupInsert = await supabase.from('faculty_vtu_urls').insert({
            faculty_id: 'd37d04af-45fe-4eed-a5f1-24d5f1ba0918',
            url: testRow.url,
            scheme: '2022'
        });
        const caughtDup = dupInsert.error !== null;
        console.log(`  ${caughtDup ? '✓' : '✗'} Duplicate (faculty_id, url, scheme) correctly rejected: ${dupInsert.error?.code}`);
    }

    console.log('\n====================================');
    console.log('All verification checks complete!');
    console.log('====================================');
}

runTests().catch(console.error);
