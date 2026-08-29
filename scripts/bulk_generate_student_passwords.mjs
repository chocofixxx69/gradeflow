import { createClient } from '@supabase/supabase-js';
import { hashStudentPassword } from '../lib/student-auth.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
    try {
        const envPath = path.resolve(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf8');
            for (const line of content.split('\n')) {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) continue;
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx !== -1) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    const val = trimmed.slice(eqIdx + 1).trim();
                    if (!process.env[key]) {
                        process.env[key] = val;
                    }
                }
            }
        }
    } catch (e) {
        console.error('Failed to load .env:', e);
    }
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Exposed USNs whose recovery PINs must be rotated
export const EXPOSED_PIN_USNS = [
    '2AB23CS043',
    '2AB23CS051',
    '2AB23CS063',
    '2AB23CS63'
];

export function deriveFormulaPassword(name, usn) {
    const rawName = String(name || '').trim();
    const rawUsn = String(usn || '').trim().toUpperCase();

    const issues = [];

    // Check USN validity
    const usnMatch = rawUsn.match(/(\d{3})$/);
    const suffix = usnMatch ? usnMatch[1] : null;
    if (!suffix) {
        issues.push(`USN "${rawUsn}" does not end with 3 numeric digits`);
    }

    // Check if record is a shifted corrupted legacy import (e.g. USN is pure numeric serial and name is branch code)
    if (/^\d+$/.test(rawUsn) && ['CS', 'CI', 'CD', 'EC', 'EE', 'ME', 'CV', 'RI', 'AIML'].includes(rawName.toUpperCase())) {
        issues.push(`Shifted legacy row: numeric serial USN (${rawUsn}) with branch code name (${rawName})`);
    }

    // Extract first 2 alphabetic characters of name
    const lettersOnly = rawName.replace(/[^a-zA-Z]/g, '');
    const prefix = lettersOnly.slice(0, 2).toUpperCase();

    if (lettersOnly.length < 2) {
        issues.push(`Name "${rawName}" has fewer than 2 alphabetic characters`);
    }

    // If name is identical to USN, flag as needing attention
    if (rawName.toUpperCase() === rawUsn) {
        issues.push(`Name is identical to USN (no actual student name populated)`);
    }

    return {
        prefix,
        suffix,
        password: issues.length === 0 ? `${prefix}${suffix}` : null,
        issues
    };
}

export function generateRecoveryPin() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

