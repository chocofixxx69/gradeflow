'use client';

import { useState, useEffect } from 'react';
import {
    VTU_SCHEMES,
    calculateSGPA,
    calculateCGPAFromSGPAs,
    calculatePercentage,
    getSubjectsFor,
    getGradeFromTotal,
    VTU_BRANCHES
} from '../../lib/vtuGrades';
import { supabase } from '../../lib/supabase';
import PDFUpload from '../../components/PDFUpload';
import { apiRequest } from '@/lib/api/client';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';
import { Button, Input, Inline, ResponsiveGrid, Stack } from '@/components/ui/Foundation';
import { Card } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { TableWrapper, Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/ui/Table';

function CalculatorContent() {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState('sgpa');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);
    const [scheme, setScheme] = useState('2022');
    const [semester, setSemester] = useState(3);
    const [branch, setBranch] = useState('CSE');
    const [subjects, setSubjects] = useState([]);
    const [usn, setUsn] = useState('');
    const [studentName, setStudentName] = useState('');
    const [manualSGPAs, setManualSGPAs] = useState(Array(8).fill(''));
    const [cgpaResult, setCgpaResult] = useState(null);
    const [loggedInUser, setLoggedInUser] = useState(null);

    useEffect(() => {
        const stuSession = localStorage.getItem('student_session');
        const facSession = localStorage.getItem('faculty_session');

        // AuthGuard handles the redirect — this just initializes data
        if (stuSession) {
            // Student mode — locked to their own USN
            const user = JSON.parse(stuSession);
            setLoggedInUser(user);
            setUsn(user.usn.toUpperCase());
            setStudentName(user.name);
            if (user.branch) setBranch(user.branch);
            if (user.scheme) setScheme(user.scheme);
            refreshMatrix(user.branch || branch, semester, user.scheme || scheme);
        } else if (facSession) {
            // Faculty mode — USN is editable, no identity lock
            setLoggedInUser(null); // null = no identity lock
            refreshMatrix(branch, semester, scheme);
        }
    }, []);

    const refreshMatrix = async (b, s, sch) => {
        setLoading(true);
        try {
            const list = getSubjectsFor(b, s, sch);
            setSubjects(list.length ? list.map(sub => ({ ...sub, id: Math.random(), total: 0, grade: '-' })) : []);
        } catch (err) {
            console.error("Catalog Fetch Error:", err);
            setSubjects([]);
        } finally {
            setLoading(false);
        }
    };

    const handleMarks = (id, val) => {
        setSubjects(prev => prev.map(s => {
            if (s.id !== id) return s;
            const total = parseInt(val) || 0;
            const grade = getGradeFromTotal(total, scheme);
            return { ...s, total, grade };
        }));
    };

    const saveToDatabase = async () => {
        if (!usn) { setError('A valid Academic Identity (USN) is required.'); return; }

        // Identity Lock: Prevent syncing to a different USN if logged in
        if (loggedInUser && usn.toUpperCase() !== loggedInUser.usn.toUpperCase()) {
            setError(`Identity Lock: You can only synchronize records for your own ID (${loggedInUser.usn}).`);
            return;
        }

        setLoading(true); setError(null); setSuccess(null);
        try {
            // 1. Ensure student profile exists and get its primary key (ID)
            const { data: student, error: sErr } = await supabase
                .from('students')
                .upsert({
                    usn: usn.toUpperCase(),
                    name: studentName || usn.toUpperCase(),
                    scheme,
                    branch,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'usn' })
                .select()
                .single();

            if (sErr) throw sErr;

            // 2. Prepare marks with foreign key student_id
            const marksData = subjects.map(s => ({
                student_id: student.id,
                student_usn: student.usn,
                subject_code: s.code,
                subject_name: s.name,
                cie_marks: Math.floor(s.total * 0.4),
                see_marks: Math.ceil(s.total * 0.6),
                total_marks: s.total,
                grade: s.grade,
                semester,
                sync_source: 'MANUAL_ENTRY'
            }));

            const stats = calculateSGPA(subjects, scheme);
            await apiRequest('/api/student/results', {
                method: 'POST',
                headers: { 'x-student-usn': student.usn },
                body: JSON.stringify({
                    student_id: student.id,
                    semester,
                    sgpa: stats.sgpa,
                    marks: marksData
                })
            }).catch(() => null);

            setSuccess(`Sync successful. Your records are now part of the institutional vault.`);
        } catch (err) {
            console.error(err);
            setError('Synchronization failed. Please check your connection.');
        } finally {
            setLoading(false);
        }
    };

    const stats = calculateSGPA(subjects, scheme);

    const s = {
        label: { fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--space-2)', display: 'block' },
        input: {
            width: '100%', background: 'var(--surface-low)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-4)', padding: 'var(--space-3) var(--space-4)', fontSize: '14px',
            fontWeight: 600, color: 'var(--tx-main)', outline: 'none',
            fontFamily: 'inherit', transition: 'border-color 0.2s',
        },

        semGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-2)' },
        semBtn: (active) => ({
            minHeight: '44px', borderRadius: 'var(--radius-3)', fontWeight: 800, fontSize: '13px',
            border: 'none', cursor: 'pointer',
            background: active ? 'var(--primary)' : 'var(--surface-low)',
            color: active ? 'var(--bg)' : 'var(--tx-muted)',
            transition: 'all 0.15s',
        }),

        tabs: { display: 'flex', gap: 'var(--space-2)', background: 'var(--surface-low)', padding: 'var(--space-1)', borderRadius: 'var(--radius-4)', width: '100%', maxWidth: '420px', flexWrap: 'wrap' },
        tabBtn: (active) => ({
            flex: '1 1 160px', padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-3)', border: 'none',
            minHeight: '44px',
            background: active ? 'var(--surface)' : 'transparent',
            color: active ? 'var(--tx-main)' : 'var(--tx-muted)',
            fontWeight: active ? 700 : 600, fontSize: '13px',
            cursor: 'pointer', fontFamily: 'inherit',
        }),

        markInput: {
            width: '72px', minHeight: '44px', background: 'var(--surface-low)',
            border: '1px solid var(--border)', borderRadius: 'var(--radius-2)',
            textAlign: 'center', fontWeight: 700, fontSize: '15px',
            color: 'var(--tx-main)', outline: 'none', display: 'block', margin: '0 auto',
        },

        gradePill: (f) => ({
            padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-2)', fontSize: '11px',
            fontWeight: 900, background: f ? 'var(--red-bg)' : 'var(--surface-low)',
            color: f ? 'var(--red)' : 'var(--tx-main)', display: 'block', margin: '0 auto', width: 'fit-content',
        }),

        resultBar: {
            marginTop: 'var(--space-8)', background: 'var(--primary)', borderRadius: 'var(--radius-6)',
            padding: 'var(--space-8) var(--space-9)', display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', color: 'var(--bg)',
        },
        syncBtn: {
            padding: 'var(--space-4) var(--space-8)', background: 'var(--bg)', color: 'var(--primary)',
            border: 'none', borderRadius: 'var(--radius-4)', fontWeight: 800, fontSize: '14px',
            cursor: 'pointer', transition: 'transform 0.15s',
        }
    };

    return (
        <div className="gf-page gf-page-wide gf-fade-up">
            <PageHeader>
                <PageHeaderEyebrow>GradeFlow Calculator</PageHeaderEyebrow>
                <PageHeaderTitle>SGPA & CGPA Calculator</PageHeaderTitle>
                <PageHeaderSubtitle>
                    Enter your marks to calculate SGPA, or input semester-wise SGPAs to compute your overall CGPA.
                </PageHeaderSubtitle>
            </PageHeader>

            <div className="gf-calc-layout">
                <aside>
                    <Card style={{ padding: 'var(--space-8)' }}>
                        <div style={{ marginBottom: 'var(--space-6)' }}>
                            <label style={s.label}>Program Branch</label>
                            <select aria-label="Program branch" style={s.input} value={branch} onChange={e => { setBranch(e.target.value); refreshMatrix(e.target.value, semester, scheme); }}>
                                {Object.entries(VTU_BRANCHES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: 'var(--space-6)' }}>
                            <label style={s.label}>Scheme</label>
                            <select aria-label="Scheme" style={s.input} value={scheme} onChange={e => { setScheme(e.target.value); refreshMatrix(branch, semester, e.target.value); }}>
                                {Object.keys(VTU_SCHEMES).map(k => <option key={k} value={k}>{k} Scheme</option>)}
                            </select>
                        </div>
                        <div style={{ marginBottom: 'var(--space-6)' }}>
                            <label style={s.label}>Semester Selection</label>
                            <div style={s.semGrid}>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                                    <button key={n} type="button" style={s.semBtn(semester === n)} onClick={() => { setSemester(n); refreshMatrix(branch, n, scheme); }} aria-pressed={semester === n} aria-label={`Select semester ${n}`}>{n}</button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <Input
                                label="Identity (USN)"
                                style={{ background: loggedInUser ? 'var(--surface-low)' : 'var(--bg)' }}
                                placeholder="e.g. 1VT22CS001"
                                value={usn}
                                readOnly={!!loggedInUser}
                                onChange={e => setUsn(e.target.value.toUpperCase())}
                            />
                        </div>
                    </Card>
                </aside>

                <main>
                    <Inline align="between" stackMobile style={{ marginBottom: 'var(--space-6)' }}>
                        <div style={s.tabs}>
                            <button type="button" style={s.tabBtn(activeTab === 'sgpa')} onClick={() => setActiveTab('sgpa')} aria-pressed={activeTab === 'sgpa'}>SGPA Calculator</button>
                            <button type="button" style={s.tabBtn(activeTab === 'cgpa')} onClick={() => setActiveTab('cgpa')} aria-pressed={activeTab === 'cgpa'}>CGPA Calculator</button>
                        </div>
                        <PDFUpload onExtracted={(data) => {
                            // Auto-fill USN from PDF (only for student if not locked, always for faculty)
                            if (data.studentInfo?.usn && data.studentInfo.usn !== 'Unknown') {
                                if (!loggedInUser) {
                                    setUsn(data.studentInfo.usn.toUpperCase());
                                }
                            }
                            // Auto-fill student name if available
                            if (data.studentInfo?.name) {
                                setStudentName(data.studentInfo.name);
                            }
                            // Auto-detect semester
                            if (data.studentInfo?.semester) {
                                setSemester(data.studentInfo.semester);
                            }
                            // Auto-detect scheme
                            if (data.scheme) {
                                setScheme(data.scheme);
                            }
                            // Load extracted subjects with proper credits
                            if (data.subjects && data.subjects.length > 0) {
                                setSubjects(data.subjects.map(sub => ({
                                    ...sub,
                                    id: Math.random(),
                                    name: sub.name || sub.code,
                                    code: sub.code,
                                    credits: sub.credits || 3,
                                    total: sub.total || ((sub.internal || 0) + (sub.external || 0)),
                                    grade: sub.grade || getGradeFromTotal(sub.total || ((sub.internal || 0) + (sub.external || 0)), scheme),
                                })));
                                setSuccess(`✓ Loaded ${data.subjects.length} subjects from PDF`);
                            }
                        }} />
                    </Inline>

                    {activeTab === 'sgpa' ? (
                        <>
                            <TableWrapper style={{ borderRadius: '24px' }}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableHeader>Subject</TableHeader>
                                            <TableHeader align="center">CR</TableHeader>
                                            <TableHeader align="center">Final Score</TableHeader>
                                            <TableHeader align="center">Grade</TableHeader>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {subjects.map(sub => (
                                            <TableRow key={sub.id}>
                                                <TableCell>
                                                    <div style={{ fontWeight: 800, color: 'var(--tx-main)' }}>{sub.name}</div>
                                                    <div style={{ fontSize: '11px', color: 'var(--tx-dim)', fontFamily: 'monospace', marginTop: '2px' }}>{sub.code}</div>
                                                </TableCell>
                                                <TableCell align="center" style={{ fontWeight: 700, color: 'var(--tx-muted)' }}>{sub.credits}</TableCell>
                                                <TableCell align="center">
                                                    <input
                                                        style={s.markInput}
                                                        type="number"
                                                        aria-label={`Final score for ${sub.name || sub.code}`}
                                                        value={sub.total || ''}
                                                        onChange={e => handleMarks(sub.id, e.target.value)}
                                                        onFocus={e => e.target.style.borderColor = 'var(--tx-main)'}
                                                        onBlur={e => e.target.style.borderColor = 'var(--border)'}
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <span style={s.gradePill(sub.grade === 'F')}>{sub.grade}</span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableWrapper>

                            <Inline className="gf-result-bar gf-fade-up" align="between" stackMobile>
                                <div>
                                    <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '4px' }}>Your SGPA</div>
                                    <div style={{ fontSize: '48px', fontWeight: 900, letterSpacing: '-0.04em' }}>{stats.sgpa.toFixed(2)}</div>
                                    <div style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginTop: '4px' }}>{stats.formula}</div>
                                </div>
                                <Stack size="sm" style={{ alignItems: 'stretch' }}>
                                    {error && <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: '#FECACA' }}>{error}</div>}
                                    {success && <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px', color: '#86EFAC' }}>{success}</div>}
                                    <Button
                                        onClick={saveToDatabase}
                                        disabled={loading}
                                        loading={loading}
                                    >
                                        Save to Database
                                    </Button>
                                </Stack>
                            </Inline>
                        </>
                    ) : (
                        <Card style={{ textAlign: 'center', padding: '64px' }}>
                            <span className="material-icons-round" style={{ fontSize: '56px', color: 'var(--surface-low)', marginBottom: '24px' }}>insights</span>
                            <h2 style={{ fontSize: '28px', fontWeight: 900, color: 'var(--tx-main)', marginBottom: '12px', letterSpacing: '-0.03em' }}>CGPA Calculator</h2>
                            <p style={{ color: 'var(--tx-muted)', marginBottom: '48px', maxWidth: '400px', margin: '0 auto 48px' }}>Enter your SGPA for each completed semester to calculate your cumulative CGPA.</p>

                            <ResponsiveGrid size="sm" style={{ maxWidth: '640px', margin: '0 auto 48px' }}>
                                {[1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => (
                                    <div key={n} style={{ textAlign: 'left' }}>
                                        <Input
                                            label={`SEM ${n}`}
                                            style={{ textAlign: 'center', fontWeight: 800 }}
                                            placeholder="0.00"
                                            value={manualSGPAs[i]}
                                            onChange={e => {
                                                const next = [...manualSGPAs]; next[i] = e.target.value; setManualSGPAs(next);
                                            }}
                                        />
                                    </div>
                                ))}
                            </ResponsiveGrid>

                            <Button
                                variant="primary"
                                style={{ padding: '16px 48px' }}
                                onClick={() => setCgpaResult(calculateCGPAFromSGPAs(manualSGPAs, scheme))}
                            >
                                Calculate CGPA
                            </Button>

                            {cgpaResult && (
                                <div style={{ marginTop: '48px', padding: '40px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '24px' }} className="gf-fade-up">
                                    <div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', marginBottom: '8px' }}>Your CGPA</div>
                                    <div style={{ fontSize: '64px', fontWeight: 900, color: 'var(--tx-main)', letterSpacing: '-0.05em' }}>{cgpaResult.cgpa?.toFixed(2) || '0.00'}</div>
                                    <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--tx-muted)', marginTop: '8px' }}>Equivalent to {calculatePercentage(cgpaResult.cgpa || 0).toFixed(1)}% · Classification: {cgpaResult.classification}</div>
                                </div>
                            )}
                        </Card>
                    )}
                </main>
            </div>
        </div>
    );
}

export default function CalculatorPage() {
    return (
        <AuthGuard role="any">
            <CalculatorContent />
        </AuthGuard>
    );
}
