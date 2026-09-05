'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import { apiRequest } from '@/lib/api/client';
import { getJsPDF } from '@/lib/lazy-export-libs';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { PageHeader, PageHeaderEyebrow, PageHeaderTitle, PageHeaderSubtitle } from '@/components/ui/PageHeader';
import { Button, Input, Select } from '@/components/ui/Foundation';

export default function StudentRecordPage() {
    return (
        <AuthGuard role="faculty">
            <StudentRecordContent />
        </AuthGuard>
    );
}

function StudentRecordContent() {
    const params = useParams();
    const router = useRouter();
    const rawUsn = params?.usn;
    const usn = rawUsn ? String(rawUsn).toUpperCase() : '';

    const [loading, setLoading] = useState(true);
    const [savingGuardian, setSavingGuardian] = useState(false);
    const [showGuardianModal, setShowGuardianModal] = useState(false);
    const [activeSemTab, setActiveSemTab] = useState(1);

    const [data, setData] = useState({
        profile: { usn: '', name: '', branch: '', college: '', batch: '', semester: 1, email: '', phone: '', is_inactive: false },
        guardian: { parent_name: '', parent_phone: '', parent_email: '', guardian_relation: 'Parent' },
        kpis: { cgpa: 0, total_backlogs: 0, backlog_credits: 0, semesters_tracked: 0, credits_earned: 0, subjects_cleared: 0, subjects_failed: 0, best_sgpa: 0 },
        trend: [],
        gradeDistribution: [],
        semesterMarks: {},
        semStats: {}
    });

    const [guardianForm, setGuardianForm] = useState({
        parent_name: '',
        parent_phone: '',
        parent_email: '',
        guardian_relation: 'Parent'
    });

    // 1. Fetch complete student dossier
    const loadStudentRecord = useCallback(async () => {
        if (!usn) return;
        setLoading(true);
        try {
            const res = await apiRequest(`/api/faculty/students/${usn}`);
            if (res) {
                setData(res);
                setGuardianForm({
                    parent_name: res.guardian?.parent_name || '',
                    parent_phone: res.guardian?.parent_phone || '',
                    parent_email: res.guardian?.parent_email || '',
                    guardian_relation: res.guardian?.guardian_relation || 'Parent'
                });

                // Set initial active semester tab to latest available semester
                const sems = Object.keys(res.semesterMarks || {}).map(Number).sort((a, b) => a - b);
                if (sems.length > 0) {
                    setActiveSemTab(sems[sems.length - 1]);
                }
            }
        } catch (err) {
            console.error('Failed to load student record:', err);
        } finally {
            setLoading(false);
        }
    }, [usn]);

    useEffect(() => {
        loadStudentRecord();
    }, [loadStudentRecord]);

    // 2. Handle Guardian update
    const handleSaveGuardian = async (e) => {
        e.preventDefault();
        setSavingGuardian(true);
        try {
            await apiRequest(`/api/faculty/students/${usn}`, {
                method: 'PUT',
                body: JSON.stringify(guardianForm)
            });
            setData(prev => ({
                ...prev,
                guardian: { ...guardianForm }
            }));
            setShowGuardianModal(false);
        } catch (err) {
            alert('Failed to update guardian info: ' + (err.message || err));
        } finally {
            setSavingGuardian(false);
        }
    };

    // 3. Handle Status toggle (active / inactive)
    const handleToggleStatus = async () => {
        const nextState = !data.profile.is_inactive;
        const msg = nextState ? 'Deactivate this student account?' : 'Activate this student account?';
        if (!confirm(msg)) return;

        try {
            await apiRequest(`/api/faculty/students/${usn}`, {
                method: 'PUT',
                body: JSON.stringify({ is_inactive: nextState })
            });
            setData(prev => ({
                ...prev,
                profile: { ...prev.profile, is_inactive: nextState }
            }));
        } catch (err) {
            alert('Failed to update status: ' + (err.message || err));
        }
    };

    // ── Transcript PDF Download ──
    const handleDownloadTranscript = async () => {
        const { jsPDF, autoTable } = await getJsPDF();
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        doc.setFontSize(16);
        doc.setFont('helvetica', 'bold');
        doc.text('OFFICIAL ACADEMIC TRANSCRIPT', 14, 16);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Student Name: ${data.profile.name} | USN: ${data.profile.usn}`, 14, 23);
        doc.text(`Department: ${data.profile.branch} | Batch: ${data.profile.batch} | Cumulative CGPA: ${data.kpis.cgpa?.toFixed(2) || '—'}`, 14, 28);
        doc.text(`Credits Earned: ${data.kpis.credits_earned} | Backlogs: ${data.kpis.total_backlogs} | Date: ${new Date().toLocaleDateString()}`, 14, 33);

        let currentY = 38;
        const sortedSems = Object.keys(data.semesterMarks || {}).map(Number).sort((a, b) => a - b);

        sortedSems.forEach(sem => {
            const marksList = data.semesterMarks[sem] || [];
            const semStat = data.semStats[sem] || {};

            if (currentY > 240) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.text(`Semester ${sem} (SGPA: ${semStat.sgpa?.toFixed(2) || '—'}, Earned Cr: ${semStat.earnedCredits || 0})`, 14, currentY);
            currentY += 4;

            const head = [['Code', 'Subject Name', 'Cr', 'Int', 'Ext', 'Total', 'Grd', 'GP', 'Result']];
            const body = marksList.map(m => [
                m.subject_code,
                m.subject_name,
                m.credits,
                m.internal ?? '—',
                m.external ?? '—',
                m.total,
                m.grade,
                m.grade_point,
                m.result
            ]);

            autoTable(doc, {
                head,
                body,
                startY: currentY,
                theme: 'grid',
                styles: { fontSize: 7, cellPadding: 1.5 },
                headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] }
            });

            currentY = (doc.lastAutoTable?.finalY || currentY + 30) + 8;
        });

        doc.save(`Transcript_${data.profile.usn}.pdf`);
    };

    const semsAvailable = Object.keys(data.semesterMarks || {}).map(Number).sort((a, b) => a - b);
    const currentSemMarks = data.semesterMarks[activeSemTab] || [];
    const currentSemStat = data.semStats[activeSemTab] || {};

    return (
        <div style={{ padding: 'var(--page-py) var(--page-px)', maxWidth: '1300px', margin: '0 auto' }} className="gf-fade-up">
            {/* Back link */}
            <div style={{ marginBottom: '16px' }}>
                <Link
                    href="/faculty/students"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: 'var(--tx-muted)', textDecoration: 'none' }}
                >
                    <span className="material-icons-round" style={{ fontSize: '16px' }}>arrow_back</span>
                    Back to Students Directory
                </Link>
            </div>

            {/* Profile Header */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '18px', alignItems: 'center' }}>
                    <div style={{
                        width: '64px', height: '64px', borderRadius: '14px',
                        background: 'var(--primary)', color: '#FFFFFF',
                        fontWeight: 900, fontSize: '24px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                        {(data.profile.name?.[0] || data.profile.usn?.[0] || '?').toUpperCase()}
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                            <h1 style={{ fontSize: '24px', fontWeight: 900, margin: 0, color: 'var(--tx-main)' }}>
                                {data.profile.name}
                            </h1>
                            {data.profile.is_inactive ? (
                                <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontSize: '11px', fontWeight: 800 }}>
                                    Inactive Account
                                </span>
                            ) : (
                                <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(16, 185, 129, 0.15)', color: '#10B981', fontSize: '11px', fontWeight: 800 }}>
                                    Active Student
                                </span>
                            )}
                            {data.profile.lateral_entry && (
                                <span style={{ padding: '2px 8px', borderRadius: '6px', background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1', fontSize: '11px', fontWeight: 800 }}>
                                    Lateral Entry
                                </span>
                            )}
                        </div>
                        <div style={{ fontSize: '13px', color: 'var(--tx-muted)', display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
                            <span><strong>USN:</strong> <code style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--tx-main)' }}>{data.profile.usn}</code></span>
                            <span>•</span>
                            <span><strong>Dept:</strong> {data.profile.branch}</span>
                            <span>•</span>
                            <span><strong>Batch:</strong> {data.profile.batch}</span>
                            <span>•</span>
                            <span><strong>Current Sem:</strong> Sem {data.profile.semester}</span>
                            <span>•</span>
                            <span><strong>Email:</strong> {data.profile.email}</span>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <Button onClick={handleDownloadTranscript} variant="secondary" iconStart="picture_as_pdf">
                        Transcript PDF
                    </Button>
                    <Button
                        onClick={handleToggleStatus}
                        variant={data.profile.is_inactive ? 'primary' : 'ghost'}
                        style={{ color: data.profile.is_inactive ? '#FFFFFF' : '#EF4444' }}
                    >
                        {data.profile.is_inactive ? 'Activate Student' : 'Deactivate'}
                    </Button>
                </div>
            </div>

            {/* 7 Performance KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: '12px', marginBottom: '24px' }}>
                {[
                    { label: 'Current CGPA', value: data.kpis.cgpa > 0 ? data.kpis.cgpa.toFixed(2) : '—', color: data.kpis.cgpa >= 8.0 ? '#10B981' : data.kpis.cgpa >= 5.0 ? 'var(--primary)' : '#EF4444' },
                    { label: 'Active Backlogs', value: data.kpis.total_backlogs, color: data.kpis.total_backlogs > 0 ? '#EF4444' : '#10B981' },
                    { label: 'Semesters Tracked', value: data.kpis.semesters_tracked, color: 'var(--tx-main)' },
                    { label: 'Credits Earned', value: data.kpis.credits_earned, color: 'var(--primary)' },
                    { label: 'Subjects Cleared', value: data.kpis.subjects_cleared, color: '#10B981' },
                    { label: 'Subjects Failed', value: data.kpis.subjects_failed, color: data.kpis.subjects_failed > 0 ? '#EF4444' : 'var(--tx-muted)' },
                    { label: 'Best SGPA', value: data.kpis.best_sgpa > 0 ? data.kpis.best_sgpa.toFixed(2) : '—', color: '#6366F1' },
                ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontSize: '10.5px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</div>
                        <div style={{ fontSize: '26px', fontWeight: 900, color: item.color }}>{item.value}</div>
                    </div>
                ))}
            </div>

            {/* Two Column Grid: SGPA Trend Line Chart + Guardian Contact Card */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: '20px', marginBottom: '28px' }}>
                {/* SGPA Trend Chart */}
                <Card>
                    <CardHeader>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '20px' }}>show_chart</span>
                            Academic Progression &amp; SGPA Trajectory
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {data.trend.length === 0 ? (
                            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--tx-dim)', fontSize: '13px' }}>
                                No semester marks on record yet.
                            </div>
                        ) : (
                            <div style={{ width: '100%', height: '220px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={data.trend} margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                                        <XAxis dataKey="semester" tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                        <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} tick={{ fill: 'var(--tx-muted)', fontSize: 12 }} />
                                        <Tooltip
                                            content={({ active, payload }) => {
                                                if (active && payload && payload.length) {
                                                    const d = payload[0].payload;
                                                    return (
                                                        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 12px', fontSize: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                                                            <div style={{ fontWeight: 800 }}>{d.semester}</div>
                                                            <div style={{ color: 'var(--primary)', fontWeight: 700 }}>SGPA: {d.sgpa?.toFixed(2)}</div>
                                                            <div style={{ fontSize: '11px', color: 'var(--tx-muted)' }}>Credits Earned: {d.credits}</div>
                                                            {d.backlogs > 0 && (
                                                                <div style={{ color: '#EF4444', fontWeight: 800, fontSize: '11px' }}>{d.backlogs} Backlogs</div>
                                                            )}
                                                        </div>
                                                    );
                                                }
                                                return null;
                                            }}
                                        />
                                        {data.kpis.cgpa > 0 && (
                                            <ReferenceLine y={data.kpis.cgpa} stroke="#10B981" strokeDasharray="4 4" label={{ value: `CGPA: ${data.kpis.cgpa.toFixed(2)}`, fill: '#10B981', fontSize: 10, position: 'right' }} />
                                        )}
                                        <Line
                                            type="monotone"
                                            dataKey="sgpa"
                                            stroke="var(--primary)"
                                            strokeWidth={3}
                                            dot={{ r: 5, fill: 'var(--primary)', strokeWidth: 2, stroke: '#FFFFFF' }}
                                            activeDot={{ r: 7 }}
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Parent / Guardian Contact Details Card */}
                <Card>
                    <CardHeader>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '20px' }}>family_restroom</span>
                                Parent / Guardian Contact
                            </CardTitle>
                            <Button size="sm" variant="ghost" onClick={() => setShowGuardianModal(true)}>
                                {data.guardian.parent_name ? 'Edit Contact' : '+ Add Guardian'}
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {data.guardian.parent_name ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-low)' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Name</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{data.guardian.parent_name} ({data.guardian.guardian_relation || 'Parent'})</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '8px', borderBottom: '1px solid var(--border-low)' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Phone</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{data.guardian.parent_phone || '—'}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '12px', color: 'var(--tx-dim)', fontWeight: 700, textTransform: 'uppercase' }}>Email</span>
                                    <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--tx-main)' }}>{data.guardian.parent_email || '—'}</span>
                                </div>
                            </div>
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: '12px' }}>
                                <span className="material-icons-round" style={{ fontSize: '32px', color: 'var(--tx-dim)', marginBottom: '8px' }}>contact_phone</span>
                                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>No Parent Contact on File</div>
                                <p style={{ fontSize: '12px', color: 'var(--tx-muted)', margin: '0 0 12px 0' }}>Add guardian information to enable result dispatch and attendance alerts.</p>
                                <Button size="sm" variant="primary" onClick={() => setShowGuardianModal(true)}>
                                    + Add Guardian Details
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Per-Semester Tabbed Marksheet */}
            <Card>
                <CardHeader>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                        <CardTitle style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span className="material-icons-round" style={{ color: 'var(--primary)', fontSize: '20px' }}>assignment</span>
                            Official Semester Mark Sheets
                        </CardTitle>
                        {currentSemStat.sgpa !== undefined && (
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--surface-low)', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 800 }}>
                                    SGPA: <strong style={{ color: 'var(--primary)' }}>{currentSemStat.sgpa.toFixed(2)}</strong>
                                </span>
                                <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'var(--surface-low)', border: '1px solid var(--border)', fontSize: '12px', fontWeight: 800 }}>
                                    Credits: <strong style={{ color: 'var(--tx-main)' }}>{currentSemStat.earnedCredits}</strong> / {currentSemStat.registeredCredits}
                                </span>
                                {currentSemStat.backlogs > 0 && (
                                    <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444', fontSize: '12px', fontWeight: 800 }}>
                                        {currentSemStat.backlogs} Backlog
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </CardHeader>

                {/* Semester Tabs */}
                <div style={{ display: 'flex', gap: '6px', padding: '0 20px 14px 20px', borderBottom: '1px solid var(--border)', overflowX: 'auto' }}>
                    {semsAvailable.length === 0 ? (
                        <div style={{ fontSize: '13px', color: 'var(--tx-dim)', padding: '8px 0' }}>No semester records available.</div>
                    ) : (
                        semsAvailable.map(sem => {
                            const stat = data.semStats[sem];
                            const hasFail = stat?.backlogs > 0;
                            return (
                                <button
                                    key={sem}
                                    onClick={() => setActiveSemTab(sem)}
                                    style={{
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        fontSize: '13px',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        background: activeSemTab === sem ? 'var(--primary)' : 'var(--surface-low)',
                                        color: activeSemTab === sem ? '#FFFFFF' : hasFail ? '#EF4444' : 'var(--tx-muted)',
                                        transition: 'all 0.15s ease',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    Semester {sem}
                                    {hasFail && (
                                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#EF4444' }} />
                                    )}
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Mark Sheet Table */}
                <CardContent style={{ padding: 0 }}>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ background: 'var(--surface-low)', borderBottom: '1px solid var(--border)' }}>
                                <tr>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '130px' }}>Subject Code</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left' }}>Subject Name</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', width: '60px' }}>Credits</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', width: '70px' }}>CIE</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', width: '70px' }}>SEE</th>
                                    <th style={{ padding: '12px 10px', textAlign: 'center', width: '75px' }}>Total</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', width: '65px' }}>Grade</th>
                                    <th style={{ padding: '12px 8px', textAlign: 'center', width: '60px' }}>GP</th>
                                    <th style={{ padding: '12px 12px', textAlign: 'center', width: '85px' }}>Result</th>
                                    <th style={{ padding: '12px 14px', textAlign: 'left', width: '160px' }}>Exam Session</th>
                                </tr>
                            </thead>
                            <tbody>
                                {currentSemMarks.length === 0 ? (
                                    <tr>
                                        <td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: 'var(--tx-dim)' }}>
                                            No subjects logged for Semester {activeSemTab}.
                                        </td>
                                    </tr>
                                ) : (
                                    currentSemMarks.map(m => {
                                        const isF = m.is_fail;
                                        return (
                                            <tr
                                                key={m.subject_code}
                                                style={{
                                                    borderBottom: '1px solid var(--border-low)',
                                                    background: isF ? 'rgba(239, 68, 68, 0.04)' : 'transparent'
                                                }}
                                            >
                                                <td style={{ padding: '12px 14px', fontWeight: 800, color: 'var(--primary)', fontFamily: 'monospace' }}>
                                                    {m.subject_code}
                                                </td>
                                                <td style={{ padding: '12px 14px', fontWeight: 600 }}>
                                                    {m.subject_name}
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700 }}>
                                                    {m.credits}
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                    {m.internal ?? '—'}
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--tx-muted)' }}>
                                                    {m.external ?? '—'}
                                                </td>
                                                <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 900, color: isF ? '#EF4444' : 'var(--tx-main)' }}>
                                                    {m.total}
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '2px 7px', borderRadius: '4px',
                                                        fontSize: '11px', fontWeight: 800,
                                                        background: isF ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                        color: isF ? '#EF4444' : '#10B981'
                                                    }}>
                                                        {m.grade}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700 }}>
                                                    {m.grade_point}
                                                </td>
                                                <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                                                    <span style={{
                                                        padding: '2px 8px', borderRadius: '4px',
                                                        fontSize: '11px', fontWeight: 800,
                                                        background: isF ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                                                        color: isF ? '#EF4444' : '#10B981'
                                                    }}>
                                                        {m.result}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 14px', fontSize: '12px', color: 'var(--tx-muted)' }}>
                                                    {m.exam_session || 'Regular'}
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

            {/* Guardian Modal */}
            {showGuardianModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', maxWidth: '480px', width: '100%', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 4px 0' }}>Parent / Guardian Details</h2>
                        <p style={{ fontSize: '13px', color: 'var(--tx-muted)', margin: '0 0 16px 0' }}>Update contact information for result dispatch and attendance reporting.</p>

                        <form onSubmit={handleSaveGuardian} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <Input
                                label="Parent / Guardian Full Name"
                                placeholder="e.g. Mohammed Ahmed"
                                value={guardianForm.parent_name}
                                onChange={e => setGuardianForm({ ...guardianForm, parent_name: e.target.value })}
                                required
                            />
                            <Select
                                label="Relationship"
                                value={guardianForm.guardian_relation}
                                onChange={e => setGuardianForm({ ...guardianForm, guardian_relation: e.target.value })}
                                options={[
                                    { value: 'Father', label: 'Father' },
                                    { value: 'Mother', label: 'Mother' },
                                    { value: 'Guardian', label: 'Guardian' },
                                    { value: 'Parent', label: 'Parent' },
                                ]}
                            />
                            <Input
                                label="Phone Number"
                                placeholder="e.g. +91 98765 43210"
                                value={guardianForm.parent_phone}
                                onChange={e => setGuardianForm({ ...guardianForm, parent_phone: e.target.value })}
                            />
                            <Input
                                label="Email Address"
                                type="email"
                                placeholder="e.g. parent@example.com"
                                value={guardianForm.parent_email}
                                onChange={e => setGuardianForm({ ...guardianForm, parent_email: e.target.value })}
                            />

                            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                <Button type="button" variant="ghost" onClick={() => setShowGuardianModal(false)} style={{ flex: 1 }}>
                                    Cancel
                                </Button>
                                <Button type="submit" variant="primary" loading={savingGuardian} style={{ flex: 1 }}>
                                    Save Contact
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
