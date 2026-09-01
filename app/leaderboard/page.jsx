'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiRequest, getStudentAuthHeaders } from '../../lib/api/client';
import AuthGuard from '../../components/AuthGuard';

export default function LeaderboardPage() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [data, setData] = useState(null);
    const [activeTab, setActiveTab] = useState('overall'); // 'overall' | 'semester' | 'subject'
    const [selectedSemester, setSelectedSemester] = useState(null);
    const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBatch, setSelectedBatch] = useState('');
    const [entryFilter, setEntryFilter] = useState('all'); // 'all' | 'regular' | 'lateral'

    const fetchLeaderboard = useCallback(async (sem = null, sub = null, batch = null) => {
        setLoading(true);
        setError('');
        try {
            const stuSession = localStorage.getItem('student_session');
            const session = stuSession ? JSON.parse(stuSession) : null;

            const query = {};
            if (sem) query.semester = sem;
            if (sub) query.subject_code = sub;
            if (batch) query.batch = batch;

            const res = await apiRequest('/api/student/leaderboard', {
                headers: getStudentAuthHeaders(session),
                query
            });

            setData(res);
            if (!selectedSemester && res?.targetSemester) {
                setSelectedSemester(res.targetSemester);
            }
            if (!selectedSubjectCode && res?.currentSubject?.subject_code) {
                setSelectedSubjectCode(res.currentSubject.subject_code);
            }
            if (!selectedBatch && res?.batch) {
                setSelectedBatch(res.batch);
            }
        } catch (err) {
            console.error('Fetch leaderboard error:', err);
            setError(err.message || 'Failed to load class leaderboard.');
        } finally {
            setLoading(false);
        }
    }, [selectedSemester, selectedSubjectCode, selectedBatch]);

    useEffect(() => {
        fetchLeaderboard();
    }, [fetchLeaderboard]);

    const handleSemesterChange = (sem) => {
        setSelectedSemester(sem);
        fetchLeaderboard(sem, null, selectedBatch);
    };

    const handleSubjectChange = (subCode) => {
        setSelectedSubjectCode(subCode);
        fetchLeaderboard(selectedSemester, subCode, selectedBatch);
    };

    const handleBatchChange = (batch) => {
        setSelectedBatch(batch);
        fetchLeaderboard(selectedSemester, selectedSubjectCode, batch);
    };

    // Filtered lists based on search query & entry filter
    const applyFilters = (list) => {
        if (!list) return [];
        let res = list;
        if (entryFilter === 'regular') res = res.filter(s => !s.isLateral);
        if (entryFilter === 'lateral') res = res.filter(s => s.isLateral);
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            res = res.filter(s => s.name?.toLowerCase().includes(q) || s.usn?.toLowerCase().includes(q));
        }
        return res;
    };

    const filteredOverall = useMemo(() => applyFilters(data?.overallLeaderboard), [data?.overallLeaderboard, searchQuery, entryFilter]);
    const filteredSemester = useMemo(() => applyFilters(data?.semesterLeaderboard), [data?.semesterLeaderboard, searchQuery, entryFilter]);
    const filteredSubject = useMemo(() => applyFilters(data?.subjectLeaderboard), [data?.subjectLeaderboard, searchQuery, entryFilter]);

    const top3Overall = useMemo(() => (filteredOverall || []).slice(0, 3), [filteredOverall]);
    const top3Semester = useMemo(() => (filteredSemester || []).slice(0, 3), [filteredSemester]);
    const top3Subject = useMemo(() => (filteredSubject || []).slice(0, 3), [filteredSubject]);

    const getMedal = (rank) => {
        if (rank === 1) return { icon: '🥇', label: '1st Place', color: '#D97706', bg: 'rgba(245, 158, 11, 0.12)' };
        if (rank === 2) return { icon: '🥈', label: '2nd Place', color: '#4B5563', bg: 'rgba(107, 114, 128, 0.12)' };
        if (rank === 3) return { icon: '🥉', label: '3rd Place', color: '#B45309', bg: 'rgba(217, 119, 6, 0.12)' };
        return { icon: `#${rank}`, label: `Rank ${rank}`, color: 'var(--tx-muted)', bg: 'var(--surface-low)' };
    };

    return (
        <AuthGuard role="student">
            <div style={{ maxWidth: '1280px', margin: '0 auto', padding: 'var(--page-py, 24px) var(--page-px, 20px)' }}>
                {/* Header & Cohort Info */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                            <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '28px' }}>emoji_events</span>
                            <h1 style={{ margin: 0, fontSize: '1.8rem', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.03em' }}>
                                Class Leaderboard & Toppers
                            </h1>
                        </div>
                        <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--tx-muted)' }}>
                            Department: <strong>{data?.batchName || data?.batch || 'Class'}</strong> — Total <strong>{data?.totalStudents || 0} Students</strong>
                            {data?.lateralCount > 0 && ` (${data.regularCount} Regular + ${data.lateralCount} Lateral Entry)`}.
                        </p>
                    </div>

                    {/* Department Cohort Selector */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--tx-muted)' }}>Department:</span>
                        <select
                            value={selectedBatch || data?.batch || 'CS'}
                            onChange={(e) => handleBatchChange(e.target.value)}
                            style={{
                                padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border)',
                                background: '#ffffff', color: 'var(--tx-main)', fontWeight: 700, fontSize: '0.9rem'
                            }}
                        >
                            <option value="CS">Computer Science & Engineering (86 Students)</option>
                            <option value="CI">AI & Design / IoT (33 Students)</option>
                            <option value="CD">Data Science (28 Students)</option>
                            <option value="CV">Civil Engineering (3 Students)</option>
                        </select>
                    </div>
                </div>

                {/* Logged-In Student Quick Standing Banner */}
                {data?.currentUser && (
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(23, 75, 77, 0.08) 0%, rgba(23, 75, 77, 0.02) 100%)',
                        border: '1.5px solid rgba(23, 75, 77, 0.25)',
                        borderRadius: '14px', padding: '18px 22px', marginBottom: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                            <div style={{
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

                        <div style={{ display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap' }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Overall Rank</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--primary)' }}>
                                    #{data.currentUser.overallRank || '—'} <span style={{ fontSize: '0.85rem', color: 'var(--tx-muted)', fontWeight: 600 }}>/ {data.totalStudents}</span>
                                </div>
                            </div>

                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Overall CGPA</div>
                                <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--tx-main)' }}>
                                    {data.currentUser.overallCGPA !== null ? data.currentUser.overallCGPA.toFixed(2) : '—'}
                                </div>
                            </div>

                            {data.currentUser.semesterRank && (
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--tx-muted)', textTransform: 'uppercase' }}>Sem {data.targetSemester} SGPA</div>
                                    <div style={{ fontSize: '1.4rem', fontWeight: 900, color: '#047857' }}>
                                        {data.currentUser.semesterSGPA ? data.currentUser.semesterSGPA.toFixed(2) : '—'}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* View Tabs */}
                <div style={{
                    display: 'flex', gap: '8px', borderBottom: '2px solid var(--border)',
                    marginBottom: '24px', overflowX: 'auto', paddingBottom: '2px'
                }}>
                    <button
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
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                    {/* Search Bar */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', minWidth: '240px', flex: '1 1 240px' }}>
                        <span className="material-icons-round" style={{ color: 'var(--tx-muted)', fontSize: '18px' }}>search</span>
                        <input
                            type="text"
                            placeholder="Search classmate name or USN..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ border: 'none', outline: 'none', width: '100%', fontSize: '0.88rem', background: 'transparent', color: 'var(--tx-main)' }}
                        />
                    </div>

                    {/* Entry Type Filter Pills */}
                    {data?.lateralCount > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--surface-low)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <button
                                onClick={() => setEntryFilter('all')}
                                style={{
                                    padding: '5px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                                    background: entryFilter === 'all' ? 'var(--surface)' : 'transparent',
                                    color: entryFilter === 'all' ? 'var(--tx-main)' : 'var(--tx-muted)',
                                    boxShadow: entryFilter === 'all' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                                }}
                            >
                                All ({data.totalStudents})
                            </button>
                            <button
                                onClick={() => setEntryFilter('regular')}
                                style={{
                                    padding: '5px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
                                    background: entryFilter === 'regular' ? 'var(--surface)' : 'transparent',
                                    color: entryFilter === 'regular' ? 'var(--tx-main)' : 'var(--tx-muted)',
                                    boxShadow: entryFilter === 'regular' ? '0 2px 4px rgba(0,0,0,0.06)' : 'none'
                                }}
                            >
                                Regular ({data.regularCount})
                            </button>
                            <button
                                onClick={() => setEntryFilter('lateral')}
                                style={{
                                    padding: '5px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, border: 'none', cursor: 'pointer',
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--tx-muted)' }}>Semester:</span>
                            {(data?.availableSemesters || [1,2,3,4,5,6]).map(sem => (
                                <button
                                    key={sem}
                                    onClick={() => handleSemesterChange(sem)}
                                    style={{
                                        padding: '6px 12px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 700,
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--tx-muted)' }}>Subject:</span>
                            <select
                                value={selectedSubjectCode || data?.currentSubject?.subject_code || ''}
                                onChange={(e) => handleSubjectChange(e.target.value)}
                                style={{
                                    padding: '7px 12px', borderRadius: '6px', border: '1px solid var(--border)',
                                    background: '#ffffff', color: 'var(--tx-main)', fontWeight: 600, fontSize: '0.85rem',
                                    maxWidth: '300px'
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

                {/* Podium Display for Top 3 */}
                {!searchQuery && (
                    <div style={{
                        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: '16px', marginBottom: '24px'
                    }}>
                        {(activeTab === 'overall' ? top3Overall : activeTab === 'semester' ? top3Semester : top3Subject).map((topper, idx) => {
                            const medal = getMedal(idx + 1);
                            const scoreLabel = activeTab === 'overall'
                                ? `CGPA: ${topper.cgpa?.toFixed(2)}`
                                : activeTab === 'semester'
                                ? `SGPA: ${topper.sgpa?.toFixed(2)}`
                                : `Score: ${topper.total}/100 (CIE ${topper.internal} + SEE ${topper.external})`;

                            return (
                                <div
                                    key={topper.usn}
                                    style={{
                                        background: topper.isCurrentUser ? 'rgba(23, 75, 77, 0.05)' : 'var(--surface)',
                                        border: topper.isCurrentUser ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        borderRadius: '14px', padding: '18px 20px', position: 'relative',
                                        boxShadow: idx === 0 ? '0 8px 20px rgba(217, 119, 6, 0.12)' : '0 4px 12px rgba(0,0,0,0.03)',
                                        overflow: 'hidden'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                        <div style={{
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
                                        fontWeight: 800, fontSize: '0.92rem', color: idx === 0 ? '#b45309' : 'var(--tx-main)',
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
                <div style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
                    overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                }}>
                    <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface-low)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--tx-main)' }}>
                            {activeTab === 'overall' && `Complete Class Ranking — Overall CGPA (${filteredOverall.length} Students)`}
                            {activeTab === 'semester' && `Semester ${selectedSemester || 1} SGPA Ranking (${filteredSemester.length} Students)`}
                            {activeTab === 'subject' && `${data?.currentSubject?.subject_name || 'Subject'} Marks Leaderboard (${filteredSubject.length} Students)`}
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', background: '#ffffff' }}>
                                    <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', width: '80px' }}>Rank</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)' }}>Student Name</th>
                                    <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)' }}>USN</th>

                                    {activeTab === 'overall' && (
                                        <>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>CGPA</th>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Semesters</th>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Backlogs</th>
                                        </>
                                    )}

                                    {activeTab === 'semester' && (
                                        <>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>SGPA</th>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Credits</th>
                                        </>
                                    )}

                                    {activeTab === 'subject' && (
                                        <>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>CIE /50</th>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>SEE /50</th>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Total /100</th>
                                            <th style={{ padding: '12px 18px', fontWeight: 700, color: 'var(--tx-muted)', textAlign: 'center' }}>Grade</th>
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
                                            <td style={{ padding: '14px 18px' }}>
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

                                            <td style={{ padding: '14px 18px' }}>
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

                                            <td style={{ padding: '14px 18px', fontFamily: 'monospace', color: 'var(--tx-muted)', fontSize: '0.84rem' }}>
                                                {item.usn}
                                            </td>

                                            {activeTab === 'overall' && (
                                                <>
                                                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontWeight: 900, fontSize: '1.05rem',
                                                            color: item.cgpa >= 8.5 ? '#047857' : item.cgpa >= 7.0 ? 'var(--primary)' : 'var(--tx-main)'
                                                        }}>
                                                            {item.cgpa ? item.cgpa.toFixed(2) : '—'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {item.semestersTracked} Sems
                                                    </td>
                                                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
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
                                                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        <span style={{
                                                            fontWeight: 900, fontSize: '1.05rem',
                                                            color: item.sgpa >= 8.5 ? '#047857' : item.sgpa >= 7.0 ? 'var(--primary)' : 'var(--tx-main)'
                                                        }}>
                                                            {item.sgpa ? item.sgpa.toFixed(2) : '—'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {item.credits || 20} Credits
                                                    </td>
                                                </>
                                            )}

                                            {activeTab === 'subject' && (
                                                <>
                                                    <td style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {item.internal}
                                                    </td>
                                                    <td style={{ padding: '14px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                        {item.external}
                                                    </td>
                                                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        <span style={{ fontWeight: 900, fontSize: '1.05rem', color: item.total >= 90 ? '#047857' : 'var(--tx-main)' }}>
                                                            {item.total}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '14px 18px', textAlign: 'center' }}>
                                                        <span style={{
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 900,
                                                            background: item.grade === 'O' || item.grade === 'A+' ? 'rgba(16, 185, 129, 0.12)' : 'var(--surface-low)',
                                                            color: item.grade === 'O' || item.grade === 'A+' ? '#047857' : 'var(--tx-main)'
                                                        }}>
                                                            {item.grade}
                                                        </span>
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
        </AuthGuard>
    );
}
