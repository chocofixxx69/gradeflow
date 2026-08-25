'use client';

import { useState, useEffect } from 'react';
import { apiRequest } from '../../lib/api/client';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';
import { ResponsiveGrid, Stack } from '@/components/ui/Foundation';
import { getGradePoint, getGradeRank, unifyGrade, isFailedSubject } from '../../lib/vtuGrades';
import { supabase } from '../../lib/supabase';
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
import styles from './Analytics.module.css';

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
            const newRank = getGradeRank(m.grade, m.total_marks ?? m.total ?? m.marks);
            const oldRank = getGradeRank(existing.grade, existing.total_marks ?? existing.total ?? existing.marks);
            if (newRank > oldRank) subjectsPool[code] = m;
        });

        const poolItems = Object.values(subjectsPool);
        const validSubs = poolItems.filter(m => !excludeGrades.includes((m.grade || '').trim().toUpperCase()));

        // Credit-weighted SGPA — same formula as Dashboard
        let totalCredits = 0, totalCreditPoints = 0, backlogs = 0;
        validSubs.forEach(m => {
            const grade = (m.grade || '').trim().toUpperCase();
            const credits = Number(m.credits) || 3;
            const totalScore = m.total_marks ?? m.total ?? m.marks ?? null;
            const gp = getGradePoint(grade, '2022', totalScore, m.see_marks ?? m.external ?? null);
            const isFail = isFailedSubject(m);

            totalCredits += credits;
            totalCreditPoints += (isFail ? 0 : gp) * credits;
            if (isFail) backlogs++;
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

    if (loading) return (
        <div className="gf-page gf-page-wide" style={{ textAlign: 'center', paddingBlock: '120px' }}>
            <span className="material-icons-round gf-spin" style={{ fontSize: '48px', color: 'var(--primary)' }}>sync</span>
            <p style={{ marginTop: '20px', fontWeight: 700, color: 'var(--tx-dim)' }}>Generating Advanced Insights...</p>
        </div>
    );

    const percentage = Math.max(0, (cgpa - 0.75) * 10);
    const classification = cgpa >= 7.75 ? 'First Class Distinction' : cgpa >= 6.75 ? 'First Class' : cgpa >= 5.0 ? 'Pass' : 'Failed';

    return (
        <div className={`${styles.page} gf-page gf-page-default gf-fade-up`}>
            <header className={styles.sectionHeader} style={{ marginBottom: 'var(--space-8)' }}>
                <div>
                    <span className={styles.eyebrow}>{userType === 'faculty' ? 'Institutional Intelligence' : 'Personal Academic Matrix'}</span>
                    <h1 className={styles.title}>Performance Analytics</h1>
                    <p className={styles.subtitle}>
                        {userType === 'faculty'
                            ? 'High-level institutional monitoring, faculty engagement patterns, and resource allocation insights.'
                            : `Advanced trend analysis for ${studentName}. Track your trajectory and achieve your academic goals.`}
                    </p>
                </div>
            </header>

            {userType === 'student' && (
                <>
                    {/* Summary Matrix */}
                    <ResponsiveGrid size="sm" className={styles.statsGrid} style={{ marginBottom: 'var(--space-8)' }}>
                        <div className={styles.statCard} style={{ background: 'var(--primary)', color: 'white', border: 'none' }}>
                            <div className={styles.statLabel} style={{ color: 'rgba(255,255,255,0.7)' }}>Current CGPA</div>
                            <div className={styles.statValue} style={{ color: 'white' }}>{cgpa > 0 ? cgpa.toFixed(2) : '0.00'}</div>
                            <div className={styles.meta} style={{ color: 'rgba(255,255,255,0.9)' }}>
                                <span className="material-icons-round" style={{ fontSize: '14px', marginRight: '4px', verticalAlign: 'middle' }}>stars</span>
                                {classification}
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statLabel}>Average %</div>
                            <div className={styles.statValue}>{percentage > 0 ? `${percentage.toFixed(1)}%` : '—'}</div>
                            <div className={styles.meta}>VTU Equivalence</div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statLabel}>Academic Standing</div>
                            <div className={`${styles.statValue} ${cgpa >= 8.5 ? styles.successText : cgpa >= 7.5 ? '' : ''}`}>
                                {cgpa >= 9 ? 'S' : cgpa >= 8 ? 'A+' : cgpa >= 7 ? 'A' : cgpa >= 6 ? 'B+' : 'C'}
                            </div>
                            <div className={styles.meta}>Rank Percentile</div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statLabel}>Backlogs</div>
                            <div className={`${styles.statValue} ${backlogCount > 0 ? styles.dangerText : styles.successText}`}>{backlogCount}</div>
                            <div className={styles.meta}>{backlogCount === 0 ? 'Consistent Standing' : 'Needs attention'}</div>
                        </div>
                    </ResponsiveGrid>

                    {/* Year-Back Risk Assessment */}
                    {yearBackRisk.hasRisk && (
                        <div className={styles.section} style={{ borderLeft: `4px solid ${yearBackRisk.level === 'CRITICAL' ? '#DC2626' : yearBackRisk.level === 'HIGH' ? '#D97706' : '#2563EB'}`, marginBottom: '24px' }}>
                            <div className={styles.sectionTitle}>
                                <span className="material-icons-round" style={{ color: yearBackRisk.level === 'CRITICAL' ? '#DC2626' : '#D97706' }}>warning</span>
                                Year-Back Risk Analysis
                                <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 900, padding: '4px 12px', borderRadius: '8px', background: yearBackRisk.level === 'CRITICAL' ? '#FEF2F2' : yearBackRisk.level === 'HIGH' ? '#FFFBEB' : '#EFF6FF', color: yearBackRisk.level === 'CRITICAL' ? '#DC2626' : yearBackRisk.level === 'HIGH' ? '#D97706' : '#2563EB' }}>
                                    {yearBackRisk.level}
                                </span>
                            </div>
                            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-muted)', marginBottom: '8px' }}>
                                    Total Active Backlogs: <strong className={styles.dangerText}>{yearBackRisk.totalActiveBacklogs}</strong>
                                </div>
                                {yearBackRisk.risks.map((risk, i) => (
                                    <div key={i} className={`${styles.notice} ${risk.severity === 'HIGH' ? styles.noticeError : styles.noticeInfo}`}>
                                        {risk.message}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <Stack size="md">
                        {/* SGPA Trends Line Chart */}
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <div className={styles.sectionTitle}>
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
                    </Stack>

                    <Stack size="md">
                        {/* Semester-wise SGPA Bar Histogram */}
                        <div className={styles.section}>
                            <div className={styles.sectionHeader}>
                                <div className={styles.sectionTitle}>
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
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Highest Achievements</div>
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
                    <ResponsiveGrid size="sm" className={styles.statsGrid} style={{ marginBottom: 'var(--space-8)' }}>
                        <div className={styles.statCard} style={{ background: 'var(--primary)', color: '#fff', border: 'none' }}>
                            <div className={styles.statLabel} style={{ color: 'rgba(255,255,255,0.6)' }}>Institutional Lookups</div>
                            <div className={styles.statValue} style={{ color: '#fff' }}>{facultyActivity.length}</div>
                            <div className={styles.meta} style={{ color: 'rgba(255,255,255,0.7)' }}>Total Queries Run</div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statLabel}>Success Rate</div>
                            <div className={styles.statValue}>
                                {facultyActivity.length > 0
                                    ? ((facultyActivity.filter(a => a.sync_status === 'SUCCESS').length / facultyActivity.length) * 100).toFixed(0) + '%' : '—'}
                            </div>
                            <div className={styles.meta}>Portal Reliability</div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statLabel}>Active Evaluators</div>
                            <div className={styles.statValue}>{new Set(facultyActivity.map(l => l.faculty_name)).size}</div>
                            <div className={styles.meta}>Unique Faculty ID</div>
                        </div>
                        <div className={styles.statCard}>
                            <div className={styles.statLabel}>Global USNs</div>
                            <div className={styles.statValue}>{new Set(facultyActivity.map(l => l.target_usn)).size}</div>
                            <div className={styles.meta}>Student Coverage</div>
                        </div>
                    </ResponsiveGrid>

                    <Stack size="md">
                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Recent Audit Log</div>
                            <div className={styles.tableWrap}>
                                <table className={styles.table}>
                                    <thead>
                                        <tr>{['Evaluator', 'Target USN', 'Status', 'Timestamp'].map(h => <th key={h} scope="col">{h}</th>)}</tr>
                                    </thead>
                                    <tbody>
                                        {facultyActivity.map((log, i) => (
                                            <tr key={i}>
                                                <td>{log.faculty_name}</td>
                                                <td className={styles.code}>{log.target_usn}</td>
                                                <td>
                                                    <span style={{
                                                        fontSize: '9px', fontWeight: 900, padding: '2px 8px', borderRadius: '4px',
                                                        background: log.sync_status === 'SUCCESS' ? 'var(--green-bg)' : 'var(--red-bg)',
                                                        color: log.sync_status === 'SUCCESS' ? 'var(--green)' : 'var(--red)'
                                                    }}>{log.sync_status}</span>
                                                </td>
                                                <td className={styles.nowrap}>{new Date(log.created_at).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className={styles.section}>
                            <div className={styles.sectionTitle}>Resource Utilization</div>
                            <div style={{ textAlign: 'center', padding: '60px 0', opacity: 0.5 }}>
                                <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: '16px' }}>insights</span>
                                <p>Cluster analytics will manifest as more data arrives.</p>
                            </div>
                        </div>
                    </Stack>

                    {/* Faculty-Subject Wise Pass Percentage */}
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>
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
