'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { apiRequest, getStudentAuthHeaders } from '../../lib/api/client';
// Loaded on demand — see components/ClassesContent.jsx for why: jsPDF and the
// embedded crest are ~500 kB that nothing on first paint needs.
const loadExportUtils = () => import('../../lib/export-utils');
import { filterAndRankStudents } from '../../lib/search-utils';
import AuthGuard from '../../components/AuthGuard';

export default function LeaderboardPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('overall'); // 'overall' | 'semester' | 'subject'
    const [selectedSemester, setSelectedSemester] = useState(null);
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [entryFilter, setEntryFilter] = useState('all'); // 'all' | 'regular' | 'lateral'

    // Session-scoped cache of already-fetched sem/subject combos, keyed by
    // `${sem}|${sub}` — flipping back and forth between tabs a student has
    // already visited is then instant instead of round-tripping again.
    // A monotonic request id lets us drop a response that resolves after a
    // newer request was already fired (e.g. rapid clicking between tabs), so
    // the screen never gets overwritten by an out-of-order, now-stale reply.
    const leaderboardCacheRef = useRef(new Map());
    const requestIdRef = useRef(0);

    // No batch/department param here on purpose — the API resolves the logged-in
    // student's own class from their session, so students can only ever see their
    // own class leaderboard (department switching is a faculty-only capability).
    const fetchLeaderboard = useCallback(async (sem = null, sub = null) => {
        const myRequestId = ++requestIdRef.current;
        const cacheKey = `${sem || ''}|${sub || ''}`;
        const cached = leaderboardCacheRef.current.get(cacheKey);

        if (cached) {
            // Cache hit: swap instantly, no spinner, no network round trip.
            setData(cached);
            setLoading(false);
            setError('');
            return;
        }

        setLoading(true);
        setError('');
        try {
            const stuSession = localStorage.getItem('student_session');
            const session = stuSession ? JSON.parse(stuSession) : null;

            const query = {};
            if (sem) query.semester = sem;
            if (sub) query.subject_code = sub;

            const res = await apiRequest('/api/student/leaderboard', {
                headers: getStudentAuthHeaders(session),
                query
            });

            if (myRequestId !== requestIdRef.current) return; // a newer request superseded this one

            leaderboardCacheRef.current.set(cacheKey, res);
            setData(res);
            // Functional updaters read the latest state without needing selectedSemester/
            // selectedSubjectCode in this callback's own dependency array. That matters:
            // this only ever runs for the initial no-args mount fetch (sem/sub both still
            // null then), so depending on the two state vars here would give this callback
            // a new identity on every tab click, re-triggering the mount effect below and
            // firing a stray extra no-args fetch right after each explicit one — which used
            // to race the real request and occasionally overwrite it with the server's
            // default semester instead of the one just clicked.
            if (res?.targetSemester) {
                setSelectedSemester(prev => prev === null ? res.targetSemester : prev);
            }
            if (res?.currentSubject?.subject_code) {
                setSelectedSubjectCode(prev => prev ? prev : res.currentSubject.subject_code);
            }
        } catch (err) {
            if (myRequestId !== requestIdRef.current) return;
            console.error('Fetch leaderboard error:', err);
            setError(err.message || 'Failed to load class leaderboard.');
        } finally {
            if (myRequestId === requestIdRef.current) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    const activeSemester = selectedSemester || data?.targetSemester || 1;

    const handleSemesterChange = (sem) => {
        setSelectedSemester(sem);
        const firstSubForSem = (data?.availableSubjects || []).find(s => s.semester === sem);
        const nextSubCode = firstSubForSem ? firstSubForSem.subject_code : '';
        if (nextSubCode) {
            setSelectedSubjectCode(nextSubCode);
        }
        fetchLeaderboard(sem, nextSubCode || null);
    };

    const handleSubjectChange = (subCode) => {
        setSelectedSubjectCode(subCode);
        fetchLeaderboard(activeSemester, subCode);
    };

    // Filtered lists based on search query & entry filter
    const applyFilters = (list) => {
        if (!list) return [];
        let res = list;
        if (entryFilter === 'regular') res = res.filter(s => !s.isLateral);
        if (entryFilter === 'lateral') res = res.filter(s => s.isLateral);
        if (searchQuery) {
            res = filterAndRankStudents(res, searchQuery);
        }
        return res;
    };

    const rawSemesterList = useMemo(() => {
        if (data?.allSemestersLeaderboard && data.allSemestersLeaderboard[activeSemester]) {
            return data.allSemestersLeaderboard[activeSemester];
        }
        return data?.semesterLeaderboard || [];
    }, [data, activeSemester]);

    const filteredOverall = useMemo(() => applyFilters(data?.overallLeaderboard), [data?.overallLeaderboard, searchQuery, entryFilter]);
    const filteredSemester = useMemo(() => applyFilters(rawSemesterList), [rawSemesterList, searchQuery, entryFilter]);
    const filteredSubject = useMemo(() => applyFilters(data?.subjectLeaderboard), [data?.subjectLeaderboard, searchQuery, entryFilter]);

    const top3Overall = useMemo(() => (filteredOverall || []).filter(r => typeof r.rank === 'number' && r.rank <= 3), [filteredOverall]);
    const top3Semester = useMemo(() => (filteredSemester || []).filter(r => typeof r.rank === 'number' && r.rank <= 3), [filteredSemester]);
    const top3Subject = useMemo(() => (filteredSubject || []).filter(r => typeof r.rank === 'number' && r.rank <= 3), [filteredSubject]);

    const getMedal = (rank) => {
        if (rank === 1) return { icon: '🥇', label: '1st Place', color: '#D97706', bg: 'rgba(245, 158, 11, 0.12)' };
        if (rank === 2) return { icon: '🥈', label: '2nd Place', color: '#4B5563', bg: 'rgba(107, 114, 128, 0.12)' };
        if (rank === 3) return { icon: '🥉', label: '3rd Place', color: '#B45309', bg: 'rgba(217, 119, 6, 0.12)' };
        return { icon: `#${rank}`, label: `Rank ${rank}`, color: 'var(--tx-muted)', bg: 'var(--surface-low)' };
    };

    return (
        <AuthGuard role="student">
            <div className="lbPage" style={{ maxWidth: '1280px', margin: '0 auto', padding: 'var(--page-py, 24px) var(--page-px, 20px)' }}>
                {/* Header & Cohort Info */}
                <div className="lbHeader" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '28px' }}>emoji_events</span>
                            <h1 className="lbTitle" style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>
                                Class Leaderboard & Toppers
                            </h1>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--tx-muted)' }}>
                            Class: <strong>{data?.batchName || data?.batch || 'Class'}</strong> — Total <strong>{data?.totalStudents || 0} Students</strong>
                            {data?.lateralCount > 0 && ` (${data.regularCount} Regular + ${data.lateralCount} Lateral Entry)`}.
                        </p>
                    </div>

                    {/* Export Actions — students only ever see their own class, so no department picker here */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                                onClick={async () => {
                                    if (!data) return;
                                    const { exportLeaderboardPDF } = await loadExportUtils();
                                    exportLeaderboardPDF({
                                        cohortName: data.batchName,
                                        batchCode: data.batch,
                                        totalStudents: data.totalStudents,
                                        regularCount: data.regularCount,
                                        lateralCount: data.lateralCount,
                                        targetSemester: selectedSemester || data.targetSemester,
                                        overallLeaderboard: data.overallLeaderboard,
                                        semesterLeaderboard: data.semesterLeaderboard,
                                        subjectLeaderboard: data.subjectLeaderboard,
                                        currentSubject: data.currentSubject,
                                        fileName: `${data.batch}_Class_Leaderboard.pdf`
                                    });
                                }}
                                style={{
                                    padding: '8px 14px', minHeight: '40px', borderRadius: '8px', border: '1px solid var(--border)',
                                    background: 'var(--primary)', color: '#ffffff', fontWeight: 800, fontSize: '0.85rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>picture_as_pdf</span>
                                Export PDF
                            </button>

                            <button
                                onClick={async () => {
                                    if (!data) return;
                                    const { exportLeaderboardCSV } = await loadExportUtils();
                                    exportLeaderboardCSV({
                                        cohortName: data.batchName,
                                        batchCode: data.batch,
                                        totalStudents: data.totalStudents,
                                        regularCount: data.regularCount,
                                        lateralCount: data.lateralCount,
                                        targetSemester: selectedSemester || data.targetSemester,
                                        overallLeaderboard: data.overallLeaderboard,
                                        semesterLeaderboard: data.semesterLeaderboard,
                                        subjectLeaderboard: data.subjectLeaderboard,
                                        currentSubject: data.currentSubject,
                                        fileName: `${data.batch}_Class_Leaderboard.csv`
                                    });
                                }}
                                style={{
                                    padding: '8px 14px', minHeight: '40px', borderRadius: '8px', border: '1px solid var(--border)',
                                    background: 'var(--surface-low)', color: 'var(--tx-main)', fontWeight: 800, fontSize: '0.85rem',
                                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                                }}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px' }}>table_view</span>
                                Export CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* Logged-In Student Quick Standing Banner */}
                {data?.currentUser && (
                    <div className="lbStanding" style={{
                        background: 'linear-gradient(135deg, rgba(23, 75, 77, 0.08) 0%, rgba(23, 75, 77, 0.02) 100%)',
                        border: '1.5px solid rgba(23, 75, 77, 0.25)',
                        borderRadius: '14px', padding: '18px 22px', marginBottom: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div className="lbStandingAvatar" style={{
                                width: '48px', height: '48px', borderRadius: '12px',
                                background: 'var(--primary)', color: '#ffffff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 900, fontSize: '1.3rem'
                            }}>
                                {((data.currentUser.name || data.currentUser.usn || '?')[0]).toUpperCase()}
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                        Your Academic Standing
                                    </span>
                                    {data.currentUser.isLateral && (
                                        <span style={{
                                            padding: '1px 6px', borderRadius: '4px', fontSize: '0.68rem',
                                            fontWeight: 800, background: 'rgba(217, 119, 6, 0.15)', color: '#b45309'
                                        }}>
                                            Lateral Entry
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--tx-main)' }}>
                                    {data.currentUser.name} ({data.currentUser.usn})
                                </div>
                            </div>
                        </div>

                        <div className="lbStandingStats" style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Overall Rank</div>
                                <div className="lbStandingValue" style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)' }}>
                                    #{data.currentUser.overallRank || '—'} <span style={{ fontSize: '0.85rem', color: 'var(--tx-muted)', fontWeight: 600 }}>/ {data.totalStudents}</span>
                                </div>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Overall CGPA</div>
                                <div className="lbStandingValue" style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--tx-main)' }}>
                                    {data.currentUser.overallCGPA !== null ? data.currentUser.overallCGPA.toFixed(2) : '—'}
                                </div>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Sem {activeSemester} SGPA</div>
                                <div className="lbStandingValue" style={{ fontSize: '1.4rem', fontWeight: 900, color: '#047857' }}>
                                    {(() => {
                                        const semInfo = data.currentUser.semesters?.[activeSemester];
                                        if (semInfo && semInfo.sgpa > 0) return semInfo.sgpa.toFixed(2);
                                        if (activeSemester === data.targetSemester && data.currentUser.semesterSGPA) return data.currentUser.semesterSGPA.toFixed(2);
                                        return '—';
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* View Tabs */}
                <div className="lbTabs" style={{
                    display: 'flex', gap: '8px', borderBottom: '2px solid var(--border)',
                    marginBottom: '24px', overflowX: 'auto', paddingBottom: '2px'
                }}>
                    <button
                        className="lbTabBtn"
                        onClick={() => setActiveTab('overall')}
                        style={{
                            padding: '10px 18px', border: 'none', background: 'transparent',
                            fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                            color: activeTab === 'overall' ? 'var(--primary)' : 'var(--tx-muted)',
                            borderBottom: activeTab === 'overall' ? '3px solid var(--primary)' : '3px solid transparent',
                            display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '20px' }}>military_tech</span>
                        Overall Class Toppers (CGPA)
                    </button>

                    <button
                        className="lbTabBtn"
                        onClick={() => setActiveTab('semester')}
                        style={{
                            padding: '10px 18px', border: 'none', background: 'transparent',
                            fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                            color: activeTab === 'semester' ? 'var(--primary)' : 'var(--tx-muted)',
                            borderBottom: activeTab === 'semester' ? '3px solid var(--primary)' : '3px solid transparent',
                            display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '20px' }}>date_range</span>
                        Semester-Wise Toppers (SGPA)
                    </button>

                    <button
                        className="lbTabBtn"
                        onClick={() => setActiveTab('subject')}
                        style={{
                            padding: '10px 18px', border: 'none', background: 'transparent',
                            fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer',
                            color: activeTab === 'subject' ? 'var(--primary)' : 'var(--tx-muted)',
                            borderBottom: activeTab === 'subject' ? '3px solid var(--primary)' : '3px solid transparent',
                            display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap'
                        }}
                    >
                        <span className="material-icons-round" style={{ fontSize: '20px' }}>menu_book</span>
                        Subject-Wise Toppers & Marks
                    </button>
                </div>

                {/* Sub-Filters, Selectors & Entry Filter */}
                <div className="lbSubFilters" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                    {/* Search Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', minWidth: '240px', flex: '1 1 240px' }}>
                        <span className="material-icons-round" style={{ color: 'var(--tx-muted)', fontSize: '18px' }}>search</span>
                        <input
                            type="text"
                            placeholder="Search classmate name or USN (e.g. Rawahah, 2AB23CS063)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.88rem', background: 'transparent', color: 'var(--tx-main)' }}
                        />
                    </div>

                    {/* Entry Type Filter Pills */}
                    {data?.lateralCount > 0 && (
                        <div className="lbEntryPills" style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--surface-low)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <button
                                className="lbPillBtn"
                                onClick={() => setEntryFilter('all')}
                                style={{
                                    padding: '5px 10px', minHeight: '40px', display: 'inline-flex', alignItems: 'center', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                                    background: entryFilter === 'all' ? 'var(--surface)' : 'transparent',
                                    color: entryFilter === 'all' ? 'var(--tx-main)' : 'var(--tx-muted)',
                                    boxShadow: entryFilter === 'all' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                                }}
                            >
                                All ({data.totalStudents})
                            </button>
                            <button
                                className="lbPillBtn"
                                onClick={() => setEntryFilter('regular')}
                                style={{
                                    padding: '5px 10px', minHeight: '40px', display: 'inline-flex', alignItems: 'center', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                                    background: entryFilter === 'regular' ? 'var(--surface)' : 'transparent',
                                    color: entryFilter === 'regular' ? 'var(--tx-main)' : 'var(--tx-muted)',
                                    boxShadow: entryFilter === 'regular' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                                }}
                            >
                                Regular ({data.regularCount})
                            </button>
                            <button
                                className="lbPillBtn"
                                onClick={() => setEntryFilter('lateral')}
                                style={{
                                    padding: '5px 10px', minHeight: '40px', display: 'inline-flex', alignItems: 'center', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                                    background: entryFilter === 'lateral' ? 'var(--surface)' : 'transparent',
                                    color: entryFilter === 'lateral' ? '#b45309' : 'var(--tx-muted)',
                                    boxShadow: entryFilter === 'lateral' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                                }}
                            >
                                Lateral Entry ({data.lateralCount})
                            </button>
                        </div>
                    )}

                    {/* Semester Selector for Semester or Subject Tab */}
                    {(activeTab === 'semester' || activeTab === 'subject') && (
                        <div className="lbSemRow" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--tx-muted)' }}>Semester:</span>
                            {(data?.availableSemesters || [1,2,3,4,5,6]).map(sem => (
                                <button
                                    key={sem}
                                    className="lbPillBtn"
                                    onClick={() => handleSemesterChange(sem)}
                                    style={{
                                        padding: '6px 12px', minHeight: '40px', display: 'inline-flex', alignItems: 'center', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700,
                                        cursor: 'pointer',
                                        border: selectedSemester === sem ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        background: selectedSemester === sem ? 'var(--primary)' : '#ffffff',
                                        color: selectedSemester === sem ? '#ffffff' : 'var(--tx-main)'
                                    }}
                                >
                                    Sem {sem}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Subject Selector for Subject Tab */}
                    {activeTab === 'subject' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--tx-muted)', flexShrink: 0 }}>Subject:</span>
                            <select
                                value={selectedSubjectCode || data?.currentSubject?.subject_code || ''}
                                onChange={(e) => handleSubjectChange(e.target.value)}
                                style={{
                                    padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--border)',
                                    background: '#ffffff', color: 'var(--tx-main)', fontWeight: 600, fontSize: '0.85rem',
                                    minWidth: 0, maxWidth: '100%', flexShrink: 1
                                }}
                            >
                                {(data?.availableSubjects || [])
                                    .filter(s => !selectedSemester || s.semester === selectedSemester)
                                    .map(s => (
                                        <option key={s.subject_code} value={s.subject_code}>
                                            {s.subject_code} - {s.subject_name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    )}
                </div>

                {/* Podium + Ranking Table — dimmed and non-interactive while a
                    fresh sem/subject/tab fetch is in flight (cache miss), so
                    switching tabs visibly loads instead of appearing frozen
                    on the previous selection. Cache hits skip this entirely
                    since `loading` never turns on for them. */}
                <div style={{
                    opacity: loading ? 0.45 : 1,
                    pointerEvents: loading ? 'none' : 'auto',
                    transition: 'opacity 0.15s ease'
                }}>
                {/* Podium Display for Top 3 */}
                {!searchQuery && (
                    <div className="lbPodium" style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
                        gap: '16px', marginBottom: '24px'
                    }}>
                        {(activeTab === 'overall' ? top3Overall : activeTab === 'semester' ? top3Semester : top3Subject).map((topper, idx) => {
                            const medal = getMedal(topper.rank);
                            const scoreLabel = activeTab === 'overall'
                                ? `CGPA: ${topper.cgpa?.toFixed(2)}`
                                : activeTab === 'semester'
                                ? `SGPA: ${topper.sgpa?.toFixed(2)}`
                                : `Score: ${topper.total}/100 (CIE ${topper.internal} + SEE ${topper.external})`;

                            return (
                                <div
                                    key={topper.usn}
                                    className="lbPodiumCard"
                                    style={{
                                        background: topper.isCurrentUser ? 'rgba(23, 75, 77, 0.05)' : 'var(--surface)',
                                        border: topper.isCurrentUser ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        borderRadius: '14px', padding: '18px 20px', position: 'relative',
                                        boxShadow: topper.rank === 1 ? '0 8px 20px rgba(217, 119, 6, 0.12)' : '0 4px 12px rgba(0,0,0,0.03)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <div className="lbMedal" style={{
                                            fontSize: '1.8rem', width: '42px', height: '42px', borderRadius: '50%',
                                            background: medal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}>
                                            {medal.icon}
                                        </div>
                                        <span style={{
                                            fontSize: '0.75rem', fontWeight: 800, color: medal.color,
                                            textTransform: 'uppercase', letterSpacing: '0.5px'
                                        }}>
                                            {medal.label}
                                        </span>
                                    </div>

                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--tx-main)' }}>
                                            {topper.name}
                                        </h4>
                                        {topper.isLateral && (
                                            <span style={{
                                                padding: '1px 5px', borderRadius: '4px', fontSize: '0.65rem',
                                                fontWeight: 800, background: 'rgba(217, 119, 6, 0.15)', color: '#b45309'
                                            }}>
                                                Lateral
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.82rem', fontFamily: 'monospace', color: 'var(--tx-muted)', marginBottom: '10px' }}>
                                        {topper.usn}
                                    </div>

                                    <div style={{
                                        background: 'var(--surface-low)', padding: '8px 12px', borderRadius: '8px',
                                        fontWeight: 800, fontSize: '0.92rem', color: (topper?.rank === 1 || idx === 0) ? '#b45309' : 'var(--tx-main)',
                                        display: 'inline-block'
                                    }}>
                                        {scoreLabel}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Full Class Ranking Table */}
                <div className="lbRankingCard" style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
                    overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                }}>
                    <div className="lbRankingHeader" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--tx-main)' }}>
                            {activeTab === 'overall' && `Complete Class Ranking — Overall CGPA (${filteredOverall.length} Students)`}
                            {activeTab === 'semester' && `Semester ${activeSemester} SGPA Ranking (${filteredSemester.length} Students)`}
                            {activeTab === 'subject' && `${data?.currentSubject?.subject_name || 'Subject'} Marks Leaderboard (${filteredSubject.length} Students)`}
                        </div>
                        {loading && (
                            <span
                                aria-label="Loading"
                                style={{
                                    width: '16px', height: '16px', borderRadius: '50%',
                                    border: '2px solid var(--border)', borderTopColor: 'var(--primary)',
                                    animation: 'lbSpin 0.7s linear infinite'
                                }}
                            />
                        )}
                    </div>

                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                        <table style={{ width: '100%', minWidth: '560px', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
                                    <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', width: '80px' }}>Rank</th>
                                    <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)' }}>Student Name</th>
                                    <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)' }}>USN</th>

                                    {activeTab === 'overall' && (
                                        <>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>CGPA</th>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Semesters</th>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Backlogs</th>
                                        </>
                                    )}

                                    {activeTab === 'semester' && (
                                        <>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>SGPA</th>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Credits</th>
                                        </>
                                    )}

                                    {activeTab === 'subject' && (
                                        <>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>CIE /50</th>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>SEE /50</th>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Total /100</th>
                                            <th className="lbTh" style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Grade</th>
                                        </>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {(activeTab === 'overall' ? filteredOverall : activeTab === 'semester' ? filteredSemester : filteredSubject).map(item => {
                                    const isMe = item.isCurrentUser;
                                    const medal = item.rank <= 3 ? getMedal(item.rank) : null;

                                    return (
                                        <tr
                                            key={item.usn}
                                            style={{
                                                borderBottom: '1px solid var(--border)',
                                                background: isMe ? 'rgba(23, 75, 77, 0.08)' : 'transparent',
                                                fontWeight: isMe ? 700 : 500,
                                                transition: 'background 0.15s ease'
                                            }}
                                        >
                                            <td className="lbTd" style={{ padding: '14px 18px' }}>
                                                {medal ? (
                                                    <span style={{ fontSize: '1.2rem' }}>{medal.icon}</span>
                                                ) : (
                                                    <span style={{
                                                        padding: '3px 8px', borderRadius: '6px', fontSize: '0.78rem',
                                                        fontWeight: 800, background: 'var(--surface-low)', color: 'var(--tx-muted)'
                                                    }}>
                                                        #{item.rank}
                                                    </span>
                                                )}
                                            </td>

                                            <td className="lbTd" style={{ padding: '14px 18px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                                    <span style={{ color: isMe ? 'var(--primary)' : 'var(--tx-main)', fontWeight: isMe ? 800 : 700 }}>
                                                        {item.name}
                                                    </span>
                                                    {isMe && (
                                                        <span style={{
                                                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem',
                                                            fontWeight: 900, background: 'var(--primary)', color: '#ffffff'
                                                        }}>
                                                            YOU
                                                        </span>
                                                    )}
                                                    {item.isLateral && (
                                                        <span style={{
                                                            padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem',
                                                            fontWeight: 800, background: 'rgba(217, 119, 6, 0.12)', color: '#b45309'
                                                        }}>
                                                            Lateral
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="lbTd" style={{ padding: '14px 18px', fontFamily: 'monospace', color: 'var(--tx-muted)', fontSize: '0.84rem' }}>
                                                {item.usn}
                                            </td>

                                            {activeTab === 'overall' && (
                                                <>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontWeight: 900, fontSize: '1.05rem',
                                                            color: item.cgpa >= 8.5 ? '#047857' : item.cgpa >= 7.0 ? 'var(--primary)' : 'var(--tx-main)'
                                                        }}>
                                                            {item.cgpa ? item.cgpa.toFixed(2) : '—'}
                                                        </span>
                                                    </td>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {item.semestersTracked} Sems
                                                    </td>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800,
                                                            background: item.totalBacklogs > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.12)',
                                                            color: item.totalBacklogs > 0 ? '#b91c1c' : '#047857'
                                                        }}>
                                                            {item.totalBacklogs === 0 ? 'All Clear' : `${item.totalBacklogs} Backlog`}
                                                        </span>
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'semester' && (
                                                <>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        {item.hasAppeared && item.sgpa !== null ? (
                                                            <span style={{
                                                                fontWeight: 900, fontSize: '1.05rem',
                                                                color: item.sgpa >= 8.5 ? '#047857' : item.sgpa >= 7.0 ? 'var(--primary)' : 'var(--tx-main)'
                                                            }}>
                                                                {item.sgpa.toFixed(2)}
                                                            </span>
                                                        ) : (
                                                            <span style={{
                                                                padding: '3px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 800,
                                                                background: item.isLateral ? 'rgba(217, 119, 6, 0.12)' : 'var(--surface-low)',
                                                                color: item.isLateral ? '#b45309' : 'var(--tx-muted)'
                                                            }}>
                                                                {item.statusText || 'Not Appeared'}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {item.hasAppeared ? `${item.credits || 20} Credits` : '—'}
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'subject' && (
                                                <>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {item.internal}
                                                    </td>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {item.external}
                                                    </td>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        <span style={{ fontWeight: 900, fontSize: '1.05rem', color: item.total >= 90 ? '#047857' : 'var(--tx-main)' }}>
                                                            {item.total}
                                                        </span>
                                                    </td>
                                                    <td className="lbTd" style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        {(() => {
                                                            const g = (item.grade || '').trim().toUpperCase();
                                                            const isHigh = g === 'O' || g === 'A+';
                                                            const isMid = g === 'A' || g === 'B+';
                                                            const isPass = g === 'B' || g === 'C' || g === 'P';
                                                            const isFail = g === 'F' || g === 'AB' || g === 'FAIL';
                                                            const bg = isHigh ? 'rgba(16, 185, 129, 0.12)' : isMid ? 'rgba(23, 75, 77, 0.10)' : isPass ? 'rgba(217, 119, 6, 0.12)' : isFail ? 'rgba(239, 68, 68, 0.12)' : 'var(--surface-low)';
                                                            const color = isHigh ? '#047857' : isMid ? 'var(--primary)' : isPass ? '#b45309' : isFail ? '#b91c1c' : 'var(--tx-muted)';
                                                            return (
                                                                <span style={{
                                                                    padding: '3px 9px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 900,
                                                                    background: bg, color: color
                                                                }}>
                                                                    {item.grade || '—'}
                                                                </span>
                                                            );
                                                        })()}
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                </div>
            </div>

            <style jsx>{`
                @keyframes lbSpin {
                    to { transform: rotate(360deg); }
                }
                @media (max-width: 640px) {
                    .lbPage {
                        padding: 14px 12px !important;
                    }
                    .lbHeader {
                        margin-bottom: 14px !important;
                        gap: 10px !important;
                    }
                    .lbTitle {
                        font-size: 1.25rem !important;
                    }
                    .lbStanding {
                        padding: 12px 14px !important;
                        gap: 10px !important;
                        margin-bottom: 12px !important;
                    }
                    .lbStandingAvatar {
                        width: 36px !important;
                        height: 36px !important;
                        font-size: 1rem !important;
                    }
                    .lbStandingStats {
                        width: 100% !important;
                        justify-content: space-between !important;
                        gap: 8px !important;
                    }
                    .lbStandingValue {
                        font-size: 1.1rem !important;
                    }
                    .lbPodium {
                        grid-template-columns: repeat(2, 1fr) !important;
                        gap: 8px !important;
                        margin-bottom: 12px !important;
                    }
                    .lbPodiumCard {
                        padding: 10px 12px !important;
                    }
                    .lbMedal {
                        width: 30px !important;
                        height: 30px !important;
                        font-size: 1.3rem !important;
                    }
                    .lbRankingHeader {
                        padding: 10px 14px !important;
                    }
                    .lbTabs {
                        margin-bottom: 10px !important;
                        gap: 2px !important;
                    }
                    :global(.lbTabBtn) {
                        padding: 8px 10px !important;
                        font-size: 0.82rem !important;
                    }
                    .lbSubFilters {
                        margin-bottom: 10px !important;
                        gap: 8px !important;
                    }
                    .lbSemRow {
                        width: 100% !important;
                    }
                    :global(.lbPillBtn) {
                        min-height: 34px !important;
                        padding: 5px 9px !important;
                        font-size: 0.74rem !important;
                    }
                    :global(.lbEntryPills) {
                        width: 100% !important;
                        justify-content: space-between !important;
                    }
                    :global(.lbEntryPills > button) {
                        flex: 1 1 0 !important;
                        justify-content: center !important;
                    }
                    :global(.lbTh) {
                        padding: 8px 10px !important;
                        font-size: 0.68rem !important;
                    }
                    :global(.lbTd) {
                        padding: 8px 10px !important;
                        font-size: 0.78rem !important;
                    }
                }
            `}</style>
        </AuthGuard>
    );
}
