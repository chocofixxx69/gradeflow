import { NextResponse } from 'next/server';
import { getAdminClient } from '../../../../lib/analytics-data';

const supabaseAdmin = getAdminClient();

export const dynamic = 'force-dynamic';

function ok(data) { return NextResponse.json({ success: true, data }); }
function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

let _metaCache = null;
let _metaCacheTime = 0;
const META_CACHE_TTL = 60_000; // 60 seconds

export async function GET() {
    try {
        const now = Date.now();
        if (_metaCache && (now - _metaCacheTime) < META_CACHE_TTL) {
            return NextResponse.json({ success: true, data: _metaCache }, {
                headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
            });
        }

        // Fetch branches & faculty in parallel
        const [branchesResult, facultyResult] = await Promise.allSettled([
            supabaseAdmin.from('branches').select('*').order('name', { ascending: true }),
            supabaseAdmin
                .from('faculty_onboarding')
                .select('id, full_name, email, department')
                .eq('status', 'approved')
                .order('full_name', { ascending: true })
        ]);

        const dbBranches = branchesResult.status === 'fulfilled' && branchesResult.value.data ? branchesResult.value.data : [];
        const fallbackBranches = [
            { code: 'CS', name: 'Computer Science & Engineering' },
            { code: 'AI', name: 'Artificial Intelligence & Machine Learning' },
            { code: 'DS', name: 'Data Science' },
            { code: 'EC', name: 'Electronics & Communication Engineering' },
            { code: 'EE', name: 'Electrical & Electronics Engineering' },
            { code: 'ME', name: 'Mechanical Engineering' },
            { code: 'CV', name: 'Civil Engineering' },
            { code: 'RI', name: 'Robotics & Artificial Intelligence' }
        ];

        const branches = dbBranches.length > 0 ? dbBranches : fallbackBranches;
        const schemes = ['2022', '2025'];
        const semesters = [1, 2, 3, 4, 5, 6, 7, 8];
        const sections = ['A', 'B', 'C', 'D', 'E', 'F'];
        const academicYears = ['2025-2026', '2024-2025', '2023-2024', '2022-2023'];
        const facultyList = facultyResult.status === 'fulfilled' && facultyResult.value.data ? facultyResult.value.data : [];

        const payload = {
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
        };

        _metaCache = payload;
        _metaCacheTime = now;

        return NextResponse.json({ success: true, data: payload }, {
            headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' }
        });
    } catch (err) {
        console.error('[GET /api/system/meta]', err);
        return fail('Failed to fetch system meta lookup data.', 'SYSTEM_META_ERROR', 500);
    }
}
