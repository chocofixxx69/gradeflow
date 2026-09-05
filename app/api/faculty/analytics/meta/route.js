import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents } from '@/lib/analytics-data';
import { fetchAllPaginated } from '@/lib/supabase-utils';
import { getCached, setCached } from '@/lib/server-cache';
import { extractBatchFromUsn, getStudentAcademicBatch, extractBranchFromUsn } from '@/lib/semester-utils';

import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

function ok(data) {
    return NextResponse.json({ success: true, data }, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    });
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
    noStore();
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const forceFresh = searchParams.get('fresh') === '1' || searchParams.has('t');

        if (!forceFresh) {
            const cachedMeta = getCached('analytics_meta_all');
            if (cachedMeta) {
                return ok(cachedMeta);
            }
        }

        const supabaseAdmin = getAdminClient();

        // 1. Fetch classes, catalog, branches, and students in parallel
        const [
            { data: rawClasses },
            catalogSubjects,
            { data: metaBranches },
            rawStudents,
            { count: totalMarksCount }
        ] = await Promise.all([
            supabaseAdmin.from('classes').select('id, name, branch, semester, section, academic_year, batch'),
            fetchAllPaginated('subject_catalog', 'subject_code, subject_name, semester, branch, scheme, credits', supabaseAdmin),
            supabaseAdmin.from('branches').select('code, label'),
            fetchDynamicStudents(supabaseAdmin, { select: 'branch, year, usn, lateral_entry, name' }),
            supabaseAdmin.from('subject_marks').select('*', { count: 'exact', head: true })
        ]);

        // 2. Fetch all real marks using fast parallel chunking
        const pageSize = 1000;
        const totalPages = Math.ceil((totalMarksCount || 0) / pageSize);
        const marksPromises = [];
        for (let p = 0; p < totalPages; p++) {
            marksPromises.push(
                supabaseAdmin
                    .from('subject_marks')
                    .select('subject_code, subject_name, semester, credits, usn')
                    .order('id')
                    .range(p * pageSize, (p + 1) * pageSize - 1)
                    .then(res => res.data || [])
            );
        }
        const marksChunks = await Promise.all(marksPromises);
        const marksSubjects = marksChunks.flat();

        // Map students for quick lookup
        const studentMap = new Map();
        (rawStudents || []).forEach(s => {
            if (s.usn) studentMap.set(s.usn, s);
        });

        // 3. Derive distinct batches dynamically from database students, marks, and classes
        const batchSet = new Set();
        (rawStudents || []).forEach(s => {
            const cohort = getStudentAcademicBatch(s.usn, s.lateral_entry);
            if (cohort) {
                batchSet.add(cohort.fullYear);
            } else if (s.year) {
                batchSet.add(String(s.year));
            }
        });

        (marksSubjects || []).forEach(m => {
            const parsed = extractBatchFromUsn(m.usn);
            if (parsed) batchSet.add(parsed.fullYear);
        });

        (rawClasses || []).forEach(c => {
            if (c.batch) batchSet.add(String(c.batch));
            if (c.academic_year) {
                const yearPart = String(c.academic_year).split(/[-/]/)[0];
                if (yearPart && yearPart.length === 4) batchSet.add(yearPart);
            }
        });

        if (batchSet.size === 0) {
            const cur = new Date().getFullYear();
            for (let y = cur; y >= cur - 4; y--) batchSet.add(String(y));
        }

        const batches = Array.from(batchSet).sort().reverse();

        // 4. Branches list - merge real branches table and active student branches
        const branchLabels = {
            'CS': 'Computer Science & Engineering',
            'AI': 'AI & Machine Learning (AIML)',
            'CI': 'AI & Machine Learning (CI)',
            'AIML': 'AI & Machine Learning (AIML)',
            'DS': 'Computer Science & Data Science (DS)',
            'CD': 'Data Science',
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

        // 5. Build Subject Directory: Primary source is REAL marks from subject_marks
        const subjectMap = new Map();

        (marksSubjects || []).forEach(m => {
            const code = (m.subject_code || '').toUpperCase().trim();
            if (!code) return;
            const sem = Number(m.semester) || 1;
            const key = `${code}|${sem}`;

            const st = studentMap.get(m.usn);
            const cohort = getStudentAcademicBatch(m.usn, st?.lateral_entry);
            const batchYear = cohort?.fullYear || (extractBatchFromUsn(m.usn)?.fullYear) || '2023';
            const b = extractBranchFromUsn(m.usn) || 'CS';

            if (!subjectMap.has(key)) {
                subjectMap.set(key, {
                    code,
                    name: m.subject_name || code,
                    semester: sem,
                    branch: b,
                    branches: [b],
                    scheme: code.startsWith('1') ? '2025' : '2022',
                    credits: Number(m.credits) || 3,
                    hasRealData: true,
                    studentCount: 0,
                    batches: [],
                    batchCounts: {},
                    branchCounts: {}
                });
            }

            const entry = subjectMap.get(key);
            entry.studentCount++;
            if (!entry.branches.includes(b)) entry.branches.push(b);
            if (!entry.batches.includes(batchYear)) entry.batches.push(batchYear);
            entry.batchCounts[batchYear] = (entry.batchCounts[batchYear] || 0) + 1;
            entry.branchCounts[b] = (entry.branchCounts[b] || 0) + 1;

            if (m.subject_name && entry.name === code) {
                entry.name = m.subject_name;
            }
        });

        // Complement with catalog subjects for curriculum reference
        (catalogSubjects || []).forEach(s => {
            const code = (s.subject_code || '').toUpperCase().trim();
            if (!code) return;
            const sem = Number(s.semester) || 1;
            const b = (s.branch || 'ALL').toUpperCase().trim();
            const key = `${code}|${sem}`;

            if (!subjectMap.has(key)) {
                subjectMap.set(key, {
                    code,
                    name: s.subject_name || code,
                    semester: sem,
                    branch: b,
                    branches: [b],
                    scheme: s.scheme || (code.startsWith('1') ? '2025' : '2022'),
                    credits: Number(s.credits) || 3,
                    hasRealData: false,
                    studentCount: 0,
                    batches: [],
                    batchCounts: {},
                    branchCounts: {}
                });
            } else {
                const entry = subjectMap.get(key);
                if (b && b !== 'ALL' && !entry.branches.includes(b)) {
                    entry.branches.push(b);
                }
                if (s.credits && !entry.credits) {
                    entry.credits = Number(s.credits);
                }
            }
        });

        // Sort subjects: Active subjects with real marks first (sorted descending by studentCount), then catalog-only
        const subjects = Array.from(subjectMap.values()).sort((a, b) => {
            if (a.hasRealData && !b.hasRealData) return -1;
            if (!a.hasRealData && b.hasRealData) return 1;
            if (a.hasRealData && b.hasRealData) {
                if (b.studentCount !== a.studentCount) return b.studentCount - a.studentCount;
            }
            if (a.semester !== b.semester) return a.semester - b.semester;
            return a.code.localeCompare(b.code);
        });

        // Dynamically discover all active semesters present in marks, catalog, and classes
        const semSet = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
        (marksSubjects || []).forEach(m => {
            const semNum = Number(m.semester);
            if (!isNaN(semNum) && semNum > 0) semSet.add(semNum);
        });
        (catalogSubjects || []).forEach(s => {
            const semNum = Number(s.semester);
            if (!isNaN(semNum) && semNum > 0) semSet.add(semNum);
        });
        (rawClasses || []).forEach(c => {
            const semNum = Number(c.semester);
            if (!isNaN(semNum) && semNum > 0) semSet.add(semNum);
        });
        const semesters = Array.from(semSet).sort((a, b) => a - b);

        const payload = {
            batches,
            branches,
            semesters,
            subjects,
            classes: rawClasses || []
        };

        setCached('analytics_meta_all', payload, 60_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/meta]', err);
        return fail('Failed to fetch analytics metadata: ' + (err.message || err), 'META_ERROR', 500);
    }
}
