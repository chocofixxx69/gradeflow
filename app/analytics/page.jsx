'use client';

import { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api/client';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';
import { ResponsiveGrid, Stack } from '@/components/ui/Foundation';
import { getGradePoint, getGradeRank, unifyGrade } from '../../lib/vtuGrades';
import {
    ResponsiveContainer,
    AreaChart,
    Area,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
    Cell
} from 'recharts';
import { assessYearBackRisk } from '../../lib/semester-utils';

function AnalyticsContent() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [userType, setUserType] = useState(null);
    const [semesterData, setSemesterData] = useState([]);
    const [gradeDistribution, setGradeDistribution] = useState({});
    const [cgpa, setCgpa] = useState(0);
    const [totalCredits, setTotalCredits] = useState(0);
    const [backlogCount, setBacklogCount] = useState(0);
    const [facultyActivity, setFacultyActivity] = useState([]);
    const [studentName, setStudentName] = useState('');

    // Advanced Analytics states
    const [targetCgpa, setTargetCgpa] = useState(8.5);
    const [requiredSgpa, setRequiredSgpa] = useState(0);
    const [remainingSems, setRemainingSems] = useState(4);
    const [topSubjects, setTopSubjects] = useState([]);
    const [yearBackRisk, setYearBackRisk] = useState({ hasRisk: false, risks: [], level: 'NONE', totalActiveBacklogs: 0 });
    const [subjectPassRates, setSubjectPassRates] = useState([]);

    const calcSGPA = (subjects) => {
        const excludeGrades = ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'];

        // Deduplicate per subject code — keep best grade
        const subjectsPool = {};
        subjects.forEach(m => {
            const code = (m.subject_code || m.code || '').trim().toUpperCase();
            if (!code) return;
            const existing = subjectsPool[code];
            if (!existing) { subjectsPool[code] = m; return; }
            const newRank = getGradeRank(m.grade);
            const oldRank = getGradeRank(existing.grade);
            if (newRank > oldRank) subjectsPool[code] = m;
        });

        const poolItems = Object.values(subjectsPool);
        const validSubs = poolItems.filter(m => !excludeGrades.includes((m.grade || '').trim().toUpperCase()));

        // Credit-weighted SGPA — same formula as Dashboard
        let totalCredits = 0, totalCreditPoints = 0, backlogs = 0;
        validSubs.forEach(m => {
            const grade = (m.grade || '').trim().toUpperCase();
            const unified = unifyGrade(grade);
            const credits = Number(m.credits) || 3;
            const totalScore = m.total_marks ?? m.total ?? m.marks ?? null;
            const gp = getGradePoint(grade, '2022', totalScore, m.see_marks ?? m.external ?? null);
            totalCredits += credits;
            totalCreditPoints += gp * credits;
            if (unified !== 'P') backlogs++;
        });

        const sgpa = totalCredits > 0 ? totalCreditPoints / totalCredits : 0;

        return { sgpa, totalCredits: totalCredits || 20, backlogs };
    };

    useEffect(() => {
        const facSession = localStorage.getItem('faculty_session');
        const stuSession = localStorage.getItem('student_session');

        if (facSession) {
            setUserType('faculty');
            fetchFacultyAnalytics();
        } else if (stuSession) {
            setUserType('student');
            const { usn, name } = JSON.parse(stuSession);
            setStudentName(name || usn);
            fetchStudentAnalytics(usn);
        } else {
            setLoading(false);
        }
    }, []);

    const fetchStudentAnalytics = async (usn) => {
        setLoading(true);
        try {
            const res = await apiRequest('/api/student/results', { headers: { 'x-student-usn': usn } });
            const marks1 = [];
            const marks2 = res?.subjectMarks || [];

            // Combine all sources
            const allRaw = [
                ...(marks1 || []).map(m => ({ ...m, source: 'manual' })),
                ...(marks2 || []).map(m => ({
                    ...m,
                    source: 'scraped',
                    total_marks: m.total_marks ?? m.total ?? m.marks ?? null,
                    subject_code: m.subject_code || m.code,
                    subject_name: m.subject_name || m.name
                }))
            ];

            // ── DEDUPLICATION ──
            const bestByCode = {};
            allRaw.forEach(m => {
                const code = (m.subject_code || '').trim().toUpperCase();
                if (!code) return;

                const existing = bestByCode[code];
                if (!existing) {
                    bestByCode[code] = m;
                    return;
                }

                const newRank = getGradeRank(m.grade);
                const oldRank = getGradeRank(existing.grade);

                if (newRank > oldRank) {
                    bestByCode[code] = m;
                } else if (newRank === oldRank) {
                    const newTotal = Number(m.total_marks || 0);
                    const oldTotal = Number(existing.total_marks || 0);
                    if (newTotal > oldTotal) {
                        bestByCode[code] = m;
                    } else if (newTotal === oldTotal && m.id > existing.id) {
                        bestByCode[code] = m;
                    }
                }
            });

            const deduplicated = Object.values(bestByCode);

            // Group by semester for trajectory
            const semGroups = {};
            deduplicated.forEach(m => {
                const sem = m.semester || 1;
                if (!semGroups[sem]) semGroups[sem] = [];
                semGroups[sem].push(m);
            });

            const semData = Object.entries(semGroups)
                .sort(([a], [b]) => parseInt(a) - parseInt(b))
                .map(([sem, subjects]) => {
                    const stats = calcSGPA(subjects);
                    return {
                        semester: parseInt(sem),
                        sgpa: stats.sgpa,
                        subjects: subjects.length,
                        credits: stats.totalCredits,
                        backlogs: stats.backlogs
                    };
                });

            setSemesterData(semData);

            // Grade Density
            const gradeDist = {};
            deduplicated.forEach(m => {
                const g = m.grade || 'Unknown';
                gradeDist[g] = (gradeDist[g] || 0) + 1;
            });
            setGradeDistribution(gradeDist);

            // True CGPA and Credits
            let totalPts = 0, totalCr = 0, totalBacklogs = 0;
            semData.forEach(s => {
                totalPts += s.sgpa * s.credits;
                totalCr += s.credits;
                totalBacklogs += s.backlogs;
            });

            const currentCgpa = totalCr > 0 ? totalPts / totalCr : 0;
            setCgpa(currentCgpa);
            setTotalCredits(totalCr);
            setBacklogCount(totalBacklogs);

            // Top Performers
            setTopSubjects(deduplicated
                .sort((a, b) => (b.total_marks || 0) - (a.total_marks || 0))
                .slice(0, 5)
            );

            // Year Back Risk Assessment
            const semStatsForRisk = {};
            semData.forEach(s => {
                semStatsForRisk[s.semester] = { backlogs: s.backlogs, sgpa: s.sgpa };
            });
            setYearBackRisk(assessYearBackRisk(semStatsForRisk, deduplicated));

            // Projection
            const remainingCr = remainingSems * 20;
            const req = ((targetCgpa * (totalCr + remainingCr)) - (currentCgpa * totalCr)) / remainingCr;
            setRequiredSgpa(req);

        } catch (e) {
            console.error('Analytics error:', e);
        }
        setLoading(false);
    };

    const fetchFacultyAnalytics = async () => {
        setLoading(true);
        try {
            const { data: logs } = await supabase
                .from('faculty_activity')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            setFacultyActivity(logs || []);

            const byFaculty = {};
            (logs || []).forEach(l => {
                const name = l.faculty_name || 'Unknown';
                byFaculty[name] = (byFaculty[name] || 0) + 1;
            });
            setGradeDistribution(byFaculty);
        } catch (e) {
            console.error('Faculty error:', e);
        }
        setLoading(false);
    };

    const gradeColors = {
        'O': '#16A34A', 'S': '#16A34A', 'A+': '#16A34A', 'A': '#174B4D',
        'B+': 'var(--primary)', 'B': '#D97706', 'C': '#0891B2', 'P': '#78716C',
        'F': '#DC2626', 'Ab': '#DC2626', 'Unknown': '#A8A29E'
    };

    const maxGradeCount = Math.max(...Object.values(gradeDistribution), 1);

    const s = {
        header: { marginBottom: '32px', position: 'relative' },
        label: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.15em', marginBottom: '8px', display: 'block' },
        title: { fontSize: 'clamp(24px, 5vw, 36px)', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', marginBottom: '8px' },
        subtitle: { fontSize: 'clamp(13px, 2vw, 16px)', fontWeight: 500, color: 'var(--tx-muted)', maxWidth: '600px', lineHeight: 1.6 },

        card: {
            background: 'var(--surface-low)', borderRadius: '12px', padding: '24px',
            border: '1px solid var(--border)', transition: 'transform 0.2s',
            boxShadow: 'var(--elevation-flat)'
        },
        cardLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '16px' },
        cardVal: { fontSize: '36px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em', lineHeight: 1 },
        cardSub: { fontSize: '13px', fontWeight: 700, color: 'var(--tx-muted)', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '4px' },

        chartCard: { background: 'var(--surface-low)', borderRadius: '12px', padding: '24px', border: '1px solid var(--border)', marginBottom: '24px', minWidth: 0 },
        chartHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', gap: 'var(--space-3)', flexWrap: 'wrap' },
        chartTitle: { fontSize: '16px', fontWeight: 800, color: 'var(--tx-main)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', minWidth: 0 },

        col: {},

        miniTableWrap: { marginTop: '24px', maxHeight: '400px', overflow: 'auto', WebkitOverflowScrolling: 'touch' },
        miniTable: { width: '100%', minWidth: '680px', borderCollapse: 'collapse' },
        miniTh: { textAlign: 'left', padding: '12px 16px', background: 'var(--surface-low)', fontSize: '9px', fontWeight: 850, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em' },
        miniTd: { padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: '13px', fontWeight: 600, color: 'var(--tx-main)' },

        goalInput: {
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '4px 8px', minHeight: '36px', fontSize: '13px', fontWeight: 800, width: '64px', color: 'var(--primary)',
            textAlign: 'center', marginLeft: '8px', boxSizing: 'border-box'
        }
    };

    if (loading) return (
        <div className="gf-page gf-page-wide" style={{ textAlign: 'center', paddingBlock: '120px' }}>
            <span className="material-icons-round gf-spin" style={{ fontSize: '48px', color: 'var(--primary)' }}>sync</span>
            <p style={{ marginTop: '20px', fontWeight: 700, color: 'var(--tx-dim)' }}>Generating Advanced Insights...</p>
        </div>
    );

    const percentage = Math.max(0, (cgpa - 0.75) * 10);
    const classification = cgpa >= 7.75 ? 'First Class Distinction' : cgpa >= 6.75 ? 'First Class' : cgpa >= 5.0 ? 'Pass' : 'Failed';

    return (
        <div className="gf-page gf-page-wide gf-fade-up">
            <header style={s.header}>
                <span style={s.label}>{userType === 'faculty' ? 'Institutional Intelligence' : 'Personal Academic Matrix'}</span>
                <h1 style={s.title}>Performance Analytics</h1>
                <p style={s.subtitle}>
                    {userType === 'faculty'
                        ? 'High-level institutional monitoring, faculty engagement patterns, and resource allocation insights.'
                        : `Advanced trend analysis for ${studentName}. Track your trajectory and achieve your academic goals.`}
                </p>
            </header>

            {userType === 'student' && (
                <>
                    {/* Summary Matrix */}
                    <ResponsiveGrid size="md" style={{ marginBottom: 'var(--space-8)' }}>
                        <div style={{ ...s.card, background: 'var(--primary)', border: 'none', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', background: 'radial-gradient(circle, rgba(255,255,255,0.05) 0%, transparent 70%)', pointerEvents: 'none' }} />

                            <div style={{ ...s.cardLabel, color: 'var(--bg)', opacity: 0.8, position: 'relative' }}>Current CGPA</div>
                            <div style={{ ...s.cardVal, color: 'var(--bg)', position: 'relative' }}>{cgpa > 0 ? cgpa.toFixed(2) : '0.00'}</div>
                            <div style={{ ...s.cardSub, color: 'var(--bg)', opacity: 0.9, position: 'relative' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px' }}>stars</span>
                                {classification}
                            </div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Average %</div>
                            <div style={s.cardVal}>{percentage > 0 ? `${percentage.toFixed(1)}%` : '—'}</div>
                            <div style={s.cardSub}>VTU Equivalence</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Academic Standing</div>
                            <div style={{ ...s.cardVal, color: cgpa >= 8.5 ? '#16A34A' : cgpa >= 7.5 ? 'var(--primary)' : 'var(--tx-main)' }}>
                                {cgpa >= 9 ? 'S' : cgpa >= 8 ? 'A+' : cgpa >= 7 ? 'A' : cgpa >= 6 ? 'B+' : 'C'}
                            </div>
                            <div style={s.cardSub}>Rank Percentile</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Backlogs</div>
                            <div style={{ ...s.cardVal, color: backlogCount > 0 ? '#DC2626' : '#16A34A' }}>{backlogCount}</div>
                            <div style={s.cardSub}>{backlogCount === 0 ? 'Consistent Standing' : 'Needs attention'}</div>
                        </div>
                    </ResponsiveGrid>

                    {/* Year-Back Risk Assessment */}
                    {yearBackRisk.hasRisk && (
                        <div style={{ ...s.chartCard, borderLeft: `4px solid ${yearBackRisk.level === 'CRITICAL' ? '#DC2626' : yearBackRisk.level === 'HIGH' ? '#D97706' : '#2563EB'}`, marginBottom: '24px' }}>
                            <div style={s.chartTitle}>
                                <span className="material-icons-round" style={{ color: yearBackRisk.level === 'CRITICAL' ? '#DC2626' : '#D97706' }}>warning</span>
                                Year-Back Risk Analysis
                                <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 900, padding: '4px 12px', borderRadius: '8px', background: yearBackRisk.level === 'CRITICAL' ? '#FEF2F2' : yearBackRisk.level === 'HIGH' ? '#FFFBEB' : '#EFF6FF', color: yearBackRisk.level === 'CRITICAL' ? '#DC2626' : yearBackRisk.level === 'HIGH' ? '#D97706' : '#2563EB' }}>
                                    {yearBackRisk.level}
                                </span>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-muted)', marginBottom: '8px' }}>
                                    Total Active Backlogs: <strong style={{ color: 'var(--red)' }}>{yearBackRisk.totalActiveBacklogs}</strong>
                                </div>
                                {yearBackRisk.risks.map((risk, i) => (
                                    <div key={i} style={{ padding: '12px 16px', background: risk.severity === 'HIGH' ? 'var(--red-bg)' : 'var(--surface)', borderRadius: '8px', border: `1px solid ${risk.severity === 'HIGH' ? 'var(--red)' : 'var(--border)'}` }}>
                                        <div style={{ fontSize: '12px', fontWeight: 700, color: risk.severity === 'HIGH' ? 'var(--red)' : 'var(--tx-main)' }}>{risk.message}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Stack size="md">
                        {/* SGPA Trends Line Chart */}
                        <div style={s.chartCard}>
                            <div style={s.chartHeader}>
                                <div style={s.chartTitle}>
                                    <span className="material-icons-round" style={{ color: 'var(--primary)' }}>show_chart</span>
                                    Semester SGPA Progression Trajectory
                                </div>
                            </div>
                            {semesterData.length > 0 ? (
                                <div style={{ height: '280px', width: '100%', marginTop: '12px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={semesterData.map(s => ({ name: `Sem ${s.semester}`, sgpa: Number(s.sgpa.toFixed(2)) }))} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="sgpaGradient" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#174B4D" stopOpacity={0.4}/>
                                                    <stop offset="95%" stopColor="#174B4D" stopOpacity={0.0}/>
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                            <XAxis dataKey="name" stroke="var(--tx-dim)" fontSize={12} tickLine={false} />
                                            <YAxis domain={[0, 10]} stroke="var(--tx-dim)" fontSize={12} tickLine={false} />
                                            <Tooltip
                                                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--tx-main)', fontWeight: 700 }}
                                                formatter={(value) => [`${value} SGPA`, 'Performance']}
                                            />
                                            <Area type="monotone" dataKey="sgpa" stroke="#174B4D" strokeWidth={3} fillOpacity={1} fill="url(#sgpaGradient)" dot={{ r: 6, fill: '#174B4D' }} activeDot={{ r: 8 }} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>No longitudinal data found.</div>
                            )}
                        </div>

                        {/* Projection Card */}
                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>
                                <span className="material-icons-round" style={{ color: '#D97706' }}>auto_awesome</span>
                                Goal Projection Calculator
                            </div>
                            <div style={{ marginTop: '20px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--tx-muted)', marginBottom: '16px' }}>
                                    Set your target CGPA:
                                    <input
                                        type="number" step="0.1" max="10" min="0"
                                        style={s.goalInput}
                                        value={targetCgpa}
                                        onChange={e => {
                                            const val = parseFloat(e.target.value);
                                            setTargetCgpa(val);
                                            const remainingCr = remainingSems * 24;
                                            const req = ((val * (totalCredits + remainingCr)) - (cgpa * totalCredits)) / remainingCr;
                                            setRequiredSgpa(req);
                                        }}
                                    />
                                </div>

                                <div style={{ padding: '20px', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>Required SGPA</div>
                                    <div style={{ fontSize: '32px', fontWeight: 900, color: requiredSgpa > 10 ? '#DC2626' : 'var(--primary)' }}>
                                        {requiredSgpa > 10 ? 'Unattainable' : requiredSgpa > 0 ? requiredSgpa.toFixed(2) : '—'}
                                    </div>
                                    <p style={{ fontSize: '12px', color: 'var(--tx-muted)', marginTop: '8px', lineHeight: 1.5 }}>
                                        To reach <strong>{targetCgpa} CGPA</strong> in <strong>{remainingSems}</strong> semesters, you need to maintain an average of <strong>{requiredSgpa.toFixed(2)}</strong> SGPA.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </Stack>

                    <Stack size="md">
                        {/* Semester-wise SGPA Bar Histogram */}
                        <div style={s.chartCard}>
                            <div style={s.chartHeader}>
                                <div style={s.chartTitle}>
                                    <span className="material-icons-round" style={{ color: 'var(--primary)' }}>bar_chart</span>
                                    Semester-wise SGPA Histogram
                                </div>
                                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--tx-dim)' }}>Credit-weighted · Synced with Dashboard</span>
                            </div>
                            {semesterData.length > 0 ? (
                                <div style={{ height: '260px', width: '100%', marginTop: '8px' }}>
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={semesterData.map(s => ({
                                                name: `Sem ${s.semester}`,
                                                sgpa: Number(s.sgpa.toFixed(2)),
                                                backlogs: s.backlogs
                                            }))}
                                            margin={{ top: 10, right: 20, left: -10, bottom: 0 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                            <XAxis dataKey="name" stroke="var(--tx-dim)" fontSize={12} tickLine={false} />
                                            <YAxis domain={[0, 10]} stroke="var(--tx-dim)" fontSize={12} tickLine={false} ticks={[0,2,4,6,8,10]} />
                                            <Tooltip
                                                contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--tx-main)', fontWeight: 700 }}
                                                formatter={(value, name) => name === 'sgpa' ? [`${value} SGPA`, 'Credit-Weighted SGPA'] : [`${value}`, 'Backlogs']}
                                            />
                                            <Bar dataKey="sgpa" radius={[6, 6, 0, 0]} maxBarSize={56}>
                                                {semesterData.map((entry, index) => (
                                                    <Cell
                                                        key={`cell-sem-${index}`}
                                                        fill={entry.backlogs > 0 ? '#DC2626' : entry.sgpa >= 8 ? '#16A34A' : entry.sgpa >= 6 ? '#174B4D' : '#D97706'}
                                                    />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>No semester data found.</div>
                            )}
                            {semesterData.length > 0 && (
                                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '12px', fontSize: '11px', fontWeight: 700 }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#16A34A', display: 'inline-block' }} /> SGPA ≥ 8.0</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#174B4D', display: 'inline-block' }} /> SGPA 6–8</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#D97706', display: 'inline-block' }} /> SGPA &lt; 6</span>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><span style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#DC2626', display: 'inline-block' }} /> Has Backlogs</span>
                                </div>
                            )}
                        </div>

                        {/* Top Performers */}
                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>Highest Achievements</div>
                            <div style={{ marginTop: '20px' }}>
                                {topSubjects.map((sub, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '16px' }}>
                                        <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 900, color: 'var(--primary)' }}>
                                            {sub.grade}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{sub.subject_name || sub.name}</div>
                                            <div style={{ fontSize: '10px', color: 'var(--tx-dim)' }}>Score: {sub.total_marks || sub.total} · Sem {sub.semester}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </Stack>
                </>
            )}

            {userType === 'faculty' && (
                <>
                    {/* Faculty Usage Matrix */}
                    <ResponsiveGrid size="md" style={{ marginBottom: 'var(--space-8)' }}>
                        <div style={{ ...s.card, background: 'var(--primary)', color: '#fff', border: 'none' }}>
                            <div style={{ ...s.cardLabel, color: 'rgba(255,255,255,0.6)' }}>Institutional Lookups</div>
                            <div style={{ ...s.cardVal, color: '#fff' }}>{facultyActivity.length}</div>
                            <div style={{ ...s.cardSub, color: 'rgba(255,255,255,0.7)' }}>Total Queries Run</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Success Rate</div>
                            <div style={s.cardVal}>
                                {facultyActivity.length > 0
                                    ? ((facultyActivity.filter(a => a.sync_status === 'SUCCESS').length / facultyActivity.length) * 100).toFixed(0) + '%' : '—'}
                            </div>
                            <div style={s.cardSub}>Portal Reliability</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Active Evaluators</div>
                            <div style={s.cardVal}>{new Set(facultyActivity.map(l => l.faculty_name)).size}</div>
                            <div style={s.cardSub}>Unique Faculty ID</div>
                        </div>
                        <div style={s.card}>
                            <div style={s.cardLabel}>Global USNs</div>
                            <div style={s.cardVal}>{new Set(facultyActivity.map(l => l.target_usn)).size}</div>
                            <div style={s.cardSub}>Student Coverage</div>
                        </div>
                    </ResponsiveGrid>

                    <Stack size="md">
                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>Recent Audit Log</div>
                            <div style={s.miniTableWrap}>
                                <table style={s.miniTable}>
                                    <thead>
                                        <tr>{['Evaluator', 'Target USN', 'Status', 'Timestamp'].map(h => <th key={h} style={s.miniTh}>{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {facultyActivity.map((log, i) => (
                                            <tr key={i}>
                                                <td style={s.miniTd}>{log.faculty_name}</td>
                                                <td style={{ ...s.miniTd, fontFamily: 'monospace' }}>{log.target_usn}</td>
                                                <td style={s.miniTd}>
                                                    <span style={{
                                                        fontSize: '9px', fontWeight: 900, padding: '2px 8px', borderRadius: '4px',
                                                        background: log.sync_status === 'SUCCESS' ? 'var(--green-bg)' : 'var(--red-bg)',
                                                        color: log.sync_status === 'SUCCESS' ? 'var(--green)' : 'var(--red)'
                                                    }}>{log.sync_status}</span>
                                                </td>
                                                <td style={{ ...s.miniTd, fontSize: '11px', color: 'var(--tx-dim)' }}>{new Date(log.created_at).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div style={s.chartCard}>
                            <div style={s.chartTitle}>Resource Utilization</div>
                            <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>
                                <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '16px' }}>insights</span>
                                <p>Cluster analytics will manifest as more data arrives.</p>
                            </div>
                        </div>
                    </Stack>

                    {/* Faculty-Subject Wise Pass Percentage */}
                    <div style={s.chartCard}>
                        <div style={s.chartTitle}>
                            <span className="material-icons-round" style={{ color: 'var(--primary)' }}>assessment</span>
                            Faculty-Subject Wise Pass Percentage
                        </div>
                        <div style={{ marginTop: '16px' }}>
                            {Object.keys(gradeDistribution).length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {Object.entries(gradeDistribution)
                                        .sort((a, b) => b[1] - a[1])
                                        .map(([name, count]) => {
                                            const total = Object.values(gradeDistribution).reduce((a, b) => a + b, 0);
                                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                            return (
                                                <div key={name} style={{ padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                                        <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{name}</div>
                                                        <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--primary)' }}>{count} lookups ({pct}%)</div>
                                                    </div>
                                                    <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--primary)', borderRadius: '4px', transition: 'width 0.8s ease' }} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '40px 0', opacity: 0.5 }}>No faculty activity data yet.</div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

export default function AnalyticsPage() {
    return (
        <AuthGuard role="any">
            <AnalyticsContent />
        </AuthGuard>
    );
}
