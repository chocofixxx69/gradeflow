import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

if (!SUPABASE_URL || !SUPABASE_ACCESS_TOKEN) {
    console.error('Missing SUPABASE_URL or SUPABASE_ACCESS_TOKEN in env');
    process.exit(1);
}

const match = SUPABASE_URL.match(/https:\/\/([a-z0-9]+)\.supabase\.co/);
if (!match) {
    console.error('Could not parse projectRef from SUPABASE_URL');
    process.exit(1);
}
const projectRef = match[1];
const sql = fs.readFileSync('database/migrations/002_system_settings.sql', 'utf8');

const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        'User-Agent': 'SupabaseCLI/1.100.0',
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
});

const body = await res.text();
console.log('Migration Status:', res.status, body);
