import { NextResponse } from 'next/server';
import { readTable, SELECTS } from '@/lib/table-cache';
import { requireStaff } from '@/lib/server-session';
import { getAdminClient, fetchDynamicStudents } from '@/lib/analytics-data';
import { getCached, setCached } from '@/lib/server-cache';
import { matchesBatch, canonicalBranchCode } from '@/lib/semester-utils';
import { isFailedSubject } from '@/lib/vtuGrades';

import { unstable_noStore as noStore } from 'next/cache';

export const dynamic = 'force-dynamic';
/**
 * The analytics warehouse is a whole-table read (19k subject_marks rows and three
 * more tables) the first time a server instance answers. That lands around 3s warm
 * and can exceed Vercel's default 10s function ceiling on a cold start, which is
 * what turned a populated gazette into "No student records found" — the request was
 * killed, not empty. Raising the ceiling lets the first request finish and warm the
 * process caches for every request after it. The platform clamps this to the plan
 * maximum, so it is safe to ask for 60 everywhere.
 */
export const maxDuration = 60;

export const fetchCache = 'force-no-store';
export const revalidate = 0;

function ok(data) {
    return NextResponse.json({ success: true, data }, {
        headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
            'Pragma': 'no-cache',
            'Expires': '0',
            'Surrogate-Control': 'no-store'
        }
    });
}

function fail(message, code = 'ERROR', status = 400) {
    return NextResponse.json({ success: false, error: { code, message } }, { status });
}

function formatExamSession(code) {
    if (!code) return 'University Exam';
    const c = String(code).trim();
    const isReval = /rv|reval/i.test(c);
    const suffix = isReval ? ' Reval' : ' Regular';

    const mDecJan = c.match(/D(\d+)J(\d+)/i);
    if (mDecJan) {
        const y1 = mDecJan[1].length === 1 ? `200${mDecJan[1]}` : (mDecJan[1].length === 2 ? `20${mDecJan[1]}` : mDecJan[1]);
        const y2 = mDecJan[2].length === 1 ? `200${mDecJan[2]}` : (mDecJan[2].length === 2 ? `20${mDecJan[2]}` : mDecJan[2]);
        return `Dec ${y1.slice(-2)}/Jan ${y2.slice(-2)}${suffix}`;
    }

    const mMJ = c.match(/MJ(\d+)/i);
    if (mMJ) {
        const y = mMJ[1].length === 2 ? `20${mMJ[1]}` : mMJ[1];
        return `May/June ${y}${suffix}`;
    }

    const mJJ = c.match(/JJ.*?(\d{2,4})/i);
    if (mJJ) {
        const y = mJJ[1].length === 2 ? `20${mJJ[1]}` : mJJ[1];
        return `Jun/Jul ${y}${suffix}`;
    }

    const mDJ = c.match(/DJ.*?(\d{2,4})/i);
    if (mDJ) {
        const y = mDJ[1].length === 2 ? `20${mDJ[1]}` : mDJ[1];
        return `Dec/Jan ${y}${suffix}`;
    }

    const mSE = c.match(/SE.*?(\d{2,4})/i);
    if (mSE) {
        const y = mSE[1].length === 2 ? `20${mSE[1]}` : mSE[1];
        return `Summer ${y}${suffix}`;
    }

    if (isReval) return `${c} (Reval)`;
    return c;
}

