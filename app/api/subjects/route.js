import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireStaff } from '../../../lib/server-session';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(req) {
    const { error: authError } = requireStaff(req, ['faculty', 'admin']);
    if (authError) return authError;

    const { searchParams } = new URL(req.url);
    const scheme = searchParams.get('scheme') || '2022';
    const branch = searchParams.get('branch') || 'CSE';
    const semester = searchParams.get('semester');

    if (!semester) {
        return NextResponse.json({ error: 'Semester is required' }, { status: 400 });
    }

    try {
        // Query the subjects master table (subject_master_registry never existed live).
        const { data, error } = await supabase
            .from('subjects')
            .select('code, name, credits, cie_max, see_max')
            .eq('scheme', scheme)
            .eq('branch', branch)
            .eq('semester', parseInt(semester))
            .order('code', { ascending: true });

        if (error) {
            console.error('Database Query Error:', error);
            return NextResponse.json({ success: false, subjects: [], error: 'Syllabus not found' });
        }

        const subjects = (data || []).map(s => ({
            code: s.code,
            name: s.name,
            credits: s.credits,
            cieMax: s.cie_max,
            seeMax: s.see_max,
        }));

        return NextResponse.json({ success: true, subjects });
    } catch (err) {
        console.error('Subject Fetch Error:', err);
        return NextResponse.json({ error: 'Failed to access institutional registry' }, { status: 500 });
    }
}
