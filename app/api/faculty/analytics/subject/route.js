import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient } from '@/lib/analytics-data';
import { fetchByChunks } from '@/lib/supabase-utils';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, matchesBranch, getStudentAcademicBatch, extractBatchFromUsn, extractBranchFromUsn } from '@/lib/semester-utils';
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

        // 1. Fetch subject metadata from catalog (using limit(1) to avoid maybeSingle multi-row errors)
        const { data: catList } = await supabaseAdmin
            .from('subject_catalog')
            .select('*')
            .eq('subject_code', subjectCode)
            .limit(1);
        const catData = catList?.[0] || null;

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

        // 3. Fetch student records safely in chunks to filter by branch and batch
        const usns = Array.from(new Set(marks.map(m => m.usn)));
        let studentMap = new Map();

        if (usns.length > 0) {
            const stData = await fetchByChunks('students', 'usn, name, branch, year, lateral_entry', 'usn', usns, supabaseAdmin, 100);
            (stData || []).forEach(s => studentMap.set(s.usn, s));
        }

        // Compute global batch and branch distribution across all records for this subject (before applying current scope filters)
        const batchPresence = {};
        const branchPresence = {};
        marks.forEach(m => {
            const student = studentMap.get(m.usn);
            const cohort = getStudentAcademicBatch(m.usn, student?.lateral_entry);
            const batchYear = cohort?.fullYear || (extractBatchFromUsn(m.usn)?.fullYear) || '2023';
            const b = extractBranchFromUsn(m.usn) || 'CS';

            batchPresence[batchYear] = (batchPresence[batchYear] || 0) + 1;
            branchPresence[b] = (branchPresence[b] || 0) + 1;
        });

        const batchesAvailable = Object.entries(batchPresence)
            .map(([b, cnt]) => ({ batch: b, count: cnt }))
            .sort((a, b) => b.batch.localeCompare(a.batch));

        const branchesAvailable = Object.entries(branchPresence)
            .map(([b, cnt]) => ({ branch: b, count: cnt }))
            .sort((a, b) => b.count - a.count);

        const totalMarksAcrossAllBatches = marks.length;

        // Apply filters
        let filteredMarks = marks.filter(m => {
            const student = studentMap.get(m.usn);
            if (!student) {
                return matchesBranch(m.usn, branch);
            }
            if (!matchesBranch(student, branch)) {
                return false;
            }
            if (batch) {
                return matchesBatch(student.usn, batch, student.year, student.lateral_entry);
            }
            return true;
        });

        // 4. Calculate KPIs & deep statistics
        const appeared = filteredMarks.length;
        let passed = 0;
        let failed = 0;
        let scoreSum = 0;
        let highestMarks = 0;
        let lowestMarks = appeared > 0 ? 1000 : 0;
        let cieSum = 0;
        let seeSum = 0;
        let maxCIE = 0;
        let maxSEE = 0;

        let fcdCount = 0; // First Class with Distinction (>= 70%)
        let fcCount = 0;  // First Class (60 - 69%)
        let scCount = 0;  // Second Class (50 - 59%)
        let pCount = 0;   // Pass Class (40 - 49%)

        const scores = [];
        const gradeCounts = { O: 0, 'A+': 0, A: 0, 'B+': 0, B: 0, C: 0, P: 0, F: 0 };

        filteredMarks.forEach(m => {
            const isFail = isFailedSubject(m);
            const score = Number(m.total) || 0;
            const cie = Number(m.internal) || 0;
            const see = Number(m.external) || 0;

            scoreSum += score;
            cieSum += cie;
            seeSum += see;
            scores.push(score);

            if (score > highestMarks) highestMarks = score;
            if (score < lowestMarks) lowestMarks = score;
            if (cie > maxCIE) maxCIE = cie;
            if (see > maxSEE) maxSEE = see;

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

                if (score >= 70) fcdCount++;
                else if (score >= 60) fcCount++;
                else if (score >= 50) scCount++;
                else pCount++;
            }
        });

        if (lowestMarks === 1000) lowestMarks = 0;

        const passRate = appeared > 0 ? Number(((passed / appeared) * 100).toFixed(1)) : 0;
        const avgMarks = appeared > 0 ? Number((scoreSum / appeared).toFixed(1)) : 0;
        const avgCIE = appeared > 0 ? Number((cieSum / appeared).toFixed(1)) : 0;
        const avgSEE = appeared > 0 ? Number((seeSum / appeared).toFixed(1)) : 0;

        // Median & Standard Deviation
        scores.sort((a, b) => a - b);
        let medianMarks = 0;
        if (appeared > 0) {
            const mid = Math.floor(appeared / 2);
            medianMarks = appeared % 2 !== 0 ? scores[mid] : Number(((scores[mid - 1] + scores[mid]) / 2).toFixed(1));
        }

        let variance = 0;
        if (appeared > 1) {
            const mean = scoreSum / appeared;
            variance = scores.reduce((acc, s) => acc + Math.pow(s - mean, 2), 0) / appeared;
        }
        const stdDev = Number(Math.sqrt(variance).toFixed(1));

        const fcdRate = appeared > 0 ? Number(((fcdCount / appeared) * 100).toFixed(1)) : 0;
        const fcRate = appeared > 0 ? Number(((fcCount / appeared) * 100).toFixed(1)) : 0;
        const scRate = appeared > 0 ? Number(((scCount / appeared) * 100).toFixed(1)) : 0;
        const pRate = appeared > 0 ? Number(((pCount / appeared) * 100).toFixed(1)) : 0;

        // 5. Sorted Marks & Dynamic Ranking
        const sortedMarks = [...filteredMarks].sort((a, b) => {
            const bt = Number(b.total) || 0;
            const at = Number(a.total) || 0;
            if (bt !== at) return bt - at;
            const be = Number(b.external) || 0;
            const ae = Number(a.external) || 0;
            if (be !== ae) return be - ae;
            return (a.usn || '').localeCompare(b.usn || '');
        });

        let curRank = 1;
        let lastScore = null;
        const studentRoster = sortedMarks.map((m, idx) => {
            const st = studentMap.get(m.usn);
            const score = Number(m.total) || 0;
            if (idx === 0) {
                curRank = 1;
                lastScore = score;
            } else if (score === lastScore) {
                // Tied score
            } else {
                curRank = curRank + 1; // Dense ranking
                lastScore = score;
            }

            return {
                rank: curRank,
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

        // 6. Top 10 Performers
        const topPerformers = studentRoster.slice(0, 10).map(r => ({
            rank: r.rank,
            usn: r.usn,
            name: r.name,
            internal: r.internal,
            external: r.external,
            total: r.total,
            grade: r.grade
        }));

        const gradeDistribution = Object.entries(gradeCounts).map(([grade, count]) => ({
            grade,
            count,
            percentage: appeared > 0 ? Number(((count / appeared) * 100).toFixed(1)) : 0
        }));

        // Authoritative subject name: Prefer scraped subject_marks name
        const authSubjectName = marks[0]?.subject_name || catData?.subject_name || subjectCode;

        const payload = {
            subject: {
                code: subjectCode,
                name: authSubjectName,
                credits: catData?.credits || marks[0]?.credits || 3,
                semester: catData?.semester || semester || marks[0]?.semester || 1,
                scheme: catData?.scheme || (subjectCode.startsWith('1') ? '2025' : '2022')
            },
            kpis: {
                appeared,
                passed,
                failed,
                passRate,
                avgMarks,
                highestMarks,
                lowestMarks,
                medianMarks,
                stdDev,
                avgCIE,
                avgSEE,
                maxCIE,
                maxSEE,
                fcdCount,
                fcdRate,
                fcCount,
                fcRate,
                scCount,
                scRate,
                pCount,
                pRate
            },
            gradeDistribution,
            classDistribution: [
                { category: 'Distinction (≥70%)', count: fcdCount, percentage: fcdRate, color: '#10B981' },
                { category: 'First Class (60-69%)', count: fcCount, percentage: fcRate, color: '#3B82F6' },
                { category: 'Second Class (50-59%)', count: scCount, percentage: scRate, color: '#F59E0B' },
                { category: 'Pass Class (40-49%)', count: pCount, percentage: pRate, color: '#8B5CF6' },
                { category: 'Failed (<40%)', count: failed, percentage: appeared > 0 ? Number(((failed / appeared) * 100).toFixed(1)) : 0, color: '#EF4444' }
            ],
            topPerformers,
            roster: studentRoster,
            batchesAvailable,
            branchesAvailable,
            totalMarksAcrossAllBatches,
            filtersApplied: { subjectCode, branch, semester, batch }
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/subject]', err);
        return fail('Failed to fetch subject analytics: ' + (err.message || err), 'SUBJECT_ANALYTICS_ERROR', 500);
    }
}