// Maps any raw scraped exam_name (current or future) to its canonical academic cycle,
// ensuring that a revaluation attempt automatically pairs with the regular attempt
// of the exact same exam cycle without hardcoded exam year tables.
function examCycleKey(examName) {
    if (!examName) return 'UNKNOWN';
    const c = String(examName).trim().toUpperCase();
    const clean = c.replace(/\.(PHP|HTML?)/i, '').replace(/^INDEX/i, '');

    // Pattern 1: Dec XX / Jan YY e.g. D25J26, D26J27, D27J28
    const mDecJan = clean.match(/D(\d+)J(\d+)/i);
    if (mDecJan) return `D${mDecJan[1]}J${mDecJan[2]}`;

    // Pattern 2: May/June XX e.g. MJ26, MJ27, MJ28
    const mMJ = clean.match(/MJ(\d+)/i);
    if (mMJ) return `MJ${mMJ[1]}`;

    // Pattern 3: Jun/Jul XX e.g. JJ24, JJ25, JJ26
    const mJJ = clean.match(/JJ(?:RV|E)?(?:CBCS)?(\d+)/i) || clean.match(/JJ(\d+)/i);
    if (mJJ) return `JJ${mJJ[1]}`;

    // Pattern 4: Dec/Jan XX e.g. DJ24, DJ25, DJ26
    const mDJ = clean.match(/DJ(?:RV|E)?(?:CBCS)?(\d+)/i) || clean.match(/DJ(\d+)/i);
    if (mDJ) return `DJ${mDJ[1]}`;

    // Pattern 5: Summer/SE XX e.g. SE25, SE26
    const mSE = clean.match(/SE(?:RV)?(?:CBCS)?(\d+)/i);
    if (mSE) return `SE${mSE[1]}`;

    // Pattern 6: MakeUp XX e.g. MAKEUPECBCS24, MAKEUP25
    const mMU = clean.match(/MAKEUP(?:E)?(?:CBCS)?(\d+)/i);
    if (mMU) return `MAKEUP${mMU[1]}`;

    // Universal fallback: strip reval / cbcs / regular markers
    const genericKey = clean
        .replace(/RV|REVAL/g, '')
        .replace(/CBCS|ECBCS|REGULAR/g, '')
        .replace(/[^A-Z0-9]/g, '');

    return genericKey || clean;
}

function isFailed(attempt) {
    if (!attempt) return true;
    const g = String(attempt.grade || '').toUpperCase().trim();
    if (g === 'F' || g === 'AB' || g === 'FAIL' || g === 'NP' || g === 'NE' || g === 'X') return true;
    if (attempt.passed === false) return true;
    const ext = Number(attempt.external);
    const tot = Number(attempt.total);
    if (!isNaN(ext) && ext < 18) return true;
    if (!isNaN(tot) && tot < 40) return true;
    return false;
}

