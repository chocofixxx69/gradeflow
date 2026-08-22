import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET() {
    try {
        // Fetch branches from database if table exists, fallback to standard institutional list
        let dbBranches = [];
        try {
            const { data } = await supabaseAdmin.from('branches').select('*').order('name', { ascending: true });
            if (data && data.length > 0) dbBranches = data;
        } catch {
            // Table might not exist or be restricted
        }

        const fallbackBranches = [
            { code: 'CSE', name: 'Computer Science & Engineering' },
            { code: 'ISE', name: 'Information Science & Engineering' },
            { code: 'ECE', name: 'Electronics & Communication Engineering' },
            { code: 'EEE', name: 'Electrical & Electronics Engineering' },
            { code: 'ME', name: 'Mechanical Engineering' },
            { code: 'CV', name: 'Civil Engineering' },
            { code: 'AIML', name: 'Artificial Intelligence & Machine Learning' },
            { code: 'DS', name: 'Data Science' }
        ];

        const branches = dbBranches.length > 0 ? dbBranches : fallbackBranches;
        const schemes = ['2022', '2021', '2018', '2017', '2015'];
        const semesters = [1, 2, 3, 4, 5, 6, 7, 8];
        const sections = ['A', 'B', 'C', 'D', 'E', 'F'];
        const academicYears = ['2025-2026', '2024-2025', '2023-2024', '2022-2023'];

        let facultyList = [];
        try {
            const { data: facs } = await supabaseAdmin
                .from('faculty_onboarding')
                .select('id, full_name, email, department')
                .eq('status', 'approved')
                .order('full_name', { ascending: true });
            if (facs) facultyList = facs;
        } catch {
            // non-critical
        }

        return ok({
            branches,
            schemes,
            semesters,
            sections,
            academicYears,
            faculty: facultyList,
            formLookups: {
                branches,
                schemes,
                semesters,
                sections,
                academicYears,
                faculty: facultyList
            }
        });
    } catch (err) {
        console.error('[GET /api/system/meta]', err);
        return fail('Failed to fetch system meta lookup data.', 'SYSTEM_META_ERROR', 500);
    }
}
