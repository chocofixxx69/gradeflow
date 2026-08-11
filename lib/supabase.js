import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY


const isConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isConfigured) {
    console.warn('Supabase credentials missing. Faculty features will not work until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are added to .env.local');
}

// Safer client initialization
// We provide a dummy 'https://localhost' for the URL to prevent the 'Invalid URL' crash
export const supabase = createClient(
    supabaseUrl || 'https://placeholder-url.supabase.co',
    supabaseAnonKey || 'placeholder-key'
)

export const SUPABASE_READY = isConfigured;