async function run() {
    const args = process.argv.slice(2);
    const isApply = args.includes('--apply');
    const isRotateOnly = args.includes('--rotate-only');

    console.log('========================================================================');
    console.log(`GradeFlow Student Password & PIN Management (${isApply ? 'LIVE APPLY' : isRotateOnly ? 'ROTATE PINS ONLY' : 'DRY RUN'})`);
    console.log('========================================================================\n');

    // 1. Fetch all students
    const { data: students, error } = await supabase
        .from('students')
        .select('*')
        .order('usn');

    if (error) {
        console.error('Failed to fetch students:', error);
        process.exit(1);
    }

    console.log(`Total records in students table: ${students.length}`);

    // Categorize
    const existingWithHash = [];
    const eligibleRealStudents = [];
    const flaggedMalformed = [];

    for (const s of students) {
        if (s.password_hash) {
            existingWithHash.push(s);
            continue;
        }

        const derived = deriveFormulaPassword(s.name, s.usn);
        if (derived.issues.length > 0) {
            flaggedMalformed.push({
                student: s,
                issues: derived.issues,
                derived
            });
        } else {
            eligibleRealStudents.push({
                student: s,
                password: derived.password,
                pin: generateRecoveryPin()
            });
        }
    }

    console.log(`- Existing accounts with password_hash (PRESERVED / SKIPPED): ${existingWithHash.length}`);
    console.log(`- Valid student accounts ready for password generation: ${eligibleRealStudents.length}`);
    console.log(`- Flagged / Malformed rows (SKIPPED / REQUIRE MANUAL REVIEW): ${flaggedMalformed.length}\n`);

    // 2. Generate rotated PINs for the 4 exposed accounts
    const pinRotations = [];
    for (const usn of EXPOSED_PIN_USNS) {
        const student = students.find(s => s.usn.toUpperCase() === usn.toUpperCase());
        if (student) {
            const newPin = generateRecoveryPin();
            pinRotations.push({
                id: student.id,
                usn: student.usn,
                name: student.name,
                oldPin: student.recovery_pin,
                newPin
            });
        }
    }

    if (!isApply) {
        // DRY RUN OUTPUT
        console.log('------------------------------------------------------------------------');
        console.log('1. PREVIEW OF ROTATED PINS (4 EXPOSED ACCOUNTS):');
        console.log('------------------------------------------------------------------------');
        for (const r of pinRotations) {
            console.log(`  • ${r.usn.padEnd(12)} (${r.name.padEnd(20)}) | Current PIN: ${r.oldPin} -> New PIN: ${r.newPin}`);
        }

        console.log('\n------------------------------------------------------------------------');
        console.log(`2. PREVIEW OF BULK GENERATED PASSWORDS (${eligibleRealStudents.length} VALID STUDENTS):`);
        console.log('------------------------------------------------------------------------');
        for (const c of eligibleRealStudents) {
            console.log(`  • ${c.student.usn.padEnd(14)} | ${(c.student.name || '').padEnd(36)} | Pwd: ${c.password.padEnd(8)} | PIN: ${c.pin}`);
        }

        console.log('\n------------------------------------------------------------------------');
        console.log(`3. SUMMARY OF FLAGGED ROWS (${flaggedMalformed.length} ROWS):`);
        console.log('------------------------------------------------------------------------');
        // Group by issue
        const shiftedCount = flaggedMalformed.filter(f => f.issues.some(i => i.includes('Shifted'))).length;
        const noDigitsCount = flaggedMalformed.filter(f => f.issues.some(i => i.includes('3 numeric digits')) && !f.issues.some(i => i.includes('Shifted'))).length;
        const shortNameCount = flaggedMalformed.filter(f => f.issues.some(i => i.includes('fewer than 2')) && !f.issues.some(i => i.includes('Shifted'))).length;

        console.log(`  • Shifted legacy rows (numeric serial USN with branch code name): ${shiftedCount} rows`);
        console.log(`  • USN not ending in 3 digits: ${noDigitsCount} rows`);
        console.log(`  • Name has fewer than 2 alphabetic characters: ${shortNameCount} rows`);
        console.log('------------------------------------------------------------------------');
        console.log('\n[DRY RUN COMPLETE] No records were modified in Supabase.');
        console.log('To apply these changes after approval, run:');
        console.log('  node scripts/bulk_generate_student_passwords.mjs --apply\n');

        return;
    }

    // LIVE APPLY
    console.log('Applying recovery PIN rotation for the 4 exposed accounts...');
    for (const r of pinRotations) {
        const { error: pinErr } = await supabase
            .from('students')
            .update({ recovery_pin: r.newPin, updated_at: new Date().toISOString() })
            .eq('id', r.id);
        if (pinErr) {
            console.error(`Failed to rotate PIN for ${r.usn}:`, pinErr.message);
        } else {
            console.log(`✓ Rotated PIN for ${r.usn}`);
        }
    }

    console.log(`\nApplying password_hash and recovery_pin for ${eligibleRealStudents.length} students...`);
    let success = 0;
    let failed = 0;

    for (const c of eligibleRealStudents) {
        try {
            const passwordHash = await hashStudentPassword(c.password);
            const { error: upErr } = await supabase
                .from('students')
                .update({
                    password_hash: passwordHash,
                    recovery_pin: c.pin,
                    activated_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq('id', c.student.id);

            if (upErr) {
                console.error(`Failed to update ${c.student.usn}:`, upErr.message);
                failed++;
            } else {
                success++;
            }
        } catch (err) {
            console.error(`Error hashing/updating ${c.student.usn}:`, err);
            failed++;
        }
    }

    console.log('\n========================================================================');
    console.log(`Live Apply Results:`);
    console.log(`- Successfully generated & hashed: ${success} students`);
    console.log(`- Failed: ${failed} students`);
    console.log(`- Rotated PINs: ${pinRotations.length} accounts`);
    console.log(`- Existing accounts preserved: ${existingWithHash.length}`);
    console.log('========================================================================\n');
}

run().catch(console.error);
