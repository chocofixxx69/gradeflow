'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import AuthGuard from '@/components/AuthGuard';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Select, Input } from '@/components/ui/Foundation';

import { getSavedFilters, saveFilters } from '@/lib/faculty-filter-store';
import { getCachedApiData, apiRequest } from '@/lib/api/client';
import { fetchLeaderboard } from '@/lib/api/analytics';

export default function FacultyLeaderboardPage() {
    return (
        <AuthGuard role="faculty">
            <FacultyLeaderboardContent />
        </AuthGuard>
    );
}

const TABS = [
    { id: 'overall', label: 'Overall (CGPA)', icon: 'military_tech' },
    { id: 'semester', label: 'Semester-Wise (SGPA)', icon: 'date_range' },
    { id: 'subject', label: 'Subject-Wise (Marks)', icon: 'menu_book' },
];

const MEDAL = {
    1: { icon: '🥇', label: '1st Place', color: '#B45309', bg: 'rgba(245, 158, 11, 0.12)' },
    2: { icon: '🥈', label: '2nd Place', color: '#4B5563', bg: 'rgba(107, 114, 128, 0.12)' },
    3: { icon: '🥉', label: '3rd Place', color: '#B45309', bg: 'rgba(217, 119, 6, 0.12)' },
};

function FacultyLeaderboardContent() {
    const initialSaved = getSavedFilters();
    const initialMeta = getCachedApiData('/api/faculty/analytics/meta');

    const [meta, setMeta] = useState(() => initialMeta || { branches: [] });
    const [branch, setBranch] = useState(() => initialSaved.branch || initialMeta?.branches?.[0]?.code || 'CS');
    const [section, setSection] = useState(''); // '' = all sections this faculty teaches
    const [activeTab, setActiveTab] = useState('overall');
    const [viewSemester, setViewSemester] = useState(null);
    const [subjectCode, setSubjectCode] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        saveFilters({ branch });
    }, [branch]);

    useEffect(() => {
        async function loadMeta() {
            try {
                const res = await apiRequest('/api/faculty/analytics/meta');
                if (res) setMeta(res);
            } catch (err) {
                console.error('Failed to load meta:', err);
            }
        }
        loadMeta();
    }, []);

    // Section list depends on branch — a section picked under one branch may
    // not exist under another, so switching branch always resets it rather
    // than silently carrying over a now-invalid filter.
    useEffect(() => {
        setSection('');
    }, [branch]);

    const loadLeaderboard = useCallback(async () => {
        if (!branch) return;
        setLoading(true);
        setError('');
        try {
            const res = await fetchLeaderboard({ filters: { branch, section: section || undefined }, viewSemester, subjectCode });
            setData(res);
            if (!viewSemester && res?.targetSemester) setViewSemester(res.targetSemester);
        } catch (err) {
            console.error('Failed to load leaderboard:', err);
            setError(err.message || 'Failed to load class leaderboard.');
        } finally {
            setLoading(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [branch, section, viewSemester, subjectCode]);

    useEffect(() => {
        loadLeaderboard();
    }, [loadLeaderboard]);

    const rows = useMemo(() => {
        const base = activeTab === 'overall'
            ? (data?.overallLeaderboard || [])
            : activeTab === 'semester'
                ? (data?.allSemestersLeaderboard?.[viewSemester || data?.targetSemester] || [])
                : (data?.subjectLeaderboard || []);
        if (!searchQuery) return base;
        const q = searchQuery.toLowerCase();
        return base.filter(r => r.name?.toLowerCase().includes(q) || r.usn?.toLowerCase().includes(q));
    }, [data, activeTab, viewSemester, searchQuery]);

    const top3 = useMemo(() => (searchQuery ? [] : rows.filter(r => typeof r.rank === 'number' && r.rank <= 3).slice(0, 3)), [rows, searchQuery]);

    const subjectOptions = (data?.availableSubjects || [])
        .filter(s => !viewSemester || s.semester === viewSemester)
        .map(s => ({ value: s.subject_code, label: `${s.subject_code} - ${s.subject_name}` }));

    const scoreLabel = (row) => activeTab === 'overall'
        ? `CGPA ${row.cgpa?.toFixed(2) ?? '—'}`
        : activeTab === 'semester'
            ? `SGPA ${row.sgpa?.toFixed(2) ?? '—'}`
            : `${row.total}/100`;

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1400px', margin: '0 auto' }} className="gf-fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Class Standing</PageHeaderEyebrow>
                    <PageHeaderTitle>Class Leaderboard &amp; Toppers</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Overall, semester-wise, and subject-wise rankings for the students in your assigned classes.
                    </PageHeaderSubtitle>
                </PageHeader>
                <Button onClick={loadLeaderboard} variant="primary">
                    <span className="material-icons-round" style={{ fontSize: '18px', marginRight: '6px' }}>sync</span>
                    Refresh
                </Button>
            </div>

            <Card style={{ marginBottom: '20px' }}>
                <CardContent style={{ padding: '16px 20px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '14px', alignItems: 'flex-end', marginBottom: '14px' }}>
                        <Select
                            label="Department / Branch"
                            value={branch}
                            onChange={e => setBranch(e.target.value)}
                            options={(meta.branches || []).map(b => ({ value: b.code, label: `${b.code} - ${b.label || b.name}` }))}
                        />
                        <Select
                            label="Section"
                            value={section}
                            onChange={e => setSection(e.target.value)}
                            options={[
                                { value: '', label: `All Sections (${(data?.availableSections || []).length || 0})` },
                                ...(data?.availableSections || []).map(s => ({ value: s, label: `Section ${s}` })),
                            ]}
                        />
                        {(activeTab === 'semester' || activeTab === 'subject') && (
                            <Select
                                label="Semester"
                                value={viewSemester || data?.targetSemester || ''}
                                onChange={e => setViewSemester(Number(e.target.value))}
                                options={(data?.availableSemesters || []).map(s => ({ value: s, label: `Semester ${s}` }))}
                            />
                        )}
                        {activeTab === 'subject' && (
                            <Select
                                label="Subject"
                                value={subjectCode || data?.currentSubject?.subject_code || ''}
                                onChange={e => setSubjectCode(e.target.value)}
                                options={subjectOptions}
                            />
                        )}
                        <Input
                            label="Find Student"
                            placeholder="Search by USN or Name..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {TABS.map(t => (
                            <Button
                                key={t.id}
                                variant={activeTab === t.id ? 'primary' : 'ghost'}
                                size="sm"
                                onClick={() => setActiveTab(t.id)}
                            >
                                <span className="material-icons-round" style={{ fontSize: '16px', marginRight: '6px' }}>{t.icon}</span>
                                {t.label}
                            </Button>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {error && (
                <Card style={{ marginBottom: '20px', borderColor: '#fca5a5' }}>
                    <CardContent style={{ padding: '14px 20px', color: '#b91c1c' }}>{error}</CardContent>
                </Card>
            )}

            {!error && data && (
                <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--tx-muted)' }}>
                    <strong>{data.totalStudents}</strong> students
                    {data.lateralCount > 0 && ` (${data.regularCount} regular + ${data.lateralCount} lateral entry)`}
                    {' '}in scope.
                </p>
            )}

            {top3.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '20px' }}>
                    {top3.map(row => {
                        const medal = MEDAL[row.rank];
                        return (
                            <Card key={row.usn}>
                                <CardContent style={{ padding: '16px 18px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <div style={{ fontSize: '1.5rem', width: '36px', height: '36px', borderRadius: '50%', background: medal.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {medal.icon}
                                        </div>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: medal.color, textTransform: 'uppercase' }}>{medal.label}</span>
                                    </div>
                                    <div style={{ fontWeight: 800 }}>{row.name}{row.isLateral && <span style={{ marginLeft: 6, fontSize: '0.68rem', fontWeight: 800, color: '#b45309' }}>LATERAL</span>}</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--tx-muted)' }}>{row.usn}</div>
                                    <div style={{ marginTop: '8px', fontWeight: 800, color: medal.color }}>{scoreLabel(row)}</div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            <Card>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                <th style={{ padding: '12px 18px', width: '70px' }}>Rank</th>
                                <th style={{ padding: '12px 18px' }}>Student</th>
                                {activeTab === 'overall' && (<>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>CGPA</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>Semesters</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>Backlogs</th>
                                </>)}
                                {activeTab === 'semester' && (<>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>SGPA</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>Credits</th>
                                </>)}
                                {activeTab === 'subject' && (<>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>CIE</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>SEE</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>Total</th>
                                    <th style={{ padding: '12px 18px', textAlign: 'center' }}>Grade</th>
                                </>)}
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--tx-muted)' }}>Loading…</td></tr>
                            )}
                            {!loading && rows.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--tx-muted)' }}>No data for this scope.</td></tr>
                            )}
                            {!loading && rows.map(row => (
                                <tr key={row.usn} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '12px 18px' }}>
                                        {typeof row.rank === 'number' && row.rank <= 3 ? MEDAL[row.rank].icon : `#${row.rank}`}
                                    </td>
                                    <td style={{ padding: '12px 18px' }}>
                                        <div style={{ fontWeight: 700 }}>{row.name}{row.isLateral && <span style={{ marginLeft: 6, fontSize: '0.68rem', fontWeight: 800, color: '#b45309' }}>LATERAL</span>}</div>
                                        <div style={{ fontFamily: 'monospace', fontSize: '0.8rem', color: 'var(--tx-muted)' }}>{row.usn}</div>
                                    </td>
                                    {activeTab === 'overall' && (<>
                                        <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 800 }}>{row.cgpa ? row.cgpa.toFixed(2) : '—'}</td>
                                        <td style={{ padding: '12px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>{row.semestersTracked} Sems</td>
                                        <td style={{ padding: '12px 18px', textAlign: 'center' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, background: row.totalBacklogs > 0 ? 'rgba(239,68,68,0.12)' : 'rgba(16,185,129,0.12)', color: row.totalBacklogs > 0 ? '#b91c1c' : '#047857' }}>
                                                {row.totalBacklogs === 0 ? 'All Clear' : `${row.totalBacklogs} Backlog`}
                                            </span>
                                        </td>
                                    </>)}
                                    {activeTab === 'semester' && (<>
                                        <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 800 }}>{row.hasAppeared ? row.sgpa.toFixed(2) : '—'}</td>
                                        <td style={{ padding: '12px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>{row.hasAppeared ? row.credits : '—'}</td>
                                    </>)}
                                    {activeTab === 'subject' && (<>
                                        <td style={{ padding: '12px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>{row.internal}</td>
                                        <td style={{ padding: '12px 18px', textAlign: 'center', color: 'var(--tx-muted)' }}>{row.external}</td>
                                        <td style={{ padding: '12px 18px', textAlign: 'center', fontWeight: 800 }}>{row.total}</td>
                                        <td style={{ padding: '12px 18px', textAlign: 'center' }}>{row.grade || '—'}</td>
                                    </>)}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </Card>
        </div>
    );
}
