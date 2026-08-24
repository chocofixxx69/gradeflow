'use client';

import { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../../../lib/api/client';
import { recordFacultyAction } from '../../../lib/api/faculty-action';
import AuthGuard from '../../../components/AuthGuard';
import { getGradePoint, getGradeRank, unifyGrade, getGradeDetails, getGradeBadgeTone } from '../../../lib/vtuGrades';
import { getOfficialCredit } from '../../../lib/vtu-curriculum-catalog';
import { calculateVTUAttempts } from '../../../lib/academic-rules';
import { Badge, Button, Divider, EmptyState, IconButton, Inline, LoadingState, ResponsiveGrid, SearchInput } from '../../../components/ui';
import styles from './FacultyDashboard.module.css';

function FacultyDashboardView({
    backlogs = [],
    backlogDialogRef,
    backlogTriggerRef,
    cgpa = 0,
    closeBacklogModal,
    deleteStudent,
    failCount = 0,
    fetchFromVTU,
    handlePDF,
    loading = false,
    lookupStudent,
    marks = {},
    message = '',
    pdfLoading = false,
    scraping = false,
    scrapeProgress = '',
    semStats = {},
    setShowBacklogModal,
    setUsn,
    sgpas = {},
    showBacklogModal = false,
    sortedSemesters = [],
    stopScraping,
    student,
    totalSubjects = 0,
    usn = '',
}) {
    const percentage = Math.max(0, (cgpa - 0.75) * 10);
    const messageTone = (() => {
        const normalized = String(message || '').toLowerCase();
        if (!normalized) return 'info';
        if (normalized.includes('found') || normalized.includes('success') || normalized.includes('present in database') || normalized.includes('scanned successfully')) return 'success';
        if (normalized.includes('warning') || normalized.includes('timed out')) return 'warning';
        if (normalized.includes('error') || normalized.includes('failed') || normalized.includes('network') || normalized.includes('unable')) return 'error';
        return 'info';
    })();

    const getBacklogSemester = (mark) => mark.semester || (
        Object.entries(marks).find(([, subjects]) => subjects.some((subject) => (subject.subject_code || subject.code) === (mark.subject_code || mark.code))) || ['?', []]
    )[0];

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

    const AttemptBadge = ({ attempts = 1, grade }) => {
        const unified = unifyGrade(grade);
        const isFail = unified === 'F' || unified === 'A' || unified === 'FAIL' || unified === 'ABSENT' || (grade || '').toUpperCase() === 'F' || (grade || '').toUpperCase() === 'A';

        if (attempts <= 1) {
            return (
                <Badge
                    tone="info"
                    size="sm"
                    style={{
                        fontWeight: 700,
                        fontSize: '11px',
                        whiteSpace: 'nowrap'
                    }}
                >
                    1st Attempt
                </Badge>
            );
        }

        const ordinal = attempts === 2 ? '2nd' : attempts === 3 ? '3rd' : `${attempts}th`;

        if (isFail) {
            return (
                <Badge
                    tone="danger"
                    size="sm"
                    style={{
                        fontWeight: 800,
                        fontSize: '11px',
                        whiteSpace: 'nowrap'
                    }}
                >
                    {ordinal} Attempt · Backlog
                </Badge>
            );
        }

        return (
            <Badge
                tone="warning"
                size="sm"
                style={{
                    fontWeight: 800,
                    fontSize: '11px',
                    whiteSpace: 'nowrap'
                }}
            >
                {ordinal} Attempt · Cleared
            </Badge>
        );
    };

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
                <section className={styles.section} aria-labelledby="faculty-lookup-title">
                <div className={styles.sectionHeader}>
                    <div>
                        <div className={styles.eyebrow}>Faculty Command Center</div>
                        <h1 id="faculty-lookup-title" className={styles.title}>Student Lookup</h1>
                        <p className={styles.subtitle}>Search for any student by USN to view or fetch their official records.</p>
                    </div>
                    {scraping && <LoadingState density="compact" label="Fetching VTU records" />}
                </div>

                <Inline className={styles.lookupRow} stackMobile>
                    <SearchInput
                        label="Student USN"
                        hideLabel
                        placeholder="Enter Student USN"
                        value={usn}
                        onChange={(event) => setUsn?.(event.target.value.toUpperCase())}
                        onKeyDown={(event) => event.key === 'Enter' && lookupStudent?.(usn)}
                        onClear={() => setUsn?.('')}
                    />
                    <Button iconStart="search" onClick={() => lookupStudent?.(usn)} loading={loading}>
                        {loading ? 'Searching...' : 'Lookup'}
                    </Button>
                    <Button
                        variant="secondary"
                        iconStart={scraping ? 'cancel' : 'cloud_download'}
                        onClick={() => scraping ? stopScraping?.() : fetchFromVTU?.()}
                        disabled={!usn && !scraping}
                    >
                        {scraping ? 'Cancel Scraping' : 'Fetch VTU'}
                    </Button>
                </Inline>

                {scrapeProgress && (
                    <div className={`${styles.notice} ${styles.noticeInfo}`}>
                        <LoadingState density="compact" label={scrapeProgress} />
                    </div>
                )}
                {message && (
                    <div className={`${styles.notice} ${styles[`notice${messageTone.charAt(0).toUpperCase()}${messageTone.slice(1)}`]}`}>
                        {message}
                    </div>
                )}
            </section>

            {student ? (
                <>
                    <section className={styles.section} aria-labelledby="faculty-profile-title">
                        <div className={styles.profileHeader}>
                            <div className={styles.avatar} aria-hidden="true">
                                {(student.name?.[0] || student.usn?.[0] || '?').toUpperCase()}
                            </div>
                            <div>
                                <h2 id="faculty-profile-title" className={styles.sectionTitle}>{student.name || student.usn}</h2>
                                <p className={styles.meta}>{student.usn} · {student.branch || 'Unassigned'}</p>
                            </div>
                            <div className={styles.profileActions}>
                                <Button
                                    variant="secondary"
                                    density="compact"
                                    iconStart="picture_as_pdf"
                                    onClick={handlePDF}
                                    disabled={pdfLoading || totalSubjects === 0}
                                    loading={pdfLoading}
                                >
                                    {pdfLoading ? 'Generating...' : 'PDF Transcript'}
                                </Button>
                                <Button
                                    variant="danger"
                                    density="compact"
                                    iconStart="delete"
                                    onClick={deleteStudent}
                                    disabled={loading || scraping}
                                >
                                    Delete
                                </Button>
                            </div>
                        </div>

                        <ResponsiveGrid size="sm" className={styles.statsGrid} aria-label="Student Academic Metrics">
                            <div className={styles.statCard}>
                                <div className={styles.statLabel}>Current CGPA</div>
                                <div className={styles.statValue}>{cgpa > 0 ? cgpa.toFixed(2) : '—'}</div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statLabel}>Semesters Tracked</div>
                                <div className={styles.statValue}>{sortedSemesters.length}</div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statLabel}>Subjects Logged</div>
                                <div className={styles.statValue}>{totalSubjects}</div>
                            </div>
                            <button
                                ref={backlogTriggerRef}
                                className={styles.statCardButton}
                                type="button"
                                onClick={() => failCount > 0 && setShowBacklogModal(true)}
                                disabled={failCount === 0}
                                aria-haspopup="dialog"
                                aria-expanded={showBacklogModal}
                                aria-controls="faculty-backlog-dialog"
                            >
                                <div className={styles.statLabel}>Active Backlogs</div>
                                <div className={`${styles.statValue} ${failCount > 0 ? styles.dangerText : styles.successText}`}>
                                    {failCount}
                                    {failCount > 0 && <span className="material-icons-round" aria-hidden="true">arrow_forward</span>}
                                </div>
                            </button>
                        </ResponsiveGrid>
                    </section>

                    <section className={styles.section} aria-labelledby="faculty-records-title">
                        <div className={styles.sectionHeader}>
                            <div>
                                <h2 id="faculty-records-title" className={styles.sectionTitle}>Semester Records</h2>
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
                                    <Badge key={sem} tone="info" size="sm">S{sem}: {(sgpas[sem] || 0).toFixed(2)}</Badge>
                                ))}
                            </div>
                        </div>

                        {sortedSemesters.length > 0 ? (
                            <>
                                <div className={styles.tableWrap}>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th scope="col">Semester</th>
                                                <th scope="col" className={styles.center}>SGPA</th>
                                                <th scope="col" className={styles.center}>Credits Earned</th>
                                                <th scope="col" className={styles.center}>Grade Points</th>
                                                <th scope="col" className={styles.center}>Backlogs</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {sortedSemesters.map(([sem]) => {
                                                const stat = semStats[sem] || { sgpa: 0, earnedCredits: 0, gradePoints: 0, backlogs: 0 };
                                                return (
                                                    <tr key={sem}>
                                                        <th scope="row"><strong>Semester {sem}</strong></th>
                                                        <td className={styles.center}>{stat.sgpa.toFixed(2)}</td>
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
                                                            {(() => {
                                                                const failedCount = subjects.filter(m => {
                                                                    const g = unifyGrade(m.grade);
                                                                    const ext = Number(m.see_marks ?? m.external) || 0;
                                                                    const tot = Number(m.total_marks ?? m.total) || 0;
                                                                    const resStr = (m.result || '').trim().toUpperCase();
                                                                    return m.is_backlog === true || g === 'F' || g === 'A' || g === 'FAIL' || g === 'ABSENT' || (ext > 0 && ext < 18) || (tot > 0 && tot < 40) || resStr.includes('F');
                                                                }).length;
                                                                const clearedCount = subjects.length - failedCount;

                                                                return (
                                                                    <p className={styles.meta}>
                                                                        {subjects.length} Subjects · {failedCount === 0 ? (
                                                                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>All Cleared ✓</span>
                                                                        ) : (
                                                                            <>
                                                                                <span style={{ color: 'var(--success)', fontWeight: 600 }}>{clearedCount} Cleared</span>
                                                                                {' · '}
                                                                                <span style={{ color: 'var(--danger)', fontWeight: 600 }}>{failedCount} Backlog{failedCount > 1 ? 's' : ''}</span>
                                                                            </>
                                                                        )}
                                                                    </p>
                                                                );
                                                            })()}
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
                                                                import('../../../lib/generatePDF').then(({ generateResultPDF }) => {
                                                                    generateResultPDF({
                                                                        studentName: student.name || student.usn,
                                                                        usn: student.usn,
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
                                                                        <th scope="col" className={styles.center}>Attempts</th>
                                                                        <th scope="col">Announced / Updated</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {subjects.map((mark, index) => {
                                                                        const scheme = student?.scheme || '2022';
                                                                        const branch = student?.branch || null;
                                                                        const details = getGradeDetails(mark, scheme);
                                                                        const offCr = getOfficialCredit(mark.subject_code || mark.code, scheme, branch, Number(sem));
                                                                        const displayCr = offCr !== null ? offCr : (Number(mark.credits) || 0);
                                                                        return (
                                                                            <tr key={mark.id || `${sem}-${index}`}>
                                                                                <th scope="row" className={styles.code}>{mark.subject_code || mark.code || '—'}</th>
                                                                                <td>{mark.subject_name || mark.name}</td>
                                                                                <td className={styles.center}><strong>{displayCr}</strong></td>
                                                                                <td className={styles.center}>{mark.cie_marks ?? mark.internal ?? '—'}</td>
                                                                                <td className={styles.center}>{mark.see_marks ?? mark.external ?? '—'}</td>
                                                                                <td className={styles.center}><strong>{mark.total_marks ?? mark.total ?? '—'}</strong></td>
                                                                                <td className={styles.center}><GradeBadge grade={details.grade} /></td>
                                                                                <td className={styles.center}><strong>{details.gpFormatted}</strong></td>
                                                                                <td className={styles.center}>
                                                                                    <Badge tone={details.isPass ? 'success' : 'danger'} size="sm">
                                                                                        {details.isPass ? 'Pass' : 'Fail'}
                                                                                    </Badge>
                                                                                </td>
                                                                                <td className={styles.center}>
                                                                                    <AttemptBadge attempts={mark.attempts || 1} grade={mark.grade} />
                                                                                </td>
                                                                                <td className={styles.nowrap}>{mark.announced_date || mark.exam_date || 'Regular'}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        <div className={styles.mobileSubjectList}>
                                                            {subjects.map((mark, index) => {
                                                                const scheme = student?.scheme || '2022';
                                                                const branch = student?.branch || null;
                                                                const details = getGradeDetails(mark, scheme);
                                                                const offCr = getOfficialCredit(mark.subject_code || mark.code, scheme, branch, Number(sem));
                                                                const displayCr = offCr !== null ? offCr : (Number(mark.credits) || 0);
                                                                return (
                                                                    <div key={mark.id || `${sem}-${index}`} className={styles.mobileSubjectCard}>
                                                                        <div className={styles.mobileSubjectHeader}>
                                                                            <div className={styles.mobileSubjectTitleGroup}>
                                                                                <span className={styles.code}>{mark.subject_code || mark.code || '—'}</span>
                                                                                <span className={styles.subjectName}>{mark.subject_name || mark.name}</span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                                <GradeBadge grade={details.grade} />
                                                                                <AttemptBadge attempts={mark.attempts || 1} grade={mark.grade} />
                                                                            </div>
                                                                        </div>
                                                                        <div className={styles.mobileSubjectStats}>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>Credits:</span>
                                                                                <span>{displayCr}</span>
                                                                            </div>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>CIE:</span>
                                                                                <span>{mark.cie_marks ?? mark.internal ?? '—'}</span>
                                                                            </div>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>SEE:</span>
                                                                                <span>{mark.see_marks ?? mark.external ?? '—'}</span>
                                                                            </div>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>Total:</span>
                                                                                <strong>{mark.total_marks ?? mark.total ?? '—'}</strong>
                                                                            </div>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>GP:</span>
                                                                                <strong>{details.gpFormatted}</strong>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ fontSize: '11px', color: 'var(--tx-muted)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                                                                            <span>Updated: {mark.announced_date || mark.exam_date || 'Regular'}</span>
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
                                                                                <div className={styles.historyDate}>{hm.announced_date || hm.exam_date}</div>
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
                            </>
                        ) : (
                            <EmptyState
                                icon="school"
                                title="No Records Loaded"
                                description="Search for a student or fetch VTU records to view semester data."
                            />
                        )}
                    </section>

                    <section className={styles.dangerZone} aria-labelledby="faculty-danger-title">
                        <div>
                            <h2 id="faculty-danger-title" className={styles.sectionTitle}>Danger Zone</h2>
                            <p className={styles.meta}>Permanently delete all data for this student.</p>
                        </div>
                        <Button variant="danger" iconStart="delete" onClick={deleteStudent} loading={loading}>
                            Wipe Data
                        </Button>
                    </section>
                </>
            ) : (
                <EmptyState
                    icon="manage_search"
                    title="No Student Selected"
                    description="Enter a USN above to begin reviewing student records."
                />
            )}
            </div>

            {showBacklogModal && (
                <div className={styles.modalOverlay} onClick={closeBacklogModal}>
                    <section id="faculty-backlog-dialog" ref={backlogDialogRef} className={`${styles.modal} gf-fade-up`} role="dialog" aria-modal="true" aria-labelledby="faculty-backlog-title" aria-describedby="faculty-backlog-description" onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div>
                                <h2 id="faculty-backlog-title" className={styles.modalTitle}>Backlog Subjects</h2>
                                <p id="faculty-backlog-description" className={styles.modalDescription}>Subjects currently marked as failing or absent.</p>
                            </div>
                            <IconButton icon="close" variant="ghost" aria-label="Close backlog dialog" onClick={closeBacklogModal} />
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.modalList}>
                                {backlogs.map((mark, index) => (
                                    <div key={index} className={styles.modalItem}>
                                        <div>
                                            <div className={styles.subjectName}>{mark.subject_name || mark.name || mark.subject_code}</div>
                                            <div className={styles.meta}>{mark.subject_code || mark.code} · Sem {getBacklogSemester(mark)}</div>
                                        </div>
                                        <Badge tone="danger">{unifyGrade(mark.grade) === 'A' ? 'Absent' : 'FAIL'}</Badge>
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

function FacultyDashboardContent() {
    const [faculty, setFaculty] = useState(null);
    const [usn, setUsn] = useState('');
    const [loading, setLoading] = useState(false);
    const [student, setStudent] = useState(null);
    const [marks, setMarks] = useState({});
    const [sgpas, setSgpas] = useState({});
    const [semStats, setSemStats] = useState({});
    const [cgpa, setCgpa] = useState(0);
    const [message, setMessage] = useState('');
    const [pdfLoading, setPdfLoading] = useState(false);
    const [scraping, setScraping] = useState(false);
    const [scrapeProgress, setScrapeProgress] = useState('');
    const [showBacklogModal, setShowBacklogModal] = useState(false);
    const pollRef = useRef(null);
    const backlogDialogRef = useRef(null);
    const backlogTriggerRef = useRef(null);

    const stopScraping = (silent = false) => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
        setScraping(false);
        setScrapeProgress('');
        if (!silent) setMessage('Scraping scan halted.');
    };

    const calcSGPA = (subjects, semNumber = null) => {
        const excludeGrades = ['PP', 'NP', 'W', 'DX', 'AU', 'X', 'NE'];
        const scheme = student?.scheme || '2022';
        const branch = student?.branch || null;

        // Group by code to handle multiple attempts for same subject
        const subjectsPool = {};
        subjects.forEach(m => {
            const code = (m.subject_code || m.code || '').trim().toUpperCase();
            if (!subjectsPool[code]) subjectsPool[code] = m;
        });

        const poolItems = Object.values(subjectsPool);
        const validSubs = poolItems.filter(m => !excludeGrades.includes((m.grade || '').trim().toUpperCase()));

        let totalCredits = 0;
        let earnedCredits = 0;
        let totalCreditPoints = 0;
        let backlogs = 0;

        validSubs.forEach(m => {
            const code = (m.subject_code || m.code || '').trim().toUpperCase();
            const details = getGradeDetails(m, scheme);
            const offCr = getOfficialCredit(code, scheme, branch, semNumber || m.semester);
            const credits = offCr !== null ? offCr : (Number(m.credits) || 0);

            if (credits === 0) return; // Non-credit audit course (PE, NSS, Yoga, IKS)

            const gp = details.gp;
            const isFail = details.isFail || m.is_backlog === true;

            totalCredits += credits;
            totalCreditPoints += (gp * credits);

            if (!isFail && gp > 0) {
                earnedCredits += credits;
            } else {
                backlogs++;
            }
        });

        const sgpa = totalCredits > 0 ? Number((totalCreditPoints / totalCredits).toFixed(2)) : 0;

        return {
            sgpa,
            totalCredits,
            earnedCredits: backlogs === 0 && totalCredits > 0 ? totalCredits : earnedCredits,
            backlogs,
            gradePoints: totalCreditPoints
        };
    };

    const closeBacklogModal = () => {
        setShowBacklogModal(false);
        window.requestAnimationFrame(() => backlogTriggerRef.current?.focus({ preventScroll: true }));
    };

    useEffect(() => {
        const session = localStorage.getItem('faculty_session');
        if (session) {
            setFaculty(JSON.parse(session));
        }
    }, []);
    useEffect(() => {
        if (!showBacklogModal) return;

        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

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
            getFocusableItems()[0]?.focus({ preventScroll: true });
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
                lastItem.focus({ preventScroll: true });
            } else if (!event.shiftKey && document.activeElement === lastItem) {
                event.preventDefault();
                firstItem.focus({ preventScroll: true });
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = originalOverflow;
        };
    }, [showBacklogModal]);

    const lookupStudent = async (targetUsn, silent = false) => {
        if (!targetUsn || targetUsn.length < 5) {
            if (!silent) setMessage('Please enter a valid USN.');
            return;
        }

        // If it's a new USN search, clear previous student data immediately
        const cleanUSN = targetUsn.toUpperCase().trim();
        if (student?.usn !== cleanUSN) {
            setStudent(null);
            setMarks({});
            setSgpas({});
            setSemStats({});
            setCgpa(0);
        }

        if (!silent) setLoading(true);
        setMessage('');

        try {
            const resData = await apiRequest('/api/faculty/dashboard', { query: { search_usn: cleanUSN } });
            const profile = resData?.profile || { usn: cleanUSN, name: cleanUSN };
            setStudent(profile);

            const studentMarks = resData?.studentMarks || [];
            const resultMarks = resData?.recentResults || [];

            const parseExamDate = (d) => {
                if (!d || d === 'Manual Entry' || d === 'Scraped Record' || d === 'N/A') return 0;
                const parsed = Date.parse(d);
                if (!isNaN(parsed)) return parsed;
                const dmy = String(d).match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
                if (dmy) return new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}`).getTime() || 0;
                const yr = String(d).match(/\b(20\d{2})\b/);
                if (yr) return new Date(`${yr[1]}-01-01`).getTime() || 0;
                return 0;
            };

            const formatExamAlias = text => {
                if (!text || text === 'Manual Entry' || text === 'Scraped Record') return text;
                return text.replace(/^DJ/i, 'Dec/Jan ').replace(/^JJ/i, 'June/July ')
                    .replace(/cbcs|cbcs/i, ' ')
                    .replace(/MakeUp/i, 'Makeup ')
                    .replace(/RV|Reval/i, ' (Revaluation)')
                    .trim();
            };

            const strictResultMarks = (resultMarks || []).filter(m => {
                const mUsn = (m.usn || '').trim().toUpperCase();
                return mUsn === cleanUSN;
            });

            const allMarksRaw = [
                ...(studentMarks || []).map(m => ({
                    ...m,
                    source: 'manual',
                    announced_date: m.announced_date || m.exam_date || null,
                    exam_date: m.announced_date || m.exam_date || 'Manual Entry',
                    raw_exam: m.exam_name || 'Manual Entry'
                })),
                ...(strictResultMarks || []).map(m => {
                    const rawDate = m.announced_date || m.results?.announced_date || null;
                    const examAlias = formatExamAlias(m.results?.exam_name || 'Scraped Record');
                    const dateVal = rawDate || (m.exam_date && m.exam_date !== 'Scraped Record' && m.exam_date !== 'Manual Entry' ? m.exam_date : null);
                    return {
                        ...m,
                        source: 'scraped',
                        cie_marks: m.internal ?? m.cie_marks ?? 0,
                        see_marks: m.external ?? m.see_marks ?? 0,
                        total_marks: m.total ?? m.total_marks ?? 0,
                        announced_date: dateVal,
                        exam_date: dateVal || examAlias,
                        raw_exam: m.results?.exam_name || m.exam_name || examAlias
                    };
                })
            ];

            const attemptsByCode = {};

            allMarksRaw.forEach(m => {
                const code = (m.subject_code || m.code || '').trim().toUpperCase();
                if (!code) return;

                let sem = Number(m.semester) || 1;
                const match = code.match(/^[0-9]{2,3}[A-Z]{2,3}(\d)\d/i) || code.match(/^[A-Z]{2,3}(\d)\d/i);
                if (match && match[1]) sem = parseInt(match[1], 10);
                m.semester = sem;

                if (!attemptsByCode[code]) attemptsByCode[code] = [];
                attemptsByCode[code].push(m);
            });

            const bestByCode = {};
            const historyByCode = {};

            const allKnownSems = allMarksRaw.map(m => m.semester).filter(Boolean);
            const maxStudentSem = allKnownSems.length > 0 ? Math.max(...allKnownSems) : 1;

            Object.entries(attemptsByCode).forEach(([code, attempts]) => {
                // Find latest announced date across all attempts for this subject
                const allDates = attempts
                    .map(a => a.announced_date || a.exam_date)
                    .filter(d => d && d !== 'N/A' && d !== 'Manual Entry' && d !== 'Scraped Record');

                allDates.sort((a, b) => parseExamDate(b) - parseExamDate(a));
                const latestAnnouncedDate = allDates[0] || attempts[0]?.announced_date || attempts[0]?.exam_date || 'N/A';

                // Find the best attempt (best grade rank, then highest marks, then latest date)
                let best = attempts[0];
                for (let i = 1; i < attempts.length; i++) {
                    const curr = attempts[i];
                    const bestRank = getGradeRank(best.grade);
                    const currRank = getGradeRank(curr.grade);

                    if (currRank > bestRank) {
                        best = curr;
                    } else if (currRank === bestRank) {
                        if ((curr.total_marks || 0) > (best.total_marks || 0)) {
                            best = curr;
                        } else if (parseExamDate(curr.announced_date || curr.exam_date) > parseExamDate(best.announced_date || best.exam_date)) {
                            best = curr;
                        } else if ((curr.id || 0) > (best.id || 0)) {
                            best = curr;
                        }
                    }
                }

                const calculatedAttempts = calculateVTUAttempts(
                    code,
                    best.semester,
                    best.raw_exam || best.exam_date,
                    latestAnnouncedDate,
                    best.grade,
                    maxStudentSem,
                    attempts.length
                );

                bestByCode[code] = {
                    ...best,
                    announced_date: latestAnnouncedDate,
                    exam_date: latestAnnouncedDate,
                    attempts: calculatedAttempts,
                };

                const priorAttempts = attempts.filter(a => a !== best);
                if (priorAttempts.length > 0) {
                    historyByCode[code] = priorAttempts.sort((a, b) => parseExamDate(b.announced_date || b.exam_date) - parseExamDate(a.announced_date || a.exam_date));
                }
            });

            // Dynamic Credit Lookup: Prioritize subject_catalog (faculty-managed) then master registry
            try {
                const codes = [...new Set(Object.values(bestByCode).map(m => m.subject_code || m.code))];
                if (codes.length > 0) {
                    const catRes = await apiRequest('/api/system/meta').catch(() => null);
                    const masterRes = { data: [] };

                    const creditMap = {};
                    // Master registry as base
                    masterRes.data?.forEach(r => { creditMap[r.subject_code] = r.credits; });
                    // Subject catalog overrides (more specific)
                    catRes.data?.forEach(r => { creditMap[r.subject_code] = r.credits; });

                    Object.values(bestByCode).forEach(m => {
                        const code = (m.subject_code || m.code);
                        if (creditMap[code]) m.credits = creditMap[code];
                    });
                }
            } catch (e) {
                console.error('Credit lookup error:', e);
            }

            const groupedBySem = {};
            const groupedHistory = {};

            Object.values(bestByCode).forEach(m => {
                const sem = m.semester;
                if (!groupedBySem[sem]) groupedBySem[sem] = [];
                groupedBySem[sem].push(m);
            });

            Object.entries(historyByCode).forEach(([code, historyItems]) => {
                historyItems.forEach(hm => {
                    const sem = hm.semester || 1;
                    if (!groupedHistory[sem]) groupedHistory[sem] = [];
                    groupedHistory[sem].push(hm);
                });
            });

            // VTU Native Sorter: Parse deepest num block for chronological curriculum sequencing
            Object.keys(groupedBySem).forEach(sem => {
                groupedBySem[sem].sort((a, b) => {
                    const getNum = c => {
                        const m = (c || '').match(/\d+/g);
                        return m ? parseInt(m[m.length - 1], 10) : 0;
                    };
                    return getNum(a.subject_code || a.code) - getNum(b.subject_code || b.code);
                });
            });

            setMarks(groupedBySem);
            setStudent({ ...profile, history: groupedHistory });

            const semSGPAs = {};
            const stats = {};
            let tW = 0, tC = 0;
            Object.entries(groupedBySem).forEach(([sem, subjects]) => {
                const res = calcSGPA(subjects, Number(sem));
                semSGPAs[sem] = res.sgpa;
                stats[sem] = res;
                if (res.totalCredits > 0) {
                    tW += res.sgpa * res.totalCredits;
                    tC += res.totalCredits;
                }
            });

            setSgpas(semSGPAs);
            setSemStats(stats);
            setCgpa(tC > 0 ? Number((tW / tC).toFixed(2)) : 0);

            // Audit Log
            await recordFacultyAction(faculty, 'VIEW_RECORD', cleanUSN);

            if (!silent) {
                const totalSubs = Object.values(groupedBySem).flat().length;
                setMessage(`Found ${profile.name || cleanUSN} - ${totalSubs} subjects processed.`);
            }

        } catch (err) {
            console.error('Lookup error:', err);
            if (!silent) setMessage('Could not fetch student data.');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    const [forceDeep] = useState(false);

    const fetchFromVTU = async () => {
        // PRIORITIZE the input box USN if provided, otherwise fallback to loaded student
        const targetUsn = usn?.trim() || student?.usn;
        if (!targetUsn || targetUsn.length < 5) {
            setMessage('Please enter a valid USN to fetch.');
            return;
        }

        const cleanUSN = targetUsn.toUpperCase().trim();

        // Stop any existing polling before starting a new one
        stopScraping(true);

        setScraping(true);
        setScrapeProgress(`Initializing deep scan for ${cleanUSN}...`);
        setMessage('');

        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usn: cleanUSN,
                    role: 'faculty',
                    force: true,
                    faculty_id: faculty?.id
                }),
            });
            const json = await res.json();

            if (json.status === 'cached' && !forceDeep) {
                setMessage('Results already present in database (Cache Hit).');
                setScraping(false);
                setScrapeProgress('');
                await lookupStudent(cleanUSN);
                return;
            }

            if (json.jobId || json.status === 'queued') {
                const jobId = json.jobId;
                setScrapeProgress(`Job ${jobId?.substring(0, 6)} queued. Scanning VTU portals for ${cleanUSN}...`);

                let attempts = 0;
                pollRef.current = setInterval(async () => {
                    attempts++;

                    // Live UI Update: Fetch data EVEN while scraping to show results as they come in
                    if (attempts % 3 === 0) {
                        lookupStudent(cleanUSN, true); // Suppress full loading state
                    }

                    try {
                        const { data: job, error } = await supabase
                            .from('scraper_jobs')
                            .select('status, error')
                            .eq('id', jobId)
                            .maybeSingle();

                        if (!job) {
                            // Job mysteriously vanished or was wiped manually
                            stopScraping(true);
                            setMessage('Scan job completed or removed.');
                            await lookupStudent(cleanUSN);
                        } else if (job?.status === 'finished') {
                            stopScraping(true);
                            setMessage('All portals scanned successfully!');
                            await lookupStudent(cleanUSN);
                        } else if (job?.status === 'error' || job?.status === 'no_result') {
                            stopScraping(true);
                            setMessage(job?.status === 'error' ? (job.error || 'Scrape failed') : 'Scan complete. No new results found.');
                            await lookupStudent(cleanUSN);
                        } else if (attempts > 180) { // 15 mins max
                            stopScraping(true);
                            setMessage('Scan timed out. Some records might still be processing.');
                            await lookupStudent(cleanUSN);
                        }
                    } catch (e) {
                        // Silent catch inside polling
                    }
                }, 5000);
            } else {
                setMessage(typeof json.error === 'object' ? (json.error.message || 'Unable to process.') : (json.error || 'Unable to process.'));
                setScraping(false);
                setScrapeProgress('');
            }
        } catch (err) {
            setMessage('Network error.');
            setScraping(false);
            setScrapeProgress('');
        }
    };



    const deleteStudent = async () => {
        if (!student) return;
        const confirmDelete = window.confirm(`WARNING: This will permanently delete ALL data for ${student.name || student.usn}. This cannot be undone. Proceed?`);
        if (!confirmDelete) return;

        setLoading(true);
        setMessage('Deleting student data...');
        try {
            const res = await fetch('/api/admin/delete-student', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usn: student.usn }),
            });
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch (e) {
                throw new Error(`Server returned HTML/Invalid JSON (Status: ${res.status}): ` + text.substring(0, 100));
            }

            if (json.success) {
                setMessage(json.message);
                setStudent(null);
                setMarks({});
                setUsn('');
            } else {
                setMessage(`Error: ${json.error}`);
            }
        } catch (err) {
            console.error('Delete fetch error:', err);
            setMessage('Network/Parse Error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePDF = async () => {
        if (!student) return;
        setPdfLoading(true);
        try {
            const { generateResultPDF } = await import('../../../lib/generatePDF');
            generateResultPDF({
                studentName: student.name || student.usn,
                usn: student.usn,
                branch: student.branch || '',
                scheme: student.scheme || '2022',
                semesterMarks: marks,
                cgpa,
            });
        } catch (err) { alert('PDF Error: ' + err.message); console.error(err); } finally { setPdfLoading(false); }
    };

    const totalSubjects = Object.values(marks).flat().length;
    const backlogs = Object.values(marks).flat().filter(m => { const g = unifyGrade(m.grade); return g === 'F' || g === 'A'; });
    const failCount = backlogs.length;
    const sortedSemesters = Object.entries(marks).sort(([a], [b]) => Number(b) - Number(a));


    return (
        <FacultyDashboardView
            backlogs={backlogs}
            backlogDialogRef={backlogDialogRef}
            backlogTriggerRef={backlogTriggerRef}
            cgpa={cgpa}
            closeBacklogModal={closeBacklogModal}
            deleteStudent={deleteStudent}
            failCount={failCount}
            fetchFromVTU={fetchFromVTU}
            handlePDF={handlePDF}
            loading={loading}
            lookupStudent={lookupStudent}
            marks={marks}
            message={message}
            pdfLoading={pdfLoading}
            scraping={scraping}
            scrapeProgress={scrapeProgress}
            semStats={semStats}
            setShowBacklogModal={() => setShowBacklogModal(true)}
            setUsn={setUsn}
            sgpas={sgpas}
            showBacklogModal={showBacklogModal}
            sortedSemesters={sortedSemesters}
            stopScraping={stopScraping}
            student={student}
            totalSubjects={totalSubjects}
            usn={usn}
        />
    );
}
export default function FacultyDashboard() {
    return (
        <AuthGuard role="faculty">
            <FacultyDashboardContent />
        </AuthGuard>
    );
}
