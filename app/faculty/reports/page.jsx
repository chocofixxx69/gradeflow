'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../../lib/supabase';
import AuthGuard from '../../../components/AuthGuard';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';

// ── Activity Logger ─────────────────────────────────────────
async function logActivity(faculty, action_type, target = null) {
    if (!faculty?.id) return;
    try {
        await supabase.from('faculty_activity').insert({
            faculty_id: faculty.id,
            faculty_name: faculty.full_name || faculty.name || faculty.email || 'Faculty',
            action_type,
            target_usn: target || null,
            sync_status: 'SUCCESS',
        });
    } catch { /* non-blocking */ }
}

function ReportsContent() {
    const [faculty, setFaculty] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [stats, setStats] = useState({
        uniqueStudents: 0,
        totalSubjects: 0,
        passCount: 0,
        failCount: 0,
        absentCount: 0,
        gradeDist: {},
        topStudents: [],
        classStats: [],
        subjectPassRates: [],
    });
    const [activity, setActivity] = useState([]);
    const facultyRef = useRef(null);

    useEffect(() => {
        const session = localStorage.getItem('faculty_session');
        if (!session) return;
        const f = JSON.parse(session);
        setFaculty(f);
        facultyRef.current = f;
        loadReportData(f.id);

        // ── Real-time: auto-reload when THIS faculty does anything ──
        const actChannel = supabase
            .channel(`reports-fa-${f.id}`)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'faculty_activity',
                filter: `faculty_id=eq.${f.id}`
            }, () => loadReportData(f.id))
            .subscribe();

        // ── Real-time: auto-reload when a student in this faculty's classes gets new marks ──
        const marksChannel = supabase
            .channel(`reports-marks-${f.id}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'subject_marks',
            }, () => loadReportData(f.id))
            .subscribe();

        return () => {
            supabase.removeChannel(actChannel);
            supabase.removeChannel(marksChannel);
        };
    }, []);

    // ── Supabase paginated fetch (overcomes 1000-row default limit) ──
    const fetchAllRows = async (table, selectCols, filterCol, filterValues, orderCol) => {
        const PAGE = 1000;
        let all = [];
        let from = 0;

        // If no filter values, just fetch all with pagination
        if (!filterCol || !filterValues) {
            while (true) {
                let q = supabase.from(table).select(selectCols).range(from, from + PAGE - 1);
                if (orderCol) q = q.order(orderCol);
                const { data, error } = await q;
                if (error) break;
                all = all.concat(data || []);
                if (!data || data.length < PAGE) break;
                from += PAGE;
            }
            return all;
        }

        // If we have filter values, fetch in chunks to avoid URL length limits
        const chunkSize = 200; // Chunk filter values to be safe with .in() limits
        for (let i = 0; i < filterValues.length; i += chunkSize) {
            const chunk = filterValues.slice(i, i + chunkSize);
            let chunkFrom = 0;
            while (true) {
                let q = supabase.from(table).select(selectCols).in(filterCol, chunk).range(chunkFrom, chunkFrom + PAGE - 1);
                if (orderCol) q = q.order(orderCol);
                const { data, error } = await q;
                if (error) break;
                all = all.concat(data || []);
                if (!data || data.length < PAGE) break;
                chunkFrom += PAGE;
            }
        }
        return all;
    };

    const loadReportData = async (facultyId) => {
        setLoading(true);
        try {
            // 1. Get ALL classes (for per-class pass rate stats)
            const { data: classes } = await supabase
                .from('classes')
                .select('id, name, branch, semester');

            // 2. UNION ALL USNs from different sources to ensure no one is missed
            // a) From Students table (paginated)
            const allRegisteredStudents = await fetchAllRows('students', 'usn');
            const studentsUsns = (allRegisteredStudents || []).map(s => s.usn);

            // b) From Faculty Activity (paginated)
            const actions = await fetchAllRows('faculty_activity', 'target_usn, created_at, action_type', 'faculty_id', [facultyId]);
            const activityUsns = (actions || []).filter(a => a.target_usn).map(a => a.target_usn);
            
            setActivity((actions || []).sort((a,b)=>new Date(b.created_at) - new Date(a.created_at)).slice(0, 10));

            // c) From Class Memberships (in case some aren't in students table yet)
            let classMembersUsns = [];
            if (classes?.length > 0) {
                const members = await fetchAllRows('class_students', 'usn', 'class_id', classes.map(c => c.id));
                classMembersUsns = (members || []).map(m => m.usn);
            }

            // Combine into one master set
            let allUsns = [...new Set([...studentsUsns, ...activityUsns, ...classMembersUsns])];

            if (allUsns.length === 0) {
                setStats({ uniqueStudents: 0, totalSubjects: 0, passCount: 0, failCount: 0, absentCount: 0, gradeDist: {}, topStudents: [], classStats: [], subjectPassRates: [] });
                setLoading(false);
                return;
            }

            // 4. Get scraped marks for all USNs (paginated — fixes 1000-row limit)
            const scrapedMarks = await fetchAllRows('subject_marks', 'grade, usn, semester, subject_name, subject_code, credits, total', 'usn', allUsns);

            // 5. Get student profiles (paginated)
            const students = await fetchAllRows('students', 'id, usn, name', 'usn', allUsns);

            const studentIdMap = {};
            const studentNameMap = {};
            (students || []).forEach(s => { studentIdMap[s.usn] = s.id; studentNameMap[s.usn] = s.name || s.usn; });

            const studentIds = Object.values(studentIdMap);
            const { data: manualMarks } = studentIds.length > 0
                ? await supabase.from('marks').select('grade, student_id').in('student_id', studentIds)
                : { data: [] };

            const marks = [...(scrapedMarks || []), ...(manualMarks || [])];

            // 6. Aggregate
            const dist = {};
            let passes = 0, fails = 0, absents = 0;
            marks.forEach(m => {
                const g = (m.grade || '—').toUpperCase();
                let ug = g;
                if (['O', 'S', 'A+', 'B+', 'B', 'C', 'P', 'PASS', 'D'].includes(g)) ug = 'P';
                else if (['AB', 'ABSENT', 'A'].includes(g)) ug = 'A';
                dist[ug] = (dist[ug] || 0) + 1;
                if (ug === 'F') fails++;
                else if (ug === 'A') absents++;
                else if (ug === 'P') passes++;
            });

            // 7. Top students by CGPA from academic_remarks (paginated)
            const remarks = await fetchAllRows('academic_remarks', 'student_usn, sgpa, semester', 'student_usn', allUsns);

            const cgpaByUsn = {};
            if (remarks) {
                const grouped = {};
                remarks.forEach(r => {
                    if (!grouped[r.student_usn]) grouped[r.student_usn] = [];
                    grouped[r.student_usn].push(parseFloat(r.sgpa || 0));
                });
                Object.entries(grouped).forEach(([usn, sgpas]) => {
                    const avg = sgpas.reduce((a, b) => a + b, 0) / sgpas.length;
                    cgpaByUsn[usn] = parseFloat(avg.toFixed(2));
                });
            }

            const topStudents = Object.entries(cgpaByUsn)
                .map(([usn, cgpa]) => ({ usn, name: studentNameMap[usn] || usn, cgpa }))
                .sort((a, b) => b.cgpa - a.cgpa)
                .slice(0, 5);

            // 8. Per-class pass rate (single batched query instead of one per class)
            const classStats = [];
            const classIds = (classes || []).map(cls => cls.id);
            const allClassMembers = classIds.length > 0
                ? await fetchAllRows('class_students', 'usn, class_id', 'class_id', classIds)
                : [];
            const usnsByClassId = {};
            (allClassMembers || []).forEach(m => {
                if (!usnsByClassId[m.class_id]) usnsByClassId[m.class_id] = [];
                usnsByClassId[m.class_id].push(m.usn);
            });
            for (const cls of (classes || [])) {
                const usnsInClass = usnsByClassId[cls.id] || [];
                if (usnsInClass.length === 0) continue;
                const classMarks = (scrapedMarks || []).filter(m => usnsInClass.includes(m.usn));
                const totalSubj = classMarks.length;
                const passed = classMarks.filter(m => {
                    const g = (m.grade || '').toUpperCase();
                    return ['O', 'S', 'A+', 'B+', 'B', 'C', 'P', 'PASS', 'D'].includes(g);
                }).length;
                classStats.push({
                    name: cls.name,
                    students: usnsInClass.length,
                    passRate: totalSubj > 0 ? Math.round((passed / totalSubj) * 100) : null,
                });
            }

            // 9. Faculty-Subject wise pass percentage
            const bySubject = {};
            (scrapedMarks || []).forEach(m => {
                const code = (m.subject_code || 'UNKNOWN').toUpperCase();
                const name = m.subject_name || code;
                if (!bySubject[code]) bySubject[code] = { code, name, total: 0, passed: 0 };
                bySubject[code].total++;
                const g = (m.grade || 'F').toUpperCase();
                if (['O', 'S', 'A+', 'B+', 'B', 'C', 'P', 'PASS', 'D'].includes(g)) {
                    bySubject[code].passed++;
                }
            });
            const subjectPassRates = Object.values(bySubject)
                .map(s => ({ ...s, passRate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : null }))
                .sort((a, b) => (a.passRate ?? -1) - (b.passRate ?? -1)); // worst first

            setStats({
                uniqueStudents: allUsns.length,
                totalSubjects: marks.length,
                passCount: passes,
                failCount: fails,
                absentCount: absents,
                gradeDist: dist,
                topStudents,
                classStats,
                subjectPassRates,
            });
            setLastUpdated(new Date());
        } catch (err) {
            console.error('Report load error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleViewStudent = async (usn) => {
        // Log the view action
        await logActivity(faculty, 'VIEW_REPORT_STUDENT', usn);
        // We could also open a drawer here, but user asked for activity update
        // The recent activity log will refresh automatically due to the real-time subscription
    };

    const c = {
        page: { padding: 'var(--page-py) var(--page-px)', maxWidth: '1200px', margin: '0 auto', fontFamily: "'Plus Jakarta Sans', sans-serif" },
        statGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-8)' },
        statCard: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-6)', padding: 'var(--space-5)' },
        statLabel: { fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' },
        statVal: { fontSize: '32px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.04em' },
        histoWrap: { display: 'flex', alignItems: 'flex-end', gap: 'var(--space-2)', height: '200px', padding: 'var(--space-3) 0', borderBottom: '2px solid var(--border)' },
        histoBar: (h, col) => ({ flex: 1, minWidth: '28px', background: col, height: `${h}%`, borderRadius: 'var(--radius-2) var(--radius-2) 2px 2px', transition: 'height 0.8s cubic-bezier(.175,.885,.32,1.275)', position: 'relative', cursor: 'help', minHeight: h > 0 ? '4px' : '0' }),
        histoLabel: { textAlign: 'center', fontSize: '10px', fontWeight: 800, color: 'var(--tx-muted)', marginTop: 'var(--space-3)' },
        emptyState: { padding: 'var(--space-11) var(--space-9)', textAlign: 'center', background: 'var(--surface)', border: '2px dashed var(--border)', borderRadius: 'var(--radius-7)', color: 'var(--tx-dim)' },
    };

    const grades = ['P', 'F', 'A', 'W', 'X', 'NE'];
    const maxGradeCount = Math.max(...Object.values(stats.gradeDist), 1);

    if (loading) return (
        <div style={c.page}>
            <PageHeader>
                <PageHeaderEyebrow>Analytics &amp; Insights</PageHeaderEyebrow>
                <PageHeaderTitle>Reports</PageHeaderTitle>
            </PageHeader>
            <div style={{ marginTop: 'var(--space-9)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {[1, 2, 3].map(i => <div key={i} style={{ height: '80px', background: 'var(--surface)', borderRadius: 'var(--radius-6)', opacity: 0.5 }} className="gf-pulse" />)}
            </div>
        </div>
    );

    if (stats.uniqueStudents === 0) {
        return (
            <div style={c.page}>
                <PageHeader>
                    <PageHeaderEyebrow>Analytics &amp; Insights</PageHeaderEyebrow>
                    <PageHeaderTitle>Reports</PageHeaderTitle>
                </PageHeader>
                <div style={{ ...c.emptyState, marginTop: 'var(--space-8)' }}>
                    <span className="material-icons-round" style={{ fontSize: '48px', marginBottom: 'var(--space-4)', opacity: 0.4, display: 'block' }}>analytics</span>
                    <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--tx-main)', marginBottom: 'var(--space-2)' }}>No Data Yet</div>
                    <p style={{ fontSize: '14px', maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
                        Add students to a class or fetch VTU results to see reporting data here. It updates automatically.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div style={c.page} className="gf-fade-up">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '36px', flexWrap: 'wrap', gap: '8px' }}>
                <PageHeader style={{ marginBottom: 0 }}>
                    <PageHeaderEyebrow>Analytics &amp; Insights</PageHeaderEyebrow>
                    <PageHeaderTitle>Reports</PageHeaderTitle>
                    <PageHeaderSubtitle>
                        Live data across all classes — updates automatically.
                        {lastUpdated && <span style={{ marginLeft: '8px', opacity: 0.6 }}>Last updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </PageHeaderSubtitle>
                </PageHeader>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: 'var(--surface-low)', borderRadius: '10px', fontSize: '11px', fontWeight: 700, color: 'var(--green)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', display: 'inline-block' }} />
                    Live
                </div>
            </div>

            {/* Stat cards */}
            <div style={c.statGrid}>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Total Students</div>
                    <div style={c.statVal}>{stats.uniqueStudents}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Subject Records</div>
                    <div style={c.statVal}>{stats.totalSubjects}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Total Pass</div>
                    <div style={{ ...c.statVal, color: '#10B981' }}>{stats.passCount}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Backlogs (F)</div>
                    <div style={{ ...c.statVal, color: stats.failCount > 0 ? '#EF4444' : 'var(--tx-main)' }}>{stats.failCount}</div>
                </div>
                <div style={c.statCard}>
                    <div style={c.statLabel}>Absents</div>
                    <div style={{ ...c.statVal, color: stats.absentCount > 0 ? '#F59E0B' : 'var(--tx-main)' }}>{stats.absentCount}</div>
                </div>
            </div>

            {/* Grade distribution histogram */}
            <Card style={{ marginBottom: 'var(--space-6)' }}>
                <CardHeader>
                    <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                        <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>bar_chart</span>
                        Grade Distribution
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-dim)', marginLeft: 'auto' }}>{stats.totalSubjects} subject records</span>
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div style={c.histoWrap}>
                        {grades.map(g => {
                            const count = stats.gradeDist[g] || 0;
                            const height = (count / maxGradeCount) * 100;
                            const color = g === 'P' ? '#10B981' : g === 'F' ? '#EF4444' : g === 'A' ? '#F59E0B' : 'var(--tx-dim)';
                            return (
                                <div key={g} style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
                                    <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                                        <div style={c.histoBar(height, color)} title={`${g}: ${count}`}>
                                            {count > 0 && <span style={{ position: 'absolute', top: '-22px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: 900, color: 'var(--tx-main)' }}>{count}</span>}
                                        </div>
                                    </div>
                                    <div style={c.histoLabel}>{g}</div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* Two column: Top students + Class pass rates */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '24px' }}>

                {/* Top 5 Students */}
                {stats.topStudents.length > 0 && (
                    <Card style={{ marginBottom: 'var(--space-6)' }}>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>emoji_events</span>
                                Top Students by CGPA
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.topStudents.map((s, i) => (
                                    <div key={s.usn} onClick={() => handleViewStudent(s.usn)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px', cursor: 'pointer', border: '1px solid transparent', transition: 'all 0.2s' }} className="gf-hover-lift">
                                        <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: i === 0 ? '#F59E0B' : i === 1 ? '#9CA3AF' : i === 2 ? '#B45309' : 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '12px', color: i < 3 ? 'white' : 'var(--tx-dim)', flexShrink: 0 }}>
                                            {i + 1}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</div>
                                            <div style={{ fontSize: '10px', fontFamily: 'monospace', color: 'var(--tx-dim)' }}>{s.usn}</div>
                                        </div>
                                        <div style={{ fontWeight: 900, fontSize: '16px', color: s.cgpa >= 7.5 ? '#10B981' : s.cgpa >= 5 ? 'var(--tx-main)' : '#F59E0B' }}>{s.cgpa.toFixed(2)}</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Class pass rates */}
                {stats.classStats.length > 0 && (
                    <Card style={{ marginBottom: 'var(--space-6)' }}>
                        <CardHeader>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                                <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>groups</span>
                                Class Pass Rates
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {stats.classStats.map((cl, i) => (
                                    <div key={i} style={{ padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <div style={{ fontWeight: 800, fontSize: '13px', color: 'var(--tx-main)' }}>{cl.name}</div>
                                            <div style={{ fontSize: '12px', fontWeight: 700, color: cl.passRate >= 75 ? '#10B981' : cl.passRate != null ? '#F59E0B' : 'var(--tx-dim)' }}>
                                                {cl.passRate != null ? `${cl.passRate}%` : 'No data'}
                                            </div>
                                        </div>
                                        {cl.passRate != null && (
                                            <div style={{ height: '4px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${cl.passRate}%`, background: cl.passRate >= 75 ? '#10B981' : '#F59E0B', borderRadius: '4px', transition: 'width 1s ease' }} />
                                            </div>
                                        )}
                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '4px' }}>{cl.students} students</div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Faculty-Subject Wise Pass Percentage */}
            {stats.subjectPassRates.length > 0 && (
                <Card style={{ marginBottom: 'var(--space-6)' }}>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>assessment</span>
                            Faculty-Subject Wise Pass Percentage
                            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--tx-dim)', marginLeft: 'auto' }}>{stats.subjectPassRates.length} subjects tracked</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {stats.subjectPassRates.map((sub, i) => (
                                <div key={sub.code} style={{ padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <div>
                                            <span style={{ fontFamily: 'monospace', fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', marginRight: '8px' }}>{sub.code}</span>
                                            <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--tx-main)' }}>{sub.name}</span>
                                        </div>
                                        <div style={{ fontSize: '13px', fontWeight: 900, color: sub.passRate >= 75 ? '#10B981' : sub.passRate >= 50 ? '#F59E0B' : '#EF4444' }}>
                                            {sub.passRate != null ? `${sub.passRate}%` : 'No data'}
                                        </div>
                                    </div>
                                    {sub.passRate != null && (
                                        <div style={{ height: '6px', background: 'var(--border)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ height: '100%', width: `${sub.passRate}%`, background: sub.passRate >= 75 ? '#10B981' : sub.passRate >= 50 ? '#F59E0B' : '#EF4444', borderRadius: '4px', transition: 'width 1s ease' }} />
                                        </div>
                                    )}
                                    <div style={{ fontSize: '10px', color: 'var(--tx-dim)', marginTop: '4px' }}>
                                        {sub.passed}/{sub.total} students passed
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Recent Activity — faculty-specific */}
            {activity.length > 0 && (
                <Card style={{ marginBottom: 0 }}>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <span className="material-icons-round" style={{ fontSize: '18px', color: 'var(--primary)' }}>history</span>
                            Your Recent Activity
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {activity.filter(a => a.target_usn).map((a, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface-low)', borderRadius: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className="material-icons-round" style={{ fontSize: '16px', color: 'var(--tx-dim)' }}>
                                            {a.action_type?.includes('FETCH') ? 'sync' : a.action_type?.includes('TRANSFER') ? 'swap_horiz' : a.action_type?.includes('REMOVE') ? 'remove_circle' : 'visibility'}
                                        </span>
                                        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{a.target_usn}</div>
                                        <div style={{ fontSize: '10px', color: 'var(--tx-dim)', background: 'var(--border)', padding: '2px 6px', borderRadius: '4px' }}>{a.action_type}</div>
                                    </div>
                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontWeight: 600 }}>
                                        {new Date(a.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}

export default function ReportsPage() {
    return (
        <AuthGuard role="faculty">
            <ReportsContent />
        </AuthGuard>
    );
}
