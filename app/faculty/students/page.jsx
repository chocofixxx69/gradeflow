'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest, clearApiCache } from '@/lib/api/client';
import { getXLSX, getJsPDF } from '@/lib/lazy-export-libs';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

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
    semesters: [],
    sections: [],
    statuses: [],
    entries: [],
    total: 0
};

/**
 * Per-row data-quality badges. The API attaches a `flags` array to every student
 * explaining why a figure on that row might not be solid — a stale standing column,
 * a semester with no records, a semester published across several exam rounds. The
 * row shows the number rather than hiding it, and says what is uncertain about it.
 */
const FLAG_TONE = {
    USN_INVALID: '#EF4444',
    SGPA_CONFLICT: '#EF4444',
    CREDIT_UNRESOLVED: '#EF4444',
    STANDING_BEHIND: '#F59E0B',
    SEMESTER_GAP: '#F59E0B',
    YEAR_MISMATCH: '#F59E0B',
    LATERAL_FLAG: '#F59E0B',
    MULTI_ATTEMPT: '#3B82F6'
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
function facetOptions(facets, selected, { allValue, allLabel }) {
    const total = facets.reduce((sum, f) => sum + f.count, 0);
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

function StudentsDirectoryContent() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Filters
    const [branch, setBranch] = useState('');
    const [semester, setSemester] = useState('all');
    const [semesterMode, setSemesterMode] = useState('records');
    const [batch, setBatch] = useState('');
    const [section, setSection] = useState('all');
    const [status, setStatus] = useState('all');
    const [entry, setEntry] = useState('all');
    const [backlogsFilter, setBacklogsFilter] = useState('all');
    // Search states (immediate input vs debounced search term)
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [isDebouncing, setIsDebouncing] = useState(false);

    const [page, setPage] = useState(1);
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
    const [quality, setQuality] = useState({ flagged: 0, byCode: {} });
    const [showFlagged, setShowFlagged] = useState(false);
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
        if (b) setBatch(b);
        if (br) setBranch(br.toUpperCase());
        if (sem) setSemester(sem);
        if (sec) setSection(sec.toUpperCase());
        if (ent) setEntry(ent);
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
            const query = { page: limit === 'all' ? 1 : page, limit, sortBy, sortOrder };
            if (fresh) query.fresh = '1';
            if (branch) query.branch = branch;
            if (semester !== 'all') {
                query.semester = semester;
                query.semesterMode = semesterMode;
            }
            if (batch) query.batch = batch;
            if (section !== 'all') query.section = section;
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
            setQuality(res?.quality || { flagged: 0, byCode: {} });
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
    }, [page, limit, sortBy, sortOrder, branch, semester, semesterMode, batch, section, status, entry, backlogsFilter, search]);

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
        if (status !== 'all') chips.push({ name: 'status', label: status === 'active' ? 'Active only' : 'Inactive only' });
        if (entry !== 'all') chips.push({ name: 'entry', label: entry === 'lateral' ? 'Lateral entry only' : 'Regular intake only' });
        if (backlogsFilter !== 'all') chips.push({ name: 'backlogsFilter', label: backlogsFilter === 'clear' ? 'All clear' : 'Carrying backlogs' });
        if (search) chips.push({ name: 'search', label: `“${search}”` });
        return chips;
    }, [facets.branches, branch, semester, semesterMode, batch, section, status, entry, backlogsFilter, search]);

    const semesterColumn = semester !== 'all' ? Number(semester) : null;
    const statusCount = (value) => facets.statuses.find(s => s.value === value)?.count ?? 0;

    // ── Excel Export ──
    const handleExportExcel = async () => {
        const XLSX = await getXLSX();
        const wb = XLSX.utils.book_new();
        const headers = [
            '#', 'USN', 'Name', 'Department', 'Current Sem', 'Semesters On Record',
            'Section', 'Batch', 'CGPA', 'Backlogs Count', 'Backlog Credits', 'Status'
        ];
        if (semesterColumn) headers.push(`Sem ${semesterColumn} SGPA`, `Sem ${semesterColumn} Backlogs`);

        const offset = limit === 'all' ? 0 : (page - 1) * Number(limit);
        const rows = (students || []).map((s, idx) => {
            const row = [
                offset + idx + 1,
                s.usn,
                s.name,
                s.branchLabel || s.branch,
                s.semester,
                (s.recordedSemesters || []).join(', ') || '—',
                s.section || '—',
                s.batch || '—',
                s.cgpa !== null && s.cgpa !== undefined ? s.cgpa.toFixed(2) : '—',
                s.total_backlogs,
                s.backlog_credits,
                s.is_inactive ? 'Inactive' : 'Active'
            ];
            if (semesterColumn) {
                row.push(
                    s.semesterView?.sgpa !== null && s.semesterView?.sgpa !== undefined ? s.semesterView.sgpa.toFixed(2) : '—',
                    s.semesterView?.backlogs !== null && s.semesterView?.backlogs !== undefined ? s.semesterView.backlogs : '—'
                );
            }
            return row;
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        XLSX.utils.book_append_sheet(wb, ws, 'Students');
        XLSX.writeFile(wb, `Students_Directory_${branch || 'All'}_Page${page}.xlsx`);
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

        const head = [['#', 'USN', 'Student Name', 'Dept', 'Sem', 'Sec', 'CGPA', 'Backlog Status']];
        if (semesterColumn) head[0].push(`S${semesterColumn} SGPA`);

        const offset = limit === 'all' ? 0 : (page - 1) * Number(limit);
        const body = (students || []).map((s, idx) => {
            const row = [
                offset + idx + 1,
                s.usn,
                s.name,
                s.branch,
                s.semester,
                s.section || '—',
                s.cgpa !== null && s.cgpa !== undefined ? s.cgpa.toFixed(2) : '—',
                s.total_backlogs > 0 ? `${s.total_backlogs} Sub (${s.backlog_credits} Cr)` : 'Clear'
            ];
            if (semesterColumn) {
                row.push(s.semesterView?.sgpa !== null && s.semesterView?.sgpa !== undefined ? s.semesterView.sgpa.toFixed(2) : '—');
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
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Institution</PageHeaderEyebrow>
                    <PageHeaderTitle>Students Directory</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Browse, filter, and inspect student records with live CGPA and backlog statuses across all departments.
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleExportExcel} variant="ghost" disabled={students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>description</span>
                        Export Excel
                    </Button>
                    <Button onClick={handleExportPDF} variant="ghost" disabled={students.length === 0}>
                        <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>picture_as_pdf</span>
                        Export PDF
                    </Button>
                    <Button onClick={handleRefresh} variant="primary" disabled={loading || isRefreshing}>
                        <span className={`material-icons-round ${(loading || isRefreshing) ? 'gf-spin' : ''}`} style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
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

            {/* Filter Toolbar — every option and count comes from the live dataset */}
            <Card style={{ marginBottom: '20px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 170px), 1fr))', gap: '14px', alignItems: 'flex-end' }}>
                        <Select
                            label="Department"
                            value={branch}
                            onChange={e => handleFilterChange(setBranch, e.target.value)}
                            options={facetOptions(facets.branches, branch, { allValue: '', allLabel: 'All Departments' })}
                        />
                        <Select
                            label="Semester"
                            value={semester}
                            onChange={e => handleFilterChange(setSemester, e.target.value)}
                            options={facetOptions(facets.semesters, semester, { allValue: 'all', allLabel: 'All Semesters' })}
                        />
                        {semester !== 'all' && (
                            <Select
                                label="Semester Match"
                                value={semesterMode}
                                onChange={e => handleFilterChange(setSemesterMode, e.target.value)}
                                options={[
                                    { value: 'records', label: 'Has records for it' },
                                    { value: 'current', label: 'Currently studying it' }
                                ]}
                            />
                        )}
                        <Select
                            label="Batch"
                            value={batch}
                            onChange={e => handleFilterChange(setBatch, e.target.value)}
                            options={facetOptions(facets.batches, batch, { allValue: '', allLabel: 'All Batches' })}
                        />
                        <Select
                            label="Section"
                            value={section}
                            onChange={e => handleFilterChange(setSection, e.target.value)}
                            options={facetOptions(facets.sections, section, { allValue: 'all', allLabel: 'All Sections' })}
                        />
                        <Select
                            label="Entry Type"
                            value={entry}
                            onChange={e => handleFilterChange(setEntry, e.target.value)}
                            options={(facets.entries?.length ? facets.entries : [{ value: 'all', label: 'All Entries', count: 0 }])
                                .map(o => ({ value: o.value, label: o.value === 'all' ? `${o.label} (${o.count})` : `${o.label} · ${o.count}` }))}
                        />
                        <Select
                            label="Backlogs Status"
                            value={backlogsFilter}
                            onChange={e => handleFilterChange(setBacklogsFilter, e.target.value)}
                            options={[
                                { value: 'all', label: 'All Students' },
                                { value: 'clear', label: 'All Clear (0 Arrears)' },
                                { value: 'backlogs', label: 'Carrying Backlogs' }
                            ]}
                        />
                        <Select
                            label="Arrange / Sort"
                            value={`${sortBy}:${sortOrder}`}
                            onChange={e => {
                                const [sb, so] = e.target.value.split(':');
                                setSortBy(sb);
                                setSortOrder(so);
                                setPage(1);
                            }}
                            options={[
                                { value: 'batch:desc', label: 'Batch (Newest First)' },
                                { value: 'batch:asc', label: 'Batch (Oldest First)' },
                                { value: 'usn:asc', label: 'USN (Ascending)' },
                                { value: 'name:asc', label: 'Name (A to Z)' },
                                { value: 'cgpa:desc', label: 'CGPA (Highest First)' },
                                { value: 'backlogs:desc', label: 'Backlogs (Most First)' },
                                { value: 'department:asc', label: 'Department (A to Z)' }
                            ]}
                        />
                        <Select
                            label="Page Size"
                            value={String(limit)}
                            onChange={e => {
                                setLimit(e.target.value === 'all' ? 'all' : Number(e.target.value));
                                setPage(1);
                            }}
                            options={[
                                { value: '25', label: '25 per page' },
                                { value: '50', label: '50 per page' },
                                { value: '100', label: '100 per page' },
                                { value: 'all', label: `All (${directoryTotal || 627})` }
                            ]}
                        />
                        <div style={{ position: 'relative' }}>
                            <Input
                                label="Search"
                                placeholder="USN, Name, Email, Phone..."
                                value={searchInput}
                                onChange={e => setSearchInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        triggerSearchImmediately(e.target.value);
                                    }
                                }}
                            />
                            <div style={{ position: 'absolute', right: '10px', bottom: '9px', display: 'flex', alignItems: 'center', gap: '4px', zIndex: 2 }}>
                                {isDebouncing && (
                                    <span
                                        className="material-icons-round"
                                        style={{ fontSize: '16px', color: 'var(--primary)', animation: 'spin 1s linear infinite' }}
                                        title="Searching..."
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
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {facets.batches?.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-low)', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                Batch Cohorts:
                            </span>
                            {facets.batches.map(b => (
                                <button
                                    key={b.value}
                                    type="button"
                                    onClick={() => handleFilterChange(setBatch, batch === String(b.value) ? '' : String(b.value))}
                                    style={{
                                        padding: '4px 10px',
                                        borderRadius: '6px',
                                        border: `1px solid ${batch === String(b.value) ? 'var(--primary)' : 'var(--border)'}`,
                                        background: batch === String(b.value) ? 'rgba(99, 102, 241, 0.12)' : 'var(--surface-low)',
                                        color: batch === String(b.value) ? 'var(--primary)' : 'var(--tx-main)',
                                        fontSize: '11.5px',
                                        fontWeight: 700,
                                        cursor: 'pointer'
                                    }}
                                >
                                    {b.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {activeChips.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-low)' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--tx-dim)' }}>
                                Filtering by
                            </span>
                            {activeChips.map(chip => (
                                <button
                                    key={chip.name}
                                    type="button"
                                    onClick={() => clearFilter(chip.name)}
                                    title={`Remove ${chip.label}`}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                        padding: '4px 8px', borderRadius: '999px', cursor: 'pointer',
                                        border: '1px solid var(--border)', background: 'var(--surface-low)',
                                        color: 'var(--tx-main)', fontSize: '11px', fontWeight: 700
                                    }}
                                >
                                    {chip.label}
                                    <span className="material-icons-round" style={{ fontSize: '13px', color: 'var(--tx-dim)' }}>close</span>
                                </button>
                            ))}
                            <Button size="sm" variant="ghost" onClick={resetAll}>Reset all</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {error && (
                <Card style={{ marginBottom: '16px', borderColor: 'rgba(239, 68, 68, 0.4)' }}>
                    <CardContent style={{ padding: '14px 18px', color: '#EF4444', fontSize: '13px', fontWeight: 600 }}>
                        {error}
                    </CardContent>
                </Card>
            )}

            {/* Student Count / Status Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ fontSize: '13px', color: 'var(--tx-muted)', fontWeight: 600 }}>
                    Found <strong>{loading ? '…' : pagination.total}</strong> student{pagination.total === 1 ? '' : 's'}
                    {search ? <span> matching &ldquo;<strong style={{ color: 'var(--tx-main)' }}>{search}</strong>&rdquo;</span> : ' matching filters'}
                    {directoryTotal > 0 && pagination.total !== directoryTotal && (
                        <span style={{ color: 'var(--tx-dim)' }}> · {directoryTotal} in the directory</span>
                    )}
                    {loading && <span style={{ marginLeft: '6px', fontSize: '12px', color: 'var(--primary)' }}>(Updating…)</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {['all', 'active', 'inactive'].map(value => (
                        <Button
                            key={value}
                            size="sm"
                            variant={status === value ? 'primary' : 'ghost'}
                            onClick={() => handleFilterChange(setStatus, value)}
                        >
                            {value === 'all' ? 'All' : value === 'active' ? 'Active' : 'Inactive'}
                            <span style={{ marginLeft: '6px', opacity: 0.7, fontWeight: 700 }}>{statusCount(value)}</span>
                        </Button>
                    ))}
                </div>
            </div>

            {/* Data-quality banner — the same findings the Data Health sweep reports,
                narrowed to the students currently on screen. */}
            {quality.flagged > 0 && (
                <Card style={{ marginBottom: '14px', borderColor: 'rgba(245, 158, 11, 0.35)' }}>
                    <CardContent style={{ padding: '12px 18px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span className="material-icons-round" style={{ color: '#F59E0B', fontSize: '19px' }}>fact_check</span>
                        <span style={{ fontSize: '12.5px', fontWeight: 700 }}>
                            {quality.flagged} of {pagination.total} students in this selection carry a data-quality flag
                        </span>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            {Object.entries(quality.byCode).sort((a, b) => b[1] - a[1]).map(([code, n]) => (
                                <span key={code} style={{
                                    padding: '2px 8px', borderRadius: '999px', fontSize: '10px', fontWeight: 800,
                                    background: 'var(--surface-low)', border: `1px solid ${FLAG_TONE[code] || 'var(--border)'}`,
                                    color: FLAG_TONE[code] || 'var(--tx-muted)'
                                }}>
                                    {code.replace(/_/g, ' ')} · {n}
                                </span>
                            ))}
                        </div>
                        <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                            <Button size="sm" variant={showFlagged ? 'primary' : 'ghost'} onClick={() => setShowFlagged(v => !v)}>
                                {showFlagged ? 'Hide row details' : 'Show row details'}
                            </Button>
                            <Link href="/faculty/data-health">
                                <Button size="sm" variant="secondary" iconEnd="arrow_forward">Data Health</Button>
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Students Table */}
            <Card style={{ overflow: 'hidden', marginBottom: '20px' }}>
                <div style={{ overflowX: 'auto' }}>
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
                                                    style={{ color: 'var(--primary)', textDecoration: 'none' }}
                                                    className="gf-hover-underline"
                                                >
                                                    {s.usn}
                                                </Link>
                                                {s.lateral_entry && (
                                                    <span title="Lateral entry" style={{ marginLeft: '6px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '9px', fontWeight: 800 }}>
                                                        LE
                                                    </span>
                                                )}
                                                {s.batch && (
                                                    <div style={{ marginTop: '2px', fontSize: '10px', fontWeight: 700, color: 'var(--tx-dim)', fontFamily: 'inherit' }}>
                                                        {s.batch} batch
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', fontWeight: 600 }}>
                                                <Link href={`/faculty/students/${s.usn}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                                    {s.name}
                                                </Link>
                                                {s.is_inactive && (
                                                    <span style={{ marginLeft: '8px', padding: '2px 6px', borderRadius: '4px', background: 'var(--surface-low)', border: '1px solid var(--border)', fontSize: '10px', color: 'var(--tx-muted)' }}>
                                                        Inactive
                                                    </span>
                                                )}
                                                {s.flags?.length > 0 && (
                                                    showFlagged ? (
                                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '5px' }}>
                                                            {s.flags.map(f => (
                                                                <span key={f.code} title={f.label} style={{
                                                                    padding: '1px 6px', borderRadius: '4px', fontSize: '9.5px', fontWeight: 800,
                                                                    background: 'var(--surface-low)',
                                                                    border: `1px solid ${FLAG_TONE[f.code] || 'var(--border)'}`,
                                                                    color: FLAG_TONE[f.code] || 'var(--tx-muted)'
                                                                }}>
                                                                    {f.label}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span
                                                            title={s.flags.map(f => f.label).join(' · ')}
                                                            style={{ marginLeft: '8px', display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', fontWeight: 800, color: '#F59E0B', cursor: 'help' }}
                                                        >
                                                            <span className="material-icons-round" style={{ fontSize: '13px' }}>info</span>
                                                            {s.flags.length}
                                                        </span>
                                                    )
                                                )}
                                            </td>
                                            <td style={{ padding: '12px 16px', color: 'var(--tx-muted)', fontWeight: 700 }} title={s.branchLabel}>
                                                {s.branch}
                                            </td>
                                            <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                                                <div
                                                    style={{ fontWeight: 700, color: 'var(--tx-main)' }}
                                                    title={(s.recordedSemesters || []).length ? `Records for semesters ${s.recordedSemesters.join(', ')}` : 'No semester records yet'}
                                                >
                                                    Sem {s.semester}
                                                </div>
                                                {s.section ? (
                                                    <span style={{ display: 'inline-block', marginTop: '2px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary)', fontSize: '10px', fontWeight: 800 }}>
                                                        Sec {s.section}
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
                                                            <div style={{ marginTop: '2px', fontSize: '10px', fontWeight: 700, color: sv.backlogs > 0 ? '#EF4444' : '#10B981' }}>
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
                                            <td style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 900, color: s.cgpa >= 8.0 ? '#10B981' : s.cgpa >= 5.0 ? 'var(--primary)' : s.cgpa > 0 ? '#EF4444' : 'var(--tx-dim)' }}>
                                                {s.cgpa !== null && s.cgpa > 0 ? s.cgpa.toFixed(2) : '—'}
                                            </td>
                                            <td style={{ padding: '12px 16px' }}>
                                                {hasBacklogs ? (
                                                    <span style={{ padding: '3px 9px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.12)', color: '#EF4444', fontWeight: 800, fontSize: '11px' }}>
                                                        {s.total_backlogs} Subjects ({s.backlog_credits} Cr)
                                                    </span>
                                                ) : (
                                                    <span style={{ padding: '3px 9px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.12)', color: '#10B981', fontWeight: 800, fontSize: '11px' }}>
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
            </Card>

            {/* Pagination Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ fontSize: '13px', color: 'var(--tx-muted)' }}>
                    {limit === 'all' ? (
                        <span>Loaded <strong>All {students.length}</strong> students across the database</span>
                    ) : (
                        <span>
                            Showing <strong>{pagination.total > 0 ? (page - 1) * Number(limit) + 1 : 0}</strong> to <strong>{Math.min(page * Number(limit), pagination.total)}</strong> of <strong>{pagination.total}</strong> students
                        </span>
                    )}
                </div>
                {limit !== 'all' && pagination.totalPages > 1 && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={page <= 1 || loading}
                            onClick={() => setPage(prev => Math.max(1, prev - 1))}
                            iconStart="chevron_left"
                        >
                            Previous
                        </Button>
                        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '0 12px', fontSize: '13px', fontWeight: 700 }}>
                            Page {page} of {pagination.totalPages}
                        </span>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={page >= pagination.totalPages || loading}
                            onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                            iconEnd="chevron_right"
                        >
                            Next
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
