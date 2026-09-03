import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents } from '@/lib/analytics-data';
import { fetchAllPaginated } from '@/lib/supabase-utils';
import { getCached, setCached } from '@/lib/server-cache';
import { extractBatchFromUsn, getStudentAcademicBatch, extractBranchFromUsn } from '@/lib/semester-utils';

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
            catalogSubjects,
            { data: metaBranches },
            marksSubjects
        ] = await Promise.all([
            supabaseAdmin.from('classes').select('id, name, branch, semester, section, academic_year, batch'),
            fetchAllPaginated('subject_catalog', 'subject_code, subject_name, semester, branch, scheme, credits', supabaseAdmin),
            supabaseAdmin.from('branches').select('code, label'),
            fetchAllPaginated('subject_marks', 'subject_code, subject_name, semester, credits, usn', supabaseAdmin)
        ]);

        // Dynamically fetch all students from the database without arbitrary limits
        const rawStudents = await fetchDynamicStudents(supabaseAdmin, { select: 'branch, year, usn, lateral_entry' });

        // 1. Derive distinct batches dynamically from database students and classes
        const batchSet = new Set();
        (rawStudents || []).forEach(s => {
            const cohort = getStudentAcademicBatch(s.usn, s.lateral_entry);
            if (cohort) {
                batchSet.add(cohort.fullYear);
            } else if (s.year) {
                batchSet.add(String(s.year));
            }
        });
        (rawClasses || []).forEach(c => {
            if (c.batch) batchSet.add(String(c.batch));
            if (c.academic_year) {
                const yearPart = String(c.academic_year).split(/[-/]/)[0];
                if (yearPart && yearPart.length === 4) batchSet.add(yearPart);
            }
        });

        // If no records in database yet, generate dynamic range around current calendar year
        if (batchSet.size === 0) {
            const cur = new Date().getFullYear();
            for (let y = cur; y >= cur - 4; y--) batchSet.add(String(y));
        }

        const batches = Array.from(batchSet).sort().reverse();

        // 2. Branches list - merge real branches table and active student branches
        const branchLabels = {
            'CS': 'Computer Science & Engineering',
            'AI': 'AI & Machine Learning (AIML)',
            'CI': 'AI & Machine Learning (CI)',
            'AIML': 'AI & Machine Learning (AIML)',
            'DS': 'Computer Science & Data Science (DS)',
            'CD': 'Computer Science & Design / Data Science (CD)',
            'CV': 'Civil Engineering',
            'EC': 'Electronics & Communication Engineering',
            'EE': 'Electrical & Electronics Engineering',
            'ME': 'Mechanical Engineering',
            'RI': 'Robotics & Artificial Intelligence'
        };

        const branchMap = new Map();
        branchMap.set('ALL', { code: 'ALL', label: 'All Branches / Departments', name: 'All Branches / Departments' });
        DEFAULT_BRANCHES.forEach(b => branchMap.set(b.code, { ...b, label: branchLabels[b.code] || b.label }));
        if (metaBranches && Array.isArray(metaBranches)) {
            metaBranches.forEach(b => {
                if (b.code) {
                    const label = branchLabels[b.code] || b.label || b.code;
                    branchMap.set(b.code, { code: b.code, label, name: label });
                }
            });
        }
        (rawStudents || []).forEach(s => {
            const raw = (s.branch || '').trim();
            if (raw) {
                const code = raw === 'Computer Science (CSE)' ? 'CS' : raw;
                if (!branchMap.has(code)) {
                    const label = branchLabels[code] || raw;
                    branchMap.set(code, { code, label, name: label });
                }
            }
        });
        (rawClasses || []).forEach(c => {
            const raw = (c.branch || '').trim();
            if (raw && !branchMap.has(raw)) {
                const label = branchLabels[raw] || raw;
                branchMap.set(raw, { code: raw, label, name: label });
            }
        });

        const branches = Array.from(branchMap.values());

        // 3. Complete Subjects list merged from both catalog and real student marks in DB
        const subjectMap = new Map();

        (catalogSubjects || []).forEach(s => {
            const code = (s.subject_code || '').toUpperCase().trim();
            if (!code) return;
            const sem = Number(s.semester) || 1;
            const b = (s.branch || 'ALL').toUpperCase().trim();
            const key = `${code}|${sem}`;
            subjectMap.set(key, {
                code,
                name: s.subject_name || code,
                semester: sem,
                branch: b,
                branches: [b],
                scheme: s.scheme || '2022',
                credits: Number(s.credits) || 3
            });
        });

        (marksSubjects || []).forEach(m => {
            const code = (m.subject_code || '').toUpperCase().trim();
            if (!code) return;
            const sem = Number(m.semester) || 1;
            const b = extractBranchFromUsn(m.usn) || 'CS';
            const key = `${code}|${sem}`;

            if (!subjectMap.has(key)) {
                subjectMap.set(key, {
                    code,
                    name: m.subject_name || code,
                    semester: sem,
                    branch: b,
                    branches: [b],
                    scheme: '2022',
                    credits: Number(m.credits) || 3
                });
            } else {
                const entry = subjectMap.get(key);
                if (!entry.branches.includes(b)) entry.branches.push(b);
                if (m.subject_name && (entry.name === code || entry.name.includes('TD/PSB'))) {
                    entry.name = m.subject_name;
                }
            }
        });

        const subjects = Array.from(subjectMap.values());

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
