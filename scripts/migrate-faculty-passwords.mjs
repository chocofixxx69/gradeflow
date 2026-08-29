// One-time migration: hashes any plaintext faculty_onboarding.password values
// (and mirrors the same hash into password_hash) using bcrypt.
//
// MUST be run against production BEFORE deploying the login-route change that
// switches faculty login to bcrypt.compare() — until this has run, any row
// still holding a plaintext password will fail bcrypt.compare() and lock that
// faculty member out. Safe to re-run: rows already holding a bcrypt hash
// (prefix $2a$/$2b$/$2y$) are skipped, so running it twice is a no-op for
// already-migrated rows.
//
// Usage: SUPABASE_URL=... SUPABASE_SERVICE_KEY=... node scripts/migrate-faculty-passwords.mjs

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const BCRYPT_SALT_ROUNDS = 10;
const BCRYPT_HASH_PATTERN = /^\$2[aby]\$/;

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in the environment.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const { data: rows, error } = await supabase
    .from('faculty_onboarding')
    .select('id, email, password');

if (error) {
    console.error('Failed to fetch faculty_onboarding rows:', error);
    process.exit(1);
}

console.log(`Found ${rows.length} faculty_onboarding row(s).`);

let migrated = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
    if (!row.password) {
        skipped++;
        continue;
    }

    if (BCRYPT_HASH_PATTERN.test(row.password)) {
        skipped++;
        continue;
    }

    try {
        const hashed = await bcrypt.hash(row.password, BCRYPT_SALT_ROUNDS);
        const { error: updateErr } = await supabase
            .from('faculty_onboarding')
            .update({ password: hashed, password_hash: hashed })
            .eq('id', row.id);

        if (updateErr) throw updateErr;

        migrated++;
        console.log(`Migrated: ${row.email}`);
    } catch (err) {
        failed++;
        console.error(`FAILED to migrate ${row.email}:`, err.message || err);
    }
}

console.log(`\nDone. Migrated: ${migrated}, already hashed/skipped: ${skipped}, failed: ${failed}.`);
if (failed > 0) {
    console.error('Some rows failed to migrate — re-run this script to retry (already-hashed rows are skipped safely).');
    process.exit(1);
}
