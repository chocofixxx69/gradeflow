import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/analytics-data';
import { getSystemMetaCache, setSystemMetaCache } from '../../../../lib/system-meta-cache';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET() {
    try {
        const cached = getSystemMetaCache();
        if (cached) {
            return NextResponse.json({ success: true, data: cached }, {
                headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
            });
        }

        // Fetch branches, faculty & batches in parallel
        const [branchesResult, facultyResult, batchesResult] = await Promise.allSettled([
            supabaseAdmin.from('branches').select('code, label, is_active, sort_order').order('sort_order', { ascending: true }),
            supabaseAdmin
                .from('faculty_onboarding')
                .select('id, full_name, email, department')
                .eq('status', 'approved')
                .order('full_name', { ascending: true }),
            supabaseAdmin
                .from('batches')
                .select('*')
                .order('year', { ascending: false })
        ]);

        const rawDbBranches = branchesResult.status === 'fulfilled' && branchesResult.value.data ? branchesResult.value.data : [];
        const dbBranches = rawDbBranches
            .filter(b => b.is_active !== false)
            .map(b => ({
                code: b.code,
                name: b.label || b.code,
                label: b.label || b.code,
                sort_order: b.sort_order
            }));

        const fallbackBranches = [
            { code: 'CS', name: 'Computer Science & Engineering', label: 'Computer Science & Engineering' },
            { code: 'AI', name: 'AI & Machine Learning', label: 'AI & Machine Learning' },
            { code: 'DS', name: 'Computer Science & Engineering (Data Science)', label: 'Computer Science & Engineering (Data Science)' },
            { code: 'EC', name: 'Electronics & Communication Engineering', label: 'Electronics & Communication Engineering' },
            { code: 'EE', name: 'Electrical & Electronics Engineering', label: 'Electrical & Electronics Engineering' },
            { code: 'ME', name: 'Mechanical Engineering', label: 'Mechanical Engineering' },
            { code: 'CV', name: 'Civil Engineering', label: 'Civil Engineering' },
            { code: 'RI', name: 'Robotics & Artificial Intelligence', label: 'Robotics & Artificial Intelligence' }
        ];

        const rawDbBatches = batchesResult.status === 'fulfilled' && batchesResult.value.data ? batchesResult.value.data : [];
        const activeDbBatches = rawDbBatches.filter(b => b.is_active !== false);
        const dbBatchYears = activeDbBatches.map(b => String(b.year).trim());
        const dbBatchSchemes = rawDbBatches.map(b => b.default_scheme ? String(b.default_scheme).trim() : null).filter(Boolean);
        const schemes = Array.from(new Set(['2026', '2025', '2022', '2018', ...dbBatchSchemes])).sort((a, b) => {
            const na = parseInt(a, 10);
            const nb = parseInt(b, 10);
            if (!isNaN(na) && !isNaN(nb)) return nb - na;
            return b.localeCompare(a);
        });

        const branches = dbBranches.length > 0 ? dbBranches : fallbackBranches;
        const semesters = [1, 2, 3, 4, 5, 6, 7, 8];
        const sections = ['A', 'B', 'C', 'D', 'E', 'F'];

        const currentYear = new Date().getFullYear();
        const maxBatchYear = Math.max(2036, currentYear + 10);
        const academicYears = Array.from({ length: maxBatchYear - 2020 + 1 }, (_, i) => {
            const y = maxBatchYear - i;
            return `${y}-${y + 1}`;
        });
        const batches = Array.from(new Set([
            ...dbBatchYears,
            ...Array.from({ length: maxBatchYear - 2018 + 1 }, (_, i) => String(maxBatchYear - i))
        ])).sort((a, b) => b.localeCompare(a));
        const facultyList = facultyResult.status === 'fulfilled' && facultyResult.value.data ? facultyResult.value.data : [];

        const payload = {
            branches,
            schemes,
            semesters,
            sections,
            academicYears,
            batches,
            batchList: activeDbBatches,
            faculty: facultyList,
            formLookups: {
                branches,
                schemes,
                semesters,
                sections,
                academicYears,
                batches,
                batchList: activeDbBatches,
                faculty: facultyList
            }
        };

        setSystemMetaCache(payload);

        return NextResponse.json({ success: true, data: payload }, {
            headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
        });
    } catch (err) {
        console.error('[GET /api/system/meta]', err);
        return fail('Failed to fetch system meta lookup data.', 'SYSTEM_META_ERROR', 500);
    }
}
