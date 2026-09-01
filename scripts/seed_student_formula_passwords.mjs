// scripts/seed_student_formula_passwords.mjs
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

const envContent = fs.readFileSync('.env', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
});

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

function generateFormulaPassword(name, usn) {
    const cleanUsn = String(usn || '').trim().toUpperCase();
    const cleanName = String(name || '').trim().replace(/[^a-zA-Z]/g, '').toUpperCase();

    let prefix = cleanName.slice(0, 2);
    if (prefix.length < 2) {
        const usnLetters = cleanUsn.replace(/[^A-Z]/g, '');
        prefix = (prefix + usnLetters).slice(0, 2);
    }
    if (prefix.length < 2) {
        prefix = (prefix + 'ST').slice(0, 2);
    }

    const suffix = cleanUsn.length >= 3 ? cleanUsn.slice(-3) : cleanUsn.padStart(3, '0');
    return `${prefix}${suffix}`.toUpperCase();
}

async function run() {
    console.log('Fetching all students from database...');
    const { data: students, error } = await supabase.from('students').select('id, usn, name, password_hash');
    if (error) {
        console.error('Fetch error:', error);
        return;
    }

    console.log(`Found ${students.length} students. Computing formula passwords...`);
    let updatedCount = 0;

    for (const student of students) {
        const formulaPass = generateFormulaPassword(student.name, student.usn);
        const hash = await bcrypt.hash(formulaPass, 10);

        const { error: updateErr } = await supabase
            .from('students')
            .update({ password_hash: hash, updated_at: new Date().toISOString() })
            .eq('id', student.id);

        if (updateErr) {
            console.error(`Failed to update ${student.usn}:`, updateErr);
        } else {
            updatedCount++;
        }
    }

    console.log(`Successfully updated ${updatedCount}/${students.length} students with formula passwords!`);
}

run();
