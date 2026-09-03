import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch } from '@/lib/semester-utils';
import { isFailedSubject } from '@/lib/vtuGrades';

export const dynamic = 'force-dynamic';

function ok(data) {
    return NextResponse.json({ success: true, data });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function GET(req) {
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const subjectCode = (searchParams.get('subjectCode') || '').toUpperCase().trim();
        const branch = (searchParams.get('branch') || '').toUpperCase().trim();
        const semester = searchParams.get('semester') ? parseInt(searchParams.get('semester'), 10) : null;
        const batch = searchParams.get('batch') || '';

        if (!subjectCode) {
            return fail('subjectCode is required.', 'MISSING_SUBJECT_CODE', 400);
        }

        const cacheKey = `subject_analytics:${subjectCode}:${branch}:${semester}:${batch}`;
        const cached = getCached(cacheKey);
        if (cached) return ok(cached);

        const supabaseAdmin = getAdminClient();

        // 1. Fetch subject metadata from catalog
        const { data: catData } = await supabaseAdmin
            .from('subject_catalog')
            .select('*')
            .eq('subject_code', subjectCode)
            .maybeSingle();

        // 2. Fetch marks for this subject
        let marksQuery = supabaseAdmin
            .from('subject_marks')
            .select('id, usn, semester, subject_code, subject_name, internal, external, total, grade, credits, passed')
            .eq('subject_code', subjectCode);

        if (semester) {
            marksQuery = marksQuery.eq('semester', semester);
        }

        const { data: rawMarks, error: marksErr } = await marksQuery;
        if (marksErr) throw marksErr;

        const marks = rawMarks || [];

        // 3. Fetch student records to filter by branch and batch
        const usns = Array.from(new Set(marks.map(m => m.usn)));
        let studentMap = new Map();

        if (usns.length > 0) {
            let stuQuery = supabaseAdmin
                .from('students')
                .select('usn, name, branch, year')
                .in('usn', usns);

            if (branch) {
                stuQuery = stuQuery.ilike('branch', `%${branch}%`);
            }

            const { data: stData } = await stuQuery;
            (stData || []).forEach(s => studentMap.set(s.usn, s));
        }

        // Apply filters
        let filteredMarks = marks.filter(m => {
            const student = studentMap.get(m.usn);
            if (!student) return !branch; // If branch filter was applied, only keep matched students
            if (batch) {
                return matchesBatch(student.usn, batch, student.year);
            }
            return true;
        });

        // 4. Calculate KPIs
        const appeared = filteredMarks.length;
        let passed = 0;
        let failed = 0;
        let scoreSum = 0;
        let highestMarks = 0;

        const gradeCounts = { O: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, P: 0, F: 0 };

        filteredMarks.forEach(m => {
            const isFail = isFailedSubject(m);
            const score = Number(m.total) || 0;
            scoreSum += score;
            if (score > highestMarks) highestMarks = score;

            const g = (m.grade || '').toUpperCase().trim();
            if (isFail) {
                failed++;
                gradeCounts.F++;
            } else {
                passed++;
                if (gradeCounts[g] !== undefined) {
                    gradeCounts[g]++;
                } else if (g === 'S') {
                    gradeCounts.O++;
                } else {
                    gradeCounts.P++;
                }
            }
        });

        const passRate = appeared > 0 ? Number(((passed / appeared) * 100).toFixed(1)) : 0;
        const avgMarks = appeared > 0 ? Number((scoreSum / appeared).toFixed(1)) : 0;

        // 5. Top 10 Performers
        const sortedMarks = [...filteredMarks].sort((a, b) => (Number(b.total) || 0) - (Number(a.total) || 0));

        const topPerformers = sortedMarks.slice(0, 10).map((m, idx) => {
            const st = studentMap.get(m.usn);
            return {
                rank: idx + 1,
                usn: m.usn,
                name: st?.name || m.usn,
                internal: m.internal,
                external: m.external,
                total: m.total,
                grade: m.grade || '—'
            };
        });

        // 6. Full Roster
        const studentRoster = sortedMarks.map((m, idx) => {
            const st = studentMap.get(m.usn);
            return {
                rank: idx + 1,
                usn: m.usn,
                name: st?.name || m.usn,
                branch: st?.branch || branch || '—',
                internal: m.internal,
                external: m.external,
                total: m.total,
                grade: m.grade || '—',
                isFail: isFailedSubject(m)
            };
        });

        const gradeDistribution = Object.entries(gradeCounts).map(([grade, count]) => ({
            grade,
            count,
            percentage: appeared > 0 ? Number(((count / appeared) * 100).toFixed(1)) : 0
        }));

        const payload = {
            subject: {
                code: subjectCode,
                name: catData?.subject_name || marks[0]?.subject_name || subjectCode,
                credits: catData?.credits || marks[0]?.credits || 3,
                semester: catData?.semester || semester || marks[0]?.semester || 1,
                scheme: catData?.scheme || '2022'
            },
            kpis: {
                appeared,
                passed,
                failed,
                passRate,
                avgMarks,
                highestMarks
            },
            gradeDistribution,
            topPerformers,
            roster: studentRoster,
            filtersApplied: { subjectCode, branch, semester, batch }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/subject]', err);
        return fail('Failed to fetch subject analytics: ' + (err.message || err), 'SUBJECT_ANALYTICS_ERROR', 500);
    }
}
