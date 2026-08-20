'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../../lib/api/client';
import { useRouter } from 'next/navigation';
import AuthGuard from '../../components/AuthGuard';
import { Badge, Button, EmptyState, IconButton, Inline, LoadingState, ResponsiveGrid } from '../../components/ui';
import { getGradePoint, getGradeRank, unifyGrade } from '../../lib/vtuGrades';
import styles from './Dashboard.module.css';

function calcSGPA(subjects) {
    const excludeGrades = ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'];
    // Only include subjects that are not in the exclude list
    const validSubs = subjects.filter(m => !excludeGrades.includes((m.grade || '').trim().toUpperCase()));

    let totalCredits = 0;
    let earnedCredits = 0;
    let totalCreditPoints = 0;
    let backlogs = 0;

    validSubs.forEach(m => {
        const grade = (m.grade || '').trim().toUpperCase();
        const unified = unifyGrade(grade);
        const credits = Number(m.credits) || 3;
        const gp = getGradePoint(grade, '2022', m.total_marks || m.total, m.see_marks ?? m.external ?? null);

        totalCredits += credits;

        // Sum up weighted grade points (Grade Point * Credits)
        totalCreditPoints += (gp * credits);

        if (unified === 'P') {
            earnedCredits += credits;
        } else {
            backlogs++;
        }
    });

    const sgpa = totalCredits > 0 ? (totalCreditPoints / totalCredits) : 0;

    return {
        sgpa,
        totalCredits,
        earnedCredits,  // FIXED: always return numeric value — was causing empty data for sem 2,3,4
        backlogs,
        gradePoints: totalCreditPoints
    };
}

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
    const gradeTone = (grade) => {
        const unified = unifyGrade(grade);
        if (unified === 'F' || unified === 'A') return 'danger';
        if (unified === 'P') return 'success';
        return 'info';
    };

    const GradeBadge = ({ grade }) => (
        <Badge tone={gradeTone(grade)} size="sm">
            {unifyGrade(grade)}
        </Badge>
    );

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

    return (
        <>
            <div className={`${styles.page} gf-page gf-page-wide gf-fade-up`}>
                <header className={styles.header}>
                    <div className={styles.eyebrow}>Academic Command Center</div>
                    <h1 className={`gf-page-title ${styles.title}`}>
                        {student?.name && student.name !== student.usn ? `Welcome, ${student.name}` : 'Academic Dashboard'}
                    </h1>
                    <p className={styles.subtitle}>
                        {student?.usn || 'USN'} · {student?.branch || 'Branch'} · Scheme {student?.scheme || '2022'}
                    </p>
                </header>

                <ResponsiveGrid as="section" size="sm" className={styles.statsGrid} aria-label="Academic overview">
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
                        <button className={styles.statButton} type="button" onClick={() => setShowBacklogModal(true)} aria-haspopup="dialog" aria-controls="backlog-modal">
                            <StatContent label="Backlogs" value={failedSubjects} sub={`${failedSubjects} subject(s)`} tone="statValueDanger" actionable />
                        </button>
                    ) : (
                        <div className={styles.statCard}>
                            <StatContent label="Backlogs" value={failedSubjects} sub="All Clear" tone="statValueStrong" />
                        </div>
                    )}
                </ResponsiveGrid>

                {totalSubjects > 0 && (
                    <Inline className={styles.actions} stackMobile>
                        <Button variant="secondary" iconStart="picture_as_pdf" onClick={downloadPDF} disabled={pdfLoading} loading={pdfLoading}>
                            {pdfLoading ? 'Generating...' : 'Download PDF Transcript'}
                        </Button>
                    </Inline>
                )}

                {semesterCount > 0 ? (
                    <>
                        <section className={styles.summaryBand} aria-label="Overall result summary">
                            <div>
                                <div className={styles.summaryLabel}>Overall CGPA</div>
                                <div className={styles.summaryValue}>{cgpa.toFixed(2)}</div>
                                <div className={styles.summarySub}>
                                    {percentage > 0 ? `${percentage.toFixed(1)}%` : ''}{percentage > 0 && summaryLabel ? ' · ' : ''}{summaryLabel}
                                </div>
                            </div>
                            <div className={styles.summaryAside}>
                                <div className={styles.summaryMeta}>
                                    {semesterCount} Semester{semesterCount > 1 ? 's' : ''} · {totalSubjects} Subjects
                                </div>
                                <div className={styles.semesterChips}>
                                    {sortedSemesters.map(([sem]) => (
                                        <div key={sem} className={styles.semesterChip}>
                                            S{sem}: {(sgpas[sem] || 0).toFixed(2)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </section>

                        <section className={`${styles.panel} ${styles.panelPadded}`} aria-labelledby="semester-performance-title">
                            <div id="semester-performance-title" className={styles.sectionLabel}>Semester-Wise Performance</div>
                            <div className={styles.tableWrap}>
                                <table className={`${styles.table} ${styles.compactTable}`}>
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
                        </section>

                        {sortedSemesters.map(([sem, subjects]) => (
                            <section key={sem} className={styles.panel} aria-labelledby={`semester-${sem}-title`}>
                                <div className={styles.semesterHeader}>
                                    <div className={styles.semesterTitleGroup}>
                                        <div>
                                            <div id={`semester-${sem}-title`} className={styles.semesterTitle}>Semester {sem}</div>
                                            <div className={styles.semesterMeta}>{subjects.length} Subjects Listed</div>
                                        </div>
                                        <Badge tone="info">SGPA: {(sgpas[sem] || 0).toFixed(2)}</Badge>
                                    </div>
                                    <Button
                                        variant="secondary"
                                        density="compact"
                                        iconStart="download"
                                        onClick={() => {
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
                                </div>
                                <div className={styles.tableWrap}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th scope="col">Subject Code</th>
                                                <th scope="col">Subject Name</th>
                                                <th scope="col" className={styles.center}>Internal</th>
                                                <th scope="col" className={styles.center}>External</th>
                                                <th scope="col" className={styles.center}>Total</th>
                                                <th scope="col" className={styles.center}>Status</th>
                                                <th scope="col">Announced / Updated on</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {subjects.map((m, idx) => (
                                                <tr key={m.id || idx}>
                                                    <th scope="row" className={styles.code}>{m.subject_code || m.code || '—'}</th>
                                                    <td><div className={styles.subjectName}>{m.subject_name || m.name || 'Unknown'}</div></td>
                                                    <td className={styles.center}>{m.cie_marks ?? m.internal ?? '—'}</td>
                                                    <td className={styles.center}>{m.see_marks ?? m.external ?? '—'}</td>
                                                    <td className={styles.center}><strong>{m.total_marks ?? m.total ?? '—'}</strong></td>
                                                    <td className={styles.center}><GradeBadge grade={m.grade} /></td>
                                                    <td className={styles.mutedCell}>{m.announced_date || m.exam_date || 'N/A'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className={styles.mobileSubjectList}>
                                    {subjects.map((m, idx) => (
                                        <div key={m.id || idx} className={styles.mobileSubjectCard}>
                                            <div className={styles.mobileSubjectHeader}>
                                                <div className={styles.mobileSubjectTitleGroup}>
                                                    <span className={styles.code}>{m.subject_code || m.code || '—'}</span>
                                                    <span className={styles.subjectName}>{m.subject_name || m.name || 'Unknown'}</span>
                                                </div>
                                                <GradeBadge grade={m.grade} />
                                            </div>
                                            <div className={styles.mobileSubjectStats}>
                                                <div className={styles.mobileStatItem}>
                                                    <span className={styles.statMiniLabel}>CIE:</span>
                                                    <span>{m.cie_marks ?? m.internal ?? '—'}</span>
                                                </div>
                                                <div className={styles.mobileStatItem}>
                                                    <span className={styles.statMiniLabel}>SEE:</span>
                                                    <span>{m.see_marks ?? m.external ?? '—'}</span>
                                                </div>
                                                <div className={styles.mobileStatItem}>
                                                    <span className={styles.statMiniLabel}>Total:</span>
                                                    <strong>{m.total_marks ?? m.total ?? '—'}</strong>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
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
                            </section>
                        ))}

                        {failedSubjects > 0 && (
                            <section className={styles.alertPanel} aria-labelledby="backlog-analysis-title">
                                <div className={styles.alertHeader}>
                                    <div className={styles.alertIcon} aria-hidden="true">
                                        <span className="material-icons-round">warning</span>
                                    </div>
                                    <div>
                                        <div id="backlog-analysis-title" className={styles.alertTitle}>
                                            Backlog Analysis — {failedSubjects} Subject{failedSubjects > 1 ? 's' : ''} Pending
                                        </div>
                                        <div className={styles.alertText}>
                                            These subjects require re-examination to clear your academic record.
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.backlogList}>
                                    {Object.entries(marks).flatMap(([sem, subjects]) =>
                                        subjects
                                            .filter(m => { const g = unifyGrade(m.grade); return g === 'F' || g === 'A'; })
                                            .map((m, idx) => (
                                                <div key={`backlog-${sem}-${idx}`} className={styles.backlogItem}>
                                                    <Badge tone="danger" size="sm">SEM {sem}</Badge>
                                                    <div className={styles.backlogSubject}>
                                                        <div className={styles.subjectName}>{m.subject_name || m.name || 'Unknown'}</div>
                                                        <div className={styles.code}>{m.subject_code || m.code || ''}</div>
                                                    </div>
                                                    <GradeBadge grade={m.grade} />
                                                </div>
                                            ))
                                    )}
                                </div>
                            </section>
                        )}
                    </>
                ) : (
                    <EmptyState
                        variant="panel"
                        icon="school"
                        title="No Academic Records Yet"
                        description="Upload your VTU result PDF above or enter marks manually to get started."
                        actions={(
                            <div className={styles.actions}>
                                <Button iconStart="upload_file" onClick={() => fileInputRef.current?.click()}>
                                    Upload Result PDF
                                </Button>
                                <Button variant="secondary" iconStart="edit_note" onClick={() => router.push('/calculator')}>
                                    Manual Entry
                                </Button>
                            </div>
                        )}
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
            setStudent(profile);

            const studentMarks = [];
            const resultMarks = data?.recentResults || [];

            // 2. Normalize and Combine
            const pool = [];

            const formatExamAlias = text => {
                if (!text || text === 'Manual Entry' || text === 'Scraped Record') return text;
                return text.replace(/^DJ/i, 'Dec/Jan ').replace(/^JJ/i, 'June/July ')
                    .replace(/cbcs/i, ' ')
                    .replace(/MakeUp/i, 'Makeup ')
                    .replace(/RV|Reval/i, ' (Revaluation)')
                    .trim();
            };

            const normalize = (m, source) => ({
                id: m.id,
                subject_code: (m.subject_code || m.code || '').trim().toUpperCase(),
                subject_name: (m.subject_name || m.name || '').trim(),
                cie_marks: m.cie_marks ?? m.internal ?? 0,
                see_marks: m.see_marks ?? m.external ?? 0,
                total_marks: m.total_marks ?? m.total ?? 0,
                grade: (m.grade || '').trim().toUpperCase(),
                credits: Number(m.credits) || 3,
                semester: Number(m.semester) || 1,
                exam_date: m.announced_date || formatExamAlias(m.results?.exam_name || (source === 'manual' ? 'Manual Entry' : 'Scraped Record')),
                source
            });

            if (studentMarks) studentMarks.forEach(m => pool.push(normalize(m, 'manual')));
            if (resultMarks) resultMarks.forEach(m => pool.push(normalize(m, 'scraper')));

            // 3. ── BACKLOG & SEMESTER RECONCILIATION ──
            // We want to group by subject_code and pick the BEST result.
            // Also, we MUST ensure the subject is mapped to its ORIGINAL semester using its code.
            const bestByCode = {};
            const historyByCode = {};

            pool.forEach(m => {
                const code = m.subject_code;
                if (!code) return;

                let targetSem = Number(m.semester) || 1;
                if (!targetSem || targetSem < 1 || targetSem > 8) {
                    const semMatch = code.match(/^[0-9A-Z]{2,6}?(\d)\d{2}[A-Z]?$/i) || code.match(/^[A-Z]+(\d)\d/i);
                    if (semMatch && semMatch[1]) {
                        targetSem = parseInt(semMatch[1], 10);
                    }
                }
                m.semester = targetSem;

                const key = code; // Unique by Code (VTU codes are unique across semesters usually)
                const existing = bestByCode[key];

                if (!existing) {
                    bestByCode[key] = m;
                    historyByCode[key] = [];
                } else {
                    const existingRank = getGradeRank(existing.grade);
                    const newRank = getGradeRank(m.grade);

                    // Logic: Keep better grade.
                    if (newRank > existingRank) {
                        historyByCode[key].push(bestByCode[key]);
                        bestByCode[key] = m;
                    } else if (newRank === existingRank && m.total_marks > existing.total_marks) {
                        historyByCode[key].push(bestByCode[key]);
                        bestByCode[key] = m;
                    } else {
                        historyByCode[key].push(m);
                    }
                }
            });

            const deduplicated = Object.values(bestByCode);
            const allHistory = Object.values(historyByCode).flat();

            // 4. Enrich Credits from Master Registry
            try {
                const codes = [...new Set(deduplicated.map(m => m.subject_code))];
                if (codes.length > 0) {
                    const { data: registry } = await supabase
                        .from('subject_master_registry')
                        .select('subject_code, credits')
                        .in('subject_code', codes);

                    if (registry?.length) {
                        const creditMap = {};
                        registry.forEach(r => { creditMap[r.subject_code] = r.credits; });
                        deduplicated.forEach(m => {
                            if (creditMap[m.subject_code]) m.credits = creditMap[m.subject_code];
                        });
                    }
                }
            } catch (e) { }

            // 5. Group by Semester
            const grouped = {};
            const groupedHistory = {};
            deduplicated.forEach(m => {
                const s = m.semester;
                if (!grouped[s]) { grouped[s] = []; groupedHistory[s] = []; }
                grouped[s].push(m);
            });
            allHistory.forEach(m => {
                const s = m.semester;
                if (!groupedHistory[s]) groupedHistory[s] = [];
                groupedHistory[s].push(m);
            });

            // VTU Native Sorter: Parse the deepest num block to arrange subjects strictly by curriculum order
            Object.keys(grouped).forEach(s => {
                grouped[s].sort((a, b) => {
                    const getNum = code => {
                        const m = (code || '').match(/\d+/g);
                        return m ? parseInt(m[m.length - 1], 10) : 0;
                    };
                    return getNum(a.subject_code) - getNum(b.subject_code);
                });
            });
            setMarks(grouped);
            // Attach history securely to Window or State if needed, but we can just use groupedHistory
            setStudent(prev => ({ ...prev, history: groupedHistory }));

            // Calculate SGPAs per semester and overall CGPA
            const semSGPAs = {};
            const stats = {};
            let totalWeighted = 0, totalCr = 0;
            Object.entries(grouped)
                .sort(([a], [b]) => Number(a) - Number(b))
                .forEach(([sem, subjects]) => {
                    const res = calcSGPA(subjects);
                    semSGPAs[sem] = res.sgpa;
                    stats[sem] = res;
                    totalWeighted += res.sgpa * res.totalCredits;
                    totalCr += res.totalCredits;
                });
            setSgpas(semSGPAs);
            setSemStats(stats);

            const calculatedCGPA = totalCr > 0 ? totalWeighted / totalCr : 0;
            setCgpa(calculatedCGPA);
            setPercentage(Math.max(0, (calculatedCGPA - 0.75) * 10));

        } catch (err) {
            console.error('Error loading dashboard data:', err);
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

    const sortedSemesters = Object.entries(marks).sort(([a], [b]) => Number(a) - Number(b));
    const semesterCount = sortedSemesters.length;
    const totalSubjects = Object.values(marks).flat().length;
    const backlogs = Object.values(marks).flat().filter(m => { const g = unifyGrade(m.grade); return g === 'F' || g === 'A'; });
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