export async function GET(req) {
    noStore();
    try {
        const { session, error: authError } = requireStaff(req, ['faculty', 'admin']);
        if (authError) return authError;

        const { searchParams } = new URL(req.url);
        const rawBranch = searchParams.get('branch') || 'ALL';
        const branch = rawBranch === 'ALL' ? 'ALL' : (canonicalBranchCode(rawBranch) || rawBranch.toUpperCase().trim());
        const semParam = (searchParams.get('semester') || 'ALL').toUpperCase().trim();
        const semester = (semParam === 'ALL' || !semParam) ? 'ALL' : parseInt(semParam, 10);
        const batch = searchParams.get('batch') || '';
        const section = (searchParams.get('section') || 'ALL').toUpperCase().trim();
        const cacheKey = `reval_impact_v3:${branch}:${semester}:${batch}:${section}`;
        const fresh = searchParams.get('fresh') === '1';
        if (!fresh) {
            const cached = getCached(cacheKey);
            if (cached) return ok(cached);
        }

        const supabaseAdmin = getAdminClient();

        // 1. Fetch classes, students, canonical subject_marks & results from warehouse cache
        const [
            rawStudents,
            { data: rawClasses },
            { data: rawClassStudents },
            { data: rawSubjectMarks },
            { data: rawResults }
        ] = await Promise.all([
            fetchDynamicStudents(supabaseAdmin, { branch, select: 'id, usn, name, branch, year, lateral_entry' }),
            readTable(supabaseAdmin, 'classes', SELECTS.classes, { orderCol: 'created_at', ascending: false }).then(data => ({ data })),
            readTable(supabaseAdmin, 'class_students', SELECTS.class_students).then(data => ({ data })),
            readTable(supabaseAdmin, 'subject_marks', SELECTS.subject_marks).then(data => ({ data })),
            readTable(supabaseAdmin, 'results', SELECTS.results).then(data => ({ data }))
        ]);

        const resultById = new Map((rawResults || []).map(r => [r.id, r]));
        const canonicalMarksByUsnSub = new Map();
        (rawSubjectMarks || []).forEach(m => {
            canonicalMarksByUsnSub.set(`${m.usn}|${(m.subject_code || '').toUpperCase()}`, m);
        });

        const classById = new Map((rawClasses || []).map(c => [c.id, c]));
        const usnToSectionMap = new Map();
        const sortedClassStudents = [...(rawClassStudents || [])].sort((a, b) => {
            const cA = classById.get(a.class_id);
            const cB = classById.get(b.class_id);
            const aScore = (cA && (semester === 'ALL' || Number(cA.semester) === Number(semester)) ? 2 : 0) + (cA && cA.batch === batch ? 1 : 0);
            const bScore = (cB && (semester === 'ALL' || Number(cB.semester) === Number(semester)) ? 2 : 0) + (cB && cB.batch === batch ? 1 : 0);
            return aScore - bScore;
        });
        sortedClassStudents.forEach(cs => {
            const c = classById.get(cs.class_id);
            if (c && c.section) {
                usnToSectionMap.set(cs.usn, c.section.toUpperCase().trim());
            }
        });

        let students = rawStudents || [];
        if (batch && batch.toUpperCase() !== 'ALL') {
            students = students.filter(s => matchesBatch(s.usn, batch, s.year, s.lateral_entry));
        }
        if (section && section !== 'ALL') {
            students = students.filter(s => usnToSectionMap.get(s.usn) === section);
        }

        const studentByUsn = new Map(students.map(s => [s.usn, s]));

        // Fetch attempts for this semester or all semesters directly with automatic pagination
        let rawAttempts = [];
        let from = 0;
        while (true) {
            let q = supabaseAdmin
                .from('subject_mark_attempts')
                .select('id, result_id, usn, subject_code, subject_name, semester, internal, external, total, grade, credits, exam_name, announced_date, scraped_at')
                .order('id')
                .range(from, from + 999);
            if (semester !== 'ALL' && !isNaN(semester)) {
                q = q.eq('semester', semester);
            }
            const { data: page, error: attemptsErr } = await q;
            if (attemptsErr) throw attemptsErr;
            if (!page || page.length === 0) break;
            rawAttempts.push(...page);
            if (page.length < 1000) break;
            from += 1000;
        }

        // Filter by branch, batch, and section
        const attempts = (rawAttempts || []).filter(a => {
            if (branch === 'ALL' && (!batch || batch.toUpperCase() === 'ALL') && (!section || section === 'ALL')) return true;
            return studentByUsn.has(a.usn);
        });
        const bySubject = new Map(); // `${usn}|${semester}|${subject_code}` -> attempt rows, each tagged with isReval
        attempts.forEach(a => {
            const key = `${a.usn}|${a.semester}|${(a.subject_code || '').toUpperCase()}`;
            const list = bySubject.get(key) || [];
            list.push({ ...a, isReval: Boolean(a.exam_name && /rv/i.test(a.exam_name)) });
            bySubject.set(key, list);
        });

        const deltaRoster = [];
        let upgradedCount = 0;
        let clearedCount = 0;
        let reExamClearedCount = 0;
        let stillFailCount = 0;
        let confirmedCount = 0;
        let unchangedCount = 0;
        let decreasedCount = 0;
        let retainedCount = 0;

        bySubject.forEach((subjectAttempts, key) => {
            const [usn, sem, subCode] = key.split('|');
            const stu = studentByUsn.get(usn);
            const revals = subjectAttempts.filter(a => a.isReval);
            const regulars = subjectAttempts.filter(a => !a.isReval);

            if (revals.length === 0) return;

            // 1. Deduplicate revaluation attempts by exam cycle key
            const revalsByCycle = new Map();
            revals.forEach(a => {
                const cycle = examCycleKey(a.exam_name);
                const existing = revalsByCycle.get(cycle);
                if (!existing) {
                    revalsByCycle.set(cycle, a);
                } else {
                    const extPassed = !isFailed(existing);
                    const aPassed = !isFailed(a);
                    if (!extPassed && aPassed) {
                        revalsByCycle.set(cycle, a);
                    } else if (new Date(a.announced_date || a.scraped_at || 0) < new Date(existing.announced_date || existing.scraped_at || 0)) {
                        revalsByCycle.set(cycle, a);
                    }
                }
            });

            revalsByCycle.forEach((attempt, cycle) => {
                // Find all regular attempts for this exam cycle
                const cycleRegulars = regulars.filter(r => examCycleKey(r.exam_name) === cycle);
                if (cycleRegulars.length === 0) return;

                // Sort regular attempts by date/scrape time ascending (earliest first)
                cycleRegulars.sort((a, b) => new Date(a.announced_date || a.scraped_at || 0) - new Date(b.announced_date || b.scraped_at || 0));

                const revalDate = new Date(attempt.announced_date || attempt.scraped_at || 0);
                const preRevalRegulars = cycleRegulars.filter(r => {
                    const rDate = new Date(r.announced_date || r.scraped_at || 0);
                    return rDate <= revalDate;
                });

                let prior = preRevalRegulars.length > 0 ? preRevalRegulars[0] : cycleRegulars[0];

                // If prior has exact same marks as attempt, check if there was another regular attempt with different marks
                // (defends against scrapes done post-revaluation where VTU updated the regular URL with reval marks)
                if (prior.external === attempt.external && cycleRegulars.length > 1) {
                    const diffReg = cycleRegulars.find(r => r.external !== attempt.external);
                    if (diffReg) prior = diffReg;
                }

                const revalExternal = attempt.external !== null && attempt.external !== undefined ? Number(attempt.external) : null;
                const revalInternal = attempt.internal !== null && attempt.internal !== undefined ? Number(attempt.internal) : null;
                const postScore = (attempt.total !== null && attempt.total !== undefined) ? Number(attempt.total) : ((revalExternal ?? 0) + (revalInternal ?? 0));

                const originalExternal = prior.external !== null && prior.external !== undefined ? Number(prior.external) : null;
                const originalInternal = prior.internal !== null && prior.internal !== undefined ? Number(prior.internal) : null;
                const preScore = (prior.total !== null && prior.total !== undefined) ? Number(prior.total) : ((originalExternal ?? 0) + (originalInternal ?? 0));
                const preGrade = prior.grade || '—';
                const postGrade = attempt.grade || '—';

                // SEE marks are the external evaluation component modified in revaluation.
                // Fall back to total marks if external is not distinct.
                const deltaMarks = (revalExternal !== null && originalExternal !== null)
                    ? (revalExternal - originalExternal)
                    : (postScore - preScore);
                const delta = postScore - preScore;

                const wasFailingBefore = isFailed(prior);
                const isFailingNow = isFailed(attempt);

                let outcome;
                let outcomeType;

                if (wasFailingBefore && !isFailingNow) {
                    outcome = 'Cleared Backlog';
                    outcomeType = 'CLEARED_BACKLOG';
                    clearedCount++;
                } else if (wasFailingBefore && isFailingNow) {
                    if (deltaMarks > 0) {
                        outcome = `Marks Improved (+${deltaMarks}, Still Fail)`;
                        outcomeType = 'STILL_FAIL';
                        stillFailCount++;
                    } else if (deltaMarks < 0) {
                        outcome = 'Original Retained (Still Fail)';
                        outcomeType = 'ORIGINAL_RETAINED';
                        retainedCount++;
                        decreasedCount++;
                    } else {
                        outcome = 'Confirmed (Backlog Retained)';
                        outcomeType = 'CONFIRMED';
                        unchangedCount++;
                    }
                } else if (!wasFailingBefore && !isFailingNow) {
                    if (deltaMarks > 0) {
                        outcome = 'Grade Upgraded';
                        outcomeType = 'GRADE_UPGRADED';
                        upgradedCount++;
                    } else if (deltaMarks < 0) {
                        outcome = 'Original Retained (Higher Mark Kept)';
                        outcomeType = 'ORIGINAL_RETAINED';
                        retainedCount++;
                        decreasedCount++;
                    } else {
                        outcome = 'Confirmed (No Change)';
                        outcomeType = 'CONFIRMED';
                        unchangedCount++;
                    }
                } else {
                    outcome = 'Original Retained (Pass Retained)';
                    outcomeType = 'ORIGINAL_RETAINED';
                    retainedCount++;
                    decreasedCount++;
                }

                // Check current official status from canonical subject_marks and subsequent attempts
                const canonicalKey = `${usn}|${(attempt.subject_code || '').toUpperCase()}`;
                const canonical = canonicalMarksByUsnSub.get(canonicalKey);

                const subsequentAttempts = regulars.filter(a => {
                    const aDate = new Date(a.announced_date || a.scraped_at || 0);
                    return aDate > revalDate && examCycleKey(a.exam_name) !== cycle;
                });

                let currentStatus = {
                    isCleared: false,
                    statusType: 'ACTIVE_BACKLOG',
                    label: 'Active Backlog',
                    details: null,
                };

                if (!isFailingNow) {
                    const statusLabel = 'Cleared via Reval';
                    const statusDetails = `${revalExternal ?? '—'} SEE / ${postScore} Total (Grade ${postGrade})`;
                    currentStatus = {
                        isCleared: true,
                        statusType: 'CLEARED_REVAL',
                        label: statusLabel,
                        badgeLabel: statusLabel,
                        details: statusDetails,
                        detail: statusDetails,
                    };
                } else {
                    const canonicalPassed = canonical && !isFailed(canonical);
                    const passedReExam = subsequentAttempts.find(a => !isFailed(a));

                    if (canonicalPassed || passedReExam) {
                        const passRecord = passedReExam || canonical;
                        const examName = passRecord.exam_name || (passRecord.result_id && resultById.get(passRecord.result_id)?.exam_name) || 'Re-Exam';
                        const extMarks = passRecord.external ?? passRecord.external_marks ?? '—';
                        const totMarks = passRecord.total ?? '—';
                        const gradeVal = passRecord.grade ?? 'P';
                        const statusLabel = 'Cleared in Re-Exam';
                        const statusDetails = `Cleared in ${examName} (${extMarks} SEE / ${totMarks} Total, Grade ${gradeVal})`;
                        currentStatus = {
                            isCleared: true,
                            statusType: 'CLEARED_REEXAM',
                            label: statusLabel,
                            badgeLabel: statusLabel,
                            examName,
                            details: statusDetails,
                            detail: statusDetails,
                        };
                        reExamClearedCount++;
                    } else if (subsequentAttempts.length > 0) {
                        const lastAtt = subsequentAttempts[subsequentAttempts.length - 1];
                        const extMarks = lastAtt.external ?? lastAtt.external_marks ?? '—';
                        const statusLabel = 'Re-Exam Attempted (Pending)';
                        const statusDetails = `Latest: ${extMarks} SEE in ${lastAtt.exam_name}`;
                        currentStatus = {
                            isCleared: false,
                            statusType: 'REEXAM_ATTEMPTED',
                            label: statusLabel,
                            badgeLabel: statusLabel,
                            examName: lastAtt.exam_name,
                            details: statusDetails,
                            detail: statusDetails,
                        };
                    } else {
                        const statusLabel = 'Active Backlog';
                        const statusDetails = 'Backlog pending re-exam';
                        currentStatus = {
                            isCleared: false,
                            statusType: 'ACTIVE_BACKLOG',
                            label: statusLabel,
                            badgeLabel: statusLabel,
                            details: statusDetails,
                            detail: statusDetails,
                        };
                    }
                }

                const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
                const formattedAppliedDate = formatDate(attempt.announced_date || attempt.scraped_at);
                const formattedRegularDate = formatDate(prior.announced_date || prior.scraped_at);

                deltaRoster.push({
                    usn,
                    name: stu?.name || usn,
                    branch: stu?.branch || (usn.length >= 7 ? usn.substring(5, 7).toUpperCase() : '—'),
                    section: usnToSectionMap.get(usn) || '—',
                    semester: attempt.semester,
                    subject_code: attempt.subject_code,
                    subject_name: attempt.subject_name || attempt.subject_code,
                    originalExternal,
                    revalExternal,
                    deltaMarks,
                    originalInternal,
                    revalInternal,
                    originalTotal: preScore,
                    revalTotal: postScore,
                    preMarks: preScore,
                    preGrade,
                    postMarks: postScore,
                    postGrade,
                    delta,
                    outcome,
                    outcomeType,
                    currentStatus,
                    isCleared: currentStatus.isCleared,
                    isClearedInReval: outcome === 'Cleared Backlog',
                    isClearedInReExam: currentStatus.statusType === 'CLEARED_REEXAM',
                    revalExam: attempt.exam_name || 'Reval',
                    revalExamLabel: formatExamSession(attempt.exam_name),
                    regularExam: prior?.exam_name || 'Regular',
                    regularExamLabel: formatExamSession(prior?.exam_name),
                    appliedDate: formattedAppliedDate,
                    regularDate: formattedRegularDate,
                    credits: attempt.credits || prior?.credits || 3,
                });
            });
        });

        // Group by student so faculty can see which student put which subjects, how many subjects, and when
        const studentMap = new Map();
        deltaRoster.forEach(d => {
            const entry = studentMap.get(d.usn) || {
                usn: d.usn,
                name: d.name,
                branch: studentByUsn.get(d.usn)?.branch || 'Engineering',
                applications: [],
                semesters: new Set(),
                totalDelta: 0,
                upgraded: 0,
                cleared: 0,
                reExamCleared: 0,
                stillFail: 0,
                retained: 0,
                decreased: 0,
                confirmed: 0,
                awaitingOriginal: 0,
            };
            entry.applications.push(d);
            entry.semesters.add(d.semester);
            if (d.delta !== null) entry.totalDelta += d.delta;
            if (d.outcomeType === 'CLEARED_BACKLOG') entry.cleared++;
            else if (d.outcomeType === 'STILL_FAIL') entry.stillFail++;
            else if (d.outcomeType === 'GRADE_UPGRADED') entry.upgraded++;
            else if (d.outcomeType === 'ORIGINAL_RETAINED') { entry.retained++; entry.decreased++; }
            else entry.confirmed++;

            if (d.currentStatus?.statusType === 'CLEARED_REEXAM') entry.reExamCleared++;

            studentMap.set(d.usn, entry);
        });

        // Calculate totalStudentApplications and sort applications per student
        const studentRoster = Array.from(studentMap.values()).map(s => ({
            ...s,
            semesters: Array.from(s.semesters).sort((a, b) => a - b),
            totalSubjectsPut: s.applications.length,
            applications: s.applications.sort((a, b) => a.semester - b.semester || a.subject_code.localeCompare(b.subject_code)),
        })).sort((a, b) => b.totalSubjectsPut - a.totalSubjectsPut || a.name.localeCompare(b.name));

        // Inject totalStudentApplications into each delta row
        deltaRoster.forEach(d => {
            d.totalStudentApplications = studentMap.get(d.usn)?.applications.length || 1;
        });

        const totalApplications = deltaRoster.length;
        const netPassRateGain = totalApplications > 0 ? Number(((clearedCount / totalApplications) * 100).toFixed(1)) : 0;

        const payload = {
            summary: {
                totalApplications,
                totalStudents: studentRoster.length,
                upgradedCount,
                clearedCount,
                reExamClearedCount,
                stillFailCount,
                retainedCount,
                confirmedCount,
                unchangedCount,
                decreasedCount,
                awaitingOriginalCount: 0,
                netPassRateGain,
            },
            deltaRoster,
            studentRoster,
            branch,
            semester,
        };

        setCached(cacheKey, payload, 30_000);

        return ok(payload);
    } catch (err) {
        console.error('[GET /api/faculty/analytics/reval-impact]', err);
        return fail('Failed to compile revaluation impact analysis: ' + (err.message || err), 'REVAL_ERROR', 500);
    }
}
