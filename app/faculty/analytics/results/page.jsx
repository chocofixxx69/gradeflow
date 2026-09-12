'use client';

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { getJsPDF } from '@/lib/lazy-export-libs';
import { downloadWorkbook } from '@/lib/workbook-export';
import { fmtNum, fmtGpa, fmtPercent, resultFileName } from '@/lib/format';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';
import { DiplomaTag } from '@/components/ui/EntryTag';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest, clearApiCache } from '@/lib/api/client';
import { getCleanBranchOptions, canonicalBranchCode } from '@/lib/semester-utils';
import { filterAndRankStudents, matchesStudent } from '@/lib/search-utils';

export default function ExamResultsHubPage() {
    return (
        <AuthGuard role="faculty">
            <Suspense fallback={
                <div style={{ padding: '40px 24px', maxWidth: '1400px', margin: '0 auto', textAlign: 'center', color: 'var(--tx-muted)' }}>
                    Loading Exam Results Hub...
                </div>
            }>
                <ExamResultsHubContent />
            </Suspense>
        </AuthGuard>
    );
}

function ExamResultsHubContent() {
    const searchParams = useSearchParams();
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    // Tab Switcher: 'semester' (Semester Gazette) | 'batch' (Batch Trajectory) | 'reval' (Revaluation Delta)
    const [viewTab, setViewTab] = useState(() => {
        const param = searchParams?.get('tab');
        if (param === 'batch') return 'batch';
        if (param === 'reval') return 'reval';
        return 'semester';
    });

    const [meta, setMeta] = useState(() => initialMeta || { branches: [], batches: [], semesters: [1, 2, 3, 4, 5, 6, 7, 8] });

    // Shared Scope Filters
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [semester, setSemester] = useState(() => (initialSaved.semester && initialSaved.semester !== 'all') ? Number(initialSaved.semester) : 6);
    const [batch, setBatch] = useState(() => initialSaved.batch || initialMeta?.batches?.[0] || '2023');
    const [section, setSection] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    // Dynamically derive available sections strictly from live classes metadata for the chosen branch and batch
    const availableSections = useMemo(() => {
        const classes = meta.classes || [];
        const norm = (b) => canonicalBranchCode(b) || (b ? String(b).toUpperCase().trim() : '');
        const targetBranch = branch && branch !== 'ALL' ? norm(branch) : null;
        const targetBatch = batch && batch !== 'ALL' ? String(batch) : null;

        const branchClasses = classes.filter(c => {
            if (targetBranch) {
                const cBranch = norm(c.branch_code) || norm(c.branch);
                if (cBranch !== targetBranch) return false;
            }
            if (targetBatch && c.batch) {
                if (String(c.batch) !== targetBatch) return false;
            }
            return true;
        });

        // If semester-specific classes exist for this branch & batch, prefer them; otherwise use cohort classes
        const semClasses = (viewTab !== 'batch' && semester && semester !== 'ALL')
            ? branchClasses.filter(c => c.semester && Number(c.semester) === Number(semester))
            : [];
        const targetClasses = semClasses.length > 0 ? semClasses : branchClasses;

        const sectionSet = new Set(targetClasses.map(c => (c.section || '').trim().toUpperCase()).filter(Boolean));
        return Array.from(sectionSet).sort();
    }, [meta.classes, branch, semester, batch, viewTab]);

    // Reset section filter when branch or batch changes
    useEffect(() => {
        setSection('ALL');
    }, [branch, batch]);

    // Clear stale section selection if no longer present in available sections
    useEffect(() => {
        if (section !== 'ALL' && availableSections.length > 0 && !availableSections.includes(section)) {
            setSection('ALL');
        }
    }, [availableSections, section]);

    // Construct user-friendly section options
    const sectionOptions = useMemo(() => {
        if (availableSections.length === 0) {
            return [
                { value: 'ALL', label: 'No Sections Created (Whole Cohort)' }
            ];
        }
        if (availableSections.length === 1) {
            return [
                { value: 'ALL', label: `Single Section (Sec ${availableSections[0]})` },
                { value: availableSections[0], label: `Section ${availableSections[0]}` }
            ];
        }
        return [
            { value: 'ALL', label: `All Sections (${availableSections.join(', ')})` },
            ...availableSections.map(s => ({ value: s, label: `Section ${s}` }))
        ];
    }, [availableSections]);

    // Tab 1: Semester Analysis States
    const [viewMode, setViewMode] = useState('credits'); // 'credits' | 'marks'
    const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'passed' | 'failed'

    const initialSemData = getCachedApiData('/api/faculty/analytics/semester-analysis', {
        branch: initialSaved.branch || 'CS',
        semester: (initialSaved.semester && initialSaved.semester !== 'all') ? Number(initialSaved.semester) : 6,
        batch: initialSaved.batch || '2023'
    });
    const [semData, setSemData] = useState(() => initialSemData || {
        students: [],
        subjects: [],
        summary: { totalAppeared: 0, totalPassed: 0, totalFailed: 0, passPercentage: 0, classCounts: { FCD: 0, FC: 0, SC: 0, P: 0, F: 0 } },
        subjectTallies: [],
        backlogRoster: []
    });
    const [semLoading, setSemLoading] = useState(() => !initialSemData);

    // Tab 2: Batch Trajectory States
    const [upToSemester, setUpToSemester] = useState(() => (initialSaved.semester && initialSaved.semester !== 'all') ? Number(initialSaved.semester) : 6);
    const initialBatchData = getCachedApiData('/api/faculty/analytics/batch-report', {
        branch: initialSaved.branch || 'CS',
        batch: initialSaved.batch || '2023',
        upToSemester: (initialSaved.semester && initialSaved.semester !== 'all') ? Number(initialSaved.semester) : 6
    });
    const [batchData, setBatchData] = useState(() => initialBatchData || {
        students: [],
        upToSemester: 6,
        summary: { totalStudents: 0, avgCGPA: 0, withBacklogs: 0, distinctionCount: 0, lateralCount: 0 }
    });
    const [batchLoading, setBatchLoading] = useState(() => !initialBatchData);

    // Tab 3: Reval Impact States
    const [outcomeFilter, setOutcomeFilter] = useState('ALL');
    const [revalViewMode, setRevalViewMode] = useState('roster'); // 'roster' | 'student'
    const [revalData, setRevalData] = useState({
        summary: { totalApplications: 0, totalStudents: 0, upgradedCount: 0, clearedCount: 0, unchangedCount: 0, decreasedCount: 0, awaitingOriginalCount: 0, netPassRateGain: 0 },
        deltaRoster: [],
        studentRoster: [],
        branch: 'ALL',
        semester: 'ALL'
    });
    const [revalLoading, setRevalLoading] = useState(false);

    // A failed request used to fall through to "No student records found", which
    // reads as "this cohort has no data" — the single most expensive wrong message
    // this page can show, because the natural response is to go re-scrape results
    // that were already there. Failures are now named.
    const [loadError, setLoadError] = useState(null);

    // Synchronize filters
    useEffect(() => {
        saveFilters({ branch, semester, batch });
    }, [branch, semester, batch]);

    // 1. Fetch metadata on mount
    useEffect(() => {
        let isMounted = true;
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta', { cacheTtl: 60_000 });
                if (res && isMounted) {
                    setMeta(res);
                    if (res.semesters && res.semesters.length > 0) {
                        const latest = res.semesters[res.semesters.length - 1];
                        setSemester(prev => (prev === 'ALL' || !prev || prev === 3) ? latest : prev);
                        setUpToSemester(prev => (!prev || prev === 3) ? latest : prev);
                    }
                }
            } catch (err) {
                console.error('Failed to load meta:', err);
            }
        }
        loadMeta();
        return () => { isMounted = false; };
    }, []);

    // 2. Fetch Semester Analysis Data
    const loadSemesterData = useCallback(async (silent = false, fresh = false) => {
        if (!branch || !semester || !batch) return null;
        if (!silent) setSemLoading(true);
        setLoadError(null);
        try {
            const query = { branch, semester, batch, section: section !== 'ALL' ? section : undefined };
            if (fresh) query.fresh = '1';
            const res = await apiRequest('/api/faculty/analytics/semester-analysis', { query, cacheTtl: fresh ? 0 : 30_000 });
            if (res) setSemData(res);
            return res;
        } catch (err) {
            console.error('Failed to load semester data:', err);
            setLoadError({ scope: 'semester gazette', message: err?.message || 'The request did not complete.' });
            return null;
        } finally {
            if (!silent) setSemLoading(false);
        }
    }, [branch, semester, batch, section]);

    // 3. Fetch Batch Trajectory Data
    const loadBatchTrajectory = useCallback(async (silent = false, fresh = false) => {
        if (!branch || !batch) return null;
        if (!silent) setBatchLoading(true);
        setLoadError(null);
        try {
            const query = { branch, batch, upToSemester, section: section !== 'ALL' ? section : undefined };
            if (fresh) query.fresh = '1';
            const res = await apiRequest('/api/faculty/analytics/batch-report', { query, cacheTtl: fresh ? 0 : 30_000 });
            if (res) setBatchData(res);
            return res;
        } catch (err) {
            console.error('Failed to load batch report:', err);
            setLoadError({ scope: 'batch trajectory', message: err?.message || 'The request did not complete.' });
            return null;
        } finally {
            if (!silent) setBatchLoading(false);
        }
    }, [branch, batch, upToSemester, section]);

    // 4. Fetch Reval Impact Data
    const loadRevalData = useCallback(async (silent = false, fresh = false) => {
        if (!branch) return null;
        if (!silent) setRevalLoading(true);
        setLoadError(null);
        try {
            const query = { branch, semester, batch, section: section !== 'ALL' ? section : undefined };
            if (fresh) query.fresh = '1';
            const res = await apiRequest('/api/faculty/analytics/reval-impact', { query, cacheTtl: fresh ? 0 : 30_000 });
            if (res) setRevalData(res);
            return res;
        } catch (err) {
            console.error('Failed to load reval data:', err);
            setLoadError({ scope: 'revaluation impact', message: err?.message || 'The request did not complete.' });
            return null;
        } finally {
            if (!silent) setRevalLoading(false);
        }
    }, [branch, semester, batch, section]);

    useEffect(() => {
        if (viewTab === 'semester') {
            if (semester === 'ALL') {
                const latest = (meta.semesters && meta.semesters.length > 0) ? meta.semesters[meta.semesters.length - 1] : 6;
                setSemester(latest);
                return;
            }
            loadSemesterData();
        } else if (viewTab === 'batch') {
            loadBatchTrajectory();
        } else {
            loadRevalData();
        }
    }, [viewTab, semester, loadSemesterData, loadBatchTrajectory, loadRevalData]);

    // Filtered lists
    const filteredSemesterStudents = useMemo(() => {
        const base = (semData.students || []).filter(s => {
            const isP = s.isPassed ?? (s.hasData && s.arrearsCount === 0);
            if (statusFilter === 'passed' && !isP) return false;
            if (statusFilter === 'failed' && isP) return false;
            return true;
        });
        return filterAndRankStudents(base, searchQuery);
    }, [semData.students, statusFilter, searchQuery]);

    const filteredBatchStudents = useMemo(() => {
        return filterAndRankStudents(batchData.students || [], searchQuery);
    }, [batchData.students, searchQuery]);

    const filteredRevalRoster = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return (revalData.deltaRoster || []).filter(item => {
            const matchSearch = !query ||
                matchesStudent(item, query) ||
                item.subject_code?.toLowerCase().includes(query) ||
                item.subject_name?.toLowerCase().includes(query);

            const matchOutcome = outcomeFilter === 'ALL' || item.outcome === outcomeFilter;
            return matchSearch && matchOutcome;
        });
    }, [revalData.deltaRoster, searchQuery, outcomeFilter]);

    // ── Manual Refresh ──
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshBanner, setRefreshBanner] = useState(null);
    const handleRefresh = async () => {
        setIsRefreshing(true);
        clearApiCache();
        try {
            let discoveredNewSem = false;
            let newlyFoundSems = [];

            const prevStudentCount = viewTab === 'semester'
                ? (semData.students || []).length
                : viewTab === 'batch'
                    ? (batchData.students || []).length
                    : (revalData.deltaRoster || []).length;

            // Execute metadata check and data fetch in parallel for instant, zero-delay refresh
            const metaPromise = apiRequest('/api/faculty/analytics/meta', { query: { fresh: '1' } })
                .catch(err => { console.warn('Metadata refresh notice:', err); return null; });

            const dataPromise = viewTab === 'semester'
                ? loadSemesterData(true, true)
                : viewTab === 'batch'
                    ? loadBatchTrajectory(true, true)
                    : loadRevalData(true, true);

            const [freshMeta, res] = await Promise.all([metaPromise, dataPromise]);

            if (freshMeta) {
                const prevSems = new Set(meta?.semesters || []);
                newlyFoundSems = (freshMeta.semesters || []).filter(s => !prevSems.has(s));
                if (newlyFoundSems.length > 0) discoveredNewSem = true;
                setMeta(freshMeta);
            }

            const newStudentCount = viewTab === 'semester'
                ? (res?.students || []).length
                : viewTab === 'batch'
                    ? (res?.students || []).length
                    : (res?.deltaRoster || []).length;

            const diff = newStudentCount - prevStudentCount;
            if (diff > 0 || discoveredNewSem) {
                const parts = [];
                if (diff > 0) parts.push(`+${diff} students`);
                if (discoveredNewSem) parts.push(`New semester(s): Sem ${newlyFoundSems.join(', ')} added`);
                setRefreshBanner({
                    type: 'new',
                    text: `✓ New examination data detected: ${parts.join(' · ')} synced dynamically!`
                });
            } else {
                setRefreshBanner({
                    type: 'current',
                    text: `✓ Live sync verified: All ${newStudentCount} records are current and up to date.`
                });
            }
            setTimeout(() => setRefreshBanner(null), 5000);
        } finally {
            setIsRefreshing(false);
        }
    };

    // The batch report has shipped this count under two names; read both.
    const backlogsOf = (row) => row?.backlogsCount ?? row?.totalBacklogs ?? 0;

    // One place that turns a gazette row's class code into its full VTU award name.
    const awardClassOf = (row) => row?.awardClass || ({
        FCD: 'First Class Distinction',
        FC: 'First Class',
        SC: 'Second Class',
        P: 'Pass Class',
        F: 'Fail'
    }[row?.vtuClass] || '—');

    // ── Excel Export ──
    // Goes through lib/workbook-export.js so the file is written with an explicit
    // bookType and the real OOXML MIME type — see that module for why "Export Excel"
    // used to open as mojibake.
    const handleExportExcel = async () => {
        try {
            if (viewTab === 'semester') {
                if (filteredSemesterStudents.length === 0) {
                    alert('No semester gazette records available to export.');
                    return;
                }
                const summary = semData?.summary || {};
                await downloadWorkbook([{
                    name: `Sem ${semester} Gazette`,
                    preamble: [
                        [`Semester ${semester} Academic Gazette — ${branch} · Batch ${batch}`],
                        [`Appeared: ${summary.totalAppeared ?? filteredSemesterStudents.length}   Passed: ${summary.totalPassed ?? 0}   Failed: ${summary.totalFailed ?? 0}   Pass rate: ${fmtNum(summary.passPercentage, 1, '0')}%`],
                        [`Section: ${section === 'ALL' ? 'All sections' : section}   Generated: ${new Date().toLocaleString()}`],
                        []
                    ],
                    headers: ['USN', 'Student Name', 'Branch', 'Section', 'Entry', 'Total Marks', 'SGPA', 'Result', 'Award Class', 'Backlogs'],
                    numberFormats: { SGPA: '0.00' },
                    rows: filteredSemesterStudents.map(s => [
                        s.usn,
                        s.name,
                        s.branch || '—',
                        s.section && s.section !== '—' ? s.section : '',
                        s.isLE ? 'Lateral (Diploma)' : 'Regular',
                        s.totalMarks ?? s.totalScoreSum ?? 0,
                        Number.isFinite(s.sgpa) ? s.sgpa : null,
                        (s.isPassed ?? (s.hasData && s.arrearsCount === 0)) ? 'PASS' : (s.hasData === false ? 'NOT APPEARED' : 'FAIL'),
                        awardClassOf(s),
                        s.backlogCount ?? s.arrearsCount ?? 0
                    ])
                }], `Semester_${semester}_Gazette_${branch}_${batch}`);
            } else if (viewTab === 'batch') {
                if (filteredBatchStudents.length === 0) {
                    alert('No batch trajectory records available to export.');
                    return;
                }
                const semesterHeaders = Array.from({ length: upToSemester }, (_, i) => `S${i + 1} SGPA`);
                await downloadWorkbook([{
                    name: 'Batch Trajectory',
                    preamble: [
                        [`Cumulative Batch Progression — ${branch} · Batch ${batch}`],
                        [`Students: ${filteredBatchStudents.length}   Semesters tracked: 1–${upToSemester}   Generated: ${new Date().toLocaleString()}`],
                        []
                    ],
                    headers: ['USN', 'Student Name', 'Branch', 'Section', 'Entry', 'CGPA', 'Active Backlogs', ...semesterHeaders],
                    numberFormats: Object.fromEntries([['CGPA', '0.00'], ...semesterHeaders.map(h => [h, '0.00'])]),
                    rows: filteredBatchStudents.map(s => [
                        s.usn,
                        s.name,
                        s.branch,
                        s.section && s.section !== '—' ? s.section : '',
                        s.isLE ? 'Lateral (Diploma)' : 'Regular',
                        Number.isFinite(s.cgpa) ? s.cgpa : null,
                        s.backlogsCount ?? s.totalBacklogs ?? 0,
                        ...Array.from({ length: upToSemester }, (_, i) => {
                            const sem = s.semesters?.[i + 1];
                            // A lateral entrant never sat semesters 1-2 — say so
                            // rather than leaving a blank that reads as missing data.
                            if (sem?.notApplicable) return 'N/A (Diploma)';
                            return Number.isFinite(sem?.sgpa) ? sem.sgpa : null;
                        })
                    ])
                }], `Batch_${batch}_Trajectory_${branch}_upto_Sem${upToSemester}`);
            } else {
                if (filteredRevalRoster.length === 0) {
                    alert('No revaluation records available to export.');
                    return;
                }
                await downloadWorkbook([{
                    name: 'Revaluation Delta',
                    preamble: [
                        [`Revaluation Impact & Delta Audit — ${branch} · Semester ${semester}`],
                        [`Applications evaluated: ${filteredRevalRoster.length}   Generated: ${new Date().toLocaleString()}`],
                        []
                    ],
                    headers: ['USN', 'Name', 'Subject Code', 'Subject', 'Original SEE', 'Reval SEE', 'Delta', 'Outcome'],
                    rows: filteredRevalRoster.map(r => {
                        const deltaVal = r.deltaMarks ?? r.delta;
                        return [
                            r.usn,
                            r.name,
                            r.subject_code,
                            r.subject_name || '',
                            r.originalExternal ?? r.preMarks ?? null,
                            r.revalExternal ?? r.postMarks ?? null,
                            Number.isFinite(deltaVal) ? deltaVal : null,
                            r.outcome || 'No Change'
                        ];
                    })
                }], `Revaluation_Delta_${branch}_Sem${semester}`);
            }
        } catch (err) {
            console.error('Export Excel error:', err);
            alert('Failed to export Excel: ' + (err.message || 'Unknown error'));
        }
    };

    // ── PDF Export ──
    const handleExportPDF = async () => {
        try {
            const { jsPDF, autoTable } = await getJsPDF();
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            if (viewTab === 'semester') {
                if (filteredSemesterStudents.length === 0) {
                    alert('No semester gazette records available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`Semester ${semester} Academic Gazette - ${branch} (${batch})`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                const appeared = semData?.summary?.totalAppeared ?? filteredSemesterStudents.length;
                const passed = semData?.summary?.totalPassed ?? 0;
                const passRate = fmtPercent(semData?.summary?.passPercentage);
                doc.text(`Appeared: ${appeared} | Passed: ${passed} | Pass Rate: ${passRate} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['USN', 'Student Name', 'Marks', 'SGPA', 'Result', 'Award Class', 'Backlogs']];
                const tableBody = filteredSemesterStudents.map(s => [
                    s.usn,
                    s.name,
                    s.totalMarks ?? s.totalScoreSum ?? 0,
                    fmtNum(s.sgpa),
                    (s.isPassed ?? (s.hasData && s.arrearsCount === 0)) ? 'PASS' : (s.hasData === false ? 'NOT APPEARED' : 'FAIL'),
                    awardClassOf(s),
                    s.backlogCount ?? s.arrearsCount ?? 0
                ]);

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                // "6th Sem Result Sheet - CS 2023.pdf" — the semester leads, the way
                // faculty actually file these.
                doc.save(resultFileName({ semester, usn: `${branch} ${batch}`, suffix: 'Result Sheet' }));
            } else if (viewTab === 'batch') {
                if (filteredBatchStudents.length === 0) {
                    alert('No batch trajectory records available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`Cumulative Batch Progression Report - ${branch} (${batch})`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(`Total Students: ${filteredBatchStudents.length} | Tracked Semesters: 1..${upToSemester} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['USN', 'Student Name', 'Entry', 'CGPA', 'Backlogs', ...Array.from({ length: upToSemester }, (_, i) => `S${i + 1}`)]];
                const tableBody = filteredBatchStudents.map(s => [
                    s.usn,
                    s.name,
                    s.isLE ? 'Lateral' : 'Regular',
                    fmtNum(s.cgpa),
                    s.backlogsCount ?? s.totalBacklogs ?? 0,
                    ...Array.from({ length: upToSemester }, (_, i) => {
                        const sem = s.semesters?.[i + 1];
                        if (sem?.notApplicable) return 'N/A';
                        return fmtNum(sem?.sgpa);
                    })
                ]);

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                doc.save(resultFileName({ semester: upToSemester, usn: `${branch} Batch ${batch}`, suffix: 'Cumulative Result' }));
            } else {
                if (filteredRevalRoster.length === 0) {
                    alert('No revaluation records available to download.');
                    return;
                }
                doc.setFontSize(14);
                doc.setFont('helvetica', 'bold');
                doc.text(`Revaluation Impact & Delta Audit - ${branch} (Sem ${semester})`, 14, 15);

                doc.setFontSize(9);
                doc.setFont('helvetica', 'normal');
                doc.text(`Evaluated Applications: ${filteredRevalRoster.length} | Date: ${new Date().toLocaleDateString()}`, 14, 21);

                const tableHead = [['USN', 'Name', 'Subject', 'Original SEE', 'Reval SEE', 'Delta', 'Outcome']];
                const tableBody = filteredRevalRoster.map(r => {
                    const deltaVal = r.deltaMarks ?? r.delta;
                    return [
                        r.usn,
                        r.name,
                        r.subject_code,
                        r.originalExternal !== null && r.originalExternal !== undefined ? String(r.originalExternal) : (r.preMarks !== null && r.preMarks !== undefined ? String(r.preMarks) : '—'),
                        r.revalExternal !== null && r.revalExternal !== undefined ? String(r.revalExternal) : (r.postMarks !== null && r.postMarks !== undefined ? String(r.postMarks) : '—'),
                        deltaVal !== null && deltaVal !== undefined ? (deltaVal > 0 ? `+${deltaVal}` : String(deltaVal)) : '—',
                        r.outcome || 'No Change'
                    ];
                });

                autoTable(doc, {
                    head: tableHead,
                    body: tableBody,
                    startY: 25,
                    theme: 'striped',
                    styles: { fontSize: 8, cellPadding: 2 },
                    headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
                });

                doc.save(resultFileName({ semester: semester === 'ALL' ? null : semester, usn: branch, suffix: 'Revaluation Delta' }));
            }
        } catch (err) {
            console.error('Export PDF error:', err);
            alert('Failed to generate PDF: ' + (err.message || 'Unknown error'));
        }
    };

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institutional Examination Services</PageHeaderEyebrow>
                    <PageHeaderTitle>Exam &amp; Result Sheets Hub</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Unified exam-cycle operations: Single-semester gazette, cumulative multi-semester trajectories, and revaluation impact.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <Button onClick={handleRefresh} variant="secondary" disabled={isRefreshing || semLoading || batchLoading || revalLoading}>
                        <span className={`material-icons-round ${isRefreshing ? 'gf-spin' : ''}`} style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                    </Button>
                    <Button onClick={handleExportExcel} variant="secondary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>table_view</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="primary">
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Download PDF
                    </Button>
                </div>
            </div>

            {/* Dynamic Sync Banner */}
            {refreshBanner && (
                <div
                    style={{
                        padding: '10px 16px',
                        borderRadius: '10px',
                        background: refreshBanner.type === 'new' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-low)',
                        color: refreshBanner.type === 'new' ? 'var(--green)' : 'var(--tx-main)',
                        border: `1px solid ${refreshBanner.type === 'new' ? 'var(--green)' : 'var(--border)'}`,
                        fontSize: '12px',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '18px'
                    }}
                    className="gf-fade-in"
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>
                        {refreshBanner.type === 'new' ? 'auto_awesome' : 'check_circle'}
                    </span>
                    {refreshBanner.text}
                </div>
            )}

            {/* Load failure — named, with a way out. */}
            {loadError && (
                <div
                    role="alert"
                    style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '14px 16px',
                        borderRadius: '10px',
                        background: 'rgba(220, 38, 38, 0.08)',
                        border: '1px solid rgba(220, 38, 38, 0.35)',
                        marginBottom: '18px'
                    }}
                >
                    <span className="material-icons-round" aria-hidden="true" style={{ fontSize: '20px', color: '#DC2626' }}>error_outline</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 800, color: '#DC2626' }}>
                            Could not load the {loadError.scope}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '3px' }}>
                            {loadError.message} — the table below is empty because the request failed, not because this cohort has no results.
                        </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={handleRefresh} disabled={isRefreshing}>Retry</Button>
                </div>
            )}

            {/* Mode Switcher Tabs */}
            <div style={{
                display: 'flex',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: '12px',
                padding: '4px',
                gap: '4px',
                marginBottom: '20px',
                width: 'fit-content',
                maxWidth: '100%',
                flexWrap: 'wrap'
            }}>
                <button
                    type="button"
                    onClick={() => setViewTab('semester')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'semester' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'semester' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>table_chart</span>
                    Semester Analysis Gazette
                </button>
                <button
                    type="button"
                    onClick={() => setViewTab('batch')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'batch' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'batch' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>view_timeline</span>
                    Multi-Semester Batch Trajectory
                </button>
                <button
                    type="button"
                    onClick={() => setViewTab('reval')}
                    style={{
                        padding: '10px 18px',
                        borderRadius: '9px',
                        border: 'none',
                        background: viewTab === 'reval' ? 'var(--primary)' : 'transparent',
                        color: viewTab === 'reval' ? '#FFFFFF' : 'var(--tx-muted)',
                        fontWeight: 700,
                        fontSize: '13px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        transition: 'all 0.15s ease'
                    }}
                >
                    <span className="material-icons-round" style={{ fontSize: '18px' }}>published_with_changes</span>
                    Revaluation Impact Delta
                </button>
            </div>

            {/* Scope Filter Card */}
            <Card style={{ marginBottom: '24px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                        <Select
                            label="Branch / Department"
                            value={branch}
                            onChange={e => setBranch(e.target.value)}
                            options={getCleanBranchOptions(meta.branches)}
                        />

                        <Select
                            label="Graduation Batch"
                            value={batch}
                            onChange={e => setBatch(e.target.value)}
                            options={[
                                { value: 'ALL', label: 'All Batches (All Cohorts)' },
                                ...(meta.batches || []).map(b => ({ value: b, label: `Batch ${b}` }))
                            ]}
                        />

                        {viewTab !== 'batch' ? (
                            <Select
                                label="Semester"
                                value={semester}
                                onChange={e => setSemester(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
                                options={viewTab === 'reval' ? [
                                    { value: 'ALL', label: 'All Semesters (Cumulative Course)' },
                                    ...(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ value: s, label: `Semester ${s}` }))
                                ] : (meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ value: s, label: `Semester ${s}` }))}
                            />
                        ) : (
                            <Select
                                label="Progress Up To"
                                value={upToSemester}
                                onChange={e => setUpToSemester(Number(e.target.value))}
                                options={(meta.semesters || [1, 2, 3, 4, 5, 6, 7, 8]).map(s => ({ value: s, label: `Up to Semester ${s}` }))}
                            />
                        )}

                        <Select
                            label={availableSections.length === 0 ? "Section (None Created)" : "Section"}
                            value={section}
                            disabled={availableSections.length === 0}
                            onChange={e => setSection(e.target.value)}
                            options={sectionOptions}
                        />

                        {viewTab === 'reval' && (
                            <Select
                                label="Outcome Filter"
                                value={outcomeFilter}
                                onChange={e => setOutcomeFilter(e.target.value)}
                                options={[
                                    { value: 'ALL', label: 'All Outcomes' },
                                    { value: 'Cleared Backlog', label: 'Cleared Backlog' },
                                    { value: 'Grade Upgraded', label: 'Grade Upgraded' },
                                    { value: 'Confirmed', label: 'Confirmed (No Change)' },
                                    { value: 'Marks Decreased', label: 'Marks Decreased' },
                                ]}
                            />
                        )}

                        <Input
                            label="Search Roster"
                            placeholder="Find USN or Name..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* TAB 1: SEMESTER ANALYSIS GAZETTE */}
            {viewTab === 'semester' && (
                <>
                    {/* Summary Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Total Appeared</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{semData.summary.totalAppeared}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Students with marks</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Semester Pass Rate</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: semData.summary.passPercentage >= 70 ? '#16A34A' : '#DC2626' }}>
                                    {fmtPercent(semData.summary?.passPercentage, 1, '0.0%')}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>{semData.summary.totalPassed} passed, {semData.summary.totalFailed} failed</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>First Class Distinction</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{semData.summary.classCounts?.FCD || 0}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>FCD honors tier</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Active Backlogs</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626' }}>{semData.backlogRoster?.length || 0}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Students requiring re-exam</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Table View */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Semester {semester} Student Gazette ({filteredSemesterStudents.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Total Marks</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>SGPA</th>
                                            <th style={{ padding: '12px 16px' }}>Result</th>
                                            <th style={{ padding: '12px 16px' }}>Standing Class</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {semLoading ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading semester records...</td>
                                            </tr>
                                        ) : filteredSemesterStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No student records found.</td>
                                            </tr>
                                        ) : (
                                            filteredSemesterStudents.map(s => (
                                                <tr key={s.usn} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                        {s.usn}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span>{s.name}</span>
                                                            {s.isLE && <DiplomaTag />}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 500, marginTop: '2px' }}>
                                                            {s.branch || (s.usn.length >= 7 ? s.usn.substring(5, 7).toUpperCase() : '—')}{s.section && s.section !== '—' ? ` • Sec ${s.section}` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                        {s.totalMarks !== undefined && s.totalMarks !== null ? s.totalMarks : (s.totalScoreSum ?? '—')}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: 'var(--primary)' }}>
                                                        {typeof s.sgpa === 'number' ? s.sgpa.toFixed(2) : (s.sgpa ?? '—')}
                                                    </td>
                                                    <td style={{ padding: '14px 16px' }}>
                                                        {s.hasData !== false ? (
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                background: (s.isPassed ?? (s.arrearsCount === 0)) ? 'rgba(34, 197, 94, 0.12)' : 'rgba(220, 38, 38, 0.12)',
                                                                color: (s.isPassed ?? (s.arrearsCount === 0)) ? '#16A34A' : '#DC2626'
                                                            }}>
                                                                {(s.isPassed ?? (s.arrearsCount === 0)) ? 'PASSED' : 'FAILED'}
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '11px',
                                                                fontWeight: 700,
                                                                background: 'var(--surface-low)',
                                                                color: 'var(--tx-muted)'
                                                            }}>
                                                                NOT APPEARED
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', color: 'var(--tx-muted)', fontSize: '12px' }}>
                                                        {awardClassOf(s)}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                        <Link href={`/faculty/students/${s.usn}`} style={{ textDecoration: 'none' }}>
                                                            <Button size="sm" variant="ghost">Report</Button>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* TAB 2: MULTI-SEMESTER BATCH TRAJECTORY */}
            {viewTab === 'batch' && (
                <>
                    {/* Summary Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Cohort Size</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{batchData.summary.totalStudents}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>
                                    Tracked students{batchData.summary?.lateralCount > 0 ? ` · ${batchData.summary.lateralCount} lateral (diploma)` : ''}
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Mean Batch CGPA</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{fmtNum(batchData.summary?.avgCGPA, 2, '—')}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Cumulative grade index</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>With Active Backlogs</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#DC2626' }}>{batchData.summary.withBacklogs}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Students with arrears</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Distinction Students</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>{batchData.summary.distinctionCount}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>CGPA &ge; {fmtNum(batchData.summary?.distinctionThreshold, 2, '7.75')}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Table View */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Multi-Semester Progression Ledger ({filteredBatchStudents.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>CGPA</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Backlogs</th>
                                            {Array.from({ length: upToSemester }, (_, i) => (
                                                <th key={i} style={{ padding: '12px 16px', textAlign: 'center' }}>Sem {i + 1}</th>
                                            ))}
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batchLoading ? (
                                            <tr>
                                                <td colSpan={5 + upToSemester} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading batch records...</td>
                                            </tr>
                                        ) : filteredBatchStudents.length === 0 ? (
                                            <tr>
                                                <td colSpan={5 + upToSemester} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No students match the criteria.</td>
                                            </tr>
                                        ) : (
                                            filteredBatchStudents.map(s => (
                                                <tr key={s.usn} style={{ borderBottom: '1px solid var(--border)' }}>
                                                    <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                        {s.usn}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                            <span>{s.name}</span>
                                                            {s.isLE && <DiplomaTag />}
                                                        </div>
                                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 500, marginTop: '2px' }}>
                                                            {s.branch || (s.usn.length >= 7 ? s.usn.substring(5, 7).toUpperCase() : '—')}{s.section && s.section !== '—' ? ` • Sec ${s.section}` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: s.cgpa === null ? 'var(--tx-dim)' : 'var(--primary)' }}>
                                                        {fmtNum(s.cgpa)}
                                                    </td>
                                                    <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: backlogsOf(s) > 0 ? '#DC2626' : '#16A34A' }}>
                                                        {backlogsOf(s)}
                                                    </td>
                                                    {Array.from({ length: upToSemester }, (_, i) => {
                                                        const sem = s.semesters?.[i + 1];
                                                        // Semesters 1-2 do not exist for a diploma/lateral entrant. A dash
                                                        // there reads as "not scraped yet"; N/A is what is actually true.
                                                        if (sem?.notApplicable) {
                                                            return (
                                                                <td key={i} style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-dim)', fontSize: '11px', fontWeight: 700 }} title="Lateral (diploma) entry - semesters 1 and 2 are not part of this programme">
                                                                    N/A
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td key={i} style={{ padding: '14px 16px', textAlign: 'center', color: sem?.sgpa ? 'var(--tx-main)' : 'var(--tx-dim)' }}>
                                                                {fmtGpa(sem?.sgpa)}
                                                            </td>
                                                        );
                                                    })}
                                                    <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                        <Link href={`/faculty/students/${s.usn}`} style={{ textDecoration: 'none' }}>
                                                            <Button size="sm" variant="ghost">Transcript</Button>
                                                        </Link>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}

            {/* TAB 3: REVALUATION IMPACT DELTA */}
            {viewTab === 'reval' && (
                <>
                    {/* Summary Metrics */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', marginBottom: '24px' }}>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Reval Applications</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)' }}>{revalData.summary.totalApplications}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Total challenge evaluations</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Marks Upgraded</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>{revalData.summary.upgradedCount}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Benefited from reval</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Backlogs Cleared</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: 'var(--primary)' }}>{revalData.summary.clearedCount}</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Converted from Fail &rarr; Pass</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent style={{ padding: '20px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>Net Pass Rate Gain</div>
                                <div style={{ fontSize: '28px', fontWeight: 900, color: '#16A34A' }}>+{fmtNum(revalData.summary?.netPassRateGain, 1, '0.0')}%</div>
                                <div style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '4px' }}>Post-revaluation lift</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Table View */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Revaluation Delta Roster ({filteredRevalRoster.length})</CardTitle>
                        </CardHeader>
                        <CardContent style={{ padding: 0 }}>
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)', color: 'var(--tx-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em' }}>
                                            <th style={{ padding: '12px 16px' }}>USN</th>
                                            <th style={{ padding: '12px 16px' }}>Student Name</th>
                                            <th style={{ padding: '12px 16px' }}>Subject</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Original SEE</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Reval SEE</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'center' }}>Delta</th>
                                            <th style={{ padding: '12px 16px' }}>Outcome</th>
                                            <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {revalLoading ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading reval delta records...</td>
                                            </tr>
                                        ) : filteredRevalRoster.length === 0 ? (
                                            <tr>
                                                <td colSpan={8} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>No revaluation records match criteria.</td>
                                            </tr>
                                        ) : (
                                            filteredRevalRoster.map((r, idx) => {
                                                const deltaVal = r.deltaMarks !== null && r.deltaMarks !== undefined ? r.deltaMarks : (r.delta !== null && r.delta !== undefined ? r.delta : null);
                                                const isGain = typeof deltaVal === 'number' && deltaVal > 0;
                                                const isLoss = typeof deltaVal === 'number' && deltaVal < 0;
                                                const origVal = r.originalExternal !== null && r.originalExternal !== undefined ? r.originalExternal : (r.preMarks !== null && r.preMarks !== undefined ? r.preMarks : '—');
                                                const revalVal = r.revalExternal !== null && r.revalExternal !== undefined ? r.revalExternal : (r.postMarks !== null && r.postMarks !== undefined ? r.postMarks : '—');

                                                return (
                                                    <tr key={`${r.usn}-${r.subject_code}-${idx}`} style={{ borderBottom: '1px solid var(--border)' }}>
                                                        <td style={{ padding: '14px 16px', fontFamily: 'monospace', fontWeight: 800, color: 'var(--primary)' }}>
                                                            {r.usn}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--tx-main)' }}>
                                                            <div>{r.name}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 500, marginTop: '2px' }}>
                                                                {r.branch || '—'}{r.section && r.section !== '—' ? ` • Sec ${r.section}` : ''}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', fontFamily: 'monospace' }}>
                                                            {r.subject_code}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', color: 'var(--tx-muted)', fontWeight: 600 }}>
                                                            {origVal}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 800, color: 'var(--tx-main)' }}>
                                                            {revalVal}
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'center', fontWeight: 900, color: isGain ? '#16A34A' : (isLoss ? '#DC2626' : 'var(--tx-dim)') }}>
                                                            {deltaVal !== null && deltaVal !== undefined ? (isGain ? `+${deltaVal}` : deltaVal) : '—'}
                                                        </td>
                                                        <td style={{ padding: '14px 16px' }}>
                                                            <span style={{
                                                                padding: '4px 10px',
                                                                borderRadius: '20px',
                                                                fontSize: '11px',
                                                                fontWeight: 800,
                                                                background: (r.outcome === 'Cleared Backlog' || r.outcome === 'UPGRADED_PASS')
                                                                    ? 'rgba(34, 197, 94, 0.12)'
                                                                    : (r.outcome === 'Grade Upgraded' || r.outcome === 'UPGRADED')
                                                                    ? 'rgba(59, 130, 246, 0.12)'
                                                                    : (r.outcome === 'Marks Decreased' || r.outcome === 'DECREASED')
                                                                    ? 'rgba(239, 68, 68, 0.12)'
                                                                    : (r.outcome === 'Awaiting Original Mark')
                                                                    ? 'rgba(245, 158, 11, 0.12)'
                                                                    : 'var(--surface-low)',
                                                                color: (r.outcome === 'Cleared Backlog' || r.outcome === 'UPGRADED_PASS')
                                                                    ? '#16A34A'
                                                                    : (r.outcome === 'Grade Upgraded' || r.outcome === 'UPGRADED')
                                                                    ? '#2563EB'
                                                                    : (r.outcome === 'Marks Decreased' || r.outcome === 'DECREASED')
                                                                    ? '#DC2626'
                                                                    : (r.outcome === 'Awaiting Original Mark')
                                                                    ? '#D97706'
                                                                    : 'var(--tx-muted)'
                                                            }}>
                                                                {r.outcome}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                                                            <Link href={`/faculty/students/${r.usn}`} style={{ textDecoration: 'none' }}>
                                                                <Button size="sm" variant="ghost">Audit</Button>
                                                            </Link>
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
