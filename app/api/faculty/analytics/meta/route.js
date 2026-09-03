import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

// Fallback VTU branches if catalog is sparsely populated
const DEFAULT_BRANCHES = [
    { code: 'CS', label: 'Computer Science and Engineering', name: 'Computer Science and Engineering' },
    { code: 'CI', label: 'Computer Science and Engineering (AI&ML)', name: 'Computer Science and Engineering (AI&ML)' },
    { code: 'EC', label: 'Electronics and Communication Engineering', name: 'Electronics and Communication Engineering' },
    { code: 'CD', label: 'Computer Science and Engineering (Data Science)', name: 'Computer Science and Engineering (Data Science)' },
    { code: 'ME', label: 'Mechanical Engineering', name: 'Mechanical Engineering' },
    { code: 'CV', label: 'Civil Engineering', name: 'Civil Engineering' },
    { code: 'EE', label: 'Electrical and Electronics Engineering', name: 'Electrical and Electronics Engineering' },
    { code: 'RI', label: 'Robotics and Artificial Intelligence', name: 'Robotics and Artificial Intelligence' },
    { code: 'BA', label: 'Master of Business Administration (MBA)', name: 'Master of Business Administration (MBA)' },
    { code: 'MC', label: 'Master of Computer Applications (MCA)', name: 'Master of Computer Applications (MCA)' },
];

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const cachedMeta = getCached('analytics_meta_all');
        if (cachedMeta) {
            return ok(cachedMeta);
        }

        const supabaseAdmin = getAdminClient();

        const [
            { data: rawClasses },
            { data: catalogSubjects },
            { data: rawStudents },
            { data: metaBranches }
        ] = await Promise.all([
            supabaseAdmin.from('classes').select('id, name, branch, semester, section, academic_year, batch'),
            supabaseAdmin.from('subject_catalog').select('subject_code, subject_name, semester, branch, scheme, credits').order('semester', { ascending: true }),
            supabaseAdmin.from('students').select('branch, year, usn').limit(2000),
            supabaseAdmin.from('branches').select('code, label')
        ]);

        // 1. Derive distinct batches from students (USN patterns & year) and classes
        const batchSet = new Set(['2025', '2024', '2023', '2022', '2021']);
        (rawStudents || []).forEach(s => {
            if (s.year) batchSet.add(String(s.year));
            if (s.usn && s.usn.length >= 5) {
                // VTU USN format: e.g. 1VA22CS001 -> '22' -> 2022
                const match = s.usn.match(/[0-9][A-Z]{2}([0-9]{2})[A-Z]{2}[0-9]{3}/i);
                if (match && match[1]) {
                    batchSet.add('20' + match[1]);
                }
            }
        });
        (rawClasses || []).forEach(c => {
            if (c.batch) batchSet.add(String(c.batch));
            if (c.academic_year) {
                const yearPart = String(c.academic_year).split(/[-/]/)[0];
                if (yearPart && yearPart.length === 4) batchSet.add(yearPart);
            }
        });

        const batches = Array.from(batchSet).sort().reverse();

        // 2. Branches list - merge real branches table and active student branches
        const branchMap = new Map();
        DEFAULT_BRANCHES.forEach(b => branchMap.set(b.code, b));
        if (metaBranches && Array.isArray(metaBranches)) {
            metaBranches.forEach(b => {
                if (b.code) branchMap.set(b.code, { code: b.code, label: b.label || b.code, name: b.label || b.code });
            });
        }
        (rawStudents || []).forEach(s => {
            if (s.branch && !branchMap.has(s.branch)) {
                branchMap.set(s.branch, { code: s.branch, label: s.branch, name: s.branch });
            }
        });
        (rawClasses || []).forEach(c => {
            if (c.branch && !branchMap.has(c.branch)) {
                branchMap.set(c.branch, { code: c.branch, label: c.branch, name: c.branch });
            }
        });

        const branches = Array.from(branchMap.values());

        // 3. Subjects list
        const subjects = (catalogSubjects || []).map(s => ({
            code: s.subject_code,
            name: s.subject_name,
            semester: s.semester,
            branch: s.branch,
            scheme: s.scheme,
            credits: s.credits
        }));

        const payload = {
            batches,
            branches,
            semesters: [1, 2, 3, 4, 5, 6, 7, 8],
            subjects,
            classes: rawClasses || []
        };

        setCached('analytics_meta_all', payload, 120_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/meta]', err);
        return fail('Failed to fetch analytics metadata: ' + (err.message || err), 'META_ERROR', 500);
    }
}
