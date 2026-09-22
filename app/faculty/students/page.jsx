'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest, clearApiCache } from '@/lib/api/client';
import { getJsPDF } from '@/lib/lazy-export-libs';
import { downloadWorkbook } from '@/lib/workbook-export';
import { fmtNum } from '@/lib/format';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';
import { EntryTag } from '@/components/ui/EntryTag';
import { HighlightMatch } from '@/components/ui/HighlightMatch';
import styles from './StudentsDirectory.module.css';

export default function FacultyStudentsDirectoryPage() {
    return (
        <AuthGuard role="faculty">
            <Suspense fallback={null}>
                <StudentsDirectoryContent />
            </Suspense>
        </AuthGuard>
    );
}

const EMPTY_FACETS = {
    branches: [],
    batches: [],
    classes: [],
    semesters: [],
    sections: [],
    statuses: [],
    entries: [],
    total: 0
};



/**
 * Builds a dropdown's options from the live facet counts.
 *
 * Nothing here is hardcoded: an option exists only when the database actually
 * holds students behind it, given every OTHER filter currently applied. The one
 * exception is the value already selected — it stays in the list (annotated with
 * its real count, including 0) so the control never silently jumps to a different
 * cohort underneath the user.
 */
function facetOptions(facets, selected, { allValue, allLabel, customCount }) {
    const total = customCount !== undefined ? customCount : facets.reduce((sum, f) => sum + f.count, 0);
    const options = [{ value: allValue, label: `${allLabel} (${total})` }];

    let selectedSeen = false;
    facets.forEach(f => {
        if (String(f.value) === String(selected)) selectedSeen = true;
        options.push({ value: f.value, label: `${f.label} · ${f.count}` });
    });

    const hasSelection = selected !== allValue && selected !== '' && selected !== null && selected !== undefined;
    if (hasSelection && !selectedSeen) {
        options.push({ value: selected, label: `${selected} · 0` });
    }

    return options;
}

const activeBadgeStyle = {
    fontSize: '9px',
    fontWeight: 900,
    background: 'var(--primary, #174B4D)',
    color: '#FFFFFF',
    padding: '1.5px 6px',
    borderRadius: '4px',
    letterSpacing: '0.04em',
    boxShadow: '0 1px 3px rgba(23, 75, 77, 0.25)',
    display: 'inline-flex',
    alignItems: 'center'
};

const getActiveSelectStyle = (isActive) => ({
    borderColor: isActive ? 'var(--primary, #174B4D)' : 'var(--border)',
    background: isActive ? 'var(--surface-low, #FDF6ED)' : 'var(--surface, #FFFFFF)',
    fontWeight: isActive ? 800 : 500,
    color: isActive ? 'var(--primary, #174B4D)' : 'var(--tx-main)',
    boxShadow: isActive ? '0 0 0 1.5px var(--primary, #174B4D), 0 2px 5px rgba(23, 75, 77, 0.08)' : 'none',
    borderRadius: '8px',
    transition: 'all 0.15s ease'
});

