'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../../lib/api/client';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';
import { Badge, Button, Divider, EmptyState, IconButton, Inline, LoadingState, ResponsiveGrid } from '../../components/ui';
import { getGradeBadgeTone, unifyGrade, isFailedSubject, getGradeRank } from '../../lib/vtuGrades';
import { calculateAcademicRecord } from '../../lib/vtuAcademicEngine';
import { supabase } from '../../lib/supabase';
import styles from './Dashboard.module.css';

function StudentDashboardView({
    backlogs,
    backlogDialogRef,
    closeBacklogModal,
    cgpa,
    downloadPDF,
    failedSubjects,
    fileInputRef,
    handlePdfUpload,
    marks,
    pdfError,
    pdfLoading,
    pdfMsg,
    percentage,
    router,
    semStats,
    semesterCount,
    setShowBacklogModal,
    sgpas,
    showBacklogModal,
    sortedSemesters,
    student,
    totalSubjects,
}) {
    const GradeBadge = ({ grade }) => {
        const tone = getGradeBadgeTone(grade);
        const displayText = grade || '—';
        return (
            <Badge
                tone={tone}
                size="sm"
                style={{
                    fontWeight: 900,
                    minWidth: '32px',
                    height: '24px',
                    padding: '0 8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: 'var(--radius-full)',
                    fontSize: '12px',
                    letterSpacing: '0.04em'
                }}
            >
                {displayText}
            </Badge>
        );
    };

    const StatContent = ({ label, value, sub, tone, actionable = false }) => (
        <>
            <div className={styles.statLabel}>{label}</div>
            <div className={`${styles.statValue} ${tone ? styles[tone] : ''}`}>
                {value}
                {actionable && <span className="material-icons-round" aria-hidden="true">arrow_forward</span>}
            </div>
            {sub && <div className={styles.statSub}>{sub}</div>}
        </>
    );

    const cgpaTone = cgpa >= 7.5 ? 'statValueStrong' : cgpa >= 5 ? '' : 'statValueWarn';
    const summaryLabel = cgpa >= 7.75 ? 'First Class Distinction' : cgpa >= 6.75 ? 'First Class' : cgpa > 0 ? 'Pass' : '';
    const isInfoMessage = pdfMsg.startsWith('â„¹') || pdfMsg.startsWith('ℹ');

    const latestSem = sortedSemesters.length > 0 ? sortedSemesters[0][0] : null;
    const [expandedSemesters, setExpandedSemesters] = useState({});

    const isExpanded = (sem) => {
        if (expandedSemesters[sem] !== undefined) {
            return expandedSemesters[sem];
        }
        // Default: Only the most recent / top semester is open, others closed
        return sem === latestSem;
    };

    const toggleSemester = (sem) => {
        setExpandedSemesters(prev => {
            const currentlyOpen = isExpanded(sem);
            return {
                ...prev,
                [sem]: !currentlyOpen
            };
        });
    };

    const allExpanded = sortedSemesters.length > 0 && sortedSemesters.every(([sem]) => isExpanded(sem));

    const toggleAll = () => {
        const nextState = !allExpanded;
        const update = {};
        sortedSemesters.forEach(([sem]) => {
            update[sem] = nextState;
        });
        setExpandedSemesters(update);
    };

    return (
        <>
            <div className={`${styles.page} gf-page gf-page-default gf-fade-up`}>
                <section className={styles.section} aria-labelledby="student-profile-title">
                    <div className={styles.profileHeader}>
                        <div className={styles.avatar} aria-hidden="true">
                            {(student?.name?.[0] || student?.usn?.[0] || 'S').toUpperCase()}
                        </div>
                        <div>
                            <h1 id="student-profile-title" className={styles.sectionTitle}>
                                {student?.name && student.name !== student.usn ? student.name : 'Academic Dashboard'}
                            </h1>
                            <p className={styles.meta}>
                                {student?.usn || 'USN'} · {student?.branch || 'General'} · Scheme {student?.scheme || '2022'}
                            </p>
                        </div>
                        <div className={styles.profileActions}>
                            {totalSubjects > 0 && (
                                <Button variant="secondary" iconStart="picture_as_pdf" onClick={downloadPDF} disabled={pdfLoading} loading={pdfLoading} density="compact">
                                    {pdfLoading ? 'Generating...' : 'PDF Transcript'}
                                </Button>
                            )}
                        </div>
                    </div>

                    {pdfMsg && (
                        <div className={`${styles.notice} ${isInfoMessage ? styles.noticeInfo : styles.noticeError}`}>
                            {pdfMsg}
                        </div>
                    )}

                    <ResponsiveGrid size="sm" className={styles.statsGrid} aria-label="Academic overview">
                        <div className={styles.statCard}>
                            <StatContent
                                label="Current CGPA"
                                value={cgpa > 0 ? cgpa.toFixed(2) : '—'}
                                sub={percentage > 0 ? `${percentage.toFixed(1)}%` : 'N/A'}
                                tone={cgpaTone}
                            />
                        </div>
                        <div className={styles.statCard}>
                            <StatContent label="Semesters Tracked" value={semesterCount || '—'} />
                        </div>
                        <div className={styles.statCard}>
                            <StatContent label="Subjects Logged" value={totalSubjects || '—'} />
                        </div>
                        {failedSubjects > 0 ? (
                            <button className={styles.statCardButton} type="button" onClick={() => setShowBacklogModal(true)} aria-haspopup="dialog" aria-controls="backlog-modal">
                                <StatContent label="Backlogs" value={failedSubjects} sub={`${failedSubjects} subject(s)`} tone="dangerText" actionable />
                            </button>
                        ) : (
                            <div className={styles.statCard}>
                                <StatContent label="Backlogs" value={failedSubjects} sub="All Clear" tone="successText" />
                            </div>
                        )}
                    </ResponsiveGrid>

                    <div className={styles.resultBar}>
                        <div>
                            <div className={styles.resultLabel}>Overall CGPA</div>
                            <div className={styles.resultValue}>{cgpa.toFixed(2)}</div>
                            <div className={styles.resultMeta}>
                                {percentage > 0 ? `${percentage.toFixed(1)}% Equivalent` : ''}{percentage > 0 && summaryLabel ? ' · ' : ''}{summaryLabel}
                            </div>
                        </div>
                        <div className={styles.chipRow}>
                            {sortedSemesters.map(([sem]) => (
                                <Badge key={sem} tone="info" size="sm">
                                    S{sem}: {(sgpas[sem] || 0).toFixed(2)}
                                </Badge>
                            ))}
                        </div>
                    </div>
                </section>

                {semesterCount > 0 ? (
                    <section className={styles.section} aria-labelledby="student-records-title">
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 id="student-records-title" className={styles.sectionTitle}>Semester Records</h2>
                                <p className={styles.meta}>Click any semester to expand or collapse details</p>
                            </div>
                            <div className={styles.chipRow}>
                                <Button
                                    variant="ghost"
                                    density="compact"
                                    iconStart={allExpanded ? 'unfold_less' : 'unfold_more'}
                                    onClick={toggleAll}
                                >
                                    {allExpanded ? 'Collapse All' : 'Expand All'}
                                </Button>
                                {sortedSemesters.map(([sem]) => (
                                    <Badge key={sem} tone="info" size="sm">
                                        S{sem}: {(sgpas[sem] || 0).toFixed(2)}
                                    </Badge>
                                ))}
                            </div>
                        </div>

                        <div className={styles.tableWrap}>
                            <table className={styles.table}>
                                <thead>
                                    <tr>
                                        <th scope="col">Semester</th>
                                        <th scope="col" className={styles.center}>SGPA</th>
                                        <th scope="col" className={styles.center}>Credits Attempted</th>
                                        <th scope="col" className={styles.center}>Credits Earned</th>
                                        <th scope="col" className={styles.center}>Grade Points</th>
                                        <th scope="col" className={styles.center}>Backlogs</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedSemesters.map(([sem]) => {
                                        const stat = semStats[sem] || { sgpa: 0, totalCredits: 0, earnedCredits: 0, gradePoints: 0, backlogs: 0 };
                                        return (
                                            <tr key={sem}>
                                                <th scope="row"><strong>Semester {sem}</strong></th>
                                                <td className={styles.center}><strong>{stat.sgpa.toFixed(2)}</strong></td>
                                                <td className={styles.center}>{stat.totalCredits}</td>
                                                <td className={styles.center}>{stat.earnedCredits}</td>
                                                <td className={styles.center}>{stat.gradePoints.toFixed(2)}</td>
                                                <td className={styles.center}>
                                                    <Badge tone={stat.backlogs > 0 ? 'danger' : 'success'} size="sm">
                                                        {stat.backlogs === 0 ? 'Clear' : stat.backlogs}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className={styles.records}>
                            {sortedSemesters.map(([sem, subjects]) => {
                                const open = isExpanded(sem);
                                return (
                                    <article key={sem} className={styles.semesterCard}>
                                        <div
                                            className={styles.semesterHeader}
                                            onClick={() => toggleSemester(sem)}
                                            style={{
                                                cursor: 'pointer',
                                                userSelect: 'none',
                                                borderRadius: 'var(--radius-3)',
                                            }}
                                            role="button"
                                            tabIndex={0}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ' ') {
                                                    e.preventDefault();
                                                    toggleSemester(sem);
                                                }
                                            }}
                                            aria-expanded={open}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <div style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: 'var(--radius-3)',
                                                    background: open ? 'var(--primary)' : 'var(--surface)',
                                                    border: open ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                    color: open ? '#FFFFFF' : 'var(--tx-muted)',
                                                    fontWeight: 900,
                                                    fontSize: '14px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all var(--transition-fast)'
                                                }}>
                                                    {sem}
                                                </div>
                                                <div>
                                                    <h3 className={styles.semesterTitle}>Semester {sem}</h3>
                                                    <p className={styles.meta}>{subjects.length} Subjects Listed</p>
                                                </div>
                                            </div>
                                            <div className={styles.semesterActions}>
                                                <Badge tone="info" size="sm">SGPA: {(sgpas[sem] || 0).toFixed(2)}</Badge>
                                                <Button
                                                    variant="secondary"
                                                    density="compact"
                                                    iconStart="download"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        import('../../lib/generatePDF').then(({ generateResultPDF }) => {
                                                            generateResultPDF({
                                                                studentName: student.name || 'Student',
                                                                usn: student.usn || 'N/A',
                                                                branch: student.branch || '',
                                                                scheme: student.scheme || '2022',
                                                                semesterMarks: { [sem]: subjects },
                                                                cgpa: sgpas[sem]
                                                            });
                                                        }).catch(err => alert('PDF Import Error: ' + err.message));
                                                    }}
                                                >
                                                    Sem {sem} PDF
                                                </Button>
                                                <IconButton
                                                    icon={open ? 'expand_less' : 'expand_more'}
                                                    variant="ghost"
                                                    density="compact"
                                                    aria-label={open ? `Collapse Semester ${sem}` : `Expand Semester ${sem}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        toggleSemester(sem);
                                                    }}
                                                />
                                            </div>
                                        </div>

                                        {open && (
                                            <div className="gf-fade-in">
                                                <Divider />
                                                <div className={styles.tableWrap}>
                                                    <table className={`${styles.table} ${styles.subjectTable}`}>
                                                        <thead>
                                                            <tr>
                                                                <th scope="col">Code</th>
                                                                <th scope="col">Subject</th>
                                                                <th scope="col" className={styles.center}>CR</th>
                                                                <th scope="col" className={styles.center}>INT</th>
                                                                <th scope="col" className={styles.center}>EXT</th>
                                                                <th scope="col" className={styles.center}>Total</th>
                                                                <th scope="col" className={styles.center}>Grade</th>
                                                                <th scope="col" className={styles.center}>GP</th>
                                                                <th scope="col" className={styles.center}>Result</th>
                                                                <th scope="col">Session</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {subjects.map((m, idx) => {
                                                                const isPass = m.isPassed && !m.isFailed;
                                                                return (
                                                                    <tr key={m.id || idx}>
                                                                        <th scope="row" className={styles.code}>{m.subjectCode || m.subject_code || m.code || '—'}</th>
                                                                        <td>{m.subjectName || m.subject_name || m.name || 'Unknown'}</td>
                                                                        <td className={styles.center}><strong>{m.credits}</strong></td>
                                                                        <td className={styles.center}>{m.internalMarks ?? m.cie_marks ?? m.internal ?? '—'}</td>
                                                                        <td className={styles.center}>{m.seeMarks ?? m.see_marks ?? m.external ?? '—'}</td>
                                                                        <td className={styles.center}><strong>{m.totalMarks ?? m.total_marks ?? m.total ?? '—'}</strong></td>
                                                                        <td className={styles.center}><GradeBadge grade={m.grade} /></td>
                                                                        <td className={styles.center}><strong>{m.gpFormatted || (m.gradePoint != null ? m.gradePoint.toFixed(2) : '0.00')}</strong></td>
                                                                        <td className={styles.center}>
                                                                            <Badge tone={isPass ? 'success' : 'danger'} size="sm">
                                                                                {isPass ? 'Pass' : 'Fail'}
                                                                            </Badge>
                                                                        </td>
                                                                        <td className={styles.nowrap}>{m.announcedDate || m.announced_date || m.exam_date || 'Regular'}</td>
                                                                    </tr>
                                                                );
                                                            })}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className={styles.mobileSubjectList}>
                                                    {subjects.map((m, idx) => {
                                                        const isPass = m.isPassed && !m.isFailed;
                                                        return (
                                                            <div key={m.id || idx} className={styles.mobileSubjectCard}>
                                                                <div className={styles.mobileSubjectHeader}>
                                                                    <div className={styles.mobileSubjectTitleGroup}>
                                                                        <span className={styles.code}>{m.subjectCode || m.subject_code || m.code || '—'}</span>
                                                                        <span className={styles.subjectName}>{m.subjectName || m.subject_name || m.name || 'Unknown'}</span>
                                                                    </div>
                                                                    <GradeBadge grade={m.grade} />
                                                                </div>
                                                                <div className={styles.mobileSubjectStats}>
                                                                    <div className={styles.mobileStatItem}>
                                                                        <span className={styles.statMiniLabel}>Credits:</span>
                                                                        <span>{m.credits}</span>
                                                                    </div>
                                                                    <div className={styles.mobileStatItem}>
                                                                        <span className={styles.statMiniLabel}>CIE:</span>
                                                                        <span>{m.internalMarks ?? m.cie_marks ?? m.internal ?? '—'}</span>
                                                                    </div>
                                                                    <div className={styles.mobileStatItem}>
                                                                        <span className={styles.statMiniLabel}>SEE:</span>
                                                                        <span>{m.seeMarks ?? m.see_marks ?? m.external ?? '—'}</span>
                                                                    </div>
                                                                    <div className={styles.mobileStatItem}>
                                                                        <span className={styles.statMiniLabel}>Total:</span>
                                                                        <strong>{m.totalMarks ?? m.total_marks ?? m.total ?? '—'}</strong>
                                                                    </div>
                                                                    <div className={styles.mobileStatItem}>
                                                                        <span className={styles.statMiniLabel}>GP:</span>
                                                                        <strong>{m.gpFormatted || (m.gradePoint != null ? m.gradePoint.toFixed(2) : '0.00')}</strong>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {student?.history?.[sem] && student.history[sem].length > 0 && (
                                                    <div className={styles.historyPanel}>
                                                        <div className={styles.historyTitle}>
                                                            <span className="material-icons-round" aria-hidden="true">history</span>
                                                            Previous / Backlog Attempts
                                                        </div>
                                                        <div className={styles.backlogList}>
                                                            {student.history[sem].map((hm, hidx) => (
                                                                <div key={`hist-${hm.id || hidx}`} className={styles.historyItem}>
                                                                    <div>
                                                                        <div className={styles.historyName}>
                                                                            {hm.subject_name || hm.name} <span className={styles.code}>({hm.subject_code || hm.code})</span>
                                                                        </div>
                                                                        <div className={styles.historyDate}>{hm.exam_date}</div>
                                                                    </div>
                                                                    <div className={styles.historyScore}>
                                                                        <span>Total: <strong>{hm.total_marks ?? hm.total ?? '—'}</strong></span>
                                                                        <GradeBadge grade={hm.grade} />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ) : (
                    <EmptyState
                        variant="panel"
                        icon="school"
                        title="No Academic Records Yet"
                        description="Your VTU exam marks and results will appear here once announced or scraped."
                    />
                )}
            </div>

            {showBacklogModal && (
                <div className={styles.modalOverlay} role="presentation" onClick={closeBacklogModal}>
                    <section
                        id="backlog-modal"
                        ref={backlogDialogRef}
                        className={`${styles.modal} gf-fade-up`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="backlog-modal-title"
                        aria-describedby="backlog-modal-description"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 id="backlog-modal-title" className={styles.modalTitle}>Backlog Subjects</h2>
                                <p id="backlog-modal-description" className={styles.modalDescription}>
                                    Subjects currently marked as failing or absent.
                                </p>
                            </div>
                            <IconButton icon="close" variant="ghost" aria-label="Close backlog dialog" onClick={closeBacklogModal} />
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.modalList}>
                                {backlogs.map((m, idx) => (
                                    <div key={idx} className={styles.modalItem}>
                                        <div>
                                            <div className={styles.subjectName}>{m.subject_name || m.name}</div>
                                            <div className={styles.mutedCell}>{m.subject_code || m.code} · Sem {m.semester}</div>
                                        </div>
                                        <Badge tone="danger">{unifyGrade(m.grade) === 'A' ? 'Absent' : 'Fail'}</Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </>
    );
}

function DashboardContent() {
    const router = useRouter();
    const [student, setStudent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [marks, setMarks] = useState({});
    const [sgpas, setSgpas] = useState({});
    const [semStats, setSemStats] = useState({});
    const [cgpa, setCgpa] = useState(0);
    const [percentage, setPercentage] = useState(0);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [pdfMsg, setPdfMsg] = useState('');
    const [pdfError, setPdfError] = useState('');
    const fileInputRef = useRef(null);
    const backlogDialogRef = useRef(null);
    const [showBacklogModal, setShowBacklogModal] = useState(false);
    const loadedRef = useRef(false);

    const closeBacklogModal = useCallback(() => {
        setShowBacklogModal(false);
    }, []);

    useEffect(() => {
        if (!showBacklogModal) return;

        const focusableSelector = [
            'a[href]',
            'button:not([disabled])',
            'textarea:not([disabled])',
            'input:not([disabled])',
            'select:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ].join(',');

        const getFocusableItems = () => Array.from(backlogDialogRef.current?.querySelectorAll(focusableSelector) || []);

        window.requestAnimationFrame(() => {
            getFocusableItems()[0]?.focus();
        });

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                closeBacklogModal();
                return;
            }

            if (event.key !== 'Tab') return;

            const items = getFocusableItems();
            if (items.length === 0) {
                event.preventDefault();
                return;
            }

            const firstItem = items[0];
            const lastItem = items[items.length - 1];

            if (event.shiftKey && document.activeElement === firstItem) {
                event.preventDefault();
                lastItem.focus();
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault();
                firstItem.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [closeBacklogModal, showBacklogModal]);

    const loadStudentData = useCallback(async (usn, session) => {
        setLoading(true);
        try {
            const data = await apiRequest('/api/student/dashboard', { query: { usn } });
            const profile = data?.profile || { usn, name: session?.name || usn, scheme: session?.scheme || '2022' };
            const resultMarks = data?.recentResults || [];

            // ── Run Canonical Academic Calculation Pipeline ──
            const record = calculateAcademicRecord(resultMarks, profile);

            setStudent(record.profile);
            setMarks(record.marksBySemester);
            setSgpas(record.semSGPAs);
            setSemStats(record.semStats);
            setCgpa(record.cgpa);
            setPercentage(Math.max(0, (record.cgpa - 0.75) * 10));

        } catch (err) {
            console.error('Failed to load student data:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (loadedRef.current) return;
        loadedRef.current = true;

        const verifyAndLoad = async () => {
            const stuSession = localStorage.getItem('student_session');
            if (!stuSession) return;

            try {
                const parsed = JSON.parse(stuSession);

                const encoder = new TextEncoder();
                const data = encoder.encode((parsed.usn + parsed.id) + '_gradeflow_secret_v1_2026');
                const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const expected = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                if (parsed.signature !== expected) {
                    console.error('Security: Invalid session signature.');
                    localStorage.removeItem('student_session');
                    router.push('/auth/student');
                    return;
                }

                loadStudentData(parsed.usn.toUpperCase(), parsed);
            } catch (e) {
                console.error('Session error:', e);
                setLoading(false);
            }
        };

        verifyAndLoad();
    }, [loadStudentData, router]);

    // ── PDF/Image Upload Handler with full validation ──
    const handlePdfUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const isPdf = file.name.toLowerCase().endsWith('.pdf');
        const isImage = file.name.toLowerCase().match(/\.(jpg|jpeg|png)$/);

        if (!isPdf && !isImage) {
            setPdfError('Please select a valid .pdf, .jpg, or .png file.');
            return;
        }
        if (file.size > 30 * 1024 * 1024) {
            setPdfError('File too large. Max 30MB.');
            return;
        }

        setPdfLoading(true);
        setPdfError('');
        setPdfMsg(isPdf ? 'Processing PDF...' : 'Processing Image with OCR...');

        try {
            const fd = new FormData();
            fd.append(isPdf ? 'pdf' : 'image', file);

            const endpoint = isPdf ? '/api/parse-pdf' : '/api/parse-image';
            const res = await fetch(endpoint, { method: 'POST', body: fd });
            const json = await res.json();

            if (!json.success) throw new Error(json.detail || json.error || 'Parsing failed.');

            const data = json.data;
            const subjectCount = data.subjects?.length || 0;

            if (subjectCount === 0) {
                throw new Error('No subjects found in this PDF. Please ensure it is a valid VTU result document.');
            }

            // ══════════════════════════════════════════════════════
            //  SECURITY: USN OWNERSHIP VALIDATION
            // ══════════════════════════════════════════════════════
            const pdfUSN = data.studentInfo?.usn?.toUpperCase()?.trim();
            const loggedInUSN = student?.usn?.toUpperCase()?.trim();

            if (pdfUSN && loggedInUSN && pdfUSN !== loggedInUSN) {
                const pdfName = data.studentInfo?.name || pdfUSN;
                setPdfError(
                    `🚫 Identity Mismatch: This result belongs to ${pdfName} (${pdfUSN}). ` +
                    `You are logged in as ${student.name || loggedInUSN} (${loggedInUSN}). ` +
                    `You cannot upload results belonging to another student.`
                );
                setPdfMsg('');
                setPdfLoading(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            // ══════════════════════════════════════════════════════
            //  DUPLICATE DETECTION
            // ══════════════════════════════════════════════════════
            const pdfSemester = data.studentInfo?.semester || data.subjects?.[0]?.semester || 1;
            const existingSubjectsInSem = (marks[pdfSemester] || []);

            if (existingSubjectsInSem.length > 0) {
                // Check if the exact same subjects already exist
                const newCodes = data.subjects.map(s => s.code).filter(Boolean).sort();
                const existingCodes = existingSubjectsInSem.map(s => s.subject_code || s.code).filter(Boolean).sort();

                const isExactDuplicate = newCodes.length === existingCodes.length &&
                    newCodes.every((code, i) => code === existingCodes[i]);

                if (isExactDuplicate) {
                    // Check if grades are also the same (truly identical upload)
                    const newGrades = data.subjects.map(s => s.grade).sort().join(',');
                    const existingGrades = existingSubjectsInSem.map(s => s.grade).sort().join(',');

                    if (newGrades === existingGrades) {
                        setPdfMsg('ℹ️ Semester ' + pdfSemester + ' results are already up to date. No changes were made.');
                        setPdfLoading(false);
                        if (fileInputRef.current) fileInputRef.current.value = '';
                        return;
                    }
                }
            }

            // ══════════════════════════════════════════════════════
            //  BACKLOG HANDLING: Only update if the new grade is better
            // ══════════════════════════════════════════════════════
            const marksToSave = [];
            if (student?.id && data.subjects?.length > 0) {
                const semester = pdfSemester;

                for (const s of data.subjects) {
                    const subjectSem = s.semester || semester;
                    const newGrade = s.grade || 'P';
                    const newRank = getGradeRank(newGrade);

                    // Check existing grade for this subject
                    const existingMark = (marks[subjectSem] || []).find(
                        m => (m.subject_code || m.code) === s.code
                    );
                    const existingRank = existingMark ? getGradeRank(existingMark.grade) : -1;

                    // Only save if new grade is better or no existing grade
                    if (newRank >= existingRank) {
                        marksToSave.push({
                            student_id: student.id,
                            student_usn: student.usn,
                            subject_code: s.code,
                            subject_name: s.name || s.code,
                            cie_marks: s.internal || 0,
                            see_marks: s.external || 0,
                            total_marks: s.total || ((s.internal || 0) + (s.external || 0)),
                            grade: newGrade,
                            credits: s.credits || 3,
                            semester: subjectSem,
                            sync_source: 'PDF_UPLOAD'
                        });
                    }
                }

                if (marksToSave.length > 0) {
                    const { error: mErr } = await supabase
                        .from('marks')
                        .upsert(marksToSave, { onConflict: 'student_id,subject_code,semester' });

                    if (mErr) {
                        console.warn('Marks save warning:', mErr);
                    }
                }
            }

            // ══════════════════════════════════════════════════════
            //  AUTO-NAME: Populate student name from PDF if missing
            // ══════════════════════════════════════════════════════
            const pdfName = data.studentInfo?.name;
            if (pdfName && student?.usn) {
                const currentName = student.name;
                // Update if name is missing, is just the USN, or too short
                if (!currentName || currentName === student.usn || currentName.length < 3) {
                    try {
                        await apiRequest('/api/student/profile', {
                            method: 'PATCH',
                            headers: { 'x-student-usn': student.usn },
                            body: JSON.stringify({ name: pdfName })
                        });
                        // Update local state immediately
                        setStudent(prev => ({ ...prev, name: pdfName }));

                        // Also update localStorage session so the navbar reflects the name
                        try {
                            const sess = JSON.parse(localStorage.getItem('student_session') || '{}');
                            sess.name = pdfName;
                            localStorage.setItem('student_session', JSON.stringify(sess));
                        } catch (e) { /* non-critical */ }
                    } catch (e) { /* non-critical */ }
                }
            }

            // Build success message
            const savedCount = marksToSave.length;
            const skippedCount = subjectCount - savedCount;
            let msg = `✅ Processed ${subjectCount} subjects from Semester ${pdfSemester}.`;
            if (savedCount > 0) msg += ` ${savedCount} saved/updated.`;
            if (skippedCount > 0 && savedCount > 0) msg += ` ${skippedCount} skipped (existing grade was better).`;
            if (pdfName) msg += ` Student: ${pdfName}.`;

            setPdfMsg(msg);

            // Refresh dashboard data
            await loadStudentData(student.usn, JSON.parse(localStorage.getItem('student_session') || '{}'));

            setTimeout(() => setPdfMsg(''), 8000);
        } catch (err) {
            console.error('PDF Upload Error:', err);
            setPdfError(err.message || 'Error processing PDF. Please ensure it is a valid VTU result document.');
        } finally {
            setPdfLoading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const downloadPDF = async () => {
        setPdfLoading(true);
        try {
            const { generateResultPDF } = await import('../../lib/generatePDF');
            generateResultPDF({
                studentName: student?.name || 'Student',
                usn: student?.usn || 'N/A',
                branch: student?.branch || '',
                scheme: student?.scheme || '2022',
                semesterMarks: marks,
                cgpa,
            });
        } catch (err) {
            console.error('PDF generation error:', err);
            alert('PDF generation error: ' + err.message);
        } finally {
            setPdfLoading(false);
        }
    };

    const sortedSemesters = Object.entries(marks).sort(([a], [b]) => Number(b) - Number(a));
    const semesterCount = sortedSemesters.length;
    const totalSubjects = Object.values(marks).flat().length;
    // Canonical backlog detection — uses isFailedSubject() from vtuGrades.js (single source of truth)
    const backlogs = Object.values(marks).flat().filter(m => isFailedSubject(m));
    const failedSubjects = backlogs.length;

    if (loading) return (
        <div className={`${styles.page} gf-page gf-page-wide`}>
            <LoadingState block label="Synthesizing your academic record..." />
        </div>
    );

    return (
        <StudentDashboardView
            backlogs={backlogs}
            backlogDialogRef={backlogDialogRef}
            closeBacklogModal={closeBacklogModal}
            cgpa={cgpa}
            downloadPDF={downloadPDF}
            failedSubjects={failedSubjects}
            fileInputRef={fileInputRef}
            handlePdfUpload={handlePdfUpload}
            marks={marks}
            pdfError={pdfError}
            pdfLoading={pdfLoading}
            pdfMsg={pdfMsg}
            percentage={percentage}
            router={router}
            semStats={semStats}
            semesterCount={semesterCount}
            setShowBacklogModal={setShowBacklogModal}
            sgpas={sgpas}
            showBacklogModal={showBacklogModal}
            sortedSemesters={sortedSemesters}
            student={student}
            totalSubjects={totalSubjects}
        />
    );
}

export default function Dashboard() {
    return (
        <AuthGuard role="student">
            <DashboardContent />
        </AuthGuard>
    );
}
