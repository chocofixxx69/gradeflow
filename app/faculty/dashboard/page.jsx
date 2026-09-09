'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { apiRequest, clearApiCache } from '../../../lib/api/client';
import { useLive, LIVE } from '../../../lib/api/live';
import { recordFacultyAction } from '../../../lib/api/faculty-action';
import AuthGuard from '../../../components/AuthGuard';
import { getGradeBadgeTone, unifyGrade, isFailedSubject } from '../../../lib/vtuGrades';
import { Badge, Button, ConfirmDialog, Divider, EmptyState, IconButton, Inline, LoadingState, ResponsiveGrid, SearchInput, SearchableSelect, Select } from '../../../components/ui';
import { createFacultyAssignment, deleteFacultyAssignment } from '../../../lib/api/admin-management';
import styles from './FacultyDashboard.module.css';

// Same canonical branch list used across the app (see app/api/faculty/analytics/meta/route.js).
const BRANCH_OPTIONS = [
    { value: 'CS', label: 'Computer Science & Engineering (CS)' },
    { value: 'AI', label: 'AI & Machine Learning (AI)' },
    { value: 'DS', label: 'CSE (Data Science) (DS)' },
    { value: 'EC', label: 'Electronics & Communication (EC)' },
    { value: 'EE', label: 'Electrical & Electronics (EE)' },
    { value: 'ME', label: 'Mechanical Engineering (ME)' },
    { value: 'CV', label: 'Civil Engineering (CV)' },
    { value: 'RI', label: 'Robotics & AI (RI)' },
];
const SEMESTER_OPTIONS = [
    { value: '', label: 'All Semesters (Browse All)' },
    ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 1), label: `Semester ${i + 1}` })),
];
const SCHEME_OPTIONS = [
    { value: '2022', label: '2022 Scheme' },
    { value: '2025', label: '2025 Scheme' },
];

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
    setMessage,
    setShowBacklogModal,
    setUsn,
    sgpas = {},
    showBacklogModal = false,
    sortedSemesters = [],
    stopScraping,
    student,
    totalSubjects = 0,
    usn = '',
    assignedSubjects = [],
    assignedLoading = false,
    assignedClasses = [],
    availablePortals = [],
    selectedPortalUrl = 'ALL',
    setSelectedPortalUrl,
    customPortalUrl = '',
    setCustomPortalUrl,
    addSubjectOpen = false,
    setAddSubjectOpen,
    addSubjectForm,
    setAddSubjectForm,
    subjectOptions = [],
    subjectOptionsLoading = false,
    addSubjectSaving = false,
    addSubjectError = '',
    handleAddSubject,
    handleRemoveAssignment,
    removingAssignmentId = null,
    loadAssignments = null,
    assignmentSyncMsg = '',
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
        <div className={`${styles.page} gf-page gf-page-default gf-fade-up`}>
            {/* 1. Faculty Command Center: Student Lookup (Top) */}
            <section
                className={`${styles.section} ${styles.sectionLookup}`}
                aria-labelledby="faculty-lookup-title"
            >
                <div className={styles.sectionHeader}>
                    <div>
                        <div className={styles.eyebrow}>Faculty Command Center</div>
                        <h2 id="faculty-lookup-title" className={styles.sectionTitle}>Student Lookup</h2>
                        <p className={styles.subtitle} style={{ display: 'none' }}>Search for any student by USN to view or fetch their official records.</p>
                    </div>
                    {scraping && <LoadingState density="compact" label="Fetching VTU records" />}
                </div>

                <Inline className={styles.lookupRow} stackMobile>
                    <SearchInput
                        label="Student USN"
                        hideLabel
                        placeholder="Enter Student USN (e.g. 2AB23CS043)"
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
                        {scraping ? 'Stop' : selectedPortalUrl === 'ALL' ? 'Fetch VTU' : 'Fetch Portal'}
                    </Button>
                </Inline>

                {/* Targeted Portal Selector for Fast Reval/Backlog Verification */}
                <div className={styles.targetPortalBar}>
                    <div className={styles.targetPortalLabel}>
                        <span className="material-icons-round" style={{ fontSize: '15px', color: 'var(--primary)' }}>tune</span>
                        <span>Target Portal:</span>
                    </div>
                    <select
                        className={styles.targetPortalSelect}
                        value={selectedPortalUrl}
                        onChange={(event) => setSelectedPortalUrl?.(event.target.value)}
                        disabled={scraping}
                        aria-label="Select VTU Portal to Scrape"
                    >
                        <option value="ALL">⚡ All Portals (Deep Full Scan)</option>
                        {availablePortals.length > 0 && (
                            <optgroup label="Active VTU Exam & Reval Portals">
                                {availablePortals.map((p, idx) => (
                                    <option key={p.id || p.url || idx} value={p.url}>
                                        🎯 {p.exam_name || p.url}
                                    </option>
                                ))}
                            </optgroup>
                        )}
                        <option value="CUSTOM">🔗 Custom Result Portal URL...</option>
                    </select>

                    {selectedPortalUrl === 'CUSTOM' && (
                        <input
                            type="url"
                            className={styles.customUrlInput}
                            placeholder="Paste VTU URL (e.g. https://results.vtu.ac.in/RVcbcs24/index.php)"
                            value={customPortalUrl}
                            onChange={(event) => setCustomPortalUrl?.(event.target.value)}
                            disabled={scraping}
                            aria-label="Custom VTU Result URL"
                        />
                    )}

                    {selectedPortalUrl !== 'ALL' && (
                        <span className={styles.fastPill} title="Direct single-portal execution avoids scanning other URLs">
                            🚀 3-5s Fast Mode
                        </span>
                    )}
                </div>

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
                                                            <p className={styles.meta}>{subjects.length} Subjects Listed</p>
                                                        </div>
                                                    </div>
                                                    <div className={styles.semesterActions}>
                                                        <Badge tone="info" size="sm">SGPA: {(sgpas[sem] || 0).toFixed(2)}</Badge>
                                                        <Button
                                                            variant="secondary"
                                                            density="compact"
                                                            iconStart="download"
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                try {
                                                                    const { generateResultPDF } = await import('../../../lib/generatePDF');
                                                                    await generateResultPDF({
                                                                        studentName: student.name || student.usn,
                                                                        usn: student.usn,
                                                                        branch: student.branch || '',
                                                                        scheme: student.scheme || '2022',
                                                                        semesterMarks: { [sem]: subjects },
                                                                        cgpa: sgpas[sem]
                                                                    });
                                                                } catch (err) {
                                                                    setMessage('Error generating semester PDF: ' + err.message);
                                                                }
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
                                                                    {subjects.map((mark, index) => {
                                                                        const isPass = mark.isPassed && !mark.isFailed;
                                                                        return (
                                                                            <tr key={mark.id || `${sem}-${index}`}>
                                                                                <th scope="row" className={styles.code}>{mark.subjectCode || mark.subject_code || mark.code || '—'}</th>
                                                                                <td>{mark.subjectName || mark.subject_name || mark.name}</td>
                                                                                <td className={styles.center}><strong>{mark.credits}</strong></td>
                                                                                <td className={styles.center}>{mark.internalMarks ?? mark.cie_marks ?? mark.internal ?? '—'}</td>
                                                                                <td className={styles.center}>{mark.seeMarks ?? mark.see_marks ?? mark.external ?? '—'}</td>
                                                                                <td className={styles.center}><strong>{mark.totalMarks ?? mark.total_marks ?? mark.total ?? '—'}</strong></td>
                                                                                <td className={styles.center}><GradeBadge grade={mark.grade} /></td>
                                                                                <td className={styles.center}><strong>{mark.gpFormatted || (mark.gradePoint != null ? mark.gradePoint.toFixed(2) : '0.00')}</strong></td>
                                                                                <td className={styles.center}>
                                                                                    <Badge tone={isPass ? 'success' : 'danger'} size="sm">
                                                                                        {isPass ? 'Pass' : 'Fail'}
                                                                                    </Badge>
                                                                                </td>
                                                                                <td className={styles.nowrap}>{mark.announcedDate || mark.announced_date || mark.exam_date || 'Regular'}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        <div className={styles.mobileSubjectList}>
                                                            {subjects.map((mark, index) => {
                                                                const isPass = mark.isPassed && !mark.isFailed;
                                                                return (
                                                                    <div key={mark.id || `${sem}-${index}`} className={styles.mobileSubjectCard}>
                                                                        <div className={styles.mobileSubjectHeader}>
                                                                            <div className={styles.mobileSubjectTitleGroup}>
                                                                                <span className={styles.code}>{mark.subjectCode || mark.subject_code || mark.code || '—'}</span>
                                                                                <span className={styles.subjectName}>{mark.subjectName || mark.subject_name || mark.name}</span>
                                                                            </div>
                                                                            <GradeBadge grade={mark.grade} />
                                                                        </div>
                                                                        <div className={styles.mobileSubjectStats}>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>Credits:</span>
                                                                                <span>{mark.credits}</span>
                                                                            </div>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>CIE:</span>
                                                                                <span>{mark.internalMarks ?? mark.cie_marks ?? mark.internal ?? '—'}</span>
                                                                            </div>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>SEE:</span>
                                                                                <span>{mark.seeMarks ?? mark.see_marks ?? mark.external ?? '—'}</span>
                                                                            </div>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>Total:</span>
                                                                                <strong>{mark.totalMarks ?? mark.total_marks ?? mark.total ?? '—'}</strong>
                                                                            </div>
                                                                            <div className={styles.mobileStatItem}>
                                                                                <span className={styles.statMiniLabel}>GP:</span>
                                                                                <strong>{mark.gpFormatted || (mark.gradePoint != null ? mark.gradePoint.toFixed(2) : '0.00')}</strong>
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
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

            {/* Teaching Load & Assigned Subjects */}
            <section className={`${styles.section} ${styles.sectionTeaching}`} aria-labelledby="faculty-assigned-title">
                <div className={styles.sectionHeader}>
                    <div>
                        <div className={styles.eyebrow}>Teaching Load</div>
                        <h2 id="faculty-assigned-title" className={styles.sectionTitle}>My Assigned Subjects &amp; Classes</h2>
                        <p className={styles.meta}>Your current semester teaching roster and assignments. An admin can assign you a subject, or you can add one yourself below.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        {loadAssignments && (
                            <Button
                                variant="ghost"
                                iconStart="refresh"
                                loading={assignedLoading}
                                onClick={() => loadAssignments(true)}
                                title="Refresh teaching assignments from database"
                            >
                                {assignedLoading ? 'Refreshing...' : 'Refresh'}
                            </Button>
                        )}
                        <Button
                            variant={addSubjectOpen ? 'ghost' : 'secondary'}
                            iconStart={addSubjectOpen ? 'close' : 'add'}
                            onClick={() => {
                                const nextState = !addSubjectOpen;
                                setAddSubjectOpen?.(nextState);
                                if (nextState && assignedClasses.length > 0 && !addSubjectForm?.semester) {
                                    const firstClass = assignedClasses[0];
                                    setAddSubjectForm?.(prev => ({
                                        ...prev,
                                        branch: firstClass.branch || prev.branch || 'CS',
                                        semester: firstClass.semester ? String(firstClass.semester) : prev.semester || '',
                                        scheme: firstClass.batch && Number(firstClass.batch) >= 2025 ? '2025' : (prev.scheme || '2022'),
                                    }));
                                }
                            }}
                        >
                            {addSubjectOpen ? 'Cancel' : 'Add Subject'}
                        </Button>
                    </div>
                </div>

                {assignmentSyncMsg && (
                    <div style={{ padding: '8px 14px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.12)', color: 'var(--green)', border: '1px solid var(--green)', fontSize: '12px', fontWeight: 700, marginBottom: '16px', display: 'inline-flex', alignItems: 'center', gap: '6px' }} className="gf-fade-in">
                        <span className="material-icons-round" style={{ fontSize: '16px' }}>check_circle</span>
                        {assignmentSyncMsg}
                    </div>
                )}

                {addSubjectOpen && (
                    <div style={{ background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
                        {addSubjectError && (
                            <div style={{ marginBottom: '12px', fontSize: '12px', fontWeight: 700, color: 'var(--red, #e02424)' }}>
                                {addSubjectError}
                            </div>
                        )}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', alignItems: 'end' }}>
                            <Select
                                label="Branch"
                                options={BRANCH_OPTIONS}
                                value={addSubjectForm?.branch || 'CS'}
                                onChange={e => setAddSubjectForm?.(prev => ({ ...prev, branch: e.target.value, subject_code: '' }))}
                            />
                            <Select
                                label="Semester"
                                options={SEMESTER_OPTIONS}
                                placeholder="Select"
                                value={addSubjectForm?.semester || ''}
                                onChange={e => setAddSubjectForm?.(prev => ({ ...prev, semester: e.target.value, subject_code: '' }))}
                            />
                            <Select
                                label="Scheme"
                                options={SCHEME_OPTIONS}
                                value={addSubjectForm?.scheme || '2022'}
                                onChange={e => setAddSubjectForm?.(prev => ({ ...prev, scheme: e.target.value, subject_code: '' }))}
                            />
                            <SearchableSelect
                                label="Subject"
                                options={subjectOptions.map(s => ({
                                    value: s.code,
                                    label: `${s.code} — ${s.name}`,
                                    subtitle: `${s.branch} · Sem ${s.semester} · Scheme ${s.scheme} · ${s.credits || 3} credits`,
                                    badge: `Sem ${s.semester}`,
                                    code: s.code,
                                    name: s.name,
                                    semester: s.semester,
                                }))}
                                placeholder={
                                    subjectOptionsLoading
                                        ? 'Loading subjects…'
                                        : subjectOptions.length > 0
                                            ? 'Select or search a subject'
                                            : 'No subjects in catalog'
                                }
                                searchPlaceholder="Search code, name, or sem (e.g. BCS601, Cloud, 6)..."
                                value={addSubjectForm?.subject_code || ''}
                                onChange={e => {
                                    const chosenCode = e.target.value;
                                    const chosenSub = subjectOptions.find(s => s.code === chosenCode);
                                    setAddSubjectForm?.(prev => ({
                                        ...prev,
                                        subject_code: chosenCode,
                                        semester: prev.semester || (chosenSub?.semester ? String(chosenSub.semester) : prev.semester)
                                    }));
                                }}
                                disabled={subjectOptionsLoading || subjectOptions.length === 0}
                            />
                            <Select
                                label="Class"
                                options={assignedClasses.map(c => ({ value: c.id, label: `${c.name} (${c.branch} · S${c.semester} · ${c.section})` }))}
                                placeholder={assignedClasses.length ? 'All my classes' : 'No classes assigned yet'}
                                value={addSubjectForm?.class_id || ''}
                                onChange={e => {
                                    const chosenClassId = e.target.value;
                                    const chosenClass = assignedClasses.find(c => String(c.id) === String(chosenClassId));
                                    setAddSubjectForm?.(prev => ({
                                        ...prev,
                                        class_id: chosenClassId,
                                        ...(chosenClass ? {
                                            branch: chosenClass.branch || prev.branch,
                                            semester: chosenClass.semester ? String(chosenClass.semester) : prev.semester,
                                            ...(chosenClass.batch && Number(chosenClass.batch) >= 2025 ? { scheme: '2025' } : {})
                                        } : {})
                                    }));
                                }}
                                disabled={assignedClasses.length === 0}
                                helperText={assignedClasses.length ? 'Leave blank to teach this subject across all your classes.' : undefined}
                            />
                            <Button
                                variant="primary"
                                onClick={handleAddSubject}
                                loading={addSubjectSaving}
                                disabled={addSubjectSaving || !addSubjectForm?.subject_code}
                            >
                                Add to My Load
                            </Button>
                        </div>
                    </div>
                )}

                {assignedLoading ? (
                    <LoadingState density="compact" label="Loading your assignments" />
                ) : (assignedSubjects.length === 0 && assignedClasses.length === 0) ? (
                    !addSubjectOpen && (
                        <EmptyState
                            icon="assignment_ind"
                            title="No Subjects Assigned Yet"
                            description="An administrator hasn't linked you to any subjects yet — or add one yourself with the button above."
                        />
                    )
                ) : (
                    <>
                        {assignedClasses.length > 0 && (
                            <div style={{ marginBottom: '14px' }}>
                                <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--tx-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>
                                    Assigned Classes
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {assignedClasses.map(c => (
                                        <div key={c.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'var(--surface-low)', border: '1px solid var(--border)', borderRadius: '8px', padding: '5px 10px', fontSize: '12px', fontWeight: 700 }}>
                                            <span className="material-icons-round" style={{ fontSize: '14px', color: 'var(--primary)' }}>school</span>
                                            <span>{c.name}</span>
                                            <span style={{ fontSize: '11px', color: 'var(--tx-muted)', fontWeight: 600 }}>({c.branch} · S{c.semester} · {c.section})</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className={styles.assignedGrid}>
                            {assignedSubjects.map((a) => (
                                <div key={a.id} className={styles.assignedCard} style={{ position: 'relative' }}>
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveAssignment?.(a.id)}
                                        disabled={removingAssignmentId === a.id}
                                        aria-label={`Remove ${a.subject_code} from my teaching load`}
                                        title="Remove from my teaching load"
                                        style={{
                                            position: 'absolute', top: '8px', right: '8px',
                                            width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            background: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer',
                                            color: 'var(--tx-dim)', opacity: removingAssignmentId === a.id ? 0.5 : 1
                                        }}
                                    >
                                        <span className="material-icons-round" style={{ fontSize: '16px' }}>close</span>
                                    </button>
                                    <div className={styles.assignedCode}>{a.subject_code}</div>
                                    <div className={styles.assignedName}>{a.subject_catalog?.subject_name || 'Subject name unavailable'}</div>
                                    <div className={styles.assignedMeta}>
                                        {a.branch || '—'} · Sem {a.semester ?? '—'} · Scheme {a.scheme || '—'}{a.subject_catalog?.credits ? ` · ${a.subject_catalog.credits} Cr` : ''}
                                    </div>
                                    {a.class_id && (() => {
                                        const cls = assignedClasses.find(c => c.id === a.class_id);
                                        return (
                                            <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: 'var(--primary)', background: 'var(--primary-bg, rgba(37,99,235,0.08))', borderRadius: '6px', padding: '3px 8px' }}>
                                                <span className="material-icons-round" style={{ fontSize: '13px' }}>school</span>
                                                {cls ? cls.name : 'Specific class'}
                                            </div>
                                        );
                                    })()}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </section>

            {showBacklogModal && (
                <div className={styles.modalOverlay} onClick={closeBacklogModal}>
                    <section ref={backlogDialogRef} className={`${styles.modal} gf-fade-up`} role="dialog" aria-modal="true" aria-labelledby="faculty-backlog-title" aria-describedby="faculty-backlog-description" onClick={(e) => e.stopPropagation()}>
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
        </div>
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
    const [confirmingDeleteStudent, setConfirmingDeleteStudent] = useState(false);
    const [assignedSubjects, setAssignedSubjects] = useState([]);
    const [assignedClasses, setAssignedClasses] = useState([]);
    const [assignedLoading, setAssignedLoading] = useState(true);
    const [availablePortals, setAvailablePortals] = useState([]);
    const [selectedPortalUrl, setSelectedPortalUrl] = useState('ALL');
    const [customPortalUrl, setCustomPortalUrl] = useState('');
    // Self-service "add my own subject" — same faculty_subject_assignments
    // table and endpoint the admin panel writes to, just scoped to self.
    const [addSubjectOpen, setAddSubjectOpen] = useState(false);
    const [addSubjectForm, setAddSubjectForm] = useState({ branch: 'CS', semester: '', scheme: '2022', subject_code: '', class_id: '' });
    const [subjectOptions, setSubjectOptions] = useState([]);
    const [subjectOptionsLoading, setSubjectOptionsLoading] = useState(false);
    const [addSubjectSaving, setAddSubjectSaving] = useState(false);
    const [addSubjectError, setAddSubjectError] = useState('');
    const [removingAssignmentId, setRemovingAssignmentId] = useState(null);
    // The scrape job currently being watched: { id, usn, startedAt } or null.
    const [scrapeJob, setScrapeJob] = useState(null);
    const backlogDialogRef = useRef(null);
    const backlogTriggerRef = useRef(null);

    const stopScraping = (silent = false) => {
        setScrapeJob(null);
        setScraping(false);
        setScrapeProgress('');
        if (!silent) setMessage('Scraping scan halted.');
    };

    // Live scrape progress. Polls only while a job is active, stops the moment
    // the job reaches a terminal status.
    const { data: liveJob } = useLive('/api/scrape/status', {
        query: { jobId: scrapeJob?.id },
        interval: LIVE.FAST,
        enabled: Boolean(scrapeJob?.id),
    });

    useEffect(() => {
        if (!scrapeJob?.id || !liveJob) return;

        const { status, error: jobError, isTerminal } = liveJob;
        const usnForJob = scrapeJob.usn;

        if (!isTerminal) {
            setScrapeProgress(
                status === 'running'
                    ? `Scanning VTU portals for ${usnForJob}...`
                    : `Job ${scrapeJob.id.substring(0, 6)} queued for ${usnForJob}...`
            );

            // Surface rows as the scraper writes them, rather than only at the end.
            lookupStudent(usnForJob, true);

            // Safety net: stop watching after 15 minutes.
            if (Date.now() - scrapeJob.startedAt > 15 * 60 * 1000) {
                stopScraping(true);
                setMessage('Scan timed out. Some records might still be processing.');
                lookupStudent(usnForJob);
            }
            return;
        }

        stopScraping(true);
        if (status === 'finished') {
            setMessage('All portals scanned successfully!');
        } else if (status === 'no_result') {
            setMessage('Scan complete. No new results found.');
        } else if (status === 'missing') {
            setMessage('Scan job completed or removed.');
        } else {
            setMessage(jobError || 'Scrape failed.');
        }
        lookupStudent(usnForJob);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [liveJob, scrapeJob?.id]);

    const closeBacklogModal = () => {
        setShowBacklogModal(false);
        window.requestAnimationFrame(() => backlogTriggerRef.current?.focus());
    };

    useEffect(() => {
        const session = localStorage.getItem('faculty_session');
        if (session) {
            setFaculty(JSON.parse(session));
        }
    }, []);

    // Load active VTU examination & revaluation portals for targeted quick-scrape
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const facId = faculty?.id;
                const endpoint = facId ? `/api/vtu-urls?faculty_id=${facId}&scheme=2022` : '/api/vtu-urls?scheme=2022';
                const res = await fetch(endpoint);
                const json = await res.json();
                if (!cancelled && json.success && Array.isArray(json.urls)) {
                    const active = json.urls.filter(u => u.is_active);
                    setAvailablePortals(active);
                }
            } catch (err) {
                console.error('Failed to load active portals for selector:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [faculty?.id]);
    // What this faculty member is actually assigned to teach — sourced from
    // the real faculty_subject_assignments table via the server session,
    // never guessed from which classes/students they happen to have browsed.
    // Rows can come from either an admin (Admin -> Faculty Assignments) or
    // the faculty member themself (Add Subject below) — same table, same
    // endpoint, so nothing ever needs reconciling between the two.
    const [assignmentSyncMsg, setAssignmentSyncMsg] = useState('');

    const loadAssignments = useCallback(async (isManual = false) => {
        setAssignedLoading(true);
        const prevSubjectsCount = assignedSubjects.length;
        const prevClassesCount = assignedClasses.length;
        try {
            if (isManual) clearApiCache();
            const data = await apiRequest(`/api/faculty/dashboard?_t=${Date.now()}`);
            const newSubjects = data?.assignedSubjects || [];
            const newClasses = data?.assignedClasses || [];
            setAssignedSubjects(newSubjects);
            setAssignedClasses(newClasses);

            if (isManual) {
                const diffSubj = newSubjects.length - prevSubjectsCount;
                const diffCls = newClasses.length - prevClassesCount;
                if (diffSubj > 0 || diffCls > 0) {
                    const parts = [];
                    if (diffSubj > 0) parts.push(`+${diffSubj} subject(s)`);
                    if (diffCls > 0) parts.push(`+${diffCls} class(es)`);
                    setAssignmentSyncMsg(`✓ New assignments detected: ${parts.join(', ')} synced dynamically!`);
                } else {
                    setAssignmentSyncMsg(`✓ Teaching load verified: All ${newSubjects.length} subject assignments are current.`);
                }
                setTimeout(() => setAssignmentSyncMsg(''), 4500);
            }
        } catch (err) {
            console.error('Failed to load assigned subjects:', err);
            setAssignedSubjects([]);
            setAssignedClasses([]);
        } finally {
            setAssignedLoading(false);
        }
    }, [assignedSubjects.length, assignedClasses.length]);

    useEffect(() => {
        loadAssignments();
    }, [loadAssignments]);

    // Populate the subject picker for whichever branch/semester/scheme is
    // currently selected in the "Add Subject" form.
    useEffect(() => {
        if (!addSubjectOpen) {
            setSubjectOptions([]);
            return;
        }
        let cancelled = false;
        (async () => {
            setSubjectOptionsLoading(true);
            try {
                const branch = addSubjectForm?.branch || 'CS';
                const scheme = addSubjectForm?.scheme || '2022';
                let url = `/api/subjects?branch=${encodeURIComponent(branch)}&scheme=${encodeURIComponent(scheme)}`;
                if (addSubjectForm?.semester) {
                    url += `&semester=${encodeURIComponent(addSubjectForm.semester)}`;
                }
                const res = await fetch(url, { credentials: 'include' });
                const json = await res.json();
                if (!cancelled) setSubjectOptions(json?.subjects || []);
            } catch (err) {
                console.error('Failed to load subject catalog:', err);
                if (!cancelled) setSubjectOptions([]);
            } finally {
                if (!cancelled) setSubjectOptionsLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [addSubjectOpen, addSubjectForm.branch, addSubjectForm.semester, addSubjectForm.scheme]);

    const handleAddSubject = async () => {
        if (!addSubjectForm.subject_code) return;
        const selectedSub = subjectOptions.find(s => s.code === addSubjectForm.subject_code);
        const resolvedSemester = addSubjectForm.semester || (selectedSub?.semester ? String(selectedSub.semester) : '1');

        setAddSubjectSaving(true);
        setAddSubjectError('');
        try {
            await createFacultyAssignment({
                faculty_id: faculty?.id || undefined,
                subject_code: addSubjectForm.subject_code,
                branch: addSubjectForm.branch || selectedSub?.branch || 'CS',
                semester: parseInt(resolvedSemester, 10),
                scheme: addSubjectForm.scheme || selectedSub?.scheme || '2022',
                class_id: addSubjectForm.class_id || undefined,
            });

            // Activity log for faculty_activity & 5W1H audit
            recordFacultyAction(faculty, 'ASSIGN_SUBJECT', null, {
                details: `Added subject ${addSubjectForm.subject_code} to teaching load (${addSubjectForm.branch || 'CS'} · Sem ${resolvedSemester})`,
                context_module: 'Faculty Portal > Teaching Load > Subject Mapping',
                metadata: {
                    subject_code: addSubjectForm.subject_code,
                    branch: addSubjectForm.branch || 'CS',
                    semester: resolvedSemester,
                    scheme: addSubjectForm.scheme || '2022',
                    class_id: addSubjectForm.class_id || null,
                }
            });

            // Notify admin panel or other tabs
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('faculty_assignments_updated'));
                localStorage.setItem('faculty_assignments_last_sync', String(Date.now()));
            }

            setAddSubjectForm(prev => ({ ...prev, subject_code: '', class_id: '' }));
            setAddSubjectOpen(false);
            await loadAssignments();
        } catch (err) {
            setAddSubjectError(err?.message || 'Failed to add this subject to your teaching load.');
        } finally {
            setAddSubjectSaving(false);
        }
    };

    const handleRemoveAssignment = async (id) => {
        setRemovingAssignmentId(id);
        const targetAssignment = assignedSubjects.find(a => a.id === id);
        try {
            await deleteFacultyAssignment(id);

            // Activity log for faculty_activity & 5W1H audit
            recordFacultyAction(faculty, 'UNASSIGN_SUBJECT', null, {
                details: `Removed subject ${targetAssignment?.subject_code || id} from teaching load`,
                context_module: 'Faculty Portal > Teaching Load > Subject Mapping',
                metadata: {
                    assignment_id: id,
                    subject_code: targetAssignment?.subject_code,
                }
            });

            // Notify admin panel or other tabs
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('faculty_assignments_updated'));
                localStorage.setItem('faculty_assignments_last_sync', String(Date.now()));
            }

            await loadAssignments();
        } catch (err) {
            console.error('Failed to remove assignment:', err);
        } finally {
            setRemovingAssignmentId(null);
        }
    };
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
    }, [showBacklogModal]);

    const lookupStudent = async (targetUsn, silent = false) => {
        if (!targetUsn || targetUsn.length < 5) {
            if (!silent) setMessage('Please enter a valid USN.');
            return;
        }

        // If it's a new USN search, clear previous student data immediately
        const cleanUSN = targetUsn.toUpperCase().trim();
        // Clear previous student data to ensure fresh calculation on every lookup
        setStudent(null);
        setMarks({});
        setSgpas({});
        setSemStats({});
        setCgpa(0);

        if (!silent) setLoading(true);
        setMessage('');

        try {
            const resData = await apiRequest('/api/faculty/dashboard', { query: { search_usn: cleanUSN, _t: Date.now() } });
            const profile = resData?.profile || { usn: cleanUSN, name: cleanUSN };

            // Use the server-pre-computed academic record — no client-side Supabase call needed.
            // (Previously this called calculateAcademicRecord() here in the browser, which
            // tried to fetch subject_catalog via the anon key and crashed under RLS.)
            const marksBySemester = resData?.marksBySemester || {};
            const semSGPAs = resData?.semSGPAs || {};
            const semStatsData = resData?.semStats || {};
            const cgpaValue = resData?.cgpa || 0;

            setStudent(profile);
            setMarks(marksBySemester);
            setSgpas(semSGPAs);
            setSemStats(semStatsData);
            setCgpa(cgpaValue);

            // Audit Log
            await recordFacultyAction(faculty, 'VIEW_RECORD', cleanUSN);

            if (!silent) {
                const subjectCount = resData?.totalSubjects ?? Object.values(marksBySemester).flat().length;
                setMessage(`Found ${profile.name || cleanUSN} - ${subjectCount} subjects processed.`);
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
        const admissionYear = parseInt(cleanUSN.substring(3, 5), 10) || 22;
        const targetScheme = student?.scheme || (admissionYear >= 25 ? '2025' : '2022');

        // Resolve single-portal target URL if selected
        let finalTargetUrl = null;
        if (selectedPortalUrl === 'CUSTOM') {
            const trimmedCustom = customPortalUrl.trim();
            if (!trimmedCustom || !trimmedCustom.toLowerCase().includes('vtu.ac.in')) {
                setMessage('Please enter a valid results.vtu.ac.in URL for custom portal scan.');
                return;
            }
            finalTargetUrl = trimmedCustom;
        } else if (selectedPortalUrl !== 'ALL') {
            finalTargetUrl = selectedPortalUrl;
        }

        // Stop any existing polling before starting a new one
        stopScraping(true);

        setScraping(true);
        const portalLabel = finalTargetUrl
            ? (availablePortals.find(p => p.url === finalTargetUrl)?.exam_name || 'Targeted Portal')
            : `${targetScheme} Scheme`;

        setScrapeProgress(
            finalTargetUrl
                ? `Initializing targeted scan for ${cleanUSN} via ${portalLabel}...`
                : `Initializing ${targetScheme} Scheme deep scan for ${cleanUSN}...`
        );
        setMessage('');

        try {
            const res = await fetch('/api/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    usn: cleanUSN,
                    role: 'faculty',
                    force: true,
                    faculty_id: faculty?.id,
                    scheme: targetScheme,
                    target_url: finalTargetUrl
                }),
            });
            const json = await res.json();

            if (json.status === 'cached' && !forceDeep && !finalTargetUrl) {
                setMessage('Results already present in database (Cache Hit).');
                setScraping(false);
                setScrapeProgress('');
                await lookupStudent(cleanUSN);
                return;
            }

            if (json.jobId || json.status === 'queued') {
                const jobId = json.jobId;
                const activeScheme = json.scheme || targetScheme;
                const queueMsg = finalTargetUrl
                    ? `Job ${jobId?.substring(0, 6)} queued. Scanning ${portalLabel} for ${cleanUSN} (estimated 3–5s)...`
                    : `Job ${jobId?.substring(0, 6)} queued. Scanning ${activeScheme} Scheme portals for ${cleanUSN}...`;
                setScrapeProgress(queueMsg);

                // Hand the job to the live subscription below. It polls
                // /api/scrape/status every LIVE.FAST ms and reacts to the
                // terminal status, so there is no interval to manage here.
                setScrapeJob({ id: jobId, usn: cleanUSN, startedAt: Date.now() });
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



    const requestDeleteStudent = () => {
        if (!student) return;
        setConfirmingDeleteStudent(true);
    };

    const deleteStudent = async () => {
        if (!student) return;
        setConfirmingDeleteStudent(false);
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
            await generateResultPDF({
                studentName: student.name || student.usn,
                usn: student.usn,
                branch: student.branch || '',
                scheme: student.scheme || '2022',
                semesterMarks: marks,
                cgpa,
            });
        } catch (err) { setMessage('PDF Error: ' + err.message); console.error(err); } finally { setPdfLoading(false); }
    };

    const totalSubjects = Object.values(marks).flat().length;
    // Active Backlogs: use canonical isFailedSubject() — same source of truth as per-semester calcSGPA
    // This ensures the header count always matches the sum of per-semester backlog counts.
    const backlogs = Object.values(marks).flat().filter(m => isFailedSubject(m));
    const failCount = backlogs.length;
    const sortedSemesters = Object.entries(marks).sort(([a], [b]) => Number(b) - Number(a));


    return (
        <>
        <FacultyDashboardView
            backlogs={backlogs}
            backlogDialogRef={backlogDialogRef}
            backlogTriggerRef={backlogTriggerRef}
            cgpa={cgpa}
            closeBacklogModal={closeBacklogModal}
            deleteStudent={requestDeleteStudent}
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
            setMessage={setMessage}
            setShowBacklogModal={() => setShowBacklogModal(true)}
            setUsn={setUsn}
            sgpas={sgpas}
            showBacklogModal={showBacklogModal}
            sortedSemesters={sortedSemesters}
            stopScraping={stopScraping}
            student={student}
            totalSubjects={totalSubjects}
            usn={usn}
            assignedSubjects={assignedSubjects}
            assignedLoading={assignedLoading}
            assignedClasses={assignedClasses}
            availablePortals={availablePortals}
            selectedPortalUrl={selectedPortalUrl}
            setSelectedPortalUrl={setSelectedPortalUrl}
            customPortalUrl={customPortalUrl}
            setCustomPortalUrl={setCustomPortalUrl}
            addSubjectOpen={addSubjectOpen}
            setAddSubjectOpen={setAddSubjectOpen}
            addSubjectForm={addSubjectForm}
            setAddSubjectForm={setAddSubjectForm}
            subjectOptions={subjectOptions}
            subjectOptionsLoading={subjectOptionsLoading}
            addSubjectSaving={addSubjectSaving}
            addSubjectError={addSubjectError}
            handleAddSubject={handleAddSubject}
            handleRemoveAssignment={handleRemoveAssignment}
            removingAssignmentId={removingAssignmentId}
            loadAssignments={loadAssignments}
            assignmentSyncMsg={assignmentSyncMsg}
        />
        <ConfirmDialog
            open={confirmingDeleteStudent}
            title="Delete this student?"
            description={`This will permanently delete ALL data for ${student?.name || student?.usn}. This cannot be undone.`}
            busy={loading}
            onCancel={() => setConfirmingDeleteStudent(false)}
            onConfirm={deleteStudent}
        />
        </>
    );
}
export default function FacultyDashboard() {
    return (
        <AuthGuard role="faculty">
            <FacultyDashboardContent />
        </AuthGuard>
    );
}
