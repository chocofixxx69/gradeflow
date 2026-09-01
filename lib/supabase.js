import { createClient } from '@supabase/supabase-js'

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const rawKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const isValidUrl = (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) && !rawUrl.includes('placeholder-url') && !rawUrl.includes('your_supabase_url');
const isConfigured = Boolean(isValidUrl && rawKey && rawKey !== 'placeholder-key' && rawKey !== 'your_supabase_anon_key' && rawKey !== '...');

if (!isConfigured) {
    console.warn('Supabase credentials missing or invalid. Faculty features will not work until NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are added to .env.local');
}

// Safer client initialization
// We provide a dummy 'https://placeholder-url.supabase.co' for the URL to prevent the 'Invalid URL' crash
export const supabase = createClient(
    isValidUrl ? rawUrl : 'https://placeholder-url.supabase.co',
    isConfigured ? rawKey : 'placeholder-key'
)

export const SUPABASE_READY = isConfigured;
