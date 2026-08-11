import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(req) {
    const { searchParams } = new URL(req.url);
    const scheme = searchParams.get('scheme') || '2022';
    const branch = searchParams.get('branch') || 'CSE';
    const semester = searchParams.get('semester');



    if (!semester) {
        return NextResponse.json({ error: 'Semester is required' }, { status: 400 });
    }

    try {
        // Query the Unified Master Registry
        const { data, error } = await supabase
            .from('subject_master_registry')
            .select('subject_code, subject_title, credits, category, cie_max, see_max')
            .eq('scheme', scheme)
            .eq('branch_code', branch)
            .eq('semester', parseInt(semester))
            .eq('is_active', true)
            .order('order_index', { ascending: true });



        if (error) {
            console.error('Database Query Error:', error);
            return NextResponse.json({ success: false, subjects: [], error: 'Syllabus not found' });
        }

        // Map to the format expected by the frontend
        const subjects = data.map(s => ({
            code: s.subject_code,
            name: s.subject_title,
            credits: s.credits,
            category: s.category,
            cieMax: s.cie_max,
            seeMax: s.see_max
        }));

        return NextResponse.json({ success: true, subjects });
    } catch (err) {
        console.error('Subject Fetch Error:', err);
        return NextResponse.json({ error: 'Failed to access institutional registry' }, { status: 500 });
    }
}