function StudentsDirectoryContent() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [branch, setBranch] = useState('');
    const [semester, setSemester] = useState('all');
    const [semesterMode, setSemesterMode] = useState('records');
    const [batch, setBatch] = useState('');
    const [section, setSection] = useState('all');
    const [classId, setClassId] = useState('');
    const [status, setStatus] = useState('all');
    const [entry, setEntry] = useState('all');
    const [backlogsFilter, setBacklogsFilter] = useState('all');
    const [filtersOpen, setFiltersOpen] = useState(false);
    // Search states (immediate input vs debounced search term)
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [isDebouncing, setIsDebouncing] = useState(false);

    const [page, setPage] = useState(1);
    const [jumpPageInput, setJumpPageInput] = useState('');
    const [limit, setLimit] = useState(25);
    const [sortBy, setSortBy] = useState('batch');
    const [sortOrder, setSortOrder] = useState('desc');

    // Request tracking to eliminate race conditions
    const activeRequestIdRef = useRef(0);
    const abortControllerRef = useRef(null);

    // Data
    const [students, setStudents] = useState([]);
    const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
    const [facets, setFacets] = useState(EMPTY_FACETS);
    const [blockingFilters, setBlockingFilters] = useState([]);
    const [directoryTotal, setDirectoryTotal] = useState(0);

    const [meta, setMeta] = useState(null);

    // Deep links from Data Health ("23 batch / CS" chips) land here pre-filtered.
    const searchParams = useSearchParams();
    const appliedDeepLink = useRef(false);

    useEffect(() => {
        if (appliedDeepLink.current || !searchParams) return;
        appliedDeepLink.current = true;
        const b = searchParams.get('batch');
        const br = searchParams.get('branch');
        const sem = searchParams.get('semester');
        const sec = searchParams.get('section');
        const ent = searchParams.get('entry');
        const cid = searchParams.get('classId') || searchParams.get('class_id');
        if (b) setBatch(b);
        if (br) setBranch(br.toUpperCase());
        if (sem) setSemester(sem);
        if (sec) setSection(sec.toUpperCase());
        if (ent) setEntry(ent);
        if (cid) setClassId(cid);
    }, [searchParams]);

    // Debounce search input by 300ms
    useEffect(() => {
        const trimmed = searchInput.trim();
        if (trimmed === search) {
            setIsDebouncing(false);
            return;
        }

        setIsDebouncing(true);
        const timer = setTimeout(() => {
            setSearch(trimmed);
            setPage(1);
            setIsDebouncing(false);
        }, 300);

        return () => clearTimeout(timer);
    }, [searchInput, search]);

    const triggerSearchImmediately = (val) => {
        const trimmed = (val !== undefined ? val : searchInput).trim();
        setSearch(trimmed);
        setPage(1);
        setIsDebouncing(false);
    };

    const handleClearSearch = () => {
        setSearchInput('');
        setSearch('');
        setPage(1);
        setIsDebouncing(false);
    };

    // Primary data-loader. Holds an AbortController so typing fast or rapidly
    // flipping filters immediately cancels the previous in-flight request rather
    // than having it race the new one and clobber the table with stale rows.
    const loadStudents = useCallback(async (fresh = false, silent = false) => {
        if (abortControllerRef.current) abortControllerRef.current.abort();
        const controller = new AbortController();
        abortControllerRef.current = controller;

        const id = ++activeRequestIdRef.current;
        if (!silent) setLoading(true);
        setError(null);
        try {
            // lib/api/client.js's buildUrl() drops any query value that is the
            // literal string 'all', so sending limit:'all' silently fell back to the
            // server's default of 25 and the "All (627)" page size returned one page.
            // The route accepts -1 for the same meaning and it survives the filter.
            const query = { page: limit === 'all' ? 1 : page, limit: limit === 'all' ? -1 : limit, sortBy, sortOrder };
            if (fresh) query.fresh = '1';
            if (branch) query.branch = branch;
            if (semester !== 'all') {
                query.semester = semester;
                query.semesterMode = semesterMode;
            }
            if (batch) query.batch = batch;
            if (section !== 'all') query.section = section;
            if (classId) query.classId = classId;
            if (status !== 'all') query.status = status;
            if (entry !== 'all') query.entry = entry;
            if (backlogsFilter !== 'all') query.backlogsFilter = backlogsFilter;
            if (search) query.search = search;

            const res = await apiRequest('/api/faculty/students', {
                query,
                signal: controller.signal
            });
            if (id !== activeRequestIdRef.current) return null;

            setStudents(res?.students || []);
            setPagination(res?.pagination || { total: 0, page: 1, limit, totalPages: 1 });
            setFacets(res?.facets || EMPTY_FACETS);
            setBlockingFilters(res?.blockingFilters || []);
            setDirectoryTotal(res?.meta?.totalStudents || 0);

            return res;
        } catch (err) {
            if (err?.name === 'AbortError' || controller.signal.aborted) return null;
            if (id !== activeRequestIdRef.current) return null;
            console.error('Failed to load students:', err);
            setError(err?.message || 'Failed to load the students directory.');
            setStudents([]);
            setPagination({ total: 0, page: 1, limit, totalPages: 1 });
            return null;
        } finally {
            if (id === activeRequestIdRef.current && !silent) setLoading(false);
        }
    }, [page, limit, sortBy, sortOrder, branch, semester, semesterMode, batch, section, classId, status, entry, backlogsFilter, search]);

    const [isRefreshing, setIsRefreshing] = useState(false);
    const [refreshBanner, setRefreshBanner] = useState(null);
    const handleRefresh = async () => {
        setIsRefreshing(true);
        clearApiCache();
        try {
            const prevTotal = pagination.total || students.length;

            const metaPromise = apiRequest('/api/faculty/analytics/meta', { query: { fresh: '1', t: Date.now() } })
                .catch(e => { console.warn('Metadata refresh note:', e); return null; });
            const dataPromise = loadStudents(true);

            const [freshMeta, res] = await Promise.all([metaPromise, dataPromise]);

            let newlyFoundBatches = [];
            if (freshMeta) {
                const prevBatches = new Set(meta?.batches || []);
                newlyFoundBatches = (freshMeta.batches || []).filter(b => !prevBatches.has(b));
                setMeta(freshMeta);
            }

            const newTotal = res?.pagination?.total ?? (res?.students?.length || prevTotal);
            const diff = newTotal - prevTotal;

            if (diff > 0 || newlyFoundBatches.length > 0) {
                const parts = [];
                if (diff > 0) parts.push(`+${diff} students`);
                if (newlyFoundBatches.length > 0) parts.push(`Batches [${newlyFoundBatches.join(', ')}] available`);
                setRefreshBanner({
                    type: 'new',
                    text: `✓ New student data detected: ${parts.join(' · ')} synced dynamically!`
                });
            } else {
                setRefreshBanner({
                    type: 'current',
                    text: `✓ Live directory verified: All ${newTotal} student records are up to date.`
                });
            }
            setTimeout(() => setRefreshBanner(null), 5000);
        } catch (e) {
            console.error('Refresh students error:', e);
        } finally {
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        loadStudents();
    }, [loadStudents]);

    const handleFilterChange = (setter, val) => {
        setter(val);
        setPage(1);
    };

    const clearFilter = useCallback((name) => {
        setPage(1);
        switch (name) {
            case 'branch': setBranch(''); break;
            case 'batch': setBatch(''); break;
            case 'semester': setSemester('all'); break;
            case 'section': setSection('all'); break;
            case 'classId': setClassId(''); break;
            case 'status': setStatus('all'); break;
            case 'entry': setEntry('all'); break;
            case 'backlogsFilter': setBacklogsFilter('all'); break;
            case 'search': setSearchInput(''); setSearch(''); break;
            default: break;
        }
    }, []);

    const resetAll = useCallback(() => {
        setBranch('');
        setSemester('all');
        setSemesterMode('records');
        setBatch('');
        setSection('all');
        setClassId('');
        setStatus('all');
        setEntry('all');
        setBacklogsFilter('all');
        setSearchInput('');
        setSearch('');
        setPage(1);
    }, []);

    // Chips describing exactly what is narrowing the table right now.
    const activeChips = useMemo(() => {
        const chips = [];
        const branchLabel = facets.branches.find(b => b.value === branch)?.label || branch;
        if (branch) chips.push({ name: 'branch', label: branchLabel });
        if (semester !== 'all') {
            chips.push({
                name: 'semester',
                label: `Semester ${semester} · ${semesterMode === 'current' ? 'currently in' : 'any records'}`
            });
        }
        if (batch) chips.push({ name: 'batch', label: `Batch ${batch}` });
        if (section !== 'all') chips.push({ name: 'section', label: section === 'UNASSIGNED' ? 'Unassigned section' : `Section ${section}` });
        if (classId) {
            const c = facets.classes?.find(cls => String(cls.value) === String(classId));
            chips.push({ name: 'classId', label: c ? `Class: ${c.label}` : 'Class' });
        }
        if (status !== 'all') chips.push({ name: 'status', label: status === 'active' ? 'Active only' : 'Inactive only' });
        if (entry !== 'all') chips.push({ name: 'entry', label: entry === 'lateral' ? 'Lateral entry only' : 'Regular intake only' });
        if (backlogsFilter !== 'all') chips.push({ name: 'backlogsFilter', label: backlogsFilter === 'clear' ? 'All clear' : 'Carrying backlogs' });
        if (search) chips.push({ name: 'search', label: `“${search}”` });
        return chips;
    }, [facets.branches, facets.classes, branch, semester, semesterMode, batch, section, classId, status, entry, backlogsFilter, search]);

    const semesterColumn = semester !== 'all' ? Number(semester) : null;
    const realSections = useMemo(() => (facets.sections || []).filter(s => s.value !== 'UNASSIGNED'), [facets.sections]);
    const statusCount = (value) => facets.statuses.find(s => s.value === value)?.count ?? 0;

    /**
     * Every student matching the current filters, not just the page on screen.
     * Exports used to silently ship one page, so "Export Excel" on a 627-student
     * directory produced 25 rows.
     */
    const fetchAllMatching = useCallback(async () => {
        if (limit === 'all') return students || [];
        try {
            const res = await apiRequest('/api/faculty/students', {
                query: {
                    page: 1,
                    limit: -1, // 'all' would be stripped by buildUrl(); -1 means the same thing to the route
                    sortBy,
                    sortOrder,
                    branch: branch || undefined,
                    semester: semester !== 'all' ? semester : undefined,
                    semesterMode,
                    batch: batch || undefined,
                    section: section !== 'all' ? section : undefined,
                    classId: classId || undefined,
                    status,
                    entry,
                    backlogsFilter,
                    search: search || undefined
                }
            });
            return res?.students?.length ? res.students : (students || []);
        } catch (err) {
            console.warn('Full-set export fetch failed, exporting the current page instead:', err);
            return students || [];
        }
    }, [limit, students, sortBy, sortOrder, branch, semester, semesterMode, batch, section, classId, status, entry, backlogsFilter, search]);

    // ── Excel Export ──
    // Written through lib/workbook-export.js: explicit bookType, real OOXML MIME,
    // numeric cells. Exports the whole filtered set, not just the visible page —
    // faculty asking for "the CS 2023 list" never meant "rows 26 to 50 of it".
    const [exportingExcel, setExportingExcel] = useState(false);
    const handleExportExcel = async () => {
        setExportingExcel(true);
        try {
            const headers = [
                '#', 'USN', 'Name', 'Department', 'Entry', 'Current Sem', 'Semesters On Record',
                'Section', 'Batch', 'Admission Batch', 'CGPA', 'Backlogs', 'Backlog Credits', 'Status'
            ];
            if (semesterColumn) headers.push(`Sem ${semesterColumn} SGPA`, `Sem ${semesterColumn} Backlogs`);

            const exportRows = await fetchAllMatching();
            const rows = exportRows.map((s, idx) => {
                const row = [
                    idx + 1,
                    s.usn,
                    s.name,
                    s.branchLabel || s.branch,
                    s.lateral_entry ? 'Lateral (Diploma)' : 'Regular',
                    s.semester,
                    (s.recordedSemesters || []).join(', '),
                    s.section || '',
                    s.batch || '',
                    s.admissionBatch || s.batch || '',
                    Number.isFinite(s.cgpa) ? s.cgpa : null,
                    s.total_backlogs ?? 0,
                    s.backlog_credits ?? 0,
                    s.is_inactive ? 'Inactive' : 'Active'
                ];
                if (semesterColumn) {
                    row.push(
                        Number.isFinite(s.semesterView?.sgpa) ? s.semesterView.sgpa : null,
                        s.semesterView?.backlogs ?? null
                    );
                }
                return row;
            });

            const filterLine = activeChips.length > 0 ? activeChips.map(c => c.label).join('  ·  ') : 'No filters applied';
            await downloadWorkbook([{
                name: 'Students',
                preamble: [
                    ['GradeFlow — Students Directory'],
                    [filterLine],
                    [`${rows.length} students   Generated: ${new Date().toLocaleString()}`],
                    []
                ],
                headers,
                numberFormats: Object.fromEntries([
                    ['CGPA', '0.00'],
                    ...(semesterColumn ? [[`Sem ${semesterColumn} SGPA`, '0.00']] : [])
                ]),
                rows
            }], `Students_Directory_${branch || 'All'}`);
        } catch (err) {
            console.error('Excel export error:', err);
            setError('Excel export failed: ' + (err.message || 'Unknown error'));
        } finally {
            setExportingExcel(false);
        }
    };

    // ── PDF Export ──
    const handleExportPDF = async () => {
        const { jsPDF, autoTable } = await getJsPDF();
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('GradeFlow - Students Directory', 14, 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        const filterLine = activeChips.length > 0 ? activeChips.map(c => c.label).join(' | ') : 'No filters applied';
        doc.text(`Total: ${pagination.total} Students | ${filterLine} | ${new Date().toLocaleDateString()}`, 14, 21);


        const head = [['#', 'USN', 'Student Name', 'Dept', 'Entry', 'Sem', 'Sec', 'CGPA', 'Backlog Status']];
        if (semesterColumn) head[0].push(`S${semesterColumn} SGPA`);

        const exportRows = await fetchAllMatching();
        const body = exportRows.map((s, idx) => {
            const row = [
                idx + 1,
                s.usn,
                s.name,
                s.branch,
                s.lateral_entry ? 'LE' : 'Reg',
                s.semester,
                s.section || '—',
                fmtNum(s.cgpa),
                s.total_backlogs > 0 ? `${s.total_backlogs} Sub (${s.backlog_credits} Cr)` : 'Clear'
            ];
            if (semesterColumn) {
                row.push(fmtNum(s.semesterView?.sgpa));
            }
            return row;
        });

        autoTable(doc, {
            head,
            body,
            startY: 25,
            theme: 'striped',
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
        });

        doc.save(`Students_Directory_${branch || 'All'}.pdf`);
    };

    const colCount = semesterColumn ? 9 : 8;

    return (
        <div className={`${styles.container} gf-fade-up`}>
            {/* Header */}
            <div className={styles.headerWrap}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institution</PageHeaderEyebrow>
                    <PageHeaderTitle>Students Directory</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Browse, filter, and inspect student records with live CGPA and backlog statuses across all departments.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div className={styles.headerActions}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={students.length === 0 || exportingExcel} density="compact" title="Exports every student matching the current filters, not just this page">
                        <span className="material-icons-round" style={{ fontSize: '17px', marginRight: '4px' }}>grid_on</span>
                        {exportingExcel ? 'Exporting…' : 'Export Excel'}
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={students.length === 0} density="compact">
                        <span className="material-icons-round" style={{ fontSize: '17px', marginRight: '4px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={handleRefresh} variant="primary" disabled={loading || isRefreshing} density="compact">
                        <span className={`material-icons-round ${(loading || isRefreshing) ? 'gf-spin' : ''}`} style={{ fontSize: '17px', marginRight: '4px' }}>sync</span>
                        {(loading || isRefreshing) ? 'Refreshing...' : 'Refresh'}
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

            {/* Filter Toolbar — Prominent Search, Quick Cohorts Rail, and Collapsible Refinement Panel */}
            <div className={styles.filterCard}>
                <div className={styles.filterCardInner}>
                    {/* Top Row: Prominent Search + Quick Filters & Sort Controls */}
                    <div className={styles.searchAndControls}>
                        <div className={styles.searchInputWrap}>
                            <Input
                                label={
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--primary, #174B4D)' }}>search</span>
                                        <span style={{ fontWeight: 700 }}>Search Students</span>
                                        {search && <span style={activeBadgeStyle}>ACTIVE</span>}
                                    </span>
                                }
                                placeholder="Search by Student USN, Full Name (e.g. Rawahah, 2AB23CS063)..."
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        triggerSearchImmediately(e.target.value);
                                    }
                                }}
                                style={{
                                    borderColor: search ? 'var(--primary, #174B4D)' : 'var(--border)',
                                    background: search ? 'var(--surface-low, #FDF6ED)' : 'var(--surface, #FFFFFF)',
                                    color: search ? 'var(--primary, #174B4D)' : 'var(--tx-main)',
                                    fontWeight: search ? 700 : 400,
                                    borderRadius: '8px',
                                    boxShadow: search ? '0 0 0 1.5px var(--primary, #174B4D)' : 'none'
                                }}
                            />
                            <div style={{ position: 'absolute', right: '12px', bottom: '9px', display: 'flex', alignItems: 'center', gap: '6px', zIndex: 2 }}>
                                {isDebouncing && (
                                    <span
                                        className="material-icons-round"
                                        style={{ fontSize: '18px', color: 'var(--primary, #174B4D)', animation: 'spin 1s linear infinite' }}
                                        title="Searching directory..."
                                    >
                                        sync
                                    </span>
                                )}
                                {searchInput && (
                                    <button
                                        type="button"
                                        onClick={handleClearSearch}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            cursor: 'pointer',
                                            color: 'var(--tx-dim)',
                                            padding: '2px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            borderRadius: '50%',
                                        }}
                                        title="Clear search"
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '18px' }}>close</span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Quick Controls Bar: Filter Toggle + Arrange/Sort + Reset */}
                        <div className={styles.quickControlsBar}>
                            <button
                                type="button"
                                onClick={() => setFiltersOpen(prev => !prev)}
                                className={`${styles.filterToggleBtn} ${filtersOpen || activeChips.length > 0 ? styles.filterToggleBtnActive : ''}`}
                                title={filtersOpen ? 'Hide filter options' : 'Show all filter options'}
                                aria-expanded={filtersOpen}
                            >
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary, #174B4D)' }}>tune</span>
                                <span>Filters</span>
                                {activeChips.length > 0 && (
                                    <span className={styles.filterCountBadge}>{activeChips.length}</span>
                                )}
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--tx-dim)' }}>
                                    {filtersOpen ? 'expand_less' : 'expand_more'}
                                </span>
                            </button>

                            <div style={{ minWidth: '150px' }}>
                                <Select
                                    value={`${sortBy}:${sortOrder}`}
                                    onChange={e => {
                                        const [sb, so] = e.target.value.split(':');
                                        setSortBy(sb);
                                        setSortOrder(so);
                                        setPage(1);
                                    }}
                                    options={[
                                        { value: 'batch:desc', label: 'Batch (Newest)' },
                                        { value: 'batch:asc', label: 'Batch (Oldest)' },
                                        { value: 'usn:asc', label: 'USN (A-Z)' },
                                        { value: 'name:asc', label: 'Name (A-Z)' },
                                        { value: 'cgpa:desc', label: 'CGPA (Highest)' },
                                        { value: 'backlogs:desc', label: 'Backlogs (Most)' },
                                        { value: 'department:asc', label: 'Dept (A-Z)' }
                                    ]}
                                    style={{ height: '38px', fontSize: '12px' }}
                                />
                            </div>

                            {activeChips.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={resetAll}
                                    style={{ color: 'var(--destructive, #B91C1C)', fontWeight: 700, height: '38px', padding: '0 10px' }}
                                >
                                    Reset
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Batch Cohorts Quick Scroll Rail (1 tap to filter, 0 vertical clutter) */}
                    {facets.batches?.length > 0 && (
                        <div className={styles.cohortsRail}>
                            <span className={styles.cohortsLabel}>
                                <span className="material-icons-round" style={{ fontSize: '13px', color: 'var(--primary, #174B4D)' }}>calendar_month</span>
                                Cohort:
                            </span>
                            <button
                                type="button"
                                onClick={() => handleFilterChange(setBatch, '')}
                                className={`${styles.cohortPill} ${!batch ? styles.cohortPillActive : ''}`}
                            >
                                All Batches
                            </button>
                            {facets.batches.map(b => {
                                const isSelected = batch === String(b.value);
                                return (
                                    <button
                                        key={b.value}
                                        type="button"
                                        onClick={() => handleFilterChange(setBatch, isSelected ? '' : String(b.value))}
                                        className={`${styles.cohortPill} ${isSelected ? styles.cohortPillActive : ''}`}
                                    >
                                        {b.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Active Filter Chips Strip (always visible when active, 1-tap remove) */}
                    {activeChips.length > 0 && (
                        <div className={styles.activeChipsStrip}>
                            <span style={{ fontSize: '10.5px', fontWeight: 800, textTransform: 'uppercase', color: 'var(--tx-muted)', letterSpacing: '0.05em', flexShrink: 0 }}>
                                Active:
                            </span>
                            {activeChips.map(chip => (
                                <button
                                    key={chip.name}
                                    type="button"
                                    onClick={() => clearFilter(chip.name)}
                                    className={styles.activeChip}
                                    title={`Remove ${chip.label}`}
                                >
                                    <span>{chip.label}</span>
                                    <span className="material-icons-round" style={{ fontSize: '13px' }}>close</span>
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={resetAll}
                                className={styles.clearAllBtn}
                            >
                                Clear All
                            </button>
                        </div>
                    )}

                    {/* Detailed Filters Drawer (collapsible on mobile, clean 2-column or 4-column grid) */}
                    {filtersOpen && (
                        <div className={styles.filtersDrawer}>
                            <div className={styles.dropdownsGrid}>
                                {/* Department */}
                                <Select
                                    density="compact"
                                    label={
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>school</span>
                                            <span style={{ fontWeight: 700, fontSize: '11px' }}>Department</span>
                                            {branch && <span style={activeBadgeStyle}>ACTIVE</span>}
                                        </span>
                                    }
                                    value={branch}
                                    onChange={e => handleFilterChange(setBranch, e.target.value)}
                                    options={facetOptions(facets.branches, branch, { allValue: '', allLabel: 'All Departments' })}
                                    style={getActiveSelectStyle(Boolean(branch))}
                                />

                                {/* Semester */}
                                <Select
                                    density="compact"
                                    label={
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>layers</span>
                                            <span style={{ fontWeight: 700, fontSize: '11px' }}>Semester</span>
                                            {semester !== 'all' && <span style={activeBadgeStyle}>ACTIVE</span>}
                                        </span>
                                    }
                                    value={semester}
                                    onChange={e => handleFilterChange(setSemester, e.target.value)}
                                    options={facetOptions(facets.semesters, semester, { allValue: 'all', allLabel: 'All Semesters', customCount: directoryTotal || 627 })}
                                    style={getActiveSelectStyle(semester !== 'all')}
                                />

                                {/* Semester Match (conditional) */}
                                {semester !== 'all' && (
                                    <Select
                                        density="compact"
                                        label={
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>tune</span>
                                                <span style={{ fontWeight: 700, fontSize: '11px' }}>Semester Match</span>
                                            </span>
                                        }
                                        value={semesterMode}
                                        onChange={e => handleFilterChange(setSemesterMode, e.target.value)}
                                        options={[
                                            { value: 'records', label: 'Has records for it' },
                                            { value: 'current', label: 'Currently studying it' }
                                        ]}
                                        style={getActiveSelectStyle(true)}
                                    />
                                )}

                                {/* Batch */}
                                <Select
                                    density="compact"
                                    label={
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>event_note</span>
                                            <span style={{ fontWeight: 700, fontSize: '11px' }}>Batch</span>
                                            {batch && <span style={activeBadgeStyle}>ACTIVE</span>}
                                        </span>
                                    }
                                    value={batch}
                                    onChange={e => handleFilterChange(setBatch, e.target.value)}
                                    options={facetOptions(facets.batches, batch, { allValue: '', allLabel: 'All Batches' })}
                                    style={getActiveSelectStyle(Boolean(batch))}
                                />

                                {/* Section */}
                                <Select
                                    density="compact"
                                    label={
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>groups</span>
                                            <span style={{ fontWeight: 700, fontSize: '11px' }}>Section</span>
                                            {section !== 'all' && <span style={activeBadgeStyle}>ACTIVE</span>}
                                        </span>
                                    }
                                    value={section}
                                    onChange={e => handleFilterChange(setSection, e.target.value)}
                                    options={facetOptions(facets.sections, section, { allValue: 'all', allLabel: 'All Sections' })}
                                    style={getActiveSelectStyle(section !== 'all')}
                                />

                                {/* Backlogs Status */}
                                <Select
                                    density="compact"
                                    label={
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>history_edu</span>
                                            <span style={{ fontWeight: 700, fontSize: '11px' }}>Backlogs Status</span>
                                            {backlogsFilter !== 'all' && <span style={activeBadgeStyle}>ACTIVE</span>}
                                        </span>
                                    }
                                    value={backlogsFilter}
                                    onChange={e => handleFilterChange(setBacklogsFilter, e.target.value)}
                                    options={[
                                        { value: 'all', label: 'All Students' },
                                        { value: 'clear', label: 'All Clear (0 Arrears)' },
                                        { value: 'backlogs', label: 'Carrying Backlogs' }
                                    ]}
                                    style={getActiveSelectStyle(backlogsFilter !== 'all')}
                                />

                                {/* Entry Type */}
                                <Select
                                    density="compact"
                                    label={
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>badge</span>
                                            <span style={{ fontWeight: 700, fontSize: '11px' }}>Entry Type</span>
                                            {entry !== 'all' && <span style={activeBadgeStyle}>ACTIVE</span>}
                                        </span>
                                    }
                                    value={entry}
                                    onChange={e => handleFilterChange(setEntry, e.target.value)}
                                    options={(facets.entries?.length ? facets.entries : [{ value: 'all', label: 'All Entries', count: 0 }])
                                        .map(o => ({ value: o.value, label: o.value === 'all' ? `${o.label} (${o.count})` : `${o.label} · ${o.count}` }))}
                                    style={getActiveSelectStyle(entry !== 'all')}
                                />

                                {/* Class (conditional) */}
                                {facets.classes?.length > 0 && (
                                    <Select
                                        density="compact"
                                        label={
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>meeting_room</span>
                                                <span style={{ fontWeight: 700, fontSize: '11px' }}>Class</span>
                                                {classId && <span style={activeBadgeStyle}>ACTIVE</span>}
                                            </span>
                                        }
                                        value={classId}
                                        onChange={e => handleFilterChange(setClassId, e.target.value)}
                                        options={facetOptions(facets.classes, classId, { allValue: '', allLabel: 'All Classes' })}
                                        style={getActiveSelectStyle(Boolean(classId))}
                                    />
                                )}

                                {/* Page Size */}
                                <Select
                                    density="compact"
                                    label={
                                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary, #174B4D)' }}>view_list</span>
                                            <span style={{ fontWeight: 700, fontSize: '11px' }}>Page Size</span>
                                            {limit !== 25 && <span style={activeBadgeStyle}>CUSTOM</span>}
                                        </span>
                                    }
                                    value={String(limit)}
                                    onChange={e => {
                                        setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value));
                                        setPage(1);
                                    }}
                                    style={getActiveSelectStyle(limit !== 25)}
                                    options={[
                                        { value: '25', label: '25 per page' },
                                        { value: '50', label: '50 per page' },
                                        { value: '100', label: '100 per page' },
                                        { value: 'all', label: `All (${directoryTotal || 627})` }
                                    ]}
                                />
                            </div>

                            <div className={styles.drawerFooter}>
                                <Button
                                    variant="primary"
                                    density="compact"
                                    onClick={() => setFiltersOpen(false)}
                                    iconStart="done"
                                >
                                    Done / Close Filters
                                </Button>
                                {activeChips.length > 0 && (
                                    <Button
                                        variant="ghost"
                                        density="compact"
                                        onClick={resetAll}
                                        iconStart="restart_alt"
                                        style={{ color: 'var(--destructive, #B91C1C)' }}
                                    >
                                        Reset All ({activeChips.length})
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>


            {error && (
                <Card style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                    <CardContent style={{ padding: '14px 18px', color: '#EF4444', fontSize: '13px', fontWeight: 600 }}>
                        {error}
                    </CardContent>
                </Card>
            )}

            {/* Student Count / Status Header */}
            <div className={styles.resultsSummaryBar}>
                <div className={styles.resultsCountText}>
                    Found <strong>{loading ? '…' : pagination.total}</strong> student{pagination.total === 1 ? '' : 's'}
                    {search ? (
                        <span>
                            {' '}matching &ldquo;
                            <mark className={styles.searchHighlightMark}>
                                {search}
                            </mark>
                            &rdquo;
                        </span>
                    ) : ' matching filters'}
                    {directoryTotal > 0 && pagination.total !== directoryTotal && (
                        <span style={{ color: 'var(--tx-dim)' }}> · {directoryTotal} in directory</span>
                    )}
                    {loading && <span style={{ marginLeft: '6px', fontSize: '11px', color: 'var(--primary)' }}>(Updating…)</span>}
                </div>
                <div className={styles.statusButtonsGroup}>
                    {['all', 'active', 'inactive'].map(value => (
                        <button
                            key={value}
                            type="button"
                            className={`${styles.statusPill} ${status === value ? styles.statusPillActive : ''}`}
                            onClick={() => handleFilterChange(setStatus, value)}
                        >
                            <span>{value === 'all' ? 'All' : value === 'active' ? 'Active' : 'Inactive'}</span>
                            <span className={styles.statusPillCount}>{statusCount(value)}</span>
                        </button>
                    ))}
                </div>
            </div>



            {/* Students Table */}
            <Card style={{ overflow: 'hidden' }}>
                <div className={styles.desktopTableWrap} style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                            <tr>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: '50px' }}>#</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: '140px' }}>USN</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left' }}>Student Name</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: '110px' }}>Department</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', width: '105px' }}>Sem &amp; Sec</th>
                                {semesterColumn && (
                                    <th style={{ padding: '12px 16px', textAlign: 'center', width: '110px' }}>Sem {semesterColumn}</th>
                                )}
                                <th style={{ padding: '12px 16px', textAlign: 'center', width: '90px' }}>CGPA</th>
                                <th style={{ padding: '12px 16px', textAlign: 'left', width: '170px' }}>Backlogs</th>
                                <th style={{ padding: '12px 16px', textAlign: 'center', width: '110px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && students.length === 0 ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <tr key={`sk-${i}`} style={{ borderBottom: '1px solid var(--border-low)' }}>
                                        <td colSpan={colCount} style={{ padding: '14px 16px' }}>
                                            <div style={{ height: '14px', borderRadius: '6px', background: 'var(--surface-low)', opacity: 1 - i * 0.12 }} />
                                        </td>
                                    </tr>
                                ))
                            ) : students.length === 0 ? (
                                <tr>
                                    <td colSpan={colCount} style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                        <div style={{ fontWeight: 700, color: 'var(--tx-muted)', marginBottom: '6px' }}>
                                            No students match the current filters.
                                        </div>
                                        {blockingFilters.length > 0 ? (
                                            <>
                                                <div style={{ fontSize: '12px', marginBottom: '12px' }}>
                                                    Removing one of these brings results back:
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    {blockingFilters.map(b => (
                                                        <Button key={b.filter} size="sm" variant="secondary" onClick={() => clearFilter(b.filter)}>
                                                            Clear {b.label} → {b.countIfCleared} students
                                                        </Button>
                                                    ))}
                                                </div>
                                            </>
                                        ) : activeChips.length > 0 ? (
                                            <Button size="sm" variant="secondary" onClick={resetAll}>Reset all filters</Button>
                                        ) : (
                                            <div style={{ fontSize: '12px' }}>The directory is empty — no student records have been imported yet.</div>
                                        )}
                                    </td>
                                </tr>
                            ) : (
                                students.map((s, idx) => {
                                    const hasBacklogs = s.total_backlogs > 0;
                                    const sv = s.semesterView;
                                    return (
                                        <tr
                                            key={s.usn}
                                            style={{
                                                borderBottom: '1px solid var(--border-low)',
                                                background: s.is_inactive ? 'rgba(239, 68, 68, 0.03)' : 'transparent',
                                                opacity: loading ? 0.55 : 1,
                                                transition: 'background 0.15s ease, opacity 0.15s ease'
                                            }}
                                        >
                                            <td style={{ padding: '12px 16px', color: 'var(--tx-dim)' }}>
                                                {(limit === 'all' ? 0 : (page - 1) * Number(limit)) + idx + 1}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 800, fontFamily: 'monospace' }}>
                                                <Link
                                                    href={`/faculty/students/${s.usn}`}
                                                    style={{ color: 'var(--primary, #174B4D)', textDecoration: 'none' }}
                                                    className="gf-hover-underline"
                                                >
                                                    <HighlightMatch text={s.usn} query={search} />
                                                </Link>
                                                {s.lateral_entry && <EntryTag lateral compact style={{ marginLeft: '6px' }} />}
                                                {s.batch && (
                                                    <div style={{ marginTop: '2px', fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)', fontFamily: 'inherit' }}>
                                                        <HighlightMatch text={`${s.batch} batch${s.admissionBatch && s.admissionBatch !== s.batch ? ` · adm. ${s.admissionBatch}` : ''}`} query={search} />
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                                                <Link href={`/faculty/students/${s.usn}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                                    <HighlightMatch text={s.name} query={search} />
                                                </Link>
                                                {s.is_inactive && (
                                                    <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-low, #FDF6ED)', border: '1px solid var(--border)', fontSize: '10px', color: 'var(--tx-muted)' }}>
                                                        Inactive
                                                    </span>
                                                )}
                                                <div style={{ marginTop: '2px', fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 500, display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <span>{s.email}</span>
                                                    {s.phone && s.phone !== '—' && <span>• {s.phone}</span>}
                                                </div>
                                            </td>
                                            <td style={{ padding: '12px 16px' }} title={s.branchLabel}>
                                                <span style={{
                                                    padding: '3px 8px',
                                                    borderRadius: '5px',
                                                    background: 'rgba(23, 75, 77, 0.08)',
                                                    color: 'var(--primary, #174B4D)',
                                                    fontWeight: 700,
                                                    fontSize: '11.5px',
                                                    border: '1px solid rgba(23, 75, 77, 0.12)',
                                                    display: 'inline-block'
                                                }}>
                                                    <HighlightMatch text={s.branch} query={search} />
                                                </span>
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <div
                                                    style={{ fontWeight: 700, color: 'var(--tx-main)' }}
                                                    title={(s.recordedSemesters || []).length ? `Records for semesters ${s.recordedSemesters.join(', ')}` : 'No semester records yet'}
                                                >
                                                    Sem {s.semester}
                                                </div>
                                                {s.section ? (
                                                    <span style={{
                                                        display: 'inline-block',
                                                        marginTop: '2px',
                                                        padding: '1px 6px',
                                                        borderRadius: '4px',
                                                        background: 'rgba(58, 106, 109, 0.12)',
                                                        color: 'var(--secondary, #3A6A6D)',
                                                        fontSize: '10px',
                                                        fontWeight: 800,
                                                        border: '1px solid rgba(58, 106, 109, 0.2)'
                                                    }}>
                                                        Sec <HighlightMatch text={s.section} query={search} />
                                                    </span>
                                                ) : (
                                                    <span style={{ display: 'inline-block', marginTop: '2px', padding: '1px 6px', borderRadius: '4px', background: 'var(--surface-low)', color: 'var(--tx-dim)', fontSize: '10px', fontWeight: 600 }}>
                                                        No Sec
                                                    </span>
                                                )}
                                            </td>
                                            {semesterColumn && (
                                                <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                    {sv?.hasRecord ? (
                                                        <>
                                                            <div style={{ fontWeight: 900, color: 'var(--tx-main)' }}>
                                                                {Number.isFinite(sv.sgpa) && sv.sgpa > 0 ? sv.sgpa.toFixed(2) : '—'}
                                                            </div>
                                                            <div style={{ marginTop: '2px', fontSize: '10px', fontWeight: 700, color: sv.backlogs > 0 ? 'var(--destructive, #B91C1C)' : 'var(--success, #166534)' }}>
                                                                {sv.backlogs > 0 ? `${sv.backlogs} backlog${sv.backlogs === 1 ? '' : 's'}` : 'clear'}
                                                            </div>
                                                            {sv.attemptCount > 1 && (
                                                                <div
                                                                    title={`Published across ${sv.attemptCount} exam rounds; showing the ${sv.hasRevaluation ? 'revaluation' : sv.examKind} result (${sv.examName})`}
                                                                    style={{ marginTop: '2px', fontSize: '9px', fontWeight: 800, color: sv.hasRevaluation ? '#8B5CF6' : 'var(--tx-dim)', cursor: 'help' }}
                                                                >
                                                                    {sv.hasRevaluation ? 'REVAL' : `${sv.attemptCount} ROUNDS`}
                                                                </div>
                                                            )}
                                                        </>
                                                    ) : (
                                                        <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)' }}>Not attempted</span>
                                                    )}
                                                </td>
                                            )}
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                {s.cgpa !== null && s.cgpa > 0 ? (
                                                    <span style={{
                                                        padding: '2px 8px',
                                                        borderRadius: '5px',
                                                        fontWeight: 900,
                                                        fontSize: '12px',
                                                        background: s.cgpa >= 8.0 ? 'var(--success-bg, #E8F5E9)' : s.cgpa >= 5.0 ? 'rgba(23, 75, 77, 0.08)' : 'var(--destructive-bg, #FFEBEE)',
                                                        color: s.cgpa >= 8.0 ? 'var(--success, #166534)' : s.cgpa >= 5.0 ? 'var(--primary, #174B4D)' : 'var(--destructive, #B91C1C)',
                                                        border: `1px solid ${s.cgpa >= 8.0 ? 'var(--success-border, #A5D6A7)' : s.cgpa >= 5.0 ? 'rgba(23, 75, 77, 0.18)' : 'var(--destructive-border, #FFCDD2)'}`,
                                                        display: 'inline-block'
                                                    }}>
                                                        {s.cgpa.toFixed(2)}
                                                    </span>
                                                ) : (
                                                    <span style={{ color: 'var(--tx-dim)', fontWeight: 600 }}>—</span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                {hasBacklogs ? (
                                                    <span style={{
                                                        padding: '3px 9px',
                                                        borderRadius: '6px',
                                                        background: 'var(--destructive-bg, #FFEBEE)',
                                                        color: 'var(--destructive, #B91C1C)',
                                                        border: '1px solid var(--destructive-border, #FFCDD2)',
                                                        fontWeight: 800,
                                                        fontSize: '11px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <span className="material-icons-round" style={{ fontSize: '13px' }}>warning</span>
                                                        {s.total_backlogs} Subjects ({s.backlog_credits} Cr)
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        padding: '3px 9px',
                                                        borderRadius: '6px',
                                                        background: 'var(--success-bg, #E8F5E9)',
                                                        color: 'var(--success, #166534)',
                                                        border: '1px solid var(--success-border, #A5D6A7)',
                                                        fontWeight: 800,
                                                        fontSize: '11px',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '4px'
                                                    }}>
                                                        <span className="material-icons-round" style={{ fontSize: '13px' }}>check_circle</span>
                                                        Clear
                                                    </span>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <Link href={`/faculty/students/${s.usn}`}>

                                                    <Button size="sm" variant="ghost" iconStart="visibility">
                                                        View
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Mobile Student Cards (Visible on mobile < 769px) */}
                <div className={styles.mobileCardsWrap}>
                    {loading && students.length === 0 ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <div key={`m-sk-${i}`} className={styles.mobileSkeletonCard}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div className={styles.mobileSkeletonBar} style={{ width: '90px' }} />
                                    <div className={styles.mobileSkeletonBar} style={{ width: '40px' }} />
                                </div>
                                <div className={styles.mobileSkeletonBar} style={{ width: '60%' }} />
                                <div className={styles.mobileSkeletonBar} style={{ width: '80%' }} />
                            </div>
                        ))
                    ) : students.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                            <div style={{ fontWeight: 700, color: 'var(--tx-muted)', marginBottom: '6px' }}>
                                No students match current filters.
                            </div>
                            {blockingFilters.length > 0 ? (
                                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '8px' }}>
                                    {blockingFilters.map(b => (
                                        <Button key={b.filter} size="sm" variant="secondary" onClick={() => clearFilter(b.filter)}>
                                            Clear {b.label}
                                        </Button>
                                    ))}
                                </div>
                            ) : activeChips.length > 0 ? (
                                <Button size="sm" variant="secondary" onClick={resetAll} style={{ marginTop: '8px' }}>Reset all filters</Button>
                            ) : (
                                <div style={{ fontSize: '12px', marginTop: '6px' }}>The directory is empty.</div>
                            )}
                        </div>
                    ) : (
                        students.map((s, idx) => {
                            const hasBacklogs = s.total_backlogs > 0;
                            const sv = s.semesterView;
                            return (
                                <Link
                                    key={`m-${s.usn}`}
                                    href={`/faculty/students/${s.usn}`}
                                    className={styles.mobileCard}
                                    style={{
                                        background: s.is_inactive ? 'rgba(239, 68, 68, 0.02)' : 'var(--surface)',
                                        opacity: loading ? 0.6 : 1
                                    }}
                                >
                                    <div className={styles.mobileCardHeader}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span className={styles.mobileUsnBadge}>
                                                <HighlightMatch text={s.usn} query={search} />
                                            </span>
                                            {s.lateral_entry && <EntryTag lateral compact />}
                                            {s.is_inactive && (
                                                <span style={{ padding: '1px 5px', borderRadius: '4px', background: 'var(--surface-low)', border: '1px solid var(--border)', fontSize: '9.5px', color: 'var(--tx-muted)' }}>
                                                    Inactive
                                                </span>
                                            )}
                                        </div>
                                        <span style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                            #{(limit === 'all' ? 0 : (page - 1) * Number(limit)) + idx + 1}
                                        </span>
                                    </div>

                                    <div>
                                        <div className={styles.mobileStudentName}>
                                            <HighlightMatch text={s.name} query={search} />
                                        </div>
                                        <div className={styles.mobileStudentContact}>
                                            <span>{s.email}</span>
                                            {s.phone && s.phone !== '—' && <span>• {s.phone}</span>}
                                        </div>
                                    </div>

                                    <div className={styles.mobileTagsRow}>
                                        <span className={styles.mobileDeptTag}>
                                            <HighlightMatch text={s.branch} query={search} />
                                        </span>
                                        <span className={styles.mobileSecTag}>
                                            Sem {s.semester} {s.section ? `· Sec ${s.section}` : ''}
                                        </span>
                                        {s.batch && (
                                            <span className={styles.mobileBatchTag}>
                                                {s.batch} Batch
                                            </span>
                                        )}
                                        {semesterColumn && sv?.hasRecord && (
                                            <span style={{
                                                fontSize: '10px',
                                                fontWeight: 800,
                                                color: sv.backlogs > 0 ? 'var(--destructive, #B91C1C)' : 'var(--success, #166534)',
                                                background: sv.backlogs > 0 ? 'var(--destructive-bg, #FFEBEE)' : 'var(--success-bg, #E8F5E9)',
                                                padding: '1px 6px',
                                                borderRadius: '4px'
                                            }}>
                                                Sem {semesterColumn}: {Number.isFinite(sv.sgpa) && sv.sgpa > 0 ? `${sv.sgpa.toFixed(2)} SGPA` : 'Attempted'}
                                            </span>
                                        )}
                                    </div>

                                    <div className={styles.mobileMetricsRow}>
                                        <div className={styles.mobileMetricsLeft}>
                                            <span
                                                className={styles.mobileCgpaBadge}
                                                style={{
                                                    background: (s.cgpa && s.cgpa >= 8.0) ? 'var(--success-bg, #E8F5E9)' : (s.cgpa && s.cgpa >= 5.0) ? 'rgba(23, 75, 77, 0.08)' : 'var(--destructive-bg, #FFEBEE)',
                                                    color: (s.cgpa && s.cgpa >= 8.0) ? 'var(--success, #166534)' : (s.cgpa && s.cgpa >= 5.0) ? 'var(--primary, #174B4D)' : 'var(--destructive, #B91C1C)',
                                                    border: `1px solid ${(s.cgpa && s.cgpa >= 8.0) ? 'var(--success-border, #A5D6A7)' : (s.cgpa && s.cgpa >= 5.0) ? 'rgba(23, 75, 77, 0.18)' : 'var(--destructive-border, #FFCDD2)'}`
                                                }}
                                            >
                                                <span style={{ fontSize: '9px', opacity: 0.8, fontWeight: 700 }}>CGPA</span>
                                                {s.cgpa !== null && s.cgpa > 0 ? s.cgpa.toFixed(2) : '—'}
                                            </span>

                                            <span
                                                className={styles.mobileBacklogsBadge}
                                                style={{
                                                    background: hasBacklogs ? 'var(--destructive-bg, #FFEBEE)' : 'var(--success-bg, #E8F5E9)',
                                                    color: hasBacklogs ? 'var(--destructive, #B91C1C)' : 'var(--success, #166534)',
                                                    border: `1px solid ${hasBacklogs ? 'var(--destructive-border, #FFCDD2)' : 'var(--success-border, #A5D6A7)'}`
                                                }}
                                            >
                                                <span className="material-icons-round" style={{ fontSize: '12px' }}>
                                                    {hasBacklogs ? 'warning' : 'check_circle'}
                                                </span>
                                                {hasBacklogs ? `${s.total_backlogs} Backlog${s.total_backlogs === 1 ? '' : 's'}` : 'Clear'}
                                            </span>
                                        </div>

                                        <span className={styles.mobileViewLink}>
                                            <span>View</span>
                                            <span className="material-icons-round" style={{ fontSize: '16px' }}>chevron_right</span>
                                        </span>
                                    </div>
                                </Link>
                            );
                        })
                    )}
                </div>

                {/* Pagination — inside the table card, with page navigation centered in the middle */}
                <div className="gf-table-pagination">
                    <div style={{ fontSize: '12.5px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                        {limit === 'all' ? (
                            <span>Showing <strong style={{ color: 'var(--tx-main)' }}>all {students.length}</strong> matching students</span>
                        ) : pagination.total === 0 ? (
                            <span>No students to show</span>
                        ) : (
                            <span>
                                Showing <strong style={{ color: 'var(--tx-main)' }}>{(page - 1) * Number(limit) + 1}</strong>
                                {'\u2013'}
                                <strong style={{ color: 'var(--tx-main)' }}>{Math.min(page * Number(limit), pagination.total)}</strong>
                                {' of '}
                                <strong style={{ color: 'var(--tx-main)' }}>{pagination.total}</strong>
                            </span>
                        )}
                    </div>

                    {limit !== 'all' && pagination.totalPages > 1 ? (
                        <nav aria-label="Student directory pages" className="gf-table-pagination-nav">
                            <PagerButton
                                label="First page"
                                icon="first_page"
                                disabled={page <= 1 || loading}
                                onClick={() => setPage(1)}
                            />
                            <PagerButton
                                label="Previous page"
                                icon="chevron_left"
                                disabled={page <= 1 || loading}
                                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                            />

                            {pageWindow(page, pagination.totalPages).map((entry, i) => (
                                entry === '…' ? (
                                    <span key={`gap-${i}`} style={{ padding: '0 4px', color: 'var(--tx-dim)', fontWeight: 700, userSelect: 'none' }}>…</span>
                                ) : (
                                    <button
                                        key={entry}
                                        type="button"
                                        onClick={() => setPage(entry)}
                                        disabled={loading}
                                        aria-current={entry === page ? 'page' : undefined}
                                        style={{
                                            minWidth: '32px',
                                            height: '32px',
                                            padding: '0 8px',
                                            borderRadius: '8px',
                                            cursor: loading ? 'default' : 'pointer',
                                            fontSize: '12.5px',
                                            fontWeight: 800,
                                            border: `1px solid ${entry === page ? 'var(--primary)' : 'var(--border)'}`,
                                            background: entry === page ? 'var(--primary)' : 'var(--surface)',
                                            color: entry === page ? '#FFFFFF' : 'var(--tx-main)'
                                        }}
                                    >
                                        {entry}
                                    </button>
                                )
                            ))}

                            <PagerButton
                                label="Next page"
                                icon="chevron_right"
                                disabled={page >= pagination.totalPages || loading}
                                onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                            />
                            <PagerButton
                                label="Last page"
                                icon="last_page"
                                disabled={page >= pagination.totalPages || loading}
                                onClick={() => setPage(pagination.totalPages)}
                            />
                        </nav>
                    ) : (
                        <div />
                    )}

                    <div className="gf-table-pagination-spacer" />
                </div>
            </Card>
        </div>
    );
}

/** One square icon control in the paginator. */
function PagerButton({ label, icon, disabled, onClick }) {
    return (
        <button
            type="button"
            aria-label={label}
            title={label}
            disabled={disabled}
            onClick={onClick}
            style={{
                width: '32px',
                height: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '8px',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: disabled ? 'var(--tx-dim)' : 'var(--tx-main)',
                cursor: disabled ? 'default' : 'pointer',
                opacity: disabled ? 0.5 : 1
            }}
        >
            <span className="material-icons-round" style={{ fontSize: '18px' }}>{icon}</span>
        </button>
    );
}

/**
 * Page numbers to render: always the first and last page, the current page and one
 * either side, with ellipses for the gaps. 26 pages of students should not produce
 * 26 buttons.
 */
function pageWindow(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

    const pages = new Set([1, total, current, current - 1, current + 1]);
    if (current <= 3) [2, 3, 4].forEach(n => pages.add(n));
    if (current >= total - 2) [total - 1, total - 2, total - 3].forEach(n => pages.add(n));

    const sorted = [...pages].filter(n => n >= 1 && n <= total).sort((a, b) => a - b);
    const out = [];
    sorted.forEach((n, i) => {
        if (i > 0 && n - sorted[i - 1] > 1) out.push('…');
        out.push(n);
    });
    return out;
}
